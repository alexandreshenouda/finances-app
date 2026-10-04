/** Tests du client Yahoo Finance (`src/lib/prices/yahoo.ts`) : cours, conversion de devises
 *  via les paires `EURxxx=X`, et recherche de ticker par ISIN. `fetch` est simulé. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch, networkError, text } from './http';

/** Le cache des taux est au niveau module : un module neuf par test. `Platform` est relu
 *  dans le même registre, sinon on modifierait une autre instance du bouchon. */
async function load() {
  vi.resetModules();
  const { Platform } = await import('./stubs/react-native');
  return { ...(await import('@/lib/prices/yahoo')), Platform };
}

const chart = (price: number, currency: string) => json({ chart: { result: [{ meta: { regularMarketPrice: price, currency } }] } });

afterEach(() => vi.unstubAllGlobals());

describe('fetchYahooPrice / fetchYahooPriceEur', () => {
  it('rend tel quel un cours déjà dans la devise demandée', async () => {
    const { fetchYahooPrice, fetchYahooPriceEur } = await load();
    const calls = mockFetch([['/chart/CW8.PA', chart(500, 'EUR')]]);
    expect(await fetchYahooPrice('CW8.PA', 'EUR')).toBe(500);
    expect(await fetchYahooPriceEur('CW8.PA')).toBe(500);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain('range=5d&interval=1d');
  });

  it('convertit un cours USD en EUR (1 EUR = 1,25 USD) et met le taux en cache', async () => {
    const { fetchYahooPrice, fetchYahooPriceEur } = await load();
    const calls = mockFetch([
      ['/chart/AAPL', chart(200, 'USD')],
      [`/chart/${encodeURIComponent('EURUSD=X')}`, chart(1.25, 'USD')],
    ]);
    expect(await fetchYahooPriceEur('AAPL')).toBeCloseTo(160, 10);
    expect(await fetchYahooPrice('AAPL', 'EUR')).toBeCloseTo(160, 10);
    // 2 cours AAPL + 1 seul taux EURUSD (le second appel lit le cache).
    expect(calls.filter((c) => c.url.includes('EURUSD'))).toHaveLength(1);
    expect(calls).toHaveLength(3);
  });

  it('convertit entre deux devises étrangères en passant par l’euro', async () => {
    const { fetchYahooPrice } = await load();
    mockFetch([
      ['/chart/NESN.SW', chart(100, 'CHF')],
      [encodeURIComponent('EURCHF=X'), chart(0.95, 'CHF')],
      [encodeURIComponent('EURUSD=X'), chart(1.1, 'USD')],
    ]);
    // 100 CHF → 100 / 0,95 € → × 1,1 USD
    expect(await fetchYahooPrice('NESN.SW', 'USD')).toBeCloseTo((100 / 0.95) * 1.1, 10);
  });

  it('convertit vers une devise cible depuis un cours en euros', async () => {
    const { fetchYahooPrice } = await load();
    mockFetch([
      ['/chart/MC.PA', chart(700, 'EUR')],
      [encodeURIComponent('EURCHF=X'), chart(0.95, 'CHF')],
    ]);
    expect(await fetchYahooPrice('MC.PA', 'CHF')).toBeCloseTo(700 * 0.95, 10);
  });

  it('gère les fonds cotés en pence (GBp = GBP × 100)', async () => {
    const { fetchYahooPriceEur } = await load();
    mockFetch([
      ['/chart/VUSA.L', chart(8_500, 'GBp')],
      [encodeURIComponent('EURGBP=X'), chart(0.85, 'GBP')],
    ]);
    expect(await fetchYahooPriceEur('VUSA.L')).toBeCloseTo(8_500 / (0.85 * 100), 10);
  });

  it('signale une erreur HTTP ou une réponse sans cours', async () => {
    const { fetchYahooPriceEur } = await load();
    mockFetch([
      ['/chart/DOWN', text('', 503)],
      ['/chart/EMPTY', json({ chart: { result: [] } })],
      ['/chart/NOCUR', json({ chart: { result: [{ meta: { regularMarketPrice: 1 } }] } })],
    ]);
    await expect(fetchYahooPriceEur('DOWN')).rejects.toThrow('Yahoo HTTP 503 pour DOWN');
    await expect(fetchYahooPriceEur('EMPTY')).rejects.toThrow('Cours introuvable pour EMPTY');
    await expect(fetchYahooPriceEur('NOCUR')).rejects.toThrow('Cours introuvable pour NOCUR');
  });
});

