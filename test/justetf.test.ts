/** Tests du scraper JustETF (`src/lib/prices/justetf.ts`) sur des pages HTML synthétiques
 *  reproduisant la structure réelle des profils ETF / action (attributs `data-testid`,
 *  blocs `data-overview`). `fetch` est simulé : aucune requête ne part vers justetf.com. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearJustEtfCache,
  fetchJustEtfClassification,
  fetchJustEtfProfile,
  fetchJustEtfStockProfile,
  JustEtfUnavailableError,
} from '@/lib/prices/justetf';
import { useDebugLogStore } from '@/lib/debugLog';
import { Platform } from './stubs/react-native';
import { json, mockFetch, networkError, text } from './http';
import { ETF_ISIN, etfPage, overviewBlock, row, STOCK_ISIN, stockPage } from './justetfPages';

beforeEach(() => {
  clearJustEtfCache();
  // Journal actif : les branches de log sont exécutées comme en mode développeur.
  useDebugLogStore.setState({ enabled: true, entries: [] });
});

afterEach(() => {
  Platform.OS = 'android';
  vi.unstubAllGlobals();
  vi.useRealTimers();
  useDebugLogStore.setState({ enabled: false, entries: [] });
});

describe('fetchJustEtfProfile', () => {
  it('refuse un ISIN mal formé sans appel réseau', async () => {
    const calls = mockFetch([]);
    expect(await fetchJustEtfProfile('FR123')).toBeNull();
    expect(await fetchJustEtfProfile('1234567890AB')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('extrait nom, TER, domicile, pays, secteurs et top positions', async () => {
    const calls = mockFetch([['/en/etf-profile.html', text(etfPage())]]);
    const p = await fetchJustEtfProfile(` ${ETF_ISIN.toLowerCase()} `);
    expect(p).toEqual({
      isin: ETF_ISIN,
      name: 'iShares Core MSCI World & Co',
      ter: 0.2,
      domicile: 'IE',
      // Pays inconnu (« Atlantis ») et « Other » agrégés ensemble dans « autre ».
      countryWeights: [
        { country: 'US', weight: 0.7032 },
        { country: 'JP', weight: 0.0579 },
        { country: 'autre', weight: 0.2389 },
      ],
      // « Finance » et « Financials » normalisés et agrégés ; virgule décimale acceptée.
      sectorWeights: [
        { sector: 'technology', weight: 0.3571 },
        { sector: 'financials', weight: 0.2 },
      ],
      topHoldings: [
        { isin: 'US67066G1040', name: 'NVIDIA Corp.', weight: 0.0553 },
        { isin: STOCK_ISIN, name: 'Apple', weight: 0.0507 },
      ],
    });
    expect(calls[0].url).toBe(`https://www.justetf.com/en/etf-profile.html?isin=${ETF_ISIN}`);
    expect((calls[0].init?.headers as Record<string, string>)['User-Agent']).toMatch(/Mozilla/);
  });

  it('lit le TER et le nom dans leurs emplacements de repli', async () => {
    mockFetch([
      [
        '/en/etf-profile.html',
        text(
          etfPage({
            title: '<h1 class="x" data-testid="etf-profile-header_etf-name">Fonds &quot;B&quot;</h1>',
            ter: '<div class="val" data-testid="tl_etf-basics_value_ter">0,07%</div>',
          })
        ),
      ],
    ]);
    const p = await fetchJustEtfProfile(ETF_ISIN);
    expect(p?.name).toBe('Fonds "B"');
    expect(p?.ter).toBe(0.07);
  });

  it('se rabat sur la page française si la page anglaise n’est pas un profil', async () => {
    const calls = mockFetch([
      ['/en/etf-profile.html', text('<html>page vide</html>')],
      ['/fr/etf-profile.html', text(etfPage({ domicile: 'Irlande', countries: row('countries', 'États-Unis', '100') }))],
    ]);
    const p = await fetchJustEtfProfile(ETF_ISIN);
    expect(p?.domicile).toBe('IE');
    expect(p?.countryWeights).toEqual([{ country: 'US', weight: 1 }]);
    expect(calls.map((c) => c.url.includes('/fr/'))).toEqual([false, true]);
  });

  it('garde la page anglaise partielle si la française ne vaut pas mieux', async () => {
    // Contient un marqueur accepté par le fetch (`data-overview`) mais pas un profil ETF.
    mockFetch([
      ['/en/etf-profile.html', text('<div class="data-overview"><h1 id="etf-title">Seulement un titre</h1></div>')],
      ['/fr/etf-profile.html', text('rien')],
    ]);
    expect(await fetchJustEtfProfile(ETF_ISIN)).toEqual({
      isin: ETF_ISIN,
      name: 'Seulement un titre',
      ter: undefined,
      domicile: undefined,
      countryWeights: [],
      sectorWeights: [],
      topHoldings: [],
    });
  });

  it('renvoie null pour une page sans nom, pays ni secteur', async () => {
    mockFetch([['/etf-profile.html', text('<div data-testid="etf-basics_x">rien</div>')]]);
    expect(await fetchJustEtfProfile(ETF_ISIN)).toBeNull();
  });

  it('écarte les poids nuls et illisibles', async () => {
    mockFetch([
      [
        '/en/etf-profile.html',
        text(etfPage({ countries: row('countries', 'France', '0') + row('countries', 'Germany', '.') + row('countries', 'Italy', '4') })),
      ],
    ]);
    expect((await fetchJustEtfProfile(ETF_ISIN))?.countryWeights).toEqual([{ country: 'IT', weight: 0.04 }]);
  });

  it('lève « injoignable » (et non null) quand JustETF ne répond pas (natif)', async () => {
    const calls = mockFetch([['justetf.com', networkError('offline')]]);
    const err = await fetchJustEtfProfile(ETF_ISIN).catch((e) => e);
    expect(err).toBeInstanceOf(JustEtfUnavailableError);
    expect(err.message).toBe('JustETF injoignable : offline');
    // Inutile de tenter la page française : la panne n'est pas propre à la langue.
    expect(calls).toHaveLength(1);
    expect(useDebugLogStore.getState().entries.some((e) => e.message.includes('failed or timed out'))).toBe(true);
  });

  it('distingue une page absente (4xx → null) d’une indisponibilité (429/5xx → erreur)', async () => {
    mockFetch([['justetf.com', text(etfPage(), 404)]]);
    expect(await fetchJustEtfProfile(ETF_ISIN)).toBeNull();
    mockFetch([['justetf.com', text('', 429)]]);
    await expect(fetchJustEtfProfile(ETF_ISIN)).rejects.toThrow('JustETF injoignable : HTTP 429');
    mockFetch([['justetf.com', text('', 503)]]);
    await expect(fetchJustEtfStockProfile(STOCK_ISIN)).rejects.toThrow('JustETF injoignable : HTTP 503');
  });

  it('ignore une cellule de domicile vide (le pays de l’ISIN reste valable)', async () => {
    mockFetch([['/en/etf-profile.html', text(etfPage({ domicile: ' ' }))]]);
    expect((await fetchJustEtfProfile(ETF_ISIN))?.domicile).toBeUndefined();
  });

  it('abandonne une requête qui dépasse le délai (4,5 s)', async () => {
    vi.useFakeTimers();
    let aborted = 0;
    vi.stubGlobal(
      'fetch',
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener('abort', () => {
            aborted++;
            reject(new Error('aborted'));
          });
        })
    );
    const pending = fetchJustEtfProfile(ETF_ISIN);
    const failed = expect(pending).rejects.toThrow('JustETF injoignable : aborted');
    await vi.advanceTimersByTimeAsync(4_500);
    await failed;
    expect(aborted).toBe(1);
  });
});

describe('fetchJustEtfProfile sur le web (proxies CORS)', () => {
  beforeEach(() => {
    Platform.OS = 'web';
  });

  it('passe par allorigins (JSON `contents`) sans jamais appeler justetf.com en direct', async () => {
    const calls = mockFetch([['api.allorigins.win/get', json({ contents: etfPage() })]]);
    expect((await fetchJustEtfProfile(ETF_ISIN))?.domicile).toBe('IE');
    expect(calls.every((c) => !c.url.startsWith('https://www.justetf.com'))).toBe(true);
    expect(calls[0].url).toContain(encodeURIComponent(`https://www.justetf.com/en/etf-profile.html?isin=${ETF_ISIN}`));
  });

  it('se rabat sur codetabs si allorigins échoue ou répond sans contenu', async () => {
    mockFetch([
      ['api.allorigins.win', text('', 500)],
      ['api.codetabs.com', text(etfPage())],
    ]);
    expect((await fetchJustEtfProfile(ETF_ISIN))?.name).toBe('iShares Core MSCI World & Co');

  });

  it('lève « injoignable » si aucun proxy n’a relayé de page', async () => {
    mockFetch([
      ['api.allorigins.win', json({ contents: null })],
      ['api.codetabs.com', networkError()],
    ]);
    await expect(fetchJustEtfProfile(ETF_ISIN)).rejects.toThrow('JustETF injoignable : aucun proxy CORS disponible');
    mockFetch([
      ['api.allorigins.win', networkError()],
      ['api.codetabs.com', text('', 502)],
    ]);
    await expect(fetchJustEtfProfile(ETF_ISIN)).rejects.toBeInstanceOf(JustEtfUnavailableError);
  });

  it('renvoie null si un proxy a relayé une page qui n’est pas un profil', async () => {
    mockFetch([
      ['api.allorigins.win', json({ contents: '<html>Aucun résultat</html>' })],
      ['api.codetabs.com', networkError()],
    ]);
    expect(await fetchJustEtfProfile(ETF_ISIN)).toBeNull();
  });
});

describe('fetchJustEtfStockProfile', () => {
  it('refuse un ISIN mal formé sans appel réseau', async () => {
    const calls = mockFetch([]);
    expect(await fetchJustEtfStockProfile('nope')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('lit pays, secteur, capitalisation et rendement dans le bloc `data-overview`', async () => {
    const calls = mockFetch([['/en/stock-profiles/', text(stockPage())]]);
    // Le rendement est le DERNIER bloc sur la vraie page : il a longtemps été perdu.
    expect(await fetchJustEtfStockProfile(STOCK_ISIN)).toEqual({
      isin: STOCK_ISIN,
      name: 'Apple',
      country: 'US',
      sector: 'technology',
      marketCap: '3,882,357 m',
      dividendYield: 0.34,
    });
    expect(calls[0].url).toBe(`https://www.justetf.com/en/stock-profiles/${STOCK_ISIN}`);
  });

  it('comprend les libellés français et se rabat sur la page /fr/', async () => {
    const calls = mockFetch([
      ['/en/stock-profiles/', text('<html>404</html>')],
      [
        '/fr/stock-profiles/',
        text(
          stockPage({
            title: '<h1 id="stock-title">LVMH</h1>',
            blocks:
              overviewBlock('Rendement du dividende', '1,9 %') +
              overviewBlock('Pays', 'France') +
              overviewBlock('Secteur', 'Consommation discrétionnaire') +
              overviewBlock('Cap. boursière', '300 Md') +
              overviewBlock('Sans valeur', ''),
          })
        ),
      ],
    ]);
    expect(await fetchJustEtfStockProfile('FR0000121014')).toMatchObject({
      name: 'LVMH',
      country: 'FR',
      sector: 'consumer_discretionary',
      dividendYield: 1.9,
      marketCap: '300 Md',
    });
    expect(calls).toHaveLength(2);
  });

  it('déduit le secteur des étiquettes du profil quand l’overview n’en donne pas', async () => {
    mockFetch([
      [
        '/en/stock-profiles/',
        text(
          stockPage({
            blocks: overviewBlock('Country', 'Germany'),
            labels: '<span class="label label-default">Hardware</span><span class="label label-default">Health Care</span>',
          })
        ),
      ],
    ]);
    expect(await fetchJustEtfStockProfile('DE0007164600')).toMatchObject({ country: 'DE', sector: 'healthcare' });
  });

  it('laisse le secteur vide si aucune étiquette n’est un secteur connu', async () => {
    mockFetch([
      ['/en/stock-profiles/', text(stockPage({ blocks: overviewBlock('Country', 'Japan'), labels: '<span class="label">Hardware</span>' }))],
    ]);
    const p = await fetchJustEtfStockProfile('JP3633400001');
    expect(p?.country).toBe('JP');
    expect(p?.sector).toBeUndefined();
  });

  it('ne lit que le libellé visible de chaque bloc, pas les infobulles ni la suite de la page', async () => {
    mockFetch([
      [
        '/en/stock-profiles/',
        text(
          stockPage({
            blocks:
              overviewBlock('Market cap <span title="Country of the company">(in EUR)</span>', '10 m') +
              overviewBlock('Dividend yield', '2%'),
          }) + '<div class="d-flex"><div>Country</div><div class="val bold">Japan</div></div>'
        ),
      ],
    ]);
    expect(await fetchJustEtfStockProfile(STOCK_ISIN)).toMatchObject({
      marketCap: '10 m',
      dividendYield: 2,
      country: undefined,
    });
  });

  it('renvoie null sans nom, pays ni secteur, ou si la page est introuvable', async () => {
    mockFetch([['/stock-profiles/', text('<div class="stock-title-less data-overview">rien</div>')]]);
    expect(await fetchJustEtfStockProfile(STOCK_ISIN)).toBeNull();
    mockFetch([['/stock-profiles/', text('', 404)]]);
    expect(await fetchJustEtfStockProfile(STOCK_ISIN)).toBeNull();
  });
});

describe('fetchJustEtfClassification', () => {
  it('ignore un ISIN vide', async () => {
    expect(await fetchJustEtfClassification('  ')).toBeNull();
  });

  it('classe un ETF avec sa composition et ses frais, puis sert le cache', async () => {
    const calls = mockFetch([['/en/etf-profile.html', text(etfPage())]]);
    const c = await fetchJustEtfClassification(ETF_ISIN);
    expect(c).toMatchObject({ kind: 'etf', isin: ETF_ISIN, feesPct: 0.2, domicile: 'IE' });
    expect(c?.kind === 'etf' && c.topHoldings).toHaveLength(2);
    const n = calls.length;
    expect(await fetchJustEtfClassification(ETF_ISIN.toLowerCase())).toBe(c);
    expect(calls).toHaveLength(n);
  });

  it('bascule sur le profil action quand la page ETF n’a ni pays ni secteur', async () => {
    mockFetch([
      ['/etf-profile.html', text('<h1 id="etf-title">x</h1><i data-testid="etf-basics_"></i>')],
      ['/en/stock-profiles/', text(stockPage())],
    ]);
    expect(await fetchJustEtfClassification(STOCK_ISIN)).toMatchObject({
      kind: 'stock',
      isin: STOCK_ISIN,
      name: 'Apple',
      country: 'US',
      sector: 'technology',
      sectorWeights: [{ sector: 'technology', weight: 1 }],
      marketCap: '3,882,357 m',
    });
  });

  it('classe une action sans secteur par son seul pays', async () => {
    mockFetch([
      ['/etf-profile.html', text('')],
      ['/en/stock-profiles/', text(stockPage({ blocks: overviewBlock('Country', 'Japan') }))],
    ]);
    const c = await fetchJustEtfClassification('JP3633400001');
    expect(c).toMatchObject({ kind: 'stock', country: 'JP', sectorWeights: undefined });
  });

  it('mémorise aussi un échec (null) pour ne pas re-scraper', async () => {
    const calls = mockFetch([['justetf.com', text('')]]);
    expect(await fetchJustEtfClassification(STOCK_ISIN)).toBeNull();
    const n = calls.length;
    expect(await fetchJustEtfClassification(STOCK_ISIN)).toBeNull();
    expect(calls).toHaveLength(n);
    clearJustEtfCache();
    await fetchJustEtfClassification(STOCK_ISIN);
    expect(calls.length).toBeGreaterThan(n);
  });

  it('lève sans rien mémoriser quand JustETF est injoignable, puis réussit une fois revenu', async () => {
    mockFetch([['justetf.com', networkError('offline')]]);
    await expect(fetchJustEtfClassification(ETF_ISIN)).rejects.toBeInstanceOf(JustEtfUnavailableError);
    // Pas de `null` en cache : la panne passée, la classification aboutit.
    mockFetch([['/en/etf-profile.html', text(etfPage())]]);
    expect((await fetchJustEtfClassification(ETF_ISIN))?.kind).toBe('etf');
  });

  it('lève si la page ETF est injoignable, même quand la page action est absente', async () => {
    mockFetch([
      ['/etf-profile.html', text('', 503)],
      ['/stock-profiles/', text('', 404)],
    ]);
    await expect(fetchJustEtfClassification(STOCK_ISIN)).rejects.toThrow('JustETF injoignable : HTTP 503');
  });

  it('garde un résultat action trouvé malgré une page ETF injoignable', async () => {
    mockFetch([
      ['/etf-profile.html', text('', 503)],
      ['/en/stock-profiles/', text(stockPage())],
    ]);
    expect((await fetchJustEtfClassification(STOCK_ISIN))?.kind).toBe('stock');
  });

  it('considère un corps de réponse coupé en cours de lecture comme une panne', async () => {
    mockFetch([
      [
        'justetf.com',
        () =>
          ({
            ok: true,
            text: async () => {
              throw new Error('corps illisible');
            },
          }) as unknown as Response,
      ],
    ]);
    await expect(fetchJustEtfClassification(STOCK_ISIN)).rejects.toThrow('JustETF injoignable : corps illisible');
  });
});
