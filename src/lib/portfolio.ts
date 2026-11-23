/** Calculs de valorisation et de séries temporelles pour les courbes.
 *  Convention : cash et cours sont dans la devise du compte/de la ligne,
 *  les snapshots et toutes les valeurs agrégées sont en EUR. */
import { toEur } from './fx';
import { addDays, todayKey } from './format';
import type { Account, Currency, FxRates, Holding, Period, Snapshot } from './types';

/** Devise effective d'une ligne : la sienne, sinon celle du compte, sinon EUR. */
export function holdingCurrency(h: Holding, account?: Account): Currency {
  return h.currency ?? account?.currency ?? 'EUR';
}

/** Valeur actuelle d'un compte en EUR : liquidités + Σ lignes, sinon dernier snapshot. */
export function accountCurrentValue(
  account: Account,
  holdings: Holding[],
  snapshots: Snapshot[],
  rates: FxRates
): number {
  const lines = holdings.filter((h) => h.accountId === account.id);
  const cash = toEur(account.cashBalance ?? 0, account.currency, rates);
  if (lines.length > 0) {
    const sum = lines.reduce((acc, h) => acc + holdingValueEur(h, account, rates), 0);
    return cash + sum;
  }
  if (account.cashBalance !== undefined) return cash;
  const last = lastSnapshot(account.id, snapshots);
  return last?.value ?? 0;
}

/** Quote-part détenue du compte (0..1). Absent = 100 % (SCI/indivision : voir Account.ownershipPct). */
export function accountShare(account: Account): number {
  return account.ownershipPct === undefined ? 1 : Math.max(0, Math.min(100, account.ownershipPct)) / 100;
}

/** Valeur du compte revenant réellement au détenteur (valeur × quote-part), en EUR. */
export function accountOwnedValue(
  account: Account,
  holdings: Holding[],
  snapshots: Snapshot[],
  rates: FxRates
): number {
  return accountCurrentValue(account, holdings, snapshots, rates) * accountShare(account);
}

/** Valeur d'une ligne dans sa propre devise. */
export function holdingValue(h: Holding): number {
  return h.quantity * (h.unitPrice ?? 0);
}

/** Valeur d'une ligne convertie en EUR. */
export function holdingValueEur(h: Holding, account: Account | undefined, rates: FxRates): number {
  return toEur(holdingValue(h), holdingCurrency(h, account), rates);
}

/** Plus/moins-value latente en % par rapport au PRU, si connu. */
export function holdingPerfPct(h: Holding): number | undefined {
  if (!h.buyPrice || !h.unitPrice || h.buyPrice <= 0) return undefined;
  return ((h.unitPrice - h.buyPrice) / h.buyPrice) * 100;
}

/**
 * Plus/moins-value latente globale d'un compte, en EUR, agrégée sur les lignes
 * dont le PRU est connu. `undefined` si aucune ligne n'a de PRU (compte cash,
 * synchro sans prix d'achat…) — dans ce cas la +/- value n'est pas calculable.
 * Non pondérée par la quote-part : elle se rapporte à la valeur affichée (pleine).
 */
export function accountGain(
  account: Account,
  holdings: Holding[],
  rates: FxRates
): { abs: number; pct?: number; cost: number } | undefined {
  const lines = holdings.filter((h) => h.accountId === account.id);
  let cost = 0;
  let gain = 0;
  let any = false;
  for (const h of lines) {
    if (!h.buyPrice || !h.unitPrice || h.buyPrice <= 0) continue;
    const cur = holdingCurrency(h, account);
    cost += toEur(h.buyPrice * h.quantity, cur, rates);
    gain += toEur((h.unitPrice - h.buyPrice) * h.quantity, cur, rates);
    any = true;
  }
  if (!any || cost <= 0) return undefined;
  return { abs: gain, pct: (gain / cost) * 100, cost };
}

export function lastSnapshot(accountId: string, snapshots: Snapshot[]): Snapshot | undefined {
  let best: Snapshot | undefined;
  for (const s of snapshots) {
    if (s.accountId !== accountId) continue;
    if (!best || s.date > best.date) best = s;
  }
  return best;
}