describe('searchYahooSymbol', () => {
  const quotes = {
    quotes: [
      { symbol: 'AAPL', shortname: 'Apple Inc.', exchange: 'NMS', quoteType: 'EQUITY', sector: 'Technology', industry: 'Consumer Electronics' },
      { symbol: 'APC.F', longname: 'Apple Inc. (Frankfurt)', exchDisp: 'Frankfurt' },
      { symbol: 'RAW' },
      { shortname: 'sans symbole : ignoré' },
    ],
  };

  it('résout un ISIN en tickers candidats (appel direct en natif)', async () => {
    const { searchYahooSymbol } = await load();
    const calls = mockFetch([['/v1/finance/search', json(quotes)]]);
    expect(await searchYahooSymbol('US0378331005')).toEqual([
      { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NMS', quoteType: 'EQUITY', sector: 'Technology', industry: 'Consumer Electronics' },
      { symbol: 'APC.F', name: 'Apple Inc. (Frankfurt)', exchange: 'Frankfurt', quoteType: undefined, sector: undefined, industry: undefined },
      { symbol: 'RAW', name: 'RAW', exchange: '', quoteType: undefined, sector: undefined, industry: undefined },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('q=US0378331005');
  });

  it('renvoie une liste vide si la réponse n’a pas de `quotes`', async () => {
    const { searchYahooSymbol } = await load();
    mockFetch([['/v1/finance/search', json({ count: 0 })]]);
    expect(await searchYahooSymbol('XX')).toEqual([]);
  });

  it('lève en natif si la recherche est injoignable ou en erreur (pas de proxy hors web)', async () => {
    const { searchYahooSymbol } = await load();
    const calls = mockFetch([['/v1/finance/search', networkError('offline')]]);
    // Une panne ne doit pas ressembler à « aucun ticker » ([]).
    await expect(searchYahooSymbol('XX')).rejects.toThrow('offline');
    expect(calls).toHaveLength(1);
    mockFetch([['/v1/finance/search', text('', 503)]]);
    await expect(searchYahooSymbol('XX')).rejects.toThrow('Yahoo HTTP 503 pour la recherche « XX »');
  });

  it('passe par le proxy CORS sur le web si l’appel direct est bloqué', async () => {
    const { searchYahooSymbol, Platform } = await load();
    Platform.OS = 'web';
    const calls = mockFetch([
      ['api.allorigins.win', json(quotes)],
      ['query1.finance.yahoo.com', networkError()],
    ]);
    expect((await searchYahooSymbol('AAPL')).map((m) => m.symbol)).toEqual(['AAPL', 'APC.F', 'RAW']);
    expect(calls).toHaveLength(2);
  });

  it('lève sur le web si le proxy échoue aussi', async () => {
    const { searchYahooSymbol, Platform } = await load();
    Platform.OS = 'web';
    mockFetch([
      ['api.allorigins.win', text('', 500)],
      ['query1.finance.yahoo.com', text('', 403)],
    ]);
    await expect(searchYahooSymbol('AAPL')).rejects.toThrow('Yahoo HTTP 500 pour la recherche « AAPL »');
    mockFetch([['', networkError('offline')]]);
    await expect(searchYahooSymbol('AAPL')).rejects.toThrow('offline');
  });
});
