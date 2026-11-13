/** Tests du connecteur Trade Republic (`src/lib/connectors/traderepublic.ts`, API non officielle) :
 *  login v2 à approbation push (HTTP, `fetch` simulé) et instantané du portefeuille via le
 *  protocole WebSocket (`sub <id> <json>` → `<id> A <json>`), joué par un faux serveur. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  trAwaitApproval,
  historyCategoryIds,
  parseTimelineItem,
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
    case 'taxWrapperAccountUtilization':
      return { A: { totalAmount: { value: '150000', currency: 'EUR' }, usedAmount: { value: '42000.5', currency: 'EUR' } } };
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

/** Arbre des catégories tel que renvoyé par Trade Republic (extrait). */
const CATEGORIES = {
  categories: [
    { id: 'INVESTING', name: 'Investing', children: [{ id: 'STOCK', name: 'Stocks', children: [] }] },
    { id: 'INCOME', name: 'Income', children: [{ id: 'EARNINGS_V2', name: 'Earnings', children: [] }, { id: 'CASH_IN_V2', name: 'Cash In', children: [] }] },
    { id: 'SPENDING', name: 'Spending', children: [{ id: 'ATM_WITHDRAWAL', name: 'Cash', children: [] }, { id: 'TRANSFERS', name: 'Transfers', children: [] }] },
  ],
};
/** Début de la fenêtre d'historique rapatriée. */
const SINCE = addDays(todayKey(), -400);