export interface SeriesPoint {
  date: string; // YYYY-MM-DD
  value: number;
  rawValue?: number;
}

export function periodStart(period: Period, today = todayKey()): string | undefined {
  const d = new Date(`${today}T12:00:00`);
  switch (period) {
    case '1J':
      d.setDate(d.getDate() - 1);
      break;
    case '1S':
      d.setDate(d.getDate() - 7);
      break;
    case '1M':
      d.setMonth(d.getMonth() - 1);
      break;
    case '3M':
      d.setMonth(d.getMonth() - 3);
      break;
    case '6M':
      d.setMonth(d.getMonth() - 6);
      break;
    case '1A':
      d.setFullYear(d.getFullYear() - 1);
      break;
    case 'YTD':
      return `${d.getFullYear()}-01-01`;
    case 'MAX':
      return undefined;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Jours échantillonnés de `from` à `today` inclus (≤ ~180 points, `today` toujours présent). */
function sampleDays(from: string, today: string): string[] {
  const dayCount =
    Math.round(
      (new Date(`${today}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000
    ) + 1;
  const step = Math.max(1, Math.ceil(dayCount / 180));
  const days: string[] = [];
  let day = from;
  while (day <= today) {
    days.push(day);
    if (day === today) break;
    const next = addDays(day, step);
    day = next > today ? today : next;
  }
  return days;
}

/**
 * Parcourt les jours échantillonnés en reportant, pour chaque compte, son dernier
 * snapshot connu à cette date (forward-fill). `sorted` : snapshots triés par date.
 */
function forwardFill(
  sorted: Snapshot[],
  from: string,
  today: string,
  onDay: (day: string, latest: Map<string, Snapshot>) => void
): void {
  const byAccount = new Map<string, Snapshot[]>();
  for (const s of sorted) {
    const arr = byAccount.get(s.accountId) ?? [];
    arr.push(s);
    byAccount.set(s.accountId, arr);
  }
  const cursors = new Map<string, number>();
  const latest = new Map<string, Snapshot>();
  for (const day of sampleDays(from, today)) {
    for (const [accountId, arr] of byAccount) {
      let i = cursors.get(accountId) ?? 0;
      while (i < arr.length && arr[i].date <= day) {
        latest.set(accountId, arr[i]);
        i++;
      }
      cursors.set(accountId, i);
    }
    onDay(day, latest);
  }
}

function sortedSnapshots(accountIds: string[], snapshots: Snapshot[]): Snapshot[] {
  return snapshots
    .filter((s) => accountIds.includes(s.accountId))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Série de valeur totale (comptes sélectionnés) sur une période.
 * Chaque compte est reporté au dernier snapshot connu (forward-fill) pour que
 * la somme reste cohérente même quand les comptes ne sont pas mis à jour le même jour.
 */
export function buildSeries(
  accountIds: string[],
  snapshots: Snapshot[],
  period: Period,
  today = todayKey(),
  /** Pondération par compte (ex : quote-part SCI) ; défaut 1. */
  weights?: Map<string, number>
): SeriesPoint[] {
  const relevant = sortedSnapshots(accountIds, snapshots);
  if (relevant.length === 0) return [];

  const firstDate = relevant[0].date;
  const start = periodStart(period, today) ?? firstDate;
  const from = start < firstDate ? firstDate : start;
  if (from > today) return [];

  const points: SeriesPoint[] = [];
  forwardFill(relevant, from, today, (day, latest) => {
    let total = 0;
    for (const [accountId, s] of latest) total += s.value * (weights?.get(accountId) ?? 1);
    points.push({ date: day, value: total });
  });
  return points;
}

/**
 * Série de +/- value latente (en %) des comptes sélectionnés : à chaque date,
 * Σ +/- value / Σ prix de revient des lignes avec PRU, d'après les champs `gain` /
 * `cost` des snapshots (forward-fill comme `buildSeries`). Contrairement à
 * `toPerformanceSeries`, un versement ou un retrait ne fait pas bouger la courbe :
 * il change le prix de revient autant que la valeur. Une vente sort sa plus-value
 * du latent (elle devient réalisée). `rawValue` = +/- value latente en EUR.
 * Ne démarre qu'au premier snapshot portant ces champs ; un compte dont le dernier
 * snapshot n'en porte pas (sans PRU, ou antérieur à leur enregistrement) est ignoré
 * ce jour-là. Courbe non rebasée : 0 % = prix de revient.
 */
export function buildLatentGainSeries(
  accountIds: string[],
  snapshots: Snapshot[],
  period: Period,
  today = todayKey(),
  weights?: Map<string, number>
): SeriesPoint[] {
  const relevant = sortedSnapshots(accountIds, snapshots);
  const first = relevant.find(hasLatent);
  if (!first) return [];
  const start = periodStart(period, today) ?? first.date;
  const from = start < first.date ? first.date : start;
  if (from > today) return [];

  const points: SeriesPoint[] = [];
  forwardFill(relevant, from, today, (day, latest) => {
    let gain = 0;
    let cost = 0;
    for (const [accountId, s] of latest) {
      if (!hasLatent(s)) continue;
      const w = weights?.get(accountId) ?? 1;
      gain += s.gain! * w;
      cost += s.cost! * w;
    }
    if (cost > 0) points.push({ date: day, value: (gain / cost) * 100, rawValue: gain });
  });
  return points;
}

function hasLatent(s: Snapshot): boolean {
  return s.gain !== undefined && s.cost !== undefined && s.cost > 0;
}

/** Base de calcul de la vue « Performance (%) ». */
export type PerformanceBasis = 'latent' | 'balance';

/**
 * Série de la vue « Performance (%) » : la +/- value latente (`buildLatentGainSeries`)
 * dès qu'elle a au moins deux points sur la période, sinon l'évolution du solde
 * (`toPerformanceSeries` de `valueSeries`) — comptes sans PRU, ou historique des
 * +/- values pas encore constitué.
 */
export function performanceSeries(
  accountIds: string[],
  snapshots: Snapshot[],
  valueSeries: SeriesPoint[],
  period: Period,
  today = todayKey(),
  weights?: Map<string, number>
): { points: SeriesPoint[]; basis: PerformanceBasis } {
  const latent = buildLatentGainSeries(accountIds, snapshots, period, today, weights);
  if (latent.length >= 2) return { points: latent, basis: 'latent' };
  return { points: toPerformanceSeries(valueSeries), basis: 'balance' };
}

/** Variation sur la période : absolue et en %. */
export function seriesDelta(points: SeriesPoint[]): { abs: number; pct?: number } {
  if (points.length < 2) return { abs: 0 };
  const first = points[0].value;
  const last = points[points.length - 1].value;
  return { abs: last - first, pct: first !== 0 ? ((last - first) / Math.abs(first)) * 100 : undefined };
}

/**
 * Convertit une série de valeurs absolues en série de performance temporelle (en %).
 * La courbe démarre à 0 % au début de la période choisie et suit l'évolution relative
 * par rapport à la valeur de référence de départ (premier point non nul).
 * `rawValue` préserve le montant brut en devise pour chaque point.
 */
export function toPerformanceSeries(points: SeriesPoint[]): SeriesPoint[] {
  // Même avec un point unique la valeur doit être exprimée en % (0 %), sinon un
  // montant en euros serait affiché tel quel sur un axe en pourcentage.
  if (points.length < 2) return points.map((p) => ({ date: p.date, value: 0, rawValue: p.value }));
  const firstNonZero = points.find((p) => p.value !== 0);
  if (!firstNonZero) {
    return points.map((p) => ({ date: p.date, value: 0, rawValue: p.value }));
  }
  const base = firstNonZero.value;
  const absBase = Math.abs(base);
  const firstNonZeroIdx = points.indexOf(firstNonZero);

  return points.map((p, idx) => {
    if (idx < firstNonZeroIdx) {
      return { date: p.date, value: 0, rawValue: p.value };
    }
    const pct = ((p.value - base) / absBase) * 100;
    return {
      date: p.date,
      value: Number.isFinite(pct) ? pct : 0,
      rawValue: p.value,
    };
  });
}

