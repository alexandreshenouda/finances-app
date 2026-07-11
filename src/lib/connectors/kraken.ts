/**
 * Connecteur Kraken — clé API en lecture seule ("Query Funds").
 * Signature : API-Sign = HMAC-SHA512(base64decode(secret), path + SHA256(nonce + postdata)).
 */
import { hmac } from '@noble/hashes/hmac.js';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { fromUint8Array, toUint8Array } from 'js-base64';
import type { ExternalAccount, ExternalHolding, SyncResult } from './types';

const BASE = 'https://api.kraken.com';

export interface KrakenCredentials {
  apiKey: string;
  apiSecret: string; // base64
}

async function privatePost(path: string, creds: KrakenCredentials): Promise<any> {
  const nonce = Date.now().toString();
  const postData = `nonce=${nonce}`;
  const message = new Uint8Array([
    ...utf8ToBytes(path),
    ...sha256(utf8ToBytes(nonce + postData)),
  ]);
  const signature = fromUint8Array(hmac(sha512, toUint8Array(creds.apiSecret), message));

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'API-Key': creds.apiKey,
      'API-Sign': signature,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: postData,
  });
  if (!res.ok) throw new Error(`Kraken HTTP ${res.status}`);
  const json = await res.json();
  if (json.error?.length) throw new Error(`Kraken : ${json.error.join(', ')}`);
  return json.result;
}

/** Normalise les codes d'actifs Kraken (XXBT → BTC, ZEUR → EUR…). */
function normalizeAsset(code: string): string {
  let a = code;
  if ((a.startsWith('X') || a.startsWith('Z')) && a.length === 4) a = a.slice(1);
  if (a === 'XBT') a = 'BTC';
  // Suffixes de staking type "ETH2.S" / "SOL.S"
  a = a.replace(/\d*\.(S|M|F|B)$/, '');
  return a;
}

async function fetchTickerEur(assets: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const pairs = assets.map((a) => `${a === 'BTC' ? 'XBT' : a}EUR`).join(',');
  if (!pairs) return out;
  const res = await fetch(`${BASE}/0/public/Ticker?pair=${encodeURIComponent(pairs)}`);
  if (!res.ok) throw new Error(`Kraken ticker HTTP ${res.status}`);
  const json = await res.json();
  const result = json.result ?? {};
  for (const [pair, data] of Object.entries<any>(result)) {
    const price = parseFloat(data?.c?.[0]);
    if (!Number.isFinite(price)) continue;
    // Retrouve l'actif de la paire (ex : XXBTZEUR, ETHEUR, SOLEUR…)
    const cleaned = pair.replace(/ZEUR$|EUR$/, '');
    out.set(normalizeAsset(cleaned), price);
  }
  return out;
}

export async function syncKraken(creds: KrakenCredentials): Promise<SyncResult> {
  const balances = (await privatePost('/0/private/Balance', creds)) as Record<string, string>;

  const warnings: string[] = [];
  const byAsset = new Map<string, number>();
  let cashEur = 0;

  for (const [code, qtyStr] of Object.entries(balances)) {
    const qty = parseFloat(qtyStr);
    if (qty <= 0) continue;
    const asset = normalizeAsset(code);
    if (asset === 'EUR') {
      cashEur += qty;
      continue;
    }
    byAsset.set(asset, (byAsset.get(asset) ?? 0) + qty);
  }

  const prices = await fetchTickerEur([...byAsset.keys()]);
  const holdings: ExternalHolding[] = [];
  for (const [asset, qty] of byAsset) {
    const p = prices.get(asset);
    if (p === undefined) {
      warnings.push(`Kraken : pas de cours EUR pour ${asset} (ignoré)`);
      continue;
    }
    if (qty * p < 0.5) continue;
    holdings.push({ name: asset, symbol: asset, quantity: qty, unitPriceEur: p });
  }

  const ext: ExternalAccount = {
    externalId: 'kraken-main',
    name: 'Kraken',
    type: 'crypto',
    institution: 'Kraken',
    cashBalanceEur: cashEur || undefined,
    holdings,
  };
  return { accounts: [ext], warnings };
}
