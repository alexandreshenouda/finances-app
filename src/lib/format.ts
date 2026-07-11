/** Formatage fr-FR des montants, pourcentages et dates. */

const eur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const eurPrecise = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatEur(value: number, precise = false): string {
  if (!Number.isFinite(value)) return '—';
  return precise ? eurPrecise.format(value) : eur.format(value);
}

export function formatQuantity(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 8 }).format(value);
}

export function formatPct(value: number, signed = false, maxDecimals = 1): string {
  if (!Number.isFinite(value)) return '—';
  const s = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: maxDecimals,
  }).format(value);
  return `${signed && value > 0 ? '+' : ''}${s} %`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR');
}

/** Jour local au format YYYY-MM-DD. */
export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  return todayKey(d);
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
