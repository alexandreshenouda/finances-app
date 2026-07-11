/** Calculs de valorisation et de séries temporelles pour les courbes. */
import { addDays, todayKey } from './format';
import type { Account, Holding, Period, Snapshot } from './types';

/** Valeur actuelle d'un compte : liquidités + Σ lignes valorisées, sinon dernier snapshot. */
export function accountCurrentValue(
  account: Account,
  holdings: Holding[],
  snapshots: Snapshot[]
): number {
  const lines = holdings.filter((h) => h.accountId === account.id);
  const cash = account.cashBalance ?? 0;
  if (lines.length > 0) {
    const sum = lines.reduce((acc, h) => acc + holdingValue(h), 0);
    return cash + sum;
  }
  if (account.cashBalance !== undefined) return cash;
  const last = lastSnapshot(account.id, snapshots);
  return last?.value ?? 0;
}

export function holdingValue(h: Holding): number {
  return h.quantity * (h.unitPrice ?? 0);
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
  today = todayKey()
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
    for (const v of lastValues.values()) total += v;
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
