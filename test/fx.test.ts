/** Tests de la conversion de devises (`src/lib/fx.ts`). */
import { describe, expect, it } from 'vitest';
import { convert, toEur } from '@/lib/fx';
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
