/** Tests unitaires du moteur d'analyse de titres et conseiller Gemini (`src/lib/aiCounsel.ts`). */
import { Platform } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAssetTelemetryContext,
  computeTechnicalAnalytics,
  deleteGeminiApiKey,
  fetchAssetData,
  fetchAvailableGeminiModels,
  generateGeminiInvestmentCounsel,
  getGeminiApiKey,
  isIsin,
  normalizeGeminiModel,
  parseGeminiResponse,
  searchMarketProducts,
  setGeminiApiKey,
  type AssetBundle,
  type PricePoint,
} from '@/lib/aiCounsel';
import { json, mockFetch, networkError } from './http';

function makePoints(count: number, startPrice = 100, step = 0.5): PricePoint[] {
  const baseMs = 1700000000000;
  return Array.from({ length: count }, (_, i) => {
    const close = Number((startPrice + i * step + Math.sin(i / 4) * 2).toFixed(2));
    return {
      timestamp: baseMs + i * 86400 * 1000,
      open: close - 0.5,
      high: close + 1.2,
      low: close - 1.1,
      close,
      volume: 1_000_000 + i * 1000,
      adjClose: close,
    };
  });
}

function makeYahooChartPayload(symbol = 'NVDA', count = 220, startPrice = 100, step = 0.5) {
  const pts = makePoints(count, startPrice, step);
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  return {
    chart: {
      result: [
        {
          meta: {
            symbol,
            shortName: symbol,
            longName: `${symbol} Corp`,
            currency: 'USD',
            fullExchangeName: 'NASDAQ',
            instrumentType: 'EQUITY',
            regularMarketPrice: last.close,
            chartPreviousClose: prev.close,
            regularMarketDayHigh: last.high,
            regularMarketDayLow: last.low,
            regularMarketVolume: last.volume,
            fiftyTwoWeekHigh: last.close + 10,
            fiftyTwoWeekLow: pts[0].low,
            regularMarketTime: Math.floor(last.timestamp / 1000),
            exchangeTimezoneName: 'America/New_York',
          },
          timestamp: pts.map((p) => Math.floor(p.timestamp / 1000)),
          indicators: {
            quote: [
              {
                open: pts.map((p) => p.open),
                high: pts.map((p) => p.high),
                low: pts.map((p) => p.low),
                close: pts.map((p) => p.close),
                volume: pts.map((p) => p.volume),
              },
            ],
            adjclose: [
              {
                adjclose: pts.map((p) => p.adjClose),
              },
            ],
          },
          events: {
            dividends: {
              d1: { amount: 1.5, date: Math.floor(last.timestamp / 1000) - 86400 },
            },
            splits: {
              s1: { date: Math.floor(last.timestamp / 1000) - 86400 * 30, numerator: 10, denominator: 1, splitRatio: '10:1' },
            },
          },
        },
      ],
    },
  };
}

function makeAssetBundle(overrides: Partial<AssetBundle> = {}): AssetBundle {
  const pts1Y = makePoints(220, 100, 0.5);
  const pts5Y = makePoints(260, 50, 0.6);
  const last = pts1Y[pts1Y.length - 1];
  const prev = pts1Y[pts1Y.length - 2];
  return {
    symbol: 'NVDA',
    shortName: 'NVIDIA',
    longName: 'NVIDIA Corp.',
    instrumentType: 'EQUITY',
    currency: 'USD',
    exchangeName: 'NASDAQ',
    sector: 'Technology',
    industry: 'Semiconductors',
    isin: 'US67066G1040',
    regularMarketPrice: last.close,
    previousClose: prev.close,
    regularMarketDayHigh: last.high,
    regularMarketDayLow: last.low,
    regularMarketVolume: last.volume,
    fiftyTwoWeekHigh: last.close + 10,
    fiftyTwoWeekLow: pts1Y[0].low,
    regularMarketTime: last.timestamp,
    timezone: 'America/New_York',
    charts: {
      '1D': pts1Y.slice(-10),
      '1W': pts1Y.slice(-20),
      '1M': pts1Y.slice(-30),
      '1Y': pts1Y,
      '5Y': pts5Y,
    },
    dividends: [{ amount: 1.2, date: Math.floor(last.timestamp / 1000) - 86400 * 10 }],
    splits: [],
    news: [
      {
        uuid: 'n1',
        title: 'NVIDIA rally continues after record AI growth and strong profit beat',
        publisher: 'CNBC',
        link: 'https://example.com/1',
        publishTime: last.timestamp,
        relatedTickers: ['NVDA'],
        thumbnail: null,
      },
    ],
    ...overrides,
  };
}

