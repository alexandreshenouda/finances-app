/** Suggestions de diversification calculées localement (aucune IA/réseau) : des règles à
 * seuils sur les données déjà en mémoire (comptes, lignes, objectifs), triées par sévérité
 * puis par catégorie. Chaque `Insight` porte un triptyque complet (constat, pourquoi c'est
 * important, piste d'action conforme AMF). */
import { formatDate, formatDuration, formatEur, formatPct, monthsBetween, todayKey } from './format';
import { cashAndLivretTotal, epargnePrecautionTarget } from './objectives';
import { accountCurrentValue, accountShare, holdingCurrency, holdingValueEur } from './portfolio';
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

export type InsightCategory =
  | 'fiscal'
  | 'overlap'
  | 'fees'
  | 'allocation'
  | 'rebalancing'
  | 'liquidity'
  | 'horizon'
  | 'risk';

export interface Insight {
  id: string;
  severity: InsightSeverity;
  category: InsightCategory;
  titleKey: string;
  observationKey: string;
  whyKey?: string;
  actionKey?: string;
  params?: Record<string, string | number>;
}

const SEVERITY_RANK: Record<InsightSeverity, number> = { warning: 0, info: 1, positive: 2 };

function ownedHoldingValue(h: Holding, accounts: Map<string, Account>, rates: FxRates): number {
  const account = accounts.get(h.accountId);
  return holdingValueEur(h, account, rates) * (account ? accountShare(account) : 1);
}

function typeShare(byType: Map<AccountType, number>, types: AccountType[], total: number): number {
  let sum = 0;
  for (const t of types) sum += byType.get(t) ?? 0;
  return sum / total;
}

// ─── 1. Concentrations par type de compte & mono-ligne ────────────────────────────────

function typeConcentration(byType: Map<AccountType, number>, total: number): Insight | null {
  let best: [AccountType, number] | null = null;
  for (const entry of byType) if (!best || entry[1] > best[1]) best = entry;
  if (!best) return null;
  const share = best[1] / total;
  if (share < 0.45) return null;
  return {
    id: 'type-concentration',
    severity: share >= 0.7 ? 'warning' : 'info',
    category: 'risk',
    titleKey: 'diversification.type_concentration_title',
    observationKey: 'diversification.type_concentration',
    whyKey: 'diversification.type_concentration_why',
    actionKey: 'diversification.type_concentration_action',
    params: { pct: formatPct(share * 100), type: ACCOUNT_TYPE_LABELS[best[0]] },
  };
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
    category: 'risk',
    titleKey: 'diversification.holding_concentration_title',
    observationKey: 'diversification.holding_concentration',
    whyKey: 'diversification.holding_concentration_why',
    actionKey: 'diversification.holding_concentration_action',
    params: { pct: formatPct(share * 100), name: best.name },
  };
}

// ─── 2. Look-Through Overlap (Faux doublons d'ETF) ────────────────────────────────────

