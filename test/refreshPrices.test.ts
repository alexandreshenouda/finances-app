/** Tests du rafraîchissement global des cours (`refreshAllPrices`, `src/lib/prices/index.ts`) :
 *  taux BCE, cours CoinGecko groupés, résolution ISIN → ticker Yahoo, cours Yahoo
 *  dédupliqués, puis snapshot EUR du jour des comptes touchés. `fetch` est simulé. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { todayKey } from '@/lib/format';
import { refreshAllPrices } from '@/lib/prices';
import { clearJustEtfCache } from '@/lib/prices/justetf';
import { useStore } from '@/lib/store';
import type { Account, Holding } from '@/lib/types';
import { account, holding } from './factories';
import { json, mockFetch, networkError, text, type RouteReply } from './http';

const S = () => useStore.getState();
const h = (id: string) => S().holdings.find((x) => x.id === id)!;

const chart = (price: number, currency: string) =>
  json({ chart: { result: [{ meta: { regularMarketPrice: price, currency } }] } });

/** Routes communes : BCE (1 EUR = 1,25 USD = 0,8 CHF) et classification finale sans résultat. */
const BASE_ROUTES: [string | RegExp, RouteReply][] = [
  ['api.frankfurter.dev', json({ rates: { USD: 1.25, CHF: 0.8 } })],
  ['justetf.com', text('', 404)],
  ['/coins/', json({ categories: [] })],
];

function seed(accounts: Account[], holdings: Holding[]) {
  useStore.setState({ accounts, holdings, snapshots: [] });
}

beforeEach(() => {
  S().resetAll();
  clearJustEtfCache();
});
afterEach(() => vi.unstubAllGlobals());