/** Timeline par défaut : catégories réelles, aucun mouvement. */
const TIMELINE: [string | RegExp, RouteReply][] = [
  ['/timeline/transaction-categories', json(CATEGORIES)],
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
        cashFlowsSince: SINCE,
      },
      {
        productType: 'TAX_WRAPPER',
        secAccNo: 'SEC2',
        cashEur: 150,
        holdings: [{ name: 'TotalEnergies', symbol: TOTAL, isin: TOTAL, quantity: 4, unitPriceEur: 30, buyPriceEur: undefined }],
        privateMarkets: [{ name: 'Sans cours', symbol: NO_PRICE, isin: NO_PRICE, quantity: 1, unitPriceEur: 0, buyPriceEur: undefined }],
        cashFlows: [],
        cashFlowsSince: SINCE,
        // Plafond du PEA : `taxWrapperAccountUtilization`, demandé pour l'enveloppe TAX_WRAPPER seulement.
        peaDepositsEur: 42000.5,
        peaCeilingEur: 150000,
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
  /** Opération au format réel de la timeline : `action` est toujours `timelineDetail`. */
  const tx = (id: string, offset: number, value: number, eventType: string, over: object = {}) => ({
    id,
    title: `Opération ${id}`,
    timestamp: `${day(offset)}T09:30:00.000+0000`,
    icon: 'logos/contacts-A-Grey/v2',
    amount: { currency: 'EUR', value, fractionDigits: 2 },
    status: 'EXECUTED',
    action: { type: 'timelineDetail', payload: id },
    eventType,
    ...over,
  });
  const logo = (isin: string) => ({ icon: `logos/${isin}/v2`, avatar: { asset: `logos/${isin}/v2`, badge: null } });
  const param = (url: string, name: string) => new URL(url).searchParams.get(name);

  it('classe les opérations par type d’événement, pas par catégorie, en paginant jusqu’à la fenêtre', async () => {
    FakeWebSocket.handler = portfolioHandler;
    const calls = mockFetch([
      ['/timeline/transaction-categories', json(CATEGORIES)],
      [
        '/timeline/transactions',
        (url) => {
          if (param(url, 'cashAccountNumbers[]') !== 'CASH1') {
            return json({ items: [tx('pea-div', -3, 0.73, 'SSP_CORPORATE_ACTION_CASH', logo(TOTAL))], cursors: { after: null } });
          }
          if (param(url, 'olderThan') === 'page-2') {
            // Deuxième page : on franchit la fenêtre d'historique, la pagination s'arrête là.
            return json({
              items: [tx('dep-old', -399, 700, 'BANK_TRANSACTION_INCOMING'), tx('dep-too-old', -500, 9_999, 'BANK_TRANSACTION_INCOMING')],
              cursors: { after: 'page-3' },
            });
          }
          return json({
            items: [
              tx('int-1', -2, 0.51, 'INTEREST_PAYOUT', { title: 'Interest', icon: 'logos/timeline_interest_new/v2' }),
              tx('dep-1', -5, 1_000, 'BANK_TRANSACTION_INCOMING'),
              tx('div-1', -10, 1.22, 'SSP_CORPORATE_ACTION_CASH', logo(APPLE)),
              tx('div-x', -10, 1.16, 'SSP_CORPORATE_ACTION_CASH', { ...logo(APPLE), status: 'CANCELED' }),
              // Produit d'une vente : rangé dans INCOME par Trade Republic, mais ni versement ni revenu.
              tx('sell-1', -12, 2_166.42, 'TRADING_TRADE_EXECUTED', logo(WORLD)),
              tx('wd-1', -20, -2_000, 'BANK_TRANSACTION_OUTGOING'),
              tx('card-1', -21, -12.9, 'CARD_TRANSACTION'),
              tx('card-2', -22, -3, 'CARD_TRANSACTION'),
              tx('usd-1', -23, 9, 'INTEREST_PAYOUT', { amount: { value: 9, currency: 'USD' } }),
            ],
            cursors: { after: 'page-2' },
          });
        },
      ],
    ]);

    const result = await trFetchPortfolio();
    const [cto, pea] = result.accounts;
    expect(cto.cashFlows).toEqual([
      { externalId: 'int-1', date: day(-2), kind: 'interest', amountEur: 0.51, label: 'Interest' },
      { externalId: 'dep-1', date: day(-5), kind: 'deposit', amountEur: 1_000, label: 'Opération dep-1' },
      { externalId: 'div-1', date: day(-10), kind: 'dividend', amountEur: 1.22, label: 'Opération div-1', isin: APPLE },
      { externalId: 'wd-1', date: day(-20), kind: 'withdrawal', amountEur: 2_000, label: 'Opération wd-1' },
      { externalId: 'dep-old', date: day(-399), kind: 'deposit', amountEur: 700, label: 'Opération dep-old' },
    ]);
    expect(cto.cashFlowsSince).toBe(day(-400));
    expect(cto.peaDepositsEur).toBeUndefined();
    expect(pea.cashFlows).toEqual([
      { externalId: 'pea-div', date: day(-3), kind: 'dividend', amountEur: 0.73, label: 'Opération pea-div', isin: TOTAL },
    ]);
    expect(pea).toMatchObject({ peaDepositsEur: 42000.5, peaCeilingEur: 150000 });
    // Un type jamais rencontré est signalé, pas deviné.
    expect(result.warnings).toContain(
      '2 opérations Trade Republic d\'un type inconnu ignorées (CARD_TRANSACTION) — voir le journal de debug'
    );

    // Une seule requête par page, au format du client web : catégories jointes par des virgules, tableaux en `clé[]`.
    const txCalls = calls.filter((c) => c.url.includes('/timeline/transactions'));
    expect(txCalls.map((c) => [param(c.url, 'cashAccountNumbers[]'), param(c.url, 'categoryIds'), param(c.url, 'olderThan')])).toEqual([
      ['CASH1', 'INCOME,TRANSFERS', null],
      ['CASH1', 'INCOME,TRANSFERS', 'page-2'],
      ['CASH2', 'INCOME,TRANSFERS', null],
    ]);
    expect(txCalls[0].url).toContain('pageSize=50&categoryIds=INCOME%2CTRANSFERS&cashAccountNumbers%5B%5D=CASH1');
    expect((txCalls[0].init?.headers as Record<string, string>)['x-tr-platform']).toBe('web');
    expect(ws().subs.filter((s) => s.type === 'taxWrapperAccountUtilization')).toEqual([
      { type: 'taxWrapperAccountUtilization', secAccNo: 'SEC2' },
    ]);
    // Les opérations écartées sont journalisées — sauf les ordres, attendus et sans intérêt.
    const ignored = logs().filter((e) => e.message.includes('ignorée')).map((e) => JSON.parse(e.detail!).id);
    expect(ignored.sort()).toEqual(['card-1', 'card-2', 'div-x', 'usd-1']);

    // Flux, fenêtre et plafond suivent chaque enveloppe jusqu'aux comptes créés.
    const built = trBuildAccounts(result);
    expect(built.find((a) => a.externalId === 'traderepublic-main')).toMatchObject({ cashFlowsSince: day(-400) });
    expect(built.find((a) => a.externalId === 'traderepublic-main')?.cashFlows).toHaveLength(5);
    expect(built.find((a) => a.externalId === 'traderepublic-pea')).toMatchObject({ peaDepositsEur: 42000.5, peaCeilingEur: 150000 });
    expect(built.find((a) => a.type === 'private_equity')?.cashFlows).toBeUndefined();
  });

  it('n’importe qu’un historique partiel, sans purge, si une catégorie attendue manque', async () => {
    FakeWebSocket.handler = portfolioHandler;
    const calls = mockFetch([
      ['/timeline/transaction-categories', json({ categories: [{ id: 'INCOME', name: 'Income', children: [] }] })],
      ['/timeline/transactions', json({ items: [tx('dep-1', -1, 500, 'BANK_TRANSACTION_INCOMING')] })],
    ]);
    const result = await trFetchPortfolio();
    expect(result.warnings).toContain(
      "Catégories d'opérations Trade Republic introuvables : historique des versements incomplet (voir le journal de debug)"
    );
    expect(calls.filter((c) => c.url.includes('/timeline/transactions')).every((c) => param(c.url, 'categoryIds') === 'INCOME')).toBe(true);
    expect(result.accounts[0].cashFlows.map((f) => f.kind)).toEqual(['deposit']);
    expect(result.accounts[0].cashFlowsSince).toBeUndefined();
  });

  it('ne demande aucun historique si le serveur ne propose aucune catégorie connue', async () => {
    FakeWebSocket.handler = portfolioHandler;
    const calls = mockFetch([['/timeline/transaction-categories', json({ categories: [{ id: 'AUTRE' }] })]]);
    const result = await trFetchPortfolio();
    expect(calls.some((c) => c.url.includes('/timeline/transactions'))).toBe(false);
    expect(result.accounts.map((a) => [a.cashFlows, a.cashFlowsSince])).toEqual([[[], undefined], [[], undefined]]);
  });

  it('avertit sans échouer ni purger quand l’historique est injoignable', async () => {
    FakeWebSocket.handler = portfolioHandler;
    mockFetch([
      ['/timeline/transaction-categories', json(CATEGORIES)],
      ['/timeline/transactions', text('forbidden', 403)],
    ]);
    const result = await trFetchPortfolio();
    expect(result.accounts.map((a) => [a.cashFlows, a.cashFlowsSince])).toEqual([[[], undefined], [[], undefined]]);
    expect(result.accounts[0].holdings).toHaveLength(2);
    expect(result.warnings.filter((w) => w.startsWith('Historique des opérations Trade Republic indisponible'))).toEqual([
      'Historique des opérations Trade Republic indisponible (HTTP 403) : versements et dividendes non mis à jour',
      'Historique des opérations Trade Republic indisponible (HTTP 403) : versements et dividendes non mis à jour',
    ]);

    mockFetch([['/timeline/transaction-categories', text('nope', 503)]]);
    const sansCategories = await trFetchPortfolio();
    expect(sansCategories.warnings).toContain(
      'Historique des opérations Trade Republic indisponible (HTTP 503) : versements et dividendes non mis à jour'
    );
    expect(logs().some((e) => e.level === 'error' && e.message.includes('/timeline/transaction-categories → HTTP 503'))).toBe(true);
  });

  it('laisse le plafond du PEA inconnu si la réponse est inexploitable', async () => {
    const withUtilization = (reply: Reply): Handler => (s) => (s.type === 'taxWrapperAccountUtilization' ? reply : portfolioHandler(s));
    for (const reply of [
      { E: 'Unknown topic type' },
      { A: { totalAmount: { value: '150000', currency: 'USD' }, usedAmount: { value: '1', currency: 'USD' } } },
      { A: { totalAmount: { value: '0', currency: 'EUR' }, usedAmount: { value: '1', currency: 'EUR' } } },
      { A: { totalAmount: { value: 'x', currency: 'EUR' }, usedAmount: { value: '1', currency: 'EUR' } } },
      { A: null },
    ] as Reply[]) {
      FakeWebSocket.handler = withUtilization(reply);
      const pea = (await trFetchPortfolio()).accounts[1];
      expect([pea.peaDepositsEur, pea.peaCeilingEur]).toEqual([undefined, undefined]);
    }
  });
});

