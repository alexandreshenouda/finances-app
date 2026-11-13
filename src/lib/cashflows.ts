/**
 * Flux constatés sur les comptes (`CashFlow`) : versements nets, dividendes reçus et
 * plafond du PEA. Logique pure — les flux viennent des connecteurs (Trade Republic) et
 * sont stockés dans `store.cashFlows`.
 */
import { addDays, todayKey } from './format';
import { toEur } from './fx';
import { accountShare, holdingCurrency } from './portfolio';
import { PEA_CEILING_EUR, type Account, type CashFlow, type FxRates, type Holding } from './types';

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

// ─── Dividendes ─────────────────────────────────────────────────────────────

export interface DividendSummary {
  /** Dividendes reçus sur les 12 derniers mois (EUR). */
  last12m: number;
  /** Intérêts reçus sur les 12 derniers mois (EUR) — hors dividendes. */
  interest12m: number;
  /** Total par année civile, la plus récente d'abord. */
  byYear: { year: string; total: number }[];
  /** Titres payeurs sur 12 mois, du plus gros au plus petit. */
  byIsin: { isin: string; label: string; total: number }[];
  /** Prix de revient des lignes détenues dont le PRU est connu (EUR). */
  costBasis: number;
  /** Dividendes 12 mois / prix de revient, en % ; absent sans prix de revient. */
  yieldOnCostPct?: number;
}

/**
 * Synthèse des dividendes d'un ensemble de comptes. Le rendement sur prix de revient
 * rapporte les dividendes des 12 derniers mois au coût d'acquisition des lignes encore
 * détenues (PRU × quantité) : il sous-estime le rendement si des titres payeurs ont été
 * vendus entre-temps, et l'ignore pour les lignes sans PRU.
 */
export function dividendSummary(
  flows: CashFlow[],
  holdings: Holding[],
  accounts: Account[],
  rates: FxRates,
  today: string = todayKey()
): DividendSummary {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const yearAgo = addDays(today, -365);
  const names = new Map<string, string>();
  for (const h of holdings) if (h.isin && byId.has(h.accountId)) names.set(h.isin, h.name);

  let last12m = 0;
  let interest12m = 0;
  const years = new Map<string, number>();
  const payers = new Map<string, { label: string; total: number }>();
  for (const f of flows) {
    const account = byId.get(f.accountId);
    if (!account || f.date > today) continue;
    const amount = f.amount * accountShare(account);
    const recent = f.date > yearAgo;
    if (f.kind === 'interest') {
      if (recent) interest12m += amount;
      continue;
    }
    if (f.kind !== 'dividend') continue;
    const year = f.date.slice(0, 4);
    years.set(year, (years.get(year) ?? 0) + amount);
    if (!recent) continue;
    last12m += amount;
    const key = f.isin ?? f.label ?? '?';
    const entry = payers.get(key) ?? { label: (f.isin && names.get(f.isin)) || f.label || key, total: 0 };
    entry.total += amount;
    payers.set(key, entry);
  }

  let costBasis = 0;
  for (const h of holdings) {
    const account = byId.get(h.accountId);
    if (!account || h.buyPrice === undefined) continue;
    costBasis += toEur(h.buyPrice * h.quantity, holdingCurrency(h, account), rates) * accountShare(account);
  }

  return {
    last12m,
    interest12m,
    byYear: [...years].map(([year, total]) => ({ year, total })).sort((a, b) => b.year.localeCompare(a.year)),
    byIsin: [...payers].map(([isin, v]) => ({ isin, ...v })).sort((a, b) => b.total - a.total),
    costBasis,
    yieldOnCostPct: costBasis > 0 ? (last12m / costBasis) * 100 : undefined,
  };
}

// ─── Plafond du PEA ─────────────────────────────────────────────────────────

export interface PeaCeilingStatus {
  deposits: number;
  ceiling: number;
  /** Part du plafond consommée, entre 0 et 1. */
  ratio: number;
  /** Versements encore possibles (EUR, jamais négatif). */
  remaining: number;
}

/** Seuil à partir duquel le plafond est considéré comme presque atteint. */
export const PEA_CEILING_NEAR_RATIO = 0.9;

/** Consommation du plafond de versements d'un PEA ; `undefined` si les versements sont inconnus. */
export function peaCeilingStatus(account: Account): PeaCeilingStatus | undefined {
  if (account.type !== 'pea' || account.peaDeposits === undefined) return undefined;
  const ceiling = account.peaCeiling && account.peaCeiling > 0 ? account.peaCeiling : PEA_CEILING_EUR;
  const deposits = Math.max(0, account.peaDeposits);
  return {
    deposits,
    ceiling,
    ratio: Math.min(1, deposits / ceiling),
    remaining: Math.max(0, ceiling - deposits),
  };
}
