/** Tests de la cascade de classification des lignes (`classifyHoldings`,
 *  `src/lib/prices/classification.ts`) : CoinGecko → JustETF → Yahoo → table locale →
 *  préfixe ISIN, avec cooldown de 7 jours en cas d'échec. `fetch` est simulé. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyHoldings } from '@/lib/prices/classification';
import { clearJustEtfCache } from '@/lib/prices/justetf';
import { useStore } from '@/lib/store';
import type { Holding } from '@/lib/types';
import { holding } from './factories';
import { json, mockFetch, networkError, text } from './http';
import { etfPage, overviewBlock, row, stockPage } from './justetfPages';

const DAY = 86_400_000;
const S = () => useStore.getState();
const stored = (id: string) => S().holdings.find((h) => h.id === id)!;

function seed(...hs: Holding[]) {
  useStore.setState({ holdings: hs });
}

/** Ni JustETF, ni Yahoo ne connaissent la ligne. */
const NOTHING_FOUND: Parameters<typeof mockFetch>[0] = [
  ['justetf.com', text('', 404)],
  ['finance/search', json({ quotes: [] })],
];

beforeEach(() => {
  S().resetAll();
  clearJustEtfCache();
});
afterEach(() => vi.unstubAllGlobals());

describe('classifyHoldings — généralités', () => {
  it('ne fait rien (ni réseau) quand tout est déjà classé', async () => {
    seed(holding({ accountId: 'a', classifiedAt: '2024-01-01', sectorWeights: [{ sector: 'technology', weight: 1 }] }));
    const calls = mockFetch([]);
    expect(await classifyHoldings()).toEqual({ classified: 0, errors: [] });
    expect(calls).toHaveLength(0);
  });

  it('reclasse tout et vide le cache JustETF en mode forcé', async () => {
    const h = holding({
      id: 'h',
      accountId: 'a',
      isin: 'IE00B4L5Y983',
      classifiedAt: '2024-01-01',
      sectorWeights: [{ sector: 'other', weight: 1 }],
    });
    seed(h);
    const calls = mockFetch([['/en/etf-profile.html', text(etfPage())]]);
    expect(await classifyHoldings({ forceAll: true })).toEqual({ classified: 1, errors: [] });
    expect(await classifyHoldings({ forceAll: true })).toEqual({ classified: 1, errors: [] });
    // Cache vidé entre les deux passes : la page est re-téléchargée.
    expect(calls).toHaveLength(2);
  });
});

describe('classifyHoldings — crypto (CoinGecko)', () => {
  const btc = () => holding({ id: 'btc', accountId: 'a', name: 'Bitcoin', priceSource: 'coingecko', symbol: ' Bitcoin ' });

  it('classe en secteur crypto dès que CoinGecko renvoie une catégorie', async () => {
    seed(btc());
    const calls = mockFetch([['/coins/bitcoin', json({ categories: ['Layer 1 (L1)'] })]]);
    expect(await classifyHoldings()).toEqual({ classified: 1, errors: [] });
    expect(stored('btc')).toMatchObject({
      sectorWeights: [{ sector: 'crypto', weight: 1 }],
      classificationSource: 'coingecko',
      classificationRetryAfter: undefined,
    });
    expect(stored('btc').classifiedAt).toBeTruthy();
    expect(calls).toHaveLength(1);
  });

  it('marque comme traitée une crypto sans catégorie (pas d’erreur, pas de secteur)', async () => {
    seed(btc());
    mockFetch([['/coins/', json({ categories: [] })]]);
    expect(await classifyHoldings()).toEqual({ classified: 1, errors: [] });
    expect(stored('btc').classifiedAt).toBeTruthy();
    expect(stored('btc').sectorWeights).toBeUndefined();
  });

  it('reporte (sans rien écrire) une crypto dont l’appel CoinGecko échoue', async () => {
    seed(btc());
    mockFetch([['/coins/', text('', 429)]]);
    expect(await classifyHoldings()).toEqual({ classified: 0, errors: ['Bitcoin : CoinGecko HTTP 429 pour bitcoin'] });
    expect(stored('btc')).toEqual(btc());
  });

  it('n’écrit pas une crypto déjà dans l’état trouvé', async () => {
    const h = holding({
      id: 'eth',
      accountId: 'a',
      priceSource: 'coingecko',
      symbol: 'ethereum',
      classifiedAt: '2024-01-01',
      isin: 'XX0000000000',
      classificationSource: 'isin',
    });
    seed(h);
    mockFetch([['/coins/', networkError()]]);
    const before = stored('eth');
    expect((await classifyHoldings()).errors).toHaveLength(1);
    expect(stored('eth')).toBe(before);
  });
});

