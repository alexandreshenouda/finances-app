/**
 * Connecteur Trade Republic — API NON OFFICIELLE (rétro-ingénierie du web-login
 * et du flux WebSocket de app.traderepublic.com). Aucune API publique n'existe.
 *
 * Contraintes :
 *  - Fonctionne uniquement dans l'app native (Android) : le navigateur bloque les
 *    requêtes (CORS) et la session repose sur des cookies gérés par le système.
 *  - Nécessite une validation 2FA (code reçu dans l'app TR ou par SMS) à chaque
 *    connexion — pas de synchronisation silencieuse possible.
 *  - Peut cesser de fonctionner si Trade Republic modifie son protocole, ou être
 *    bloquée par leur pare-feu applicatif (AWS WAF). À utiliser à vos risques.
 *
 * Le token de session n'est jamais manipulé côté JS : après le login, les cookies
 * sont posés par le système et automatiquement rattachés à la connexion WebSocket
 * (partage du cookie jar natif sur Android).
 */
import type { ExternalAccount, ExternalHolding } from './types';

const HOST = 'https://api.traderepublic.com';
const WS_URL = 'wss://api.traderepublic.com';
const CONNECT_MESSAGE = {
  locale: 'fr',
  platformId: 'webtrading',
  platformVersion: 'chrome - 94.0.4606',
  clientId: 'app.traderepublic.com',
  clientVersion: '5582',
};

export interface TrLoginHandle {
  processId: string;
  countdown: number;
}

