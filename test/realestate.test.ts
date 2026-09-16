/** Tests de l'amortissement des crédits et de la valorisation immobilière
 *  (`src/lib/realestate.ts`). Les valeurs de référence sont calculées par la formule
 *  fermée de l'annuité, indépendamment de la simulation mois par mois du code testé. */
import { describe, expect, it } from 'vitest';
import {
  addMonths,
  buildPatrimoineSeries,
  buildPropertyValueSeries,
  consoDebtEur,
  loanBalanceAt,
  loanMonthlyPayment,
  loanPhases,
  loanSchedule,
  loanStats,
  loanStepPayments,
  loanTermMonths,
  monthsBetween,
  ownershipShare,
  propertyDebtEur,
  propertyGainEur,
  propertyValueEur,
  realEstateTotals,
} from '@/lib/realestate';
import { todayKey } from '@/lib/format';
import { RATES, account, loan, property, snapshot } from './factories';

/** Mensualité amortissant `p` sur `n` mois au taux annuel `annualPct` (formule fermée). */
const annuity = (p: number, annualPct: number, n: number) => {
  const i = annualPct / 100 / 12;
  return i === 0 ? p / n : (p * i) / (1 - Math.pow(1 + i, -n));
};

/** Capital restant dû après `k` échéances (formule fermée). */
const balanceAfter = (p: number, annualPct: number, pay: number, k: number) => {
  const i = annualPct / 100 / 12;
  if (i === 0) return p - pay * k;
  return p * Math.pow(1 + i, k) - (pay * (Math.pow(1 + i, k) - 1)) / i;
};

/** Indice immobilier de test : +20 % entre 2020 et 2024. */
const INDEX = [
  { date: '2020-01-01', value: 100 },
  { date: '2024-01-01', value: 120 },
];

describe('monthsBetween (immobilier)', () => {
  it('compte les mois pleins, le mois entamé ne comptant pas', () => {
    expect(monthsBetween('2020-01-01', '2020-01-01')).toBe(0);
    expect(monthsBetween('2020-01-15', '2020-02-14')).toBe(0);
    expect(monthsBetween('2020-01-15', '2020-02-15')).toBe(1);
    expect(monthsBetween('2020-01-01', '2024-01-01')).toBe(48);
  });

  it('peut être négatif avant la date de départ', () => {
    expect(monthsBetween('2020-06-01', '2020-01-01')).toBe(-5);
  });
});

describe('addMonths', () => {
  it('ajoute des mois', () => {
    expect(addMonths('2020-01-15', 1)).toBe('2020-02-15');
    expect(addMonths('2020-01-15', 12)).toBe('2021-01-15');
    expect(addMonths('2020-01-15', 0)).toBe('2020-01-15');
  });

  it('borne au dernier jour du mois cible', () => {
    expect(addMonths('2020-01-31', 1)).toBe('2020-02-29'); // 2020 bissextile
    expect(addMonths('2021-01-31', 1)).toBe('2021-02-28');
    expect(addMonths('2020-03-31', 1)).toBe('2020-04-30');
  });

  it('accepte un décalage négatif', () => {
    expect(addMonths('2020-03-31', -1)).toBe('2020-02-29');
  });
});

describe('loanTermMonths', () => {
  it('utilise `termMonths` pour un prêt classique', () => {
    expect(loanTermMonths(loan({ termMonths: 240 }))).toBe(240);
  });

  it('utilise la somme des paliers pour un prêt échelonné', () => {
    const l = loan({ termMonths: 999, steps: [{ months: 12 }, { months: 228 }] });
    expect(loanTermMonths(l)).toBe(240);
  });

  it('ignore une liste de paliers vide', () => {
    expect(loanTermMonths(loan({ termMonths: 120, steps: [] }))).toBe(120);
  });

  it('ne renvoie jamais de durée négative', () => {
    expect(loanTermMonths(loan({ termMonths: -10 }))).toBe(0);
  });
});