function lookThroughOverlap(
  holdings: Holding[],
  accountsById: Map<string, Account>,
  rates: FxRates,
  byType: Map<AccountType, number>
): Insight | null {
  const equityPool =
    (byType.get('pea') ?? 0) +
    (byType.get('cto') ?? 0) +
    (byType.get('assurance_vie') ?? 0) +
    (byType.get('private_equity') ?? 0);
  if (equityPool <= 0) return null;

  interface CompanyExposure {
    name: string;
    totalValue: number;
    holdingNames: Set<string>;
  }

  const companyMap = new Map<string, CompanyExposure>();

  for (const h of holdings) {
    const hVal = ownedHoldingValue(h, accountsById, rates);
    if (hVal <= 0) continue;

    if (h.topHoldings && h.topHoldings.length > 0) {
      for (const item of h.topHoldings) {
        if (!item.name || !item.weight) continue;
        const normKey = (item.isin || item.name).trim().toUpperCase();
        const cur = companyMap.get(normKey) ?? { name: item.name, totalValue: 0, holdingNames: new Set() };
        cur.totalValue += hVal * item.weight;
        cur.holdingNames.add(h.name);
        companyMap.set(normKey, cur);
      }
    } else if (
      h.sectorWeights &&
      h.sectorWeights.length === 1 &&
      h.sectorWeights[0].sector !== 'other' &&
      h.sectorWeights[0].sector !== 'crypto'
    ) {
      const normKey = (h.isin || h.name).trim().toUpperCase();
      const cur = companyMap.get(normKey) ?? { name: h.name, totalValue: 0, holdingNames: new Set() };
      cur.totalValue += hVal;
      cur.holdingNames.add(h.name);
      companyMap.set(normKey, cur);
    }
  }

  let worst: CompanyExposure | null = null;
  for (const exp of companyMap.values()) {
    if (exp.holdingNames.size >= 2) {
      if (!worst || exp.totalValue > worst.totalValue) {
        worst = exp;
      }
    }
  }

  if (!worst) return null;
  const shareOfEquity = worst.totalValue / equityPool;
  if (shareOfEquity < 0.05 && worst.totalValue < 2000) return null;

  const fundsList = Array.from(worst.holdingNames).slice(0, 3).join(', ');
  return {
    id: `overlap-${worst.name.slice(0, 12)}`,
    severity: shareOfEquity >= 0.12 ? 'warning' : 'info',
    category: 'overlap',
    titleKey: 'diversification.overlap_title',
    observationKey: 'diversification.overlap_obs',
    whyKey: 'diversification.overlap_why',
    actionKey: 'diversification.overlap_action',
    params: {
      company: worst.name,
      count: worst.holdingNames.size,
      funds: fundsList,
      pct: formatPct(shareOfEquity * 100),
      amount: formatEur(worst.totalValue),
    },
  };
}

// ─── 3. Audit des Frais de Gestion (TER & Enveloppe) ───────────────────────────────────

function portfolioFeeAudit(
  holdings: Holding[],
  accounts: Account[],
  accountsById: Map<string, Account>,
  rates: FxRates
): Insight | null {
  let totalInvestedWithFees = 0;
  let totalAnnualFeeEur = 0;
  let maxHoldingFee: { name: string; pct: number } | null = null;
  let expensiveCount = 0;

  for (const h of holdings) {
    const val = ownedHoldingValue(h, accountsById, rates);
    if (val <= 0) continue;

    const acc = accountsById.get(h.accountId);
    const accMgmt = acc?.fees?.managementPct ?? 0;
    const holdingFee = h.feesPct ?? 0;
    const combinedFeePct = holdingFee + accMgmt;

    if (holdingFee > 0 || accMgmt > 0) {
      totalInvestedWithFees += val;
      totalAnnualFeeEur += val * (combinedFeePct / 100);
    }

    if (holdingFee >= 1.2) {
      expensiveCount++;
      if (!maxHoldingFee || holdingFee > maxHoldingFee.pct) {
        maxHoldingFee = { name: h.name, pct: holdingFee };
      }
    }
  }

  if (totalInvestedWithFees <= 0) return null;
  const weightedFeePct = (totalAnnualFeeEur / totalInvestedWithFees) * 100;

  if (weightedFeePct < 0.85 && !maxHoldingFee) return null;

  const severity: InsightSeverity = weightedFeePct >= 1.3 || expensiveCount >= 2 ? 'warning' : 'info';
  return {
    id: 'portfolio-fees',
    severity,
    category: 'fees',
    titleKey: 'diversification.fees_title',
    observationKey: 'diversification.fees_obs',
    whyKey: 'diversification.fees_why',
    actionKey: 'diversification.fees_action',
    params: {
      avgPct: formatPct(weightedFeePct),
      annualCost: formatEur(totalAnnualFeeEur),
      expensiveName: maxHoldingFee?.name ?? '',
      expensivePct: maxHoldingFee ? formatPct(maxHoldingFee.pct) : '',
    },
  };
}

// ─── 4. Spécificités PEA (5 ans, plafonds, prise de date) ──────────────────────────────

