/** Tests de la valorisation des comptes et des séries temporelles (`src/lib/portfolio.ts`). */
import { describe, expect, it } from 'vitest';
import {
  accountCurrentValue,
  accountGain,
  accountOwnedValue,
  accountShare,
  buildSeries,
  holdingCurrency,
  holdingPerfPct,
  holdingValue,
  holdingValueEur,
  lastSnapshot,
  periodStart,
  seriesDelta,
  toPerformanceSeries,
  type SeriesPoint,
} from '@/lib/portfolio';
import { RATES, account, holding, snapshot } from './factories';

describe('holdingCurrency', () => {
  it('privilégie la devise de la ligne, puis celle du compte, puis l’EUR', () => {
    const acc = account({ currency: 'CHF' });
    expect(holdingCurrency(holding({ accountId: acc.id, currency: 'USD' }), acc)).toBe('USD');
    expect(holdingCurrency(holding({ accountId: acc.id }), acc)).toBe('CHF');
    expect(holdingCurrency(holding({ accountId: acc.id }), undefined)).toBe('EUR');
    expect(holdingCurrency(holding({ accountId: acc.id }), account({}))).toBe('EUR');
  });
});

describe('holdingValue / holdingValueEur', () => {
  it('multiplie quantité × cours', () => {
    expect(holdingValue(holding({ accountId: 'a', quantity: 3, unitPrice: 12.5 }))).toBe(37.5);
  });

  it('vaut 0 tant que le cours est inconnu', () => {
    expect(holdingValue(holding({ accountId: 'a', quantity: 3 }))).toBe(0);
  });

  it('convertit en euros avec la devise effective de la ligne', () => {
    const acc = account({ currency: 'USD' });
    const line = holding({ accountId: acc.id, quantity: 10, unitPrice: 20 });
    expect(holdingValueEur(line, acc, RATES)).toBeCloseTo(160, 10); // 200 USD × 0,80
  });
});

describe('holdingPerfPct', () => {
  it('calcule la plus-value latente par rapport au PRU', () => {
    expect(holdingPerfPct(holding({ accountId: 'a', quantity: 1, buyPrice: 100, unitPrice: 125 }))).toBeCloseTo(25, 10);
    expect(holdingPerfPct(holding({ accountId: 'a', quantity: 1, buyPrice: 100, unitPrice: 80 }))).toBeCloseTo(-20, 10);
  });

  it('est indéfini sans PRU, sans cours ou avec un PRU nul', () => {
    expect(holdingPerfPct(holding({ accountId: 'a', unitPrice: 100 }))).toBeUndefined();
    expect(holdingPerfPct(holding({ accountId: 'a', buyPrice: 100 }))).toBeUndefined();
    expect(holdingPerfPct(holding({ accountId: 'a', buyPrice: 0, unitPrice: 100 }))).toBeUndefined();
  });
});

describe('accountCurrentValue', () => {
  it('somme les lignes et les liquidités quand il y a des lignes', () => {
    const acc = account({ cashBalance: 500 });
    const lines = [
      holding({ accountId: acc.id, quantity: 10, unitPrice: 100 }),
      holding({ accountId: acc.id, quantity: 2, unitPrice: 50 }),
    ];
    expect(accountCurrentValue(acc, lines, [], RATES)).toBe(1600);
  });

  it('ignore les lignes des autres comptes', () => {
    const acc = account({});
    const lines = [holding({ accountId: 'autre', quantity: 10, unitPrice: 100 })];
    expect(accountCurrentValue(acc, lines, [], RATES)).toBe(0);
  });

  it('convertit liquidités et lignes dans la devise du compte', () => {
    const acc = account({ currency: 'USD', cashBalance: 100 });
    const lines = [holding({ accountId: acc.id, quantity: 1, unitPrice: 900 })];
    expect(accountCurrentValue(acc, lines, [], RATES)).toBeCloseTo(800, 10); // 1000 USD × 0,80
  });

  it('utilise les seules liquidités si le compte n’a aucune ligne', () => {
    const acc = account({ cashBalance: 750 });
    expect(accountCurrentValue(acc, [], [], RATES)).toBe(750);
  });

  it('retombe sur le dernier snapshot sans ligne ni solde', () => {
    const acc = account({});
    const snaps = [
      snapshot({ accountId: acc.id, date: '2024-01-01', value: 1000 }),
      snapshot({ accountId: acc.id, date: '2024-03-01', value: 1200 }),
      snapshot({ accountId: acc.id, date: '2024-02-01', value: 1100 }),
    ];
    expect(accountCurrentValue(acc, [], snaps, RATES)).toBe(1200);
  });

  it('vaut 0 sans aucune donnée', () => {
    expect(accountCurrentValue(account({}), [], [], RATES)).toBe(0);
  });

  it('préfère un solde à 0 explicite au dernier snapshot', () => {
    const acc = account({ cashBalance: 0 });
    const snaps = [snapshot({ accountId: acc.id, date: '2024-01-01', value: 1000 })];
    expect(accountCurrentValue(acc, [], snaps, RATES)).toBe(0);
  });
});

