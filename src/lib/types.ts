/** Modèle de données central de l'application. */
import i18next from './i18n';

/** Proxy réactif : lit la traduction courante à chaque accès (`LABELS[key]`),
 *  pas de recalcul/re-render nécessaire au changement de langue. */
function createLabelProxy<T extends string>(prefix: string): Record<T, string> {
  return new Proxy({} as Record<T, string>, {
    get(_target, prop: string) {
      return i18next.t(`${prefix}.${prop}`);
    },
  });
}

export type AccountType =
  | 'courant'
  | 'livret'
  | 'pea'
  | 'cto'
  | 'assurance_vie'
  | 'per'
  | 'private_equity'
  | 'crypto'
  | 'immobilier'
  | 'autre';

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = createLabelProxy('accountTypes');

export const ACCOUNT_TYPE_ORDER: AccountType[] = [
  'courant',
  'livret',
  'pea',
  'cto',
  'assurance_vie',
  'per',
  'private_equity',
  'crypto',
  'immobilier',
  'autre',
];

/**
 * Palette catégorielle sombre validée (contraste ≥ 3:1 sur #0F172A, ordre
 * optimisé daltonisme) ; « autre » est le gris neutre réservé au divers.
 */
export const ACCOUNT_TYPE_COLORS_CLASSIQUE: Record<AccountType, string> = {
  courant: '#3987e5',
  livret: '#199e70',
  pea: '#c98500',
  cto: '#008300',
  assurance_vie: '#9085e9',
  per: '#e66767',
  private_equity: '#22b8d4',
  crypto: '#d55181',
  immobilier: '#d95926',
  autre: '#64748B',
};

export const ACCOUNT_TYPE_COLORS_OR: Record<AccountType, string> = {
  courant: '#8FADC9',
  livret: '#8FC2A6',
  pea: '#D9C07A',
  cto: '#C9954E',
  assurance_vie: '#B0A0C9',
  per: '#C98FA0',
  private_equity: '#7FBFBF',
  crypto: '#B98FC9',
  immobilier: '#C98060',
  autre: '#9C9C9C',
};

export const ACCOUNT_TYPE_COLORS: Record<AccountType, string> = { ...ACCOUNT_TYPE_COLORS_OR };

export function setAccountTypeColors(themeName: 'classique' | 'or'): void {
  const palette = themeName === 'classique' ? ACCOUNT_TYPE_COLORS_CLASSIQUE : ACCOUNT_TYPE_COLORS_OR;
  (Object.keys(palette) as AccountType[]).forEach((k) => {
    ACCOUNT_TYPE_COLORS[k] = palette[k];
  });
}

/** Profil de risque déclaratif utilisé par les suggestions de répartition (voir
 * `diversification.ts`) : une préférence choisie par l'utilisateur, pas une évaluation
 * d'adéquation réglementaire. */
export type RiskProfile = 'prudent' | 'equilibre' | 'dynamique';

export const RISK_PROFILE_LABELS: Record<RiskProfile, string> = createLabelProxy('riskProfiles');

export const RISK_PROFILE_ORDER: RiskProfile[] = ['prudent', 'equilibre', 'dynamique'];

/** Grandes poches utilisées pour comparer la répartition actuelle à un profil de référence
 * (voir `diversification.ts`) — regroupement d'`AccountType`, pas une classe d'actif réelle. */
export type AllocationBucket = 'liquidites' | 'fonds_euro_per' | 'actions_marches' | 'crypto';

export const ALLOCATION_BUCKET_LABELS: Record<AllocationBucket, string> =
  createLabelProxy('allocationBuckets');

export type ConnectorProvider = 'binance' | 'kraken' | 'enablebanking' | 'traderepublic';

/** Devises gérées. L'EUR est la devise de référence : tout est converti en EUR à l'affichage. */
export type Currency = 'EUR' | 'USD' | 'CHF';

export const CURRENCIES: Currency[] = ['EUR', 'USD', 'CHF'];

