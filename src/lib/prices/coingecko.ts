/** Cours crypto en EUR via l'API publique CoinGecko (gratuite, CORS ok). */

const BASE = 'https://api.coingecko.com/api/v3';

/** ids : identifiants CoinGecko (ex : "bitcoin", "ethereum"). Retourne id → prix EUR. */
export async function fetchCoinGeckoPrices(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const url = `${BASE}/simple/price?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=eur`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const json = (await res.json()) as Record<string, { eur?: number }>;
  for (const [id, v] of Object.entries(json)) {
    if (typeof v?.eur === 'number') out.set(id, v.eur);
  }
  return out;
}