function peaFiscalAdvice(
  accounts: Account[],
  holdings: Holding[],
  snapshots: Snapshot[],
  rates: FxRates
): Insight[] {
  const peaAccounts = accounts.filter((a) => a.type === 'pea' && !a.archived);
  const ctoAccounts = accounts.filter((a) => a.type === 'cto' && !a.archived);
  const insights: Insight[] = [];

  // Si l'utilisateur possède un CTO mais pas de PEA
  if (peaAccounts.length === 0) {
    const ctoValue = ctoAccounts.reduce(
      (sum, a) => sum + accountCurrentValue(a, holdings, snapshots, rates) * accountShare(a),
      0
    );
    if (ctoValue > 1000) {
      insights.push({
        id: 'pea-missing',
        severity: 'info',
        category: 'fiscal',
        titleKey: 'diversification.pea_missing_title',
        observationKey: 'diversification.pea_missing_obs',
        whyKey: 'diversification.pea_missing_why',
        actionKey: 'diversification.pea_missing_action',
      });
    }
    return insights;
  }

  const today = todayKey();
  for (const pea of peaAccounts) {
    const val = accountCurrentValue(pea, holdings, snapshots, rates) * accountShare(pea);
    if (!pea.openingDate) {
      insights.push({
        id: `pea-no-date-${pea.id}`,
        severity: 'info',
        category: 'fiscal',
        titleKey: 'diversification.pea_no_date_title',
        observationKey: 'diversification.pea_no_date_obs',
        whyKey: 'diversification.pea_no_date_why',
        actionKey: 'diversification.pea_no_date_action',
        params: { name: pea.name },
      });
    } else {
      const monthsHeld = monthsBetween(pea.openingDate, today);
      if (monthsHeld < 60) {
        const remMonths = 60 - monthsHeld;
        insights.push({
          id: `pea-under-5-${pea.id}`,
          severity: 'info',
          category: 'fiscal',
          titleKey: 'diversification.pea_under_5_title',
          observationKey: 'diversification.pea_under_5_obs',
          whyKey: 'diversification.pea_under_5_why',
          actionKey: 'diversification.pea_under_5_action',
          params: {
            name: pea.name,
            duration: formatDuration(Math.max(0, monthsHeld)),
            remaining: formatDuration(remMonths),
          },
        });
      } else {
        insights.push({
          id: `pea-mature-${pea.id}`,
          severity: 'positive',
          category: 'fiscal',
          titleKey: 'diversification.pea_mature_title',
          observationKey: 'diversification.pea_mature_obs',
          whyKey: 'diversification.pea_mature_why',
          actionKey: 'diversification.pea_mature_action',
          params: {
            name: pea.name,
            duration: formatDuration(monthsHeld),
          },
        });
      }
    }

    // Plafond des versements (150 000 €)
    if (val >= 135000) {
      insights.push({
        id: `pea-ceiling-${pea.id}`,
        severity: 'info',
        category: 'fiscal',
        titleKey: 'diversification.pea_ceiling_title',
        observationKey: 'diversification.pea_ceiling_obs',
        whyKey: 'diversification.pea_ceiling_why',
        actionKey: 'diversification.pea_ceiling_action',
        params: {
          name: pea.name,
          amount: formatEur(val),
        },
      });
    }
  }

  return insights;
}

// ─── 5. Spécificités Assurance-Vie (8 ans, frais d'enveloppe) ──────────────────────────

