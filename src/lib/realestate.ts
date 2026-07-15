/** Calculs immobiliers : amortissement des crédits, valorisation des biens,
 *  et courbe patrimoniale combinée (comptes + immobilier).
 *  Convention identique à portfolio.ts : montants saisis dans la devise du
 *  bien/prêt, valeurs agrégées en EUR. */
import { toEur } from './fx';
import { addDays, todayKey } from './format';
import { accountShare, buildSeries, periodStart, type SeriesPoint } from './portfolio';
import { houseIndexValueAt } from './prices/houseIndex';
import type { Account, FxRates, HousePricePoint, Loan, Period, Property, Snapshot } from './types';

// ─── Dates ───────────────────────────────────────────────────────────────────

/** Nombre de mois pleins écoulés entre deux jours YYYY-MM-DD (peut être négatif). */
export function monthsBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1; // le mois courant n'est pas encore « plein »
  return m;
}

/** Ajoute `n` mois à un jour YYYY-MM-DD (borne au dernier jour du mois cible). */
export function addMonths(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

// ─── Crédits (amortissement : mensualités constantes ou paliers) ─────────────

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Un prêt est « à paliers » s'il définit une liste de paliers non vide. */
function isStepped(loan: Loan): boolean {
  return Array.isArray(loan.steps) && loan.steps.length > 0;
}

/** Durée effective du prêt en mois (somme des paliers, sinon `termMonths`). */
export function loanTermMonths(loan: Loan): number {
  if (isStepped(loan)) return loan.steps!.reduce((s, st) => s + Math.max(0, Math.round(st.months)), 0);
  return Math.max(0, Math.round(loan.termMonths));
}

/** Mensualité amortissant intégralement `balance` sur `n` mois au taux mensuel `i`. */
function annuity(balance: number, i: number, n: number): number {
  if (n <= 0) return balance;
  if (i === 0) return balance / n;
  return (balance * i) / (1 - Math.pow(1 + i, -n));
}

/** Liste normalisée des paliers (un prêt classique = un seul palier). */
function stepsOf(loan: Loan): { months: number; payment?: number }[] {
  if (isStepped(loan)) {
    return loan.steps!.map((st) => ({ months: Math.max(0, Math.round(st.months)), payment: st.monthlyPayment }));
  }
  return [{ months: loanTermMonths(loan), payment: loan.monthlyPayment }];
}

/** Mensualité (hors assurance) de chaque mois 1..N, paliers « auto » résolus. */
function paymentsArray(loan: Loan): number[] {
  const i = loan.annualRate / 100 / 12;
  const steps = stepsOf(loan);
  let remaining = steps.reduce((s, st) => s + st.months, 0);
  let balance = loan.principal;
  const out: number[] = [];
  for (const st of steps) {
    // Palier « auto » (mensualité absente) : annuité soldant le capital courant
    // sur toute la durée restante du prêt. Une valeur saisie (même 0 = différé) prime.
    const pay = st.payment !== undefined && st.payment >= 0 ? st.payment : annuity(balance, i, remaining);
    for (let m = 0; m < st.months; m++) {
      out.push(pay);
      balance = Math.max(0, balance + balance * i - pay);
      remaining--;
    }
  }
  return out;
}

/** Capital restant dû après chaque échéance (index 0..N), mémoïsé par objet prêt. */
const balancesCache = new WeakMap<Loan, number[]>();
function balances(loan: Loan): number[] {
  const cached = balancesCache.get(loan);
  if (cached) return cached;
  const i = loan.annualRate / 100 / 12;
  const out: number[] = [loan.principal];
  let b = loan.principal;
  for (const pay of paymentsArray(loan)) {
    b = Math.max(0, b + b * i - pay);
    out.push(b);
  }
  balancesCache.set(loan, out);
  return out;
}

/** Mensualité hors assurance « de référence » (1re échéance). */
export function loanMonthlyPayment(loan: Loan): number {
  return paymentsArray(loan)[0] ?? 0;
}

/** Mensualité résolue de chaque palier (pour l'aperçu du formulaire). */
export function loanStepPayments(loan: Loan): number[] {
  const i = loan.annualRate / 100 / 12;
  const steps = stepsOf(loan);
  let remaining = steps.reduce((s, st) => s + st.months, 0);
  let balance = loan.principal;
  const out: number[] = [];
  for (const st of steps) {
    const pay = st.payment !== undefined && st.payment >= 0 ? st.payment : annuity(balance, i, remaining);
    out.push(pay);
    for (let m = 0; m < st.months; m++) {
      balance = Math.max(0, balance + balance * i - pay);
      remaining--;
    }
  }
  return out;
}

/** Capital restant dû à une date donnée (dans la devise du prêt). */
export function loanBalanceAt(loan: Loan, dateKey: string = todayKey()): number {
  const b = balances(loan);
  return b[clamp(monthsBetween(loan.startDate, dateKey), 0, b.length - 1)];
}

export interface LoanStats {
  monthlyPayment: number; // mensualité en vigueur aujourd'hui (palier courant)
  monthlyWithInsurance: number;
  paidMonths: number;
  remainingMonths: number;
  remainingBalance: number;
  paidPrincipal: number;
  totalInterest: number;
  insuranceTotal: number;
  totalCost: number;
  endDate: string;
  stepped: boolean;
}

/** Synthèse d'un crédit à aujourd'hui (montants dans la devise du prêt). */
export function loanStats(loan: Loan, today: string = todayKey()): LoanStats {
  const n = loanTermMonths(loan);
  const pays = paymentsArray(loan);
  const insurance = loan.insuranceMonthly ?? 0;
  const paidMonths = clamp(monthsBetween(loan.startDate, today), 0, n);
  const currentPayment = pays.length > 0 ? pays[clamp(paidMonths, 0, pays.length - 1)] : 0;
  const remainingBalance = loanBalanceAt(loan, today);
  const totalPaid = pays.reduce((s, p) => s + p, 0);
  const totalInterest = Math.max(0, totalPaid - loan.principal);
  const insuranceTotal = insurance * n;
  return {
    monthlyPayment: currentPayment,
    monthlyWithInsurance: currentPayment + insurance,
    paidMonths,
    remainingMonths: n - paidMonths,
    remainingBalance,
    paidPrincipal: loan.principal - remainingBalance,
    totalInterest,
    insuranceTotal,
    totalCost: totalInterest + insuranceTotal,
    endDate: addMonths(loan.startDate, n),
    stepped: isStepped(loan),
  };
}

export interface LoanPhase {
  fromDate: string;
  toDate: string;
  months: number;
  payment: number;
}

/** Paliers de mensualité regroupés (un seul pour un prêt classique). */
export function loanPhases(loan: Loan): LoanPhase[] {
  const pays = paymentsArray(loan);
  const phases: LoanPhase[] = [];
  let start = 0;
  for (let k = 1; k <= pays.length; k++) {
    if (k === pays.length || Math.round(pays[k]) !== Math.round(pays[start])) {
      phases.push({
        fromDate: addMonths(loan.startDate, start),
        toDate: addMonths(loan.startDate, k),
        months: k - start,
        payment: pays[start],
      });
      start = k;
    }
  }
  return phases;
}

/** Courbe du capital restant dû sur toute la durée du prêt (dans la devise du prêt). */
export function loanSchedule(loan: Loan): SeriesPoint[] {
  const bals = balances(loan);
  const n = bals.length - 1;
  if (n <= 0) return [];
  const step = Math.max(1, Math.ceil(n / 180));
  const points: SeriesPoint[] = [];
  for (let k = 0; k <= n; k += step) {
    points.push({ date: addMonths(loan.startDate, k), value: bals[k] });
  }
  const lastDate = addMonths(loan.startDate, n);
  if (points[points.length - 1].date !== lastDate) points.push({ date: lastDate, value: bals[n] });
  return points;
}

// ─── Biens (valorisation via l'indice) ───────────────────────────────────────

/** Quote-part détenue (0..1). Absent = 100 % (SCI/indivision : voir Property.ownershipPct). */
export function ownershipShare(property: Property): number {
  return property.ownershipPct === undefined ? 1 : clamp(property.ownershipPct, 0, 100) / 100;
}

/** Ratio indice(to)/indice(from), neutre à la base de l'indice. */
function indexRatio(series: HousePricePoint[], fromDate: string, toDate: string): number {
  const base = houseIndexValueAt(series, fromDate);
  if (base <= 0) return 1;
  return houseIndexValueAt(series, toDate) / base;
}

/** Valeur estimée d'un bien en EUR à une date donnée. */
export function propertyValueEur(
  property: Property,
  series: HousePricePoint[],
  rates: FxRates,
  dateKey: string = todayKey()
): number {
  // Mode manuel : la valeur saisie vaut pour aujourd'hui ; on la projette dans le
  // passé via l'indice pour tracer une courbe cohérente. Mode indice : on part du
  // prix d'achat réévalué depuis la date d'acquisition.
  const manual = property.valuationMode === 'manual' && property.manualValue !== undefined;
  const base = manual ? property.manualValue! : property.purchasePrice;
  const refDate = manual ? todayKey() : property.purchaseDate;
  return toEur(base * indexRatio(series, refDate, dateKey), property.currency, rates);
}

export interface PropertyGain {
  value: number; // valeur estimée EUR (aujourd'hui)
  purchase: number; // prix d'achat EUR
  cost: number; // prix de revient EUR (achat + frais)
  gainAbs: number; // plus-value vs prix d'achat
  gainPct: number;
}

/** Valeur estimée et plus-value latente d'un bien (EUR). */
export function propertyGainEur(
  property: Property,
  series: HousePricePoint[],
  rates: FxRates,
  today: string = todayKey()
): PropertyGain {
  const value = propertyValueEur(property, series, rates, today);
  const purchase = toEur(property.purchasePrice, property.currency, rates);
  const cost = toEur(property.purchasePrice + (property.purchaseCosts ?? 0), property.currency, rates);
  const gainAbs = value - purchase;
  return { value, purchase, cost, gainAbs, gainPct: purchase > 0 ? (gainAbs / purchase) * 100 : 0 };
}

/** Capital restant dû total d'un bien (EUR). */
export function propertyDebtEur(propertyId: string, loans: Loan[], rates: FxRates, today: string = todayKey()): number {
  return loans
    .filter((l) => l.propertyId === propertyId)
    .reduce((acc, l) => acc + toEur(loanBalanceAt(l, today), l.currency, rates), 0);
}

export interface RealEstateTotals {
  gross: number; // valeur des biens
  debt: number; // capital restant dû
  equity: number; // net (gross − debt)
}

/** Totaux immobiliers en EUR (biens non archivés), pondérés par la quote-part détenue. */
export function realEstateTotals(
  properties: Property[],
  loans: Loan[],
  series: HousePricePoint[],
  rates: FxRates,
  today: string = todayKey()
): RealEstateTotals {
  const active = properties.filter((p) => !p.archived);
  const shareById = new Map(active.map((p) => [p.id, ownershipShare(p)]));
  const gross = active.reduce((acc, p) => acc + propertyValueEur(p, series, rates, today) * ownershipShare(p), 0);
  const debt = loans.reduce((acc, l) => {
    const share = shareById.get(l.propertyId);
    return share === undefined ? acc : acc + toEur(loanBalanceAt(l, today), l.currency, rates) * share;
  }, 0);
  return { gross, debt, equity: gross - debt };
}

/** Contribution immobilière (EUR) à une date : biens − (dettes si net). */
function realEstateAt(
  properties: Property[],
  loans: Loan[],
  series: HousePricePoint[],
  rates: FxRates,
  day: string,
  net: boolean
): number {
  const shareById = new Map(properties.filter((p) => !p.archived).map((p) => [p.id, ownershipShare(p)]));
  let total = 0;
  for (const p of properties) {
    if (p.archived || day < p.purchaseDate) continue;
    total += propertyValueEur(p, series, rates, day) * ownershipShare(p);
  }
  if (net) {
    for (const l of loans) {
      const share = shareById.get(l.propertyId);
      if (share === undefined || day < l.startDate) continue;
      total -= toEur(loanBalanceAt(l, day), l.currency, rates) * share;
    }
  }
  return total;
}

// ─── Courbe patrimoniale combinée (comptes + immobilier) ─────────────────────

/** Courbe de valeur estimée d'un bien sur une période, pour LineChart. */
export function buildPropertyValueSeries(
  property: Property,
  series: HousePricePoint[],
  rates: FxRates,
  period: Period,
  today: string = todayKey()
): SeriesPoint[] {
  const start = periodStart(period, today);
  const from = !start || start < property.purchaseDate ? property.purchaseDate : start;
  if (from > today) return [];
  const dayCount =
    Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000) + 1;
  const step = Math.max(1, Math.ceil(dayCount / 180));
  const points: SeriesPoint[] = [];
  let day = from;
  while (day <= today) {
    points.push({ date: day, value: propertyValueEur(property, series, rates, day) });
    if (day === today) break;
    const next = addDays(day, step);
    day = next > today ? today : next;
  }
  return points;
}

