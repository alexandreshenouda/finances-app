/** Budget : flux récurrents ramenés au mois, capacité d'épargne, comparaison à
 *  l'épargne réellement constatée sur les comptes, repère 50/30/20.
 *  Diagnostics purement arithmétiques (aucune recommandation de produit). */
import { todayKey } from './format';
import { toEur } from './fx';
import { objectiveProgress } from './objectives';
import { accountShare, periodStart } from './portfolio';
import { loanStats } from './realestate';
import type {
  Account,
  BudgetCategory,
  BudgetFrequency,
  BudgetItem,
  BudgetKind,
  FxRates,
  Holding,
  Loan,
  Objective,
  Snapshot,
} from './types';

/** Nombre de mois couverts par une échéance de chaque périodicité. */
export const FREQUENCY_MONTHS: Record<BudgetFrequency, number> = { monthly: 1, quarterly: 3, yearly: 12 };

/** Montant mensualisé d'un flux (une taxe annuelle de 1 200 € pèse 100 €/mois). */
export function monthlyAmount(item: Pick<BudgetItem, 'amount' | 'frequency'>): number {
  return item.amount / FREQUENCY_MONTHS[item.frequency];
}

/** Ligne de budget mensualisée — saisie par l'utilisateur, ou dérivée d'un prêt (`auto`). */
export interface BudgetLine {
  id: string;
  kind: BudgetKind;
  label: string;
  category: BudgetCategory;
  /** Montant mensuel en EUR. */
  monthly: number;
  essential: boolean;
  /** Ligne calculée (mensualité d'un prêt de l'app), non modifiable depuis le budget. */
  auto?: boolean;
}

/** Mensualités (assurance incluse) des prêts en cours de remboursement, comme dépenses
 * vitales. Un prêt pas encore démarré ou déjà soldé ne pèse pas sur le budget. */
export function loanBudgetLines(loans: Loan[], rates: FxRates, today: string = todayKey()): BudgetLine[] {
  const lines: BudgetLine[] = [];
  for (const l of loans) {
    if (l.startDate > today) continue;
    const st = loanStats(l, today);
    if (st.remainingMonths <= 0) continue;
    const monthly = toEur(st.monthlyWithInsurance, l.currency ?? 'EUR', rates);
    if (!(monthly > 0)) continue;
    lines.push({ id: `loan:${l.id}`, kind: 'expense', label: l.name, category: 'credit', monthly, essential: true, auto: true });
  }
  return lines;
}

/** Toutes les lignes du budget : flux saisis + (optionnellement) mensualités de prêts. */
export function budgetLines(
  items: BudgetItem[],
  opts: { loans?: Loan[]; rates?: FxRates; includeLoans?: boolean; today?: string } = {}
): BudgetLine[] {
  const lines: BudgetLine[] = items.map((it) => ({
    id: it.id,
    kind: it.kind,
    label: it.label,
    category: it.category,
    monthly: monthlyAmount(it),
    essential: it.kind === 'expense' && !!it.essential,
  }));
  if (opts.includeLoans && opts.loans && opts.rates) {
    lines.push(...loanBudgetLines(opts.loans, opts.rates, opts.today));
  }
  return lines;
}

export interface BudgetSummary {
  /** Revenus mensuels. */
  income: number;
  /** Dépenses mensuelles (vitales + autres), hors épargne programmée. */
  expenses: number;
  essential: number;
  discretionary: number;
  /** Versements d'épargne programmés. */
  plannedSavings: number;
  /** Capacité d'épargne = revenus − dépenses (peut être négative). */
  capacity: number;
  /** Capacité non encore affectée = capacité − épargne programmée (peut être négative). */
  unallocated: number;
  /** Capacité / revenus (absent sans revenus). */
  savingsRate?: number;
  /** Dépenses vitales / revenus (absent sans revenus). */
  essentialRatio?: number;
  /** Dépenses par catégorie, de la plus lourde à la plus légère ; `pct` = part des dépenses. */
  byCategory: { category: BudgetCategory; monthly: number; pct: number }[];
}

export function budgetSummary(lines: BudgetLine[]): BudgetSummary {
  let income = 0;
  let essential = 0;
  let discretionary = 0;
  let plannedSavings = 0;
  const cats = new Map<BudgetCategory, number>();
  for (const l of lines) {
    if (l.kind === 'income') income += l.monthly;
    else if (l.kind === 'saving') plannedSavings += l.monthly;
    else {
      if (l.essential) essential += l.monthly;
      else discretionary += l.monthly;
      cats.set(l.category, (cats.get(l.category) ?? 0) + l.monthly);
    }
  }
  const expenses = essential + discretionary;
  const capacity = income - expenses;
  return {
    income,
    expenses,
    essential,
    discretionary,
    plannedSavings,
    capacity,
    unallocated: capacity - plannedSavings,
    savingsRate: income > 0 ? capacity / income : undefined,
    essentialRatio: income > 0 ? essential / income : undefined,
    byCategory: Array.from(cats, ([category, monthly]) => ({
      category,
      monthly,
      pct: expenses > 0 ? (monthly / expenses) * 100 : 0,
    })).sort((a, b) => b.monthly - a.monthly),
  };
}

// ─── Repère 50/30/20 ────────────────────────────────────────────────────────

export type BudgetRuleKey = 'needs' | 'wants' | 'savings';

/** Repère usuel de répartition des revenus : 50 % besoins, 30 % envies, 20 % épargne. */
export const BUDGET_RULE_TARGETS: Record<BudgetRuleKey, number> = { needs: 50, wants: 30, savings: 20 };

