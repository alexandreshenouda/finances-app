/** Tests de la progression des objectifs financiers (`src/lib/objectives.ts`). */
import { describe, expect, it } from 'vitest';
import {
  cashAndLivretTotal,
  epargnePrecautionTarget,
  monthsUntil,
  objectiveProgress,
  totalExcludingRealEstate,
} from '@/lib/objectives';
import { RATES, account, objective, snapshot } from './factories';

const courant = account({ id: 'courant', type: 'courant', cashBalance: 4_000 });
const livret = account({ id: 'livret', type: 'livret', cashBalance: 11_000 });
const pea = account({ id: 'pea', type: 'pea', cashBalance: 25_000 });
const ACCOUNTS = [courant, livret, pea];

const ctx = (over: Partial<Parameters<typeof objectiveProgress>[1]> = {}) => ({
  accounts: ACCOUNTS,
  holdings: [],
  snapshots: [],
  rates: RATES,
  objectives: [],
  ...over,
});

describe('cashAndLivretTotal', () => {
  it('ne retient que les comptes courants et livrets', () => {
    expect(cashAndLivretTotal(ACCOUNTS, [], [], RATES)).toBe(15_000);
  });

  it('exclut les comptes archivés', () => {
    const archived = account({ type: 'livret', cashBalance: 99_000, archived: true });
    expect(cashAndLivretTotal([...ACCOUNTS, archived], [], [], RATES)).toBe(15_000);
  });

  it('applique la quote-part détenue', () => {
    const shared = account({ type: 'livret', cashBalance: 10_000, ownershipPct: 50 });
    expect(cashAndLivretTotal([shared], [], [], RATES)).toBeCloseTo(5_000, 10);
  });

  it('convertit les devises étrangères', () => {
    const usd = account({ type: 'courant', cashBalance: 1_000, currency: 'USD' });
    expect(cashAndLivretTotal([usd], [], [], RATES)).toBeCloseTo(800, 10);
  });
});

describe('totalExcludingRealEstate', () => {
  it('somme tous les comptes actifs, quel que soit leur type', () => {
    expect(totalExcludingRealEstate(ACCOUNTS, [], [], RATES)).toBe(40_000);
  });

  it('exclut les comptes archivés', () => {
    const archived = account({ type: 'cto', cashBalance: 5_000, archived: true });
    expect(totalExcludingRealEstate([...ACCOUNTS, archived], [], [], RATES)).toBe(40_000);
  });

  it('prend en compte les snapshots des comptes sans solde ni ligne', () => {
    const tracked = account({ id: 'suivi', type: 'per' });
    const snaps = [snapshot({ accountId: 'suivi', date: '2024-01-01', value: 7_000 })];
    expect(totalExcludingRealEstate([tracked], [], snaps, RATES)).toBe(7_000);
  });
});

describe('epargnePrecautionTarget', () => {
  it('multiplie les mois de sécurité par les dépenses mensuelles', () => {
    const objs = [objective({ category: 'epargne_precaution', securityMonths: 6, monthlyExpenses: 2_000 })];
    expect(epargnePrecautionTarget(objs)).toBe(12_000);
  });

  it('ignore les objectifs d’une autre catégorie', () => {
    const objs = [
      objective({ category: 'epargne_precaution', securityMonths: 6, monthlyExpenses: 2_000 }),
      objective({ category: 'projet_long_terme', targetAmount: 500_000 }),
    ];
    expect(epargnePrecautionTarget(objs)).toBe(12_000);
  });

  it('vaut 0 sans objectif de précaution ou si un paramètre manque', () => {
    expect(epargnePrecautionTarget([])).toBe(0);
    expect(epargnePrecautionTarget([objective({ category: 'epargne_precaution', securityMonths: 6 })])).toBe(0);
  });
});

describe('monthsUntil', () => {
  it('compte les mois calendaires jusqu’à l’échéance', () => {
    expect(monthsUntil('2024-07-01', new Date(2024, 0, 1))).toBe(6);
    expect(monthsUntil('2026-01-01', new Date(2024, 0, 1))).toBe(24);
  });

  it('renvoie au moins 1 mois (échéance passée ou imminente)', () => {
    expect(monthsUntil('2024-01-01', new Date(2024, 0, 1))).toBe(1);
    expect(monthsUntil('2020-01-01', new Date(2024, 0, 1))).toBe(1);
  });
});

