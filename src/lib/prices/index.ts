/**
 * Rafraîchissement : taux de change, puis cours de toutes les lignes valorisables
 * (dans la devise de chaque ligne), puis snapshot EUR du jour par compte impacté.
 */
import { refreshFxRates } from '../fx';
import { todayKey } from '../format';
import { accountCurrentValue, holdingCurrency } from '../portfolio';
import { useStore } from '../store';
import { fetchCoinGeckoPrices } from './coingecko';
import { fetchYahooPrice } from './yahoo';

export interface RefreshResult {
  updated: number;
  errors: string[];
}

export async function refreshAllPrices(): Promise<RefreshResult> {
  const errors: string[] = [];
  let updated = 0;
  const now = new Date().toISOString();
  const touchedAccounts = new Set<string>();

  const fx = await refreshFxRates();
  if (!fx.ok && fx.error) errors.push(fx.error);

  const { holdings, accounts, upsertHolding } = useStore.getState();
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  // CoinGecko : un seul appel groupé (toutes devises).
  const geckoHoldings = holdings.filter((h) => h.priceSource === 'coingecko' && h.symbol);
  if (geckoHoldings.length > 0) {
    try {
      const ids = [...new Set(geckoHoldings.map((h) => h.symbol!.toLowerCase().trim()))];
      const prices = await fetchCoinGeckoPrices(ids);
      for (const h of geckoHoldings) {
        const currency = holdingCurrency(h, accountById.get(h.accountId));
        const p = prices.get(h.symbol!.toLowerCase().trim())?.[currency];
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

  // Yahoo : un appel par couple ticker + devise cible (dédupliqué).
  const yahooHoldings = holdings.filter((h) => h.priceSource === 'yahoo' && h.symbol);
  const byRequest = new Map<string, typeof yahooHoldings>();
  for (const h of yahooHoldings) {
    const currency = holdingCurrency(h, accountById.get(h.accountId));
    const key = `${h.symbol!.trim().toUpperCase()}|${currency}`;
    byRequest.set(key, [...(byRequest.get(key) ?? []), h]);
  }
  for (const [key, hs] of byRequest) {
    const [symbol, currency] = key.split('|');
    try {
      const price = await fetchYahooPrice(symbol, currency);
      for (const h of hs) {
        upsertHolding({ ...h, unitPrice: price, unitPriceDate: now });
        touchedAccounts.add(h.accountId);
        updated++;
      }
    } catch (e: any) {
      errors.push(`${symbol} : ${e?.message ?? e}`);
    }
  }

  // Snapshot EUR du jour pour chaque compte dont une ligne a bougé.
  const state = useStore.getState();
  for (const accountId of touchedAccounts) {
    const account = state.accounts.find((a) => a.id === accountId);
    if (!account) continue;
    const value = accountCurrentValue(account, state.holdings, state.snapshots, state.fxRates);
    state.recordSnapshot(accountId, value, 'auto', todayKey());
  }

  return { updated, errors };
}
