/** Suggestions de diversification calculées localement (aucune IA/réseau) : des règles à
 * seuils sur les données déjà en mémoire (comptes, lignes, objectifs), triées par sévérité
 * puis par ampleur. Chaque `Insight` porte une clé i18n + des paramètres déjà formatés
 * (même convention que `index.tsx` : `formatEur`/`formatPct` en amont de `t()`). */
import { cashAndLivretTotal, epargnePrecautionTarget } from './objectives';
import { accountShare, holdingCurrency, holdingValueEur } from './portfolio';
import { formatPct } from './format';
import {
  ACCOUNT_TYPE_LABELS,
  ALLOCATION_BUCKET_LABELS,
  COUNTRY_LABELS,
  SECTOR_LABELS,
  type Account,
  type AccountType,
  type AllocationBucket,
  type CountryCode,
  type FxRates,
  type Holding,
  type Objective,
  type RiskProfile,
  type SectorKey,
  type Snapshot,
} from './types';

export type InsightSeverity = 'warning' | 'info' | 'positive';

export interface Insight {
  id: string;
  severity: InsightSeverity;
  key: string;
  params?: Record<string, string | number>;
}

const SEVERITY_RANK: Record<InsightSeverity, number> = { warning: 0, info: 1, positive: 2 };

function typeConcentration(byType: Map<AccountType, number>, total: number): Insight | null {
  let best: [AccountType, number] | null = null;
  for (const entry of byType) if (!best || entry[1] > best[1]) best = entry;
  if (!best) return null;
  const share = best[1] / total;
  if (share < 0.45) return null;
  return {
    id: 'type-concentration',
    severity: share >= 0.7 ? 'warning' : 'info',
    key: 'diversification.type_concentration',
    params: { pct: formatPct(share * 100), type: ACCOUNT_TYPE_LABELS[best[0]] },
  };
}

function ownedHoldingValue(h: Holding, accounts: Map<string, Account>, rates: FxRates): number {
  const account = accounts.get(h.accountId);
  return holdingValueEur(h, account, rates) * (account ? accountShare(account) : 1);
}

function holdingConcentration(
  holdings: Holding[],
  accountsById: Map<string, Account>,
  rates: FxRates,
  total: number
): Insight | null {
  let best: { name: string; value: number } | null = null;
  for (const h of holdings) {
    const value = ownedHoldingValue(h, accountsById, rates);
    if (value > 0 && (!best || value > best.value)) best = { name: h.name, value };
  }
  if (!best) return null;
  const share = best.value / total;
  if (share < 0.18) return null;
  return {
    id: 'holding-concentration',
    severity: share >= 0.3 ? 'warning' : 'info',
    key: 'diversification.holding_concentration',
    params: { pct: formatPct(share * 100), name: best.name },
  };
}

function typeShare(byType: Map<AccountType, number>, types: AccountType[], total: number): number {
  let sum = 0;
  for (const t of types) sum += byType.get(t) ?? 0;
  return sum / total;
}

function cryptoExposure(byType: Map<AccountType, number>, total: number): Insight | null {
  const share = typeShare(byType, ['crypto'], total);
  if (share < 0.1) return null;
  return {
    id: 'crypto-exposure',
    severity: share >= 0.2 ? 'warning' : 'info',
    key: 'diversification.crypto_exposure',
    params: { pct: formatPct(share * 100) },
  };
}

function illiquidExposure(byType: Map<AccountType, number>, total: number): Insight | null {
  const share = typeShare(byType, ['immobilier', 'per'], total);
  if (share < 0.65) return null;
  return {
    id: 'illiquid-exposure',
    severity: share >= 0.8 ? 'warning' : 'info',
    key: 'diversification.illiquid_exposure',
    params: { pct: formatPct(share * 100) },
  };
}

function currencyExposure(
  holdings: Holding[],
  accountsById: Map<string, Account>,
  rates: FxRates,
  total: number
): Insight | null {
  const byCurrency = new Map<string, number>();
  for (const h of holdings) {
    const currency = holdingCurrency(h, accountsById.get(h.accountId));
    if (currency === 'EUR') continue;
    const value = ownedHoldingValue(h, accountsById, rates);
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + value);
  }
  let best: [string, number] | null = null;
  for (const entry of byCurrency) if (!best || entry[1] > best[1]) best = entry;
  if (!best) return null;
  const share = best[1] / total;
  if (share < 0.15) return null;
  return {
    id: 'currency-exposure',
    severity: share >= 0.3 ? 'warning' : 'info',
    key: 'diversification.currency_exposure',
    params: { pct: formatPct(share * 100), currency: best[0] },
  };
}

