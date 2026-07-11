/** Interface commune des connecteurs de synchronisation. */
import type { AccountType } from '../types';

/** Ligne renvoyée par un connecteur, déjà valorisée en EUR. */
export interface ExternalHolding {
  name: string;
  symbol?: string;
  quantity: number;
  unitPriceEur: number;
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
}

export interface SyncResult {
  accounts: ExternalAccount[];
  warnings: string[];
}