describe('loanMonthlyPayment', () => {
  it('calcule l’annuité amortissante quand la mensualité n’est pas saisie', () => {
    const l = loan({ principal: 100_000, annualRate: 2.4, termMonths: 240 });
    expect(loanMonthlyPayment(l)).toBeCloseTo(annuity(100_000, 2.4, 240), 6);
    expect(loanMonthlyPayment(l)).toBeCloseTo(525.0447, 3);
  });

  it('respecte une mensualité saisie', () => {
    const l = loan({ principal: 100_000, annualRate: 2.4, termMonths: 240, monthlyPayment: 600 });
    expect(loanMonthlyPayment(l)).toBe(600);
  });

  it('gère un taux nul (prêt familial à 0 %)', () => {
    const l = loan({ principal: 12_000, annualRate: 0, termMonths: 24 });
    expect(loanMonthlyPayment(l)).toBeCloseTo(500, 10);
  });
});

describe('loanBalanceAt', () => {
  const l = loan({ principal: 100_000, annualRate: 2.4, termMonths: 240, startDate: '2020-01-01' });
  const pay = annuity(100_000, 2.4, 240);

  it('vaut le capital emprunté à la première échéance', () => {
    expect(loanBalanceAt(l, '2020-01-01')).toBe(100_000);
  });

  it('suit la formule fermée d’amortissement', () => {
    expect(loanBalanceAt(l, '2021-01-01')).toBeCloseTo(balanceAfter(100_000, 2.4, pay, 12), 4);
    expect(loanBalanceAt(l, '2030-01-01')).toBeCloseTo(balanceAfter(100_000, 2.4, pay, 120), 4);
    expect(loanBalanceAt(l, '2030-01-01')).toBeCloseTo(55_965.46, 1);
  });

  it('est soldé à l’échéance et le reste après', () => {
    expect(loanBalanceAt(l, '2040-01-01')).toBeCloseTo(0, 6);
    expect(loanBalanceAt(l, '2099-01-01')).toBeCloseTo(0, 6);
  });

  it('borne au capital emprunté avant la première échéance', () => {
    expect(loanBalanceAt(l, '2010-01-01')).toBe(100_000);
  });

  it('amortit linéairement à taux nul', () => {
    const zero = loan({ principal: 12_000, annualRate: 0, termMonths: 24, startDate: '2020-01-01' });
    expect(loanBalanceAt(zero, '2021-01-01')).toBeCloseTo(6_000, 6);
    expect(loanBalanceAt(zero, '2022-01-01')).toBeCloseTo(0, 6);
  });

  it('ne descend jamais sous zéro avec une mensualité surdimensionnée', () => {
    const fast = loan({ principal: 10_000, annualRate: 3, termMonths: 60, monthlyPayment: 5_000, startDate: '2020-01-01' });
    expect(loanBalanceAt(fast, '2025-01-01')).toBe(0);
  });
});

describe('loanStats', () => {
  const l = loan({
    principal: 100_000,
    annualRate: 2.4,
    termMonths: 240,
    startDate: '2020-01-01',
    insuranceMonthly: 30,
  });

  it('décompte les mensualités payées et restantes', () => {
    const s = loanStats(l, '2025-01-01');
    expect(s.paidMonths).toBe(60);
    expect(s.remainingMonths).toBe(180);
    expect(s.stepped).toBe(false);
  });

  it('borne le nombre de mensualités payées à la durée du prêt', () => {
    expect(loanStats(l, '2099-01-01').paidMonths).toBe(240);
    expect(loanStats(l, '2099-01-01').remainingMonths).toBe(0);
    expect(loanStats(l, '2010-01-01').paidMonths).toBe(0);
  });

  it('ajoute l’assurance à la mensualité et au coût total', () => {
    const s = loanStats(l, '2025-01-01');
    expect(s.monthlyPayment).toBeCloseTo(annuity(100_000, 2.4, 240), 6);
    expect(s.monthlyWithInsurance).toBeCloseTo(s.monthlyPayment + 30, 6);
    expect(s.insuranceTotal).toBeCloseTo(30 * 240, 6);
    expect(s.totalCost).toBeCloseTo(s.totalInterest + s.insuranceTotal, 6);
  });

  it('calcule le coût total des intérêts sur toute la durée', () => {
    const s = loanStats(l, '2025-01-01');
    expect(s.totalInterest).toBeCloseTo(annuity(100_000, 2.4, 240) * 240 - 100_000, 4);
    expect(s.totalInterest).toBeCloseTo(26_010.74, 1);
  });

  it('déduit le capital déjà remboursé du capital restant dû', () => {
    const s = loanStats(l, '2025-01-01');
    expect(s.paidPrincipal).toBeCloseTo(100_000 - s.remainingBalance, 6);
    expect(s.remainingBalance).toBeCloseTo(loanBalanceAt(l, '2025-01-01'), 10);
  });

  it('place la dernière échéance à startDate + durée', () => {
    expect(loanStats(l, '2025-01-01').endDate).toBe('2040-01-01');
  });
});