export const CURRENCY_LABELS: Record<Currency, string> = createLabelProxy('currencies');

/** Taux de conversion : 1 unité de devise → EUR. Mis à jour via l'API BCE (frankfurter). */
export type FxRates = Record<Currency, number>;

/** Valeurs de repli tant qu'aucun taux n'a été récupéré (ordre de grandeur mi-2026). */
export const DEFAULT_FX_RATES: FxRates = { EUR: 1, USD: 0.86, CHF: 1.07 };

export interface AccountFees {
  /** Frais d'entrée / de versement, en % */
  entryPct?: number;
  /** Frais de gestion annuels, en % */
  managementPct?: number;
  /** Droits de garde / frais fixes annuels, en € */
  custodyAnnual?: number;
  notes?: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Établissement (ex : Boursorama, Binance…) */
  institution?: string;
  /** Devise du compte ; absent = EUR (rétro-compatibilité des anciens exports) */
  currency?: Currency;
  /** Solde en espèces / liquidités (hors lignes de placement), dans la devise du compte */
  cashBalance?: number;
  /** Quote-part détenue du compte, en % (SCI/indivision sur un compte immobilier).
   *  Absent = 100 %. Pondère la contribution du compte au patrimoine (pas son solde affiché). */
  ownershipPct?: number;
  fees?: AccountFees;
  /** Id de la connexion si le compte est synchronisé automatiquement */
  connectionId?: string;
  /** Identifiant du compte chez le fournisseur externe */
  externalId?: string;
  createdAt: string; // ISO
  archived?: boolean;
}

export type PriceSource = 'yahoo' | 'coingecko' | 'exchange' | 'manual';

/** Secteur GICS simplifié, utilisé par les suggestions de diversification sectorielle
 * (voir `diversification.ts`) — ensemble fermé pour normaliser des libellés hétérogènes
 * venus de fournisseurs externes (Alpha Vantage, CoinGecko), même logique que
 * `AllocationBucket`. */
export type SectorKey =
  | 'technology'
  | 'financials'
  | 'healthcare'
  | 'consumer_discretionary'
  | 'consumer_staples'
  | 'industrials'
  | 'energy'
  | 'materials'
  | 'utilities'
  | 'real_estate'
  | 'communication'
  | 'crypto'
  | 'other';

export const SECTOR_LABELS: Record<SectorKey, string> = createLabelProxy('sectors');

/** Pays de l'émetteur (ISIN) ou du siège (Alpha Vantage), utilisé par les suggestions de
 * diversification géographique. Ensemble volontairement restreint aux pays les plus
 * probables pour un investisseur français ; `autre` couvre le reste. */
export type CountryCode =
  | 'FR'
  | 'DE'
  | 'IT'
  | 'ES'
  | 'NL'
  | 'BE'
  | 'LU'
  | 'IE'
  | 'GB'
  | 'CH'
  | 'US'
  | 'CA'
  | 'JP'
  | 'CN'
  | 'AU'
  | 'TW'
  | 'KR'
  | 'IN'
  | 'BR'
  | 'SE'
  | 'DK'
  | 'NO'
  | 'autre';

export const COUNTRY_LABELS: Record<CountryCode, string> = createLabelProxy('countries');

