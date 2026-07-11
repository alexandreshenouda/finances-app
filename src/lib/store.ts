/** Store global persisté (AsyncStorage). Les secrets ne passent JAMAIS ici. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { todayKey, uid } from './format';
import type { Account, Connection, Holding, Snapshot } from './types';

export interface AppData {
  accounts: Account[];
  holdings: Holding[];
  snapshots: Snapshot[];
  connections: Connection[];
}

interface AppState extends AppData {
  hydrated: boolean;

  upsertAccount: (a: Partial<Account> & { name: string; type: Account['type'] }) => Account;
  deleteAccount: (id: string) => void;

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
      hydrated: false,

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

      importData: (data) =>
        set({
          accounts: data.accounts ?? [],
          holdings: data.holdings ?? [],
          snapshots: data.snapshots ?? [],
          connections: data.connections ?? [],
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
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
        useStore.setState({ hydrated: true });
      },
    }
  )
);

export function exportData(): AppData {
  const { accounts, holdings, snapshots, connections } = useStore.getState();
  return { accounts, holdings, snapshots, connections };
}
