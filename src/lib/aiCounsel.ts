/**
 * InvestCounsel AI — Analyse technique multi-échelle, cône de projection statistique
 * et comité d'investissement institutionnel Gemini pour actions, ETF et fonds.
 */
import { Platform } from 'react-native';
import { logDebug } from './debugLog';
import i18next from './i18n';
import { deleteSecret, GEMINI_SECRET_KEY, getSecret, setSecret } from './secure';

const TAG = 'aiCounsel';
const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

export const GEMINI_API_KEY_SECRET = GEMINI_SECRET_KEY;

export type TimeframeKey = '1D' | '1W' | '1M' | '1Y' | '5Y';

export const TIMEFRAMES: readonly TimeframeKey[] = ['1D', '1W', '1M', '1Y', '5Y'] as const;

export interface PricePoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose: number;
}

export interface SearchQuote {
  symbol: string;
  shortName: string;
  longName: string;
  quoteType: string;
  typeDisplay: string;
  exchange: string;
  sector: string;
  industry: string;
  isin: string | null;
  score: number;
}

export interface NewsItem {
  uuid: string;
  title: string;
  publisher: string;
  link: string;
  publishTime: number;
  relatedTickers: string[];
  thumbnail: string | null;
}

export interface DividendEvent {
  amount: number;
  date: number;
}

export interface SplitEvent {
  date: number;
  numerator: number;
  denominator: number;
  splitRatio: string;
}

export interface AssetBundle {
  symbol: string;
  shortName: string;
  longName: string;
  instrumentType: string;
  currency: string;
  exchangeName: string;
  sector: string;
  industry: string;
  isin: string | null;
  regularMarketPrice: number;
  previousClose: number;
  regularMarketDayHigh: number | null;
  regularMarketDayLow: number | null;
  regularMarketVolume: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  regularMarketTime: number;
  timezone: string;
  charts: Record<TimeframeKey, PricePoint[]>;
  dividends: DividendEvent[];
  splits: SplitEvent[];
  news: NewsItem[];
}

export interface SignalFactor {
  factor: string;
  signal: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
  detail: string;
  scoreContribution: number;
}

export interface PriceProjectionScenario {
  horizonLabel: string;
  months: number;
  bearPrice: number;
  basePrice: number;
  bullPrice: number;
  bearChangePct: number;
  baseChangePct: number;
  bullChangePct: number;
}

export interface FutureConePoint {
  timestamp: number;
  label: string;
  bear: number;
  base: number;
  bull: number;
}

export interface TechnicalAnalytics {
  return1D: number;
  return1W: number;
  return1M: number;
  return3M: number;
  return6M: number;
  return1Y: number;
  return5Y: number | null;
  cagr5Y: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema20: number | null;
  priceVsSma200Pct: number | null;
  goldenCross: boolean | null;
  rsi14: number;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  annualizedVolatilityPct: number;
  maxDrawdown1YPct: number;
  maxDrawdown5YPct: number;
  atr14: number;
  bollingerUpper: number;
  bollingerLower: number;
  sharpeEstimate: number;
  fiftyTwoWeekPositionPct: number;
  trailingDividendYieldPct: number;
  trailingAnnualDividend: number;
  support1: number;
  support2: number;
  resistance1: number;
  resistance2: number;
  sentimentScore: number; // 0 to 100
  sentimentRegime:
    | 'STRONG BULLISH'
    | 'BULLISH'
    | 'NEUTRAL / CONSOLIDATING'
    | 'BEARISH'
    | 'STRONG BEARISH';
  trendDirection: 'UPTREND' | 'SIDEWAYS' | 'DOWNTREND';
  signalBreakdown: SignalFactor[];
  quantProjections: {
    '3M': PriceProjectionScenario;
    '6M': PriceProjectionScenario;
    '1Y': PriceProjectionScenario;
  };
  futureCone: FutureConePoint[];
}

export interface GeminiScenarioTarget {
  bear: number;
  base: number;
  bull: number;
  bearProb?: number;
  baseProb?: number;
  bullProb?: number;
  expectedPrice?: number;
  rationale?: string;
}