describe('parseTimelineItem', () => {
  const item = (eventType: string, over: object = {}) => ({
    id: 'tx',
    title: 'Titre',
    timestamp: '2024-05-17T23:30:00.000+0000',
    amount: { value: 10, currency: 'EUR' },
    eventType,
    ...over,
  });
  const flowOf = (i: unknown) => {
    const r = parseTimelineItem(i);
    return 'flow' in r ? r.flow : r.skipped;
  };

  it('classe chaque type d’événement connu', () => {
    expect(flowOf(item('BANK_TRANSACTION_INCOMING'))).toEqual({ externalId: 'tx', date: '2024-05-17', kind: 'deposit', amountEur: 10, label: 'Titre' });
    expect(flowOf(item('BANK_TRANSACTION_OUTGOING', { amount: { value: '-7.5', currency: 'EUR' }, title: '' }))).toEqual({
      externalId: 'tx',
      date: '2024-05-17',
      kind: 'withdrawal',
      amountEur: 7.5,
    });
    expect(flowOf(item('INTEREST_PAYOUT'))).toMatchObject({ kind: 'interest', amountEur: 10 });
    expect(flowOf(item('SSP_CORPORATE_ACTION_CASH'))).toMatchObject({ kind: 'dividend', amountEur: 10 });
  });

  it('lit l’ISIN d’un dividende dans son logo, à défaut dans une action « instrumentDetail »', () => {
    const div = (over: object) => flowOf(item('SSP_CORPORATE_ACTION_CASH', over));
    expect(div({ icon: 'logos/DK0062498333/v2' })).toMatchObject({ isin: 'DK0062498333' });
    expect(div({ icon: null, avatar: { asset: 'logos/FR0000120271/v2' } })).toMatchObject({ isin: 'FR0000120271' });
    expect(div({ action: { type: 'instrumentDetail', payload: ' FR0000120271 ' } })).toMatchObject({ isin: 'FR0000120271' });
    for (const over of [
      { icon: 'logos/timeline_interest_new/v2' },
      { action: { type: 'timelineDetail', payload: 'FR0000120271' } },
      { action: { type: 'instrumentDetail', payload: 'pas-un-isin' } },
      { action: { type: 'instrumentDetail', payload: 42 } },
    ]) {
      expect(div(over)).not.toHaveProperty('isin');
    }
    // Seul un dividende porte un titre : le logo d'un autre type n'est pas lu.
    expect(flowOf(item('INTEREST_PAYOUT', { icon: 'logos/DK0062498333/v2' }))).not.toHaveProperty('isin');
  });

  it('accepte un horodatage en millisecondes', () => {
    const noon = new Date(2024, 4, 17, 12).getTime();
    expect(flowOf(item('INTEREST_PAYOUT', { timestamp: noon }))).toMatchObject({ date: '2024-05-17' });
  });

  it('écarte ordres, types inconnus et opérations inexploitables, en disant pourquoi', () => {
    expect(flowOf(item('TRADING_TRADE_EXECUTED'))).toBe('ignored');
    for (const unknown of [item('CARD_TRANSACTION'), item(''), { ...item('x'), eventType: 42 }, {}, null]) {
      expect(flowOf(unknown)).toBe('unknown');
    }
    for (const bad of [
      item('INTEREST_PAYOUT', { status: 'CANCELED' }),
      item('INTEREST_PAYOUT', { amount: { value: 0, currency: 'EUR' } }),
      item('INTEREST_PAYOUT', { amount: { value: 'abc', currency: 'EUR' } }),
      item('INTEREST_PAYOUT', { amount: { value: 5, currency: 'USD' } }),
      item('INTEREST_PAYOUT', { amount: undefined }),
      item('INTEREST_PAYOUT', { id: undefined }),
      item('INTEREST_PAYOUT', { timestamp: 'hier' }),
      item('INTEREST_PAYOUT', { timestamp: Number.NaN }),
      // Signe contraire au type : régularisation, pas un flux.
      item('INTEREST_PAYOUT', { amount: { value: -3, currency: 'EUR' } }),
      item('SSP_CORPORATE_ACTION_CASH', { amount: { value: -3, currency: 'EUR' } }),
      item('BANK_TRANSACTION_INCOMING', { amount: { value: -3, currency: 'EUR' } }),
      item('BANK_TRANSACTION_OUTGOING', { amount: { value: 3, currency: 'EUR' } }),
    ]) {
      expect(flowOf(bad)).toBe('invalid');
    }
  });
});

describe('historyCategoryIds', () => {
  it('ne retient que les catégories attendues que le serveur propose, à toute profondeur', () => {
    expect(historyCategoryIds(CATEGORIES)).toEqual(['INCOME', 'TRANSFERS']);
    expect(historyCategoryIds({ categories: [{ id: 'SPENDING', children: [{ id: 'TRANSFERS' }] }] })).toEqual(['TRANSFERS']);
    expect(historyCategoryIds([{ id: 42 }, { id: 'INCOME' }])).toEqual(['INCOME']);
  });

  it('renvoie une liste vide pour une réponse vide, illisible ou trop profonde', () => {
    expect(historyCategoryIds(null)).toEqual([]);
    expect(historyCategoryIds('texte')).toEqual([]);
    expect(historyCategoryIds([])).toEqual([]);
    let deep: any = { id: 'INCOME' };
    for (let i = 0; i < 8; i++) deep = { child: deep };
    expect(historyCategoryIds(deep)).toEqual([]);
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
