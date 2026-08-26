/**
 * Connecteur Trade Republic — API NON OFFICIELLE (rétro-ingénierie du web-login
 * v2 à approbation push, et du flux WebSocket de app.traderepublic.com). Aucune
 * API publique n'existe.
 *
 * Contraintes :
 *  - Fonctionne uniquement dans l'app native (Android) : le navigateur bloque les
 *    requêtes (CORS) et la session repose sur des cookies gérés par le système.
 *  - Nécessite une approbation dans l'app Trade Republic (login v2 « push ») à
 *    chaque connexion — pas de synchronisation silencieuse possible.
 *  - Peut cesser de fonctionner si Trade Republic modifie son protocole, ou être
 *    bloquée par leur pare-feu applicatif (AWS WAF, qui peut exiger un jeton
 *    résolu par un défi JS qu'un simple fetch RN ne peut pas produire). À
 *    utiliser à vos risques.
 *
 * Le token de session n'est jamais manipulé côté JS : après approbation, les
 * cookies sont posés par le système et automatiquement rattachés à la connexion
 * WebSocket (partage du cookie jar natif sur Android).
 */
import { encode as base64Encode } from 'js-base64';
import { logDebug, logDebugError } from '../debugLog';
import { getSecret, setSecret } from '../secure';
import type { ExternalAccount, ExternalHolding } from './types';

const TAG = 'traderepublic';

/** Masque pin/téléphone avant de journaliser un corps de requête sortant. */
function redactBody(body: Record<string, unknown>): string {
  const copy: Record<string, unknown> = { ...body };
  if (typeof copy.pin === 'string') copy.pin = '••••';
  if (typeof copy.phoneNumber === 'string' && copy.phoneNumber.length > 4) {
    const p = copy.phoneNumber;
    copy.phoneNumber = `${p.slice(0, 4)}••••••${p.slice(-2)}`;
  }
  return JSON.stringify(copy);
}

const HOST = 'https://api.traderepublic.com';
const WS_URL = 'wss://api.traderepublic.com';
const APP_ORIGIN = 'https://app.traderepublic.com';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36';
const CLIENT_VERSION = '5582';
const CONNECT_MESSAGE = {
  locale: 'fr',
  platformId: 'webtrading',
  platformVersion: 'chrome - 94.0.4606',
  clientId: 'app.traderepublic.com',
  clientVersion: CLIENT_VERSION,
};

const DEVICE_ID_KEY = 'tr.deviceId';

/** Identifiant d'appareil stable (généré une fois, persisté chiffré). */
async function getDeviceId(): Promise<string> {
  const existing = await getSecret(DEVICE_ID_KEY);
  if (existing) return existing;
  const hex = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  const id = hex() + hex() + hex() + hex() + hex() + hex() + hex() + hex();
  await setSecret(DEVICE_ID_KEY, id);
  return id;
}

/** En-têtes attendus par le login web v2 (empreinte navigateur imitée). */
async function authHeaders(): Promise<Record<string, string>> {
  const deviceInfo = {
    stableDeviceId: await getDeviceId(),
    model: 'Desktop',
    browser: 'Chrome',
    browserVersion: '94.0.4606.81',
    os: 'Mac OS',
    osVersion: '10.15.7',
    timezone: 'Europe/Paris',
    timezoneOffset: -60,
    screen: '1920x1080',
    preferredLanguages: ['fr-FR', 'fr'],
    numberOfCores: 8,
    deviceMemory: 8,
  };
  return {
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
    Origin: APP_ORIGIN,
    Referer: `${APP_ORIGIN}/`,
    'x-tr-platform': 'web',
    'x-tr-app-version': CLIENT_VERSION,
    'x-tr-device-info': base64Encode(JSON.stringify(deviceInfo)),
  };
}

export interface TrLoginHandle {
  processId: string;
}