/** N'évalue que s'il existe une cible d'épargne de précaution : sans elle, aucun seuil
 * de coussin de trésorerie n'a de sens ("trop" ou "pas assez" par rapport à quoi ?). */
function cashCushion(
  accounts: Account[],
  holdings: Holding[],
  snapshots: Snapshot[],
  rates: FxRates,
  objectives: Objective[]
): Insight | null {
  const target = epargnePrecautionTarget(objectives);
  if (target <= 0) return null;
  const current = cashAndLivretTotal(accounts, holdings, snapshots, rates);
  const ratio = current / target;
  if (ratio < 0.5) {
    return {
      id: 'cash-cushion-low',
      severity: 'warning',
      key: 'diversification.cash_cushion_low',
      params: { pct: formatPct(ratio * 100) },
    };
  }
  if (ratio > 2) {
    return {
      id: 'cash-cushion-high',
      severity: 'info',
      key: 'diversification.cash_cushion_high',
      params: { pct: formatPct(ratio * 100) },
    };
  }
  return null;
}

// ─── Comparaison à un profil de référence ("répartition suggestions") ─────────────────
// Regroupe les AccountType en 4 grandes poches et les compare à une répartition cible
// générique par profil de risque. `immobilier` et `autre` sont volontairement exclus du
// modèle : un bien immobilier (a fortiori une résidence principale) n'est pas une position
// qu'on "rééquilibre" comme une ligne d'un compte-titres.

const BUCKET_TYPES: Record<AllocationBucket, AccountType[]> = {
  liquidites: ['courant', 'livret'],
  fonds_euro_per: ['assurance_vie', 'per'],
  actions_marches: ['pea', 'cto', 'private_equity'],
  crypto: ['crypto'],
};

const BUCKET_ORDER: AllocationBucket[] = ['liquidites', 'fonds_euro_per', 'actions_marches', 'crypto'];

/** Répartitions cibles génériques et illustratives (pas des recommandations produits) : voir
 * le disclaimer affiché avec l'écran qui les consomme. Fractions de 0 à 1, somme à 1 par profil. */
const TARGET_ALLOCATIONS: Record<RiskProfile, Record<AllocationBucket, number>> = {
  prudent: { liquidites: 0.35, fonds_euro_per: 0.45, actions_marches: 0.2, crypto: 0 },
  equilibre: { liquidites: 0.2, fonds_euro_per: 0.35, actions_marches: 0.4, crypto: 0.05 },
  dynamique: { liquidites: 0.1, fonds_euro_per: 0.2, actions_marches: 0.6, crypto: 0.1 },
};

export interface AllocationComparisonRow {
  bucket: AllocationBucket;
  targetPct: number;
  actualPct: number;
}

export interface AllocationComparison {
  rows: AllocationComparisonRow[];
  /** Somme des 4 poches modélisées, en EUR — dénominateur des pourcentages ci-dessus. */
  modeledTotal: number;
  /** Immobilier + autre, en EUR — hors modèle, affiché à titre informatif seulement. */
  excludedTotal: number;
}

function bucketValues(byType: Map<AccountType, number>): Record<AllocationBucket, number> {
  const raw = { liquidites: 0, fonds_euro_per: 0, actions_marches: 0, crypto: 0 } as Record<AllocationBucket, number>;
  for (const bucket of BUCKET_ORDER) {
    for (const t of BUCKET_TYPES[bucket]) raw[bucket] += byType.get(t) ?? 0;
  }
  return raw;
}

export function computeAllocationComparison(
  byType: Map<AccountType, number>,
  riskProfile: RiskProfile
): AllocationComparison {
  const target = TARGET_ALLOCATIONS[riskProfile];
  const raw = bucketValues(byType);
  const modeledTotal = BUCKET_ORDER.reduce((sum, b) => sum + raw[b], 0);
  const excludedTotal = (byType.get('immobilier') ?? 0) + (byType.get('autre') ?? 0);

  const rows = BUCKET_ORDER.map((bucket) => ({
    bucket,
    targetPct: target[bucket] * 100,
    actualPct: modeledTotal > 0 ? (raw[bucket] / modeledTotal) * 100 : 0,
  }));

  return { rows, modeledTotal, excludedTotal };
}