describe('prêts à paliers (mensualités échelonnées)', () => {
  const deferred = loan({
    principal: 100_000,
    annualRate: 2.4,
    termMonths: 240,
    startDate: '2020-01-01',
    steps: [
      { months: 12, monthlyPayment: 0 }, // différé total : les intérêts s'accumulent
      { months: 228 }, // palier « auto » : solde le capital restant
    ],
  });

  it('respecte un différé saisi à 0 € (capital qui gonfle)', () => {
    expect(loanMonthlyPayment(deferred)).toBe(0);
    expect(loanBalanceAt(deferred, '2021-01-01')).toBeCloseTo(102_426.58, 1);
    expect(loanBalanceAt(deferred, '2021-01-01')).toBeGreaterThan(100_000);
  });

  it('résout la mensualité « auto » sur la durée restante', () => {
    const payments = loanStepPayments(deferred);
    expect(payments).toHaveLength(2);
    expect(payments[0]).toBe(0);
    expect(payments[1]).toBeCloseTo(annuity(102_426.5767945403, 2.4, 228), 4);
    expect(payments[1]).toBeCloseTo(559.86, 1);
  });

  it('solde quand même le prêt à l’échéance finale', () => {
    expect(loanBalanceAt(deferred, '2040-01-01')).toBeCloseTo(0, 4);
  });

  it('coûte plus cher en intérêts qu’un prêt sans différé', () => {
    const plain = loan({ principal: 100_000, annualRate: 2.4, termMonths: 240, startDate: '2020-01-01' });
    expect(loanStats(deferred, '2025-01-01').totalInterest).toBeGreaterThan(
      loanStats(plain, '2025-01-01').totalInterest
    );
    expect(loanStats(deferred, '2025-01-01').totalInterest).toBeCloseTo(27_649.2, 0);
  });

  it('est signalé comme échelonné et expose la mensualité du palier courant', () => {
    expect(loanStats(deferred, '2020-06-01').stepped).toBe(true);
    expect(loanStats(deferred, '2020-06-01').monthlyPayment).toBe(0);
    expect(loanStats(deferred, '2025-01-01').monthlyPayment).toBeCloseTo(559.86, 1);
  });
});

describe('loanPhases', () => {
  it('produit une phase unique pour un prêt classique', () => {
    const l = loan({ principal: 100_000, annualRate: 2.4, termMonths: 240, startDate: '2020-01-01' });
    const phases = loanPhases(l);
    expect(phases).toHaveLength(1);
    expect(phases[0]).toMatchObject({ fromDate: '2020-01-01', toDate: '2040-01-01', months: 240 });
  });

  it('regroupe les mensualités identiques en paliers distincts', () => {
    const l = loan({
      principal: 100_000,
      annualRate: 2.4,
      termMonths: 36,
      startDate: '2020-01-01',
      steps: [
        { months: 12, monthlyPayment: 0 },
        { months: 24, monthlyPayment: 900 },
      ],
    });
    const phases = loanPhases(l);
    expect(phases).toHaveLength(2);
    expect(phases[0]).toMatchObject({ fromDate: '2020-01-01', toDate: '2021-01-01', months: 12, payment: 0 });
    expect(phases[1]).toMatchObject({ fromDate: '2021-01-01', toDate: '2023-01-01', months: 24, payment: 900 });
  });
});

describe('loanSchedule', () => {
  it('part du capital emprunté et finit soldé', () => {
    const l = loan({ principal: 100_000, annualRate: 2.4, termMonths: 240, startDate: '2020-01-01' });
    const points = loanSchedule(l);
    expect(points[0]).toEqual({ date: '2020-01-01', value: 100_000 });
    expect(points[points.length - 1].date).toBe('2040-01-01');
    expect(points[points.length - 1].value).toBeCloseTo(0, 4);
  });

  it('décroît de façon monotone et reste sous ~180 points', () => {
    const l = loan({ principal: 300_000, annualRate: 3.5, termMonths: 300, startDate: '2020-01-01' });
    const points = loanSchedule(l);
    expect(points.length).toBeLessThanOrEqual(182);
    for (let k = 1; k < points.length; k++) expect(points[k].value).toBeLessThan(points[k - 1].value);
  });

  it('est vide pour un prêt de durée nulle', () => {
    expect(loanSchedule(loan({ termMonths: 0 }))).toEqual([]);
  });
});

