/** Budget : mensualisation, capacité d'épargne, repère 50/30/20, épargne constatée. */
import { describe, expect, it } from 'vitest';
import {
  ACTUAL_SAVINGS_MIN_DAYS,
  actualSavings,
  budgetLines,
  budgetRule,
  budgetSummary,
  compareSavings,
  loanBudgetLines,
  monthlyAmount,
  objectivesMonthlyEffort,
} from '@/lib/budget';
import { todayKey } from '@/lib/format';
import { account, budgetItem, loan, objective, RATES, snapshot } from './factories';

describe('monthlyAmount', () => {
  it('ramène chaque périodicité au mois', () => {
    expect(monthlyAmount({ amount: 900, frequency: 'monthly' })).toBe(900);
    expect(monthlyAmount({ amount: 300, frequency: 'quarterly' })).toBe(300 / 3);
    expect(monthlyAmount({ amount: 1200, frequency: 'yearly' })).toBe(1200 / 12);
  });
});

describe('loanBudgetLines', () => {
  // Annuité constante : P·i / (1 − (1+i)^−n), formule fermée indépendante de la simulation.
  const annuity = (p: number, ratePct: number, n: number) => {
    const i = ratePct / 100 / 12;
    return (p * i) / (1 - (1 + i) ** -n);
  };

  it('compte la mensualité assurance incluse d’un prêt en cours, comme dépense vitale', () => {
    const l = loan({ principal: 100_000, annualRate: 2.4, termMonths: 240, startDate: '2020-01-01', insuranceMonthly: 20 });
    const [line] = loanBudgetLines([l], RATES, '2024-06-15');
    expect(line).toMatchObject({ id: `loan:${l.id}`, kind: 'expense', category: 'credit', essential: true, auto: true });
    expect(line.monthly).toBeCloseTo(annuity(100_000, 2.4, 240) + 20, 2);
  });

  it('convertit en EUR un prêt en devise', () => {
    const l = loan({ principal: 12_000, annualRate: 0, termMonths: 12, startDate: '2024-01-01', currency: 'USD' });
    expect(loanBudgetLines([l], RATES, '2024-03-01')[0].monthly).toBeCloseTo(1000 * 0.8, 6);
  });

  it('ignore un prêt pas encore démarré ou déjà soldé', () => {
    const future = loan({ startDate: '2030-01-01' });
    const done = loan({ startDate: '2000-01-01', termMonths: 120 });
    expect(loanBudgetLines([future, done], RATES, '2024-06-15')).toEqual([]);
  });
});

describe('budgetLines', () => {
  const items = [
    budgetItem({ kind: 'income', amount: 3000, category: 'salaire' }),
    budgetItem({ kind: 'expense', amount: 900, category: 'logement', essential: true }),
    // `essential` n'a de sens que pour une dépense : ignoré ailleurs.
    budgetItem({ kind: 'saving', amount: 200, category: 'versement_epargne', essential: true }),
  ];
  const loans = [loan({ principal: 12_000, annualRate: 0, termMonths: 12, startDate: '2024-01-01' })];

  it('mensualise les flux saisis', () => {
    const lines = budgetLines(items);
    expect(lines.map((l) => [l.kind, l.monthly, l.essential])).toEqual([
      ['income', 3000, false],
      ['expense', 900, true],
      ['saving', 200, false],
    ]);
  });

  it('n’ajoute les mensualités de prêts que si l’option est active', () => {
    expect(budgetLines(items, { loans, rates: RATES, includeLoans: false, today: '2024-03-01' })).toHaveLength(3);
    const withLoans = budgetLines(items, { loans, rates: RATES, includeLoans: true, today: '2024-03-01' });
    expect(withLoans).toHaveLength(4);
    expect(withLoans[3]).toMatchObject({ auto: true, monthly: 1000 });
  });
});

