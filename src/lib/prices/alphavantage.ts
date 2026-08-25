/**
 * Classification sectorielle via l'API Alpha Vantage (clé utilisateur requise,
 * https://www.alphavantage.co/support/#api-key — 25 requêtes/jour, 1/seconde). Utilisée en
 * dernier recours par `classification.ts` uniquement quand Yahoo (gratuit, sans clé) n'a pas
 * de secteur à proposer — typiquement un ETF/fonds, dont la recherche Yahoo ne donne jamais la
 * composition. `symbol` doit être un ticker (AV n'accepte pas les ISIN, contrairement à la
 * recherche Yahoo). Pas de géographie pour les fonds (ETF_PROFILE ne renvoie qu'un secteur).
 */
import { logDebug, logDebugError } from '../debugLog';
import type { SectorKey } from '../types';
import { normalizeSector } from './sectors';

const BASE = 'https://www.alphavantage.co/query';
const TAG = 'alphavantage';

/** Ne journalise jamais la clé en clair (le journal est copiable/partageable depuis Outils
 * développeur) — même logique que `redactBody` pour Trade Republic. */
function redactUrl(url: string): string {
  return url.replace(/([?&]apikey=)[^&]+/, '$1••••');
}

async function callAlphaVantage(params: Record<string, string>, apiKey: string): Promise<any> {
  const query = Object.entries({ ...params, apikey: apiKey })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const url = `${BASE}?${query}`;
  const safeUrl = redactUrl(url);
  logDebug(TAG, `GET ${safeUrl}`);
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    logDebugError(TAG, `GET ${safeUrl} → HTTP ${res.status}`, text);
    throw new Error(`Alpha Vantage HTTP ${res.status} pour ${params.symbol}`);
  }
  const json = await res.json();
  logDebug(TAG, `GET ${safeUrl} → HTTP ${res.status}`, JSON.stringify(json));
  return json;
}

/** Alpha Vantage signale une erreur/quota dépassé via un champ texte au lieu d'un HTTP 4xx. */
function assertNoSoftError(json: any, symbol: string): void {
  const soft = json?.Information ?? json?.Note ?? json?.['Error Message'];
  if (soft) {
    logDebugError(TAG, `Alpha Vantage (${symbol}) : réponse d'erreur`, soft);
    throw new Error(`Alpha Vantage (${symbol}) : ${soft}`);
  }
}

export interface AlphaVantageOverview {
  sector: SectorKey;
  /** Libellé pays brut renvoyé par AV (ex : "USA", "France") — à faire correspondre à un
   * `CountryCode` côté appelant (voir `classification.ts`). */
  country?: string;
}

/** Profil d'une action/valeur individuelle. Lève si le symbole est inconnu d'AV ou si le
 * quota journalier est dépassé (mêmes deux cas, indissociables côté API). */
export async function fetchAlphaVantageOverview(symbol: string, apiKey: string): Promise<AlphaVantageOverview> {
  const json = await callAlphaVantage({ function: 'OVERVIEW', symbol }, apiKey);
  assertNoSoftError(json, symbol);
  if (!json?.Symbol) throw new Error(`Alpha Vantage : symbole inconnu « ${symbol} »`);
  return { sector: normalizeSector(json.Sector), country: typeof json.Country === 'string' ? json.Country : undefined };
}

export interface AlphaVantageEtfProfile {
  sectorWeights: { sector: SectorKey; weight: number }[];
}

/** Ventilation sectorielle d'un ETF/fonds. Pas de ventilation géographique disponible côté AV. */
export async function fetchAlphaVantageEtfProfile(symbol: string, apiKey: string): Promise<AlphaVantageEtfProfile> {
  const json = await callAlphaVantage({ function: 'ETF_PROFILE', symbol }, apiKey);
  assertNoSoftError(json, symbol);
  const sectors = Array.isArray(json?.sectors) ? json.sectors : null;
  if (!sectors) throw new Error(`Alpha Vantage : pas de profil ETF pour « ${symbol} »`);

  // Regroupe les entrées qui se normalisent vers le même SectorKey (ex : plusieurs libellés
  // AV bruts pouvant mapper vers "other") et ignore les poids nuls/négatifs.
  const merged = new Map<SectorKey, number>();
  for (const s of sectors) {
    const weight = Number(s?.weight);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    const key = normalizeSector(s?.sector);
    merged.set(key, (merged.get(key) ?? 0) + weight);
  }
  return { sectorWeights: [...merged.entries()].map(([sector, weight]) => ({ sector, weight })) };
}
