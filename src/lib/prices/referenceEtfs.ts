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
  {
    // Source : fiche indice MSCI Emerging Markets (USD), msci.com, 31/07/2026.
    // Pays : seule CN figure dans le type CountryCode de l'app — TW (26,63 %), KR (20,33 %),
    // IN (11,66 %), BR (4,15 %) et autres marchés émergents (15,85 %) sont regroupés dans 'autre'.
    name: 'MSCI Emerging Markets (Amundi PAEEM, iShares Core MSCI EM IMI, Lyxor EM…)',
    isins: ['FR0013412020', 'IE00BKM4GZ66', 'LU0635178014'],
    sectorWeights: [
      { sector: 'technology',             weight: 0.4079 },
      { sector: 'financials',             weight: 0.1998 },
      { sector: 'consumer_discretionary', weight: 0.0855 },
      { sector: 'communication',          weight: 0.0660 },
      { sector: 'industrials',            weight: 0.0645 },
      { sector: 'materials',              weight: 0.0574 },
      { sector: 'energy',                 weight: 0.0345 },
      { sector: 'consumer_staples',       weight: 0.0285 },
      { sector: 'healthcare',             weight: 0.0259 },
      { sector: 'utilities',              weight: 0.0197 },
      { sector: 'real_estate',            weight: 0.0103 },
    ],
    countryWeights: [
      { country: 'CN',    weight: 0.2138 },
      { country: 'autre', weight: 0.7862 }, // TW 26,63 % + KR 20,33 % + IN 11,66 % + BR 4,15 % + autres 15,85 %
    ],
  },
  {
    // Source : fiche indice MSCI Europe (USD), msci.com, 31/07/2026 (secteurs + top 5 pays).
    // Sous-ventilation pays du bloc « Other » : iShares Core MSCI Europe UCITS ETF
    // (IE00B4K48X80), blackrock.com, 21/08/2026. DK et NO absents du type CountryCode → 'autre'
    // (DK ≈ 2,78 % + NO ≈ 1,48 % du total + résidu ≈ 2,26 %).
    name: 'MSCI Europe (Amundi MSCI Europe, iShares Core MSCI Europe…)',
    isins: ['FR0010655688', 'LU1681042912', 'IE00B4K48X80'],
    sectorWeights: [
      { sector: 'financials',             weight: 0.2563 },
      { sector: 'industrials',            weight: 0.1890 },
      { sector: 'healthcare',             weight: 0.1289 },
      { sector: 'technology',             weight: 0.0865 },
      { sector: 'consumer_staples',       weight: 0.0863 },
      { sector: 'consumer_discretionary', weight: 0.0634 },
      { sector: 'materials',              weight: 0.0528 },
      { sector: 'energy',                 weight: 0.0504 },
      { sector: 'utilities',              weight: 0.0482 },
      { sector: 'communication',          weight: 0.0318 },
      { sector: 'real_estate',            weight: 0.0064 },
    ],
    countryWeights: [
      { country: 'GB',    weight: 0.2264 },
      { country: 'FR',    weight: 0.1527 },
      { country: 'CH',    weight: 0.1449 },
      { country: 'DE',    weight: 0.1363 },
      { country: 'NL',    weight: 0.0875 },
      { country: 'ES',    weight: 0.0586 },
      { country: 'IT',    weight: 0.0521 },
      { country: 'BE',    weight: 0.0189 },
      { country: 'autre', weight: 0.1226 }, // DK ≈ 2,78 % + NO ≈ 1,48 % + Suède, Finlande et résidu ≈ 12,26 %
    ],
  },
  {
    // Source : iShares Nasdaq 100 UCITS ETF (IE00B53SZB19), blackrock.com, 21/08/2026
    // (classification GICS — diffère de la classification propre à Nasdaq qui regroupe tech +
    // comm services à ≈ 66 %). Le Nasdaq-100 est 100 % US-coté → singleCountry.
    name: 'NASDAQ-100 (Amundi Nasdaq-100 LU1829221024, iShares IE00B53SZB19…)',
    isins: ['LU1829221024', 'IE00B53SZB19'],
    sectorWeights: [
      { sector: 'technology',             weight: 0.5790 },
      { sector: 'communication',          weight: 0.1364 },
      { sector: 'consumer_discretionary', weight: 0.1111 },
      { sector: 'consumer_staples',       weight: 0.0626 },
      { sector: 'healthcare',             weight: 0.0407 },
      { sector: 'industrials',            weight: 0.0369 },
      { sector: 'utilities',              weight: 0.0113 },
      { sector: 'materials',              weight: 0.0099 },
      { sector: 'energy',                 weight: 0.0054 },
      { sector: 'other',                  weight: 0.0067 },
    ],
    singleCountry: 'US',
  },
  {
    // Source : estimation croisée fiches Amundi CAC 40 UCITS ETF (FR0007052782) + Euronext,
    // mi-2026. La répartition GICS exacte du CAC 40 n'est pas publiée officiellement — poids
    // déduits des capitalisations flottantes des 40 constituants ; précision suffisante pour un
    // indicateur de concentration (cf. commentaire de tête du fichier). CAC 40 = 100 % Paris.
    name: 'CAC 40 (Amundi FR0007052782, BNP Paribas Easy FR0010150458…)',
    isins: ['FR0007052782', 'FR0010150458'],
    sectorWeights: [
      { sector: 'industrials',            weight: 0.2545 },
      { sector: 'consumer_discretionary', weight: 0.2000 },
      { sector: 'financials',             weight: 0.1318 },
      { sector: 'healthcare',             weight: 0.0791 },
      { sector: 'energy',                 weight: 0.0773 },
      { sector: 'consumer_staples',       weight: 0.0727 },
      { sector: 'technology',             weight: 0.0591 },
      { sector: 'materials',              weight: 0.0545 },
      { sector: 'utilities',              weight: 0.0318 },
      { sector: 'communication',          weight: 0.0255 },
      { sector: 'real_estate',            weight: 0.0137 },
    ],
    singleCountry: 'FR',
  },
  {
    // Source : fiche indice MSCI World Small Cap (USD), msci.com, 31/07/2026.
    // 'AU' absent du type CountryCode → regroupé dans 'autre' (AU 3,35 % + autres marchés
    // développés hors top 4 = 13,27 % → 'autre' total 16,62 %).
    name: 'MSCI World Small Cap (iShares IE00BF4RFH31, Xtrackers IE00BFNM3J75…)',
    isins: ['IE00BF4RFH31', 'IE00BFNM3J75'],
    sectorWeights: [
      { sector: 'industrials',            weight: 0.1989 },
      { sector: 'financials',             weight: 0.1494 },
      { sector: 'technology',             weight: 0.1375 },
      { sector: 'healthcare',             weight: 0.1068 },
      { sector: 'consumer_discretionary', weight: 0.1054 },
      { sector: 'real_estate',            weight: 0.0800 },
      { sector: 'materials',              weight: 0.0761 },
      { sector: 'energy',                 weight: 0.0487 },
      { sector: 'consumer_staples',       weight: 0.0407 },
      { sector: 'communication',          weight: 0.0305 },
      { sector: 'utilities',              weight: 0.0260 },
    ],
    countryWeights: [
      { country: 'US',    weight: 0.6235 },
      { country: 'JP',    weight: 0.1249 },
      { country: 'GB',    weight: 0.0452 },
      { country: 'CA',    weight: 0.0402 },
      { country: 'autre', weight: 0.1662 }, // AU 3,35 % + tous les autres marchés développés 13,27 %
    ],
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
