/**
 * Rafraîchissement des cours de toutes les lignes valorisables, puis
 * enregistrement d'un snapshot du jour pour chaque compte impacté.
 */
import { todayKey } from '../format';
import { accountCurrentValue } from '../portfolio';
import { useStore } from '../store';
import { fetchCoinGeckoPrices } from './coingecko';
import { fetchYahooPriceEur } from './yahoo';

export interface RefreshResult {
  updated: number;
  errors: string[];
}

export async function refreshAllPrices(): Promise<RefreshResult> {
  const { holdings, upsertHolding } = useStore.getState();
  const errors: string[] = [];
  let updated = 0;
  const now = new Date().toISOString();
  const touchedAccounts = new Set<string>();

  // CoinGecko : un seul appel groupé.
  const geckoHoldings = holdings.filter((h) => h.priceSource === 'coingecko' && h.symbol);
  if (geckoHoldings.length > 0) {
    try {
      const ids = [...new Set(geckoHoldings.map((h) => h.symbol!.toLowerCase().trim()))];
      const prices = await fetchCoinGeckoPrices(ids);
      for (const h of geckoHoldings) {
        const p = prices.get(h.symbol!.toLowerCase().trim());
        if (p !== undefined) {
          upsertHolding({ ...h, unitPrice: p, unitPriceDate: now });
          touchedAccounts.add(h.accountId);
          updated++;
        } else {
          errors.push(`${h.name} : id CoinGecko « ${h.symbol} » inconnu`);
        }
      }
    } catch (e: any) {
      errors.push(`CoinGecko : ${e?.message ?? e}`);
    }
  }

  // Yahoo : un appel par ticker (dédupliqué).
  const yahooHoldings = holdings.filter((h) => h.priceSource === 'yahoo' && h.symbol);
  const bySymbol = new Map<string, typeof yahooHoldings>();
  for (const h of yahooHoldings) {
    const key = h.symbol!.trim().toUpperCase();
    bySymbol.set(key, [...(bySymbol.get(key) ?? []), h]);
  }
  for (const [symbol, hs] of bySymbol) {
    try {
      const price = await fetchYahooPriceEur(symbol);
      for (const h of hs) {
        upsertHolding({ ...h, unitPrice: price, unitPriceDate: now });
        touchedAccounts.add(h.accountId);
        updated++;
      }
    } catch (e: any) {
      errors.push(`${symbol} : ${e?.message ?? e}`);
    }
  }

  // Snapshot du jour pour chaque compte dont une ligne a bougé.
  const state = useStore.getState();
  for (const accountId of touchedAccounts) {
    const account = state.accounts.find((a) => a.id === accountId);
    if (!account) continue;
    const value = accountCurrentValue(account, state.holdings, state.snapshots);
    state.recordSnapshot(accountId, value, 'auto', todayKey());
  }

  return { updated, errors };
}