describe('budgetSummary', () => {
  const lines = budgetLines([
    budgetItem({ kind: 'income', amount: 3000, category: 'salaire' }),
    budgetItem({ kind: 'income', amount: 1200, frequency: 'yearly', category: 'placements' }), // 100/mois
    budgetItem({ kind: 'expense', amount: 900, category: 'logement', essential: true }),
    budgetItem({ kind: 'expense', amount: 400, category: 'alimentation', essential: true }),
    budgetItem({ kind: 'expense', amount: 600, frequency: 'quarterly', category: 'loisirs' }), // 200/mois
    budgetItem({ kind: 'expense', amount: 50, category: 'loisirs' }),
    budgetItem({ kind: 'saving', amount: 500, category: 'versement_investissement' }),
  ]);
  const s = budgetSummary(lines);

  it('agrège revenus, dépenses vitales / autres et épargne programmée', () => {
    expect(s.income).toBe(3100);
    expect(s.essential).toBe(1300);
    expect(s.discretionary).toBe(250);
    expect(s.expenses).toBe(1550);
    expect(s.plannedSavings).toBe(500);
  });

  it('en déduit la capacité, le reste non affecté et les ratios', () => {
    expect(s.capacity).toBe(3100 - 1550);
    expect(s.unallocated).toBe(3100 - 1550 - 500);
    expect(s.savingsRate).toBeCloseTo(1550 / 3100, 10);
    expect(s.essentialRatio).toBeCloseTo(1300 / 3100, 10);
  });

  it('classe les dépenses par poste, du plus lourd au plus léger', () => {
    expect(s.byCategory.map((c) => [c.category, c.monthly])).toEqual([
      ['logement', 900],
      ['alimentation', 400],
      ['loisirs', 250],
    ]);
    expect(s.byCategory[0].pct).toBeCloseTo((900 / 1550) * 100, 10);
    expect(s.byCategory.reduce((a, c) => a + c.pct, 0)).toBeCloseTo(100, 10);
  });

  it('reste défini sans revenus ni dépenses', () => {
    expect(budgetSummary([])).toMatchObject({ income: 0, expenses: 0, capacity: 0, byCategory: [] });
    expect(budgetSummary([]).savingsRate).toBeUndefined();
    const onlyExpense = budgetSummary(budgetLines([budgetItem({ amount: 100 })]));
    expect(onlyExpense.capacity).toBe(-100);
    expect(onlyExpense.essentialRatio).toBeUndefined();
  });
});

describe('budgetRule (50/30/20)', () => {
  it('exprime besoins, envies et épargne en % des revenus', () => {
    const s = budgetSummary(
      budgetLines([
        budgetItem({ kind: 'income', amount: 2000 }),
        budgetItem({ amount: 1100, essential: true }),
        budgetItem({ amount: 500 }),
      ])
    );
    const rule = budgetRule(s)!;
    expect(rule.map((r) => [r.key, r.target])).toEqual([
      ['needs', 50],
      ['wants', 30],
      ['savings', 20],
    ]);
    expect(rule[0].pct).toBeCloseTo((1100 / 2000) * 100, 10);
    expect(rule[1].pct).toBeCloseTo((500 / 2000) * 100, 10);
    expect(rule[2].pct).toBeCloseTo(((2000 - 1600) / 2000) * 100, 10);
  });

  it('n’est pas calculable sans revenus', () => {
    expect(budgetRule(budgetSummary([]))).toBeUndefined();
  });
});