describe('aiCounsel — utilitaires ISIN, clé API et modèles Gemini', () => {
  beforeEach(async () => {
    await setGeminiApiKey('');
    delete process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Platform.OS = 'ios';
  });

  it('reconnaît un code ISIN valide et rejette un ticker ou texte libre', () => {
    expect(isIsin('FR0000121014')).toBe(true);
    expect(isIsin(' us67066g1040 ')).toBe(true);
    expect(isIsin('NVDA')).toBe(false);
    expect(isIsin('CW8.PA')).toBe(false);
  });

  it('normalise les identifiants de modèles Gemini', () => {
    expect(normalizeGeminiModel('')).toBe('gemini-3.6-flash');
    expect(normalizeGeminiModel(null)).toBe('gemini-3.6-flash');
    expect(normalizeGeminiModel('gemini-2.5-flash')).toBe('gemini-3.6-flash');
    expect(normalizeGeminiModel('gemini-2.0-flash')).toBe('gemini-3.6-flash');
    expect(normalizeGeminiModel('gemini-3.5-flash')).toBe('gemini-3.5-flash');
  });

  it('lit, enregistre et supprime la clé Gemini dans le stockage sécurisé', async () => {
    expect(await getGeminiApiKey()).toBe('');

    await setGeminiApiKey('  user-secret-key  ');
    expect(await getGeminiApiKey()).toBe('user-secret-key');

    await deleteGeminiApiKey();
    expect(await getGeminiApiKey()).toBe('');

    await setGeminiApiKey('key-2');
    expect(await getGeminiApiKey()).toBe('key-2');
    await setGeminiApiKey('');
    expect(await getGeminiApiKey()).toBe('');
  });

  it('récupère dynamiquement la liste des modèles Gemini compatibles generateContent', async () => {
    mockFetch([
      [
        'generativelanguage.googleapis.com/v1beta/models',
        json({
          models: [
            {
              name: 'models/gemini-3.6-flash',
              displayName: 'Gemini 3.6 Flash',
              supportedGenerationMethods: ['generateContent'],
            },
            {
              name: 'models/gemini-3.1-pro-preview',
              supportedGenerationMethods: ['generateContent'],
            },
            {
              name: 'models/gemini-embedding-001',
              displayName: 'Embedding',
              supportedGenerationMethods: ['embedContent'],
            },
            {
              name: 'models/gemini-2.5-flash-tts',
              displayName: 'TTS',
              supportedGenerationMethods: ['generateContent'],
            },
          ],
        }),
      ],
    ]);

    const models = await fetchAvailableGeminiModels('my-key');
    expect(models).toHaveLength(2);
    expect(models[0].id).toBe('gemini-3.6-flash');
    expect(models[1].label).toContain('[Paid Tier Only]');
  });

  it('retourne [] sans clé API et lève une erreur sur statut HTTP invalide', async () => {
    expect(await fetchAvailableGeminiModels('')).toEqual([]);
    mockFetch([['generativelanguage.googleapis.com/v1beta/models', json({ error: 'bad key' }, 403)]]);
    await expect(fetchAvailableGeminiModels('invalid-key')).rejects.toThrow(/403/);
  });
});

