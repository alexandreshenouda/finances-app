/** Cours crypto via l'API publique CoinGecko (gratuite, CORS ok), multi-devises. */
import type { Currency } from '../types';

const BASE = 'https://api.coingecko.com/api/v3';

export type CoinGeckoPrices = Map<string, Partial<Record<Currency, number>>>;

/** ids : identifiants CoinGecko (ex : "bitcoin"). Retourne id → prix par devise. */
export async function fetchCoinGeckoPrices(ids: string[]): Promise<CoinGeckoPrices> {
  const out: CoinGeckoPrices = new Map();
  if (ids.length === 0) return out;
  const url = `${BASE}/simple/price?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=eur,usd,chf`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const json = (await res.json()) as Record<string, { eur?: number; usd?: number; chf?: number }>;
  for (const [id, v] of Object.entries(json)) {
    out.set(id, { EUR: v?.eur, USD: v?.usd, CHF: v?.chf });
  }
  return out;
}
