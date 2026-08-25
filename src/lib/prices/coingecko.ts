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

// CoinGecko renvoie souvent des catégories peu parlantes comme tag "secteur" (noms d'indices,
// mentions d'un exchange en faillite…) — écartées pour ne garder que la première catégorie
// réellement descriptive.
const NOISY_CATEGORY = /index|holdings|ecosystem/i;

/** Première catégorie CoinGecko utilisable comme tag sectoriel (ex : "Layer 1 (L1)", "DeFi") ;
 * `undefined` si le coin n'a aucune catégorie exploitable. */
export async function fetchCoinGeckoCategory(id: string): Promise<string | undefined> {
  const url = `${BASE}/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status} pour ${id}`);
  const json = (await res.json()) as { categories?: unknown };
  const categories = Array.isArray(json.categories) ? json.categories.filter((c): c is string => typeof c === 'string') : [];
  return categories.find((c) => !NOISY_CATEGORY.test(c)) ?? categories[0];
}