describe('aiCounsel — recherche Yahoo Finance et chargement des données de marché', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Platform.OS = 'ios';
  });

  it('recherche des produits par nom ou code ISIN et filtre les options non supportées', async () => {
    mockFetch([
      [
        'query2.finance.yahoo.com/v1/finance/search',
        json({
          quotes: [
            {
              symbol: 'MC.PA',
              longname: 'LVMH Moët Hennessy',
              exchDisp: 'Paris',
              quoteType: 'EQUITY',
              score: 100,
            },
            {
              symbol: 'OPT123',
              quoteType: 'OPTION',
            },
          ],
          news: [
            {
              uuid: 'n1',
              title: 'LVMH beats record profit',
              publisher: 'Reuters',
              link: 'https://example.com/1',
              providerPublishTime: 1700000000,
              relatedTickers: ['MC.PA'],
              thumbnail: { resolutions: [{ url: 'https://example.com/img.jpg' }] },
            },
          ],
        }),
      ],
    ]);

    expect(await searchMarketProducts('   ')).toEqual({ quotes: [], news: [], queryIsIsin: false });

    const res = await searchMarketProducts('FR0000121014');
    expect(res.queryIsIsin).toBe(true);
    expect(res.quotes).toHaveLength(1);
    expect(res.quotes[0]).toMatchObject({
      symbol: 'MC.PA',
      isin: 'FR0000121014',
      quoteType: 'EQUITY',
    });
    expect(res.news[0].thumbnail).toBe('https://example.com/img.jpg');
  });

  it('utilise les proxies Web (/__yahoo puis allorigins) sans appeler Yahoo en direct côté navigateur', async () => {
    Platform.OS = 'web';
    mockFetch([
      ['/__yahoo', new Response('<!DOCTYPE html><html></html>', { status: 200 })],
      [
        'api.allorigins.win',
        json({
          quotes: [{ symbol: 'AIR.PA', shortname: 'Airbus SE', quoteType: 'EQUITY', exchange: 'PAR' }],
          news: [],
        }),
      ],
    ]);

    const res = await searchMarketProducts('Airbus');
    expect(res.quotes).toHaveLength(1);
    expect(res.quotes[0].symbol).toBe('AIR.PA');
  });

  it('lève une erreur si tous les proxies Web échouent', async () => {
    Platform.OS = 'web';
    mockFetch([
      ['/__yahoo', json({ error: 'proxy down' }, 502)],
      ['api.allorigins.win', networkError('proxy 2 down')],
    ]);

    await expect(searchMarketProducts('Airbus')).rejects.toThrow();
  });

  it('charge l’historique multi-échelle, la quote, les dividendes et les actualités (avec résolution ISIN)', async () => {
    mockFetch([
      ['v8/finance/chart/MC.PA', json(makeYahooChartPayload('MC.PA', 220, 700, 0.4))],
      [
        'v1/finance/search',
        json({
          quotes: [{ symbol: 'MC.PA', longname: 'LVMH', quoteType: 'EQUITY' }],
          news: [
            {
              uuid: 'n1',
              title: 'LVMH beats record profit expectations',
              publisher: 'Reuters',
              link: 'https://example.com/1',
              providerPublishTime: 1700000000,
              relatedTickers: ['MC.PA'],
            },
          ],
        }),
      ],
    ]);

    const bundle = await fetchAssetData('FR0000121014', 'FR0000121014');
    expect(bundle.symbol).toBe('MC.PA');
    expect(bundle.isin).toBe('FR0000121014');
    expect(bundle.charts['1Y'].length).toBe(220);
    expect(bundle.dividends.length).toBe(1);
    expect(bundle.splits.length).toBe(1);
  });

  it('bascule sur la recherche par nom si le ticker initial échoue sur Yahoo Chart, et échoue si introuvable', async () => {
    mockFetch([
      ['v8/finance/chart/APPLE%20INC', json({ chart: { result: [] } }, 404)],
      [
        'v1/finance/search',
        json({
          quotes: [{ symbol: 'AAPL', longname: 'Apple Inc.', quoteType: 'EQUITY' }],
          news: [],
        }),
      ],
      [
        'v8/finance/chart/AAPL',
        json({
          chart: {
            result: [
              {
                meta: { symbol: 'AAPL' },
                timestamp: [1700000000, 1700086400, 1700172800],
                indicators: {
                  quote: [{ close: [null, 180, 182] }],
                },
              },
            ],
          },
        }),
      ],
    ]);

    const bundle = await fetchAssetData('Apple Inc');
    expect(bundle.symbol).toBe('AAPL');
    expect(bundle.charts['1Y'].length).toBe(2);

    await expect(fetchAssetData('   ')).rejects.toThrow();

    mockFetch([
      ['v8/finance/chart/NOPE', json({ chart: { result: [] } }, 404)],
      ['v1/finance/search', json({ quotes: [], news: [] })],
    ]);
    await expect(fetchAssetData('NOPE')).rejects.toThrow();
  });
});

