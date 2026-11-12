/** Interface commune des connecteurs de synchronisation. */
import type { AccountType, CashFlowKind } from '../types';

/** Ligne renvoyée par un connecteur, déjà valorisée en EUR. */
export interface ExternalHolding {
  name: string;
  symbol?: string;
  isin?: string;
  quantity: number;
  unitPriceEur: number;
  /** Prix de revient unitaire en EUR, si le fournisseur l'expose (→ +/- value latente). */
  buyPriceEur?: number;
}

/** Flux d'espèces (versement, retrait, dividende, intérêts) renvoyé par un connecteur. */
export interface ExternalCashFlow {
  /** Identifiant stable de l'opération chez le fournisseur (dédoublonnage). */
  externalId: string;
  /** Jour au format YYYY-MM-DD */
  date: string;
  kind: CashFlowKind;
  /** Montant en EUR, toujours positif. */
  amountEur: number;
  label?: string;
  isin?: string;
}

/** Compte renvoyé par un connecteur. */
export interface ExternalAccount {
  /** Identifiant stable chez le fournisseur (pour re-matcher au prochain sync) */
  externalId: string;
  name: string;
  type: AccountType;
  institution: string;
  cashBalanceEur?: number;
  holdings: ExternalHolding[];
  /** Flux récents du compte, si le fournisseur expose un historique. */
  cashFlows?: ExternalCashFlow[];
}

export interface SyncResult {
  accounts: ExternalAccount[];
  warnings: string[];
}