/** Étape 1 : démarre le login, déclenche l'envoi du code 2FA. */
export async function trInitiateLogin(phoneNumber: string, pin: string): Promise<TrLoginHandle> {
  const res = await fetch(`${HOST}/api/v1/auth/web/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: phoneNumber.trim(), pin: pin.trim() }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Trade Republic login HTTP ${res.status} : ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  if (!json?.processId) throw new Error("Trade Republic n'a pas renvoyé de processId");
  return { processId: json.processId, countdown: json.countdownInSeconds ?? 0 };
}

/** Renvoie un nouveau code 2FA pour un login en cours. */
export async function trResendCode(processId: string): Promise<void> {
  await fetch(`${HOST}/api/v1/auth/web/login/${processId}/resend`, { method: 'POST' });
}

/** Étape 2 : valide le code 2FA. La session (cookies) est alors établie. */
export async function trCompleteLogin(processId: string, code: string): Promise<void> {
  const res = await fetch(`${HOST}/api/v1/auth/web/login/${processId}/${code.trim()}`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error(`Code 2FA refusé (HTTP ${res.status})`);
  }
}

/** Message WebSocket entrant : "<id> <code> <payload>". */
interface WsResponse {
  code: string; // A, D, C, E
  payload: string;
}

/**
 * Client WebSocket minimal : une souscription = on attend le premier message
 * complet « A » puis on se désabonne. Suffisant pour un instantané du portefeuille
 * (les deltas « D » temps réel ne nous intéressent pas ici).
 */
class TrSocket {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private ready: Promise<void>;

  constructor() {
    this.ws = new WebSocket(WS_URL);
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Trade Republic : connexion WebSocket expirée')), 15000);
      this.ws.onopen = () => this.ws.send(`connect 31 ${JSON.stringify(CONNECT_MESSAGE)}`);
      this.ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Trade Republic : erreur WebSocket (session invalide ou WAF ?)'));
      };
      this.ws.onmessage = (ev) => {
        const data = String(ev.data);
        if (data === 'connected') {
          clearTimeout(timer);
          resolve();
          return;
        }
        this.dispatch(data);
      };
    });
  }

  private dispatch(data: string) {
    // Format : "<id> <code> <json>"
    const first = data.indexOf(' ');
    const second = data.indexOf(' ', first + 1);
    if (first < 0) return;
    const id = parseInt(data.slice(0, first), 10);
    const code = second < 0 ? data.slice(first + 1) : data.slice(first + 1, second);
    const payload = second < 0 ? '' : data.slice(second + 1);
    const waiter = this.pending.get(id);
    if (!waiter) return;
    if (code === 'A') {
      this.pending.delete(id);
      this.ws.send(`unsub ${id}`);
      try {
        waiter.resolve(payload ? JSON.parse(payload) : null);
      } catch {
        waiter.resolve(null);
      }
    } else if (code === 'E') {
      this.pending.delete(id);
      waiter.reject(new Error(`Trade Republic : ${payload.slice(0, 160)}`));
    }
    // 'D' (delta) et 'C' (closed) ignorés : on ne garde que le premier snapshot.
  }

  /** Souscrit et résout avec le premier snapshot complet reçu. */
  async once<T = any>(payload: object, timeoutMs = 12000): Promise<T> {
    await this.ready;
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Trade Republic : réponse WebSocket expirée'));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.ws.send(`sub ${id} ${JSON.stringify(payload)}`);
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

interface TrPortfolioResult {
  cashEur: number;
  holdings: ExternalHolding[];
  warnings: string[];
}

/**
 * Récupère l'instantané du portefeuille via WebSocket : liquidités + positions,
 * chaque position nommée (instrument) et valorisée (ticker) en EUR.
 */
export async function trFetchPortfolio(): Promise<TrPortfolioResult> {
  const socket = new TrSocket();
  const warnings: string[] = [];
  try {
    // Liquidités : [{ currencyId, amount }]
    let cashEur = 0;
    try {
      const cash = await socket.once<{ currencyId: string; amount: number }[]>({ type: 'cash' });
      for (const c of cash ?? []) {
        if (c.currencyId === 'EUR') cashEur += c.amount;
        else warnings.push(`Solde ${c.currencyId} ignoré (conversion non gérée)`);
      }
    } catch (e: any) {
      warnings.push(`Liquidités indisponibles : ${e?.message ?? e}`);
    }

    // Positions : { positions: [{ instrumentId, netSize }] }
    const portfolio = await socket.once<{ positions?: { instrumentId: string; netSize: string | number }[] }>({
      type: 'compactPortfolio',
    });
    const positions = portfolio?.positions ?? [];

    const holdings: ExternalHolding[] = [];
    for (const pos of positions) {
      const isin = pos.instrumentId;
      const quantity = typeof pos.netSize === 'string' ? parseFloat(pos.netSize) : pos.netSize;
      if (!isin || !Number.isFinite(quantity) || quantity <= 0) continue;

      let name = isin;
      try {
        const instrument = await socket.once<{ shortName?: string; name?: string }>({
          type: 'instrument',
          id: isin,
        });
        name = instrument?.shortName || instrument?.name || isin;
      } catch {
        warnings.push(`Nom introuvable pour ${isin}`);
      }

      let price = 0;
      try {
        // Ticker : { bid:{price}, ask:{price}, last:{price} } ; place de cotation par défaut LSX.
        const ticker = await socket.once<{ last?: { price: string | number } }>({
          type: 'ticker',
          id: `${isin}.LSX`,
        });
        const raw = ticker?.last?.price;
        price = typeof raw === 'string' ? parseFloat(raw) : (raw ?? 0);
      } catch {
        warnings.push(`Cours introuvable pour ${name}`);
      }

      holdings.push({ name, symbol: isin, quantity, unitPriceEur: Number.isFinite(price) ? price : 0 });
    }

    return { cashEur, holdings, warnings };
  } finally {
    socket.close();
  }
}

/** Construit le compte externe Trade Republic à partir de l'instantané. */
export function trBuildAccount(result: TrPortfolioResult): ExternalAccount {
  return {
    externalId: 'traderepublic-main',
    name: 'Trade Republic',
    type: 'cto',
    institution: 'Trade Republic',
    cashBalanceEur: result.cashEur || undefined,
    holdings: result.holdings,
  };
}
