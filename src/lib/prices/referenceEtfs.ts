/**
 * Repli local ("cold data", zéro réseau, zéro clé) pour les ETF les plus détenus par un
 * investisseur français/européen — utilisé en dernier recours par `classification.ts` quand
 * ni Yahoo (jamais de composition pour un fonds) ni Alpha Vantage (couverture confirmée
 * limitée aux six bourses américaines via `LISTING_STATUS` — aucune donnée européenne, quelle
 * que soit la clé) n'ont de secteur à proposer.
 *
 * Chiffres saisis à la main depuis les fiches officielles de l'indice/du gérant (pas un flux
 * temps réel) — une photo à une date donnée, largement suffisante pour un indicateur de
 * répartition : la composition sectorielle/géographique d'un indice large dérive lentement
 * (quelques points par an, pas de quoi changer un diagnostic de concentration). Chaque entrée
 * cite sa source et sa date ; à rafraîchir à l'occasion plutôt qu'à chaque version.
 *
 * Un ISIN identifie une part précise d'un fonds — plusieurs gérants/parts peuvent répliquer le
 * même indice sous des ISIN différents, d'où la liste `isins` par entrée (vérifiés un par un
 * via la recherche Yahoo pour confirmer qu'ils résolvent bien vers le fonds visé, pas juste
 * recopiés d'une source tierce).
 */
import type { CountryCode, SectorKey } from '../types';

export interface ReferenceEtf {
  /** Pour lecture du code, jamais affiché à l'utilisateur. */
  name: string;
  isins: string[];
  sectorWeights: { sector: SectorKey; weight: number }[];
  /** Ventilation multi-pays si connue (ex : indice mondial) ; sinon `singleCountry`. */
  countryWeights?: { country: CountryCode; weight: number }[];
  /** Indice mono-pays (ex : S&P 500 → 100 % US) — plus simple qu'une liste à une entrée. */
  singleCountry?: CountryCode;
}

const REFERENCE_ETFS: ReferenceEtf[] = [
  {
    // Source : fiche indice MSCI World (USD), msci.com, 31/07/2026. ISIN vérifiés via
    // recherche Yahoo (chacun résout bien vers CW8.PA / WPEA.PA / MWRD.PA).
    name: 'MSCI World (Amundi CW8, iShares WPEA, Amundi Core MWRD…)',
    isins: ['LU1681043599', 'IE0002XZSHO1', 'IE000BI8OT95'],
    sectorWeights: [
      { sector: 'technology', weight: 0.2887 },
      { sector: 'financials', weight: 0.1681 },
      { sector: 'industrials', weight: 0.1145 },
      { sector: 'healthcare', weight: 0.0917 },
      { sector: 'consumer_discretionary', weight: 0.0902 },
      { sector: 'communication', weight: 0.0804 },
      { sector: 'consumer_staples', weight: 0.051 },
      { sector: 'energy', weight: 0.0402 },
      { sector: 'materials', weight: 0.0326 },
      { sector: 'utilities', weight: 0.0254 },
      { sector: 'real_estate', weight: 0.0171 },
    ],
    countryWeights: [
      { country: 'US', weight: 0.7203 },
      { country: 'JP', weight: 0.0573 },
      { country: 'GB', weight: 0.0361 },
      { country: 'CA', weight: 0.0341 },
      { country: 'FR', weight: 0.0244 },
      { country: 'autre', weight: 0.1278 },
    ],
  },
  {
    // Source : fiche fonds SPDR S&P 500 ETF Trust (SPY), State Street, 30/06/2026 — même
    // secteurs que l'indice S&P 500 lui-même (SPY le réplique physiquement à l'identique).
    // ISIN vérifiés via recherche Yahoo (résolvent vers PSP5.PA / PE500.PA).
    name: 'S&P 500 (Amundi PEA PSP5, PEA S&P 500 Screened PE500…)',
    isins: ['FR0011871128', 'FR0013412285'],
    sectorWeights: [
      { sector: 'technology', weight: 0.3803 },
      { sector: 'financials', weight: 0.1176 },
      { sector: 'communication', weight: 0.0968 },
      { sector: 'consumer_discretionary', weight: 0.0931 },
      { sector: 'industrials', weight: 0.0893 },
      { sector: 'healthcare', weight: 0.0889 },
      { sector: 'consumer_staples', weight: 0.0457 },
      { sector: 'energy', weight: 0.0298 },
      { sector: 'utilities', weight: 0.022 },
      { sector: 'real_estate', weight: 0.0183 },
      { sector: 'materials', weight: 0.0183 },
    ],
    singleCountry: 'US',
  },
];

const BY_ISIN = new Map<string, ReferenceEtf>();
for (const ref of REFERENCE_ETFS) {
  for (const isin of ref.isins) BY_ISIN.set(isin.toUpperCase(), ref);
}

export function referenceEtfForIsin(isin: string | undefined): ReferenceEtf | undefined {
  const key = isin?.trim().toUpperCase();
  return key ? BY_ISIN.get(key) : undefined;
}