export interface GeminiStructuredAssessment {
  verdict: 'STRONG BUY' | 'BUY' | 'ACCUMULATE' | 'HOLD' | 'REDUCE' | 'SELL';
  confidenceScore: number;
  sentimentScore: number;
  sentimentLabel: string;
  executiveThesis: string;
  intrinsicValueEstimate: {
    low: number;
    fair: number;
    high: number;
    valuationStatus: 'UNDERVALUED' | 'FAIRLY VALUED' | 'OVERVALUED';
    methodology: string;
  };
  valuationMultiples: {
    trailingPE: string;
    forwardPE: string;
    pegOrEvEbitda: string;
    priceToBookOrSales: string;
    dividendOrExpenseRatio: string;
    historicalComparison: string;
  };
  priceTargets: {
    threeMonth: GeminiScenarioTarget;
    twelveMonth: GeminiScenarioTarget;
    threeYear: GeminiScenarioTarget;
  };
  factorScores: {
    valuation: number;
    fundamentals: number;
    technicals: number;
    macroResilience: number;
    geopoliticalSafety: number;
    momentum: number;
  };
  geopoliticalAssessment: {
    riskLevel: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL';
    conflictAndWarImpact: string;
    supplyChainAndTradeExposure: string;
    regionalMacroSensitivity: string;
  };
  keyCatalysts: string[];
  keyRisks: string[];
  tradeAndPositioning: {
    idealEntryZone: string;
    invalidationStopLoss: string;
    takeProfitTargets: string;
    recommendedHorizon: string;
    portfolioAllocationGuidance: string;
  };
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface GeminiCounselReport {
  symbol: string;
  generatedAt: number;
  model: string;
  structured: GeminiStructuredAssessment | null;
  markdownReport: string;
  groundingSources: GroundingSource[];
}

export type CounselHorizon = 'SHORT_TERM' | 'MEDIUM_TERM' | 'LONG_TERM';
export type CounselRiskProfile = 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE';

export interface CounselRequestOptions {
  horizon?: CounselHorizon;
  riskProfile?: CounselRiskProfile;
  userNotes?: string;
  customSystemPreprompt?: string;
  model?: string;
  apiKey?: string;
  language?: string;
}

export interface WatchlistEntry {
  symbol: string;
  name: string;
  isin?: string | null;
  type: string;
}

export interface CuratedPreset {
  symbol: string;
  name: string;
  isin: string;
  type: 'EQUITY' | 'ETF';
  region: string;
}

export const KNOWN_ISIN_MAP: Record<string, string> = {
  AAPL: 'US0378331005',
  NVDA: 'US67066G1040',
  MSFT: 'US5949181045',
  AMZN: 'US0231351067',
  GOOGL: 'US02079K3059',
  GOOG: 'US02079K1079',
  META: 'US30303M1027',
  TSLA: 'US88160R1014',
  'BRK-B': 'US0846707026',
  AVGO: 'US11135F1012',
  LLY: 'US5324571083',
  JPM: 'US46625H1005',
  V: 'US92826C8394',
  WMT: 'US9311421039',
  XOM: 'US30231G1022',
  SPY: 'US78462F1030',
  VOO: 'US9229083632',
  QQQ: 'US46090E1038',
  VTI: 'US9229087690',
  IVV: 'US4642872000',
  GLD: 'US78463V1070',
  TLT: 'US4642874329',
  SMH: 'US92189F1066',
  'IWDA.L': 'IE00B4L5Y983',
  'VWCE.DE': 'IE00BK5BQT80',
  'VUAA.L': 'IE00BFMXXD54',
  'CSPX.L': 'IE00B5BMR087',
  'CW8.PA': 'LU1681043599',
  'WPEA.PA': 'IE0002XZSHO1',
  'MC.PA': 'FR0000121014',
  'OR.PA': 'FR0000120321',
  'TTE.PA': 'FR0000120271',
  'AIR.PA': 'NL0000235190',
  'SAN.PA': 'FR0000120578',
  'ASML.AS': 'NL0010273215',
  ASML: 'USN070592100',
  'SAP.DE': 'DE0007164600',
};

export const POPULAR_PRESETS: CuratedPreset[] = [
  { symbol: 'NVDA', name: 'NVIDIA Corp.', isin: 'US67066G1040', type: 'EQUITY', region: 'US' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', isin: 'US78462F1030', type: 'ETF', region: 'US' },
  { symbol: 'QQQ', name: 'Invesco QQQ (Nasdaq-100)', isin: 'US46090E1038', type: 'ETF', region: 'US' },
  { symbol: 'AAPL', name: 'Apple Inc.', isin: 'US0378331005', type: 'EQUITY', region: 'US' },
  { symbol: 'MSFT', name: 'Microsoft Corp.', isin: 'US5949181045', type: 'EQUITY', region: 'US' },
  { symbol: 'IWDA.L', name: 'iShares Core MSCI World UCITS', isin: 'IE00B4L5Y983', type: 'ETF', region: 'EU/Global' },
  { symbol: 'CW8.PA', name: 'Amundi MSCI World UCITS ETF', isin: 'LU1681043599', type: 'ETF', region: 'EU/PEA' },
  { symbol: 'MC.PA', name: 'LVMH Moët Hennessy', isin: 'FR0000121014', type: 'EQUITY', region: 'EU' },
  { symbol: 'ASML', name: 'ASML Holding N.V.', isin: 'USN070592100', type: 'EQUITY', region: 'EU/US' },
  { symbol: 'GLD', name: 'SPDR Gold Shares ETF', isin: 'US78463V1070', type: 'ETF', region: 'Commodity' },
];

export const DEFAULT_WATCHLIST: WatchlistEntry[] = [
  { symbol: 'NVDA', name: 'NVIDIA Corp.', isin: 'US67066G1040', type: 'EQUITY' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', isin: 'US78462F1030', type: 'ETF' },
  { symbol: 'IWDA.L', name: 'iShares Core MSCI World', isin: 'IE00B4L5Y983', type: 'ETF' },
  { symbol: 'MC.PA', name: 'LVMH Moët Hennessy', isin: 'FR0000121014', type: 'EQUITY' },
];

const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i;

export function isIsin(query: string): boolean {
  return ISIN_REGEX.test(query.trim());
}

// ─── Gestion de la clé API Gemini et des modèles ─────────────────────────────

export interface GeminiModelOption {
  id: string;
  label: string;
  group: string;
}

export const DEFAULT_GEMINI_MODELS: GeminiModelOption[] = [
  {
    id: 'gemini-3.6-flash',
    label: 'Gemini 3.6 Flash — Recommended (Active Quota)',
    group: 'Active Free-Tier Quota',
  },
  {
    id: 'gemini-3.5-flash',
    label: 'Gemini 3.5 Flash — Fast Institutional Reasoning',
    group: 'Active Free-Tier Quota',
  },
  {
    id: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash-Lite — Ultra-Fast & High Quota',
    group: 'Active Free-Tier Quota',
  },
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3.0 Flash Preview',
    group: 'Active Free-Tier Quota',
  },
  {
    id: 'gemini-flash-lite-latest',
    label: 'Gemini Flash-Lite Latest',
    group: 'Active Free-Tier Quota',
  },
  {
    id: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash (Auto-fallback to 3.6 Flash if busy)',
    group: 'Gemini 3.8 & 3.7 Series',
  },
  {
    id: 'gemini-3.7-flash',
    label: 'Gemini 3.7 Flash (Auto-fallback to 3.6 Flash if busy)',
    group: 'Gemini 3.8 & 3.7 Series',
  },
  {
    id: 'gemini-4-argon',
    label: 'Gemini 4 Argon (Paid Tier / Auto-fallback)',
    group: 'Gemini 4 & Pro Series',
  },
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro Preview (Paid Tier / Auto-fallback)',
    group: 'Gemini 4 & Pro Series',
  },
  {
    id: 'gemini-pro-latest',
    label: 'Gemini Pro Latest (Paid Tier / Auto-fallback)',
    group: 'Gemini 4 & Pro Series',
  },
];

const DEPRECATED_MODELS = new Set([
  'gemini-4.0-pro',
  'gemini-4.0-flash',
  'gemini-3.8-pro',
  'gemini-3.7-pro',
  'gemini-3.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
]);

export function normalizeGeminiModel(model?: string | null): string {
  const clean = model?.trim();
  if (!clean || DEPRECATED_MODELS.has(clean)) {
    return 'gemini-3.6-flash';
  }
  return clean;
}

export async function getGeminiApiKey(): Promise<string> {
  const stored = await getSecret(GEMINI_SECRET_KEY);
  return stored ? stored.trim() : '';
}

export async function setGeminiApiKey(key: string): Promise<void> {
  const clean = key.trim();
  if (clean) {
    await setSecret(GEMINI_SECRET_KEY, clean);
  } else {
    await deleteSecret(GEMINI_SECRET_KEY);
  }
}

export async function deleteGeminiApiKey(): Promise<void> {
  await deleteSecret(GEMINI_SECRET_KEY);
}

export async function fetchAvailableGeminiModels(apiKey?: string): Promise<GeminiModelOption[]> {
  const key = (apiKey ?? (await getGeminiApiKey())).trim();
  if (!key) return [];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${encodeURIComponent(key)}`
  );
  if (!res.ok) {
    throw new Error(i18next.t('errors.http_pour', { source: 'Gemini', status: res.status, target: 'models' }));
  }
  const data: any = await res.json();
  const models: GeminiModelOption[] = (data.models || [])
    .filter((m: any) => {
      const methods: string[] = m.supportedGenerationMethods || [];
      const id = String(m.name || '').replace(/^models\//, '');
      return (
        methods.includes('generateContent') &&
        id.startsWith('gemini') &&
        !id.includes('tts') &&
        !id.includes('image') &&
        !id.includes('embedding') &&
        !id.includes('vision') &&
        !id.includes('aqa')
      );
    })
    .map((m: any) => {
      const id = String(m.name || '').replace(/^models\//, '');
      const isPaidPro = id.startsWith('gemini-3.1-pro');
      const display = m.displayName ? `${m.displayName} (${id})` : id;
      return {
        id,
        label: isPaidPro ? `${display} [Paid Tier Only]` : display,
        group: 'Live Models on Your API Key',
      };
    })
    .sort((a: GeminiModelOption, b: GeminiModelOption) => b.id.localeCompare(a.id));

  return models;
}

// ─── Yahoo Finance Market Data & Multi-Timeframe Fetch ───────────────────────

async function fetchYahooJson(url: string): Promise<any> {
  logDebug(TAG, `GET ${url}`);
  if (Platform.OS !== 'web') {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  }

  // Sur le Web, un appel direct à query1/query2.finance.yahoo.com est bloqué par CORS
  // dans le navigateur : on passe par le proxy local `/__yahoo` (servi par `metro.config.js`
  // et `electron/main.js`, ou le port compagnon local 8082), puis en repli par allorigins.
  const webProxies = [
    `/__yahoo?url=${encodeURIComponent(url)}`,
    `http://localhost:8082/__yahoo?url=${encodeURIComponent(url)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  ];

  let lastErr: any;
  for (const proxyUrl of webProxies) {
    try {
      logDebug(TAG, `GET (web proxy) ${proxyUrl}`);
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
      const text = await res.text();
      if (text.trimStart().startsWith('<')) {
        throw new Error('SPA HTML fallback instead of JSON');
      }
      return JSON.parse(text);
    } catch (pErr) {
      lastErr = pErr;
    }
  }
  throw lastErr;
}

export async function searchMarketProducts(query: string): Promise<{
  quotes: SearchQuote[];
  news: NewsItem[];
  queryIsIsin: boolean;
}> {
  const clean = query.trim();
  if (!clean) {
    return { quotes: [], news: [], queryIsIsin: false };
  }

  const queryIsIsin = isIsin(clean);
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    clean
  )}&quotesCount=12&newsCount=10&enableFuzzyQuery=false`;
  const data = await fetchYahooJson(url);
  const allowedTypes = new Set(['EQUITY', 'ETF', 'MUTUALFUND', 'INDEX', 'FUTURE']);

  const quotes: SearchQuote[] = (data?.quotes ?? [])
    .filter((q: any) => q?.symbol && (!q.quoteType || allowedTypes.has(q.quoteType)))
    .map((q: any) => {
      const sym = String(q.symbol);
      const upperSym = sym.toUpperCase();
      const label = q.longname ?? q.shortname ?? sym;
      return {
        symbol: sym,
        shortName: q.shortname ?? label,
        longName: label,
        quoteType: q.quoteType ?? 'EQUITY',
        typeDisplay: q.typeDisp ?? 'Equity',
        exchange: q.exchDisp ?? q.exchange ?? '',
        sector: q.sectorDisp ?? '',
        industry: q.industryDisp ?? '',
        isin: queryIsIsin ? clean.toUpperCase() : KNOWN_ISIN_MAP[upperSym] ?? null,
        score: q.score ?? 0,
      };
    });

  const news: NewsItem[] = (data?.news ?? []).map((n: any, idx: number) => ({
    uuid: n.uuid ?? String(idx),
    title: n.title ?? '',
    publisher: n.publisher ?? '',
    link: n.link ?? '',
    publishTime: n.providerPublishTime ? n.providerPublishTime * 1000 : Date.now(),
    relatedTickers: Array.isArray(n.relatedTickers) ? n.relatedTickers : [],
    thumbnail: n.thumbnail?.resolutions?.[0]?.url ?? null,
  }));

  return { quotes, news, queryIsIsin };
}

export async function fetchAssetData(symbolOrQuery: string, isin?: string | null): Promise<AssetBundle> {
  let cleanSymbol = symbolOrQuery.trim();
  const cleanIsin = isin?.trim().toUpperCase() || (isIsin(cleanSymbol) ? cleanSymbol.toUpperCase() : null);

  // Si l'entrée est un ISIN (ou vide mais avec ISIN fourni), on résout d'abord le ticker Yahoo.
  if ((!cleanSymbol || isIsin(cleanSymbol)) && cleanIsin) {
    const searchRes = await searchMarketProducts(cleanIsin).catch(() => ({
      quotes: [],
      news: [],
      queryIsIsin: true,
    }));
    if (searchRes.quotes.length > 0) {
      cleanSymbol = searchRes.quotes[0].symbol;
    }
  }

  cleanSymbol = cleanSymbol.toUpperCase();
  if (!cleanSymbol) {
    throw new Error(i18next.t('errors.donnees_invalides'));
  }

  const timeframes: Array<{ key: TimeframeKey; range: string; interval: string; events: boolean }> = [
    { key: '1D', range: '1d', interval: '5m', events: false },
    { key: '1W', range: '5d', interval: '15m', events: false },
    { key: '1M', range: '1mo', interval: '1d', events: false },
    { key: '1Y', range: '1y', interval: '1d', events: true },
    { key: '5Y', range: '5y', interval: '1wk', events: true },
  ];

  const loadForSymbol = async (sym: string) => {
    const [searchData, ...chartResponses] = await Promise.all([
      searchMarketProducts(sym).catch(() => ({ quotes: [], news: [], queryIsIsin: false })),
      ...timeframes.map((tf) =>
        fetchYahooJson(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
            sym
          )}?range=${tf.range}&interval=${tf.interval}${tf.events ? '&events=div%7Csplit' : ''}`
        ).catch(() => null)
      ),
    ]);
    return { searchData, chartResponses };
  };

  let { searchData, chartResponses } = await loadForSymbol(cleanSymbol);

  // Si aucune courbe n'a abouti (ex: un nom de fonds ou d'action a été passé au lieu d'un ticker),
  // on tente de résoudre via le premier résultat de recherche Yahoo (ISIN ou nom).
  const hasAnyChart = chartResponses.some((r) => (r?.chart?.result?.[0]?.timestamp?.length ?? 0) > 0);
  if (!hasAnyChart) {
    const fallbackQuery = cleanIsin || symbolOrQuery.trim();
    const resolved =
      searchData.quotes.length > 0
        ? searchData
        : await searchMarketProducts(fallbackQuery).catch(() => ({ quotes: [], news: [], queryIsIsin: false }));
    const topQuote = resolved.quotes[0];
    if (topQuote && topQuote.symbol.toUpperCase() !== cleanSymbol) {
      cleanSymbol = topQuote.symbol.toUpperCase();
      ({ searchData, chartResponses } = await loadForSymbol(cleanSymbol));
    }
  }

  const charts: Record<TimeframeKey, PricePoint[]> = {
    '1D': [],
    '1W': [],
    '1M': [],
    '1Y': [],
    '5Y': [],
  };

  let primaryMeta: any = {};
  let dividendsMap: Record<string, any> = {};
  let splitsMap: Record<string, any> = {};

  timeframes.forEach((tf, idx) => {
    const raw = chartResponses[idx];
    const result = raw?.chart?.result?.[0];
    if (!result) return;

    if (result.meta && (!primaryMeta.symbol || tf.key === '1Y')) {
      primaryMeta = { ...primaryMeta, ...result.meta };
    }

    const timestamps: number[] = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const adjclose = result.indicators?.adjclose?.[0]?.adjclose || [];
    const pts: PricePoint[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const close = quote.close?.[i];
      if (close === null || close === undefined || Number.isNaN(close)) continue;
      pts.push({
        timestamp: timestamps[i] * 1000,
        open: quote.open?.[i] ?? close,
        high: quote.high?.[i] ?? close,
        low: quote.low?.[i] ?? close,
        close,
        volume: quote.volume?.[i] ?? 0,
        adjClose: adjclose[i] ?? close,
      });
    }
    charts[tf.key] = pts;

    if (result.events?.dividends) {
      dividendsMap = { ...dividendsMap, ...result.events.dividends };
    }
    if (result.events?.splits) {
      splitsMap = { ...splitsMap, ...result.events.splits };
    }
  });

  if (!primaryMeta.symbol && charts['1Y'].length === 0 && charts['1D'].length === 0) {
    throw new Error(i18next.t('errors.cours_introuvable', { symbol: symbolOrQuery.trim() }));
  }

  const matchedQuote: Partial<SearchQuote> =
    searchData.quotes.find((q) => q.symbol.toUpperCase() === cleanSymbol) ??
    searchData.quotes[0] ??
    {};

  const spotPrice =
    primaryMeta.regularMarketPrice ??
    charts['1Y'].at(-1)?.close ??
    0;

  return {
    symbol: primaryMeta.symbol ?? cleanSymbol,
    shortName: primaryMeta.shortName ?? cleanSymbol,
    longName: primaryMeta.longName ?? matchedQuote.longName ?? cleanSymbol,
    instrumentType: primaryMeta.instrumentType ?? 'EQUITY',
    currency: primaryMeta.currency ?? 'USD',
    exchangeName: primaryMeta.fullExchangeName ?? matchedQuote.exchange ?? '',
    sector: matchedQuote.sector ?? '',
    industry: matchedQuote.industry ?? '',
    isin: cleanIsin ?? matchedQuote.isin ?? KNOWN_ISIN_MAP[cleanSymbol] ?? null,
    regularMarketPrice: spotPrice,
    previousClose: primaryMeta.chartPreviousClose ?? spotPrice,
    regularMarketDayHigh: primaryMeta.regularMarketDayHigh ?? null,
    regularMarketDayLow: primaryMeta.regularMarketDayLow ?? null,
    regularMarketVolume: primaryMeta.regularMarketVolume ?? null,
    fiftyTwoWeekHigh: primaryMeta.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: primaryMeta.fiftyTwoWeekLow ?? null,
    regularMarketTime: primaryMeta.regularMarketTime
      ? primaryMeta.regularMarketTime * 1000
      : Date.now(),
    timezone: primaryMeta.exchangeTimezoneName ?? 'UTC',
    charts,
    dividends: Object.values(dividendsMap),
    splits: Object.values(splitsMap),
    news: searchData.news,
  };
}

