/** Tests de l'interpolation de l'indice des prix des logements (`src/lib/prices/houseIndex.ts`). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOUSE_INDEX_SEED, houseIndexSeries, houseIndexValueAt, refreshHouseIndex } from '@/lib/prices/houseIndex';
import { useStore } from '@/lib/store';
import { mockFetch, networkError, text } from './http';

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

  it('ne dépend pas du fuseau horaire de la machine (changement d’heure)', () => {
    // La CI tourne en UTC, sans heure d'été : on force un fuseau qui en a une, sinon
    // une régression (dates lues en heure locale) passerait inaperçue.
    const tz = process.env.TZ;
    try {
      process.env.TZ = 'Europe/Paris';
      // Le 29 mars 2020 (passage à l'heure d'été) tombe entre les deux points.
      expect(houseIndexValueAt(SERIES, '2020-07-01')).toBeCloseTo(100 + 10 * (182 / 366), 10);
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
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

describe('houseIndexSeries', () => {
  afterEach(() => useStore.setState({ houseIndex: undefined }));

  it('utilise le seed tant qu’aucune série exploitable n’a été rafraîchie', () => {
    expect(houseIndexSeries()).toBe(HOUSE_INDEX_SEED);
    useStore.setState({ houseIndex: [{ date: '2020-01-01', value: 1 }] });
    expect(houseIndexSeries()).toBe(HOUSE_INDEX_SEED);
  });

  it('préfère la série rafraîchie en ligne', () => {
    const fresh = [
      { date: '2020-01-01', value: 1 },
      { date: '2021-01-01', value: 2 },
    ];
    useStore.setState({ houseIndex: fresh });
    expect(houseIndexSeries()).toBe(fresh);
  });
});

describe('refreshHouseIndex (FRED)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useStore.setState({ houseIndex: undefined, houseIndexUpdatedAt: undefined });
  });

  it('parse le CSV, ignore les valeurs manquantes (« . ») et trie par date', async () => {
    mockFetch([
      [
        'fredgraph.csv',
        text(
          [
            'observation_date,QFRN628BIS',
            '2021-01-01,110.5',
            '2020-01-01,100',
            '2020-04-01,.',
            '2020-07-01,-3',
            '2020-10-01,abc',
            ',12',
            '',
          ].join('\n')
        ),
      ],
    ]);
    expect(await refreshHouseIndex()).toEqual({ ok: true });
    expect(useStore.getState().houseIndex).toEqual([
      { date: '2020-01-01', value: 100 },
      { date: '2021-01-01', value: 110.5 },
    ]);
    expect(useStore.getState().houseIndexUpdatedAt).toBeTruthy();
  });

  it('échoue sans rien écraser si la série est trop courte', async () => {
    mockFetch([['fredgraph.csv', text('observation_date,QFRN628BIS\n2020-01-01,100\n')]]);
    expect(await refreshHouseIndex()).toEqual({ ok: false, error: 'Indice immobilier : série vide' });
    expect(useStore.getState().houseIndex).toBeUndefined();
  });

  it('remonte une erreur HTTP ou réseau sans lever', async () => {
    mockFetch([['fredgraph.csv', text('', 500)]]);
    expect(await refreshHouseIndex()).toEqual({ ok: false, error: 'Indice immobilier : HTTP 500' });
    mockFetch([['fredgraph.csv', networkError('offline')]]);
    expect(await refreshHouseIndex()).toEqual({ ok: false, error: 'Indice immobilier : offline' });
  });
});