describe('aiCounsel — analyse technique, score 7 facteurs et projections quantitatives', () => {
  it('calcule les moyennes mobiles, RSI, MACD, volatilité, pivots et projections 3M/6M/1Y (tendance haussière)', () => {
    const asset = makeAssetBundle();
    const tech = computeTechnicalAnalytics(asset, asset.regularMarketTime);
    expect(tech.sma20).not.toBeNull();
    expect(tech.sma50).not.toBeNull();
    expect(tech.sma200).not.toBeNull();
    expect(tech.ema20).not.toBeNull();
    expect(tech.sentimentScore).toBeGreaterThanOrEqual(55);
    expect(['BULLISH', 'STRONG BULLISH']).toContain(tech.sentimentRegime);
    expect(tech.signalBreakdown).toHaveLength(7);
    expect(tech.quantProjections['3M'].bullPrice).toBeGreaterThan(tech.quantProjections['3M'].bearPrice);
    expect(tech.futureCone.length).toBe(13);
    expect(tech.resistance2).toBeGreaterThan(tech.support2);
    expect(tech.trailingDividendYieldPct).toBeGreaterThan(0);

    // Vérifie le contexte de télémétrie dans les 3 langues
    expect(buildAssetTelemetryContext(asset, tech, { language: 'fr', userNotes: 'Focus dividende' })).toContain('FRENCH');
    expect(buildAssetTelemetryContext(asset, tech, { language: 'de' })).toContain('GERMAN');
    expect(buildAssetTelemetryContext(asset, tech, { language: 'en' })).toContain('Ticker Symbol: NVDA');
  });

  it('couvre un régime baissier, un historique court et les différents paliers de RSI', () => {
    const bearPts = makePoints(80, 200, -1.2);
    const last = bearPts[bearPts.length - 1];
    const bearAsset = makeAssetBundle({
      regularMarketPrice: last.close,
      previousClose: last.close + 2,
      fiftyTwoWeekHigh: 210,
      fiftyTwoWeekLow: last.low,
      charts: {
        '1D': bearPts.slice(-5),
        '1W': bearPts.slice(-10),
        '1M': bearPts.slice(-20),
        '1Y': bearPts,
        '5Y': bearPts.slice(0, 45),
      },
      news: [
        {
          uuid: '1',
          title: 'Profit warning, downgrade, lawsuit and slump crash shares',
          publisher: 'Reuters',
          link: 'https://example.com',
          publishTime: last.timestamp,
          relatedTickers: [],
          thumbnail: null,
        },
      ],
    });

    const tech = computeTechnicalAnalytics(bearAsset, last.timestamp);
    expect(tech.sentimentScore).toBeLessThan(50);
    expect(['BEARISH', 'STRONG BEARISH']).toContain(tech.sentimentRegime);
    expect(tech.trendDirection).toBe('DOWNTREND');

    const emptyAsset = makeAssetBundle({
      isin: null,
      sector: '',
      industry: '',
      regularMarketDayHigh: null,
      regularMarketDayLow: null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      charts: { '1D': [], '1W': [], '1M': [], '1Y': [], '5Y': [] },
      news: [],
      dividends: [],
    });
    const emptyTech = computeTechnicalAnalytics(emptyAsset);
    expect(emptyTech.sma20).toBeNull();
    expect(emptyTech.rsi14).toBe(50);
    expect(buildAssetTelemetryContext(emptyAsset, emptyTech)).toContain('Less than 5Y history');

    // Paliers RSI intermédiaires (53-68, 68-75, 30-45) et régimes BULLISH / BEARISH modérés
    const makeControlledRsiPts = (upStep: number, downStep: number) =>
      Array.from({ length: 60 }, (_, i) => {
        const prev = i === 0 ? 100 : 100 + i * (upStep - downStep);
        const close = prev + (i % 2 === 0 ? upStep : -downStep);
        return {
          timestamp: 1700000000000 + i * 86400000,
          open: close,
          high: close + 1,
          low: close - 1,
          close,
          volume: 1000,
          adjClose: close,
        };
      });

    // RSI ~ 60 (entre 53 et 68)
    const rsi60Pts = makeControlledRsiPts(1.5, 1.0);
    const rsi60Tech = computeTechnicalAnalytics(
      makeAssetBundle({
        regularMarketPrice: rsi60Pts.at(-1)!.close,
        charts: { '1D': rsi60Pts.slice(-5), '1W': rsi60Pts.slice(-10), '1M': rsi60Pts.slice(-20), '1Y': rsi60Pts, '5Y': [] },
        news: [{ uuid: 'n', title: 'Regular update', publisher: 'PR', link: 'https://x', publishTime: Date.now(), relatedTickers: [], thumbnail: null }],
      })
    );
    expect(rsi60Tech.rsi14).toBeGreaterThanOrEqual(53);
    expect(rsi60Tech.rsi14).toBeLessThanOrEqual(68);

    // RSI ~ 71 (entre 68 et 75)
    const rsi71Pts = makeControlledRsiPts(2.5, 1.0);
    const rsi71Tech = computeTechnicalAnalytics(
      makeAssetBundle({
        regularMarketPrice: rsi71Pts.at(-1)!.close,
        charts: { '1D': rsi71Pts.slice(-5), '1W': rsi71Pts.slice(-10), '1M': rsi71Pts.slice(-20), '1Y': rsi71Pts, '5Y': [] },
        news: [],
      })
    );
    expect(rsi71Tech.rsi14).toBeGreaterThan(68);
    expect(rsi71Tech.rsi14).toBeLessThanOrEqual(75);

    // RSI ~ 38 (entre 30 et 45)
    const rsi38Pts = makeControlledRsiPts(1.0, 1.6);
    const rsi38Tech = computeTechnicalAnalytics(
      makeAssetBundle({
        regularMarketPrice: rsi38Pts.at(-1)!.close,
        charts: { '1D': rsi38Pts.slice(-5), '1W': rsi38Pts.slice(-10), '1M': rsi38Pts.slice(-20), '1Y': rsi38Pts, '5Y': [] },
        news: [],
      })
    );
    expect(rsi38Tech.rsi14).toBeGreaterThanOrEqual(30);
    expect(rsi38Tech.rsi14).toBeLessThan(45);
  });
});

