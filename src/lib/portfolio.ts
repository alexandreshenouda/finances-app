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
}

export function periodStart(period: Period, today = todayKey()): string | undefined {
  const d = new Date(`${today}T12:00:00`);
  switch (period) {
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
  const relevant = snapshots
    .filter((s) => accountIds.includes(s.accountId))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (relevant.length === 0) return [];

  const firstDate = relevant[0].date;
  const start = periodStart(period, today) ?? firstDate;
  const from = start < firstDate ? firstDate : start;
  if (from > today) return [];

  // Index des snapshots par compte, triés par date.
  const byAccount = new Map<string, Snapshot[]>();
  for (const s of relevant) {
    const arr = byAccount.get(s.accountId) ?? [];
    arr.push(s);
    byAccount.set(s.accountId, arr);
  }

  // Nombre de jours de la fenêtre ; on échantillonne pour garder ≤ ~180 points.
  const dayCount =
    Math.round(
      (new Date(`${today}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000
    ) + 1;
  const step = Math.max(1, Math.ceil(dayCount / 180));

  const cursors = new Map<string, number>();
  const lastValues = new Map<string, number>();
  const points: SeriesPoint[] = [];

  let day = from;
  while (day <= today) {
    for (const [accountId, arr] of byAccount) {
      let i = cursors.get(accountId) ?? 0;
      while (i < arr.length && arr[i].date <= day) {
        lastValues.set(accountId, arr[i].value);
        i++;
      }
      cursors.set(accountId, i);
    }
    let total = 0;
    for (const [accountId, v] of lastValues) total += v * (weights?.get(accountId) ?? 1);
    points.push({ date: day, value: total });
    if (day === today) break;
    const next = addDays(day, step);
    day = next > today ? today : next;
  }
  return points;
}

/** Variation sur la période : absolue et en %. */
export function seriesDelta(points: SeriesPoint[]): { abs: number; pct?: number } {
  if (points.length < 2) return { abs: 0 };
  const first = points[0].value;
  const last = points[points.length - 1].value;
  return { abs: last - first, pct: first !== 0 ? ((last - first) / Math.abs(first)) * 100 : undefined };
}
