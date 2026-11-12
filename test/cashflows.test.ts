/** Tests des flux constatés : versements nets, dividendes, plafond PEA (`src/lib/cashflows.ts`). */
import { describe, expect, it } from 'vitest';
import { dividendSummary, netContributions, PEA_CEILING_NEAR_RATIO, peaCeilingStatus } from '@/lib/cashflows';
import type { CashFlow, CashFlowKind } from '@/lib/types';
import { account, holding, RATES } from './factories';

let seq = 0;
const flow = (accountId: string, date: string, kind: CashFlowKind, amount: number, over: Partial<CashFlow> = {}): CashFlow => ({
  id: `f${++seq}`,
  accountId,
  date,
  kind,
  amount,
  ...over,
});

describe('netContributions', () => {
  const cto = account({ id: 'cto' });
  const flows = [
    flow('cto', '2024-01-01', 'deposit', 999), // borne de début : exclue
    flow('cto', '2024-01-15', 'deposit', 1_000),
    flow('cto', '2024-02-10', 'withdrawal', 250),
    flow('cto', '2024-03-31', 'deposit', 500), // borne de fin : incluse
    flow('cto', '2024-04-01', 'deposit', 999), // après la fenêtre
    flow('cto', '2024-02-01', 'dividend', 40), // un revenu n'est pas un versement
  ];

  it('somme dépôts et retraits sur ]from ; to], hors revenus', () => {
    const r = netContributions(flows, [cto], '2024-01-01', '2024-03-31');
    expect(r).toMatchObject({ deposits: 1_500, withdrawals: 250, net: 1_250, trackedAccountIds: ['cto'] });
    // 90 jours (2024 est bissextile) ramenés au mois moyen de 365,25 / 12 jours.
    expect(r.monthly).toBeCloseTo(1_250 / (90 / (365.25 / 12)), 9);
  });

  it('applique la quote-part et ignore comptes archivés ou inconnus', () => {
    const moitie = account({ id: 'half', ownershipPct: 50 });
    const archive = account({ id: 'old', archived: true });
    const r = netContributions(
      [flow('half', '2024-02-01', 'deposit', 1_000), flow('old', '2024-02-01', 'deposit', 5_000), flow('ghost', '2024-02-01', 'deposit', 7_000)],
      [moitie, archive],
      '2024-01-01',
      '2024-03-01'
    );
    expect(r).toMatchObject({ deposits: 500, net: 500, trackedAccountIds: ['half'] });
  });

  it('ne donne pas de moyenne mensuelle sans compte suivi ni sur une fenêtre trop courte', () => {
    expect(netContributions([flow('cto', '2024-02-01', 'dividend', 10)], [cto], '2024-01-01', '2024-03-31')).toMatchObject({
      net: 0,
      monthly: undefined,
      trackedAccountIds: [],
    });
    expect(netContributions(flows, [cto], '2024-01-10', '2024-01-20').monthly).toBeUndefined();
    expect(netContributions(flows, [cto], '2024-01-10', '2024-01-20', 10).monthly).toBeDefined();
  });

  it('un compte suivi sans mouvement dans la fenêtre vaut zéro, pas « inconnu »', () => {
    const r = netContributions([flow('cto', '2020-01-01', 'deposit', 100)], [cto], '2024-01-01', '2024-03-31');
    expect(r).toMatchObject({ net: 0, monthly: 0, trackedAccountIds: ['cto'] });
  });
});

