/** Fabriques d'objets métier pour les tests unitaires : des valeurs par défaut
 *  valides que chaque test surcharge avec les seuls champs qui l'intéressent. */
import type {
  Account,
  AccountType,
  FxRates,
  Holding,
  Loan,
  Objective,
  Property,
  Snapshot,
} from '@/lib/types';

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

/** Taux figés (indépendants de l'API BCE) : 1 USD = 0,80 € et 1 CHF = 1,05 €. */
export const RATES: FxRates = { EUR: 1, USD: 0.8, CHF: 1.05 };

export function account(over: Partial<Account> & { type?: AccountType } = {}): Account {
  return {
    id: over.id ?? nextId('acc'),
    name: 'Compte test',
    type: 'cto',
    createdAt: '2020-01-01T00:00:00.000Z',
    ...over,
  };
}

export function holding(over: Partial<Holding> & { accountId: string }): Holding {
  return {
    id: over.id ?? nextId('hold'),
    name: 'Ligne test',
    priceSource: 'manual',
    quantity: 1,
    ...over,
  };
}

export function snapshot(over: Partial<Snapshot> & { accountId: string; date: string; value: number }): Snapshot {
  return {
    id: over.id ?? nextId('snap'),
    source: 'manual',
    ...over,
  };
}

export function property(over: Partial<Property> = {}): Property {
  return {
    id: over.id ?? nextId('prop'),
    name: 'Bien test',
    kind: 'appartement',
    purchasePrice: 200_000,
    purchaseDate: '2020-01-01',
    valuationMode: 'index',
    createdAt: '2020-01-01T00:00:00.000Z',
    ...over,
  };
}

export function loan(over: Partial<Loan> = {}): Loan {
  return {
    id: over.id ?? nextId('loan'),
    name: 'Prêt test',
    principal: 100_000,
    annualRate: 2.4,
    termMonths: 240,
    startDate: '2020-01-01',
    createdAt: '2020-01-01T00:00:00.000Z',
    ...over,
  };
}

export function objective(over: Partial<Objective> = {}): Objective {
  return {
    id: over.id ?? nextId('obj'),
    category: 'projet_long_terme',
    createdAt: '2020-01-01T00:00:00.000Z',
    ...over,
  };
}

/** Indice des prix des logements linéaire et lisible : 100 en 2020, 120 en 2025. */
export const FLAT_INDEX = [
  { date: '2020-01-01', value: 100 },
  { date: '2025-01-01', value: 120 },
];
