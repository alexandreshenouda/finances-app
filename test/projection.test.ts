/** Tests du moteur de projection patrimoniale (`src/lib/projection.ts`). */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROJECTION_SETTINGS,
  addMonthsToDate,
  calculateHistoricalCagr,
  simulatePatrimoineProjection,
  type ProjectionSettings,
} from '@/lib/projection';
import { RATES, account, loan, objective, property } from './factories';
import type { Account, Holding, HousePricePoint, Loan, Objective, Property, Snapshot } from '@/lib/types';

const TODAY = '2024-01-01';

/** Indice plat : l'immobilier ne bouge que par `realEstateGrowthPct`, pas par l'indice. */
const FLAT_INDEX: HousePricePoint[] = [
  { date: '2000-01-01', value: 100 },
  { date: '2040-01-01', value: 100 },
];

const settings = (over: Partial<ProjectionSettings> = {}): ProjectionSettings => ({
  ...DEFAULT_PROJECTION_SETTINGS,
  horizonYears: 1,
  customRatePct: 0,
  realEstateGrowthPct: 0,
  includeRealEstate: false,
  ...over,
});

const context = (over: {
  accounts?: Account[];
  holdings?: Holding[];
  snapshots?: Snapshot[];
  properties?: Property[];
  loans?: Loan[];
  objectives?: Objective[];
} = {}) => ({
  accounts: over.accounts ?? [],
  holdings: over.holdings ?? [],
  snapshots: over.snapshots ?? [],
  rates: RATES,
  properties: over.properties ?? [],
  loans: over.loans ?? [],
  houseSeries: FLAT_INDEX,
  objectives: over.objectives,
});

const cash = (amount: number, over: Parameters<typeof account>[0] = {}) =>
  account({ type: 'livret', cashBalance: amount, ...over });

