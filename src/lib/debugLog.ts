/**
 * Journal de debug (mode développeur) : trace le trafic brut des connecteurs
 * (notamment Trade Republic) pour diagnostiquer les problèmes de connexion.
 * Stockage AsyncStorage dédié (clé propre, hors `patrimoine.data`) afin de ne
 * jamais polluer les sauvegardes/exports de l'utilisateur.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { uid } from './format';

const MAX_ENTRIES = 300;
const MAX_DETAIL_LENGTH = 20000;

export interface LogEntry {
  id: string;
  ts: string; // ISO
  level: 'info' | 'error';
  tag: string;
  message: string;
  detail?: string;
}

interface DebugLogState {
  enabled: boolean;
  entries: LogEntry[];
  setEnabled: (v: boolean) => void;
  log: (entry: { level: LogEntry['level']; tag: string; message: string; detail?: string }) => void;
  clear: () => void;
}

export const useDebugLogStore = create<DebugLogState>()(
  persist(
    (set) => ({
      enabled: false,
      entries: [],
      setEnabled: (v) => set({ enabled: v }),
      log: (entry) =>
        set((s) => ({
          entries: [{ ...entry, id: uid(), ts: new Date().toISOString() }, ...s.entries].slice(
            0,
            MAX_ENTRIES
          ),
        })),
      clear: () => set({ entries: [] }),
    }),
    {
      name: 'patrimoine.debugLog',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ enabled: s.enabled, entries: s.entries }),
    }
  )
);

function truncate(detail?: string): string | undefined {
  if (detail === undefined) return undefined;
  return detail.length > MAX_DETAIL_LENGTH ? `${detail.slice(0, MAX_DETAIL_LENGTH)}…` : detail;
}

/** Trace une entrée de debug si le mode développeur est actif (no-op sinon). */
export function logDebug(tag: string, message: string, detail?: string): void {
  if (!useDebugLogStore.getState().enabled) return;
  useDebugLogStore.getState().log({ level: 'info', tag, message, detail: truncate(detail) });
}

/** Idem, marqué comme erreur (mise en avant visuelle dans le journal). */
export function logDebugError(tag: string, message: string, detail?: string): void {
  if (!useDebugLogStore.getState().enabled) return;
  useDebugLogStore.getState().log({ level: 'error', tag, message, detail: truncate(detail) });
}