describe('accountShare / accountOwnedValue', () => {
  it('vaut 100 % si la quote-part est absente', () => {
    expect(accountShare(account({}))).toBe(1);
  });

  it('convertit le pourcentage en fraction et le borne à [0, 100]', () => {
    expect(accountShare(account({ ownershipPct: 50 }))).toBe(0.5);
    expect(accountShare(account({ ownershipPct: 0 }))).toBe(0);
    expect(accountShare(account({ ownershipPct: -10 }))).toBe(0);
    expect(accountShare(account({ ownershipPct: 150 }))).toBe(1);
  });

  it('n’applique la quote-part qu’à la valeur agrégée, pas à la valeur brute', () => {
    const acc = account({ ownershipPct: 40, cashBalance: 1000 });
    expect(accountCurrentValue(acc, [], [], RATES)).toBe(1000);
    expect(accountOwnedValue(acc, [], [], RATES)).toBeCloseTo(400, 10);
  });
});

describe('accountGain', () => {
  it('agrège la plus-value des lignes ayant un PRU', () => {
    const acc = account({});
    const lines = [
      holding({ accountId: acc.id, quantity: 10, buyPrice: 100, unitPrice: 120 }), // +200 sur 1000
      holding({ accountId: acc.id, quantity: 5, buyPrice: 200, unitPrice: 180 }), // -100 sur 1000
    ];
    const gain = accountGain(acc, lines, RATES);
    expect(gain?.abs).toBeCloseTo(100, 10);
    expect(gain?.pct).toBeCloseTo(5, 10); // 100 / 2000
  });

  it('ignore les lignes sans PRU plutôt que de les compter à zéro', () => {
    const acc = account({});
    const lines = [
      holding({ accountId: acc.id, quantity: 10, buyPrice: 100, unitPrice: 110 }),
      holding({ accountId: acc.id, quantity: 999, unitPrice: 50 }), // pas de PRU
    ];
    const gain = accountGain(acc, lines, RATES);
    expect(gain?.abs).toBeCloseTo(100, 10);
    expect(gain?.pct).toBeCloseTo(10, 10);
  });

  it('est indéfini si aucune ligne n’a de PRU', () => {
    const acc = account({});
    expect(accountGain(acc, [holding({ accountId: acc.id, quantity: 1, unitPrice: 10 })], RATES)).toBeUndefined();
    expect(accountGain(acc, [], RATES)).toBeUndefined();
  });

  it('convertit coût et gain dans la devise de la ligne', () => {
    const acc = account({ currency: 'USD' });
    const lines = [holding({ accountId: acc.id, quantity: 10, buyPrice: 100, unitPrice: 120 })];
    const gain = accountGain(acc, lines, RATES);
    expect(gain?.abs).toBeCloseTo(160, 10); // 200 USD × 0,80
    expect(gain?.pct).toBeCloseTo(20, 10); // le % est insensible à la devise
  });
});

