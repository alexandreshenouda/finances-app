/** Tests du connecteur Binance (`src/lib/connectors/binance.ts`). La signature HMAC-SHA256
 *  est recalculée indépendamment avec `node:crypto`. `fetch` est simulé. */
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncBinance } from '@/lib/connectors/binance';
import { json, mockFetch, text } from './http';

const CREDS = { apiKey: 'key-123', apiSecret: 'secret-456' };

/** Cours publics : 1 EUR = 1,25 USDT ; BTC coté en EUR ; SOL seulement en USDT. */
const TICKERS = [
  { symbol: 'BTCEUR', price: '60000' },
  { symbol: 'EURUSDT', price: '1.25' },
  { symbol: 'SOLUSDT', price: '150' },
  { symbol: 'DOGEUSDT', price: '0.1' },
];

const balances = (list: [string, string, string][]) => ({
  balances: list.map(([asset, free, locked]) => ({ asset, free, locked })),
});

afterEach(() => vi.unstubAllGlobals());

describe('syncBinance', () => {
  it('signe la requête de compte (HMAC-SHA256 hex de la query) avec la clé en en-tête', async () => {
    const calls = mockFetch([
      ['/api/v3/account', json(balances([]))],
      ['/api/v3/ticker/price', json(TICKERS)],
    ]);
    await syncBinance(CREDS);
    const call = calls.find((c) => c.url.includes('/api/v3/account'))!;
    const url = new URL(call.url);
    const signature = url.searchParams.get('signature');
    const query = call.url.split('?')[1].replace(/&signature=.*$/, '');
    expect(query).toMatch(/^timestamp=\d+&recvWindow=15000$/);
    expect(signature).toBe(createHmac('sha256', CREDS.apiSecret).update(query).digest('hex'));
    expect((call.init?.headers as Record<string, string>)['X-MBX-APIKEY']).toBe('key-123');
  });

  it('valorise les soldes en EUR (paire directe, via USDT, Earn « LD… ») et isole les liquidités', async () => {
    mockFetch([
      [
        '/api/v3/account',
        json(
          balances([
            ['EUR', '100', '20.5'],
            ['BTC', '0.01', '0.01'],
            ['LDBTC', '0.03', '0'],
            ['SOL', '2', '0'],
            ['USDT', '50', '0'],
            ['DOGE', '1', '0'], // 0,08 € : poussière ignorée
            ['ETH', '0', '0'],
            ['LD', '5', '0'], // trop court pour un actif Earn : pris tel quel, sans cours
          ])
        ),
      ],
      ['/api/v3/ticker/price', json(TICKERS)],
    ]);
    const { accounts, warnings } = await syncBinance(CREDS);
    expect(warnings).toEqual(['Binance : pas de cours EUR pour LD (ignoré)']);
    expect(accounts).toHaveLength(1);
    const acc = accounts[0];
    expect(acc).toMatchObject({ externalId: 'binance-spot', name: 'Binance Spot', type: 'crypto', institution: 'Binance' });
    expect(acc.cashBalanceEur).toBe(120.5);
    expect(acc.holdings.map((h) => [h.symbol, h.quantity])).toEqual([
      ['BTC', 0.02],
      ['BTC', 0.03],
      ['SOL', 2],
      ['USDT', 50],
    ]);
    const price = Object.fromEntries(acc.holdings.map((h) => [h.symbol, h.unitPriceEur]));
    expect(price.BTC).toBe(60_000);
    expect(price.SOL).toBeCloseTo(150 / 1.25, 10);
    expect(price.USDT).toBeCloseTo(1 / 1.25, 10);
  });

  it('ne peut rien valoriser hors paire EUR directe sans le cours EURUSDT', async () => {
    mockFetch([
      ['/api/v3/account', json(balances([['SOL', '1', '0'], ['USDT', '10', '0'], ['BTC', '1', '0']]))],
      ['/api/v3/ticker/price', json([{ symbol: 'BTCEUR', price: '60000' }])],
    ]);
    const { accounts, warnings } = await syncBinance(CREDS);
    expect(accounts[0].holdings.map((h) => h.symbol)).toEqual(['BTC']);
    expect(accounts[0].cashBalanceEur).toBeUndefined();
    expect(warnings).toEqual(['Binance : pas de cours EUR pour SOL (ignoré)', 'Binance : pas de cours EUR pour USDT (ignoré)']);
  });

  it('signale un actif coté en USDT sans paire', async () => {
    mockFetch([
      ['/api/v3/account', json(balances([['ABC', '1', '0']]))],
      ['/api/v3/ticker/price', json(TICKERS)],
    ]);
    expect((await syncBinance(CREDS)).warnings).toEqual(['Binance : pas de cours EUR pour ABC (ignoré)']);
  });

  it('accepte une réponse de compte sans `balances`', async () => {
    mockFetch([
      ['/api/v3/account', json({})],
      ['/api/v3/ticker/price', json(TICKERS)],
    ]);
    expect((await syncBinance(CREDS)).accounts[0].holdings).toEqual([]);
  });

  it('remonte le corps (tronqué) d’une erreur d’API signée', async () => {
    mockFetch([
      ['/api/v3/account', text(`{"code":-2015,"msg":"Invalid API-key"}${'x'.repeat(300)}`, 401)],
      ['/api/v3/ticker/price', json(TICKERS)],
    ]);
    const err = await syncBinance(CREDS).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/^Binance HTTP 401 : \{"code":-2015,"msg":"Invalid API-key"\}x+$/);
    expect((err as Error).message.length).toBe('Binance HTTP 401 : '.length + 200);
  });

  it('remonte une erreur des tickers publics', async () => {
    mockFetch([
      ['/api/v3/account', json(balances([]))],
      ['/api/v3/ticker/price', text('', 418)],
    ]);
    await expect(syncBinance(CREDS)).rejects.toThrow('Binance tickers HTTP 418');
  });
});
