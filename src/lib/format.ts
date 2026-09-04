/** Formatage des montants, pourcentages et dates selon la locale active. */
import i18next from './i18n';
import type { Currency } from './types';

/** Mode confidentialité : masque tous les montants (les % restent visibles).
 *  Piloté par le store (privacyMode) via setMaskedMoney — pas d'import du store
 *  ici pour éviter un cycle. */
let maskedMoney = false;
export function setMaskedMoney(v: boolean): void {
  maskedMoney = v;
}

let locale: string = 'fr-FR';
export function setLocale(v: string): void {
  locale = v;
  moneyFormatters.clear();
}

const moneyFormatters = new Map<string, Intl.NumberFormat>();

function moneyFormatter(currency: Currency, precise: boolean): Intl.NumberFormat {
  const key = `${currency}:${precise}`;
  let f = moneyFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: precise ? 2 : 0,
      maximumFractionDigits: precise ? 2 : 0,
    });
    moneyFormatters.set(key, f);
  }
  return f;
}

export function formatEur(value: number, precise = false): string {
  return formatMoney(value, 'EUR', precise);
}

export function formatMoney(value: number, currency: Currency = 'EUR', precise = false): string {
  if (!Number.isFinite(value)) return '—';
  if (maskedMoney) return '••••';
  return moneyFormatter(currency, precise).format(value);
}

export function formatQuantity(value: number): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 8 }).format(value);
}

export function formatPct(value: number, signed = false, maxDecimals = 1): string {
  if (!Number.isFinite(value)) return '—';
  const s = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: maxDecimals,
  }).format(value);
  return `${signed && value > 0 ? '+' : ''}${s} %`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale);
}

/** Jour local au format YYYY-MM-DD. */
export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Durée en mois → « 12 ans 4 mois », « 8 mois », « 3 ans ». */
export function formatDuration(months: number): string {
  const m = Math.max(0, Math.round(months));
  const years = Math.floor(m / 12);
  const rem = m % 12;
  if (years === 0) return `${rem} ${i18next.t('common.months', { count: rem })}`;
  if (rem === 0) return `${years} ${i18next.t('common.years', { count: years })}`;
  return `${years} ${i18next.t('common.years', { count: years })} ${rem} ${i18next.t('common.months', { count: rem })}`;
}

export function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  return todayKey(d);
}

/** Nombre de mois écoulés entre deux dates YYYY-MM-DD. */
export function monthsBetween(startIso: string, endIso: string): number {
  const s = new Date(`${startIso}T12:00:00`);
  const e = new Date(`${endIso}T12:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + (e.getDate() >= s.getDate() ? 0 : -1);
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
