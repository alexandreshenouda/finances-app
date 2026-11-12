/**
 * Journal de debug (mode développeur) : trace toutes les requêtes réseau de l'app
 * (`tracedFetch`) ainsi que le trafic brut des connecteurs (notamment Trade Republic)
 * pour diagnostiquer les problèmes de connexion.
 * Stockage AsyncStorage dédié (clé propre, hors `patrimoine.data`) afin de ne
 * jamais polluer les sauvegardes/exports de l'utilisateur.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { uid } from './format';

const MAX_ENTRIES = 500;
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

/** Paramètres d'URL porteurs d'un secret (clé Gemini, signature Binance…). */
const SECRET_PARAMS = /([?&](?:key|apikey|api_key|signature|token|access_token)=)[^&#]*/gi;

/** URL sans ses secrets, pour qu'un journal copié/partagé ne divulgue aucune clé. */
export function redactUrl(url: string): string {
  return url.replace(SECRET_PARAMS, '$1***');
}

/**
 * `fetch` journalisé : point de passage unique de TOUTES les requêtes HTTP de
 * `src/lib` (ne pas appeler `fetch` directement, la requête serait invisible dans le
 * journal). Une entrée par requête, une fois terminée : méthode, URL expurgée, statut
 * (ou erreur réseau) et durée. Journal désactivé : simple passe-plat, sans surcoût.
 * Ni en-têtes ni corps ne sont tracés (ils portent clés API et jetons).
 */
export async function tracedFetch(tag: string, url: string, init?: RequestInit): Promise<Response> {
  if (!useDebugLogStore.getState().enabled) return fetch(url, init);
  const label = `${(init?.method ?? 'GET').toUpperCase()} ${redactUrl(url)}`;
  const start = Date.now();
  try {
    const res = await fetch(url, init);
    const line = `${label} → HTTP ${res.status} (${Date.now() - start} ms)`;
    if (res.ok) logDebug(tag, line);
    else logDebugError(tag, line);
    return res;
  } catch (err: any) {
    logDebugError(tag, `${label} → ${err?.message ?? err} (${Date.now() - start} ms)`);
    throw err;
  }
}
