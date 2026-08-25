/**
 * Estimation locale d'un bien via l'API DVF (Demandes de Valeurs Foncières, DGFiP)
 * du portail officiel data.gouv.fr — au lieu de réévaluer le prix d'achat via
 * l'indice national (voir houseIndex.ts), on calcule ici un €/m² local à partir de
 * transactions réelles récentes et on valorise directement : prix/m² local × surface.
 *
 * Deux appels réseau, gratuits et sans clé, dans le même esprit que le refresh FRED
 * de houseIndex.ts : best-effort, échec silencieux (renvoie { ok: false }), jamais
 * de throw qui casserait l'écran appelant.
 *  - Géocodage : data.geopf.fr (IGN Géoplateforme, remplace l'ancien
 *    api-adresse.data.gouv.fr, décommissionné) → code commune INSEE + lat/lon.
 *  - Prix/m² : dvf-api.data.gouv.fr — c'est le backend qui alimente l'explorateur
 *    DVF officiel du gouvernement (explore.data.gouv.fr/immobilier), retrouvé en
 *    inspectant son bundle JS (aucune doc publique de cette API). Il renvoie une
 *    série MENSUELLE de médianes de prix/m² déjà agrégées côté serveur — pas de
 *    calcul de médiane à refaire ici — par commune ou par département, avec le
 *    nombre de ventes ayant servi au calcul chaque mois. Contrairement à l'ancienne
 *    micro-API non officielle api.cquest.org/dvf (essayée d'abord, indisponible en
 *    pratique), c'est l'infrastructure du gouvernement qui sert son propre outil
 *    phare de visualisation DVF : bien plus susceptible de rester en ligne.
 */
import type { LocalEstimate, PropertyGeo, PropertyKind } from '../types';

/** Seuls ces types de bien ont un équivalent DVF direct et un €/m² comparable. */
export const LOCAL_MODE_KINDS: PropertyKind[] = ['appartement', 'maison'];

/**
 * fetch + parse JSON, en traduisant tout échec réseau/HTTP en un message unique et
 * compréhensible plutôt que la `TypeError` brute du navigateur (« Failed to
 * fetch »), indiscernable pour l'utilisateur d'un vrai bug applicatif.
 */
async function fetchJsonOrThrow(url: string, unavailableMessage: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(unavailableMessage);
  }
  if (!res.ok) throw new Error(unavailableMessage);
  return res.json();
}

const GEOCODE_URL = 'https://data.geopf.fr/geocodage/search';

/** Géocode une adresse libre en code commune INSEE + coordonnées (1er résultat). */
export async function geocodeAddress(
  address: string
): Promise<{ ok: true; geo: PropertyGeo } | { ok: false; error: string }> {
  const q = address.trim();
  if (!q) return { ok: false, error: 'Adresse manquante' };
  try {
    const data = await fetchJsonOrThrow(
      `${GEOCODE_URL}?q=${encodeURIComponent(q)}&limit=1`,
      'service de géocodage indisponible pour le moment, réessayez plus tard'
    );
    const feature = data?.features?.[0];
    const props = feature?.properties;
    const coords = feature?.geometry?.coordinates; // [lon, lat]
    if (!props?.citycode || !Array.isArray(coords) || coords.length < 2) throw new Error('adresse introuvable');
    return {
      ok: true,
      geo: {
        inseeCode: props.citycode,
        postalCode: props.postcode,
        lat: coords[1],
        lon: coords[0],
        label: props.label ?? q,
      },
    };
  } catch (e: any) {
    return { ok: false, error: `Géocodage : ${e?.message ?? e}` };
  }
}

/** Un point mensuel de la série renvoyée par dvf-api.data.gouv.fr (champs utiles seulement). */
interface DvfMonthlyRow {
  d: string; // "YYYY-MM"
  a?: number | null; // nb ventes appartement ce mois
  m_a?: number | null; // médiane prix/m² appartement ce mois
  m?: number | null; // nb ventes maison ce mois
  m_m?: number | null; // médiane prix/m² maison ce mois
}