describe('ownershipShare', () => {
  it('vaut 100 % par défaut et borne le pourcentage saisi', () => {
    expect(ownershipShare(property({}))).toBe(1);
    expect(ownershipShare(property({ ownershipPct: 33 }))).toBeCloseTo(0.33, 10);
    expect(ownershipShare(property({ ownershipPct: -5 }))).toBe(0);
    expect(ownershipShare(property({ ownershipPct: 200 }))).toBe(1);
  });
});

describe('propertyValueEur', () => {
  it('réévalue le prix d’achat par le ratio d’indice (mode index)', () => {
    const p = property({ purchasePrice: 200_000, purchaseDate: '2020-01-01' });
    expect(propertyValueEur(p, INDEX, RATES, '2024-01-01')).toBeCloseTo(240_000, 6);
    expect(propertyValueEur(p, INDEX, RATES, '2020-01-01')).toBeCloseTo(200_000, 6);
  });

  it('est neutre à la base de l’indice (seul le ratio compte)', () => {
    const p = property({ purchasePrice: 200_000, purchaseDate: '2020-01-01' });
    const rebased = INDEX.map((pt) => ({ ...pt, value: pt.value * 7.3 }));
    expect(propertyValueEur(p, rebased, RATES, '2024-01-01')).toBeCloseTo(240_000, 6);
  });

  it('convertit dans la devise du bien', () => {
    const p = property({ purchasePrice: 200_000, purchaseDate: '2020-01-01', currency: 'USD' });
    expect(propertyValueEur(p, INDEX, RATES, '2024-01-01')).toBeCloseTo(240_000 * 0.8, 6);
  });

  it('prend la valeur saisie telle quelle aujourd’hui (mode manuel)', () => {
    const p = property({ valuationMode: 'manual', manualValue: 315_000, purchasePrice: 200_000 });
    expect(propertyValueEur(p, INDEX, RATES, todayKey())).toBeCloseTo(315_000, 6);
  });

  it('retombe sur l’indice si le mode manuel n’a pas de valeur saisie', () => {
    const p = property({ valuationMode: 'manual', purchasePrice: 200_000, purchaseDate: '2020-01-01' });
    expect(propertyValueEur(p, INDEX, RATES, '2024-01-01')).toBeCloseTo(240_000, 6);
  });

  it('valorise en prix/m² × surface aujourd’hui (mode local)', () => {
    const p = property({
      valuationMode: 'local',
      surface: 60,
      localEstimate: { pricePerM2: 5_000, sampleSize: 42, scope: 'commune', computedAt: '2024-01-01T00:00:00.000Z' },
    });
    expect(propertyValueEur(p, INDEX, RATES, todayKey())).toBeCloseTo(300_000, 6);
  });

  it('retombe sur l’indice si le mode local n’a pas encore d’estimation ou de surface', () => {
    const noEstimate = property({ valuationMode: 'local', surface: 60, purchasePrice: 200_000, purchaseDate: '2020-01-01' });
    expect(propertyValueEur(noEstimate, INDEX, RATES, '2024-01-01')).toBeCloseTo(240_000, 6);

    const noSurface = property({
      valuationMode: 'local',
      purchasePrice: 200_000,
      purchaseDate: '2020-01-01',
      localEstimate: { pricePerM2: 5_000, sampleSize: 42, scope: 'commune', computedAt: '2024-01-01T00:00:00.000Z' },
    });
    expect(propertyValueEur(noSurface, INDEX, RATES, '2024-01-01')).toBeCloseTo(240_000, 6);
  });
});

describe('propertyGainEur', () => {
  it('calcule la plus-value latente par rapport au prix d’achat', () => {
    const p = property({ purchasePrice: 200_000, purchaseCosts: 16_000, purchaseDate: '2020-01-01' });
    const g = propertyGainEur(p, INDEX, RATES, '2024-01-01');
    expect(g.value).toBeCloseTo(240_000, 6);
    expect(g.purchase).toBeCloseTo(200_000, 6);
    expect(g.cost).toBeCloseTo(216_000, 6); // prix de revient = achat + frais
    expect(g.gainAbs).toBeCloseTo(40_000, 6);
    expect(g.gainPct).toBeCloseTo(20, 6);
  });

  it('ne divise pas par zéro sur un prix d’achat nul (donation, héritage)', () => {
    const p = property({ purchasePrice: 0, valuationMode: 'manual', manualValue: 150_000 });
    const g = propertyGainEur(p, INDEX, RATES, todayKey());
    expect(g.gainPct).toBe(0);
  });
});

