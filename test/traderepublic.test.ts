/** Tests du connecteur Trade Republic (`src/lib/connectors/traderepublic.ts`, API non officielle) :
 *  login v2 à approbation push (HTTP, `fetch` simulé) et instantané du portefeuille via le
 *  protocole WebSocket (`sub <id> <json>` → `<id> A <json>`), joué par un faux serveur. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  trAwaitApproval,
  parseTimelineItem,
  transferCategoryIds,
  trBuildAccounts,
  trFetchAccountInfo,
  trFetchPortfolio,
  trInitiateLogin,
  trResendApproval,
} from '@/lib/connectors/traderepublic';
import { addDays, todayKey } from '@/lib/format';
import { useDebugLogStore } from '@/lib/debugLog';
import { json, mockFetch, text, type RouteReply } from './http';
import { __secureMemory } from './stubs/expo-secure-store';

// ─── Faux serveur WebSocket ────────────────────────────────────────────────

/** Réponse du serveur à une souscription : snapshot `A`, erreur `E`, messages bruts, ou silence. */
type Reply = { A: unknown } | { E: string } | { raw: (id: number) => string[] } | null;
type Handler = (sub: any) => Reply;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static handler: Handler = () => null;
  /** `open` (défaut), `error` (rejet à l'ouverture) ou `silent` (jamais « connected »). */
  static mode: 'open' | 'error' | 'silent' = 'open';
  static throwOnClose = false;

  sent: string[] = [];
  /** Ids des souscriptions auxquelles le serveur a répondu par un snapshot `A`. */
  answered: number[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => (FakeWebSocket.mode === 'error' ? this.onerror?.() : this.onopen?.()));
  }

  private emit(data: string) {
    queueMicrotask(() => this.onmessage?.({ data }));
  }

  send(data: string) {
    this.sent.push(data);
    if (data.startsWith('connect ')) {
      if (FakeWebSocket.mode === 'open') this.emit('connected');
      return;
    }
    const m = /^sub (\d+) (.*)$/.exec(data);
    if (!m) return;
    const id = Number(m[1]);
    const reply = FakeWebSocket.handler(JSON.parse(m[2]));
    if (!reply) return;
    if ('A' in reply) {
      this.answered.push(id);
      this.emit(`${id} A ${JSON.stringify(reply.A)}`);
    } else if ('E' in reply) this.emit(`${id} E ${reply.E}`);
    else reply.raw(id).forEach((msg) => this.emit(msg));
  }

  close() {
    this.closed = true;
    if (FakeWebSocket.throwOnClose) throw new Error('déjà fermé');
  }

  /** Souscriptions reçues, désérialisées. */
  get subs(): any[] {
    return this.sent.filter((s) => s.startsWith('sub ')).map((s) => JSON.parse(s.replace(/^sub \d+ /, '')));
  }
}

const ws = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

// ─── Données de portefeuille ───────────────────────────────────────────────

const WORLD = 'IE00B4L5Y983';
const APPLE = 'US0378331005';
const PE_FUND = 'XF000PRIV001';
const TOTAL = 'FR0000120271';
const NO_PRICE = 'FR0000000NOP';