function allocationGap(byType: Map<AccountType, number>, riskProfile: RiskProfile): Insight | null {
  const { rows, modeledTotal } = computeAllocationComparison(byType, riskProfile);
  if (modeledTotal <= 0) return null;

  let worst: AllocationComparisonRow | null = null;
  let worstGap = 0;
  for (const row of rows) {
    const gap = Math.abs(row.actualPct - row.targetPct);
    if (gap > worstGap) {
      worst = row;
      worstGap = gap;
    }
  }
  if (!worst || worstGap < 8) return null;

  const over = worst.actualPct > worst.targetPct;
  return {
    id: 'allocation-gap',
    severity: worstGap >= 15 ? 'warning' : 'info',
    key: over ? 'diversification.allocation_gap_over' : 'diversification.allocation_gap_under',
    params: {
      bucket: ALLOCATION_BUCKET_LABELS[worst.bucket],
      targetPct: formatPct(worst.targetPct),
      actualPct: formatPct(worst.actualPct),
    },
  };
}

// ─── Diversification sectorielle / géographique ────────────────────────────────────────
// Le "pool classifiable" (dénominateur des taux de couverture) se limite aux poches où un
// secteur/pays a un sens — actions, ETF, private equity, crypto — sinon la couverture
// paraîtrait artificiellement basse dès qu'un utilisateur détient de l'immobilier ou du cash,
// qui ne seront jamais classifiés par nature.
function classifiablePool(byType: Map<AccountType, number>): number {
  return (byType.get('pea') ?? 0) + (byType.get('cto') ?? 0) + (byType.get('private_equity') ?? 0) + (byType.get('crypto') ?? 0);
}

function aggregateBySector(
  holdings: Holding[],
  accountsById: Map<string, Account>,
  rates: FxRates
): { bySector: Map<SectorKey, number>; covered: number } {
  const bySector = new Map<SectorKey, number>();
  let covered = 0;
  for (const h of holdings) {
    if (!h.sectorWeights || h.sectorWeights.length === 0) continue;
    const value = ownedHoldingValue(h, accountsById, rates);
    if (value <= 0) continue;
    covered += value;
    for (const { sector, weight } of h.sectorWeights) {
      bySector.set(sector, (bySector.get(sector) ?? 0) + value * weight);
    }
  }
  return { bySector, covered };
}

function aggregateByCountry(
  holdings: Holding[],
  accountsById: Map<string, Account>,
  rates: FxRates
): { byCountry: Map<CountryCode, number>; covered: number } {
  const byCountry = new Map<CountryCode, number>();
  let covered = 0;
  for (const h of holdings) {
    // Ventilation multi-pays (table de repli locale, voir referenceEtfs.ts) prioritaire sur
    // le pays unique quand elle est connue — bien plus fidèle pour un fonds diversifié.
    if (!h.countryWeights?.length && !h.country) continue;
    const value = ownedHoldingValue(h, accountsById, rates);
    if (value <= 0) continue;
    covered += value;
    if (h.countryWeights?.length) {
      for (const { country, weight } of h.countryWeights) {
        byCountry.set(country, (byCountry.get(country) ?? 0) + value * weight);
      }
    } else {
      byCountry.set(h.country!, (byCountry.get(h.country!) ?? 0) + value);
    }
  }
  return { byCountry, covered };
}

const MIN_CLASSIFICATION_COVERAGE = 0.3;
// "other"/"autre" ne sont pas des recommandations exploitables ("vous êtes concentré... sur
// du non-classé" n'aide personne) — jamais retenus comme secteur/pays dominant.
const SECTOR_CONCENTRATION_EXCLUDE: SectorKey[] = ['other', 'crypto'];

function sectorConcentration(
  holdings: Holding[],
  accountsById: Map<string, Account>,
  rates: FxRates,
  byType: Map<AccountType, number>
): Insight | null {
  const pool = classifiablePool(byType);
  if (pool <= 0) return null;
  const { bySector, covered } = aggregateBySector(holdings, accountsById, rates);
  if (covered / pool < MIN_CLASSIFICATION_COVERAGE) return null;

  let best: [SectorKey, number] | null = null;
  for (const entry of bySector) {
    if (SECTOR_CONCENTRATION_EXCLUDE.includes(entry[0])) continue;
    if (!best || entry[1] > best[1]) best = entry;
  }
  if (!best) return null;
  const share = best[1] / covered;
  if (share < 0.35) return null;
  return {
    id: 'sector-concentration',
    severity: share >= 0.55 ? 'warning' : 'info',
    key: 'diversification.sector_concentration',
    params: {
      pct: formatPct(share * 100),
      sector: SECTOR_LABELS[best[0]],
      coverage: formatPct((covered / pool) * 100),
    },
  };
}