function assuranceVieFiscalAdvice(
  accounts: Account[],
  holdings: Holding[],
  snapshots: Snapshot[],
  rates: FxRates,
  totalValue: number
): Insight[] {
  const avAccounts = accounts.filter((a) => a.type === 'assurance_vie' && !a.archived);
  const insights: Insight[] = [];

  if (avAccounts.length === 0 && totalValue >= 10000) {
    insights.push({
      id: 'av-missing',
      severity: 'info',
      category: 'fiscal',
      titleKey: 'diversification.av_missing_title',
      observationKey: 'diversification.av_missing_obs',
      whyKey: 'diversification.av_missing_why',
      actionKey: 'diversification.av_missing_action',
    });
    return insights;
  }

  const today = todayKey();
  for (const av of avAccounts) {
    if (!av.openingDate) {
      insights.push({
        id: `av-no-date-${av.id}`,
        severity: 'info',
        category: 'fiscal',
        titleKey: 'diversification.av_no_date_title',
        observationKey: 'diversification.av_no_date_obs',
        whyKey: 'diversification.av_no_date_why',
        actionKey: 'diversification.av_no_date_action',
        params: { name: av.name },
      });
    } else {
      const monthsHeld = monthsBetween(av.openingDate, today);
      if (monthsHeld < 96) {
        const remMonths = 96 - monthsHeld;
        insights.push({
          id: `av-under-8-${av.id}`,
          severity: 'info',
          category: 'fiscal',
          titleKey: 'diversification.av_under_8_title',
          observationKey: 'diversification.av_under_8_obs',
          whyKey: 'diversification.av_under_8_why',
          actionKey: 'diversification.av_under_8_action',
          params: {
            name: av.name,
            duration: formatDuration(Math.max(0, monthsHeld)),
            remaining: formatDuration(remMonths),
          },
        });
      } else {
        insights.push({
          id: `av-mature-${av.id}`,
          severity: 'positive',
          category: 'fiscal',
          titleKey: 'diversification.av_mature_title',
          observationKey: 'diversification.av_mature_obs',
          whyKey: 'diversification.av_mature_why',
          actionKey: 'diversification.av_mature_action',
          params: {
            name: av.name,
            duration: formatDuration(monthsHeld),
          },
        });
      }
    }

    // Frais d'enveloppe élevés (> 0.85 % de gestion ou frais d'entrée > 0)
    if ((av.fees?.managementPct ?? 0) >= 0.85 || (av.fees?.entryPct ?? 0) > 0) {
      insights.push({
        id: `av-high-fees-${av.id}`,
        severity: 'warning',
        category: 'fees',
        titleKey: 'diversification.av_fees_title',
        observationKey: 'diversification.av_fees_obs',
        whyKey: 'diversification.av_fees_why',
        actionKey: 'diversification.av_fees_action',
        params: {
          name: av.name,
          mgmtPct: formatPct(av.fees?.managementPct ?? 0),
          entryPct: formatPct(av.fees?.entryPct ?? 0),
        },
      });
    }
  }

  return insights;
}

// ─── 6. Trésorerie dormante (compte courant vs livrets) ────────────────────────────────

function idleCashAudit(
  accounts: Account[],
  holdings: Holding[],
  snapshots: Snapshot[],
  rates: FxRates,
  objectives: Objective[]
): Insight | null {
  const courants = accounts.filter((a) => a.type === 'courant' && !a.archived);
  const totalCourant = courants.reduce(
    (sum, a) => sum + accountCurrentValue(a, holdings, snapshots, rates) * accountShare(a),
    0
  );

  const epargnePrecaution = objectives.find((o) => o.category === 'epargne_precaution');
  const monthlyExpenses = epargnePrecaution?.monthlyExpenses ?? 1500;
  const reasonableThreshold = Math.max(3000, monthlyExpenses * 2);

  if (totalCourant <= reasonableThreshold) return null;

  return {
    id: 'idle-cash',
    severity: totalCourant >= reasonableThreshold * 2.5 ? 'warning' : 'info',
    category: 'liquidity',
    titleKey: 'diversification.idle_cash_title',
    observationKey: 'diversification.idle_cash_obs',
    whyKey: 'diversification.idle_cash_why',
    actionKey: 'diversification.idle_cash_action',
    params: {
      amount: formatEur(totalCourant),
      threshold: formatEur(reasonableThreshold),
    },
  };
}

// ─── 7. Adéquation Horizon / Risque ───────────────────────────────────────────────────

