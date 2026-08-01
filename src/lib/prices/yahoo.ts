/**
 * Cours actions / ETF / fonds via l'API chart de Yahoo Finance (non officielle).
 * Tickers au format Yahoo : "WPEA.PA" (Euronext Paris), "AAPL", "CW8.PA"…
 * Bloqué par CORS dans un navigateur — fonctionne dans l'app Android.
 */

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

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