describe('addMonthsToDate', () => {
  it('ajoute des mois et borne au dernier jour du mois cible', () => {
    expect(addMonthsToDate('2024-01-15', 6)).toBe('2024-07-15');
    expect(addMonthsToDate('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonthsToDate('2024-01-01', 360)).toBe('2054-01-01');
  });
});

describe('calculateHistoricalCagr', () => {
  it('annualise géométriquement une progression', () => {
    // 731 jours entre le 01/01/2020 et le 01/01/2022 (2020 bissextile).
    const cagr = calculateHistoricalCagr([
      { date: '2020-01-01', value: 100 },
      { date: '2022-01-01', value: 200 },
    ]);
    expect(cagr).toBeCloseTo((Math.pow(2, 365.25 / 731) - 1) * 100, 6);
    expect(cagr).toBeCloseTo(41.37, 1);
  });

  it('renvoie un taux négatif sur une série baissière', () => {
    const cagr = calculateHistoricalCagr([
      { date: '2020-01-01', value: 200 },
      { date: '2022-01-01', value: 100 },
    ]);
    expect(cagr).toBeLessThan(0);
    expect(cagr).toBeCloseTo(-29.27, 1);
  });

  it('est indéfini sur moins de deux points', () => {
    expect(calculateHistoricalCagr([])).toBeUndefined();
    expect(calculateHistoricalCagr([{ date: '2020-01-01', value: 100 }])).toBeUndefined();
  });

  it('refuse une fenêtre trop courte pour être annualisée', () => {
    expect(
      calculateHistoricalCagr([
        { date: '2020-01-01', value: 100 },
        { date: '2020-01-13', value: 150 },
      ])
    ).toBeUndefined();
    expect(
      calculateHistoricalCagr([
        { date: '2020-01-01', value: 100 },
        { date: '2020-01-15', value: 150 },
      ])
    ).toBeDefined();
  });

  it('est indéfini si une borne est nulle ou négative (patrimoine net endetté)', () => {
    expect(
      calculateHistoricalCagr([
        { date: '2020-01-01', value: 0 },
        { date: '2021-01-01', value: 100 },
      ])
    ).toBeUndefined();
    expect(
      calculateHistoricalCagr([
        { date: '2020-01-01', value: 100 },
        { date: '2021-01-01', value: -50 },
      ])
    ).toBeUndefined();
  });

  it('borne les valeurs aberrantes à [-90 %, +200 %]', () => {
    expect(
      calculateHistoricalCagr([
        { date: '2020-01-01', value: 100 },
        { date: '2020-02-01', value: 10_000 },
      ])
    ).toBe(200);
    expect(
      calculateHistoricalCagr([
        { date: '2020-01-01', value: 10_000 },
        { date: '2020-02-01', value: 1 },
      ])
    ).toBe(-90);
  });
});

describe('simulatePatrimoineProjection — capitalisation', () => {
  it('laisse le capital inchangé à taux nul et sans versement', () => {
    const res = simulatePatrimoineProjection(settings(), context({ accounts: [cash(100_000)] }), TODAY);
    expect(res.points).toHaveLength(13); // mois 0 à 12
    expect(res.points[0]).toEqual({ date: TODAY, value: 100_000 });
    expect(res.points[12].value).toBe(100_000);
    expect(res.breakdown.totalGains).toBe(0);
  });

  it('capitalise exactement le taux annuel demandé sur un an', () => {
    const res = simulatePatrimoineProjection(
      settings({ customRatePct: 6 }),
      context({ accounts: [cash(100_000)] }),
      TODAY
    );
    expect(res.breakdown.finalGross).toBeCloseTo(106_000, 6);
    expect(res.breakdown.totalGains).toBeCloseTo(6_000, 6);
    expect(res.breakdown.effectiveAnnualRatePct).toBeCloseTo(6, 10);
  });

  it('capitalise sur plusieurs années (intérêts composés)', () => {
    const res = simulatePatrimoineProjection(
      settings({ customRatePct: 6, horizonYears: 10 }),
      context({ accounts: [cash(100_000)] }),
      TODAY
    );
    expect(res.breakdown.finalGross).toBeCloseTo(100_000 * Math.pow(1.06, 10), 4);
  });

  it('ajoute les versements mensuels et les comptabilise à part des gains', () => {
    const res = simulatePatrimoineProjection(
      settings({ monthlyContribution: 1_000 }),
      context({ accounts: [cash(100_000)] }),
      TODAY
    );
    expect(res.breakdown.finalGross).toBeCloseTo(112_000, 6);
    expect(res.breakdown.totalContributions).toBe(12_000);
    expect(res.breakdown.totalGains).toBe(0); // tout vient des versements, rien du rendement
  });

  it('chiffre le coût des frais comme l’écart avec une projection à 0 % de frais', () => {
    const res = simulatePatrimoineProjection(
      settings({ customRatePct: 6, annualFeesPct: 1 }),
      context({ accounts: [cash(100_000)] }),
      TODAY
    );
    expect(res.breakdown.finalGross).toBeCloseTo(105_000, 4); // 6 % − 1 % de frais
    expect(res.breakdown.totalFeesCost).toBeCloseTo(1_000, 4);
  });

  it('raisonne en euros constants quand l’inflation est activée', () => {
    const res = simulatePatrimoineProjection(
      settings({ customRatePct: 6, adjustForInflation: true, inflationRatePct: 6 }),
      context({ accounts: [cash(100_000)] }),
      TODAY
    );
    // Un rendement égal à l'inflation ne fait gagner aucun pouvoir d'achat.
    expect(res.breakdown.effectiveAnnualRatePct).toBeCloseTo(0, 10);
    expect(res.breakdown.finalGross).toBeCloseTo(100_000, 4);
  });

  it('applique la quote-part des comptes au capital de départ', () => {
    const res = simulatePatrimoineProjection(
      settings(),
      context({ accounts: [cash(100_000, { ownershipPct: 50 })] }),
      TODAY
    );
    expect(res.breakdown.startGross).toBeCloseTo(50_000, 6);
  });

  it('ignore les comptes archivés', () => {
    const res = simulatePatrimoineProjection(
      settings(),
      context({ accounts: [cash(100_000), cash(999_000, { archived: true })] }),
      TODAY
    );
    expect(res.breakdown.startGross).toBe(100_000);
  });
});

describe('simulatePatrimoineProjection — taux historique', () => {
  it('utilise le CAGR de la série historique fournie', () => {
    const res = simulatePatrimoineProjection(
      settings({ rateMode: 'historical', customRatePct: 99 }),
      {
        ...context({ accounts: [cash(100_000)] }),
        historicalSeries: [
          { date: '2022-01-01', value: 100 },
          { date: '2024-01-01', value: 200 },
        ],
      },
      TODAY
    );
    expect(res.breakdown.cagrCalculated).toBeDefined();
    expect(res.breakdown.effectiveAnnualRatePct).toBeCloseTo(res.breakdown.cagrCalculated!, 10);
    expect(res.breakdown.effectiveAnnualRatePct).not.toBeCloseTo(99, 1);
  });

  it('retombe sur le taux saisi si l’historique est inexploitable', () => {
    const res = simulatePatrimoineProjection(
      settings({ rateMode: 'historical', customRatePct: 4 }),
      { ...context({ accounts: [cash(100_000)] }), historicalSeries: [{ date: '2024-01-01', value: 100 }] },
      TODAY
    );
    expect(res.breakdown.cagrCalculated).toBeUndefined();
    expect(res.breakdown.effectiveAnnualRatePct).toBeCloseTo(4, 10);
  });
});

describe('simulatePatrimoineProjection — immobilier et dettes', () => {
  const house = property({ id: 'p1', purchasePrice: 300_000, purchaseDate: '2020-01-01' });

  it('exclut totalement l’immobilier quand l’option est décochée', () => {
    const res = simulatePatrimoineProjection(
      settings({ includeRealEstate: false }),
      context({ accounts: [cash(100_000)], properties: [house] }),
      TODAY
    );
    expect(res.breakdown.startGross).toBe(100_000);
  });

  it('ajoute la valeur du bien et la fait croître à son propre taux', () => {
    const res = simulatePatrimoineProjection(
      settings({ includeRealEstate: true, realEstateGrowthPct: 2 }),
      context({ accounts: [cash(100_000)], properties: [house] }),
      TODAY
    );
    expect(res.breakdown.startGross).toBeCloseTo(400_000, 4);
    expect(res.breakdown.finalGross).toBeCloseTo(100_000 + 300_000 * 1.02, 4);
  });

  it('applique la quote-part du bien', () => {
    const sci = property({ id: 'p2', purchasePrice: 300_000, purchaseDate: '2020-01-01', ownershipPct: 50 });
    const res = simulatePatrimoineProjection(
      settings({ includeRealEstate: true }),
      context({ accounts: [], properties: [sci] }),
      TODAY
    );
    expect(res.breakdown.startGross).toBeCloseTo(150_000, 4);
  });

  it('amortit réellement la dette : le passif tombe à zéro à l’échéance', () => {
    const consoLoan = loan({ principal: 12_000, annualRate: 0, termMonths: 12, startDate: TODAY });
    const res = simulatePatrimoineProjection(
      settings({ net: true }),
      context({ accounts: [cash(100_000)], loans: [consoLoan] }),
      TODAY
    );
    expect(res.breakdown.startDebt).toBeCloseTo(12_000, 6);
    expect(res.breakdown.startNet).toBeCloseTo(88_000, 6);
    expect(res.points[0].value).toBe(88_000);
    expect(res.breakdown.finalDebt).toBeCloseTo(0, 4);
    expect(res.breakdown.totalDebtAmortized).toBeCloseTo(12_000, 4);
    expect(res.points[12].value).toBe(100_000);
  });

  it('montre la dette mi-parcours (équité qui se reconstitue progressivement)', () => {
    const consoLoan = loan({ principal: 12_000, annualRate: 0, termMonths: 12, startDate: TODAY });
    const res = simulatePatrimoineProjection(
      settings({ net: true }),
      context({ accounts: [cash(100_000)], loans: [consoLoan] }),
      TODAY
    );
    expect(res.points[6].value).toBeCloseTo(94_000, 0); // la moitié du capital remboursée
  });

  it('ignore les dettes en mode brut', () => {
    const consoLoan = loan({ principal: 12_000, annualRate: 0, termMonths: 12, startDate: TODAY });
    const res = simulatePatrimoineProjection(
      settings({ net: false }),
      context({ accounts: [cash(100_000)], loans: [consoLoan] }),
      TODAY
    );
    expect(res.points[0].value).toBe(100_000);
    expect(res.breakdown.finalDebt).toBe(0);
  });

  it('déduit la dette conso même quand l’immobilier est exclu', () => {
    const consoLoan = loan({ principal: 10_000, annualRate: 0, termMonths: 120, startDate: TODAY });
    const immoLoan = loan({ propertyId: 'p1', principal: 200_000, annualRate: 0, termMonths: 120, startDate: TODAY });
    const res = simulatePatrimoineProjection(
      settings({ net: true, includeRealEstate: false }),
      context({ accounts: [cash(100_000)], properties: [house], loans: [consoLoan, immoLoan] }),
      TODAY
    );
    expect(res.breakdown.startDebt).toBeCloseTo(10_000, 6);
  });
});

describe('simulatePatrimoineProjection — échantillonnage des points', () => {
  it('garde un tracé lisible quel que soit l’horizon', () => {
    for (const horizonYears of [3, 5, 10, 15, 20, 30]) {
      const res = simulatePatrimoineProjection(settings({ horizonYears }), context({ accounts: [cash(1_000)] }), TODAY);
      expect(res.points.length).toBeGreaterThanOrEqual(37);
      expect(res.points.length).toBeLessThanOrEqual(181);
      expect(res.points[0].date).toBe(TODAY);
      // Le dernier point tombe toujours exactement sur l'horizon.
      expect(res.points[res.points.length - 1].date).toBe(addMonthsToDate(TODAY, horizonYears * 12));
    }
  });
});

describe('simulatePatrimoineProjection — atteinte des objectifs', () => {
  it('date l’atteinte d’un objectif d’épargne de précaution', () => {
    const precaution = objective({ category: 'epargne_precaution', securityMonths: 2, monthlyExpenses: 10_000 });
    const res = simulatePatrimoineProjection(
      settings({ horizonYears: 2, monthlyContribution: 1_000, net: false }),
      context({ accounts: [cash(10_000)], objectives: [precaution] }),
      TODAY
    );
    expect(res.reachedObjectives).toHaveLength(1);
    expect(res.reachedObjectives[0].targetAmount).toBe(20_000);
    expect(res.reachedObjectives[0].currentAmount).toBe(10_000);
    expect(res.reachedObjectives[0].monthsToReach).toBe(10);
    expect(res.reachedObjectives[0].reachedDate).toBe('2024-11-01');
    expect(res.reachedObjectives[0].reachedAtHorizon).toBe(true);
  });

  it('n’affiche pas les objectifs déjà atteints aujourd’hui', () => {
    const done = objective({ category: 'projet_long_terme', targetAmount: 5_000 });
    const res = simulatePatrimoineProjection(
      settings(),
      context({ accounts: [cash(10_000)], objectives: [done] }),
      TODAY
    );
    expect(res.reachedObjectives).toHaveLength(0);
  });

  it('ignore les objectifs sans montant cible', () => {
    const vague = objective({ category: 'projet_long_terme' });
    const res = simulatePatrimoineProjection(
      settings(),
      context({ accounts: [cash(10_000)], objectives: [vague] }),
      TODAY
    );
    expect(res.reachedObjectives).toHaveLength(0);
  });

  it('marque comme non atteint un objectif hors de portée à l’horizon', () => {
    const big = objective({ category: 'projet_long_terme', targetAmount: 1_000_000 });
    const res = simulatePatrimoineProjection(
      settings({ horizonYears: 2 }),
      context({ accounts: [cash(10_000)], objectives: [big] }),
      TODAY
    );
    expect(res.reachedObjectives[0].reachedAtHorizon).toBe(false);
    expect(res.reachedObjectives[0].reachedDate).toBeUndefined();
  });

  it('n’inclut JAMAIS l’immobilier physique dans l’assiette des objectifs', () => {
    const big = objective({ category: 'projet_long_terme', targetAmount: 15_000 });
    const house = property({ id: 'p1', purchasePrice: 500_000, purchaseDate: '2020-01-01' });
    const withRe = simulatePatrimoineProjection(
      settings({ horizonYears: 2, monthlyContribution: 1_000, includeRealEstate: true }),
      context({ accounts: [cash(10_000)], properties: [house], objectives: [big] }),
      TODAY
    );
    const withoutRe = simulatePatrimoineProjection(
      settings({ horizonYears: 2, monthlyContribution: 1_000, includeRealEstate: false }),
      context({ accounts: [cash(10_000)], objectives: [big] }),
      TODAY
    );
    expect(withRe.reachedObjectives[0].monthsToReach).toBe(5);
    expect(withRe.reachedObjectives[0].monthsToReach).toBe(withoutRe.reachedObjectives[0].monthsToReach);
  });

  it('réserve l’épargne de précaution avant les projets court terme', () => {
    const precaution = objective({ category: 'epargne_precaution', securityMonths: 2, monthlyExpenses: 5_000 });
    const projet = objective({ category: 'projet_court_terme', targetAmount: 6_000 });
    const res = simulatePatrimoineProjection(
      settings({ horizonYears: 3, monthlyContribution: 1_000 }),
      context({ accounts: [cash(4_000)], objectives: [precaution, projet] }),
      TODAY
    );
    const courtTerme = res.reachedObjectives.find((t) => t.objective.id === projet.id)!;
    // 6 000 € manquent à la précaution (10 000 visés, 4 000 disponibles) ; le projet ne
    // progresse qu'ensuite : 6 mois pour combler, puis 6 mois pour atteindre 6 000 €.
    expect(courtTerme.currentAmount).toBe(0);
    expect(courtTerme.monthsToReach).toBe(12);
  });
});

describe('DEFAULT_PROJECTION_SETTINGS', () => {
  it('propose des réglages prudents et exploitables', () => {
    expect(DEFAULT_PROJECTION_SETTINGS.horizonYears).toBeGreaterThan(0);
    expect(DEFAULT_PROJECTION_SETTINGS.rateMode).toBe('custom');
    expect(DEFAULT_PROJECTION_SETTINGS.net).toBe(true);
    expect(DEFAULT_PROJECTION_SETTINGS.adjustForInflation).toBe(false);
  });

  it('produit une projection cohérente telle quelle', () => {
    const res = simulatePatrimoineProjection(
      DEFAULT_PROJECTION_SETTINGS,
      context({ accounts: [cash(50_000)] }),
      TODAY
    );
    expect(res.points.length).toBeGreaterThan(1);
    expect(res.breakdown.finalGross).toBeGreaterThan(res.breakdown.startGross);
  });
});
