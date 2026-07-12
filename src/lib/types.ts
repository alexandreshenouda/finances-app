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

export type ConnectorProvider = 'binance' | 'kraken' | 'enablebanking';

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
  enablebanking: 'Enable Banking (banques FR)',
};

export type Period = '1M' | '3M' | '6M' | '1A' | 'YTD' | 'MAX';

export const PERIODS: Period[] = ['1M', '3M', '6M', '1A', 'YTD', 'MAX'];
