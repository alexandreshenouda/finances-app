/**
 * Connecteur Binance (spot) — clé API en lecture seule.
 * Signature HMAC-SHA256 de la query string, hex. Valorisation en EUR via les
 * tickers publics Binance (paire EUR directe, sinon via USDT).
 */
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { ExternalAccount, ExternalHolding, SyncResult } from './types';

const BASE = 'https://api.binance.com';

export interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
}

interface Balance {
  asset: string;
  free: string;
  locked: string;
}

async function signedGet(path: string, creds: BinanceCredentials): Promise<any> {
  const query = `timestamp=${Date.now()}&recvWindow=15000`;
  const signature = bytesToHex(hmac(sha256, utf8ToBytes(creds.apiSecret), utf8ToBytes(query)));
  const res = await fetch(`${BASE}${path}?${query}&signature=${signature}`, {
    headers: { 'X-MBX-APIKEY': creds.apiKey },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Binance HTTP ${res.status} : ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** Tous les prix spot en une requête publique : symbole (ex : BTCEUR) → prix. */
async function fetchAllTickers(): Promise<Map<string, number>> {
  const res = await fetch(`${BASE}/api/v3/ticker/price`);
  if (!res.ok) throw new Error(`Binance tickers HTTP ${res.status}`);
  const list = (await res.json()) as { symbol: string; price: string }[];
  const map = new Map<string, number>();
  for (const t of list) map.set(t.symbol, parseFloat(t.price));
  return map;
}

function priceEur(asset: string, tickers: Map<string, number>): number | undefined {
  if (asset === 'EUR') return 1;
  const direct = tickers.get(`${asset}EUR`);
  if (direct) return direct;
  const eurUsdt = tickers.get('EURUSDT'); // USDT pour 1 EUR
  if (!eurUsdt) return undefined;
  if (asset === 'USDT') return 1 / eurUsdt;
  const viaUsdt = tickers.get(`${asset}USDT`);
  if (viaUsdt) return viaUsdt / eurUsdt;
  return undefined;
}

export async function syncBinance(creds: BinanceCredentials): Promise<SyncResult> {
  const [account, tickers] = await Promise.all([
    signedGet('/api/v3/account', creds),
    fetchAllTickers(),
  ]);

  const warnings: string[] = [];
  const holdings: ExternalHolding[] = [];
  let cashEur = 0;

  for (const b of (account.balances ?? []) as Balance[]) {
    const qty = parseFloat(b.free) + parseFloat(b.locked);
    if (qty <= 0) continue;
    // Les avoirs "LD..." (Binance Earn flexible) sont comptés comme l'actif sous-jacent.
    const asset = b.asset.startsWith('LD') && b.asset.length > 3 ? b.asset.slice(2) : b.asset;
    if (asset === 'EUR') {
      cashEur += qty;
      continue;
    }
    const p = priceEur(asset, tickers);
    if (p === undefined) {
      warnings.push(`Binance : pas de cours EUR pour ${asset} (ignoré)`);
      continue;
    }
    const value = qty * p;
    if (value < 0.5) continue; // poussière
    holdings.push({ name: asset, symbol: asset, quantity: qty, unitPriceEur: p });
  }

  const ext: ExternalAccount = {
    externalId: 'binance-spot',
    name: 'Binance Spot',
    type: 'crypto',
    institution: 'Binance',
    cashBalanceEur: cashEur || undefined,
    holdings,
  };
  return { accounts: [ext], warnings };
}