describe('classifyHoldings — titres (JustETF, Yahoo, table locale)', () => {
  it('reprend la composition JustETF d’un ETF (pays, secteurs, top positions, frais, domicile)', async () => {
    seed(
      holding({
        id: 'etf',
        accountId: 'a',
        isin: 'LU0000000001',
        classifiedAt: '2024-01-01',
        classificationRetryAfter: new Date(Date.now() - DAY).toISOString(),
      })
    );
    mockFetch([['/en/etf-profile.html', text(etfPage())]]);
    expect(await classifyHoldings()).toEqual({ classified: 1, errors: [] });
    const h = stored('etf');
    expect(h).toMatchObject({
      classificationSource: 'justetf',
      country: 'IE', // domicile du fonds, pas le préfixe LU de l'ISIN
      feesPct: 0.2,
      classificationRetryAfter: undefined,
    });
    expect(h.countryWeights?.[0]).toEqual({ country: 'US', weight: 0.7032 });
    expect(h.sectorWeights?.[0]).toEqual({ sector: 'technology', weight: 0.3571 });
    expect(h.topHoldings).toHaveLength(2);
  });

  it('ne remplace pas des frais saisis par l’utilisateur, ni par une section vide de la page', async () => {
    seed(holding({ id: 'etf', accountId: 'a', isin: 'IE00B4L5Y983', feesPct: 0.5 }));
    mockFetch([['/en/etf-profile.html', text(etfPage({ sectors: '', top: '', domicile: '' }))]]);
    await classifyHoldings();
    // Domicile vide sur la page : le pays déduit de l'ISIN est conservé.
    expect(stored('etf')).toMatchObject({ feesPct: 0.5, sectorWeights: undefined, topHoldings: undefined, country: 'IE' });
    expect(stored('etf').countryWeights).toHaveLength(3);
  });

  it('reprend pays et secteur JustETF d’une action', async () => {
    seed(holding({ id: 's', accountId: 'a', isin: 'NL0010273215' }));
    mockFetch([
      ['/etf-profile.html', text('')],
      ['/en/stock-profiles/', text(stockPage())],
    ]);
    expect(await classifyHoldings()).toEqual({ classified: 1, errors: [] });
    expect(stored('s')).toMatchObject({
      country: 'US',
      sectorWeights: [{ sector: 'technology', weight: 1 }],
      classificationSource: 'justetf',
    });
  });

  it('garde le pays de l’ISIN pour une action JustETF sans pays ni secteur exploitable', async () => {
    seed(holding({ id: 's', accountId: 'a', isin: 'DE0007164600' }));
    mockFetch([
      ['/etf-profile.html', text('')],
      [
        '/en/stock-profiles/',
        text(stockPage({ blocks: overviewBlock('Sector', 'Basic Materials') })),
      ],
    ]);
    await classifyHoldings();
    expect(stored('s')).toMatchObject({ country: 'DE', sectorWeights: [{ sector: 'materials', weight: 1 }] });
  });

  it('se rabat sur le secteur Yahoo (normalisé) quand JustETF ne sait rien', async () => {
    seed(holding({ id: 'y', accountId: 'a', isin: 'US5949181045' }));
    const calls = mockFetch([
      ['justetf.com', text('', 404)],
      ['finance/search', json({ quotes: [{ symbol: 'MSFT', sector: 'Consumer Cyclical' }] })],
    ]);
    expect(await classifyHoldings()).toEqual({ classified: 1, errors: [] });
    expect(stored('y')).toMatchObject({
      country: 'US',
      sectorWeights: [{ sector: 'consumer_discretionary', weight: 1 }],
      classificationSource: 'yahoo',
    });
    expect(calls.find((c) => c.url.includes('finance/search'))?.url).toContain('q=US5949181045');
  });

  it('interroge Yahoo par ticker quand la ligne n’a pas d’ISIN (sans JustETF)', async () => {
    seed(holding({ id: 't', accountId: 'a', symbol: 'AAPL' }));
    const calls = mockFetch([['finance/search', json({ quotes: [{ symbol: 'AAPL', sector: 'Technology' }] })]]);
    await classifyHoldings();
    expect(stored('t').classificationSource).toBe('yahoo');
    expect(calls.every((c) => !c.url.includes('justetf'))).toBe(true);
  });

  it('utilise la table locale (pondération pays) en dernier recours', async () => {
    seed(holding({ id: 'r', accountId: 'a', isin: 'IE00B4K48X80' }));
    mockFetch(NOTHING_FOUND);
    expect(await classifyHoldings()).toEqual({ classified: 1, errors: [] });
    expect(stored('r').classificationSource).toBe('reference');
    expect(stored('r').countryWeights?.find((c) => c.country === 'GB')?.weight).toBe(0.2264);
  });

  it('utilise la table locale (pays unique) pour un ETF mono-pays', async () => {
    seed(holding({ id: 'r', accountId: 'a', isin: 'LU1829221024' }));
    mockFetch(NOTHING_FOUND);
    await classifyHoldings();
    // Nasdaq-100 domicilié au Luxembourg mais 100 % américain.
    expect(stored('r')).toMatchObject({ classificationSource: 'reference', country: 'US', countryWeights: undefined });
  });

  it('pose un cooldown de 7 jours quand aucune source ne répond', async () => {
    seed(holding({ id: 'x', accountId: 'a', isin: 'XS1234567890' }));
    mockFetch(NOTHING_FOUND);
    const before = Date.now();
    expect(await classifyHoldings()).toEqual({ classified: 0, errors: [] });
    const h = stored('x');
    expect(h).toMatchObject({ country: 'autre', classificationSource: 'isin' });
    const retry = Date.parse(h.classificationRetryAfter!);
    expect(retry).toBeGreaterThanOrEqual(before + 7 * DAY);
    expect(retry).toBeLessThanOrEqual(Date.now() + 7 * DAY);
    // Cooldown actif : la passe suivante ne refait aucun appel.
    const calls = mockFetch([]);
    expect(await classifyHoldings()).toEqual({ classified: 0, errors: [] });
    expect(calls).toHaveLength(0);
  });

  it('hors-ligne : signale l’erreur sans cooldown ni écriture, et reclasse au retour du réseau', async () => {
    const h = holding({ id: 'off', accountId: 'a', name: 'ETF Monde', isin: 'US5949181045' });
    seed(h);
    mockFetch([['', networkError('offline')]]);
    expect(await classifyHoldings()).toEqual({ classified: 0, errors: ['ETF Monde : JustETF injoignable : offline'] });
    // Ligne intacte : pas de `classificationRetryAfter`, elle reste à classer.
    expect(stored('off')).toEqual(h);

    mockFetch([
      ['justetf.com', text('', 404)],
      ['finance/search', json({ quotes: [{ symbol: 'MSFT', sector: 'Technology' }] })],
    ]);
    expect(await classifyHoldings()).toEqual({ classified: 1, errors: [] });
    expect(stored('off').classificationSource).toBe('yahoo');
  });

  it('ne met pas en cooldown une ligne que JustETF ignore quand Yahoo est en panne', async () => {
    seed(holding({ id: 'y', accountId: 'a', name: 'Action', isin: 'US5949181045' }));
    mockFetch([
      ['justetf.com', text('', 404)],
      ['finance/search', text('', 503)],
    ]);
    const r = await classifyHoldings();
    expect(r.classified).toBe(0);
    expect(r.errors).toEqual(['Action : Yahoo HTTP 503 pour la recherche « US5949181045 »']);
    expect(stored('y').classificationRetryAfter).toBeUndefined();
    expect(stored('y').classifiedAt).toBeUndefined();
  });

  it('se contente de la table locale même hors-ligne', async () => {
    seed(holding({ id: 'r', accountId: 'a', isin: 'IE00B4K48X80' }));
    mockFetch([['', networkError('offline')]]);
    expect(await classifyHoldings()).toEqual({ classified: 1, errors: [] });
    expect(stored('r').classificationSource).toBe('reference');
  });

  it('classe une ligne sans ISIN ni ticker sans aucun appel (cooldown, source inconnue)', async () => {
    seed(holding({ id: 'm', accountId: 'a', name: 'Fonds maison' }));
    const calls = mockFetch([]);
    await classifyHoldings();
    expect(calls).toHaveLength(0);
    expect(stored('m').classificationSource).toBeUndefined();
    expect(stored('m').classificationRetryAfter).toBeTruthy();
  });
});
