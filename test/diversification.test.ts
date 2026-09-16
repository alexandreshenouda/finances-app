/** Tests des diagnostics de diversification (`src/lib/diversification.ts`) : répartition
 *  cible, agrégation sectorielle/géographique et seuils de déclenchement des conseils. */
import { describe, expect, it } from 'vitest';
import {
  computeAllocationComparison,
  computeClassificationBreakdown,
  computeInsights,
  type Insight,
} from '@/lib/diversification';
import type { AccountType, Objective, RiskProfile } from '@/lib/types';
import { RATES, account, holding, objective } from './factories';

const byType = (entries: Partial<Record<AccountType, number>>) =>
  new Map(Object.entries(entries) as [AccountType, number][]);

const insights = (over: {
  accounts?: Parameters<typeof computeInsights>[0]['accounts'];
  holdings?: Parameters<typeof computeInsights>[0]['holdings'];
  byType?: Map<AccountType, number>;
  totalValue?: number;
  objectives?: Objective[];
  riskProfile?: RiskProfile;
} = {}): Insight[] =>
  computeInsights({
    accounts: over.accounts ?? [],
    holdings: over.holdings ?? [],
    snapshots: [],
    byType: over.byType ?? byType({ courant: 20, assurance_vie: 35, pea: 40, crypto: 5 }),
    totalValue: over.totalValue ?? 100,
    rates: RATES,
    objectives: over.objectives ?? [],
    riskProfile: over.riskProfile ?? 'equilibre',
  });

const ids = (list: Insight[]) => list.map((i) => i.id);
const find = (list: Insight[], id: string) => list.find((i) => i.id === id);

describe('computeAllocationComparison', () => {
  it('range les types de compte dans les quatre poches de référence', () => {
    const cmp = computeAllocationComparison(
      byType({ courant: 10, livret: 10, assurance_vie: 20, per: 10, pea: 30, cto: 10, private_equity: 5, crypto: 5 }),
      'equilibre'
    );
    expect(cmp.modeledTotal).toBe(100);
    expect(cmp.rows.map((r) => r.bucket)).toEqual(['liquidites', 'fonds_euro_per', 'actions_marches', 'crypto']);
    expect(cmp.rows.map((r) => r.actualPct)).toEqual([20, 30, 45, 5]);
  });

  it('exclut l’immobilier et « autre » du modèle, mais les rapporte à part', () => {
    const cmp = computeAllocationComparison(byType({ livret: 50, pea: 50, immobilier: 300, autre: 20 }), 'equilibre');
    expect(cmp.modeledTotal).toBe(100);
    expect(cmp.excludedTotal).toBe(320);
    expect(cmp.rows.map((r) => r.actualPct)).toEqual([50, 0, 50, 0]);
  });

  it('expose les cibles propres à chaque profil de risque', () => {
    const empty = byType({});
    expect(computeAllocationComparison(empty, 'prudent').rows.map((r) => r.targetPct)).toEqual([35, 45, 20, 0]);
    expect(computeAllocationComparison(empty, 'equilibre').rows.map((r) => r.targetPct)).toEqual([20, 35, 40, 5]);
    expect(computeAllocationComparison(empty, 'dynamique').rows.map((r) => r.targetPct)).toEqual([10, 20, 60, 10]);
  });

  it('cumule à 100 % (cibles comme réel)', () => {
    for (const profile of ['prudent', 'equilibre', 'dynamique'] as RiskProfile[]) {
      const cmp = computeAllocationComparison(byType({ livret: 1, pea: 2, crypto: 1, per: 4 }), profile);
      expect(cmp.rows.reduce((s, r) => s + r.targetPct, 0)).toBeCloseTo(100, 10);
      expect(cmp.rows.reduce((s, r) => s + r.actualPct, 0)).toBeCloseTo(100, 10);
    }
  });

  it('ne divise pas par zéro sur un patrimoine modélisable vide', () => {
    const cmp = computeAllocationComparison(byType({ immobilier: 500 }), 'equilibre');
    expect(cmp.modeledTotal).toBe(0);
    expect(cmp.rows.every((r) => r.actualPct === 0)).toBe(true);
  });
});