function geoConcentration(
  holdings: Holding[],
  accountsById: Map<string, Account>,
  rates: FxRates,
  byType: Map<AccountType, number>
): Insight | null {
  const pool = classifiablePool(byType);
  if (pool <= 0) return null;
  const { byCountry, covered } = aggregateByCountry(holdings, accountsById, rates);
  if (covered / pool < MIN_CLASSIFICATION_COVERAGE) return null;

  let best: [CountryCode, number] | null = null;
  for (const entry of byCountry) {
    if (entry[0] === 'autre') continue;
    if (!best || entry[1] > best[1]) best = entry;
  }
  if (!best) return null;
  const share = best[1] / covered;
  if (share < 0.4) return null;
  return {
    id: 'geo-concentration',
    severity: share >= 0.6 ? 'warning' : 'info',
    key: 'diversification.geo_concentration',
    params: {
      pct: formatPct(share * 100),
      country: COUNTRY_LABELS[best[0]],
      coverage: formatPct((covered / pool) * 100),
    },
  };
}

export interface ClassificationBreakdown {
  /** Valeur EUR des poches où un secteur/pays a un sens (actions, ETF, PE, crypto). */
  classifiablePool: number;
  sectorCoverage: number; // 0..1
  topSectors: { sector: SectorKey; pct: number }[]; // part du total classifié secteur
  geoCoverage: number; // 0..1
  topCountries: { country: CountryCode; pct: number }[]; // part du total classifié pays
}

/** Pour l'écran Diversification : couverture + top 3 secteurs/pays, indépendamment des
 * seuils d'alerte utilisés par `computeInsights`. */
export function computeClassificationBreakdown(
  holdings: Holding[],
  accounts: Account[],
  rates: FxRates,
  byType: Map<AccountType, number>
): ClassificationBreakdown {
  const accountsById = new Map(accounts.map((a) => [a.id, a]));
  const pool = classifiablePool(byType);
  const { bySector, covered: sectorCovered } = aggregateBySector(holdings, accountsById, rates);
  const { byCountry, covered: countryCovered } = aggregateByCountry(holdings, accountsById, rates);

  const topSectors = [...bySector.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([sector, value]) => ({ sector, pct: sectorCovered > 0 ? (value / sectorCovered) * 100 : 0 }));
  const topCountries = [...byCountry.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([country, value]) => ({ country, pct: countryCovered > 0 ? (value / countryCovered) * 100 : 0 }));

  return {
    classifiablePool: pool,
    sectorCoverage: pool > 0 ? sectorCovered / pool : 0,
    topSectors,
    geoCoverage: pool > 0 ? countryCovered / pool : 0,
    topCountries,
  };
}

export function computeInsights(input: {
  accounts: Account[];
  holdings: Holding[];
  snapshots: Snapshot[];
  /** Valeur par type de compte, quote-part appliquée — même carte que `index.tsx` calcule
   * pour la répartition (immobilier déjà agrégé dedans). */
  byType: Map<AccountType, number>;
  /** Total correspondant à `byType` (net ou brut selon le réglage courant). */
  totalValue: number;
  rates: FxRates;
  objectives: Objective[];
  riskProfile: RiskProfile;
}): Insight[] {
  const { accounts, holdings, snapshots, byType, totalValue, rates, objectives, riskProfile } = input;
  if (totalValue <= 0) return [];

  const accountsById = new Map(accounts.map((a) => [a.id, a]));

  const checks = [
    typeConcentration(byType, totalValue),
    holdingConcentration(holdings, accountsById, rates, totalValue),
    cryptoExposure(byType, totalValue),
    illiquidExposure(byType, totalValue),
    currencyExposure(holdings, accountsById, rates, totalValue),
    cashCushion(accounts, holdings, snapshots, rates, objectives),
    allocationGap(byType, riskProfile),
    sectorConcentration(holdings, accountsById, rates, byType),
    geoConcentration(holdings, accountsById, rates, byType),
  ].filter((x): x is Insight => x !== null);

  if (checks.length === 0) {
    return [{ id: 'balanced', severity: 'positive', key: 'diversification.balanced' }];
  }

  return checks.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