/** Part des revenus (en %) consacrée aux besoins, aux envies et à l'épargne (capacité),
 * face au repère 50/30/20. `undefined` sans revenus. */
export function budgetRule(s: BudgetSummary): { key: BudgetRuleKey; pct: number; target: number }[] | undefined {
  if (!(s.income > 0)) return undefined;
  const pct = (v: number) => (v / s.income) * 100;
  return [
    { key: 'needs', pct: pct(s.essential), target: BUDGET_RULE_TARGETS.needs },
    { key: 'wants', pct: pct(s.discretionary), target: BUDGET_RULE_TARGETS.wants },
    { key: 'savings', pct: pct(s.capacity), target: BUDGET_RULE_TARGETS.savings },
  ];
}

// ─── Épargne réellement constatée ───────────────────────────────────────────

/** Fenêtres proposées pour mesurer l'épargne réelle. */
export type SavingsPeriod = '3M' | '6M' | '1A';
export const SAVINGS_PERIODS: SavingsPeriod[] = ['3M', '6M', '1A'];

/** En dessous de cette durée d'historique, la moyenne mensuelle n'est pas significative. */
export const ACTUAL_SAVINGS_MIN_DAYS = 28;

const DAYS_PER_MONTH = 365.25 / 12;

export interface ActualSavings {
  /** Variation mensuelle moyenne des comptes (EUR/mois) ; absent si historique insuffisant. */
  monthly?: number;
  /** Variation totale sur la fenêtre (EUR). */
  delta: number;
  /** Début effectif de la fenêtre (YYYY-MM-DD) et durée en jours. */
  from?: string;
  days: number;
  /** Comptes pris en compte / ignorés faute de valeur connue au début de la fenêtre. */
  includedAccounts: number;
  skippedAccounts: number;
}

/**
 * Épargne constatée : variation de la valeur des comptes (quote-part appliquée) entre le
 * début de la fenêtre et aujourd'hui, ramenée au mois. Elle inclut la performance des
 * marchés — c'est une mesure de ce que les comptes ont réellement gagné, pas des seuls
 * versements. Un compte sans relevé au début de la fenêtre (créé en cours de route) est
 * ignoré : sa première valeur ferait passer un solde préexistant pour de l'épargne.
 */
export function actualSavings(
  accounts: Account[],
  snapshots: Snapshot[],
  period: SavingsPeriod,
  today: string = todayKey()
): ActualSavings {
  const active = accounts.filter((a) => !a.archived);
  const ids = new Set(active.map((a) => a.id));
  const byAccount = new Map<string, Snapshot[]>();
  let earliest: string | undefined;
  for (const s of snapshots) {
    if (!ids.has(s.accountId) || s.date > today) continue;
    const arr = byAccount.get(s.accountId) ?? [];
    arr.push(s);
    byAccount.set(s.accountId, arr);
    if (!earliest || s.date < earliest) earliest = s.date;
  }
  if (!earliest) return { delta: 0, days: 0, includedAccounts: 0, skippedAccounts: 0 };

  const start = periodStart(period, today)!;
  const from = start < earliest ? earliest : start;
  // Dates en UTC : un ratio de millisecondes en heure locale serait faussé par un changement d'heure.
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

  let delta = 0;
  let includedAccounts = 0;
  let skippedAccounts = 0;
  for (const a of active) {
    const arr = byAccount.get(a.id);
    if (!arr) continue;
    let base: Snapshot | undefined;
    let last: Snapshot | undefined;
    for (const s of arr) {
      if (s.date <= from && (!base || s.date > base.date)) base = s;
      if (!last || s.date > last.date) last = s;
    }
    if (!base || !last) {
      skippedAccounts++;
      continue;
    }
    includedAccounts++;
    delta += (last.value - base.value) * accountShare(a);
  }

  return {
    monthly: days >= ACTUAL_SAVINGS_MIN_DAYS && includedAccounts > 0 ? delta / (days / DAYS_PER_MONTH) : undefined,
    delta,
    from,
    days,
    includedAccounts,
    skippedAccounts,
  };
}

export type SavingsGapStatus = 'aligned' | 'below' | 'above';

/** Écart toléré entre épargne théorique et constatée avant de le signaler :
 * 10 % de la capacité, avec un plancher de 50 €/mois. */
export const SAVINGS_GAP_TOLERANCE_PCT = 0.1;
export const SAVINGS_GAP_TOLERANCE_MIN = 50;

/** Compare l'épargne constatée à la capacité théorique du budget. */
export function compareSavings(capacity: number, actualMonthly: number): { gap: number; status: SavingsGapStatus } {
  const gap = actualMonthly - capacity;
  const tolerance = Math.max(SAVINGS_GAP_TOLERANCE_MIN, Math.abs(capacity) * SAVINGS_GAP_TOLERANCE_PCT);
  return { gap, status: Math.abs(gap) <= tolerance ? 'aligned' : gap < 0 ? 'below' : 'above' };
}

// ─── Lien avec les objectifs ────────────────────────────────────────────────

/** Effort mensuel total demandé par les objectifs datés non encore atteints (EUR/mois). */
export function objectivesMonthlyEffort(
  objectives: Objective[],
  ctx: { accounts: Account[]; holdings: Holding[]; snapshots: Snapshot[]; rates: FxRates }
): number {
  return objectives.reduce(
    (sum, o) => sum + (objectiveProgress(o, { ...ctx, objectives }).monthlyContribution ?? 0),
    0
  );
}
