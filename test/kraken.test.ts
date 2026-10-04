/** Tests du connecteur Kraken (`src/lib/connectors/kraken.ts`). La signature
 *  HMAC-SHA512(base64⁻¹(secret), chemin + SHA256(nonce + corps)) est recalculée
 *  indépendamment avec `node:crypto`. `fetch` est simulé. */
import { createHash, createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncKraken } from '@/lib/connectors/kraken';
import { json, mockFetch, text } from './http';

const SECRET = Buffer.from('kraken-secret-bytes').toString('base64');
const CREDS = { apiKey: 'kraken-key', apiSecret: SECRET };

afterEach(() => vi.unstubAllGlobals());

describe('syncKraken', () => {
  it('signe la requête privée selon la spécification Kraken', async () => {
    const calls = mockFetch([['/0/private/Balance', json({ error: [], result: {} })]]);
    await syncKraken(CREDS);
    const { init } = calls[0];
    const body = String(init?.body);
    const nonce = body.replace('nonce=', '');
    expect(body).toMatch(/^nonce=\d+$/);
    const path = '/0/private/Balance';
    const digest = createHash('sha256').update(nonce + body).digest();
    const expected = createHmac('sha512', Buffer.from(SECRET, 'base64'))
      .update(Buffer.concat([Buffer.from(path), digest]))
      .digest('base64');
    const headers = init?.headers as Record<string, string>;
    expect(headers['API-Sign']).toBe(expected);
    expect(headers['API-Key']).toBe('kraken-key');
    expect(init?.method).toBe('POST');
    // Aucun actif à coter : pas d'appel au ticker public.
    expect(calls).toHaveLength(1);
  });

  it('normalise les codes d’actifs, agrège le staking et valorise en EUR', async () => {
    const calls = mockFetch([
      [
        '/0/private/Balance',
        json({
          error: [],
          result: {
            ZEUR: '250.5',
            XXBT: '0.1',
            XETH: '1',
            'ETH2.S': '0.5',
            'DOT28.S': '10',
            ADA: '0',
            XXDG: '1', // 0,1 € : poussière ignorée
            FOO: '3', // aucune cotation EUR
          },
        }),
      ],
      [
        '/0/public/Ticker',
        json({
          result: {
            XXBTZEUR: { c: ['60000.0', '0.1'] },
            XETHZEUR: { c: ['3000'] },
            DOTEUR: { c: ['5'] },
            XXDGZEUR: { c: ['0.1'] },
            BADEUR: { c: ['n/a'] },
          },
        }),
      ],
    ]);
    const { accounts, warnings } = await syncKraken(CREDS);
    expect(warnings).toEqual(['Kraken : pas de cours EUR pour FOO (ignoré)']);
    expect(accounts).toEqual([
      {
        externalId: 'kraken-main',
        name: 'Kraken',
        type: 'crypto',
        institution: 'Kraken',
        cashBalanceEur: 250.5,
        holdings: [
          { name: 'BTC', symbol: 'BTC', quantity: 0.1, unitPriceEur: 60_000 },
          { name: 'ETH', symbol: 'ETH', quantity: 1.5, unitPriceEur: 3_000 },
          { name: 'DOT', symbol: 'DOT', quantity: 10, unitPriceEur: 5 },
        ],
      },
    ]);
    // Le BTC est demandé sous son code Kraken (XBT).
    const pairs = decodeURIComponent(calls[1].url.split('pair=')[1]).split(',');
    expect(pairs).toEqual(['XBTEUR', 'ETHEUR', 'DOTEUR', 'XDGEUR', 'FOOEUR']);
  });

  it('omet les liquidités quand il n’y a pas d’euros', async () => {
    mockFetch([
      ['/0/private/Balance', json({ error: [], result: { SOL: '1' } })],
      ['/0/public/Ticker', json({ result: { SOLEUR: { c: ['100'] } } })],
    ]);
    const [acc] = (await syncKraken(CREDS)).accounts;
    expect(acc.cashBalanceEur).toBeUndefined();
    expect(acc.holdings).toHaveLength(1);
  });

  it('supporte un ticker sans `result`', async () => {
    mockFetch([
      ['/0/private/Balance', json({ error: [], result: { SOL: '1' } })],
      ['/0/public/Ticker', json({ error: ['EQuery:Unknown asset pair'] })],
    ]);
    expect((await syncKraken(CREDS)).warnings).toEqual(['Kraken : pas de cours EUR pour SOL (ignoré)']);
  });

  it('remonte les erreurs de l’API privée et du ticker', async () => {
    mockFetch([['/0/private/Balance', json({ error: ['EAPI:Invalid key', 'EGeneral:x'] })]]);
    await expect(syncKraken(CREDS)).rejects.toThrow('Kraken : EAPI:Invalid key, EGeneral:x');

    mockFetch([['/0/private/Balance', text('', 520)]]);
    await expect(syncKraken(CREDS)).rejects.toThrow('Kraken HTTP 520');

    mockFetch([
      ['/0/private/Balance', json({ result: { SOL: '1' } })],
      ['/0/public/Ticker', text('', 503)],
    ]);
    await expect(syncKraken(CREDS)).rejects.toThrow('Kraken ticker HTTP 503');
  });
});
