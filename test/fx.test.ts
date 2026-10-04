/** Tests de la conversion de devises (`src/lib/fx.ts`). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { convert, refreshFxRates, toEur } from '@/lib/fx';
import { useStore } from '@/lib/store';
import { DEFAULT_FX_RATES } from '@/lib/types';
import { json, mockFetch, networkError, text } from './http';
import { RATES } from './factories';

describe('toEur', () => {
  it('laisse l’euro inchangé', () => {
    expect(toEur(100, 'EUR', RATES)).toBe(100);
  });

  it('applique le taux « 1 unité → EUR »', () => {
    expect(toEur(100, 'USD', RATES)).toBeCloseTo(80, 10);
    expect(toEur(100, 'CHF', RATES)).toBeCloseTo(105, 10);
  });

  it('traite une devise absente comme de l’euro (rétro-compatibilité des vieux exports)', () => {
    expect(toEur(100, undefined, RATES)).toBe(100);
  });

  it('retombe sur un taux 1 si la devise est inconnue des taux', () => {
    expect(toEur(100, 'USD', { EUR: 1 } as any)).toBe(100);
  });

  it('préserve le signe (soldes débiteurs)', () => {
    expect(toEur(-50, 'USD', RATES)).toBeCloseTo(-40, 10);
  });
});

describe('convert', () => {
  it('est l’identité entre devises identiques', () => {
    expect(convert(123.45, 'USD', 'USD', RATES)).toBe(123.45);
  });

  it('convertit via l’euro', () => {
    // 100 USD = 80 € ; 80 € / 1,05 = 76,19 CHF
    expect(convert(100, 'USD', 'CHF', RATES)).toBeCloseTo(80 / 1.05, 10);
  });

  it('est réversible (aller-retour)', () => {
    const roundTrip = convert(convert(250, 'USD', 'CHF', RATES), 'CHF', 'USD', RATES);
    expect(roundTrip).toBeCloseTo(250, 10);
  });

  it('convertit depuis et vers l’euro', () => {
    expect(convert(80, 'EUR', 'USD', RATES)).toBeCloseTo(100, 10);
    expect(convert(100, 'USD', 'EUR', RATES)).toBeCloseTo(80, 10);
  });
});

describe('refreshFxRates (BCE via frankfurter)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useStore.setState({ fxRates: DEFAULT_FX_RATES, fxUpdatedAt: undefined });
  });

  it('inverse les taux « 1 EUR = x devise » en « 1 devise = y EUR »', async () => {
    const calls = mockFetch([['api.frankfurter.dev', json({ base: 'EUR', rates: { USD: 1.25, CHF: 0.8 } })]]);
    expect(await refreshFxRates()).toEqual({ ok: true });
    expect(calls[0].url).toContain('base=EUR&symbols=USD,CHF');
    const { fxRates, fxUpdatedAt } = useStore.getState();
    expect(fxRates.EUR).toBe(1);
    expect(fxRates.USD).toBeCloseTo(1 / 1.25, 12);
    expect(fxRates.CHF).toBeCloseTo(1 / 0.8, 12);
    expect(fxUpdatedAt).toBeTruthy();
  });

  it('garde le dernier taux connu d’une devise absente ou invalide', async () => {
    useStore.setState({ fxRates: { EUR: 1, USD: 0.9, CHF: 1.1 } });
    mockFetch([['api.frankfurter.dev', json({ rates: { USD: 0 } })]]);
    expect(await refreshFxRates()).toEqual({ ok: true });
    expect(useStore.getState().fxRates).toEqual({ EUR: 1, USD: 0.9, CHF: 1.1 });
  });

  it('remonte l’échec sans toucher aux taux (hors ligne, HTTP en erreur)', async () => {
    mockFetch([['api.frankfurter.dev', text('', 502)]]);
    expect(await refreshFxRates()).toEqual({ ok: false, error: 'Taux de change : HTTP 502' });
    mockFetch([['api.frankfurter.dev', networkError('offline')]]);
    expect(await refreshFxRates()).toEqual({ ok: false, error: 'Taux de change : offline' });
    expect(useStore.getState().fxRates).toBe(DEFAULT_FX_RATES);
    expect(useStore.getState().fxUpdatedAt).toBeUndefined();
  });
});
