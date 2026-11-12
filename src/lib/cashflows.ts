/**
 * Flux constatés sur les comptes (`CashFlow`) : versements nets, dividendes reçus et
 * plafond du PEA. Logique pure — les flux viennent des connecteurs (Trade Republic) et
 * sont stockés dans `store.cashFlows`.
 */
import { addDays, todayKey } from './format';
import { toEur } from './fx';
import { accountShare, holdingCurrency } from './portfolio';
import { type Account, type CashFlow, type FxRates, type Holding } from './types';

const DAYS_PER_MONTH = 365.25 / 12;

/** Jours entre deux clés de date, en UTC (insensible aux changements d'heure). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// ─── Versements nets ────────────────────────────────────────────────────────

export interface NetContributions {
  deposits: number;
  withdrawals: number;
  /** Versements − retraits sur la fenêtre (EUR, quote-part appliquée). */
  net: number;
  /** Moyenne mensuelle ; absente si la fenêtre fait moins de `minDays`. */
  monthly?: number;
  /** Comptes actifs disposant d'un historique de versements. */
  trackedAccountIds: string[];
}

/**
 * Versements nets (dépôts − retraits) des comptes sur ]from ; to]. Contrairement à la
 * variation de valeur des comptes, ce chiffre ne contient aucune performance de marché :
 * c'est l'effort d'épargne réellement versé. Seuls les comptes pour lesquels au moins un
 * versement ou retrait est connu sont « suivis » — les autres n'ont simplement pas
 * d'historique, ce qui ne veut pas dire zéro versement.
 */
export function netContributions(
  flows: CashFlow[],
  accounts: Account[],
  from: string,
  to: string = todayKey(),
  minDays = 28
): NetContributions {
  const shares = new Map(accounts.filter((a) => !a.archived).map((a) => [a.id, accountShare(a)]));
  const tracked = new Set<string>();
  let deposits = 0;
  let withdrawals = 0;
  for (const f of flows) {
    const share = shares.get(f.accountId);
    if (share === undefined || (f.kind !== 'deposit' && f.kind !== 'withdrawal')) continue;
    tracked.add(f.accountId);
    if (f.date <= from || f.date > to) continue;
    if (f.kind === 'deposit') deposits += f.amount * share;
    else withdrawals += f.amount * share;
  }
  const net = deposits - withdrawals;
  const days = daysBetween(from, to);
  return {
    deposits,
    withdrawals,
    net,
    monthly: tracked.size > 0 && days >= minDays ? net / (days / DAYS_PER_MONTH) : undefined,
    trackedAccountIds: [...tracked],
  };
}

