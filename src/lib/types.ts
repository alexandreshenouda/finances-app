/** Modèle de données central de l'application. */

export type AccountType =
  | 'courant'
  | 'livret'
  | 'pea'
  | 'cto'
  | 'assurance_vie'
  | 'per'
  | 'crypto'
  | 'immobilier'
  | 'autre';

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  courant: 'Compte courant',
  livret: 'Livret',
  pea: 'PEA',
  cto: 'CTO',
  assurance_vie: 'Assurance vie',
  per: 'PER',
  crypto: 'Crypto',
  immobilier: 'Immobilier',
  autre: 'Autre',
};

export const ACCOUNT_TYPE_ORDER: AccountType[] = [
  'courant',
  'livret',
  'pea',
  'cto',
  'assurance_vie',
  'per',
  'crypto',
  'immobilier',
  'autre',
];

/**
 * Palette catégorielle sombre validée (contraste ≥ 3:1 sur #0F172A, ordre
 * optimisé daltonisme) ; « autre » est le gris neutre réservé au divers.
 */
export const ACCOUNT_TYPE_COLORS: Record<AccountType, string> = {
  courant: '#3987e5',
  livret: '#199e70',
  pea: '#c98500',
  cto: '#008300',
  assurance_vie: '#9085e9',
  per: '#e66767',
  crypto: '#d55181',
  immobilier: '#d95926',
  autre: '#64748B',
};

export type ConnectorProvider = 'binance' | 'kraken' | 'enablebanking' | 'traderepublic';

/** Devises gérées. L'EUR est la devise de référence : tout est converti en EUR à l'affichage. */
export type Currency = 'EUR' | 'USD' | 'CHF';

export const CURRENCIES: Currency[] = ['EUR', 'USD', 'CHF'];

export const CURRENCY_LABELS: Record<Currency, string> = {
  EUR: 'EUR — Euro',
  USD: 'USD — Dollar américain',
  CHF: 'CHF — Franc suisse',
};

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

export const PROVIDER_LABELS: Record<ConnectorProvider, string> = {
  binance: 'Binance',
  kraken: 'Kraken',
  enablebanking: 'Enable Banking (banques UE)',
  traderepublic: 'Trade Republic',
};

export type Period = '1J' | '1S' | '1M' | '3M' | '6M' | '1A' | 'YTD' | 'MAX';

export const PERIODS: Period[] = ['1J', '1S', '1M', '3M', '6M', '1A', 'YTD', 'MAX'];

/** Échelles affichées directement (5 puces) ; les autres passent dans le menu déroulant. */
export const PERIODS_PRIMARY: Period[] = ['1J', '1S', '1M', '1A', 'MAX'];
export const PERIODS_SECONDARY: Period[] = ['3M', '6M', 'YTD'];

// ─── Immobilier ──────────────────────────────────────────────────────────────

export type PropertyKind = 'appartement' | 'maison' | 'terrain' | 'immeuble' | 'parking' | 'autre';

export const PROPERTY_KIND_LABELS: Record<PropertyKind, string> = {
  appartement: 'Appartement',
  maison: 'Maison',
  terrain: 'Terrain',
  immeuble: 'Immeuble',
  parking: 'Parking / box',
  autre: 'Autre',
};

export const PROPERTY_KIND_ORDER: PropertyKind[] = [
  'appartement',
  'maison',
  'terrain',
  'immeuble',
  'parking',
  'autre',
];

/** Comment on estime la valeur actuelle du bien. */
export type ValuationMode = 'index' | 'manual';

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
  /** 'index' = réévaluation auto via l'indice ; 'manual' = valeur saisie. */
  valuationMode: ValuationMode;
  /** Valeur saisie manuellement (surcharge de l'indice) si mode manuel. */
  manualValue?: number;
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

/** Un crédit immobilier rattaché à un bien (amortissable, à mensualités constantes ou par paliers). */
export interface Loan {
  id: string;
  propertyId: string;
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
