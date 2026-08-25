/**
 * Cours actions / ETF / fonds via l'API chart de Yahoo Finance (non officielle).
 * Tickers au format Yahoo : "WPEA.PA" (Euronext Paris), "AAPL", "CW8.PA"…
 * Bloqué par CORS dans un navigateur — fonctionne dans l'app Android.
 */
import { logDebug, logDebugError } from '../debugLog';

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const TAG = 'yahoo';

interface YahooQuote {
  price: number;
  currency: string;
}

async function fetchQuote(symbol: string): Promise<YahooQuote> {
  const res = await fetch(`${BASE}/${encodeURIComponent(symbol)}?range=5d&interval=1d`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status} pour ${symbol}`);
  const json: any = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  const currency = meta?.currency;
  if (typeof price !== 'number' || !currency) {
    throw new Error(`Cours introuvable pour ${symbol}`);
  }
  return { price, currency };
}

const fxCache = new Map<string, number>();

/** Taux : 1 EUR = x {currency}. */
async function eurRate(currency: string): Promise<number> {
  if (currency === 'EUR') return 1;
  // Yahoo cote les fonds GBP parfois en pence (GBp).
  if (currency === 'GBp') return (await eurRate('GBP')) * 100;
  const cached = fxCache.get(currency);
  if (cached) return cached;
  const q = await fetchQuote(`EUR${currency}=X`);
  fxCache.set(currency, q.price);
  return q.price;
}

/** Prix en EUR d'un ticker Yahoo. */
export async function fetchYahooPriceEur(symbol: string): Promise<number> {
  const { price, currency } = await fetchQuote(symbol);
  if (currency === 'EUR') return price;
  const rate = await eurRate(currency);
  return price / rate;
}

/** Prix d'un ticker Yahoo converti dans la devise cible (via les taux Yahoo). */
export async function fetchYahooPrice(symbol: string, target: string): Promise<number> {
  const { price, currency } = await fetchQuote(symbol);
  if (currency === target) return price;
  const priceEur = currency === 'EUR' ? price : price / (await eurRate(currency));
  return target === 'EUR' ? priceEur : priceEur * (await eurRate(target));
}

export interface YahooSearchMatch {
  symbol: string;
  name: string;
  exchange: string;
  /** "EQUITY", "ETF", "MUTUALFUND"… */
  quoteType?: string;
  /** Présent pour une action individuelle ; jamais pour un ETF/fonds (pas de composition
   * exposée par cette recherche) — voir `classification.ts`. */
  sector?: string;
  industry?: string;
}

/**
 * Résout une requête (ISIN, nom…) vers des tickers Yahoo candidats, via l'API
 * de recherche non officielle. Un ISIN retrouve généralement le ticker de la
 * place de cotation principale en premier résultat, avec secteur/industrie inclus
 * pour une action individuelle (confirmé en test, aucun crumb requis contrairement
 * à `quoteSummary`).
 */
export async function searchYahooSymbol(query: string): Promise<YahooSearchMatch[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`;
  logDebug(TAG, `GET ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) {
    logDebugError(TAG, `GET ${url} → HTTP ${res.status}`);
    throw new Error(`Yahoo HTTP ${res.status} pour la recherche « ${query} »`);
  }
  const json: any = await res.json();
  logDebug(TAG, `GET ${url} → HTTP ${res.status}`, JSON.stringify(json));
  const quotes = Array.isArray(json?.quotes) ? json.quotes : [];
  return quotes
    .filter((q: any) => typeof q?.symbol === 'string')
    .map((q: any) => ({
      symbol: q.symbol,
      name: q.shortname ?? q.longname ?? q.symbol,
      exchange: q.exchange ?? q.exchDisp ?? '',
      quoteType: typeof q.quoteType === 'string' ? q.quoteType : undefined,
      sector: typeof q.sector === 'string' ? q.sector : undefined,
      industry: typeof q.industry === 'string' ? q.industry : undefined,
    }));
}