export interface Holding {
  id: string;
  accountId: string;
  /** Nom du fonds / de la ligne (ex : "Lyxor PEA Monde") */
  name: string;
  /** Ticker Yahoo (ex : WPEA.PA), id CoinGecko (ex : bitcoin) ou symbole exchange */
  symbol?: string;
  priceSource: PriceSource;
  isin?: string;
  /** Devise de la ligne si différente de celle du compte ; absent = devise du compte */
  currency?: Currency;
  quantity: number;
  /** Dernier cours unitaire connu, dans la devise de la ligne */
  unitPrice?: number;
  unitPriceDate?: string; // ISO
  /** Prix de revient unitaire (PRU), dans la devise de la ligne */
  buyPrice?: number;
  /** Frais courants du fonds, en % */
  feesPct?: number;
  /** Répartition sectorielle (voir `diversification.ts`) : une action = une entrée à 100 %,
   * un ETF/fonds = la ventilation JustETF / Alpha Vantage. Poids sommant à 1. */
  sectorWeights?: { sector: SectorKey; weight: number }[];
  /** Pays de l'émetteur (action) ou de domiciliation (fonds) — approximatif pour un fonds,
   * seule info dispo hors `countryWeights`. */
  country?: CountryCode;
  /** Ventilation géographique réelle (look-through JustETF ou `referenceEtfs.ts`).
   * Prioritaire sur `country` si présente. */
  countryWeights?: { country: CountryCode; weight: number }[];
  /** 10 principales positions du fonds extraites de JustETF */
  topHoldings?: { isin?: string; name: string; weight: number }[];
  classificationSource?: 'isin' | 'yahoo' | 'alphavantage' | 'coingecko' | 'reference' | 'justetf';
  /** Marque la ligne comme déjà traitée par `classifyHoldings` (succès ou non). */
  classifiedAt?: string; // ISO
  notes?: string;
}

export type SnapshotSource = 'manual' | 'sync' | 'auto';

/** Valeur totale d'un compte à une date donnée — la matière première des courbes. */
export interface Snapshot {
  id: string;
  accountId: string;
  /** Jour au format YYYY-MM-DD (un snapshot max par jour et par compte) */
  date: string;
  value: number;
  source: SnapshotSource;
}

export interface Connection {
  id: string;
  provider: ConnectorProvider;
  label: string;
  createdAt: string;
  lastSync?: string;
  lastError?: string;
}

export const PROVIDER_LABELS: Record<ConnectorProvider, string> = createLabelProxy('providers');

export type Period = '1J' | '1S' | '1M' | '3M' | '6M' | '1A' | 'YTD' | 'MAX';

export const PERIODS: Period[] = ['1J', '1S', '1M', '3M', '6M', '1A', 'YTD', 'MAX'];

/** Échelles affichées directement (5 puces) ; les autres passent dans le menu déroulant. */
export const PERIODS_PRIMARY: Period[] = ['1J', '1S', '1M', '1A', 'MAX'];
export const PERIODS_SECONDARY: Period[] = ['3M', '6M', 'YTD'];

// ─── Immobilier ──────────────────────────────────────────────────────────────

export type PropertyKind = 'appartement' | 'maison' | 'terrain' | 'immeuble' | 'parking' | 'autre';

export const PROPERTY_KIND_LABELS: Record<PropertyKind, string> = createLabelProxy('propertyTypes');

export const PROPERTY_KIND_ORDER: PropertyKind[] = [
  'appartement',
  'maison',
  'terrain',
  'immeuble',
  'parking',
  'autre',
];

/** Comment on estime la valeur actuelle du bien. */
export type ValuationMode = 'index' | 'manual' | 'local';

/** Localisation géocodée de `Property.address` (cache, pour éviter de re-géocoder). */
export interface PropertyGeo {
  inseeCode: string;
  postalCode?: string;
  lat: number;
  lon: number;
  label: string;
}

/** Dernière estimation calculée à partir de ventes DVF comparables à proximité. */
export interface LocalEstimate {
  pricePerM2: number;
  sampleSize: number;
  /** Échelle géographique effectivement utilisée (commune privilégiée, département si trop peu de ventes locales). */
  scope: 'commune' | 'departement';
  computedAt: string; // ISO
}

