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