describe('aiCounsel — parsing et génération du rapport Gemini', () => {
  beforeEach(async () => {
    await setGeminiApiKey('test-gemini-key');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extrait le bloc JSON structuré (avec bloc ```json ou accolades brutes avant ## 1.) et le markdown', () => {
    const rawWithFence = `\`\`\`json
{
  "verdict": "ACCUMULATE",
  "confidenceScore": 78,
  "sentimentScore": 70,
  "sentimentLabel": "Constructive",
  "executiveThesis": "Dossier de qualité."
}
\`\`\`

## 1. Executive Thesis
Analyse détaillée du titre.`;

    const parsed = parseGeminiResponse(rawWithFence);
    expect(parsed.structured?.verdict).toBe('ACCUMULATE');
    expect(parsed.structured?.confidenceScore).toBe(78);
    expect(parsed.markdownReport).toContain('## 1. Executive Thesis');

    const rawWithoutFence = `{"verdict":"HOLD","confidenceScore":50}\n\n## 1. Executive Thesis\nTexte libre.`;
    const parsed2 = parseGeminiResponse(rawWithoutFence);
    expect(parsed2.structured?.verdict).toBe('HOLD');
    expect(parsed2.markdownReport).toContain('## 1. Executive Thesis');

    const malformed = `\`\`\`json\n{invalid json}\n\`\`\`\nTexte uniquement.`;
    const parsed3 = parseGeminiResponse(malformed);
    expect(parsed3.structured).toBeNull();
    expect(parsed3.markdownReport).toContain('Texte uniquement.');
  });

  it('appelle Gemini REST et bascule sur un modèle de secours en cas d’erreur 429/404 ou réponse vide', async () => {
    const asset = makeAssetBundle({ symbol: 'AIR.PA' });
    const tech = computeTechnicalAnalytics(asset);

    mockFetch([
      [
        'models/gemini-3.8-flash:generateContent',
        json({ error: { message: 'Quota exceeded (429)' } }, 429),
      ],
      [
        'models/gemini-3.6-flash:generateContent',
        json({ candidates: [{ content: { parts: [] }, finishReason: 'STOP' }] }),
      ],
      [
        'models/gemini-3.5-flash:generateContent',
        json({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '```json\n{"verdict":"BUY","confidenceScore":82}\n```\n\n## 1. Executive Thesis\nCarnet plein.',
                  },
                ],
              },
              groundingMetadata: {
                groundingChunks: [
                  { web: { title: 'Airbus IR', uri: 'https://www.airbus.com' } },
                  { web: { title: 'Airbus IR', uri: 'https://www.airbus.com' } },
                ],
              },
            },
          ],
        }),
      ],
    ]);

    const report = await generateGeminiInvestmentCounsel(asset, tech, {
      model: 'gemini-3.8-flash',
      customSystemPreprompt: 'Use your Google Search tool',
      language: 'fr',
    });

    expect(report.model).toBe('gemini-3.5-flash (fallback)');
    expect(report.structured?.verdict).toBe('BUY');
    expect(report.groundingSources).toEqual([{ title: 'Airbus IR', uri: 'https://www.airbus.com' }]);
  });

  it('lève une erreur explicite si aucune clé API n’est configurée ou sur erreur non-fallback (400)', async () => {
    const asset = makeAssetBundle();
    const tech = computeTechnicalAnalytics(asset);

    mockFetch([
      [
        'models/gemini-3.6-flash:generateContent',
        json({ error: { message: 'Invalid argument' } }, 400),
      ],
    ]);
    await expect(generateGeminiInvestmentCounsel(asset, tech)).rejects.toThrow(/Invalid argument/);

    await setGeminiApiKey('');
    delete process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    await expect(generateGeminiInvestmentCounsel(asset, tech, { apiKey: '' })).rejects.toThrow();

    await setGeminiApiKey('test-key');
    mockFetch([
      ['generativelanguage.googleapis.com', json({ error: { message: '503 Service Unavailable' } }, 503)],
    ]);
    await expect(generateGeminiInvestmentCounsel(asset, tech)).rejects.toThrow(/503/);
  });
});