/** Étape 1 : démarre le login v2, déclenche la demande d'approbation push. */
export async function trInitiateLogin(phoneNumber: string, pin: string): Promise<TrLoginHandle> {
  const body = { phoneNumber: phoneNumber.trim(), pin: pin.trim() };
  logDebug(TAG, 'POST /api/v2/auth/web/login', redactBody(body));
  const res = await fetch(`${HOST}/api/v2/auth/web/login`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logDebugError(TAG, `POST /api/v2/auth/web/login → HTTP ${res.status}`, text);
    throw new Error(`Trade Republic login HTTP ${res.status} : ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  logDebug(TAG, `POST /api/v2/auth/web/login → HTTP ${res.status}`, JSON.stringify(json));
  if (!json?.processId) throw new Error("Trade Republic n'a pas renvoyé de processId");
  return { processId: json.processId };
}

/** Redemande l'approbation push pour un login en cours. */
export async function trResendApproval(processId: string): Promise<void> {
  logDebug(TAG, `POST /api/v2/auth/web/login/${processId}/resend`);
  const res = await fetch(`${HOST}/api/v2/auth/web/login/${processId}/resend`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  logDebug(TAG, `POST .../resend → HTTP ${res.status}`);
}

const APPROVED_STATES = new Set(['APPROVED', 'COMPLETED', 'SUCCESS', 'OK', 'DONE']);
const REJECTED_STATES = new Set(['REJECTED', 'DECLINED', 'FAILED', 'EXPIRED']);

/**
 * Étape 2 : attend l'approbation dans l'app Trade Republic (interroge le
 * statut du process toutes les `intervalMs`). La session (cookies) est
 * établie dès que l'approbation est détectée.
 */
export async function trAwaitApproval(
  processId: string,
  opts: { intervalMs?: number; timeoutMs?: number; shouldAbort?: () => boolean } = {}
): Promise<void> {
  const intervalMs = opts.intervalMs ?? 2000;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const headers = await authHeaders();
  const deadline = Date.now() + timeoutMs;
  let lastLogged: string | null = null;

  logDebug(TAG, `GET .../processes/${processId} : début du polling`);
  while (Date.now() < deadline) {
    if (opts.shouldAbort?.()) {
      logDebug(TAG, 'Polling approbation : annulé');
      throw new Error('Connexion annulée');
    }

    const res = await fetch(`${HOST}/api/v2/auth/web/login/processes/${processId}`, { headers });
    if (res.status === 200) {
      const json = await res.json().catch(() => null);
      const state = String(json?.state ?? json?.status ?? '').toUpperCase();
      const marker = `200:${state}`;
      if (marker !== lastLogged) {
        logDebug(TAG, `GET .../processes/${processId} → HTTP 200, state=${state || '?'}`);
        lastLogged = marker;
      }
      if (APPROVED_STATES.has(state)) {
        logDebug(TAG, 'Polling approbation : approuvé');
        return;
      }
      if (REJECTED_STATES.has(state)) {
        logDebugError(TAG, `Polling approbation : refusé/expiré (state=${state})`);
        throw new Error("Connexion refusée ou expirée dans l'app Trade Republic");
      }
    } else if ([401, 403, 404, 410].includes(res.status)) {
      logDebugError(TAG, `GET .../processes/${processId} → HTTP ${res.status}`);
      throw new Error(`Session de connexion invalide ou expirée (HTTP ${res.status})`);
    } else if (`http:${res.status}` !== lastLogged) {
      logDebug(TAG, `GET .../processes/${processId} → HTTP ${res.status}`);
      lastLogged = `http:${res.status}`;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  logDebugError(TAG, 'Polling approbation : délai dépassé');
  throw new Error("Délai dépassé : approuvez la connexion dans l'app Trade Republic");
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
      this.ws.onopen = () => {
        logDebug(TAG, `WS connect ${JSON.stringify(CONNECT_MESSAGE)}`);
        this.ws.send(`connect 31 ${JSON.stringify(CONNECT_MESSAGE)}`);
      };
      this.ws.onerror = () => {
        clearTimeout(timer);
        logDebugError(TAG, 'WS : erreur (session invalide ou WAF ?)');
        reject(new Error('Trade Republic : erreur WebSocket (session invalide ou WAF ?)'));
      };
      this.ws.onmessage = (ev) => {
        const data = String(ev.data);
        if (data === 'connected') {
          clearTimeout(timer);
          logDebug(TAG, 'WS connecté');
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

/** Instantané d'une enveloppe (compte-titres ordinaire ou PEA). */
interface TrAccountSnapshot {
  /** `DEFAULT` (compte-titres) ou `TAX_WRAPPER` (PEA). */
  productType: string;
  secAccNo: string;
  cashEur: number;
  /** Positions cotées (actions, ETF, obligations…). */
  holdings: ExternalHolding[];
  /** Positions « private markets », remontées dans un compte séparé. */
  privateMarkets: ExternalHolding[];
}

interface TrPortfolioResult {
  accounts: TrAccountSnapshot[];
  warnings: string[];
}

/**
 * Recherche récursive d'une clé dans une réponse JSON. L'API non officielle
 * déplace régulièrement les champs d'un niveau (ex. `securitiesAccountNumber`
 * remonté dans un sous-objet `account`) : chercher en profondeur évite de
 * repartir sur un repli dégradé au moindre changement de forme.
 */
function deepFind(node: unknown, key: string, depth = 0): any {
  if (depth > 6 || node === null || typeof node !== 'object') return undefined;
  if (!Array.isArray(node)) {
    const v = (node as Record<string, unknown>)[key];
    if (v !== undefined && v !== null) return v;
  }
  for (const child of Object.values(node as Record<string, unknown>)) {
    const found = deepFind(child, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Infos de compte (numéro de compte-titres). Point d'entrée le plus proche
 * d'une liste de comptes exposée par l'API non officielle : la réponse brute
 * est journalisée en entier pour investiguer une éventuelle distinction
 * CTO/PEA/PE côté Trade Republic.
 */
export async function trFetchAccountInfo(): Promise<{ raw: any; secAccNo?: string }> {
  const res = await fetch(`${HOST}/api/v2/auth/account`, { headers: await authHeaders() });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    logDebugError(TAG, `GET /api/v2/auth/account → HTTP ${res.status}`, text);
    throw new Error(`Trade Republic : infos compte HTTP ${res.status}`);
  }
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* réponse non-JSON : json reste null, remonté tel quel dans le log */
  }
  logDebug(TAG, `GET /api/v2/auth/account → HTTP ${res.status}`, text);
  const secAccNo = deepFind(json, 'securitiesAccountNumber');
  logDebug(TAG, `securitiesAccountNumber = ${secAccNo ?? '(absent)'}`);
  return { raw: json, secAccNo: typeof secAccNo === 'string' ? secAccNo : undefined };
}

type RawPosition = Record<string, unknown>;

/** Noms de champ rencontrés pour l'ISIN et la quantité selon la version de l'API. */
const ISIN_KEYS = ['instrumentId', 'isin', 'instrument'] as const;
const QUANTITY_KEYS = ['netSize', 'size', 'virtualSize', 'netQuantity', 'quantity'] as const;

/** Un objet est une position dès qu'il porte un identifiant d'instrument. */
function isPosition(node: unknown): node is RawPosition {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  return ISIN_KEYS.some((k) => typeof (node as RawPosition)[k] === 'string');
}

/**
 * Collecte récursive des positions : `compactPortfolioByType` les groupe par
 * catégorie, `compactPortfolio` les renvoie à plat, et Trade Republic a déjà
 * changé cette imbrication. Descendre l'arbre couvre les deux formes et celles
 * à venir, plutôt que de coder en dur un chemin qui casse silencieusement.
 */
function collectPositions(node: unknown, depth = 0): RawPosition[] {
  if (depth > 6 || !node || typeof node !== 'object') return [];
  if (isPosition(node)) return [node];
  return Object.values(node as Record<string, unknown>).flatMap((c) => collectPositions(c, depth + 1));
}

/** Premier champ quantité exploitable, sinon `undefined` (position à signaler). */
function positionQuantity(pos: RawPosition): number | undefined {
  for (const k of QUANTITY_KEYS) {
    const raw = pos[k];
    const n = typeof raw === 'string' ? parseFloat(raw) : typeof raw === 'number' ? raw : NaN;
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Prix de revient unitaire (PRU). Trade Republic l'expose en EUR sous
 * `averageBuyIn` : chaîne dans `compactPortfolioByType`, objet `{ value }` dans
 * la V2 — les deux formes sont acceptées.
 */
function positionBuyPrice(pos: RawPosition): number | undefined {
  const raw = pos.averageBuyIn;
  const scalar =
    raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>).value : raw;
  const n = typeof scalar === 'string' ? parseFloat(scalar) : typeof scalar === 'number' ? scalar : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Premier champ ISIN exploitable. */
function positionIsin(pos: RawPosition): string | undefined {
  for (const k of ISIN_KEYS) {
    const raw = pos[k];
    if (typeof raw === 'string' && raw) return raw;
  }
  return undefined;
}

/**
 * Cours d'un instrument en EUR. LSX est la place par défaut de Trade Republic et
 * couvre actions et ETF, mais pas tout : les fonds privés (`privateFund`) ne
 * cotent que sur leur place dédiée. On ne paie la souscription `instrument`
 * (pour connaître les places réelles) que si LSX n'a rien donné.
 */
async function fetchPrice(socket: TrSocket, isin: string): Promise<number | undefined> {
  const read = async (exchange: string): Promise<number | undefined> => {
    const ticker = await socket
      .once<{ last?: { price: string | number }; bid?: { price: string | number } }>(
        { type: 'ticker', id: `${isin}.${exchange}` },
        6000
      )
      .catch(() => null);
    const raw = ticker?.last?.price ?? ticker?.bid?.price;
    const n = typeof raw === 'string' ? parseFloat(raw) : raw;
    return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
  };

  const viaLsx = await read('LSX');
  if (viaLsx !== undefined) return viaLsx;

  const instrument = await socket
    .once<{ exchangeIds?: string[] }>({ type: 'instrument', id: isin })
    .catch(() => null);
  for (const exchange of instrument?.exchangeIds ?? []) {
    if (exchange === 'LSX') continue;
    const price = await read(exchange);
    if (price !== undefined) {
      logDebug(TAG, `Cours de ${isin} via ${exchange} (absent de LSX)`);
      return price;
    }
  }
  return undefined;
}

/**
 * Enveloppes déclarées par Trade Republic. `accountPairs` liste tous les comptes
 * du client : le compte-titres ordinaire (`DEFAULT`) et, en France, le PEA
 * (`TAX_WRAPPER`). Chaque enveloppe a son propre numéro de compte-titres et son
 * propre compte espèces, et doit être interrogée séparément — c'est exactement
 * ce que fait le client web officiel.
 */
const PRODUCT_DEFAULT = 'DEFAULT';
const PRODUCT_TAX_WRAPPER = 'TAX_WRAPPER';

interface TrAccountPair {
  securitiesAccountNumber?: string;
  cashAccountNumber?: string;
  productType?: string;
}

/** Liquidités EUR d'un compte espèces donné, à partir de la réponse `cash`. */
function sumEurCash(entries: any, accountNumber: string | undefined, warnings: string[]): number {
  let total = 0;
  for (const c of Array.isArray(entries) ? entries : []) {
    if (accountNumber && c?.accountNumber && c.accountNumber !== accountNumber) continue;
    if (c?.currencyId === 'EUR') total += Number(c.amount) || 0;
    else if (c?.currencyId) warnings.push(`Solde ${c.currencyId} ignoré (conversion non gérée)`);
  }
  return total;
}

/** Positions d'une enveloppe, étiquetées par catégorie d'actif. */
async function fetchPositions(
  socket: TrSocket,
  secAccNo: string,
  warnings: string[]
): Promise<{ pos: RawPosition; categoryType: string }[]> {
  // V1 est la version qui répond aujourd'hui ; V2 est celle vers laquelle le client
  // web migre. On tente les deux pour survivre au basculement, dans un sens comme
  // dans l'autre. `compactPortfolio`/`portfolio` ont été supprimés côté TR.
  let last: any = null;
  for (const type of ['compactPortfolioByType', 'compactPortfolioByTypeV2']) {
    let res: any;
    try {
      res = await socket.once<any>({ type, secAccNo });
    } catch (e: any) {
      logDebugError(TAG, `WS ${type} (${secAccNo}) → ${e?.message ?? e}`);
      continue;
    }
    logDebug(TAG, `WS ${type} (${secAccNo})`, JSON.stringify(res));
    last = res;

    const categories = Array.isArray(res?.categories) ? res.categories : null;
    // Les catégories crypto sont écartées (instruments non valorisables ici).
    const isCrypto = (c: any) => String(c?.categoryType ?? '').toLowerCase().includes('crypto');
    let positions: { pos: RawPosition; categoryType: string }[];
    if (categories) {
      const cryptoCount = categories.filter(isCrypto).flatMap((c: any) => collectPositions(c)).length;
      if (cryptoCount > 0) {
        warnings.push(`${cryptoCount} position(s) crypto ignorée(s) (non gérées par ce connecteur)`);
      }
      positions = categories
        .filter((c: any) => !isCrypto(c))
        .flatMap((c: any) =>
          collectPositions(c).map((pos) => ({ pos, categoryType: String(c?.categoryType ?? '') }))
        );
    } else {
      positions = collectPositions(res).map((pos) => ({ pos, categoryType: '' }));
    }

    if (positions.length > 0) return positions;
    logDebugError(TAG, `WS ${type} (${secAccNo}) : aucune position reconnue, essai suivant`);
  }

  logDebugError(TAG, `Aucune position extraite pour ${secAccNo}`, JSON.stringify(last));
  return [];
}

/**
 * Récupère l'instantané complet du portefeuille via WebSocket : une passe par
 * enveloppe (compte-titres, PEA), liquidités incluses, chaque position nommée et
 * valorisée en EUR.
 */
export async function trFetchPortfolio(): Promise<TrPortfolioResult> {
  const warnings: string[] = [];
  const socket = new TrSocket();
  try {
    // 1. Enveloppes déclarées. Repli sur l'unique numéro exposé en HTTP si le
    //    message n'est pas disponible — on perd alors le PEA, mais pas le reste.
    let pairs: TrAccountPair[] = [];
    try {
      const res = await socket.once<{ accounts?: TrAccountPair[] }>({ type: 'accountPairs' });
      logDebug(TAG, 'WS accountPairs', JSON.stringify(res));
      pairs = res?.accounts ?? [];
    } catch (e: any) {
      logDebugError(TAG, `WS accountPairs → ${e?.message ?? e}`);
    }
    if (pairs.length === 0) {
      warnings.push('Liste des comptes indisponible : seul le compte-titres principal sera importé');
      try {
        const { secAccNo } = await trFetchAccountInfo();
        if (secAccNo) pairs = [{ securitiesAccountNumber: secAccNo, productType: PRODUCT_DEFAULT }];
      } catch (e: any) {
        warnings.push(`Infos compte indisponibles : ${e?.message ?? e}`);
      }
    }

    // 2. Liquidités, en une seule souscription : la réponse porte l'accountNumber,
    //    ce qui permet de ventiler par enveloppe.
    let cashEntries: any = [];
    try {
      cashEntries = await socket.once<any>({ type: 'cash' });
      logDebug(TAG, 'WS cash', JSON.stringify(cashEntries));
    } catch (e: any) {
      warnings.push(`Liquidités indisponibles : ${e?.message ?? e}`);
    }

    // 3. Une passe par enveloppe.
    const accounts: TrAccountSnapshot[] = [];
    for (const pair of pairs) {
      const secAccNo = pair.securitiesAccountNumber;
      if (!secAccNo) continue;
      const productType = String(pair.productType ?? PRODUCT_DEFAULT);

      // `cash` global ne renvoie parfois que le compte principal : on redemande
      // explicitement le compte espèces de l'enveloppe s'il n'y figure pas.
      let cashEur = sumEurCash(cashEntries, pair.cashAccountNumber, warnings);
      const listed = (Array.isArray(cashEntries) ? cashEntries : []).some(
        (c: any) => c?.accountNumber === pair.cashAccountNumber
      );
      if (!listed && pair.cashAccountNumber) {
        try {
          const own = await socket.once<any>({
            type: 'cash',
            accountNumber: pair.cashAccountNumber,
          });
          logDebug(TAG, `WS cash (${pair.cashAccountNumber})`, JSON.stringify(own));
          cashEur = sumEurCash(own, undefined, warnings);
        } catch (e: any) {
          logDebugError(TAG, `WS cash (${pair.cashAccountNumber}) → ${e?.message ?? e}`);
        }
      }

      const positions = await fetchPositions(socket, secAccNo, warnings);
      const holdings: ExternalHolding[] = [];
      const privateMarkets: ExternalHolding[] = [];

      for (const { pos, categoryType } of positions) {
        const isin = positionIsin(pos);
        const quantity = positionQuantity(pos);
        if (!isin || quantity === undefined || quantity <= 0) {
          // Champ renommé côté Trade Republic : on journalise le brut pour pouvoir corriger.
          warnings.push(`Position ignorée (${isin ?? 'ISIN inconnu'}, quantité illisible)`);
          logDebugError(TAG, 'Position illisible', JSON.stringify(pos));
          continue;
        }

        // La payload porte déjà le libellé : on évite une souscription `instrument`
        // par position, et on ne s'y rabat que si le champ manque.
        let name = typeof pos.name === 'string' && pos.name ? pos.name : isin;
        try {
          if (name === isin) {
            const instrument = await socket.once<{ shortName?: string; name?: string }>({
              type: 'instrument',
              id: isin,
            });
            name = instrument?.shortName || instrument?.name || isin;
          }
        } catch {
          warnings.push(`Nom introuvable pour ${isin}`);
        }

        const price = await fetchPrice(socket, isin);
        if (price === undefined) {
          // Valoriser à 0 fausserait le patrimoine en silence : on le signale.
          warnings.push(`Cours introuvable pour ${name} — ligne valorisée à 0 €`);
          logDebugError(TAG, `Aucun cours pour ${isin} (aucune place de cotation exploitable)`);
        }

        // Le Private Equity est illiquide et se valorise à part : il part dans son
        // propre compte plutôt que d'être noyé dans le CTO. `instrumentType` sert
        // de discriminant de secours si la catégorie venait à être renommée.
        const isPrivateMarket =
          categoryType.toLowerCase().includes('private') ||
          String(pos.instrumentType ?? '').toLowerCase().includes('private');
        (isPrivateMarket ? privateMarkets : holdings).push({
          name,
          symbol: isin,
          isin,
          quantity,
          unitPriceEur: price ?? 0,
          buyPriceEur: positionBuyPrice(pos),
        });
      }

      logDebug(
        TAG,
        `${productType} (${secAccNo}) : ${holdings.length} titre(s), ${privateMarkets.length} private equity, cash=${cashEur}€`
      );
      accounts.push({ productType, secAccNo, cashEur, holdings, privateMarkets });
    }

    if (accounts.length === 0) {
      warnings.push('Aucun compte Trade Republic récupéré (voir le journal de debug)');
    }
    return { accounts, warnings };
  } finally {
    socket.close();
  }
}

export function trBuildAccounts(result: TrPortfolioResult): ExternalAccount[] {
  const accounts: ExternalAccount[] = [];

  for (const snap of result.accounts) {
    const isPea = snap.productType === PRODUCT_TAX_WRAPPER;

    // Le PEA garde ses liquidités avec lui : son compte espèces est cloisonné et
    // ne peut pas être confondu avec celui du compte-titres ordinaire.
    if (isPea) {
      accounts.push({
        externalId: 'traderepublic-pea',
        name: 'Trade Republic — PEA',
        type: 'pea',
        institution: 'Trade Republic',
        cashBalanceEur: snap.cashEur || undefined,
        holdings: snap.holdings,
      });
    } else {
      accounts.push({
        externalId: 'traderepublic-main',
        name: 'Trade Republic',
        type: 'cto',
        institution: 'Trade Republic',
        cashBalanceEur: snap.cashEur || undefined,
        holdings: snap.holdings,
      });
    }

    // Compte créé seulement s'il y a des positions : sinon on laisserait traîner
    // un compte vide à 0 € chez les utilisateurs sans private markets.
    if (snap.privateMarkets.length > 0) {
      accounts.push({
        externalId: isPea ? 'traderepublic-pea-private-markets' : 'traderepublic-private-markets',
        name: isPea ? 'Trade Republic — Private Equity (PEA)' : 'Trade Republic — Private Equity',
        type: 'private_equity',
        institution: 'Trade Republic',
        holdings: snap.privateMarkets,
      });
    }
  }

  return accounts;
}