/**
 * Courbe du patrimoine total (comptes forward-fill + immobilier analytique).
 * `net` : déduit le capital restant dû des crédits.
 */
export function buildPatrimoineSeries(
  accounts: Account[],
  snapshots: Snapshot[],
  properties: Property[],
  loans: Loan[],
  series: HousePricePoint[],
  rates: FxRates,
  period: Period,
  net: boolean,
  today: string = todayKey()
): SeriesPoint[] {
  const accountIds = accounts.map((a) => a.id);
  const weights = new Map(accounts.map((a) => [a.id, accountShare(a)]));
  // Grille alignée sur les comptes (pondérés par quote-part) ; on y superpose l'immobilier.
  const accountPoints = buildSeries(accountIds, snapshots, period, today, weights);
  const activeProps = properties.filter((p) => !p.archived);

  if (accountPoints.length >= 2) {
    return accountPoints.map((pt) => ({
      date: pt.date,
      value: pt.value + realEstateAt(activeProps, loans, series, rates, pt.date, net),
    }));
  }

  // Aucun historique de compte : courbe purement immobilière si des biens existent.
  if (activeProps.length === 0) return [];
  const earliest = activeProps.reduce((min, p) => (p.purchaseDate < min ? p.purchaseDate : min), today);
  const start = periodStart(period, today);
  const from = !start || start < earliest ? earliest : start;
  if (from > today) return [];
  const dayCount =
    Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000) + 1;
  const step = Math.max(1, Math.ceil(dayCount / 180));
  const points: SeriesPoint[] = [];
  let day = from;
  while (day <= today) {
    points.push({ date: day, value: realEstateAt(activeProps, loans, series, rates, day, net) });
    if (day === today) break;
    const next = addDays(day, step);
    day = next > today ? today : next;
  }
  return points;
}
