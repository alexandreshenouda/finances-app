/** Calculs de progression des objectifs financiers (épargne, projets). */
import { accountCurrentValue, accountShare } from './portfolio';
import type { Account, FxRates, Holding, Objective, Snapshot } from './types';

/** Total des comptes « livret » + « courant », quote-part appliquée (EUR).
 * Base de l'épargne de précaution et des projets à court terme (pool 100% liquide). */
export function cashAndLivretTotal(
  accounts: Account[],
  holdings: Holding[],
  snapshots: Snapshot[],
  rates: FxRates
): number {
  return accounts
    .filter((a) => !a.archived && (a.type === 'livret' || a.type === 'courant'))
    .reduce((sum, a) => sum + accountCurrentValue(a, holdings, snapshots, rates) * accountShare(a), 0);
}

/** Total de tous les comptes hors biens immobiliers, quote-part appliquée (EUR).
 * Base des projets à long terme. */
export function totalExcludingRealEstate(
  accounts: Account[],
  holdings: Holding[],
  snapshots: Snapshot[],
  rates: FxRates
): number {
  return accounts
    .filter((a) => !a.archived)
    .reduce((sum, a) => sum + accountCurrentValue(a, holdings, snapshots, rates) * accountShare(a), 0);
}

/** Somme des cibles d'épargne de précaution définies (normalement une seule). */
export function epargnePrecautionTarget(objectives: Objective[]): number {
  return objectives
    .filter((o) => o.category === 'epargne_precaution')
    .reduce((sum, o) => sum + (o.securityMonths ?? 0) * (o.monthlyExpenses ?? 0), 0);
}

// ─── Suggestion d'épargne de précaution ─────────────────────────────────────

/** Situation budgétaire déduite du poids des dépenses vitales dans les revenus. */
export type PrecautionBudget = 'unknown' | 'comfortable' | 'tight' | 'deficit';

/** Paliers de la suggestion : à partir de `minRatio` (dépenses vitales / revenus nets),
 * on recommande `months` mois de dépenses vitales. Plus les dépenses incompressibles
 * pèsent lourd, moins le budget absorbe une baisse de revenus (chômage, arrêt maladie,
 * imprévu) et plus le matelas doit être épais. Triés par ratio décroissant. */
export const PRECAUTION_MONTHS_TIERS: { minRatio: number; months: number }[] = [
  { minRatio: 0.85, months: 6 },
  { minRatio: 0.7, months: 5 },
  { minRatio: 0.5, months: 4 },
  { minRatio: 0, months: 3 },
];

/** Durée suggérée quand les revenus ne sont pas renseignés (recommandation usuelle). */
export const PRECAUTION_DEFAULT_MONTHS = 3;

/** Au-delà de ce ratio dépenses vitales / revenus, le budget est jugé tendu. */
export const PRECAUTION_TIGHT_RATIO = 0.7;

/** Part de la marge mensuelle (revenus − dépenses vitales) qu'on propose de consacrer
 * à la constitution du matelas tant qu'il n'est pas atteint. */
export const PRECAUTION_MARGIN_SHARE = 0.5;

export interface PrecautionSuggestion {
  /** Nombre de mois de dépenses vitales suggéré. */
  months: number;
  /** Montant suggéré = months × dépenses vitales (EUR). */
  amount: number;
  budget: PrecautionBudget;
  /** Dépenses vitales / revenus nets (absent sans revenus). */
  vitalRatio?: number;
  /** Revenus nets − dépenses vitales, en EUR/mois (absent sans revenus, peut être négatif). */
  monthlyMargin?: number;
}

/** Suggère un montant d'épargne de précaution à partir des dépenses vitales mensuelles
 * et (optionnellement) des revenus nets mensuels. `null` sans dépenses vitales. */
export function suggestPrecaution(vitalExpenses?: number, monthlyIncome?: number): PrecautionSuggestion | null {
  if (!vitalExpenses || !(vitalExpenses > 0)) return null;
  if (!monthlyIncome || !(monthlyIncome > 0)) {
    return {
      months: PRECAUTION_DEFAULT_MONTHS,
      amount: PRECAUTION_DEFAULT_MONTHS * vitalExpenses,
      budget: 'unknown',
    };
  }
  const vitalRatio = vitalExpenses / monthlyIncome;
  const months = PRECAUTION_MONTHS_TIERS.find((t) => vitalRatio >= t.minRatio)!.months;
  const budget: PrecautionBudget =
    vitalRatio >= 1 ? 'deficit' : vitalRatio >= PRECAUTION_TIGHT_RATIO ? 'tight' : 'comfortable';
  return {
    months,
    amount: months * vitalExpenses,
    budget,
    vitalRatio,
    monthlyMargin: monthlyIncome - vitalExpenses,
  };
}

/** Nombre de mois pour combler `shortfall` en y consacrant `PRECAUTION_MARGIN_SHARE` de la
 * marge mensuelle. `undefined` si rien à combler ou si la marge est nulle/négative. */
export function precautionBuildPlan(
  shortfall: number,
  monthlyMargin?: number
): { monthly: number; months: number } | undefined {
  if (!(shortfall > 0) || monthlyMargin === undefined || !(monthlyMargin > 0)) return undefined;
  const monthly = monthlyMargin * PRECAUTION_MARGIN_SHARE;
  return { monthly, months: Math.ceil(shortfall / monthly) };
}

/** Nombre de mois entiers entre aujourd'hui et l'échéance, au moins 1. */
export function monthsUntil(deadline: string, today = new Date()): number {
  const d = new Date(`${deadline}T12:00:00`);
  const months = (d.getFullYear() - today.getFullYear()) * 12 + (d.getMonth() - today.getMonth());
  return Math.max(1, months);
}

export interface ObjectiveProgress {
  current: number;
  target: number;
  pct: number;
  monthlyContribution?: number;
  monthsRemaining?: number;
}

export function objectiveProgress(
  objective: Objective,
  ctx: { accounts: Account[]; holdings: Holding[]; snapshots: Snapshot[]; rates: FxRates; objectives: Objective[] }
): ObjectiveProgress {
  const { accounts, holdings, snapshots, rates, objectives } = ctx;

  if (objective.category === 'epargne_precaution') {
    const target = (objective.securityMonths ?? 0) * (objective.monthlyExpenses ?? 0);
    const current = cashAndLivretTotal(accounts, holdings, snapshots, rates);
    return { current, target, pct: target > 0 ? (current / target) * 100 : 0 };
  }

  const reserved = epargnePrecautionTarget(objectives);
  const pool =
    objective.category === 'projet_long_terme'
      ? totalExcludingRealEstate(accounts, holdings, snapshots, rates)
      : cashAndLivretTotal(accounts, holdings, snapshots, rates);
  const buffer = objective.category === 'projet_long_terme' ? (objective.bufferAmount ?? 0) : 0;
  const current = Math.max(0, pool - reserved - buffer);
  const target = objective.targetAmount ?? 0;
  const pct = target > 0 ? (current / target) * 100 : 0;

  let monthlyContribution: number | undefined;
  let monthsRemaining: number | undefined;
  if (objective.deadline) {
    monthsRemaining = monthsUntil(objective.deadline);
    monthlyContribution = Math.max(0, target - current) / monthsRemaining;
  }

  return { current, target, pct, monthlyContribution, monthsRemaining };
}
