/**
 * Taux de change → EUR. Source : api.frankfurter.app (taux BCE, gratuit, CORS ok).
 * Les derniers taux connus sont persistés dans le store pour fonctionner hors ligne.
 */
import { useStore } from './store';
import { CURRENCIES, type Currency, type FxRates } from './types';

/** Convertit un montant d'une devise vers l'EUR avec les taux fournis. */
export function toEur(amount: number, currency: Currency | undefined, rates: FxRates): number {
  return amount * (rates[currency ?? 'EUR'] ?? 1);
}

/** Convertit un montant entre deux devises (via l'EUR). */
export function convert(amount: number, from: Currency, to: Currency, rates: FxRates): number {
  if (from === to) return amount;
  return (amount * (rates[from] ?? 1)) / (rates[to] ?? 1);
}

/** Rafraîchit les taux BCE et les persiste. Silencieux en cas d'échec (taux précédents conservés). */
export async function refreshFxRates(): Promise<{ ok: boolean; error?: string }> {
  const symbols = CURRENCIES.filter((c) => c !== 'EUR');
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=EUR&symbols=${symbols.join(',')}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { rates?: Record<string, number> };
    const next: FxRates = { ...useStore.getState().fxRates, EUR: 1 };
    for (const c of symbols) {
      const eurToC = json.rates?.[c]; // 1 EUR = eurToC unités de c
      if (typeof eurToC === 'number' && eurToC > 0) next[c] = 1 / eurToC;
    }
    useStore.getState().setFxRates(next);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `Taux de change : ${e?.message ?? e}` };
  }
}