describe('computeClassificationBreakdown', () => {
  const acc = account({ id: 'cto', type: 'cto' });

  it('pondère secteurs et pays par la valeur des lignes', () => {
    const holdings = [
      holding({
        accountId: 'cto',
        quantity: 1,
        unitPrice: 6_000,
        sectorWeights: [
          { sector: 'technology', weight: 0.5 },
          { sector: 'financials', weight: 0.5 },
        ],
        countryWeights: [{ country: 'US', weight: 1 }],
      }),
      holding({
        accountId: 'cto',
        quantity: 1,
        unitPrice: 4_000,
        sectorWeights: [{ sector: 'technology', weight: 1 }],
        countryWeights: [{ country: 'FR', weight: 1 }],
      }),
    ];
    const b = computeClassificationBreakdown(holdings, [acc], RATES, byType({ cto: 10_000 }));
    expect(b.classifiablePool).toBe(10_000);
    expect(b.sectorCoverage).toBeCloseTo(1, 10);
    expect(b.topSectors[0]).toEqual({ sector: 'technology', pct: 70 }); // 3 000 + 4 000 sur 10 000
    expect(b.topSectors[1]).toEqual({ sector: 'financials', pct: 30 });
    expect(b.topCountries).toEqual([
      { country: 'US', pct: 60 },
      { country: 'FR', pct: 40 },
    ]);
  });

  it('mesure une couverture partielle quand des lignes ne sont pas classées', () => {
    const holdings = [
      holding({ accountId: 'cto', quantity: 1, unitPrice: 3_000, sectorWeights: [{ sector: 'energy', weight: 1 }] }),
      holding({ accountId: 'cto', quantity: 1, unitPrice: 7_000 }), // non classée
    ];
    const b = computeClassificationBreakdown(holdings, [acc], RATES, byType({ cto: 10_000 }));
    expect(b.sectorCoverage).toBeCloseTo(0.3, 10);
    expect(b.topSectors[0].pct).toBe(100); // 100 % de la part *couverte*
  });

  it('retombe sur le pays unique d’une ligne sans ventilation géographique', () => {
    const holdings = [holding({ accountId: 'cto', quantity: 1, unitPrice: 5_000, country: 'DE' })];
    const b = computeClassificationBreakdown(holdings, [acc], RATES, byType({ cto: 5_000 }));
    expect(b.topCountries).toEqual([{ country: 'DE', pct: 100 }]);
  });

  it('ne garde que les cinq premiers secteurs et pays', () => {
    const sectors = ['technology', 'financials', 'healthcare', 'energy', 'utilities', 'materials'] as const;
    const holdings = sectors.map((sector, idx) =>
      holding({ accountId: 'cto', quantity: 1, unitPrice: 1_000 * (idx + 1), sectorWeights: [{ sector, weight: 1 }] })
    );
    const b = computeClassificationBreakdown(holdings, [acc], RATES, byType({ cto: 21_000 }));
    expect(b.topSectors).toHaveLength(5);
    expect(b.topSectors[0].sector).toBe('materials'); // le plus gros d'abord
  });

  it('applique la quote-part du compte aux valeurs classées', () => {
    const shared = account({ id: 'sci', type: 'cto', ownershipPct: 50 });
    const holdings = [
      holding({ accountId: 'sci', quantity: 1, unitPrice: 10_000, sectorWeights: [{ sector: 'energy', weight: 1 }] }),
    ];
    const b = computeClassificationBreakdown(holdings, [shared], RATES, byType({ cto: 5_000 }));
    expect(b.sectorCoverage).toBeCloseTo(1, 10);
  });

  it('ne divise pas par zéro sur un patrimoine non classifiable', () => {
    const b = computeClassificationBreakdown([], [], RATES, byType({ livret: 10_000 }));
    expect(b.classifiablePool).toBe(0);
    expect(b.sectorCoverage).toBe(0);
    expect(b.geoCoverage).toBe(0);
    expect(b.topSectors).toEqual([]);
  });
});

