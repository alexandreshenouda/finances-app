/** Tests des primitives de formatage et d'arithmétique de dates (`src/lib/format.ts`). */
import { afterEach, describe, expect, it } from 'vitest';
import {
  addDays,
  formatDuration,
  formatEur,
  formatMoney,
  formatPct,
  formatQuantity,
  monthsBetween,
  setLocale,
  setMaskedMoney,
  todayKey,
  uid,
} from '@/lib/format';

/** Les Intl.NumberFormat insèrent des espaces insécables (U+00A0 / U+202F). */
const norm = (s: string) => s.replace(/[  ]/g, ' ');

afterEach(() => {
  setMaskedMoney(false);
  setLocale('fr-FR');
});

describe('todayKey', () => {
  it('formate une date locale en YYYY-MM-DD', () => {
    expect(todayKey(new Date(2024, 0, 5))).toBe('2024-01-05');
    expect(todayKey(new Date(2024, 11, 31))).toBe('2024-12-31');
  });

  it('utilise le fuseau local, pas UTC', () => {
    // 1er mars à midi local : jamais décalé au 29 février par un offset.
    expect(todayKey(new Date(2024, 2, 1, 12))).toBe('2024-03-01');
  });
});

describe('addDays', () => {
  it('ajoute et retire des jours', () => {
    expect(addDays('2024-01-01', 1)).toBe('2024-01-02');
    expect(addDays('2024-01-01', -1)).toBe('2023-12-31');
    expect(addDays('2024-01-01', 0)).toBe('2024-01-01');
  });

  it('franchit les fins de mois et les années bissextiles', () => {
    expect(addDays('2024-01-31', 1)).toBe('2024-02-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29'); // 2024 est bissextile
    expect(addDays('2023-02-28', 1)).toBe('2023-03-01');
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
  });

  it('franchit un changement d’heure d’été sans dériver', () => {
    // Le passage à l'heure d'été en Europe a lieu le dernier dimanche de mars.
    expect(addDays('2024-03-30', 1)).toBe('2024-03-31');
    expect(addDays('2024-03-31', 1)).toBe('2024-04-01');
  });
});

describe('monthsBetween', () => {
  it('compte les mois pleins écoulés', () => {
    expect(monthsBetween('2024-01-01', '2024-01-01')).toBe(0);
    expect(monthsBetween('2024-01-01', '2024-02-01')).toBe(1);
    expect(monthsBetween('2024-01-01', '2025-01-01')).toBe(12);
  });

  it('ne compte pas un mois entamé mais pas terminé', () => {
    expect(monthsBetween('2024-01-15', '2024-02-14')).toBe(0);
    expect(monthsBetween('2024-01-15', '2024-02-15')).toBe(1);
    expect(monthsBetween('2024-01-15', '2024-02-16')).toBe(1);
  });

  it('renvoie un nombre négatif si la fin précède le début', () => {
    expect(monthsBetween('2024-06-01', '2024-01-01')).toBe(-5);
  });

  it('renvoie 0 sur une date invalide plutôt que NaN', () => {
    expect(monthsBetween('pas-une-date', '2024-01-01')).toBe(0);
    expect(monthsBetween('2024-01-01', '')).toBe(0);
  });
});

describe('formatMoney / formatEur', () => {
  it('formate en euros sans décimales par défaut', () => {
    expect(norm(formatEur(1234))).toBe('1 234 €');
  });

  it('formate avec deux décimales en mode précis', () => {
    expect(norm(formatEur(1234.567, true))).toBe('1 234,57 €');
  });

  it('gère les autres devises', () => {
    expect(norm(formatMoney(1000, 'USD'))).toContain('1 000');
    expect(formatMoney(1000, 'USD')).toMatch(/\$/);
  });

  it('renvoie un tiret sur une valeur non finie', () => {
    expect(formatEur(NaN)).toBe('—');
    expect(formatEur(Infinity)).toBe('—');
  });

  it('masque les montants en mode confidentialité', () => {
    setMaskedMoney(true);
    expect(formatEur(1234)).toBe('••••');
    expect(formatMoney(1234, 'USD', true)).toBe('••••');
    setMaskedMoney(false);
    expect(formatEur(1234)).not.toBe('••••');
  });

  it('ne masque JAMAIS les pourcentages', () => {
    setMaskedMoney(true);
    expect(formatPct(12.3)).not.toBe('••••');
    expect(norm(formatPct(12.3))).toBe('12,3 %');
  });

  it('recalcule ses formateurs après un changement de locale', () => {
    setLocale('en-US');
    expect(norm(formatEur(1234))).toBe('€1,234');
    setLocale('fr-FR');
    expect(norm(formatEur(1234))).toBe('1 234 €');
  });
});

describe('formatPct', () => {
  it('affiche une décimale par défaut', () => {
    expect(norm(formatPct(7))).toBe('7,0 %');
    expect(norm(formatPct(-3.25))).toBe('-3,3 %');
  });

  it('préfixe les valeurs positives quand `signed`', () => {
    expect(norm(formatPct(7, true))).toBe('+7,0 %');
    expect(norm(formatPct(-7, true))).toBe('-7,0 %');
    expect(norm(formatPct(0, true))).toBe('0,0 %'); // 0 n'est pas signé
  });

  it('respecte le nombre maximal de décimales', () => {
    expect(norm(formatPct(1.23456, false, 3))).toBe('1,235 %');
  });

  it('renvoie un tiret sur une valeur non finie', () => {
    expect(formatPct(NaN)).toBe('—');
  });
});

describe('formatQuantity', () => {
  it('conserve jusqu’à 8 décimales (quantités crypto)', () => {
    expect(norm(formatQuantity(0.12345678))).toBe('0,12345678');
    expect(norm(formatQuantity(1500))).toBe('1 500');
  });
});

describe('formatDuration', () => {
  it('formate des mois seuls, des années seules, et les deux', () => {
    expect(formatDuration(8)).toBe('8 mois');
    expect(formatDuration(36)).toBe('3 ans');
    expect(formatDuration(148)).toBe('12 ans 4 mois');
  });

  it('gère le singulier et le zéro', () => {
    expect(formatDuration(1)).toBe('1 mois');
    expect(formatDuration(12)).toBe('1 an');
    expect(formatDuration(13)).toBe('1 an 1 mois');
    expect(formatDuration(0)).toBe('0 mois');
  });

  it('borne les durées négatives à zéro', () => {
    expect(formatDuration(-5)).toBe('0 mois');
  });
});

describe('uid', () => {
  it('produit des identifiants distincts', () => {
    const ids = new Set(Array.from({ length: 500 }, () => uid()));
    expect(ids.size).toBe(500);
  });
});
