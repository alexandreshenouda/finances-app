/**
 * Moteur de calcul des projections patrimoniales futures.
 * Combine valorisation des comptes, appréciation immobilière, amortissement réel des dettes,
 * versements programmés, frais et inflation.
 */
import { toEur } from './fx';
import { todayKey } from './format';
import { cashAndLivretTotal, epargnePrecautionTarget, objectiveProgress } from './objectives';
import { accountCurrentValue, accountShare, type SeriesPoint } from './portfolio';
import {
  buildPatrimoineSeries,
  consoDebtEur,
  loanBalanceAt,
  ownershipShare,
  propertyValueEur,
  realEstateTotals,
} from './realestate';
import {
  DEFAULT_PROJECTION_SETTINGS,
  type Account,
  type FxRates,
  type Holding,
  type HousePricePoint,
  type Loan,
  type Objective,
  type Period,
  type ProjectionSettings,
  type Property,
  type SavedProjection,
  type Snapshot,
} from './types';

export type { ProjectionSettings, SavedProjection };
export { DEFAULT_PROJECTION_SETTINGS };

export interface ObjectiveProjectionReach {
  objective: Objective;
  targetAmount: number;
  currentAmount: number;
  projectedAmountAtHorizon: number;
  reachedDate?: string; // YYYY-MM-DD
  monthsToReach?: number;
  reachedAtHorizon: boolean;
}

export interface ProjectionBreakdown {
  startGross: number;
  startDebt: number;
  startNet: number;
  finalGross: number;
  finalDebt: number;
  finalNet: number;
  finalTotal: number;
  totalContributions: number;
  totalGains: number;
  totalFeesCost: number;
  totalDebtAmortized: number;
  effectiveAnnualRatePct: number;
  cagrCalculated?: number;
}

export interface ProjectionResult {
  points: SeriesPoint[];
  breakdown: ProjectionBreakdown;
  reachedObjectives: ObjectiveProjectionReach[];
}