describe('propertyDebtEur / consoDebtEur', () => {
  it('somme les prêts rattachés au bien, convertis en euros', () => {
    const loans = [
      loan({ propertyId: 'p1', principal: 100_000, annualRate: 0, termMonths: 100, startDate: '2020-01-01' }),
      loan({ propertyId: 'p1', principal: 50_000, annualRate: 0, termMonths: 100, startDate: '2020-01-01' }),
      loan({ propertyId: 'p2', principal: 80_000, annualRate: 0, termMonths: 100, startDate: '2020-01-01' }),
    ];
    // 12 mensualités payées sur 100 : il reste 88 % du capital.
    expect(propertyDebtEur('p1', loans, RATES, '2021-01-01')).toBeCloseTo(150_000 * 0.88, 4);
    expect(propertyDebtEur('inconnu', loans, RATES, '2021-01-01')).toBe(0);
  });

  it('ne compte comme dette conso que les prêts sans bien et déjà démarrés', () => {
    const loans = [
      loan({ principal: 10_000, annualRate: 0, termMonths: 100, startDate: '2020-01-01' }),
      loan({ propertyId: 'p1', principal: 200_000, annualRate: 0, termMonths: 100, startDate: '2020-01-01' }),
      loan({ principal: 5_000, annualRate: 0, termMonths: 100, startDate: '2030-01-01' }), // pas encore démarré
    ];
    expect(consoDebtEur(loans, RATES, '2021-01-01')).toBeCloseTo(10_000 * 0.88, 4);
  });
});

describe('realEstateTotals', () => {
  it('applique la quote-part à la valeur ET à la dette', () => {
    const p = property({ id: 'p1', purchasePrice: 200_000, purchaseDate: '2020-01-01', ownershipPct: 50 });
    const loans = [loan({ propertyId: 'p1', principal: 100_000, annualRate: 0, termMonths: 100, startDate: '2020-01-01' })];
    const totals = realEstateTotals([p], loans, INDEX, RATES, '2021-01-01');
    // Indice interpolé au 01/01/2021 : 100 + 20 × 366/1461 ≈ 105,01 (1461 jours entre
    // les deux points de l'indice, 366 jours écoulés — 2020 est bissextile).
    const index2021 = 100 + 20 * (366 / 1461);
    expect(totals.gross).toBeCloseTo(200_000 * (index2021 / 100) * 0.5, 6);
    expect(totals.debt).toBeCloseTo(100_000 * 0.88 * 0.5, 2);
    expect(totals.equity).toBeCloseTo(totals.gross - totals.debt, 6);
  });

  it('exclut les biens archivés et la dette qui leur est rattachée', () => {
    const active = property({ id: 'p1', purchasePrice: 100_000, purchaseDate: '2020-01-01' });
    const archived = property({ id: 'p2', purchasePrice: 500_000, purchaseDate: '2020-01-01', archived: true });
    const loans = [
      loan({ propertyId: 'p2', principal: 400_000, annualRate: 0, termMonths: 100, startDate: '2020-01-01' }),
    ];
    const totals = realEstateTotals([active, archived], loans, INDEX, RATES, '2020-01-01');
    expect(totals.gross).toBeCloseTo(100_000, 6);
    expect(totals.debt).toBe(0);
  });

  it('ignore les prêts conso (comptés à part dans le patrimoine)', () => {
    const p = property({ id: 'p1', purchasePrice: 100_000, purchaseDate: '2020-01-01' });
    const loans = [loan({ principal: 20_000, annualRate: 0, termMonths: 100, startDate: '2020-01-01' })];
    expect(realEstateTotals([p], loans, INDEX, RATES, '2020-01-01').debt).toBe(0);
  });
});

