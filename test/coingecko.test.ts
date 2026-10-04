/** Tests du client CoinGecko (`src/lib/prices/coingecko.ts`). `fetch` est simulé. */
import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { fetchCoinGeckoCategory, fetchCoinGeckoPrices } from '@/lib/prices/coingecko';
import { json, mockFetch, text } from './http';

afterEach(() => vi.unstubAllGlobals());

describe('fetchCoinGeckoPrices', () => {
  it('n’appelle pas l’API sans id', async () => {
    const calls = mockFetch([]);
    expect((await fetchCoinGeckoPrices([])).size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('groupe les ids en un seul appel et mappe les trois devises', async () => {
    const calls = mockFetch([
      ['/simple/price', json({ bitcoin: { eur: 60_000, usd: 65_000, chf: 58_000 }, ethereum: { eur: 3_000 } })],
    ]);
    const prices = await fetchCoinGeckoPrices(['bitcoin', 'ethereum']);
    expect(prices.get('bitcoin')).toEqual({ EUR: 60_000, USD: 65_000, CHF: 58_000 });
    expect(prices.get('ethereum')).toEqual({ EUR: 3_000, USD: undefined, CHF: undefined });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(`ids=${encodeURIComponent('bitcoin,ethereum')}`);
    expect(calls[0].url).toContain('vs_currencies=eur,usd,chf');
  });

  it('lève une erreur explicite sur un statut HTTP en échec', async () => {
    mockFetch([['/simple/price', text('', 429)]]);
    await expect(fetchCoinGeckoPrices(['bitcoin'])).rejects.toThrow('CoinGecko HTTP 429');
  });
});

describe('fetchCoinGeckoCategory', () => {
  it('écarte les catégories « bruit » (indices, holdings, écosystèmes)', async () => {
    mockFetch([
      ['/coins/solana', json({ categories: ['Solana Ecosystem', 'Coinbase 50 Index', 'Layer 1 (L1)', 'Smart Contract Platform'] })],
    ]);
    expect(await fetchCoinGeckoCategory('solana')).toBe('Layer 1 (L1)');
  });

  it('garde la première catégorie si toutes sont du bruit', async () => {
    mockFetch([['/coins/x', json({ categories: [null, 'FTX Holdings', 'Binance Ecosystem'] })]]);
    expect(await fetchCoinGeckoCategory('x')).toBe('FTX Holdings');
  });

  it('renvoie undefined sans catégorie exploitable', async () => {
    mockFetch([
      ['/coins/a', json({ categories: [] })],
      ['/coins/b', json({ categories: 'pas un tableau' })],
    ]);
    expect(await fetchCoinGeckoCategory('a')).toBeUndefined();
    expect(await fetchCoinGeckoCategory('b')).toBeUndefined();
  });

  it('lève une erreur explicite sur un statut HTTP en échec', async () => {
    mockFetch([['/coins/', text('', 404)]]);
    await expect(fetchCoinGeckoCategory('inconnu')).rejects.toThrow('CoinGecko HTTP 404 pour inconnu');
  });
});