/** Ajoute `n` mois à une date YYYY-MM-DD en préservant le format ISO date. */
export function addMonthsToDate(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** Nombre de jours écoulés entre deux dates YYYY-MM-DD */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Calcule le taux de croissance géométrique annualisé (CAGR) d'une série historique.
 * Retourne le taux en % (ex : 7.2 pour 7.2 % / an), ou undefined si données insuffisantes.
 */
export function calculateHistoricalCagr(series: SeriesPoint[]): number | undefined {
  if (series.length < 2) return undefined;
  const startPoint = series[0];
  const endPoint = series[series.length - 1];
  const days = daysBetween(startPoint.date, endPoint.date);
  if (days < 14) return undefined; // trop court pour un taux annualisé fiable

  const startVal = startPoint.value;
  const endVal = endPoint.value;
  if (startVal <= 0 || endVal <= 0) return undefined;

  const years = days / 365.25;
  const cagr = Math.pow(endVal / startVal, 1 / years) - 1;
  // Borne raisonnable de sécurité pour éviter des valeurs aberrantes (-90% .. +200%)
  if (!Number.isFinite(cagr)) return undefined;
  const clampedPct = Math.max(-90, Math.min(200, cagr * 100));
  return clampedPct;
}

/**
 * Calcule la projection patrimoniale future mois par mois.
 */
export function simulatePatrimoineProjection(
  settings: ProjectionSettings,
  context: {
    accounts: Account[];
    holdings: Holding[];
    snapshots: Snapshot[];
    rates: FxRates;
    properties: Property[];
    loans: Loan[];
    houseSeries: HousePricePoint[];
    objectives?: Objective[];
    historicalSeries?: SeriesPoint[];
  },
  today: string = todayKey()
): ProjectionResult {
  const {
    horizonYears,
    rateMode,
    customRatePct,
    monthlyContribution,
    annualFeesPct,
    adjustForInflation,
    inflationRatePct,
    net,
    includeRealEstate,
    realEstateGrowthPct,
  } = settings;

  const activeAccounts = context.accounts.filter((a) => !a.archived);
  const activeProps = context.properties.filter((p) => !p.archived);
  const hasRealEstate = activeProps.length > 0 && includeRealEstate;

  // 1. Détermination de la valeur de départ des actifs financiers
  const startAccountsVal = activeAccounts.reduce(
    (acc, a) => acc + accountCurrentValue(a, context.holdings, context.snapshots, context.rates) * accountShare(a),
    0
  );

  // 2. Détermination de la valeur de départ de l'immobilier et des dettes
  const reTot = realEstateTotals(activeProps, context.loans, context.houseSeries, context.rates, today);
  const startReGross = hasRealEstate ? reTot.gross : 0;
  const startReDebt = hasRealEstate ? reTot.debt : 0;
  const startConsoDebt = consoDebtEur(context.loans, context.rates, today);
  const startDebt = hasRealEstate ? startReDebt + startConsoDebt : startConsoDebt;

  const startGross = startAccountsVal + startReGross;
  const startNet = startGross - startDebt;
  const startTotal = net ? startNet : startGross;

  // 3. Détermination du taux de rendement brut applicable
  let grossAnnualRatePct = customRatePct;
  let cagrCalculated: number | undefined;

  if (rateMode === 'historical') {
    const histSeries =
      context.historicalSeries ??
      buildPatrimoineSeries(
        activeAccounts,
        context.snapshots,
        hasRealEstate ? activeProps : [],
        hasRealEstate ? context.loans : context.loans.filter((l) => !l.propertyId),
        context.houseSeries,
        context.rates,
        settings.historicalPeriod,
        net,
        today
      );

    if (histSeries.length >= 2) {
      const histCagr = calculateHistoricalCagr(histSeries);
      if (histCagr !== undefined) {
        cagrCalculated = histCagr;
        grossAnnualRatePct = histCagr;
      }
    }
  }

  // Taux net de frais annuel
  const netOfFeesRatePct = grossAnnualRatePct - Math.max(0, annualFeesPct);

  // Taux mensuel financier
  // Si inflation activée, taux réel r_real = (1 + r) / (1 + i) - 1
  const annualFinRate = netOfFeesRatePct / 100;
  const annualInflRate = adjustForInflation ? Math.max(-0.5, inflationRatePct / 100) : 0;
  const effectiveAnnualRate = (1 + annualFinRate) / (1 + annualInflRate) - 1;
  const monthlyFinRate = Math.pow(Math.max(0.0001, 1 + effectiveAnnualRate), 1 / 12) - 1;

  // Taux de croissance mensuel de l'immobilier
  const annualReRate = realEstateGrowthPct / 100;
  const effectiveAnnualReRate = (1 + annualReRate) / (1 + annualInflRate) - 1;
  const monthlyReRate = Math.pow(Math.max(0.0001, 1 + effectiveAnnualReRate), 1 / 12) - 1;

  // Taux mensuel sans frais (pour calculer le coût des frais)
  const noFeesEffectiveAnnualRate = (1 + grossAnnualRatePct / 100) / (1 + annualInflRate) - 1;
  const monthlyNoFeesRate = Math.pow(Math.max(0.0001, 1 + noFeesEffectiveAnnualRate), 1 / 12) - 1;

  // 4. Échantillonnage temporel
  const totalMonths = Math.max(1, Math.round(horizonYears * 12));
  // Conserver entre 60 et 180 points pour un rendu fluide et rapide du graphique
  const monthStep = totalMonths <= 60 ? 1 : totalMonths <= 120 ? 2 : totalMonths <= 240 ? 3 : 6;

  const points: SeriesPoint[] = [];
  let finVal = startAccountsVal;
  let finValNoFees = startAccountsVal;
  let reVal = startReGross;

  const shareById = new Map(activeProps.map((p) => [p.id, ownershipShare(p)]));

  // Préparation du suivi des objectifs
  // RÈGLE MÉTIER :
  // 1. N'affiche PAS les objectifs déjà atteints aujourd'hui (current >= target).
  // 2. Cohérence avec l'onglet Objectifs (objectives.ts) : les biens immobiliers physiques
  //    (reVal) ne sont JAMAIS inclus dans l'assiette des objectifs financiers.
  //    - epargne_precaution : basé sur les liquidités (livret + courant)
  //    - projet_court_terme : basé sur les liquidités après déduction de la précaution
  //    - projet_long_terme : basé sur les actifs financiers (hors immo) après précaution et buffer
  const allObjectives = context.objectives ?? [];
  const reservedPrecaution = epargnePrecautionTarget(allObjectives);
  const currentCashLivret = cashAndLivretTotal(context.accounts, context.holdings, context.snapshots, context.rates);
  const precautionShortfall = Math.max(0, reservedPrecaution - currentCashLivret);

  const objectiveTrackers: ObjectiveProjectionReach[] = allObjectives
    .map((o) => {
      const p = objectiveProgress(o, {
        accounts: context.accounts,
        holdings: context.holdings,
        snapshots: context.snapshots,
        rates: context.rates,
        objectives: allObjectives,
      });
      return {
        objective: o,
        targetAmount: p.target,
        currentAmount: p.current,
        projectedAmountAtHorizon: p.current,
        reachedDate: undefined,
        monthsToReach: undefined,
        reachedAtHorizon: false,
      };
    })
    // Filtrer : ignorer les objectifs sans cible ou DÉJÀ ATTEINTS aujourd'hui
    .filter((t) => t.targetAmount > 0 && t.currentAmount < t.targetAmount);

  // Point initial (mois 0)
  points.push({
    date: today,
    value: Math.round(startTotal),
  });

  // Simulation mois par mois
  for (let m = 1; m <= totalMonths; m++) {
    // Évolution financière : rendement mensuel + versement d'épargne
    finVal = Math.max(0, finVal * (1 + monthlyFinRate) + monthlyContribution);
    finValNoFees = Math.max(0, finValNoFees * (1 + monthlyNoFeesRate) + monthlyContribution);

    // Évolution immobilière
    if (hasRealEstate) {
      reVal = Math.max(0, reVal * (1 + monthlyReRate));
    }

    const currentDate = addMonthsToDate(today, m);

    // Calcul du passif (capital restant dû des prêts) à cette date future
    let remainingDebt = 0;
    if (net) {
      const inflationDiscount = adjustForInflation ? Math.pow(1 + annualInflRate, m / 12) : 1;
      for (const loan of context.loans) {
        if (!hasRealEstate && loan.propertyId) continue; // prêt immo ignoré si immo exclu
        const share = loan.propertyId ? shareById.get(loan.propertyId) : 1;
        if (share === undefined || share <= 0) continue;
        const balAtDate = loanBalanceAt(loan, currentDate);
        const balEur = toEur(balAtDate, loan.currency, context.rates) * share;
        remainingDebt += balEur / inflationDiscount;
      }
    }

    const currentGross = finVal + (hasRealEstate ? reVal : 0);
    const currentNet = currentGross - remainingDebt;
    const currentTotal = net ? currentNet : currentGross;

    // Progression des objectifs sur les actifs financiers (strictement hors immobilier physique)
    const financialDelta = Math.max(0, finVal - startAccountsVal);
    for (const t of objectiveTrackers) {
      let projectedAvailable = 0;
      if (t.objective.category === 'epargne_precaution') {
        projectedAvailable = t.currentAmount + financialDelta;
      } else if (t.objective.category === 'projet_court_terme') {
        const surplusForCourtTerme = Math.max(0, financialDelta - precautionShortfall);
        projectedAvailable = t.currentAmount + surplusForCourtTerme;
      } else {
        // projet_long_terme
        const buffer = t.objective.bufferAmount ?? 0;
        projectedAvailable = Math.max(0, finVal - reservedPrecaution - buffer);
      }

      t.projectedAmountAtHorizon = projectedAvailable;

      if (!t.reachedDate && projectedAvailable >= t.targetAmount) {
        t.reachedDate = currentDate;
        t.monthsToReach = m;
        t.reachedAtHorizon = true;
      }
    }

    // Ajout au tracé si mois échantillonné ou dernier mois
    if (m % monthStep === 0 || m === totalMonths) {
      points.push({
        date: currentDate,
        value: Math.round(currentTotal),
      });
    }
  }

  // 5. Métriques finales et décomposition
  const finalGross = finVal + (hasRealEstate ? reVal : 0);
  const finalDebtAtHorizon = points.length > 0 ? (net ? Math.max(0, finalGross - points[points.length - 1].value) : 0) : 0;
  const finalNet = finalGross - finalDebtAtHorizon;
  const finalTotal = net ? finalNet : finalGross;

  const totalContributions = monthlyContribution * totalMonths;
  const totalGains = Math.max(0, finalGross - startGross - totalContributions);
  const totalFeesCost = Math.max(0, finValNoFees - finVal);
  const totalDebtAmortized = Math.max(0, startDebt - finalDebtAtHorizon);

  return {
    points,
    breakdown: {
      startGross,
      startDebt,
      startNet,
      finalGross,
      finalDebt: finalDebtAtHorizon,
      finalNet,
      finalTotal,
      totalContributions,
      totalGains,
      totalFeesCost,
      totalDebtAmortized,
      effectiveAnnualRatePct: effectiveAnnualRate * 100,
      cagrCalculated,
    },
    reachedObjectives: objectiveTrackers,
  };
}
