/** Tests de l'orchestrateur de synchronisation (`src/lib/connectors/index.ts`) : lecture des
 *  identifiants, choix du connecteur, et report du résultat dans le store (comptes liés,
 *  lignes remplacées, snapshot du jour). Les connecteurs réels tournent sur un `fetch` simulé. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INTERACTIVE_PROVIDERS,
  loadCredentials,
  persistExternalAccounts,
  syncAllConnections,
  syncConnection,
} from '@/lib/connectors';
import type { SyncResult } from '@/lib/connectors/types';
import { todayKey } from '@/lib/format';
import { connectionSecretKey, setSecret } from '@/lib/secure';
import { useStore } from '@/lib/store';
import type { Connection } from '@/lib/types';
import { json, mockFetch } from './http';
import { __secureMemory } from './stubs/expo-secure-store';

const S = () => useStore.getState();
const accountsOf = (connId: string) => S().accounts.filter((a) => a.connectionId === connId);

const BINANCE_ROUTES = [
  ['/api/v3/account', json({ balances: [{ asset: 'BTC', free: '0.5', locked: '0' }, { asset: 'EUR', free: '100', locked: '0' }] })],
  ['/api/v3/ticker/price', json([{ symbol: 'BTCEUR', price: '60000' }])],
] as Parameters<typeof mockFetch>[0];

function connection(provider: Connection['provider'], label: string = provider): Connection {
  return S().upsertConnection({ provider, label });
}

beforeEach(() => {
  S().resetAll();
  __secureMemory.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('loadCredentials', () => {
  it('lit et parse les identifiants JSON d’une connexion', async () => {
    await setSecret(connectionSecretKey('c1'), JSON.stringify({ apiKey: 'k' }));
    expect(await loadCredentials<{ apiKey: string }>('c1')).toEqual({ apiKey: 'k' });
  });

  it('renvoie null si absents ou corrompus', async () => {
    expect(await loadCredentials('inconnue')).toBeNull();
    await setSecret(connectionSecretKey('c2'), '{pas du json');
    expect(await loadCredentials('c2')).toBeNull();
  });
});

describe('persistExternalAccounts', () => {
  const result = (over: Partial<SyncResult['accounts'][number]> = {}): SyncResult => ({
    warnings: [],
    accounts: [
      {
        externalId: 'ext-1',
        name: 'Compte distant',
        type: 'cto',
        institution: 'Courtier',
        cashBalanceEur: 50,
        holdings: [
          { name: 'ETF', symbol: 'CW8', isin: 'FR0010756098', quantity: 2, unitPriceEur: 100, buyPriceEur: 80 },
          { name: 'Action', quantity: 1, unitPriceEur: 25 },
        ],
        ...over,
      },
    ],
  });

  it('crée le compte lié, ses lignes (cours « exchange ») et le snapshot EUR du jour', () => {
    const conn = connection('binance');
    persistExternalAccounts(conn, result());
    const [acc] = accountsOf(conn.id);
    expect(acc).toMatchObject({ name: 'Compte distant', type: 'cto', institution: 'Courtier', cashBalance: 50, externalId: 'ext-1' });
    const lines = S().holdings.filter((h) => h.accountId === acc.id);
    expect(lines.map((h) => [h.name, h.quantity, h.unitPrice, h.buyPrice, h.priceSource])).toEqual([
      ['ETF', 2, 100, 80, 'exchange'],
      ['Action', 1, 25, undefined, 'exchange'],
    ]);
    expect(S().snapshots).toEqual([expect.objectContaining({ accountId: acc.id, value: 275, source: 'sync', date: todayKey() })]);
    const c = S().connections.find((x) => x.id === conn.id)!;
    expect(c.lastSync).toBeTruthy();
    expect(c.lastError).toBeUndefined();
  });

  it('met à jour le compte existant sans écraser les choix de l’utilisateur, et remplace ses lignes', () => {
    const conn = connection('binance');
    persistExternalAccounts(conn, result());
    const [first] = accountsOf(conn.id);
    S().upsertAccount({ ...first, name: 'Renommé', type: 'pea', institution: 'Perso' });
    // Ligne d'un autre compte : ne doit pas être touchée.
    S().upsertHolding({ accountId: 'autre', name: 'Garde', quantity: 1 });

    persistExternalAccounts(conn, result({ name: 'Nouveau nom', holdings: [{ name: 'Seule', quantity: 3, unitPriceEur: 10 }] }));
    const accs = accountsOf(conn.id);
    expect(accs).toHaveLength(1);
    expect(accs[0]).toMatchObject({ id: first.id, name: 'Renommé', type: 'pea', institution: 'Perso' });
    expect(S().holdings.filter((h) => h.accountId === first.id).map((h) => h.name)).toEqual(['Seule']);
    expect(S().holdings.some((h) => h.name === 'Garde')).toBe(true);
  });

  it('met les liquidités à 0 quand le connecteur ne les donne pas mais renvoie des lignes', () => {
    const conn = connection('binance');
    persistExternalAccounts(conn, result({ cashBalanceEur: undefined }));
    expect(accountsOf(conn.id)[0].cashBalance).toBe(0);
  });

  it('garde les liquidités connues d’un compte sans lignes ni solde transmis', () => {
    const conn = connection('enablebanking');
    persistExternalAccounts(conn, result({ cashBalanceEur: 500, holdings: [] }));
    persistExternalAccounts(conn, result({ cashBalanceEur: undefined, holdings: [] }));
    expect(accountsOf(conn.id)[0].cashBalance).toBe(500);
    // Première synchro sans aucune information : 0.
    const other = connection('enablebanking', 'autre banque');
    persistExternalAccounts(other, result({ cashBalanceEur: undefined, holdings: [] }));
    expect(accountsOf(other.id)[0].cashBalance).toBe(0);
  });
});

describe('syncConnection', () => {
  it('rejette une connexion inconnue', async () => {
    await expect(syncConnection('nope')).rejects.toThrow('Connexion inconnue');
  });

  it.each([
    ['binance', 'Identifiants Binance introuvables'],
    ['kraken', 'Identifiants Kraken introuvables'],
    ['enablebanking', 'Identifiants Enable Banking introuvables'],
    ['traderepublic', 'Trade Republic nécessite une validation 2FA : utilisez le bouton Reconnecter.'],
  ] as const)('%s : échoue proprement et mémorise l’erreur sur la connexion', async (provider, message) => {
    const conn = connection(provider);
    await expect(syncConnection(conn.id)).rejects.toThrow(message);
    expect(S().connections.find((c) => c.id === conn.id)?.lastError).toBe(message);
  });

  it('synchronise Binance de bout en bout', async () => {
    const conn = connection('binance');
    await setSecret(connectionSecretKey(conn.id), JSON.stringify({ apiKey: 'k', apiSecret: 's' }));
    mockFetch(BINANCE_ROUTES);
    expect(await syncConnection(conn.id)).toEqual({ warnings: [] });
    const [acc] = accountsOf(conn.id);
    expect(acc).toMatchObject({ externalId: 'binance-spot', cashBalance: 100 });
    expect(S().snapshots[0].value).toBe(100 + 0.5 * 60_000);
  });

  it('synchronise Kraken et remonte ses avertissements', async () => {
    const conn = connection('kraken');
    await setSecret(connectionSecretKey(conn.id), JSON.stringify({ apiKey: 'k', apiSecret: Buffer.from('s').toString('base64') }));
    mockFetch([
      ['/0/private/Balance', json({ error: [], result: { FOO: '1' } })],
      ['/0/public/Ticker', json({ result: {} })],
    ]);
    expect(await syncConnection(conn.id)).toEqual({ warnings: ['Kraken : pas de cours EUR pour FOO (ignoré)'] });
    expect(accountsOf(conn.id)[0].externalId).toBe('kraken-main');
  });

  it('synchronise Enable Banking (aucune session : aucun compte)', async () => {
    const conn = connection('enablebanking');
    await setSecret(
      connectionSecretKey(conn.id),
      JSON.stringify({ applicationId: 'a', privateKeyPem: 'x', redirectUrl: 'https://x', sessions: [] })
    );
    expect(await syncConnection(conn.id)).toEqual({ warnings: [] });
    expect(S().connections[0].lastSync).toBeTruthy();
  });
});

describe('syncAllConnections', () => {
  it('ignore les connexions interactives et n’échoue pas globalement', async () => {
    expect(INTERACTIVE_PROVIDERS).toEqual(['traderepublic']);
    const ok = connection('binance', 'Mon Binance');
    connection('kraken', 'Mon Kraken'); // pas d'identifiants
    connection('traderepublic', 'Mon TR');
    await setSecret(connectionSecretKey(ok.id), JSON.stringify({ apiKey: 'k', apiSecret: 's' }));
    mockFetch([
      ['/api/v3/account', json({ balances: [{ asset: 'ZZZ', free: '1', locked: '0' }] })],
      ['/api/v3/ticker/price', json([])],
    ]);
    expect(await syncAllConnections()).toEqual({
      warnings: ['Binance : pas de cours EUR pour ZZZ (ignoré)'],
      errors: ['Mon Kraken : Identifiants Kraken introuvables'],
    });
  });
});