describe('lastSnapshot', () => {
  it('renvoie le snapshot le plus récent du compte visé', () => {
    const snaps = [
      snapshot({ accountId: 'a', date: '2024-01-01', value: 1 }),
      snapshot({ accountId: 'b', date: '2024-12-01', value: 2 }),
      snapshot({ accountId: 'a', date: '2024-06-01', value: 3 }),
    ];
    expect(lastSnapshot('a', snaps)?.value).toBe(3);
    expect(lastSnapshot('inconnu', snaps)).toBeUndefined();
  });
});

describe('periodStart', () => {
  const today = '2024-06-15';

  it('recule du bon nombre de jours / mois / années', () => {
    expect(periodStart('1J', today)).toBe('2024-06-14');
    expect(periodStart('1S', today)).toBe('2024-06-08');
    expect(periodStart('1M', today)).toBe('2024-05-15');
    expect(periodStart('3M', today)).toBe('2024-03-15');
    expect(periodStart('6M', today)).toBe('2023-12-15');
    expect(periodStart('1A', today)).toBe('2023-06-15');
  });

  it('YTD démarre au 1er janvier de l’année courante', () => {
    expect(periodStart('YTD', today)).toBe('2024-01-01');
  });

  it('MAX n’a pas de borne de départ', () => {
    expect(periodStart('MAX', today)).toBeUndefined();
  });
});

describe('buildSeries', () => {
  it('renvoie une série vide sans snapshot pertinent', () => {
    expect(buildSeries(['a'], [], 'MAX', '2024-01-10')).toEqual([]);
    expect(buildSeries(['a'], [snapshot({ accountId: 'b', date: '2024-01-01', value: 5 })], 'MAX', '2024-01-10')).toEqual(
      []
    );
  });

  it('reporte la dernière valeur connue jour après jour (forward-fill)', () => {
    const snaps = [
      snapshot({ accountId: 'a', date: '2024-01-01', value: 100 }),
      snapshot({ accountId: 'a', date: '2024-01-03', value: 130 }),
    ];
    const points = buildSeries(['a'], snaps, 'MAX', '2024-01-04');
    expect(points).toEqual([
      { date: '2024-01-01', value: 100 },
      { date: '2024-01-02', value: 100 },
      { date: '2024-01-03', value: 130 },
      { date: '2024-01-04', value: 130 },
    ]);
  });

  it('somme plusieurs comptes mis à jour à des dates différentes', () => {
    const snaps = [
      snapshot({ accountId: 'a', date: '2024-01-01', value: 100 }),
      snapshot({ accountId: 'b', date: '2024-01-02', value: 50 }),
      snapshot({ accountId: 'a', date: '2024-01-03', value: 110 }),
    ];
    expect(buildSeries(['a', 'b'], snaps, 'MAX', '2024-01-03')).toEqual([
      { date: '2024-01-01', value: 100 },
      { date: '2024-01-02', value: 150 },
      { date: '2024-01-03', value: 160 },
    ]);
  });

  it('applique les pondérations par compte (quote-part SCI)', () => {
    const snaps = [
      snapshot({ accountId: 'a', date: '2024-01-01', value: 100 }),
      snapshot({ accountId: 'b', date: '2024-01-01', value: 200 }),
    ];
    const weights = new Map([
      ['a', 1],
      ['b', 0.5],
    ]);
    expect(buildSeries(['a', 'b'], snaps, 'MAX', '2024-01-01', weights)).toEqual([{ date: '2024-01-01', value: 200 }]);
  });

  it('ne remonte jamais avant le premier snapshot', () => {
    const snaps = [snapshot({ accountId: 'a', date: '2024-06-01', value: 100 })];
    const points = buildSeries(['a'], snaps, '1A', '2024-06-03');
    expect(points[0].date).toBe('2024-06-01');
    expect(points).toHaveLength(3);
  });

  it('tronque la série au début de la période demandée', () => {
    const snaps = [
      snapshot({ accountId: 'a', date: '2024-01-01', value: 100 }),
      snapshot({ accountId: 'a', date: '2024-06-01', value: 200 }),
    ];
    const points = buildSeries(['a'], snaps, '1S', '2024-06-08');
    expect(points[0]).toEqual({ date: '2024-06-01', value: 200 });
    expect(points[points.length - 1].date).toBe('2024-06-08');
  });

  it('échantillonne pour rester sous ~180 points sur les longues périodes', () => {
    const snaps = [snapshot({ accountId: 'a', date: '2014-01-01', value: 100 })];
    const points = buildSeries(['a'], snaps, 'MAX', '2024-01-01');
    expect(points.length).toBeLessThanOrEqual(182);
    expect(points[0].date).toBe('2014-01-01');
    expect(points[points.length - 1].date).toBe('2024-01-01'); // le dernier point est toujours aujourd'hui
  });

  it('renvoie une série vide si le premier snapshot est postérieur à aujourd’hui', () => {
    const snaps = [snapshot({ accountId: 'a', date: '2030-01-01', value: 100 })];
    expect(buildSeries(['a'], snaps, 'MAX', '2024-01-01')).toEqual([]);
  });
});