describe('computeInsights — garde-fous', () => {
  it('ne dit rien sur un patrimoine vide', () => {
    expect(insights({ totalValue: 0 })).toEqual([]);
    expect(insights({ totalValue: -100 })).toEqual([]);
  });

  it('renvoie un message positif quand aucune règle ne se déclenche', () => {
    expect(ids(insights())).toEqual(['balanced']);
  });

  it('trie les alertes avant les informations, elles-mêmes avant les félicitations', () => {
    const list = insights({
      byType: byType({ crypto: 80, livret: 20 }), // concentration + crypto excessive
      totalValue: 100,
    });
    const ranks = list.map((i) => ({ warning: 0, info: 1, positive: 2 })[i.severity]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(ranks[0]).toBe(0);
  });
});

describe('computeInsights — concentration par type de compte', () => {
  it('reste silencieux sous 45 %', () => {
    const list = insights({ byType: byType({ pea: 44, livret: 30, cto: 26 }), totalValue: 100 });
    expect(find(list, 'type-concentration')).toBeUndefined();
  });

  it('informe à partir de 45 % et alerte à partir de 70 %', () => {
    expect(
      find(insights({ byType: byType({ pea: 45, livret: 30, cto: 25 }), totalValue: 100 }), 'type-concentration')?.severity
    ).toBe('info');
    expect(find(insights({ byType: byType({ pea: 70, livret: 30 }), totalValue: 100 }), 'type-concentration')?.severity).toBe(
      'warning'
    );
  });
});

describe('computeInsights — concentration sur une ligne', () => {
  const acc = account({ id: 'cto', type: 'cto' });
  const withLine = (unitPrice: number) =>
    insights({
      accounts: [acc],
      holdings: [holding({ accountId: 'cto', name: 'Une action', quantity: 1, unitPrice })],
      byType: byType({ cto: 100 }),
      totalValue: 100,
    });

  it('reste silencieux sous 18 % du patrimoine', () => {
    expect(find(withLine(17), 'holding-concentration')).toBeUndefined();
  });

  it('informe à 18 % et alerte à 30 %', () => {
    expect(find(withLine(18), 'holding-concentration')?.severity).toBe('info');
    expect(find(withLine(30), 'holding-concentration')?.severity).toBe('warning');
  });
});

describe('computeInsights — exposition crypto et illiquidité', () => {
  it('signale la crypto à partir de 10 %, alerte à 20 %', () => {
    expect(find(insights({ byType: byType({ crypto: 9, livret: 91 }), totalValue: 100 }), 'crypto-exposure')).toBeUndefined();
    expect(find(insights({ byType: byType({ crypto: 10, livret: 90 }), totalValue: 100 }), 'crypto-exposure')?.severity).toBe(
      'info'
    );
    expect(find(insights({ byType: byType({ crypto: 25, livret: 75 }), totalValue: 100 }), 'crypto-exposure')?.severity).toBe(
      'warning'
    );
  });

  it('signale l’illiquidité (immobilier + PER) à partir de 65 %, alerte à 80 %', () => {
    expect(
      find(insights({ byType: byType({ immobilier: 60, per: 4, livret: 36 }), totalValue: 100 }), 'illiquid-exposure')
    ).toBeUndefined();
    expect(
      find(insights({ byType: byType({ immobilier: 60, per: 5, livret: 35 }), totalValue: 100 }), 'illiquid-exposure')
        ?.severity
    ).toBe('info');
    expect(
      find(insights({ byType: byType({ immobilier: 85, livret: 15 }), totalValue: 100 }), 'illiquid-exposure')?.severity
    ).toBe('warning');
  });
});

describe('computeInsights — exposition devise', () => {
  const acc = account({ id: 'cto', type: 'cto' });
  const withUsd = (eurValue: number) =>
    insights({
      accounts: [acc],
      holdings: [holding({ accountId: 'cto', quantity: 1, unitPrice: eurValue / 0.8, currency: 'USD' })],
      byType: byType({ cto: 100 }),
      totalValue: 100,
    });

  it('ignore une exposition devise marginale', () => {
    expect(find(withUsd(14), 'currency-exposure')).toBeUndefined();
  });

  it('informe à 15 % et alerte à 30 % du patrimoine', () => {
    expect(find(withUsd(15), 'currency-exposure')?.severity).toBe('info');
    expect(find(withUsd(35), 'currency-exposure')?.severity).toBe('warning');
  });

  it('ne compte pas les lignes en euros', () => {
    const list = insights({
      accounts: [acc],
      holdings: [holding({ accountId: 'cto', quantity: 1, unitPrice: 90 })],
      byType: byType({ cto: 100 }),
      totalValue: 100,
    });
    expect(find(list, 'currency-exposure')).toBeUndefined();
  });
});

describe('computeInsights — matelas de précaution', () => {
  const precaution = objective({ category: 'epargne_precaution', securityMonths: 6, monthlyExpenses: 2_000 });

  const withCash = (amount: number) =>
    insights({
      accounts: [account({ id: 'l', type: 'livret', cashBalance: amount })],
      byType: byType({ livret: amount }),
      totalValue: amount,
      objectives: [precaution],
    });

  it('alerte quand le matelas couvre moins de la moitié de la cible', () => {
    expect(find(withCash(5_000), 'cash-cushion-low')?.severity).toBe('warning');
  });

  it('ne dit rien dans la zone raisonnable', () => {
    const list = withCash(12_000);
    expect(find(list, 'cash-cushion-low')).toBeUndefined();
    expect(find(list, 'cash-cushion-high')).toBeUndefined();
  });

  it('informe quand le matelas dépasse le double de la cible', () => {
    expect(find(withCash(30_000), 'cash-cushion-high')?.severity).toBe('info');
  });

  it('reste muet sans objectif de précaution défini', () => {
    const list = insights({
      accounts: [account({ id: 'l', type: 'livret', cashBalance: 5_000 })],
      byType: byType({ livret: 5_000 }),
      totalValue: 5_000,
    });
    expect(find(list, 'cash-cushion-low')).toBeUndefined();
  });
});

describe('computeInsights — trésorerie dormante', () => {
  it('se déclenche au-delà du seuil « 2 mois de dépenses », plancher 3 000 €', () => {
    const withCourant = (amount: number, objectives?: Objective[]) =>
      insights({
        accounts: [account({ id: 'c', type: 'courant', cashBalance: amount })],
        byType: byType({ courant: amount }),
        totalValue: amount,
        objectives,
      });

    expect(find(withCourant(3_000), 'idle-cash')).toBeUndefined(); // plancher, non dépassé
    expect(find(withCourant(4_000), 'idle-cash')?.severity).toBe('info');
    expect(find(withCourant(10_000), 'idle-cash')?.severity).toBe('warning'); // > 2,5 × seuil

    // Avec des dépenses mensuelles déclarées, le seuil suit le train de vie.
    const gros = [objective({ category: 'epargne_precaution', securityMonths: 6, monthlyExpenses: 4_000 })];
    expect(find(withCourant(7_000, gros), 'idle-cash')).toBeUndefined(); // seuil = 8 000 €
  });
});

describe('computeInsights — audit des frais', () => {
  it('additionne frais de ligne et frais d’enveloppe', () => {
    const acc = account({ id: 'av', type: 'assurance_vie', openingDate: '2000-01-01', fees: { managementPct: 0.8 } });
    const list = insights({
      accounts: [acc],
      holdings: [holding({ accountId: 'av', quantity: 1, unitPrice: 10_000, feesPct: 0.6 })],
      byType: byType({ assurance_vie: 10_000 }),
      totalValue: 10_000,
    });
    const fees = find(list, 'portfolio-fees');
    expect(fees).toBeDefined();
    expect(fees?.severity).toBe('warning'); // 1,4 % pondéré ≥ 1,3 %
  });

  it('ne dit rien sur un portefeuille peu chargé', () => {
    const acc = account({ id: 'cto', type: 'cto' });
    const list = insights({
      accounts: [acc],
      holdings: [holding({ accountId: 'cto', quantity: 1, unitPrice: 10_000, feesPct: 0.2 })],
      byType: byType({ cto: 10_000 }),
      totalValue: 10_000,
    });
    expect(find(list, 'portfolio-fees')).toBeUndefined();
  });

  it('épingle une ligne chère même si la moyenne reste basse', () => {
    const acc = account({ id: 'cto', type: 'cto' });
    const list = insights({
      accounts: [acc],
      holdings: [
        holding({ accountId: 'cto', name: 'Fonds actif', quantity: 1, unitPrice: 1_000, feesPct: 2 }),
        holding({ accountId: 'cto', name: 'ETF', quantity: 1, unitPrice: 99_000, feesPct: 0.1 }),
      ],
      byType: byType({ cto: 100_000 }),
      totalValue: 100_000,
    });
    const fees = find(list, 'portfolio-fees');
    expect(fees?.severity).toBe('info');
    expect(fees?.params?.expensiveName).toBe('Fonds actif');
  });
});

describe('computeInsights — doublons par transparence (look-through)', () => {
  it('détecte une même société portée par deux fonds différents', () => {
    const acc = account({ id: 'cto', type: 'cto' });
    const apple = { isin: 'US0378331005', name: 'Apple', weight: 0.1 };
    const list = insights({
      accounts: [acc],
      holdings: [
        holding({ accountId: 'cto', name: 'ETF Monde', quantity: 1, unitPrice: 5_000, topHoldings: [apple] }),
        holding({ accountId: 'cto', name: 'ETF S&P 500', quantity: 1, unitPrice: 5_000, topHoldings: [apple] }),
      ],
      byType: byType({ cto: 10_000 }),
      totalValue: 10_000,
    });
    const overlap = list.find((i) => i.category === 'overlap');
    expect(overlap).toBeDefined();
    expect(overlap?.params?.company).toBe('Apple');
    expect(overlap?.params?.count).toBe(2);
  });

  it('ne signale rien quand la société n’est présente que dans un fonds', () => {
    const acc = account({ id: 'cto', type: 'cto' });
    const list = insights({
      accounts: [acc],
      holdings: [
        holding({
          accountId: 'cto',
          name: 'ETF Monde',
          quantity: 1,
          unitPrice: 10_000,
          topHoldings: [{ isin: 'US0378331005', name: 'Apple', weight: 0.1 }],
        }),
      ],
      byType: byType({ cto: 10_000 }),
      totalValue: 10_000,
    });
    expect(list.find((i) => i.category === 'overlap')).toBeUndefined();
  });
});

describe('computeInsights — concentration sectorielle et géographique', () => {
  const acc = account({ id: 'cto', type: 'cto' });

  it('alerte sur un secteur dominant une fois la couverture suffisante', () => {
    const list = insights({
      accounts: [acc],
      holdings: [
        holding({ accountId: 'cto', quantity: 1, unitPrice: 6_000, sectorWeights: [{ sector: 'technology', weight: 1 }] }),
        holding({ accountId: 'cto', quantity: 1, unitPrice: 4_000, sectorWeights: [{ sector: 'financials', weight: 1 }] }),
      ],
      byType: byType({ cto: 10_000 }),
      totalValue: 10_000,
    });
    expect(find(list, 'sector-concentration')?.severity).toBe('warning'); // 60 % ≥ 55 %
  });

  it('se tait tant que moins de 30 % du portefeuille est classé', () => {
    const list = insights({
      accounts: [acc],
      holdings: [
        holding({ accountId: 'cto', quantity: 1, unitPrice: 2_000, sectorWeights: [{ sector: 'technology', weight: 1 }] }),
      ],
      byType: byType({ cto: 10_000 }),
      totalValue: 10_000,
    });
    expect(find(list, 'sector-concentration')).toBeUndefined();
  });

  it('alerte sur un pays dominant, en ignorant la poche « autre »', () => {
    const list = insights({
      accounts: [acc],
      holdings: [
        holding({
          accountId: 'cto',
          quantity: 1,
          unitPrice: 10_000,
          countryWeights: [
            { country: 'US', weight: 0.7 },
            { country: 'autre', weight: 0.3 },
          ],
        }),
      ],
      byType: byType({ cto: 10_000 }),
      totalValue: 10_000,
    });
    const geo = find(list, 'geo-concentration');
    expect(geo?.severity).toBe('warning'); // 70 % ≥ 60 %
  });
});

describe('computeInsights — écart à la répartition cible', () => {
  it('reste silencieux sous 8 points d’écart', () => {
    const list = insights({ byType: byType({ courant: 25, assurance_vie: 33, pea: 37, crypto: 5 }), totalValue: 100 });
    expect(find(list, 'allocation-gap')).toBeUndefined();
  });

  it('informe à partir de 8 points et alerte à partir de 15', () => {
    const info = insights({ byType: byType({ courant: 28, assurance_vie: 35, pea: 32, crypto: 5 }), totalValue: 100 });
    expect(find(info, 'allocation-gap')?.severity).toBe('info');

    const warning = insights({ byType: byType({ courant: 60, assurance_vie: 20, pea: 20 }), totalValue: 100 });
    expect(find(warning, 'allocation-gap')?.severity).toBe('warning');
  });

  it('dépend du profil de risque choisi', () => {
    const allocation = byType({ courant: 10, assurance_vie: 20, pea: 60, crypto: 10 });
    expect(find(insights({ byType: allocation, totalValue: 100, riskProfile: 'dynamique' }), 'allocation-gap')).toBeUndefined();
    expect(find(insights({ byType: allocation, totalValue: 100, riskProfile: 'prudent' }), 'allocation-gap')?.severity).toBe(
      'warning'
    );
  });
});

describe('computeInsights — antériorité fiscale PEA / assurance-vie', () => {
  const recent = new Date();
  const isoYearsAgo = (years: number) =>
    `${recent.getFullYear() - years}-${String(recent.getMonth() + 1).padStart(2, '0')}-01`;

  it('décompte les 5 ans du PEA puis félicite une fois la maturité atteinte', () => {
    const jeune = account({ id: 'pea1', name: 'PEA', type: 'pea', openingDate: isoYearsAgo(2), cashBalance: 1_000 });
    const mur = account({ id: 'pea2', name: 'PEA', type: 'pea', openingDate: isoYearsAgo(9), cashBalance: 1_000 });

    const listJeune = insights({ accounts: [jeune], byType: byType({ pea: 1_000 }), totalValue: 1_000 });
    expect(find(listJeune, 'pea-under-5-pea1')?.severity).toBe('info');

    const listMur = insights({ accounts: [mur], byType: byType({ pea: 1_000 }), totalValue: 1_000 });
    expect(find(listMur, 'pea-mature-pea2')?.severity).toBe('positive');
  });

  it('réclame la date d’ouverture quand elle manque', () => {
    const sansDate = account({ id: 'pea3', name: 'PEA', type: 'pea', cashBalance: 1_000 });
    expect(find(insights({ accounts: [sansDate], byType: byType({ pea: 1_000 }), totalValue: 1_000 }), 'pea-no-date-pea3'))
      .toBeDefined();
  });

  it('signale l’approche du plafond de versements du PEA', () => {
    const plein = account({ id: 'pea4', name: 'PEA', type: 'pea', openingDate: isoYearsAgo(9), cashBalance: 140_000 });
    expect(find(insights({ accounts: [plein], byType: byType({ pea: 140_000 }), totalValue: 140_000 }), 'pea-ceiling-pea4'))
      .toBeDefined();
  });

  it('suggère un PEA à qui n’a qu’un CTO significatif', () => {
    const cto = account({ id: 'cto', name: 'CTO', type: 'cto', cashBalance: 5_000 });
    expect(find(insights({ accounts: [cto], byType: byType({ cto: 5_000 }), totalValue: 5_000 }), 'pea-missing')).toBeDefined();
  });

  it('décompte les 8 ans de l’assurance-vie', () => {
    const jeune = account({ id: 'av1', name: 'AV', type: 'assurance_vie', openingDate: isoYearsAgo(3), cashBalance: 1_000 });
    const mur = account({ id: 'av2', name: 'AV', type: 'assurance_vie', openingDate: isoYearsAgo(10), cashBalance: 1_000 });
    expect(find(insights({ accounts: [jeune], byType: byType({ assurance_vie: 1_000 }), totalValue: 1_000 }), 'av-under-8-av1'))
      .toBeDefined();
    expect(
      find(insights({ accounts: [mur], byType: byType({ assurance_vie: 1_000 }), totalValue: 1_000 }), 'av-mature-av2')
        ?.severity
    ).toBe('positive');
  });

  it('alerte sur les frais d’enveloppe élevés d’une assurance-vie', () => {
    const chere = account({
      id: 'av3',
      name: 'AV',
      type: 'assurance_vie',
      openingDate: isoYearsAgo(10),
      cashBalance: 1_000,
      fees: { managementPct: 1.2 },
    });
    expect(
      find(insights({ accounts: [chere], byType: byType({ assurance_vie: 1_000 }), totalValue: 1_000 }), 'av-high-fees-av3')
        ?.severity
    ).toBe('warning');
  });
});

describe('computeInsights — adéquation horizon / risque', () => {
  it('alerte quand un projet court terme repose sur des actifs volatils', () => {
    const projet = objective({ id: 'o1', category: 'projet_court_terme', name: 'Apport', targetAmount: 30_000 });
    const list = insights({
      byType: byType({ livret: 10_000, pea: 90_000 }),
      totalValue: 100_000,
      objectives: [projet],
    });
    expect(find(list, 'horizon-short-o1')?.severity).toBe('warning');
  });

  it('ne dit rien si les liquidités couvrent déjà le projet', () => {
    const projet = objective({ id: 'o2', category: 'projet_court_terme', targetAmount: 10_000 });
    const list = insights({
      byType: byType({ livret: 50_000, pea: 50_000 }),
      totalValue: 100_000,
      objectives: [projet],
    });
    expect(find(list, 'horizon-short-o2')).toBeUndefined();
  });

  it('signale un projet long terme laissé quasi intégralement en liquidités', () => {
    const projet = objective({ id: 'o3', category: 'projet_long_terme', targetAmount: 200_000 });
    const list = insights({
      byType: byType({ livret: 95_000, pea: 5_000 }),
      totalValue: 100_000,
      objectives: [projet],
    });
    expect(find(list, 'horizon-long-inflation')?.severity).toBe('info');
  });
});