const DVF_API_BASE = 'https://dvf-api.data.gouv.fr';
const DVF_UNAVAILABLE = 'service DVF indisponible pour le moment, réessayez plus tard';
/** Sous ce total de ventes cumulées sur la fenêtre, la moyenne est jugée trop peu fiable. */
const MIN_SAMPLES = 5;
/** Fenêtre récente privilégiée avant de retomber sur tout l'historique disponible. */
const RECENT_MONTHS = 12;

const TYPE_FIELDS: Partial<Record<PropertyKind, { price: 'm_a' | 'm_m'; count: 'a' | 'm' }>> = {
  appartement: { price: 'm_a', count: 'a' },
  maison: { price: 'm_m', count: 'm' },
};

/**
 * Département INSEE d'une commune : les 2 premiers caractères, sauf Corse (déjà
 * alphanumérique sur 2 caractères, ex. "2A004") et DOM/COM (codes commune 97x/98x
 * ⇒ département sur 3 chiffres, ex. "974xx" ⇒ "974").
 */
function departementFromInsee(inseeCode: string): string {
  if (inseeCode.startsWith('97') || inseeCode.startsWith('98')) return inseeCode.slice(0, 3);
  return inseeCode.slice(0, 2);
}

/**
 * Moyenne du prix/m² pondérée par le nombre de ventes, sur les `months` derniers
 * points de la série (ou toute la série si omis). `null` si le total de ventes
 * cumulées sur la fenêtre reste sous `MIN_SAMPLES` — pas de moyenne peu fiable.
 */
function weightedAverage(
  rows: DvfMonthlyRow[],
  fields: { price: 'm_a' | 'm_m'; count: 'a' | 'm' },
  months?: number
): { pricePerM2: number; sampleSize: number } | null {
  const window = months ? rows.slice(-months) : rows;
  let weightedSum = 0;
  let totalCount = 0;
  for (const row of window) {
    const price = row[fields.price];
    const count = row[fields.count];
    if (price == null || !count || count <= 0) continue;
    weightedSum += price * count;
    totalCount += count;
  }
  return totalCount >= MIN_SAMPLES ? { pricePerM2: weightedSum / totalCount, sampleSize: totalCount } : null;
}

/**
 * Estimation locale : prix/m² moyen (pondéré par le nombre de ventes) sur les
 * `RECENT_MONTHS` derniers mois de la commune. Si trop peu de ventes récentes,
 * élargit progressivement — tout l'historique commune disponible, puis le
 * département — jusqu'à atteindre `MIN_SAMPLES` ventes cumulées.
 */
export async function fetchLocalEstimate(
  geo: PropertyGeo,
  kind: PropertyKind
): Promise<{ ok: true; estimate: LocalEstimate } | { ok: false; error: string }> {
  const fields = TYPE_FIELDS[kind];
  if (!fields) return { ok: false, error: 'Ce type de bien n’est pas couvert par les ventes DVF' };
  try {
    const communeData = await fetchJsonOrThrow(
      `${DVF_API_BASE}/commune/${encodeURIComponent(geo.inseeCode)}`,
      DVF_UNAVAILABLE
    );
    const communeRows: DvfMonthlyRow[] = Array.isArray(communeData?.data) ? communeData.data : [];

    let result = weightedAverage(communeRows, fields, RECENT_MONTHS);
    let scope: LocalEstimate['scope'] = 'commune';

    if (!result) result = weightedAverage(communeRows, fields);

    if (!result) {
      const depCode = departementFromInsee(geo.inseeCode);
      const depData = await fetchJsonOrThrow(`${DVF_API_BASE}/departement/${encodeURIComponent(depCode)}`, DVF_UNAVAILABLE);
      const depRows: DvfMonthlyRow[] = Array.isArray(depData?.data) ? depData.data : [];
      result = weightedAverage(depRows, fields, RECENT_MONTHS) ?? weightedAverage(depRows, fields);
      scope = 'departement';
    }

    if (!result) throw new Error('pas assez de ventes comparables disponibles, même à l’échelle du département');

    return {
      ok: true,
      estimate: { pricePerM2: result.pricePerM2, sampleSize: result.sampleSize, scope, computedAt: new Date().toISOString() },
    };
  } catch (e: any) {
    return { ok: false, error: `Estimation locale : ${e?.message ?? e}` };
  }
}