/** Un bien immobilier physique (distinct des comptes bancaires). */
export interface Property {
  id: string;
  name: string;
  kind: PropertyKind;
  address?: string;
  /** Prix d'acquisition (net vendeur), dans la devise du bien. */
  purchasePrice: number;
  /** Frais d'acquisition (notaire, agence…) — optionnel, pour le prix de revient. */
  purchaseCosts?: number;
  purchaseDate: string; // YYYY-MM-DD
  /** Surface en m² (affichage prix/m²) ; non nécessaire à l'estimation. */
  surface?: number;
  /** 'index' = réévaluation auto via l'indice national ; 'manual' = valeur saisie ;
   *  'local' = estimation via ventes DVF comparables à proximité. */
  valuationMode: ValuationMode;
  /** Valeur saisie manuellement (surcharge de l'indice) si mode manuel. */
  manualValue?: number;
  /** Localisation géocodée de `address`, calculée pour le mode 'local'. */
  geo?: PropertyGeo;
  /** Dernière estimation locale calculée (mode 'local'). */
  localEstimate?: LocalEstimate;
  /** Devise du bien ; absent = EUR. */
  currency?: Currency;
  /** Quote-part détenue, en % (SCI, indivision…). Absent = 100 % (détention pleine).
   *  Appliquée à la valeur ET à la dette dans le calcul du patrimoine. */
  ownershipPct?: number;
  notes?: string;
  createdAt: string; // ISO
  archived?: boolean;
}

/** Palier d'un prêt échelonné : une mensualité constante pendant `months` mois. */
export interface LoanStep {
  /** Durée du palier, en mois. */
  months: number;
  /** Mensualité hors assurance sur ce palier, dans la devise du prêt ;
   *  auto-calculée (amortissante sur la durée restante) si absente. */
  monthlyPayment?: number;
}

/** Un prêt amortissable (mensualités constantes ou paliers) : crédit immobilier
 *  rattaché à un bien, ou prêt conso sans rattachement. */
export interface Loan {
  id: string;
  /** Bien financé ; absent = prêt conso (non rattaché à un bien). */
  propertyId?: string;
  name: string;
  lender?: string;
  /** Capital emprunté, dans la devise du prêt. */
  principal: number;
  /** Taux nominal annuel, en % (ex : 3.2). */
  annualRate: number;
  /** Durée totale du prêt, en mois (= somme des paliers si `steps` est défini). */
  termMonths: number;
  startDate: string; // YYYY-MM-DD (première échéance)
  /** Mensualité hors assurance, dans la devise du prêt ; calculée si absente. Ignorée si `steps`. */
  monthlyPayment?: number;
  /** Paliers de remboursement (prêt échelonné). Si présent et non vide, remplace
   *  `monthlyPayment` : la durée effective = somme des paliers. */
  steps?: LoanStep[];
  /** Assurance emprunteur mensuelle, dans la devise du prêt (optionnel). */
  insuranceMonthly?: number;
  /** Devise du prêt ; absent = EUR. */
  currency?: Currency;
  notes?: string;
  createdAt: string; // ISO
}

/** Point de l'indice des prix des logements (base 100 en 2015). date = YYYY-MM-DD. */
export interface HousePricePoint {
  date: string;
  value: number;
}

// ─── Objectifs ─────────────────────────────────────────────────────────────

export type ObjectiveCategory = 'epargne_precaution' | 'projet_long_terme' | 'projet_court_terme';

export const OBJECTIVE_CATEGORY_LABELS: Record<ObjectiveCategory, string> = createLabelProxy('objectives');

export const OBJECTIVE_CATEGORY_ORDER: ObjectiveCategory[] = [
  'epargne_precaution',
  'projet_long_terme',
  'projet_court_terme',
];

/** Un objectif financier défini par l'utilisateur (épargne de précaution, projet…). */
export interface Objective {
  id: string;
  category: ObjectiveCategory;
  createdAt: string; // ISO

  /** epargne_precaution : nombre de mois de dépenses visé (1 à 24). */
  securityMonths?: number;
  /** epargne_precaution : dépenses mensuelles (crédits, loyers, alimentation…), en EUR. */
  monthlyExpenses?: number;

  /** projet_long_terme / projet_court_terme */
  name?: string;
  targetAmount?: number;
  /** projet_long_terme uniquement : montant à garder de côté une fois l'objectif atteint,
   * réservé en plus de l'épargne de précaution. */
  bufferAmount?: number;
  deadline?: string; // YYYY-MM-DD
}