// ─── Analyse Technique & Cône de Projection Quantitatif ─────────────────────

function calcSMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const sum = slice.reduce((acc, v) => acc + v, 0);
  return sum / period;
}

function calcEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    ema.push(values[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length <= period) return 50;
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcMACD(closes: number[]): {
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
} {
  if (closes.length < 26) {
    return { macdLine: 0, macdSignal: 0, macdHistogram: 0 };
  }
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdSeries = closes.map((_, i) => ema12[i] - ema26[i]);
  const signalSeries = calcEMA(macdSeries, 9);
  const macdLine = macdSeries.at(-1) ?? 0;
  const macdSignal = signalSeries.at(-1) ?? 0;
  return {
    macdLine,
    macdSignal,
    macdHistogram: macdLine - macdSignal,
  };
}

function calcMaxDrawdownPct(points: PricePoint[]): number {
  if (points.length < 2) return 0;
  let peak = points[0].close;
  let maxDd = 0;
  for (const pt of points) {
    if (pt.close > peak) peak = pt.close;
    const dd = peak > 0 ? ((pt.close - peak) / peak) * 100 : 0;
    if (dd < maxDd) maxDd = dd;
  }
  return maxDd;
}

function calcATR(points: PricePoint[], period = 14): number {
  if (points.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const cur = points[i];
    const prevClose = points[i - 1].close;
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prevClose),
      Math.abs(cur.low - prevClose)
    );
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  if (slice.length === 0) return 0;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function scoreNewsHeadlines(titles: string[]): { score: number; summary: string } {
  if (titles.length === 0) return { score: 0, summary: 'Neutral news flow' };
  const bullishWords = [
    'surge',
    'soar',
    'beat',
    'upgrade',
    'buy',
    'bull',
    'record',
    'growth',
    'rally',
    'outperform',
    'strong',
    'gain',
    'profit',
    'breakthrough',
    'dividend',
    'raise',
  ];
  const bearishWords = [
    'plunge',
    'drop',
    'miss',
    'downgrade',
    'sell',
    'bear',
    'crash',
    'lawsuit',
    'investigation',
    'cut',
    'weak',
    'loss',
    'warn',
    'slump',
    'tariff',
    'sanction',
    'war',
    'risk',
    'fall',
  ];

  let net = 0;
  for (const rawTitle of titles) {
    const lower = rawTitle.toLowerCase();
    for (const w of bullishWords) {
      if (lower.includes(w)) net += 1;
    }
    for (const w of bearishWords) {
      if (lower.includes(w)) net -= 1;
    }
  }

  const clamped = Math.max(-6, Math.min(6, net));
  const summary =
    clamped >= 2
      ? `Positive media & analyst tone (+${clamped} net bullish headlines)`
      : clamped <= -2
        ? `Cautious/negative headline tone (${clamped} net bearish headlines)`
        : 'Balanced / neutral recent news headlines';

  return { score: clamped, summary };
}

export function computeTechnicalAnalytics(
  asset: AssetBundle,
  nowMs: number = Date.now()
): TechnicalAnalytics {
  const daily = asset.charts['1Y'];
  const weekly5Y = asset.charts['5Y'];
  const intraday1D = asset.charts['1D'];
  const week1W = asset.charts['1W'];
  const month1M = asset.charts['1M'];

  const closes = daily.map((p) => p.close);
  const currentPrice =
    asset.regularMarketPrice || closes.at(-1) || intraday1D.at(-1)?.close || 100;
  const prevClose =
    asset.previousClose || (closes.length > 1 ? closes[closes.length - 2] : currentPrice);

  const pctChange = (from: number | undefined, to: number) =>
    from && from > 0 ? ((to - from) / from) * 100 : 0;

  const return1D = pctChange(prevClose, currentPrice);
  const return1W = pctChange(
    week1W[0]?.close ?? closes[Math.max(0, closes.length - 6)],
    currentPrice
  );
  const return1M = pctChange(
    month1M[0]?.close ?? closes[Math.max(0, closes.length - 22)],
    currentPrice
  );
  const return3M = pctChange(closes[Math.max(0, closes.length - 63)], currentPrice);
  const return6M = pctChange(closes[Math.max(0, closes.length - 126)], currentPrice);
  const return1Y = pctChange(closes[0], currentPrice);

  const first5Y = weekly5Y[0]?.close;
  const return5Y = first5Y && first5Y > 0 ? pctChange(first5Y, currentPrice) : null;
  const yearsSpan =
    weekly5Y.length > 10
      ? Math.max(
          1,
          (weekly5Y.at(-1)!.timestamp - weekly5Y[0].timestamp) / (365.25 * 24 * 3600 * 1000)
        )
      : 5;
  const cagr5Y =
    first5Y && first5Y > 0
      ? (Math.pow(currentPrice / first5Y, 1 / yearsSpan) - 1) * 100
      : null;

  const sma20 = calcSMA(closes, 20);
  const sma50 = calcSMA(closes, 50);
  const sma200 =
    calcSMA(closes, 200) ??
    (weekly5Y.length >= 40
      ? calcSMA(
          weekly5Y.map((p) => p.close),
          40
        )
      : null);
  const ema20Series = calcEMA(closes, 20);
  const ema20 = ema20Series.at(-1) ?? null;

  const priceVsSma200Pct =
    sma200 && sma200 > 0 ? ((currentPrice - sma200) / sma200) * 100 : null;
  const goldenCross = sma50 !== null && sma200 !== null ? sma50 > sma200 : null;

  const rsi14 = calcRSI(closes, 14);
  const { macdLine, macdSignal, macdHistogram } = calcMACD(closes);

  // Daily log returns for annualized volatility
  const logReturns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > 0 && closes[i - 1] > 0) {
      logReturns.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  const meanReturn =
    logReturns.length > 0 ? logReturns.reduce((a, b) => a + b, 0) / logReturns.length : 0;
  const variance =
    logReturns.length > 1
      ? logReturns.reduce((acc, r) => acc + Math.pow(r - meanReturn, 2), 0) /
        (logReturns.length - 1)
      : 0.0002;
  const dailyVol = Math.sqrt(variance);
  const annualizedVolatilityPct = dailyVol * Math.sqrt(252) * 100;

  // Bollinger Bands (20, 2)
  const recent20 = closes.slice(-20);
  const mean20 = sma20 ?? currentPrice;
  const std20 =
    recent20.length > 1
      ? Math.sqrt(
          recent20.reduce((acc, c) => acc + Math.pow(c - mean20, 2), 0) / recent20.length
        )
      : currentPrice * 0.02;
  const bollingerUpper = mean20 + 2 * std20;
  const bollingerLower = Math.max(0.01, mean20 - 2 * std20);

  const maxDrawdown1YPct = calcMaxDrawdownPct(daily);
  const maxDrawdown5YPct = calcMaxDrawdownPct(weekly5Y.length > 0 ? weekly5Y : daily);
  const atr14 = calcATR(daily, 14);

  const riskFreeRate = 4.1;
  const sharpeEstimate =
    annualizedVolatilityPct > 0
      ? (return1Y - riskFreeRate) / annualizedVolatilityPct
      : 0;

  const high52 =
    asset.fiftyTwoWeekHigh ?? (closes.length > 0 ? Math.max(...closes) : currentPrice * 1.1);
  const low52 =
    asset.fiftyTwoWeekLow ?? (closes.length > 0 ? Math.min(...closes) : currentPrice * 0.9);
  const fiftyTwoWeekPositionPct =
    high52 > low52
      ? Math.max(0, Math.min(100, ((currentPrice - low52) / (high52 - low52)) * 100))
      : 50;

  // Trailing 12M dividends
  const oneYearAgoSec = nowMs / 1000 - 365 * 24 * 3600;
  const trailingAnnualDividend = asset.dividends
    .filter((d) => d.date >= oneYearAgoSec)
    .reduce((sum, d) => sum + d.amount, 0);
  const trailingDividendYieldPct =
    currentPrice > 0 ? (trailingAnnualDividend / currentPrice) * 100 : 0;

  // Support and Resistance from recent 60-day pivots & Bollinger/SMA levels
  const recent60 = daily.slice(-60);
  const recentLows = recent60.map((p) => p.low).sort((a, b) => a - b);
  const recentHighs = recent60.map((p) => p.high).sort((a, b) => b - a);
  const support1 = recentLows[Math.min(3, recentLows.length - 1)] ?? bollingerLower;
  const support2 = Math.min(low52, support1 * 0.94);
  const resistance1 = recentHighs[Math.min(2, recentHighs.length - 1)] ?? bollingerUpper;
  const resistance2 = Math.max(high52, resistance1 * 1.06);

  // Composite Sentiment & Trend Score (Base = 50)
  let rawScore = 50;
  const signalBreakdown: SignalFactor[] = [];

  // Factor 1: Long-Term Secular Trend (Price vs 200D SMA)
  if (sma200 !== null && priceVsSma200Pct !== null) {
    const bullish = currentPrice >= sma200;
    const contrib = bullish
      ? Math.min(14, 6 + priceVsSma200Pct * 0.35)
      : Math.max(-14, -6 + priceVsSma200Pct * 0.35);
    rawScore += contrib;
    signalBreakdown.push({
      factor: 'Secular Trend (200D SMA)',
      signal: bullish ? 'BULLISH' : 'BEARISH',
      detail: `Price is ${priceVsSma200Pct >= 0 ? '+' : ''}${priceVsSma200Pct.toFixed(1)}% ${
        bullish ? 'above' : 'below'
      } 200D SMA (${sma200.toFixed(2)})`,
      scoreContribution: Math.round(contrib),
    });
  }

  // Factor 2: Moving Average Alignment (SMA 50 vs SMA 200 & Price vs SMA 50)
  if (sma50 !== null) {
    const above50 = currentPrice >= sma50;
    const gcBonus = goldenCross === true ? 5 : goldenCross === false ? -5 : 0;
    const contrib = (above50 ? 6 : -6) + gcBonus;
    rawScore += contrib;
    signalBreakdown.push({
      factor: 'Medium-Term Trend Structure',
      signal: contrib > 2 ? 'BULLISH' : contrib < -2 ? 'BEARISH' : 'NEUTRAL',
      detail: `${above50 ? 'Above' : 'Below'} 50D SMA (${sma50.toFixed(2)})${
        goldenCross !== null
          ? goldenCross
            ? ' • Golden Cross (50D > 200D)'
            : ' • Death Cross (50D < 200D)'
          : ''
      }`,
      scoreContribution: contrib,
    });
  }

  // Factor 3: Short-Term Momentum (EMA 20 & 1M Return)
  if (ema20 !== null) {
    const aboveEma = currentPrice >= ema20;
    const contrib = (aboveEma ? 4 : -4) + Math.max(-5, Math.min(5, return1M * 0.4));
    rawScore += contrib;
    signalBreakdown.push({
      factor: 'Short-Term Momentum (20D EMA)',
      signal: contrib > 1.5 ? 'BULLISH' : contrib < -1.5 ? 'BEARISH' : 'NEUTRAL',
      detail: `1M return ${return1M >= 0 ? '+' : ''}${return1M.toFixed(1)}% • Price ${
        aboveEma ? 'above' : 'below'
      } 20D EMA (${ema20.toFixed(2)})`,
      scoreContribution: Math.round(contrib),
    });
  }

  // Factor 4: RSI-14 Oscillator
  {
    let signal: 'BULLISH' | 'NEUTRAL' | 'BEARISH' = 'NEUTRAL';
    let contrib = 0;
    let detail = `RSI(14) at ${rsi14.toFixed(1)} `;
    if (rsi14 >= 53 && rsi14 <= 68) {
      signal = 'BULLISH';
      contrib = 6;
      detail += '(Healthy bullish momentum without extreme overbought froth)';
    } else if (rsi14 > 68 && rsi14 <= 75) {
      signal = 'BULLISH';
      contrib = 3;
      detail += '(Strong momentum, approaching overbought territory)';
    } else if (rsi14 > 75) {
      signal = 'NEUTRAL';
      contrib = -2;
      detail += '(Overbought >75 — elevated short-term pullback risk)';
    } else if (rsi14 < 30) {
      signal = 'BULLISH';
      contrib = 4;
      detail += '(Oversold <30 — statistical mean-reversion bounce candidate)';
    } else if (rsi14 < 45) {
      signal = 'BEARISH';
      contrib = -6;
      detail += '(Weak relative momentum regime)';
    } else {
      detail += '(Balanced momentum equilibrium)';
    }
    rawScore += contrib;
    signalBreakdown.push({
      factor: 'RSI (14) Oscillator',
      signal,
      detail,
      scoreContribution: contrib,
    });
  }

  // Factor 5: MACD Histogram & Crossover
  {
    const bullishMacd = macdHistogram > 0;
    const contrib = bullishMacd ? 5 : -5;
    rawScore += contrib;
    signalBreakdown.push({
      factor: 'MACD (12, 26, 9) Impulse',
      signal: bullishMacd ? 'BULLISH' : 'BEARISH',
      detail: `MACD (${macdLine.toFixed(2)}) is ${
        bullishMacd ? 'above' : 'below'
      } Signal (${macdSignal.toFixed(2)}) • Hist: ${macdHistogram >= 0 ? '+' : ''}${macdHistogram.toFixed(2)}`,
      scoreContribution: contrib,
    });
  }

  // Factor 6: 52-Week Range Positioning
  {
    const contrib = ((fiftyTwoWeekPositionPct - 50) / 50) * 6;
    rawScore += contrib;
    signalBreakdown.push({
      factor: '52-Week Range Strength',
      signal:
        fiftyTwoWeekPositionPct >= 60
          ? 'BULLISH'
          : fiftyTwoWeekPositionPct <= 40
            ? 'BEARISH'
            : 'NEUTRAL',
      detail: `Trading at ${fiftyTwoWeekPositionPct.toFixed(0)}% of 52W range (${low52.toFixed(
        2
      )} – ${high52.toFixed(2)})`,
      scoreContribution: Math.round(contrib),
    });
  }

  // Factor 7: News Headline Sentiment
  {
    const newsScore = scoreNewsHeadlines(asset.news.map((n) => n.title));
    rawScore += newsScore.score;
    signalBreakdown.push({
      factor: 'Media & News Flow Sentiment',
      signal: newsScore.score >= 2 ? 'BULLISH' : newsScore.score <= -2 ? 'BEARISH' : 'NEUTRAL',
      detail: newsScore.summary,
      scoreContribution: newsScore.score,
    });
  }

  const sentimentScore = Math.max(5, Math.min(95, Math.round(rawScore)));
  const sentimentRegime =
    sentimentScore >= 72
      ? 'STRONG BULLISH'
      : sentimentScore >= 58
        ? 'BULLISH'
        : sentimentScore <= 28
          ? 'STRONG BEARISH'
          : sentimentScore <= 42
            ? 'BEARISH'
            : 'NEUTRAL / CONSOLIDATING';

  const trendDirection: 'UPTREND' | 'SIDEWAYS' | 'DOWNTREND' =
    sentimentScore >= 57 ? 'UPTREND' : sentimentScore <= 43 ? 'DOWNTREND' : 'SIDEWAYS';

  // Quantitative Future Price Estimation Model:
  // Blends shrunk historical drift + sentiment regime tilt + volatility confidence cone
  const rawAnnualReturnDec = return1Y / 100;
  const cagrDec = cagr5Y !== null ? cagr5Y / 100 : rawAnnualReturnDec;
  const benchmarkDrift = 0.085;
  const sentimentTilt = ((sentimentScore - 50) / 50) * 0.08;
  const blendedAnnualDrift = Math.max(
    -0.25,
    Math.min(
      0.38,
      0.45 * benchmarkDrift + 0.35 * cagrDec + 0.2 * rawAnnualReturnDec + sentimentTilt
    )
  );

  const annualVolDec = Math.max(0.1, Math.min(0.85, annualizedVolatilityPct / 100));

  const buildScenario = (horizonLabel: string, months: number): PriceProjectionScenario => {
    const t = months / 12;
    const driftTerm = (blendedAnnualDrift - 0.5 * annualVolDec * annualVolDec) * t;
    const volTerm = annualVolDec * Math.sqrt(t) * 0.85;

    const basePrice = currentPrice * Math.exp(driftTerm);
    const bullPrice = currentPrice * Math.exp(driftTerm + volTerm);
    const bearPrice = currentPrice * Math.exp(driftTerm - volTerm);

    return {
      horizonLabel,
      months,
      bearPrice,
      basePrice,
      bullPrice,
      bearChangePct: ((bearPrice - currentPrice) / currentPrice) * 100,
      baseChangePct: ((basePrice - currentPrice) / currentPrice) * 100,
      bullChangePct: ((bullPrice - currentPrice) / currentPrice) * 100,
    };
  };

  const quantProjections = {
    '3M': buildScenario('3 Months', 3),
    '6M': buildScenario('6 Months', 6),
    '1Y': buildScenario('12 Months', 12),
  };

  const futureCone: FutureConePoint[] = [];
  const monthMs = 30.44 * 24 * 3600 * 1000;
  for (let m = 0; m <= 12; m++) {
    if (m === 0) {
      futureCone.push({
        timestamp: nowMs,
        label: 'Now',
        bear: currentPrice,
        base: currentPrice,
        bull: currentPrice,
      });
    } else {
      const sc = buildScenario(`+${m}M`, m);
      futureCone.push({
        timestamp: nowMs + m * monthMs,
        label: `+${m}M`,
        bear: sc.bearPrice,
        base: sc.basePrice,
        bull: sc.bullPrice,
      });
    }
  }

  return {
    return1D,
    return1W,
    return1M,
    return3M,
    return6M,
    return1Y,
    return5Y,
    cagr5Y,
    sma20,
    sma50,
    sma200,
    ema20,
    priceVsSma200Pct,
    goldenCross,
    rsi14,
    macdLine,
    macdSignal,
    macdHistogram,
    annualizedVolatilityPct,
    maxDrawdown1YPct,
    maxDrawdown5YPct,
    atr14,
    bollingerUpper,
    bollingerLower,
    sharpeEstimate,
    fiftyTwoWeekPositionPct,
    trailingDividendYieldPct,
    trailingAnnualDividend,
    support1,
    support2,
    resistance1,
    resistance2,
    sentimentScore,
    sentimentRegime,
    trendDirection,
    signalBreakdown,
    quantProjections,
    futureCone,
  };
}

// ─── Comité d'Investissement Institutionnel Gemini ───────────────────────────

export const DEFAULT_INVESTMENT_COUNSELOR_PREPROMPT = `You are an elite, institutional-grade Investment Counseling Committee composed of four senior specialists:
1. Chief Equity & ETF Valuation Strategist (CFA) — specialist in intrinsic valuation (DCF, residual income, normalized earnings multiples, ROIC vs. WACC, free cash flow conversion, balance sheet leverage, and ETF structural/index mechanics).
2. Senior Global Macro & Monetary Policy Economist — specialist in central bank policy trajectories (Fed, ECB, BoJ, BoE, PBoC), real sovereign bond yields, inflation regimes, credit spreads, fiscal impulses, and currency (FX) translation impacts.
3. Director of Geopolitical Intelligence & Supply-Chain Risk — specialist in evaluating how active wars, regional/global armed conflicts, defense realignments, maritime chokepoints (Red Sea/Suez, Strait of Hormuz, Taiwan Strait, Malacca, Panama), trade wars, tariffs, export controls, sanctions, energy shocks, and critical resource dependencies directly and indirectly impact specific equities, sectors, and ETF holdings.
4. Head of Quantitative Technicals & Tactical Trading (CMT) — specialist in market regime classification, institutional order flow, volatility cones, momentum oscillators (RSI, MACD), moving-average structure (20/50/200 SMA), options/positioning sentiment, asymmetric entry/exit zones, and hard thesis-invalidation levels.

================================================================================
CORE MANDATE & ANALYTICAL RIGOR
================================================================================
Your mandate is to deliver an exhaustive, objective, unsentimental, and numbers-driven investment review and future valuation estimation for the requested stock, ETF, or traditional market instrument.

NEVER give vague, generic, or superficial answers. Do NOT attempt to call any external tools or functions — respond directly with the analysis. You MUST:
- Synthesize the live Yahoo Finance market telemetry, technical indicators, dividends, and news headlines injected in the prompt together with your comprehensive institutional knowledge of the asset's fundamentals, recent earnings/fund flows, valuation multiples (Trailing P/E, Forward P/E, PEG, EV/EBITDA, P/B, P/FCF, Dividend Yield, or for ETFs: Total Expense Ratio / TER, AUM, tracking error, top 10 holdings concentration, and geographic/sector weights), and Wall Street consensus.
- Explicitly compare CURRENT valuation multiples against the asset's PAST (5-year historical average) valuation multiples and its sector/peer group median. Determine whether current pricing reflects justified fundamental expansion, cyclical peak earnings, multiple compression, or speculative froth.
- Explicitly evaluate the WORLD CURRENT SITUATION:
  * Active armed conflicts and geopolitical flashpoints (e.g., Russia-Ukraine war & European security/energy restructuring; Middle East conflicts & oil/LNG/shipping route disruptions; Indo-Pacific & Taiwan Strait tensions impacting semiconductors, hardware, and global trade; regional instability affecting commodities or emerging markets).
  * Geo-economic fragmentation: US/EU/China tariffs, industrial policy subsidies, semiconductor/AI export controls, sanctions compliance, reshoring/friend-shoring capex burdens, and sovereign debt sustainability.
  * Trace both FIRST-ORDER impacts (direct revenue/facilities in conflict or tariff zones) and SECOND-ORDER impacts (input cost inflation, energy prices, freight rates, defense budgets, FX volatility, enterprise/consumer confidence).
- Synthesize all factors taken into account by top investment advisors and professional traders:
  * Earnings quality, margin trajectory, free cash flow durability, debt maturity wall, buybacks/dividends, and management capital allocation.
  * For ETFs/Funds: index construction methodology (market-cap vs. equal-weight vs. factor), concentration risk in mega-caps, sector/currency exposure, dividend withholding tax efficiency, and liquidity.
  * Market sentiment, institutional positioning, short interest / crowding risk, seasonal patterns, upcoming catalyst calendar, and technical support/resistance structure.
- Produce a rigorous, probability-weighted FUTURE VALUATION ESTIMATION across three time horizons (3 Months, 12 Months, and 3 Years / 36 Months) with explicit Bear Case, Base Case, and Bull Case price targets in the asset's trading currency, explaining the exact multiple and earnings/NAV assumptions behind each scenario.

================================================================================
REQUIRED OUTPUT FORMAT (TWO PARTS: STRUCTURED JSON + DEEP-DIVE MARKDOWN REPORT)
================================================================================
Your response MUST contain TWO parts in this exact order:

PART 1: A single fenced \`\`\`json code block containing valid JSON matching this exact schema (all price numbers must be numeric values in the asset's native currency, and all scores must be integers from 0 to 100):
\`\`\`json
{
  "verdict": "STRONG BUY" | "BUY" | "ACCUMULATE" | "HOLD" | "REDUCE" | "SELL",
  "confidenceScore": 82,
  "sentimentScore": 68,
  "sentimentLabel": "Constructive Bullish with Macro Vigilance",
  "executiveThesis": "2-3 sentence institutional executive summary of the core investment thesis and risk/reward skew.",
  "intrinsicValueEstimate": {
    "low": 0.0,
    "fair": 0.0,
    "high": 0.0,
    "valuationStatus": "UNDERVALUED" | "FAIRLY VALUED" | "OVERVALUED",
    "methodology": "Blended DCF & Normalized Forward P/E vs 5Y Historical Median (or NAV/Constituent Earnings Growth for ETF)"
  },
  "valuationMultiples": {
    "trailingPE": "e.g. 28.4x (or Index P/E 22.1x)",
    "forwardPE": "e.g. 23.1x",
    "pegOrEvEbitda": "e.g. PEG 1.4x / EV/EBITDA 18.2x",
    "priceToBookOrSales": "e.g. P/S 7.8x, P/B 9.2x",
    "dividendOrExpenseRatio": "e.g. Div Yield 0.8% (or TER 0.20% for ETF)",
    "historicalComparison": "Concise comparison of current multiples vs 5-year historical average and peer group"
  },
  "priceTargets": {
    "threeMonth": {
      "bear": 0.0,
      "base": 0.0,
      "bull": 0.0,
      "rationale": "Key short-term technical & catalyst driver"
    },
    "twelveMonth": {
      "bear": 0.0,
      "base": 0.0,
      "bull": 0.0,
      "bearProb": 25,
      "baseProb": 50,
      "bullProb": 25,
      "expectedPrice": 0.0,
      "rationale": "12M fundamental valuation & multiple assumption"
    },
    "threeYear": {
      "bear": 0.0,
      "base": 0.0,
      "bull": 0.0,
      "rationale": "3Y structural compounding & secular cycle assumption"
    }
  },
  "factorScores": {
    "valuation": 0,
    "fundamentals": 0,
    "technicals": 0,
    "macroResilience": 0,
    "geopoliticalSafety": 0,
    "momentum": 0
  },
  "geopoliticalAssessment": {
    "riskLevel": "LOW" | "MODERATE" | "ELEVATED" | "HIGH" | "CRITICAL",
    "conflictAndWarImpact": "Specific analysis of exposure to active wars, defense cycles, energy shocks, and regional conflicts.",
    "supplyChainAndTradeExposure": "Specific exposure to tariffs, export controls, China/Taiwan/Red Sea chokepoints, and reshoring.",
    "regionalMacroSensitivity": "FX, sovereign debt, and regional GDP sensitivity."
  },
  "keyCatalysts": [
    "Specific upcoming catalyst 1 with timeframe",
    "Specific upcoming catalyst 2",
    "Specific upcoming catalyst 3"
  ],
  "keyRisks": [
    "Specific thesis risk 1",
    "Specific thesis risk 2",
    "Specific thesis risk 3"
  ],
  "tradeAndPositioning": {
    "idealEntryZone": "Specific price range or technical trigger for accumulation",
    "invalidationStopLoss": "Specific price level or fundamental event that invalidates the thesis",
    "takeProfitTargets": "First and second upside trim/target zones",
    "recommendedHorizon": "Optimal holding period",
    "portfolioAllocationGuidance": "Suggested portfolio role and sizing discipline (e.g., Core 3-5% vs Tactical 1-2%)"
  }
}
\`\`\`

PART 2: Immediately after the closing \`\`\` of the JSON block, write the comprehensive, institutional-grade Markdown Investment Report using these exact section headings:
## 1. Executive Thesis & Investment Committee Verdict
## 2. Product Architecture, Competitive Moat & Business / ETF Structure
## 3. Current vs. Historical Valuation & Fundamental Trajectory
## 4. Global Macroeconomic & Monetary Policy Environment
## 5. World Situation: Geopolitical Risks, Wars, Conflicts & Supply-Chain Exposure
## 6. Market Sentiment, Technical Regime & Institutional Positioning
## 7. Future Valuation Estimation & Multi-Scenario Price Targets (3M, 12M, 3Y)
## 8. Investment Advisor & Trader Playbook (Entry Zones, Sizing, Hedging & Invalidation)`;

export function buildAssetTelemetryContext(
  asset: AssetBundle,
  technicals: TechnicalAnalytics,
  options: CounselRequestOptions = {},
  nowIso: string = new Date().toISOString().split('T')[0]
): string {
  const fmtNum = (n: number | null | undefined, digits = 2) =>
    n !== null && n !== undefined ? n.toFixed(digits) : 'N/A';
  const fmtSignedPct = (n: number, digits = 2) => `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;

  const recentNewsLines = asset.news
    .slice(0, 8)
    .map(
      (n, i) =>
        `  ${i + 1}. "${n.title}" (${n.publisher}, ${
          new Date(n.publishTime).toISOString().split('T')[0]
        })`
    )
    .join('\n');

  const signalLines = technicals.signalBreakdown
    .map((s) => `  - [${s.signal}] ${s.factor}: ${s.detail}`)
    .join('\n');

  const lang = options.language || i18next.language;
  const langInstruction =
    lang === 'fr'
      ? '\nIMPORTANT LANGUAGE REQUIREMENT: Write all narrative fields in the JSON (executiveThesis, sentimentLabel, methodology, historicalComparison, rationales, geopoliticalAssessment descriptions, keyCatalysts, keyRisks, tradeAndPositioning) and the entire PART 2 Markdown Report in FRENCH (keep JSON property keys and enum codes like STRONG BUY, BUY, ACCUMULATE, HOLD, REDUCE, SELL, UNDERVALUED, FAIRLY VALUED, OVERVALUED, LOW, MODERATE, ELEVATED, HIGH, CRITICAL in English).'
      : lang === 'de'
        ? '\nIMPORTANT LANGUAGE REQUIREMENT: Write all narrative fields in the JSON and the entire PART 2 Markdown Report in GERMAN (keep JSON property keys and enum codes like STRONG BUY, BUY, ACCUMULATE, HOLD, REDUCE, SELL, UNDERVALUED, FAIRLY VALUED, OVERVALUED, LOW, MODERATE, ELEVATED, HIGH, CRITICAL in English).'
        : '';

  const fiveYearText =
    technicals.return5Y !== null
      ? `${fmtSignedPct(technicals.return5Y)} (5Y CAGR: ${fmtNum(technicals.cagr5Y)}%)`
      : 'Less than 5Y history';

  const crossText =
    technicals.goldenCross === true
      ? 'Golden Cross 50D > 200D active'
      : technicals.goldenCross === false
        ? 'Death Cross 50D < 200D active'
        : 'N/A';

  const vsSma200Text =
    technicals.priceVsSma200Pct !== null ? fmtSignedPct(technicals.priceVsSma200Pct) : 'N/A';

  return `================================================================================
LIVE ASSET TELEMETRY & QUANTITATIVE SNAPSHOT (AS OF ${nowIso})
================================================================================
- Ticker Symbol: ${asset.symbol}
- Full Name: ${asset.longName} (${asset.shortName})
- Instrument Type: ${asset.instrumentType}
- ISIN: ${asset.isin || 'N/A'}
- Exchange & Currency: ${asset.exchangeName} (${asset.currency})
- Sector / Industry: ${asset.sector || 'N/A'} / ${asset.industry || 'N/A'}

PRICE & HISTORICAL PERFORMANCE:
- Current Spot Price: ${fmtNum(asset.regularMarketPrice)} ${asset.currency}
- Previous Close: ${fmtNum(asset.previousClose)} ${asset.currency}
- Intraday Range: ${fmtNum(asset.regularMarketDayLow)} – ${fmtNum(asset.regularMarketDayHigh)} ${asset.currency}
- 52-Week Range: ${fmtNum(asset.fiftyTwoWeekLow)} – ${fmtNum(asset.fiftyTwoWeekHigh)} ${asset.currency} (Currently at ${fmtNum(technicals.fiftyTwoWeekPositionPct, 1)}% of 52W range)
- 1-Day Return: ${fmtSignedPct(technicals.return1D)}
- 1-Week Return: ${fmtSignedPct(technicals.return1W)}
- 1-Month Return: ${fmtSignedPct(technicals.return1M)}
- 3-Month Return: ${fmtSignedPct(technicals.return3M)}
- 6-Month Return: ${fmtSignedPct(technicals.return6M)}
- 1-Year Return: ${fmtSignedPct(technicals.return1Y)}
- 5-Year Cumulative Return: ${fiveYearText}
- Trailing 12M Cash Dividends: ${fmtNum(technicals.trailingAnnualDividend)} ${asset.currency} (Trailing Yield: ${fmtNum(technicals.trailingDividendYieldPct)}%)

TECHNICAL & RISK TELEMETRY:
- Moving Averages: 20D SMA = ${fmtNum(technicals.sma20)}, 50D SMA = ${fmtNum(technicals.sma50)}, 200D SMA = ${fmtNum(technicals.sma200)}, 20D EMA = ${fmtNum(technicals.ema20)}
- Price vs 200D SMA: ${vsSma200Text} (${crossText})
- Momentum Oscillators: RSI(14) = ${fmtNum(technicals.rsi14, 1)}, MACD Line = ${fmtNum(technicals.macdLine, 3)}, Signal = ${fmtNum(technicals.macdSignal, 3)}, Histogram = ${fmtNum(technicals.macdHistogram, 3)}
- Volatility & Drawdown: Annualized Volatility = ${fmtNum(technicals.annualizedVolatilityPct, 1)}%, 1Y Max Drawdown = ${fmtNum(technicals.maxDrawdown1YPct, 1)}%, 5Y Max Drawdown = ${fmtNum(technicals.maxDrawdown5YPct, 1)}%, ATR(14) = ${fmtNum(technicals.atr14)} ${asset.currency}, Est. Sharpe = ${fmtNum(technicals.sharpeEstimate)}
- Key Technical Levels: Support 1 = ${fmtNum(technicals.support1)}, Support 2 = ${fmtNum(technicals.support2)}, Resistance 1 = ${fmtNum(technicals.resistance1)}, Resistance 2 = ${fmtNum(technicals.resistance2)}
- Algorithmic Trend & Sentiment Score: ${technicals.sentimentScore}/100 (${technicals.sentimentRegime}, ${technicals.trendDirection})
${signalLines}

QUANTITATIVE BASELINE STATISTICAL PROJECTIONS (FOR REFERENCE ONLY — REFINE WITH FUNDAMENTALS & MACRO):
- 3M Statistical Range: Bear ${fmtNum(technicals.quantProjections['3M'].bearPrice)} / Base ${fmtNum(technicals.quantProjections['3M'].basePrice)} / Bull ${fmtNum(technicals.quantProjections['3M'].bullPrice)} ${asset.currency}
- 12M Statistical Range: Bear ${fmtNum(technicals.quantProjections['1Y'].bearPrice)} / Base ${fmtNum(technicals.quantProjections['1Y'].basePrice)} / Bull ${fmtNum(technicals.quantProjections['1Y'].bullPrice)} ${asset.currency}

RECENT MARKET NEWS HEADLINES FOR ${asset.symbol}:
${recentNewsLines || '  (No recent headlines in feed)'}

INVESTOR COUNSEL PARAMETERS:
- Target Investment Horizon: ${options.horizon || 'MEDIUM_TERM (1 to 3 Years)'}
- Investor Risk Profile: ${options.riskProfile || 'BALANCED'}
${options.userNotes ? `- Specific Investor Question / Focus Area: "${options.userNotes}"` : ''}${langInstruction}

Please conduct your full institutional review and future valuation estimation for ${asset.longName} (${asset.symbol}) in ${asset.currency} now.`;
}

export function parseGeminiResponse(rawText: string): {
  structured: GeminiStructuredAssessment | null;
  markdownReport: string;
} {
  const jsonFenceRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i;
  const match = rawText.match(jsonFenceRegex);

  let structured: GeminiStructuredAssessment | null = null;
  let markdownReport = rawText.trim();

  if (match && match[1]) {
    try {
      structured = JSON.parse(match[1]);
      markdownReport = rawText.replace(match[0], '').trim();
    } catch {
      // keep rawText as markdownReport if JSON is malformed
    }
  } else {
    const firstBrace = rawText.indexOf('{');
    const markdownStart = rawText.indexOf('## 1.');
    if (firstBrace !== -1 && markdownStart > firstBrace) {
      const candidate = rawText.slice(firstBrace, markdownStart).trim();
      const lastBrace = candidate.lastIndexOf('}');
      if (lastBrace !== -1) {
        try {
          structured = JSON.parse(candidate.slice(0, lastBrace + 1));
          markdownReport = rawText.slice(markdownStart).trim();
        } catch {
          // keep full text as markdown
        }
      }
    }
  }

  return { structured, markdownReport };
}

export async function generateGeminiInvestmentCounsel(
  asset: AssetBundle,
  technicals: TechnicalAnalytics,
  options: CounselRequestOptions = {}
): Promise<GeminiCounselReport> {
  const apiKey = (options.apiKey ?? (await getGeminiApiKey())).trim();
  if (!apiKey) {
    throw new Error(i18next.t('ai.cle_api_manquante'));
  }

  let selectedModel = normalizeGeminiModel(options.model);
  const rawSystemInstruction =
    options.customSystemPreprompt?.trim() || DEFAULT_INVESTMENT_COUNSELOR_PREPROMPT;
  const systemInstruction = rawSystemInstruction.includes('Use your Google Search tool')
    ? DEFAULT_INVESTMENT_COUNSELOR_PREPROMPT
    : rawSystemInstruction;
  const userPrompt = buildAssetTelemetryContext(asset, technicals, options);

  const callModel = async (modelId: string): Promise<{ text: string; raw: any }> => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      modelId
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.25,
        },
      }),
    });

    if (!res.ok) {
      let errDetail = `HTTP ${res.status}`;
      try {
        const errJson: any = await res.json();
        if (errJson?.error?.message) {
          errDetail = `${errDetail}: ${errJson.error.message}`;
        }
      } catch {}
      throw new Error(errDetail);
    }

    const data: any = await res.json();
    const parts: any[] = data?.candidates?.[0]?.content?.parts || [];
    const text = parts
      .map((p) => (typeof p?.text === 'string' ? p.text : ''))
      .join('')
      .trim();

    if (!text) {
      const reason = data?.candidates?.[0]?.finishReason || 'EMPTY_RESPONSE';
      throw new Error(`Model ${modelId} returned empty output (${reason})`);
    }
    return { text, raw: data };
  };

  let result: { text: string; raw: any } | null = null;
  try {
    result = await callModel(selectedModel);
  } catch (err: any) {
    const msg = String(err?.message || '').toLowerCase();
    const shouldFallback =
      msg.includes('not found') ||
      msg.includes('404') ||
      msg.includes('does not exist') ||
      msg.includes('429') ||
      msg.includes('quota') ||
      msg.includes('resource_exhausted') ||
      msg.includes('503') ||
      msg.includes('high demand') ||
      msg.includes('unavailable') ||
      msg.includes('overloaded') ||
      msg.includes('empty output') ||
      msg.includes('malformed_function_call');

    if (shouldFallback) {
      const verifiedFallbacks = [
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3-flash-preview',
        'gemini-flash-lite-latest',
      ].filter((id) => id !== selectedModel);

      let lastErr = err;
      for (const candidateId of verifiedFallbacks) {
        try {
          result = await callModel(candidateId);
          selectedModel = `${candidateId} (fallback)`;
          break;
        } catch (fallbackErr) {
          lastErr = fallbackErr;
        }
      }

      if (!result) {
        throw lastErr;
      }
    } else {
      throw err;
    }
  }

  const { structured, markdownReport } = parseGeminiResponse(result.text);

  const groundingSources: GroundingSource[] = [];
  const chunks = result.raw?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const seenUris = new Set<string>();
  for (const chunk of chunks) {
    const uri = chunk?.web?.uri;
    const title = chunk?.web?.title || uri;
    if (uri && !seenUris.has(uri)) {
      seenUris.add(uri);
      groundingSources.push({ title, uri });
    }
  }

  return {
    symbol: asset.symbol,
    generatedAt: Date.now(),
    model: selectedModel,
    structured,
    markdownReport,
    groundingSources,
  };
}