/** CTO (SEC1) + PEA (SEC2), positions variées : catégories V1 sur le CTO, liste à plat V2 sur le PEA. */
const portfolioHandler: Handler = (s) => {
  switch (s.type) {
    case 'accountPairs':
      return {
        A: {
          accounts: [
            { securitiesAccountNumber: 'SEC1', cashAccountNumber: 'CASH1', productType: 'DEFAULT' },
            { securitiesAccountNumber: 'SEC2', cashAccountNumber: 'CASH2', productType: 'TAX_WRAPPER' },
            { cashAccountNumber: 'ORPHAN' }, // sans compte-titres : ignoré
          ],
        },
      };
    case 'cash':
      if (s.accountNumber === 'CASH2') return { A: [{ accountNumber: 'CASH2', currencyId: 'EUR', amount: 150 }] };
      return {
        A: [
          { accountNumber: 'CASH1', currencyId: 'EUR', amount: '1000.5' },
          { accountNumber: 'CASH1', currencyId: 'USD', amount: 5 },
        ],
      };
    case 'compactPortfolioByType':
      if (s.secAccNo === 'SEC1') {
        return {
          A: {
            categories: [
              {
                categoryType: 'stocksAndETFs',
                positions: [
                  { isin: WORLD, netSize: '10', name: 'Core MSCI World', averageBuyIn: '80' },
                  { isin: APPLE, netSize: 2, averageBuyIn: { value: '150' } }, // sans nom
                  { isin: 'BADQTY000001', name: 'Illisible' }, // sans quantité
                ],
              },
              { categoryType: 'privateMarkets', positions: [{ isin: PE_FUND, netSize: '3', name: 'PE fund', averageBuyIn: '0' }] },
              { categoryType: 'cryptos', positions: [{ isin: 'XF000BTC0001', netSize: '1' }] },
            ],
          },
        };
      }
      return { A: { categories: [] } }; // SEC2 : rien en V1…
    case 'compactPortfolioByTypeV2':
      return {
        A: {
          positions: [
            { instrumentId: TOTAL, size: 4, name: 'TotalEnergies', instrumentType: 'stock' },
            { isin: NO_PRICE, virtualSize: '1', name: 'Sans cours', instrumentType: 'privateFund' },
          ],
        },
      }; // …tout en V2, à plat
    case 'instrument':
      if (s.id === APPLE) return { A: { shortName: 'Apple' } };
      if (s.id === PE_FUND) return { A: { exchangeIds: ['LSX', 'PRIV'] } };
      if (s.id === NO_PRICE) return { A: { exchangeIds: ['LSX', 'NONE'] } };
      return { E: 'instrument inconnu' };
    case 'ticker': {
      const prices: Record<string, unknown> = {
        [`${WORLD}.LSX`]: { last: { price: '100.5' } },
        [`${APPLE}.LSX`]: { last: { price: 200 } },
        [`${PE_FUND}.PRIV`]: { last: { price: '50' } },
        [`${TOTAL}.LSX`]: { bid: { price: '30' } },
        [`${NO_PRICE}.NONE`]: { last: { price: 'n/a' } },
      };
      return s.id in prices ? { A: prices[s.id] } : { E: 'pas de cotation' };
    }
  }
  return null;
};

/** Timeline par défaut : une catégorie de versements reconnue, aucun mouvement. */
const TIMELINE: [string | RegExp, RouteReply][] = [
  ['/timeline/transaction-categories', json([{ id: 'DEPOSITS', label: 'Versements' }])],
  ['/timeline/transactions', json({ items: [] })],
];