describe('objectiveProgress — épargne de précaution', () => {
  it('compare les liquidités à la cible « mois × dépenses »', () => {
    const obj = objective({ category: 'epargne_precaution', securityMonths: 6, monthlyExpenses: 2_000 });
    const p = objectiveProgress(obj, ctx({ objectives: [obj] }));
    expect(p.target).toBe(12_000);
    expect(p.current).toBe(15_000); // courant + livret
    expect(p.pct).toBeCloseTo(125, 10);
  });

  it('ne divise pas par zéro sur une cible vide', () => {
    const obj = objective({ category: 'epargne_precaution' });
    expect(objectiveProgress(obj, ctx({ objectives: [obj] })).pct).toBe(0);
  });

  it('n’est pas plafonnée à 100 % (sur-épargne visible)', () => {
    const obj = objective({ category: 'epargne_precaution', securityMonths: 1, monthlyExpenses: 1_000 });
    expect(objectiveProgress(obj, ctx({ objectives: [obj] })).pct).toBeCloseTo(1_500, 10);
  });
});

describe('objectiveProgress — projet court terme', () => {
  it('se base sur les liquidités, précaution déduite', () => {
    const precaution = objective({ category: 'epargne_precaution', securityMonths: 5, monthlyExpenses: 1_000 });
    const projet = objective({ category: 'projet_court_terme', targetAmount: 20_000 });
    const p = objectiveProgress(projet, ctx({ objectives: [precaution, projet] }));
    expect(p.current).toBe(10_000); // 15 000 de liquidités − 5 000 réservés
    expect(p.pct).toBeCloseTo(50, 10);
  });

  it('ne descend jamais sous zéro quand la précaution absorbe tout', () => {
    const precaution = objective({ category: 'epargne_precaution', securityMonths: 24, monthlyExpenses: 5_000 });
    const projet = objective({ category: 'projet_court_terme', targetAmount: 20_000 });
    expect(objectiveProgress(projet, ctx({ objectives: [precaution, projet] })).current).toBe(0);
  });

  it('ignore le buffer, réservé aux projets long terme', () => {
    const projet = objective({ category: 'projet_court_terme', targetAmount: 20_000, bufferAmount: 9_000 });
    expect(objectiveProgress(projet, ctx({ objectives: [projet] })).current).toBe(15_000);
  });
});

describe('objectiveProgress — projet long terme', () => {
  it('se base sur tous les comptes hors immobilier, précaution et buffer déduits', () => {
    const precaution = objective({ category: 'epargne_precaution', securityMonths: 5, monthlyExpenses: 1_000 });
    const projet = objective({ category: 'projet_long_terme', targetAmount: 100_000, bufferAmount: 10_000 });
    const p = objectiveProgress(projet, ctx({ objectives: [precaution, projet] }));
    expect(p.current).toBe(25_000); // 40 000 − 5 000 − 10 000
    expect(p.pct).toBeCloseTo(25, 10);
  });

  it('inclut le PEA, contrairement au projet court terme', () => {
    const long = objective({ category: 'projet_long_terme', targetAmount: 100_000 });
    const court = objective({ category: 'projet_court_terme', targetAmount: 100_000 });
    expect(objectiveProgress(long, ctx({ objectives: [long, court] })).current).toBe(40_000);
    expect(objectiveProgress(court, ctx({ objectives: [long, court] })).current).toBe(15_000);
  });
});

describe('objectiveProgress — échéance et effort mensuel', () => {
  it('répartit le reste à financer sur les mois restants', () => {
    const projet = objective({
      category: 'projet_court_terme',
      targetAmount: 15_000 + 12_000,
      deadline: '2099-12-01',
    });
    const p = objectiveProgress(projet, ctx({ objectives: [projet] }));
    expect(p.monthsRemaining).toBeGreaterThan(0);
    expect(p.monthlyContribution).toBeCloseTo(12_000 / p.monthsRemaining!, 6);
  });

  it('n’exige plus rien une fois l’objectif dépassé', () => {
    const projet = objective({ category: 'projet_court_terme', targetAmount: 1_000, deadline: '2099-12-01' });
    expect(objectiveProgress(projet, ctx({ objectives: [projet] })).monthlyContribution).toBe(0);
  });

  it('n’expose ni effort ni mois restants sans échéance', () => {
    const projet = objective({ category: 'projet_court_terme', targetAmount: 50_000 });
    const p = objectiveProgress(projet, ctx({ objectives: [projet] }));
    expect(p.monthlyContribution).toBeUndefined();
    expect(p.monthsRemaining).toBeUndefined();
  });
});
