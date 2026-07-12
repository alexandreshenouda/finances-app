/** Orchestrateur de synchronisation : identifiants → connecteur → mise à jour du store. */
import { todayKey, uid } from '../format';
import { connectionSecretKey, getSecret } from '../secure';
import { useStore } from '../store';
import type { Connection } from '../types';
import { syncBinance, type BinanceCredentials } from './binance';
import { syncEnableBanking, type EnableBankingCredentials } from './enablebanking';
import { syncKraken, type KrakenCredentials } from './kraken';
import type { SyncResult } from './types';

/** Connexions dont la synchronisation exige une étape interactive (2FA) → pas de sync silencieuse. */
export const INTERACTIVE_PROVIDERS: Connection['provider'][] = ['traderepublic'];

export async function loadCredentials<T>(connectionId: string): Promise<T | null> {
  const raw = await getSecret(connectionSecretKey(connectionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function runConnector(conn: Connection): Promise<SyncResult> {
  switch (conn.provider) {
    case 'binance': {
      const creds = await loadCredentials<BinanceCredentials>(conn.id);
      if (!creds) throw new Error('Identifiants Binance introuvables');
      return syncBinance(creds);
    }
    case 'kraken': {
      const creds = await loadCredentials<KrakenCredentials>(conn.id);
      if (!creds) throw new Error('Identifiants Kraken introuvables');
      return syncKraken(creds);
    }
    case 'enablebanking': {
      const creds = await loadCredentials<EnableBankingCredentials>(conn.id);
      if (!creds) throw new Error('Identifiants Enable Banking introuvables');
      return syncEnableBanking(creds);
    }
    case 'traderepublic':
      throw new Error('Trade Republic nécessite une validation 2FA : utilisez le bouton Reconnecter.');
  }
}

/**
 * Applique le résultat d'un connecteur au store : upsert des comptes liés,
 * remplacement de leurs lignes, snapshot EUR du jour. Réutilisé par la synchro
 * headless et par les connecteurs interactifs (Trade Republic).
 */
export function persistExternalAccounts(conn: Connection, result: SyncResult): void {
  const now = new Date().toISOString();
  for (const ext of result.accounts) {
    const state = useStore.getState();
    const existing = state.accounts.find(
      (a) => a.connectionId === conn.id && a.externalId === ext.externalId
    );

    const account = state.upsertAccount({
      ...(existing ?? {}),
      id: existing?.id,
      name: existing?.name ?? ext.name,
      type: existing?.type ?? ext.type,
      institution: existing?.institution ?? ext.institution,
      cashBalance: ext.cashBalanceEur ?? (ext.holdings.length > 0 ? 0 : existing?.cashBalance ?? 0),
      connectionId: conn.id,
      externalId: ext.externalId,
    });

    const state2 = useStore.getState();
    for (const h of state2.holdings.filter((h) => h.accountId === account.id)) {
      state2.deleteHolding(h.id);
    }
    for (const h of ext.holdings) {
      useStore.getState().upsertHolding({
        id: uid(),
        accountId: account.id,
        name: h.name,
        symbol: h.symbol,
        priceSource: 'exchange',
        quantity: h.quantity,
        unitPrice: h.unitPriceEur,
        unitPriceDate: now,
      });
    }

    const total =
      (ext.cashBalanceEur ?? 0) + ext.holdings.reduce((acc, h) => acc + h.quantity * h.unitPriceEur, 0);
    useStore.getState().recordSnapshot(account.id, total, 'sync', todayKey());
  }
  useStore.getState().upsertConnection({ ...conn, lastSync: now, lastError: undefined });
}

/** Synchronise une connexion : comptes, lignes, snapshot du jour. */
export async function syncConnection(connectionId: string): Promise<{ warnings: string[] }> {
  const store = useStore.getState();
  const conn = store.connections.find((c) => c.id === connectionId);
  if (!conn) throw new Error('Connexion inconnue');

  try {
    const result = await runConnector(conn);
    persistExternalAccounts(conn, result);
    return { warnings: result.warnings };
  } catch (e: any) {
    useStore.getState().upsertConnection({ ...conn, lastError: String(e?.message ?? e) });
    throw e;
  }
}

/** Synchronise toutes les connexions ; n'échoue pas globalement si l'une échoue. */
export async function syncAllConnections(): Promise<{ warnings: string[]; errors: string[] }> {
  const { connections } = useStore.getState();
  const warnings: string[] = [];
  const errors: string[] = [];
  for (const conn of connections) {
    // Les connexions interactives (2FA) ne se synchronisent pas silencieusement.
    if (INTERACTIVE_PROVIDERS.includes(conn.provider)) continue;
    try {
      const r = await syncConnection(conn.id);
      warnings.push(...r.warnings);
    } catch (e: any) {
      errors.push(`${conn.label} : ${e?.message ?? e}`);
    }
  }
  return { warnings, errors };
}