beforeEach(() => {
  FakeWebSocket.instances = [];
  FakeWebSocket.handler = () => null;
  FakeWebSocket.mode = 'open';
  FakeWebSocket.throwOnClose = false;
  vi.stubGlobal('WebSocket', FakeWebSocket);
  mockFetch(TIMELINE);
  __secureMemory.clear();
  useDebugLogStore.setState({ enabled: true, entries: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  useDebugLogStore.setState({ enabled: false, entries: [] });
});

const logs = () => useDebugLogStore.getState().entries;
const deviceInfo = (headers: unknown) =>
  JSON.parse(Buffer.from((headers as Record<string, string>)['x-tr-device-info'], 'base64').toString('utf8'));

// ─── Login (HTTP) ──────────────────────────────────────────────────────────

describe('trInitiateLogin', () => {
  it('démarre le login v2 avec une empreinte navigateur et renvoie le processId', async () => {
    const calls = mockFetch([['/api/v2/auth/web/login', json({ processId: 'proc-1', countdownInSeconds: 30 })]]);
    expect(await trInitiateLogin(' +33612345678 ', ' 1234 ')).toEqual({ processId: 'proc-1' });
    const { url, init } = calls[0];
    expect(url).toBe('https://api.traderepublic.com/api/v2/auth/web/login');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ phoneNumber: '+33612345678', pin: '1234' });
    const headers = init?.headers as Record<string, string>;
    expect(headers).toMatchObject({ Origin: 'https://app.traderepublic.com', 'x-tr-platform': 'web' });
    expect(deviceInfo(headers)).toMatchObject({ model: 'Desktop', browser: 'Chrome', timezone: 'Europe/Paris' });
  });

  it('ne journalise jamais le PIN ni le numéro complet', async () => {
    mockFetch([['/login', json({ processId: 'p' })]]);
    await trInitiateLogin('+33612345678', '9876');
    const out = logs().find((e) => e.message === 'POST /api/v2/auth/web/login')!;
    expect(JSON.parse(out.detail!)).toEqual({ phoneNumber: '+336••••••78', pin: '••••' });
    expect(JSON.stringify(logs())).not.toContain('9876');
    expect(JSON.stringify(logs())).not.toContain('612345678');
  });

  it('laisse tel quel un numéro trop court pour être masqué', async () => {
    mockFetch([['/login', json({ processId: 'p' })]]);
    await trInitiateLogin('123', '0000');
    expect(JSON.parse(logs().find((e) => e.message === 'POST /api/v2/auth/web/login')!.detail!).phoneNumber).toBe('123');
  });

  it('génère un identifiant d’appareil une seule fois, puis le réutilise', async () => {
    const calls = mockFetch([['/login', json({ processId: 'p' })]]);
    await trInitiateLogin('+33600000000', '1');
    await trInitiateLogin('+33600000000', '1');
    const [a, b] = calls.map((c) => deviceInfo(c.init?.headers).stableDeviceId);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toBe(a);
    expect(__secureMemory.get('patrimoine.secret.tr.deviceId')).toBe(a);
  });

  it('remonte une erreur HTTP (corps tronqué) ou l’absence de processId', async () => {
    mockFetch([['/login', text(`{"errors":[{"errorCode":"TOO_MANY_REQUESTS"}]}${'x'.repeat(300)}`, 429)]]);
    const err = (await trInitiateLogin('+33600000000', '1').catch((e: Error) => e)) as Error;
    expect(err.message).toMatch(/^Trade Republic login HTTP 429 : \{"errors"/);
    expect(err.message.length).toBe('Trade Republic login HTTP 429 : '.length + 200);
    expect(logs()[0].level).toBe('error');

    mockFetch([['/login', json({})]]);
    await expect(trInitiateLogin('+33600000000', '1')).rejects.toThrow("Trade Republic n'a pas renvoyé de processId");
  });
});

describe('trResendApproval', () => {
  it('redemande la notification push du process en cours', async () => {
    const calls = mockFetch([['/resend', new Response(null, { status: 204 })]]);
    await trResendApproval('proc-1');
    expect(calls[0].url).toBe('https://api.traderepublic.com/api/v2/auth/web/login/proc-1/resend');
    expect(calls[0].init?.method).toBe('POST');
  });
});

describe('trAwaitApproval', () => {
  /** Rejoue une suite de réponses HTTP (la dernière se répète). */
  function poll(...replies: (() => Response)[]) {
    let i = 0;
    return mockFetch([['/processes/proc-1', () => replies[Math.min(i++, replies.length - 1)]()]]);
  }

  it('attend l’approbation en ignorant les états intermédiaires et les erreurs transitoires', async () => {
    const calls = poll(
      () => json({ state: 'PENDING' }),
      () => json({ state: 'PENDING' }),
      () => text('', 502),
      () => text('pas du json'),
      () => json({ status: 'approved' })
    );
    await expect(trAwaitApproval('proc-1', { intervalMs: 1 })).resolves.toBeUndefined();
    expect(calls).toHaveLength(5);
    // États identiques consécutifs journalisés une seule fois.
    expect(logs().filter((e) => e.message.includes('state=PENDING'))).toHaveLength(1);
  });

  it('échoue si la connexion est refusée dans l’app', async () => {
    poll(() => json({ state: 'REJECTED' }));
    await expect(trAwaitApproval('proc-1', { intervalMs: 1 })).rejects.toThrow(
      "Connexion refusée ou expirée dans l'app Trade Republic"
    );
  });

  it('échoue sur une session de login invalide (401/403/404/410)', async () => {
    poll(() => text('', 410));
    await expect(trAwaitApproval('proc-1', { intervalMs: 1 })).rejects.toThrow(
      'Session de connexion invalide ou expirée (HTTP 410)'
    );
  });

  it('s’arrête dès que l’utilisateur annule', async () => {
    const calls = poll(() => json({ state: 'PENDING' }));
    let n = 0;
    await expect(trAwaitApproval('proc-1', { intervalMs: 1, shouldAbort: () => ++n > 2 })).rejects.toThrow('Connexion annulée');
    expect(calls).toHaveLength(2);
  });

  it('abandonne au-delà du délai imparti', async () => {
    poll(() => json({ state: 'PENDING' }));
    await expect(trAwaitApproval('proc-1', { intervalMs: 5, timeoutMs: 20 })).rejects.toThrow(
      "Délai dépassé : approuvez la connexion dans l'app Trade Republic"
    );
  });

  it('attend 2 s entre deux interrogations et 3 min au total par défaut', async () => {
    vi.useFakeTimers();
    const calls = poll(() => json({ state: 'WAITING' }));
    const pending = trAwaitApproval('proc-1');
    const done = expect(pending).rejects.toThrow('Délai dépassé');
    await vi.advanceTimersByTimeAsync(180_000);
    await done;
    expect(calls).toHaveLength(90);
  });
});

describe('trFetchAccountInfo', () => {
  it('trouve le numéro de compte-titres même imbriqué', async () => {
    mockFetch([['/api/v2/auth/account', json({ customer: { account: { securitiesAccountNumber: 'SEC9' } }, items: [1, 2] })]]);
    expect(await trFetchAccountInfo()).toEqual({
      raw: { customer: { account: { securitiesAccountNumber: 'SEC9' } }, items: [1, 2] },
      secAccNo: 'SEC9',
    });
  });

  it('cherche aussi dans les tableaux et ignore une valeur non textuelle', async () => {
    mockFetch([['/api/v2/auth/account', json({ list: [{ securitiesAccountNumber: 42 }] })]]);
    expect((await trFetchAccountInfo()).secAccNo).toBeUndefined();
    mockFetch([['/api/v2/auth/account', json({ list: [null, { securitiesAccountNumber: 'SEC7' }] })]]);
    expect((await trFetchAccountInfo()).secAccNo).toBe('SEC7');
  });

  it('ne descend pas indéfiniment dans une réponse trop profonde', async () => {
    let deep: any = { securitiesAccountNumber: 'TROP-LOIN' };
    for (let i = 0; i < 8; i++) deep = { next: deep };
    mockFetch([['/api/v2/auth/account', json(deep)]]);
    expect((await trFetchAccountInfo()).secAccNo).toBeUndefined();
  });

  it('tolère une réponse non JSON', async () => {
    mockFetch([['/api/v2/auth/account', text('<html>WAF</html>')]]);
    expect(await trFetchAccountInfo()).toEqual({ raw: null, secAccNo: undefined });
  });

  it('remonte une erreur HTTP', async () => {
    mockFetch([['/api/v2/auth/account', text('forbidden', 403)]]);
    await expect(trFetchAccountInfo()).rejects.toThrow('Trade Republic : infos compte HTTP 403');
  });
});

// ─── Portefeuille (WebSocket) ──────────────────────────────────────────────

describe('trFetchPortfolio', () => {
  it('importe chaque enveloppe (CTO, PEA) avec liquidités, positions nommées et valorisées', async () => {
    FakeWebSocket.handler = portfolioHandler;
    const result = await trFetchPortfolio();

    expect(result.warnings).toEqual([
      'Solde USD ignoré (conversion non gérée)',
      '1 position crypto ignorée (non gérée par ce connecteur)',
      'Position ignorée (BADQTY000001, quantité illisible)',
      'Cours introuvable pour Sans cours — ligne valorisée à 0 €',
    ]);
    expect(result.accounts).toEqual([
      {
        productType: 'DEFAULT',
        secAccNo: 'SEC1',
        cashEur: 1000.5,
        holdings: [
          { name: 'Core MSCI World', symbol: WORLD, isin: WORLD, quantity: 10, unitPriceEur: 100.5, buyPriceEur: 80 },
          { name: 'Apple', symbol: APPLE, isin: APPLE, quantity: 2, unitPriceEur: 200, buyPriceEur: 150 },
        ],
        privateMarkets: [{ name: 'PE fund', symbol: PE_FUND, isin: PE_FUND, quantity: 3, unitPriceEur: 50, buyPriceEur: undefined }],
        cashFlows: [],
      },
      {
        productType: 'TAX_WRAPPER',
        secAccNo: 'SEC2',
        cashEur: 150,
        holdings: [{ name: 'TotalEnergies', symbol: TOTAL, isin: TOTAL, quantity: 4, unitPriceEur: 30, buyPriceEur: undefined }],
        privateMarkets: [{ name: 'Sans cours', symbol: NO_PRICE, isin: NO_PRICE, quantity: 1, unitPriceEur: 0, buyPriceEur: undefined }],
        cashFlows: [],
      },
    ]);

    const socket = ws();
    expect(socket.url).toBe('wss://api.traderepublic.com');
    expect(socket.sent[0]).toMatch(/^connect 31 \{.*"clientId":"app.traderepublic.com"/);
    // Désabonnement après chaque snapshot reçu (pas après une erreur), socket fermée à la fin.
    expect(socket.sent.filter((s) => s.startsWith('unsub '))).toEqual(socket.answered.map((id) => `unsub ${id}`));
    expect(socket.closed).toBe(true);
    // Cash du PEA redemandé explicitement ; aucun `instrument` pour une position déjà nommée et cotée sur LSX.
    expect(socket.subs).toContainEqual({ type: 'cash', accountNumber: 'CASH2' });
    expect(socket.subs.filter((s) => s.type === 'instrument').map((s) => s.id)).toEqual([APPLE, PE_FUND, NO_PRICE]);
    expect(logs().some((e) => e.message === `Cours de ${PE_FUND} via PRIV (absent de LSX)`)).toBe(true);
  });

  it('se rabat sur le compte-titres exposé en HTTP si `accountPairs` échoue, sans perdre le reste', async () => {
    FakeWebSocket.handler = (s) => {
      if (s.type === 'accountPairs') return { E: 'Unknown topic type' };
      if (s.type === 'cash') return { E: 'boom' };
      if (s.type === 'compactPortfolioByType') return { E: 'v1 indisponible' };
      if (s.type === 'compactPortfolioByTypeV2') return { A: { categories: [{ categoryType: 'stocksAndETFs', positions: [] }] } };
      return null;
    };
    mockFetch([...TIMELINE, ['/api/v2/auth/account', json({ securitiesAccountNumber: 'SEC9' })]]);
    const r = await trFetchPortfolio();
    expect(r.warnings).toEqual([
      'Liste des comptes indisponible : seul le compte-titres principal sera importé',
      'Liquidités indisponibles : Trade Republic : boom',
    ]);
    expect(r.accounts).toEqual([{ productType: 'DEFAULT', secAccNo: 'SEC9', cashEur: 0, holdings: [], privateMarkets: [], cashFlows: [] }]);
    expect(logs().some((e) => e.level === 'error' && e.message === 'Aucune position extraite pour SEC9')).toBe(true);
  });

  it('signale qu’aucun compte n’a pu être récupéré', async () => {
    FakeWebSocket.handler = (s) => (s.type === 'accountPairs' ? { A: {} } : { A: [] });
    mockFetch([...TIMELINE, ['/api/v2/auth/account', text('', 500)]]);
    const r = await trFetchPortfolio();
    expect(r.accounts).toEqual([]);
    expect(r.warnings).toEqual([
      'Liste des comptes indisponible : seul le compte-titres principal sera importé',
      'Infos compte indisponibles : Trade Republic : infos compte HTTP 500',
      'Aucun compte Trade Republic récupéré (voir le journal de debug)',
    ]);
  });

  it('ne garde aucune enveloppe si le compte HTTP n’a pas de numéro', async () => {
    FakeWebSocket.handler = (s) => (s.type === 'accountPairs' ? { A: null } : { A: [] });
    mockFetch([...TIMELINE, ['/api/v2/auth/account', json({ other: true })]]);
    expect((await trFetchPortfolio()).accounts).toEqual([]);
  });

  it('garde l’ISIN comme nom si l’instrument est introuvable', async () => {
    FakeWebSocket.handler = (s) => {
      if (s.type === 'accountPairs') return { A: { accounts: [{ securitiesAccountNumber: 'S', cashAccountNumber: 'C' }] } };
      if (s.type === 'cash') return { A: [{ accountNumber: 'C', currencyId: 'EUR', amount: 'x' }, { amount: 1 }] };
      if (s.type === 'compactPortfolioByType') return { A: { categories: [{ positions: [{ isin: APPLE, quantity: 1 }] }] } };
      if (s.type === 'instrument') return { E: 'introuvable' };
      if (s.type === 'ticker') return { A: { last: { price: 10 } } };
      return null;
    };
    const r = await trFetchPortfolio();
    expect(r.warnings).toEqual([`Nom introuvable pour ${APPLE}`]);
    expect(r.accounts[0]).toMatchObject({ productType: 'DEFAULT', cashEur: 0, holdings: [{ name: APPLE, unitPriceEur: 10 }] });
  });

  it('ignore les messages parasites, les deltas et les réponses illisibles du flux', async () => {
    FakeWebSocket.handler = (s) => {
      if (s.type === 'accountPairs')
        return {
          raw: (id) => ['bonjour', `999 A {}`, `${id} D {"delta":1}`, `${id} C`, `${id} A {"accounts":[{"securitiesAccountNumber":"S"}]}`],
        };
      if (s.type === 'cash') return { raw: (id) => [`${id} A`] }; // snapshot vide
      if (s.type === 'compactPortfolioByType') return { raw: (id) => [`${id} A {pas du json`] };
      if (s.type === 'compactPortfolioByTypeV2') return { A: { positions: [{ isin: APPLE, netSize: '1', name: 'Apple' }] } };
      if (s.type === 'ticker') return { A: { last: { price: '1' } } };
      return null;
    };
    FakeWebSocket.throwOnClose = true;
    const r = await trFetchPortfolio();
    expect(r.warnings).toEqual([]);
    expect(r.accounts).toEqual([
      {
        productType: 'DEFAULT',
        secAccNo: 'S',
        cashEur: 0,
        holdings: [{ name: 'Apple', symbol: APPLE, isin: APPLE, quantity: 1, unitPriceEur: 1, buyPriceEur: undefined }],
        privateMarkets: [],
        cashFlows: [],
      },
    ]);
  });

  it('dégrade proprement si la WebSocket est refusée (session invalide, WAF)', async () => {
    FakeWebSocket.mode = 'error';
    mockFetch([...TIMELINE, ['/api/v2/auth/account', json({ securitiesAccountNumber: 'SEC1' })]]);
    const r = await trFetchPortfolio();
    expect(r.warnings).toContain(
      'Liquidités indisponibles : Trade Republic : erreur WebSocket (session invalide ou WAF ?)'
    );
    expect(r.accounts).toEqual([{ productType: 'DEFAULT', secAccNo: 'SEC1', cashEur: 0, holdings: [], privateMarkets: [], cashFlows: [] }]);
  });

  it('abandonne la connexion WebSocket après 15 s sans « connected »', async () => {
    vi.useFakeTimers();
    FakeWebSocket.mode = 'silent';
    mockFetch([...TIMELINE, ['/api/v2/auth/account', text('', 401)]]);
    const pending = trFetchPortfolio();
    await vi.advanceTimersByTimeAsync(15_000);
    const r = await pending;
    expect(r.warnings).toContain('Liquidités indisponibles : Trade Republic : connexion WebSocket expirée');
  });

  it('n’attend pas plus de 12 s une souscription sans réponse', async () => {
    vi.useFakeTimers();
    FakeWebSocket.handler = (s) => (s.type === 'cash' ? null : { A: { accounts: [] } });
    mockFetch([...TIMELINE, ['/api/v2/auth/account', text('', 401)]]);
    const pending = trFetchPortfolio();
    await vi.advanceTimersByTimeAsync(12_000);
    expect((await pending).warnings).toContain('Liquidités indisponibles : Trade Republic : réponse WebSocket expirée');
  });
});

describe('historique des opérations et plafond du PEA', () => {
  const day = (offset: number) => addDays(todayKey(), offset);
  const tx = (id: string, offset: number, value: number, over: object = {}) => ({
    id,
    title: `Opération ${id}`,
    timestamp: `${day(offset)}T09:30:00.000+0000`,
    amount: { value, currency: 'EUR' },
    status: 'EXECUTED',
    ...over,
  });
  const dividendOf = (isin: string) => ({ action: { type: 'instrumentDetail', payload: isin } });
  /** Catégories imbriquées, comme un arbre de filtres : seule « Versements » est un mouvement d'argent. */
  const CATEGORIES = {
    categories: [
      { id: 'CASH', label: 'Espèces', children: [{ id: 'PAYMENT_INBOUND', label: 'Versements' }, { id: 'CARD', label: 'Carte' }] },
      { id: 'INCOME', label: 'Revenus' },
      { id: 'TRADING', label: 'Ordres' },
    ],
  };
  const param = (url: string, name: string) => new URL(url).searchParams.get(name);

  it('importe versements, retraits, dividendes et intérêts par enveloppe, en paginant jusqu’à la fenêtre', async () => {
    FakeWebSocket.handler = portfolioHandler;
    const calls = mockFetch([
      ['/timeline/transaction-categories', json(CATEGORIES)],
      [
        '/timeline/transactions',
        (url) => {
          const income = param(url, 'categoryIds') === 'INCOME';
          const cash = param(url, 'cashAccountNumbers[]');
          if (cash !== 'CASH1') return json({ items: income ? [tx('pea-div', -3, 4.2, dividendOf(TOTAL))] : [] });
          if (income) {
            return json({
              items: [
                tx('div-1', -10, 12.5, dividendOf(WORLD)),
                tx('int-1', -20, 3.1), // aucun titre attaché : intérêts
                tx('tax-1', -21, -2, dividendOf(WORLD)), // régularisation négative : ignorée
                tx('usd-1', -22, 9, { amount: { value: 9, currency: 'USD' } }),
              ],
            });
          }
          if (param(url, 'olderThan') === 'page-2') {
            // Deuxième page : on franchit la fenêtre d'historique, la pagination s'arrête là.
            return json({ items: [tx('dep-old', -399, 700), tx('dep-too-old', -500, 9_999)], cursors: { after: 'page-3' } });
          }
          return json({
            items: [tx('dep-1', -5, 1_000), tx('wd-1', -6, -250.5), tx('dep-x', -7, 300, { status: 'CANCELED' })],
            cursors: { after: 'page-2' },
          });
        },
      ],
    ]);

    const result = await trFetchPortfolio();
    const [cto, pea] = result.accounts;
    expect(cto.cashFlows).toEqual([
      { externalId: 'div-1', date: day(-10), kind: 'dividend', amountEur: 12.5, label: 'Opération div-1', isin: WORLD },
      { externalId: 'int-1', date: day(-20), kind: 'interest', amountEur: 3.1, label: 'Opération int-1', isin: undefined },
      { externalId: 'dep-1', date: day(-5), kind: 'deposit', amountEur: 1_000, label: 'Opération dep-1' },
      { externalId: 'wd-1', date: day(-6), kind: 'withdrawal', amountEur: 250.5, label: 'Opération wd-1' },
      { externalId: 'dep-old', date: day(-399), kind: 'deposit', amountEur: 700, label: 'Opération dep-old' },
    ]);
    expect(pea.cashFlows.map((f) => [f.externalId, f.kind, f.isin])).toEqual([['pea-div', 'dividend', TOTAL]]);
    expect(result.warnings.some((w) => w.includes('Historique') || w.includes('versements'))).toBe(false);

    // Requêtes au format du client web : catégories jointes par des virgules, tableaux en `clé[]`.
    const txCalls = calls.filter((c) => c.url.includes('/timeline/transactions'));
    expect(txCalls.map((c) => [param(c.url, 'cashAccountNumbers[]'), param(c.url, 'categoryIds'), param(c.url, 'olderThan')])).toEqual([
      ['CASH1', 'INCOME', null],
      ['CASH1', 'PAYMENT_INBOUND', null],
      ['CASH1', 'PAYMENT_INBOUND', 'page-2'],
      ['CASH2', 'INCOME', null],
      ['CASH2', 'PAYMENT_INBOUND', null],
    ]);
    expect(txCalls[0].url).toContain('pageSize=50&categoryIds=INCOME&cashAccountNumbers%5B%5D=CASH1');
    expect((txCalls[0].init?.headers as Record<string, string>)['x-tr-platform']).toBe('web');
    // Les opérations écartées sont journalisées, pas perdues en silence.
    expect(logs().filter((e) => e.message.startsWith('Opération ignorée')).map((e) => JSON.parse(e.detail!).id)).toEqual(
      expect.arrayContaining(['tax-1', 'usd-1', 'dep-x'])
    );

    // Flux et plafond suivent chaque enveloppe jusqu'aux comptes créés.
    const built = trBuildAccounts(result);
    expect(built.find((a) => a.externalId === 'traderepublic-main')?.cashFlows).toHaveLength(5);
    expect(built.find((a) => a.type === 'private_equity')?.cashFlows).toBeUndefined();
  });

  it('n’importe aucun versement si aucune catégorie n’est reconnue, et le signale', async () => {
    FakeWebSocket.handler = portfolioHandler;
    const calls = mockFetch([
      ['/timeline/transaction-categories', json([{ id: 'INCOME', label: 'Revenus' }, { id: 'TRADING', label: 'Ordres' }])],
      ['/timeline/transactions', json({ items: [tx('div-1', -1, 5, dividendOf(WORLD))] })],
    ]);
    const result = await trFetchPortfolio();
    expect(result.warnings).toContain(
      'Catégories de versements Trade Republic non reconnues : versements non importés (voir le journal de debug)'
    );
    expect(calls.filter((c) => c.url.includes('/timeline/transactions')).every((c) => param(c.url, 'categoryIds') === 'INCOME')).toBe(true);
    expect(result.accounts[0].cashFlows.map((f) => f.kind)).toEqual(['dividend']);
  });

  it('avertit sans échouer quand l’historique est injoignable', async () => {
    FakeWebSocket.handler = portfolioHandler;
    mockFetch([
      ['/timeline/transaction-categories', text('nope', 503)],
      ['/timeline/transactions', text('forbidden', 403)],
    ]);
    const result = await trFetchPortfolio();
    expect(result.accounts.map((a) => a.cashFlows)).toEqual([[], []]);
    expect(result.accounts[0].holdings).toHaveLength(2);
    expect(result.warnings.filter((w) => w.startsWith('Historique des opérations Trade Republic indisponible'))).toEqual([
      'Historique des opérations Trade Republic indisponible (HTTP 503) : versements et dividendes non mis à jour',
      'Historique des opérations Trade Republic indisponible (HTTP 403) : versements et dividendes non mis à jour',
      'Historique des opérations Trade Republic indisponible (HTTP 403) : versements et dividendes non mis à jour',
    ]);
    expect(logs().some((e) => e.level === 'error' && e.message.includes('/timeline/transaction-categories → HTTP 503'))).toBe(true);
  });

});

describe('parseTimelineItem', () => {
  const item = (over: object = {}) => ({
    id: 'tx',
    title: 'Titre',
    timestamp: '2024-05-17T23:30:00.000+0000',
    amount: { value: 10, currency: 'EUR' },
    ...over,
  });

  it('classe un mouvement d’argent par son signe', () => {
    expect(parseTimelineItem(item(), false)).toEqual({ externalId: 'tx', date: '2024-05-17', kind: 'deposit', amountEur: 10, label: 'Titre' });
    expect(parseTimelineItem(item({ amount: { value: '-7.5', currency: 'EUR' }, title: '' }), false)).toEqual({
      externalId: 'tx',
      date: '2024-05-17',
      kind: 'withdrawal',
      amountEur: 7.5,
      label: undefined,
    });
  });

  it('distingue dividende (titre attaché) et intérêts, et valide l’ISIN', () => {
    const action = (payload: unknown, type = 'instrumentDetail') => ({ action: { type, payload } });
    expect(parseTimelineItem(item(action(' FR0000120271 ')), true)).toMatchObject({ kind: 'dividend', isin: 'FR0000120271' });
    expect(parseTimelineItem(item(action('pas-un-isin')), true)).toMatchObject({ kind: 'interest', isin: undefined });
    expect(parseTimelineItem(item(action('FR0000120271', 'timelineDetail')), true)).toMatchObject({ kind: 'interest' });
    expect(parseTimelineItem(item(action(42)), true)).toMatchObject({ kind: 'interest' });
  });

  it('accepte un horodatage en millisecondes', () => {
    const noon = new Date(2024, 4, 17, 12).getTime();
    expect(parseTimelineItem(item({ timestamp: noon }), false)?.date).toBe('2024-05-17');
  });

  it('écarte ce qui est annulé, nul, hors EUR, sans identifiant ou sans date', () => {
    for (const bad of [
      item({ status: 'CANCELED' }),
      item({ amount: { value: 0, currency: 'EUR' } }),
      item({ amount: { value: 'abc', currency: 'EUR' } }),
      item({ amount: { value: 5, currency: 'USD' } }),
      item({ amount: undefined }),
      item({ id: undefined }),
      item({ timestamp: 'hier' }),
      item({ timestamp: Number.NaN }),
      null,
    ]) {
      expect(parseTimelineItem(bad, false)).toBeUndefined();
    }
    expect(parseTimelineItem(item({ amount: { value: -3, currency: 'EUR' } }), true)).toBeUndefined();
  });
});

describe('transferCategoryIds', () => {
  it('reconnaît versements et retraits à leur id ou à leur libellé, à toute profondeur, jamais INCOME', () => {
    expect(
      transferCategoryIds({
        data: [
          { id: 'DEPOSIT', label: 'x' },
          { id: 'A1', title: 'Retraits' },
          { id: 'A2', name: 'Überweisung' },
          { id: 'G', label: 'Groupe', children: [{ id: 'PAY_OUT' }, { id: 'CARD', label: 'Carte' }] },
          { id: 'INCOME', label: 'Versements de dividendes' },
          { id: 42, label: 'Versement' },
          { id: 'DEPOSIT', label: 'doublon' },
        ],
      }).sort()
    ).toEqual(['A1', 'A2', 'DEPOSIT', 'PAY_OUT']);
  });

  it('renvoie une liste vide pour une réponse vide, illisible ou trop profonde', () => {
    expect(transferCategoryIds(null)).toEqual([]);
    expect(transferCategoryIds('texte')).toEqual([]);
    expect(transferCategoryIds([])).toEqual([]);
    let deep: any = { id: 'DEPOSIT' };
    for (let i = 0; i < 8; i++) deep = { child: deep };
    expect(transferCategoryIds(deep)).toEqual([]);
  });
});

describe('trBuildAccounts', () => {
  const h = (name: string) => ({ name, quantity: 1, unitPriceEur: 1 });

  it('crée un compte CTO, un PEA, et un compte Private Equity par enveloppe qui en contient', () => {
    const accounts = trBuildAccounts({
      warnings: [],
      accounts: [
        { productType: 'DEFAULT', secAccNo: '1', cashEur: 10, holdings: [h('a')], privateMarkets: [h('pe')], cashFlows: [] },
        { productType: 'TAX_WRAPPER', secAccNo: '2', cashEur: 0, holdings: [h('b')], privateMarkets: [h('pe2')], cashFlows: [] },
        { productType: 'SOMETHING_NEW', secAccNo: '3', cashEur: 5, holdings: [], privateMarkets: [], cashFlows: [] },
      ],
    });
    expect(accounts.map((a) => [a.externalId, a.type, a.name, a.cashBalanceEur, a.holdings.map((x) => x.name)])).toEqual([
      ['traderepublic-main', 'cto', 'Trade Republic', 10, ['a']],
      ['traderepublic-private-markets', 'private_equity', 'Trade Republic — Private Equity', undefined, ['pe']],
      ['traderepublic-pea', 'pea', 'Trade Republic — PEA', undefined, ['b']],
      ['traderepublic-pea-private-markets', 'private_equity', 'Trade Republic — Private Equity (PEA)', undefined, ['pe2']],
      ['traderepublic-main', 'cto', 'Trade Republic', 5, []],
    ]);
    expect(accounts.every((a) => a.institution === 'Trade Republic')).toBe(true);
  });
});