describe('refreshAllPrices', () => {
  it('ne fait que rafraîchir les taux quand aucune ligne n’est valorisable', async () => {
    seed([account({ id: 'a' })], [holding({ accountId: 'a', priceSource: 'manual', unitPrice: 10 })]);
    mockFetch(BASE_ROUTES);
    expect(await refreshAllPrices()).toEqual({ updated: 0, errors: [] });
    expect(S().fxRates.USD).toBeCloseTo(0.8, 12);
    expect(S().snapshots).toEqual([]);
  });

  it('remonte l’échec des taux sans bloquer le reste', async () => {
    seed([], []);
    mockFetch([['api.frankfurter.dev', networkError('offline')]]);
    expect(await refreshAllPrices()).toEqual({ updated: 0, errors: ['Taux de change : offline'] });
  });

  it('valorise les cryptos dans la devise de leur compte, en un seul appel CoinGecko', async () => {
    seed(
      [account({ id: 'eur', type: 'crypto' }), account({ id: 'usd', type: 'crypto', currency: 'USD' })],
      [
        holding({ id: 'b1', accountId: 'eur', priceSource: 'coingecko', symbol: 'bitcoin', quantity: 0.5 }),
        holding({ id: 'b2', accountId: 'usd', priceSource: 'coingecko', symbol: ' Bitcoin ', quantity: 1 }),
        holding({ id: 'x', accountId: 'eur', name: 'Inconnu', priceSource: 'coingecko', symbol: 'nope' }),
        holding({ id: 'nosym', accountId: 'eur', priceSource: 'coingecko' }),
      ]
    );
    const calls = mockFetch([['/simple/price', json({ bitcoin: { eur: 60_000, usd: 75_000 } })], ...BASE_ROUTES]);
    const r = await refreshAllPrices();
    expect(r).toEqual({ updated: 2, errors: ['Inconnu : id CoinGecko « nope » inconnu'] });
    expect(h('b1').unitPrice).toBe(60_000);
    expect(h('b2').unitPrice).toBe(75_000);
    expect(h('nosym').unitPrice).toBeUndefined();
    expect(calls.filter((c) => c.url.includes('/simple/price'))).toHaveLength(1);
    expect(decodeURIComponent(calls.find((c) => c.url.includes('/simple/price'))!.url)).toContain('ids=bitcoin,nope');

    // Snapshot du jour en EUR : 0,5 × 60 000 € ; 75 000 $ × 0,8 €/$.
    const snaps = Object.fromEntries(S().snapshots.map((s) => [s.accountId, s]));
    expect(snaps.eur).toMatchObject({ value: 30_000, source: 'auto', date: todayKey() });
    expect(snaps.usd.value).toBeCloseTo(60_000, 6);
  });

  it('remonte une panne CoinGecko', async () => {
    seed([account({ id: 'a' })], [holding({ accountId: 'a', priceSource: 'coingecko', symbol: 'bitcoin' })]);
    mockFetch([['/simple/price', text('', 503)], ...BASE_ROUTES]);
    expect(await refreshAllPrices()).toEqual({ updated: 0, errors: ['CoinGecko : CoinGecko HTTP 503'] });
  });

  it('résout une seule fois le ticker Yahoo d’un ISIN et le mémorise sur les lignes', async () => {
    // Déjà classées : la classification de fin de refresh ne relance pas de recherche Yahoo.
    const classified = { classifiedAt: '2024-01-01', sectorWeights: [{ sector: 'energy' as const, weight: 1 }] };
    seed(
      [account({ id: 'a' })],
      [
        holding({ id: 'h1', accountId: 'a', priceSource: 'yahoo', isin: ' fr0000120271 ', quantity: 2, ...classified }),
        holding({ id: 'h2', accountId: 'a', priceSource: 'yahoo', isin: 'FR0000120271', quantity: 3, ...classified }),
      ]
    );
    const calls = mockFetch([
      ['finance/search', json({ quotes: [{ symbol: 'TTE.PA' }, { symbol: 'TOTB.F' }] })],
      ['/chart/TTE.PA', chart(60, 'EUR')],
      ...BASE_ROUTES,
    ]);
    expect(await refreshAllPrices()).toEqual({ updated: 2, errors: [] });
    expect(h('h1')).toMatchObject({ symbol: 'TTE.PA', unitPrice: 60 });
    expect(h('h2')).toMatchObject({ symbol: 'TTE.PA', unitPrice: 60 });
    expect(calls.filter((c) => c.url.includes('finance/search'))).toHaveLength(1);
    // Un seul cours pour les deux lignes (même ticker, même devise).
    expect(calls.filter((c) => c.url.includes('/chart/'))).toHaveLength(1);
    expect(S().snapshots[0].value).toBe(300);
  });

  it('signale un ISIN sans ticker Yahoo et ignore les lignes sans ticker ni ISIN', async () => {
    seed(
      [account({ id: 'a' })],
      [
        holding({ id: 'h', accountId: 'a', name: 'Fonds obscur', priceSource: 'yahoo', isin: 'LU0000000000' }),
        holding({ id: 'h2', accountId: 'a', name: 'Même ISIN', priceSource: 'yahoo', isin: 'LU0000000000' }),
        holding({ id: 'blank', accountId: 'a', priceSource: 'yahoo', symbol: '  ' }),
      ]
    );
    mockFetch([['finance/search', json({ quotes: [] })], ...BASE_ROUTES]);
    expect(await refreshAllPrices()).toEqual({
      updated: 0,
      errors: [
        "Fonds obscur : aucun ticker Yahoo trouvé pour l'ISIN LU0000000000",
        "Même ISIN : aucun ticker Yahoo trouvé pour l'ISIN LU0000000000",
      ],
    });
  });

  it('hors-ligne : signale l’échec de résolution ISIN sans le confondre avec « aucun ticker »', async () => {
    seed([account({ id: 'a' })], [holding({ id: 'h', accountId: 'a', name: 'TotalEnergies', priceSource: 'yahoo', isin: 'FR0000120271' })]);
    mockFetch([['finance/search', networkError('offline')], ...BASE_ROUTES]);
    expect(await refreshAllPrices()).toEqual({
      updated: 0,
      errors: ['TotalEnergies : résolution ISIN FR0000120271 → offline'],
    });
    expect(h('h').symbol).toBeUndefined();
  });

  it('convertit un cours Yahoo dans la devise du compte et remonte un ticker en erreur', async () => {
    seed(
      [account({ id: 'usd', currency: 'USD' })],
      [
        holding({ id: 'ok', accountId: 'usd', priceSource: 'yahoo', symbol: 'mc.pa', quantity: 1 }),
        holding({ id: 'ko', accountId: 'usd', priceSource: 'yahoo', symbol: 'DEAD', quantity: 1 }),
      ]
    );
    mockFetch([
      ['/chart/MC.PA', chart(700, 'EUR')],
      [encodeURIComponent('EURUSD=X'), chart(1.25, 'USD')],
      ['/chart/DEAD', text('', 404)],
      ...BASE_ROUTES,
    ]);
    const r = await refreshAllPrices();
    expect(r.updated).toBe(1);
    expect(r.errors).toEqual(['DEAD : Yahoo HTTP 404 pour DEAD']);
    expect(h('ok').unitPrice).toBeCloseTo(875, 10);
    expect(h('ko').unitPrice).toBeUndefined();
  });

  it('ne crée pas de snapshot pour une ligne orpheline (compte supprimé)', async () => {
    seed([], [holding({ id: 'o', accountId: 'disparu', priceSource: 'yahoo', symbol: 'MC.PA' })]);
    mockFetch([['/chart/MC.PA', chart(700, 'EUR')], ...BASE_ROUTES]);
    expect(await refreshAllPrices()).toEqual({ updated: 1, errors: [] });
    expect(S().snapshots).toEqual([]);
  });

  it('classe ensuite les lignes non classées', async () => {
    seed([account({ id: 'a' })], [holding({ id: 'c', accountId: 'a', priceSource: 'yahoo', symbol: 'MC.PA', isin: 'FR0000121014' })]);
    mockFetch([
      ['/chart/MC.PA', chart(700, 'EUR')],
      ['finance/search', json({ quotes: [{ symbol: 'MC.PA', sector: 'Consumer Cyclical' }] })],
      ...BASE_ROUTES,
    ]);
    await refreshAllPrices();
    expect(h('c')).toMatchObject({ classificationSource: 'yahoo', sectorWeights: [{ sector: 'consumer_discretionary', weight: 1 }] });
  });
});