function horizonRiskAdequacy(
  objectives: Objective[],
  byType: Map<AccountType, number>,
  totalValue: number
): Insight[] {
  const insights: Insight[] = [];
  const today = todayKey();

  const liquidPool = (byType.get('courant') ?? 0) + (byType.get('livret') ?? 0);
  const volatilePool = (byType.get('pea') ?? 0) + (byType.get('cto') ?? 0) + (byType.get('crypto') ?? 0);

  for (const obj of objectives) {
    const isShortTerm =
      obj.category === 'projet_court_terme' ||
      (obj.deadline && monthsBetween(today, obj.deadline) <= 24 && monthsBetween(today, obj.deadline) > 0);

    if (isShortTerm) {
      const target = obj.targetAmount ?? 0;
      if (target > 2000 && liquidPool < target * 0.65 && volatilePool > target * 0.5) {
        insights.push({
          id: `horizon-short-${obj.id}`,
          severity: 'warning',
          category: 'horizon',
          titleKey: 'diversification.horizon_short_title',
          observationKey: 'diversification.horizon_short_obs',
          whyKey: 'diversification.horizon_short_why',
          actionKey: 'diversification.horizon_short_action',
          params: {
            name: obj.name || 'Projet court terme',
            amount: formatEur(target),
            deadline: obj.deadline ? formatDate(obj.deadline) : '',
          },
        });
        break;
      }
    }
  }

  const hasLongTermObj = objectives.some((o) => o.category === 'projet_long_terme');
  if (hasLongTermObj && totalValue > 10000 && liquidPool / totalValue > 0.85) {
    insights.push({
      id: 'horizon-long-inflation',
      severity: 'info',
      category: 'horizon',
      titleKey: 'diversification.horizon_long_title',
      observationKey: 'diversification.horizon_long_obs',
      whyKey: 'diversification.horizon_long_why',
      actionKey: 'diversification.horizon_long_action',
      params: {
        pct: formatPct((liquidPool / totalValue) * 100),
      },
    });
  }

  return insights;
}

// ─── 8. Risques d'actifs spécifiques (crypto, devises, illiquidité) ───────────────────

function cryptoExposure(byType: Map<AccountType, number>, total: number): Insight | null {
  const share = typeShare(byType, ['crypto'], total);
  if (share < 0.1) return null;
  return {
    id: 'crypto-exposure',
    severity: share >= 0.2 ? 'warning' : 'info',
    category: 'risk',
    titleKey: 'diversification.crypto_exposure_title',
    observationKey: 'diversification.crypto_exposure',
    whyKey: 'diversification.crypto_exposure_why',
    actionKey: 'diversification.crypto_exposure_action',
    params: { pct: formatPct(share * 100) },
  };
}

function illiquidExposure(byType: Map<AccountType, number>, total: number): Insight | null {
  const share = typeShare(byType, ['immobilier', 'per'], total);
  if (share < 0.65) return null;
  return {
    id: 'illiquid-exposure',
    severity: share >= 0.8 ? 'warning' : 'info',
    category: 'liquidity',
    titleKey: 'diversification.illiquid_exposure_title',
    observationKey: 'diversification.illiquid_exposure',
    whyKey: 'diversification.illiquid_exposure_why',
    actionKey: 'diversification.illiquid_exposure_action',
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
    category: 'risk',
    titleKey: 'diversification.currency_exposure_title',
    observationKey: 'diversification.currency_exposure',
    whyKey: 'diversification.currency_exposure_why',
    actionKey: 'diversification.currency_exposure_action',
    params: { pct: formatPct(share * 100), currency: best[0] },
  };
}

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
      category: 'liquidity',
      titleKey: 'diversification.cash_cushion_low_title',
      observationKey: 'diversification.cash_cushion_low',
      whyKey: 'diversification.cash_cushion_low_why',
      actionKey: 'diversification.cash_cushion_low_action',
      params: { pct: formatPct(ratio * 100) },
    };
  }
  if (ratio > 2) {
    return {
      id: 'cash-cushion-high',
      severity: 'info',
      category: 'liquidity',
      titleKey: 'diversification.cash_cushion_high_title',
      observationKey: 'diversification.cash_cushion_high',
      whyKey: 'diversification.cash_cushion_high_why',
      actionKey: 'diversification.cash_cushion_high_action',
      params: { pct: formatPct(ratio * 100) },
    };
  }
  return null;
}

// ─── 9. Répartition de référence & Rééquilibrage par les flux ─────────────────────────

const BUCKET_TYPES: Record<AllocationBucket, AccountType[]> = {
  liquidites: ['courant', 'livret'],
  fonds_euro_per: ['assurance_vie', 'per'],
  actions_marches: ['pea', 'cto', 'private_equity'],
  crypto: ['crypto'],
};