describe('buildPropertyValueSeries', () => {
  it('démarre à la date d’achat et finit aujourd’hui', () => {
    const p = property({ purchasePrice: 200_000, purchaseDate: '2020-01-01' });
    const points = buildPropertyValueSeries(p, INDEX, RATES, 'MAX', '2024-01-01');
    expect(points[0].date).toBe('2020-01-01');
    expect(points[0].value).toBeCloseTo(200_000, 6);
    expect(points[points.length - 1].date).toBe('2024-01-01');
    expect(points[points.length - 1].value).toBeCloseTo(240_000, 6);
    expect(points.length).toBeLessThanOrEqual(182);
  });

  it('ne remonte pas avant l’achat même sur une longue période', () => {
    const p = property({ purchasePrice: 200_000, purchaseDate: '2023-06-01' });
    expect(buildPropertyValueSeries(p, INDEX, RATES, 'MAX', '2024-01-01')[0].date).toBe('2023-06-01');
  });

  it('est vide si le bien est acheté après la date de fin', () => {
    const p = property({ purchaseDate: '2030-01-01' });
    expect(buildPropertyValueSeries(p, INDEX, RATES, 'MAX', '2024-01-01')).toEqual([]);
  });
});

describe('buildPatrimoineSeries', () => {
  const accounts = [account({ id: 'a' })];
  const snaps = [
    snapshot({ accountId: 'a', date: '2020-01-01', value: 10_000 }),
    snapshot({ accountId: 'a', date: '2020-01-02', value: 10_000 }),
  ];

  it('superpose l’immobilier à la courbe des comptes', () => {
    const p = property({ id: 'p1', purchasePrice: 100_000, purchaseDate: '2020-01-01' });
    const points = buildPatrimoineSeries(accounts, snaps, [p], [], INDEX, RATES, 'MAX', false, '2020-01-02');
    expect(points).toHaveLength(2);
    expect(points[0].value).toBeCloseTo(110_000, 0);
  });

  it('déduit la dette immobilière en mode net', () => {
    const p = property({ id: 'p1', purchasePrice: 100_000, purchaseDate: '2020-01-01' });
    const loans = [loan({ propertyId: 'p1', principal: 60_000, annualRate: 0, termMonths: 120, startDate: '2020-01-01' })];
    const gross = buildPatrimoineSeries(accounts, snaps, [p], loans, INDEX, RATES, 'MAX', false, '2020-01-02');
    const net = buildPatrimoineSeries(accounts, snaps, [p], loans, INDEX, RATES, 'MAX', true, '2020-01-02');
    expect(gross[0].value).toBeCloseTo(110_000, 0);
    expect(net[0].value).toBeCloseTo(50_000, 0);
  });

  it('déduit la dette conso même quand l’immobilier est masqué', () => {
    const loans = [loan({ principal: 4_000, annualRate: 0, termMonths: 100, startDate: '2020-01-01' })];
    const net = buildPatrimoineSeries(accounts, snaps, [], loans, INDEX, RATES, 'MAX', true, '2020-01-02');
    expect(net[0].value).toBeCloseTo(6_000, 0);
  });

  it('applique la quote-part des comptes', () => {
    const shared = [account({ id: 'a', ownershipPct: 50 })];
    const points = buildPatrimoineSeries(shared, snaps, [], [], INDEX, RATES, 'MAX', false, '2020-01-02');
    expect(points[0].value).toBeCloseTo(5_000, 6);
  });

  it('trace une courbe purement immobilière sans historique de compte', () => {
    const p = property({ id: 'p1', purchasePrice: 100_000, purchaseDate: '2020-01-01' });
    const points = buildPatrimoineSeries([], [], [p], [], INDEX, RATES, 'MAX', false, '2020-01-03');
    expect(points).toHaveLength(3);
    expect(points[0]).toMatchObject({ date: '2020-01-01' });
    expect(points[0].value).toBeCloseTo(100_000, 0);
  });

  it('ignore un bien tant qu’il n’est pas acheté', () => {
    const p = property({ id: 'p1', purchasePrice: 100_000, purchaseDate: '2020-01-02' });
    const points = buildPatrimoineSeries(accounts, snaps, [p], [], INDEX, RATES, 'MAX', false, '2020-01-02');
    expect(points[0].value).toBeCloseTo(10_000, 6); // avant l'achat : comptes seuls
    expect(points[1].value).toBeCloseTo(110_000, 0);
  });

  it('est vide sans compte ni bien', () => {
    expect(buildPatrimoineSeries([], [], [], [], INDEX, RATES, 'MAX', true, '2020-01-02')).toEqual([]);
  });
});