describe('seriesDelta', () => {
  it('compare le premier et le dernier point', () => {
    const points: SeriesPoint[] = [
      { date: '2024-01-01', value: 100 },
      { date: '2024-01-02', value: 90 },
      { date: '2024-01-03', value: 125 },
    ];
    const delta = seriesDelta(points);
    expect(delta.abs).toBe(25);
    expect(delta.pct).toBeCloseTo(25, 10);
  });

  it('n’a pas de % quand la base est nulle', () => {
    const delta = seriesDelta([
      { date: '2024-01-01', value: 0 },
      { date: '2024-01-02', value: 50 },
    ]);
    expect(delta.abs).toBe(50);
    expect(delta.pct).toBeUndefined();
  });

  it('rapporte la variation à la valeur absolue de la base (patrimoine net négatif)', () => {
    const delta = seriesDelta([
      { date: '2024-01-01', value: -200 },
      { date: '2024-01-02', value: -100 },
    ]);
    expect(delta.abs).toBe(100);
    expect(delta.pct).toBeCloseTo(50, 10); // une dette qui se réduit est une progression
  });

  it('vaut zéro sur une série trop courte', () => {
    expect(seriesDelta([])).toEqual({ abs: 0 });
    expect(seriesDelta([{ date: '2024-01-01', value: 10 }])).toEqual({ abs: 0 });
  });
});

describe('toPerformanceSeries', () => {
  it('démarre à 0 % et suit l’évolution relative', () => {
    const out = toPerformanceSeries([
      { date: '2024-01-01', value: 200 },
      { date: '2024-01-02', value: 250 },
      { date: '2024-01-03', value: 150 },
    ]);
    expect(out.map((p) => p.value)).toEqual([0, 25, -25]);
    expect(out.map((p) => p.rawValue)).toEqual([200, 250, 150]);
  });

  it('exprime même un point unique en pourcentage (jamais un montant brut)', () => {
    expect(toPerformanceSeries([{ date: '2024-01-01', value: 1234 }])).toEqual([
      { date: '2024-01-01', value: 0, rawValue: 1234 },
    ]);
    expect(toPerformanceSeries([])).toEqual([]);
  });

  it('prend comme base le premier point non nul, les précédents restant à 0 %', () => {
    const out = toPerformanceSeries([
      { date: '2024-01-01', value: 0 },
      { date: '2024-01-02', value: 100 },
      { date: '2024-01-03', value: 150 },
    ]);
    expect(out.map((p) => p.value)).toEqual([0, 0, 50]);
  });

  it('renvoie une série plate si toutes les valeurs sont nulles', () => {
    const out = toPerformanceSeries([
      { date: '2024-01-01', value: 0 },
      { date: '2024-01-02', value: 0 },
    ]);
    expect(out.map((p) => p.value)).toEqual([0, 0]);
  });

  it('reste orienté « hausse = positif » sur une base négative', () => {
    const out = toPerformanceSeries([
      { date: '2024-01-01', value: -100 },
      { date: '2024-01-02', value: -50 },
    ]);
    expect(out.map((p) => p.value)).toEqual([0, 50]);
  });
});