const BUCKET_ORDER: AllocationBucket[] = ['liquidites', 'fonds_euro_per', 'actions_marches', 'crypto'];

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
  modeledTotal: number;
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
    category: 'rebalancing',
    titleKey: 'diversification.allocation_gap_title',
    observationKey: over ? 'diversification.allocation_gap_over' : 'diversification.allocation_gap_under',
    whyKey: 'diversification.allocation_gap_why',
    actionKey: over ? 'diversification.allocation_gap_over_action' : 'diversification.allocation_gap_under_action',
    params: {
      bucket: ALLOCATION_BUCKET_LABELS[worst.bucket],
      targetPct: formatPct(worst.targetPct),
      actualPct: formatPct(worst.actualPct),
    },
  };
}

// ─── 10. Diversification sectorielle / géographique ───────────────────────────────────

function classifiablePool(byType: Map<AccountType, number>): number {
  return (
    (byType.get('pea') ?? 0) +
    (byType.get('cto') ?? 0) +
    (byType.get('private_equity') ?? 0) +
    (byType.get('crypto') ?? 0)
  );
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
    category: 'risk',
    titleKey: 'diversification.sector_concentration_title',
    observationKey: 'diversification.sector_concentration',
    whyKey: 'diversification.sector_concentration_why',
    actionKey: 'diversification.sector_concentration_action',
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
    category: 'risk',
    titleKey: 'diversification.geo_concentration_title',
    observationKey: 'diversification.geo_concentration',
    whyKey: 'diversification.geo_concentration_why',
    actionKey: 'diversification.geo_concentration_action',
    params: {
      pct: formatPct(share * 100),
      country: COUNTRY_LABELS[best[0]],
      coverage: formatPct((covered / pool) * 100),
    },
  };
}

export interface ClassificationBreakdown {
  classifiablePool: number;
  sectorCoverage: number;
  topSectors: { sector: SectorKey; pct: number }[];
  geoCoverage: number;
  topCountries: { country: CountryCode; pct: number }[];
}

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
    .slice(0, 5)
    .map(([sector, value]) => ({ sector, pct: sectorCovered > 0 ? (value / sectorCovered) * 100 : 0 }));
  const topCountries = [...byCountry.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
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
  byType: Map<AccountType, number>;
  totalValue: number;
  rates: FxRates;
  objectives: Objective[];
  riskProfile: RiskProfile;
}): Insight[] {
  const { accounts, holdings, snapshots, byType, totalValue, rates, objectives, riskProfile } = input;
  if (totalValue <= 0) return [];

  const accountsById = new Map(accounts.map((a) => [a.id, a]));

  const singleChecks: (Insight | null)[] = [
    typeConcentration(byType, totalValue),
    holdingConcentration(holdings, accountsById, rates, totalValue),
    lookThroughOverlap(holdings, accountsById, rates, byType),
    portfolioFeeAudit(holdings, accounts, accountsById, rates),
    idleCashAudit(accounts, holdings, snapshots, rates, objectives),
    cryptoExposure(byType, totalValue),
    illiquidExposure(byType, totalValue),
    currencyExposure(holdings, accountsById, rates, totalValue),
    cashCushion(accounts, holdings, snapshots, rates, objectives),
    allocationGap(byType, riskProfile),
    sectorConcentration(holdings, accountsById, rates, byType),
    geoConcentration(holdings, accountsById, rates, byType),
  ];

  const multiChecks: Insight[] = [
    ...peaFiscalAdvice(accounts, holdings, snapshots, rates),
    ...assuranceVieFiscalAdvice(accounts, holdings, snapshots, rates, totalValue),
    ...horizonRiskAdequacy(objectives, byType, totalValue),
  ];

  const all = [...singleChecks.filter((x): x is Insight => x !== null), ...multiChecks];

  if (all.length === 0) {
    return [
      {
        id: 'balanced',
        severity: 'positive',
        category: 'allocation',
        titleKey: 'diversification.balanced_title',
        observationKey: 'diversification.balanced_obs',
        whyKey: 'diversification.balanced_why',
        actionKey: 'diversification.balanced_action',
      },
    ];
  }

  return all.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
