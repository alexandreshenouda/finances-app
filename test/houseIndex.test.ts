/** Tests de l'interpolation de l'indice des prix des logements (`src/lib/prices/houseIndex.ts`). */
import { describe, expect, it } from 'vitest';
import { HOUSE_INDEX_SEED, houseIndexValueAt } from '@/lib/prices/houseIndex';

const SERIES = [
  { date: '2020-01-01', value: 100 },
  { date: '2021-01-01', value: 110 },
  { date: '2022-01-01', value: 120 },
];

describe('houseIndexValueAt', () => {
  it('renvoie la valeur exacte sur un point de la série', () => {
    expect(houseIndexValueAt(SERIES, '2020-01-01')).toBe(100);
    expect(houseIndexValueAt(SERIES, '2021-01-01')).toBe(110);
    expect(houseIndexValueAt(SERIES, '2022-01-01')).toBe(120);
  });

  it('interpole linéairement entre deux points', () => {
    // 2020 est bissextile : 366 jours entre les deux premiers points.
    expect(houseIndexValueAt(SERIES, '2020-07-01')).toBeCloseTo(100 + 10 * (182 / 366), 10);
    // 2021 ne l'est pas : 365 jours, le 2 juillet est à 182 jours du 1er janvier.
    expect(houseIndexValueAt(SERIES, '2021-07-02')).toBeCloseTo(110 + 10 * (182 / 365), 10);
  });

  it('clampe avant le premier et après le dernier point', () => {
    expect(houseIndexValueAt(SERIES, '1990-01-01')).toBe(100);
    expect(houseIndexValueAt(SERIES, '2099-01-01')).toBe(120);
  });

  it('est monotone sur une série croissante', () => {
    const dates = ['2020-03-01', '2020-09-01', '2021-03-01', '2021-09-01'];
    const values = dates.map((d) => houseIndexValueAt(SERIES, d));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
  });

  it('renvoie 1 (élément neutre du ratio) sur une série vide', () => {
    expect(houseIndexValueAt([], '2020-01-01')).toBe(1);
  });

  it('gère une série à point unique comme une constante', () => {
    const single = [{ date: '2020-01-01', value: 42 }];
    expect(houseIndexValueAt(single, '2010-01-01')).toBe(42);
    expect(houseIndexValueAt(single, '2030-01-01')).toBe(42);
  });

  it('ne divise pas par zéro sur deux points de même date', () => {
    const dup = [
      { date: '2020-01-01', value: 100 },
      { date: '2020-01-01', value: 200 },
    ];
    expect(Number.isFinite(houseIndexValueAt(dup, '2020-01-01'))).toBe(true);
  });
});

describe('HOUSE_INDEX_SEED', () => {
  it('est trié par date croissante (pré-requis de l’interpolation)', () => {
    for (let i = 1; i < HOUSE_INDEX_SEED.length; i++) {
      expect(HOUSE_INDEX_SEED[i].date > HOUSE_INDEX_SEED[i - 1].date).toBe(true);
    }
  });

  it('ne contient que des valeurs strictement positives', () => {
    for (const p of HOUSE_INDEX_SEED) expect(p.value).toBeGreaterThan(0);
  });

  it('est bien en base 100 en 2015', () => {
    expect(HOUSE_INDEX_SEED.find((p) => p.date.startsWith('2015'))?.value).toBe(100);
  });
});