describe('dividendSummary', () => {
  const today = '2024-06-30';
  const cto = account({ id: 'cto' });
  const TOTAL = 'FR0000120271';
  const holdings = [
    holding({ accountId: 'cto', name: 'TotalEnergies', isin: TOTAL, quantity: 100, buyPrice: 50 }), // 5 000 €
    holding({ accountId: 'cto', name: 'Apple', isin: 'US0378331005', quantity: 10, buyPrice: 100, currency: 'USD' }), // 1 000 $ = 800 €
    holding({ accountId: 'cto', name: 'Sans PRU', quantity: 3 }),
    holding({ accountId: 'autre', name: 'Hors périmètre', quantity: 1, buyPrice: 9_999 }),
  ];
  const flows = [
    flow('cto', '2024-05-01', 'dividend', 79, { isin: TOTAL, label: 'Dividende' }),
    flow('cto', '2024-02-01', 'dividend', 66, { isin: TOTAL }),
    flow('cto', '2024-03-01', 'dividend', 29, { label: 'Coupon inconnu' }),
    flow('cto', '2023-06-30', 'dividend', 500, { isin: TOTAL }), // il y a pile 366 jours : hors 12 mois
    flow('cto', '2022-05-01', 'dividend', 40, { isin: TOTAL }),
    flow('cto', '2024-04-01', 'interest', 12),
    flow('cto', '2023-01-01', 'interest', 99), // trop ancien
    flow('cto', '2024-04-01', 'deposit', 1_000),
    flow('cto', '2024-07-15', 'dividend', 1_000, { isin: TOTAL }), // dans le futur
    flow('autre', '2024-05-01', 'dividend', 1_000),
  ];

  it('totalise 12 mois glissants, par année et par titre, et rapporte au prix de revient', () => {
    const s = dividendSummary(flows, holdings, [cto], RATES, today);
    expect(s.last12m).toBe(79 + 66 + 29);
    expect(s.interest12m).toBe(12);
    expect(s.byYear).toEqual([
      { year: '2024', total: 174 },
      { year: '2023', total: 500 },
      { year: '2022', total: 40 },
    ]);
    expect(s.byIsin).toEqual([
      { isin: TOTAL, label: 'TotalEnergies', total: 145 },
      { isin: 'Coupon inconnu', label: 'Coupon inconnu', total: 29 },
    ]);
    expect(s.costBasis).toBe(100 * 50 + 10 * 100 * RATES.USD);
    expect(s.yieldOnCostPct).toBeCloseTo((174 / 5_800) * 100, 9);
  });

  it('applique la quote-part du compte', () => {
    const moitie = account({ id: 'cto', ownershipPct: 50 });
    const s = dividendSummary(flows, holdings, [moitie], RATES, today);
    expect(s.last12m).toBe(87);
    expect(s.costBasis).toBe(2_900);
    expect(s.yieldOnCostPct).toBeCloseTo(3, 9);
  });

  it('ne calcule pas de rendement sans prix de revient, et nomme un titre vendu par son libellé', () => {
    const s = dividendSummary([flow('cto', '2024-05-01', 'dividend', 10, { isin: TOTAL }), flow('cto', '2024-05-02', 'dividend', 5)], [], [cto], RATES, today);
    expect(s).toMatchObject({ last12m: 15, costBasis: 0, yieldOnCostPct: undefined });
    expect(s.byIsin).toEqual([
      { isin: TOTAL, label: TOTAL, total: 10 },
      { isin: '?', label: '?', total: 5 },
    ]);
  });
});

describe('peaCeilingStatus', () => {
  it('ne s’applique qu’à un PEA dont les versements sont connus', () => {
    expect(peaCeilingStatus(account({ type: 'cto', peaDeposits: 10 }))).toBeUndefined();
    expect(peaCeilingStatus(account({ type: 'pea' }))).toBeUndefined();
  });

  it('rapporte les versements au plafond légal par défaut', () => {
    expect(peaCeilingStatus(account({ type: 'pea', peaDeposits: 37_500 }))).toEqual({
      deposits: 37_500,
      ceiling: 150_000,
      ratio: 0.25,
      remaining: 112_500,
    });
    expect(peaCeilingStatus(account({ type: 'pea', peaDeposits: 0 }))?.ratio).toBe(0);
    expect(PEA_CEILING_NEAR_RATIO).toBe(0.9);
  });

  it('utilise le plafond du connecteur, borne le ratio à 1 et le reliquat à 0', () => {
    expect(peaCeilingStatus(account({ type: 'pea', peaDeposits: 30_000, peaCeiling: 20_000 }))).toEqual({
      deposits: 30_000,
      ceiling: 20_000,
      ratio: 1,
      remaining: 0,
    });
    // Plafond ou versements aberrants : repli sur le plafond légal, versements ramenés à 0.
    expect(peaCeilingStatus(account({ type: 'pea', peaDeposits: -5, peaCeiling: 0 }))).toMatchObject({ deposits: 0, ceiling: 150_000 });
  });
});
