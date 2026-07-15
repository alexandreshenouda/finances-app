/** Store global persisté (AsyncStorage). Les secrets ne passent JAMAIS ici. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { todayKey, uid } from './format';
import {
  DEFAULT_FX_RATES,
  type Account,
  type Connection,
  type FxRates,
  type Holding,
  type HousePricePoint,
  type Loan,
  type Property,
  type Snapshot,
} from './types';

export interface AppData {
  accounts: Account[];
  holdings: Holding[];
  snapshots: Snapshot[];
  connections: Connection[];
  properties: Property[];
  loans: Loan[];
}

interface AppState extends AppData {
  hydrated: boolean;

  /** Derniers taux de change connus (1 unité → EUR), persistés pour le hors-ligne. */
  fxRates: FxRates;
  fxUpdatedAt?: string;
  setFxRates: (rates: FxRates) => void;

  /** Indice des prix des logements (base 100 en 2015), rafraîchi en ligne, persisté. */
  houseIndex?: HousePricePoint[];
  houseIndexUpdatedAt?: string;
  setHouseIndex: (points: HousePricePoint[]) => void;

  /** Affichage du patrimoine : net (actifs − dettes) par défaut, ou brut. */
  patrimoineNet: boolean;
  setPatrimoineNet: (v: boolean) => void;

  /** Inclure les biens immobiliers dans le patrimoine total (pas les comptes bancaires immo). Défaut : oui. */
  showRealEstate: boolean;
  setShowRealEstate: (v: boolean) => void;

  upsertAccount: (a: Partial<Account> & { name: string; type: Account['type'] }) => Account;
  deleteAccount: (id: string) => void;

  upsertProperty: (p: Partial<Property> & { name: string; kind: Property['kind']; purchasePrice: number; purchaseDate: string }) => Property;
  deleteProperty: (id: string) => void;

  upsertLoan: (l: Partial<Loan> & { propertyId: string; name: string; principal: number; annualRate: number; termMonths: number; startDate: string }) => Loan;
  deleteLoan: (id: string) => void;

  upsertHolding: (h: Partial<Holding> & { accountId: string; name: string; quantity: number }) => Holding;
  deleteHolding: (id: string) => void;

  /** Enregistre la valeur d'un compte pour un jour (écrase le snapshot du même jour). */
  recordSnapshot: (accountId: string, value: number, source: Snapshot['source'], date?: string) => void;
  deleteSnapshot: (id: string) => void;

  upsertConnection: (c: Partial<Connection> & { provider: Connection['provider']; label: string }) => Connection;
  deleteConnection: (id: string) => void;

  importData: (data: AppData) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      accounts: [],
      holdings: [],
      snapshots: [],
      connections: [],
      properties: [],
      loans: [],
      hydrated: false,

      fxRates: DEFAULT_FX_RATES,
      fxUpdatedAt: undefined,
      setFxRates: (rates) => set({ fxRates: rates, fxUpdatedAt: new Date().toISOString() }),

      houseIndex: undefined,
      houseIndexUpdatedAt: undefined,
      setHouseIndex: (points) => set({ houseIndex: points, houseIndexUpdatedAt: new Date().toISOString() }),

      patrimoineNet: true,
      setPatrimoineNet: (v) => set({ patrimoineNet: v }),

      showRealEstate: true,
      setShowRealEstate: (v) => set({ showRealEstate: v }),

      upsertAccount: (a) => {
        const existing = a.id ? get().accounts.find((x) => x.id === a.id) : undefined;
        const account: Account = {
          createdAt: new Date().toISOString(),
          ...existing,
          ...a,
          id: existing?.id ?? a.id ?? uid(),
        } as Account;
        set((s) => ({
          accounts: existing
            ? s.accounts.map((x) => (x.id === account.id ? account : x))
            : [...s.accounts, account],
        }));
        return account;
      },

      deleteAccount: (id) =>
        set((s) => ({
          accounts: s.accounts.filter((a) => a.id !== id),
          holdings: s.holdings.filter((h) => h.accountId !== id),
          snapshots: s.snapshots.filter((sn) => sn.accountId !== id),
        })),

      upsertProperty: (p) => {
        const existing = p.id ? get().properties.find((x) => x.id === p.id) : undefined;
        const property: Property = {
          valuationMode: 'index',
          createdAt: new Date().toISOString(),
          ...existing,
          ...p,
          id: existing?.id ?? p.id ?? uid(),
        } as Property;
        set((s) => ({
          properties: existing
            ? s.properties.map((x) => (x.id === property.id ? property : x))
            : [...s.properties, property],
        }));
        return property;
      },

      deleteProperty: (id) =>
        set((s) => ({
          properties: s.properties.filter((p) => p.id !== id),
          loans: s.loans.filter((l) => l.propertyId !== id),
        })),

      upsertLoan: (l) => {
        const existing = l.id ? get().loans.find((x) => x.id === l.id) : undefined;
        const loan: Loan = {
          createdAt: new Date().toISOString(),
          ...existing,
          ...l,
          id: existing?.id ?? l.id ?? uid(),
        } as Loan;
        set((s) => ({
          loans: existing
            ? s.loans.map((x) => (x.id === loan.id ? loan : x))
            : [...s.loans, loan],
        }));
        return loan;
      },

      deleteLoan: (id) => set((s) => ({ loans: s.loans.filter((l) => l.id !== id) })),

      upsertHolding: (h) => {
        const existing = h.id ? get().holdings.find((x) => x.id === h.id) : undefined;
        const holding: Holding = {
          priceSource: 'manual',
          ...existing,
          ...h,
          id: existing?.id ?? h.id ?? uid(),
        } as Holding;
        set((s) => ({
          holdings: existing
            ? s.holdings.map((x) => (x.id === holding.id ? holding : x))
            : [...s.holdings, holding],
        }));
        return holding;
      },

      deleteHolding: (id) => set((s) => ({ holdings: s.holdings.filter((h) => h.id !== id) })),

      recordSnapshot: (accountId, value, source, date) => {
        const day = date ?? todayKey();
        set((s) => {
          const others = s.snapshots.filter((sn) => !(sn.accountId === accountId && sn.date === day));
          return {
            snapshots: [...others, { id: uid(), accountId, date: day, value, source }],
          };
        });
      },

      deleteSnapshot: (id) => set((s) => ({ snapshots: s.snapshots.filter((sn) => sn.id !== id) })),

      upsertConnection: (c) => {
        const existing = c.id ? get().connections.find((x) => x.id === c.id) : undefined;
        const conn: Connection = {
          createdAt: new Date().toISOString(),
          ...existing,
          ...c,
          id: existing?.id ?? c.id ?? uid(),
        } as Connection;
        set((s) => ({
          connections: existing
            ? s.connections.map((x) => (x.id === conn.id ? conn : x))
            : [...s.connections, conn],
        }));
        return conn;
      },

      deleteConnection: (id) =>
        set((s) => ({
          connections: s.connections.filter((c) => c.id !== id),
          // Les comptes liés redeviennent des comptes manuels, l'historique est conservé.
          accounts: s.accounts.map((a) =>
            a.connectionId === id ? { ...a, connectionId: undefined, externalId: undefined } : a
          ),
        })),

      // Rétro-compatible : les exports antérieurs n'ont ni currency ni immobilier (absent = défaut).
      importData: (data) =>
        set({
          accounts: data.accounts ?? [],
          holdings: data.holdings ?? [],
          snapshots: data.snapshots ?? [],
          connections: data.connections ?? [],
          properties: data.properties ?? [],
          loans: data.loans ?? [],
        }),
    }),
    {
      name: 'patrimoine.data',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        accounts: s.accounts,
        holdings: s.holdings,
        snapshots: s.snapshots,
        connections: s.connections,
        properties: s.properties,
        loans: s.loans,
        fxRates: s.fxRates,
        fxUpdatedAt: s.fxUpdatedAt,
        houseIndex: s.houseIndex,
        houseIndexUpdatedAt: s.houseIndexUpdatedAt,
        patrimoineNet: s.patrimoineNet,
        showRealEstate: s.showRealEstate,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
        useStore.setState({ hydrated: true });
      },
    }
  )
);

export function exportData(): AppData {
  const { accounts, holdings, snapshots, connections, properties, loans } = useStore.getState();
  return { accounts, holdings, snapshots, connections, properties, loans };
}
