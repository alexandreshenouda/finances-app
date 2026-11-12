/** Tests des flux constatés : versements nets, dividendes, plafond PEA (`src/lib/cashflows.ts`). */
import { describe, expect, it } from 'vitest';
import { netContributions } from '@/lib/cashflows';
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