describe('actualSavings', () => {
  const today = '2024-07-01';
  const a = account({ type: 'livret' });
  const b = account({ type: 'pea', ownershipPct: 50 });

  it('mesure la variation des comptes sur la fenêtre, ramenée au mois', () => {
    const snaps = [
      snapshot({ accountId: a.id, date: '2023-01-01', value: 1000 }),
      snapshot({ accountId: a.id, date: '2024-03-20', value: 4000 }), // dernier relevé avant le début (01/04)
      snapshot({ accountId: a.id, date: '2024-05-10', value: 5000 }),
      snapshot({ accountId: a.id, date: '2024-06-30', value: 5500 }),
    ];
    const res = actualSavings([a], snaps, '3M', today);
    expect(res.from).toBe('2024-04-01');
    expect(res.days).toBe(91); // avril 30 + mai 31 + juin 30
    expect(res.delta).toBe(1500);
    expect(res.monthly).toBeCloseTo(1500 / (91 / (365.25 / 12)), 6);
    expect(res).toMatchObject({ includedAccounts: 1, skippedAccounts: 0 });
  });

  it('applique la quote-part détenue', () => {
    const snaps = [
      snapshot({ accountId: b.id, date: '2024-01-01', value: 10_000 }),
      snapshot({ accountId: b.id, date: '2024-06-01', value: 12_000 }),
    ];
    expect(actualSavings([b], snaps, '3M', today).delta).toBe(1000);
  });

  it('ignore un compte sans relevé au début de la fenêtre, et les comptes archivés', () => {
    const archived = account({ archived: true });
    const snaps = [
      snapshot({ accountId: a.id, date: '2024-01-01', value: 1000 }),
      snapshot({ accountId: a.id, date: '2024-06-01', value: 1300 }),
      snapshot({ accountId: b.id, date: '2024-05-01', value: 20_000 }), // créé en cours de fenêtre
      snapshot({ accountId: archived.id, date: '2024-01-01', value: 1 }),
      snapshot({ accountId: archived.id, date: '2024-06-01', value: 99_999 }),
    ];
    const res = actualSavings([a, b, archived], snaps, '3M', today);
    expect(res.delta).toBe(300);
    expect(res).toMatchObject({ includedAccounts: 1, skippedAccounts: 1 });
  });

  it('démarre au premier relevé quand l’historique est plus court que la fenêtre', () => {
    const snaps = [
      snapshot({ accountId: a.id, date: '2024-05-02', value: 1000 }),
      snapshot({ accountId: a.id, date: '2024-07-01', value: 1600 }),
    ];
    const res = actualSavings([a], snaps, '1A', today);
    expect(res.from).toBe('2024-05-02');
    expect(res.days).toBe(60);
    expect(res.monthly).toBeCloseTo(600 / (60 / (365.25 / 12)), 6);
  });

  it('ne donne pas de moyenne mensuelle sur un historique trop court', () => {
    const snaps = [
      snapshot({ accountId: a.id, date: '2024-06-10', value: 1000 }),
      snapshot({ accountId: a.id, date: '2024-07-01', value: 1500 }),
    ];
    const res = actualSavings([a], snaps, '6M', today);
    expect(res.days).toBeLessThan(ACTUAL_SAVINGS_MIN_DAYS);
    expect(res.delta).toBe(500);
    expect(res.monthly).toBeUndefined();
  });

  it('ignore les relevés postérieurs à la date de référence et reste défini sans historique', () => {
    expect(actualSavings([a], [], '3M', today)).toEqual({ delta: 0, days: 0, includedAccounts: 0, skippedAccounts: 0 });
    const future = [snapshot({ accountId: a.id, date: '2025-01-01', value: 1000 })];
    expect(actualSavings([a], future, '3M', today).includedAccounts).toBe(0);
  });

  it('compte les jours en UTC : un changement d’heure ne fausse pas la durée', () => {
    const tz = process.env.TZ;
    process.env.TZ = 'Europe/Paris';
    try {
      // Fenêtre à cheval sur le passage à l'heure d'été (31 mars 2024).
      const snaps = [
        snapshot({ accountId: a.id, date: '2024-03-01', value: 0 }),
        snapshot({ accountId: a.id, date: '2024-04-30', value: 600 }),
      ];
      expect(actualSavings([a], snaps, '1A', '2024-04-30').days).toBe(60);
    } finally {
      process.env.TZ = tz;
    }
  });
});

describe('compareSavings', () => {
  it('tolère 10 % de la capacité, avec un plancher de 50 €', () => {
    expect(compareSavings(1000, 1090)).toEqual({ gap: 90, status: 'aligned' });
    expect(compareSavings(1000, 880)).toEqual({ gap: -120, status: 'below' });
    expect(compareSavings(1000, 1200)).toEqual({ gap: 200, status: 'above' });
    // Petite capacité : le plancher de 50 € s'applique (10 % ne feraient que 10 €).
    expect(compareSavings(100, 140).status).toBe('aligned');
    expect(compareSavings(100, 160).status).toBe('above');
    expect(compareSavings(-200, -300).status).toBe('below');
  });
});

describe('objectivesMonthlyEffort', () => {
  it('additionne l’effort mensuel des objectifs datés, ignore ceux sans échéance', () => {
    const acc = account({ type: 'livret', cashBalance: 2000 });
    const ctx = { accounts: [acc], holdings: [], snapshots: [], rates: RATES };
    // Échéance dans 10 mois calendaires, relative à aujourd'hui pour ne pas vieillir.
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + 10);
    const objectives = [
      objective({ category: 'projet_court_terme', targetAmount: 7000, deadline: todayKey(d) }),
      objective({ category: 'projet_court_terme', targetAmount: 50_000 }),
    ];
    expect(objectivesMonthlyEffort(objectives, ctx)).toBeCloseTo((7000 - 2000) / 10, 6);
    expect(objectivesMonthlyEffort([], ctx)).toBe(0);
  });
});
