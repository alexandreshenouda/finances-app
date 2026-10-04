/** Tests du connecteur Enable Banking (`src/lib/connectors/enablebanking.ts`). Le JWT RS256
 *  est vérifié avec la clé publique via `node:crypto` (clé RSA générée pour le test).
 *  `fetch` est simulé. */
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkApplication,
  createSession,
  listBanks,
  startAuth,
  syncEnableBanking,
  type EbSession,
  type EnableBankingCredentials,
} from '@/lib/connectors/enablebanking';
import { json, mockFetch, text } from './http';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

const creds = (sessions: EbSession[] = []): EnableBankingCredentials => ({
  applicationId: 'app-uuid',
  privateKeyPem: privateKey,
  redirectUrl: 'https://example.github.io/eb-callback.html',
  sessions,
});

const b64url = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

afterEach(() => vi.unstubAllGlobals());

describe('authentification (JWT RS256)', () => {
  it('signe chaque requête avec un JWT valide d’une heure, identifié par l’application', async () => {
    const calls = mockFetch([['/application', json({ name: 'Mon appli' })]]);
    expect(await checkApplication(creds())).toEqual({ name: 'Mon appli' });

    const auth = (calls[0].init?.headers as Record<string, string>).Authorization;
    const [h, p, sig] = auth.replace('Bearer ', '').split('.');
    expect(b64url(h)).toEqual({ typ: 'JWT', alg: 'RS256', kid: 'app-uuid' });
    const payload = b64url(p);
    expect(payload).toMatchObject({ iss: 'enablebanking.com', aud: 'api.enablebanking.com' });
    expect(payload.exp - payload.iat).toBe(3600);
    expect(Math.abs(payload.iat - Date.now() / 1000)).toBeLessThan(60);
    const ok = verify('sha256', Buffer.from(`${h}.${p}`), createPublicKey(publicKey), Buffer.from(sig, 'base64url'));
    expect(ok).toBe(true);
    expect(calls[0].init?.method).toBe('GET');
    expect(calls[0].init?.body).toBeUndefined();
  });

  it('donne un nom par défaut à une application anonyme', async () => {
    mockFetch([['/application', json({})]]);
    expect(await checkApplication(creds())).toEqual({ name: 'application' });
  });

  it('remonte le statut, le chemin et le corps tronqué d’une erreur', async () => {
    mockFetch([['/application', text(`unauthorized ${'x'.repeat(400)}`, 401)]]);
    const err = (await checkApplication(creds()).catch((e: Error) => e)) as Error;
    expect(err.message.startsWith('Enable Banking HTTP 401 sur /application : unauthorized')).toBe(true);
    expect(err.message.length).toBe('Enable Banking HTTP 401 sur /application : '.length + 300);
  });
});

describe('parcours de connexion', () => {
  it('liste les banques d’un pays (France par défaut)', async () => {
    const calls = mockFetch([['/aspsps', json({ aspsps: [{ name: 'BNP', country: 'FR', logo: 'x' }] })]]);
    expect(await listBanks(creds())).toEqual([{ name: 'BNP', country: 'FR' }]);
    expect(calls[0].url).toContain('/aspsps?country=FR');
    await listBanks(creds(), 'LT');
    expect(calls[1].url).toContain('/aspsps?country=LT');
    mockFetch([['/aspsps', json({})]]);
    expect(await listBanks(creds())).toEqual([]);
  });

  it('démarre l’autorisation avec un consentement de 90 jours et l’URL de rebond https', async () => {
    const calls = mockFetch([['/auth', json({ url: 'https://bank.example/consent' })]]);
    expect(await startAuth(creds(), { name: 'BNP', country: 'FR' }, 'state-1')).toBe('https://bank.example/consent');
    const { init } = calls[0];
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      aspsp: { name: 'BNP', country: 'FR' },
      state: 'state-1',
      redirect_url: 'https://example.github.io/eb-callback.html',
      psu_type: 'personal',
    });
    const days = (Date.parse(body.access.valid_until) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(89.9);
    expect(days).toBeLessThanOrEqual(90);
  });

  it('échoue si la banque ne renvoie pas d’URL', async () => {
    mockFetch([['/auth', json({})]]);
    await expect(startAuth(creds(), { name: 'BNP', country: 'FR' }, 's')).rejects.toThrow(
      "Enable Banking n'a pas renvoyé d'URL d'autorisation"
    );
  });

  it('crée une session et nomme chaque compte (nom, produit, IBAN, ou « Compte »)', async () => {
    const calls = mockFetch([
      [
        '/sessions',
        json({
          session_id: 'sess-1',
          access: { valid_until: '2027-01-01T00:00:00Z' },
          accounts: [
            { uid: 'u1', name: 'Compte chèques', account_id: { iban: 'FR76...1' } },
            { uid: 'u2', product: 'Livret A' },
            { uid: 'u3', account_id: { iban: 'FR76...3' } },
            { uid: 'u4' },
          ],
        }),
      ],
    ]);
    expect(await createSession(creds(), 'code-xyz', 'BNP')).toEqual({
      sessionId: 'sess-1',
      aspspName: 'BNP',
      validUntil: '2027-01-01T00:00:00Z',
      accounts: [
        { uid: 'u1', name: 'Compte chèques', iban: 'FR76...1' },
        { uid: 'u2', name: 'Livret A', iban: undefined },
        { uid: 'u3', name: 'FR76...3', iban: 'FR76...3' },
        { uid: 'u4', name: 'Compte', iban: undefined },
      ],
    });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ code: 'code-xyz' });
  });

  it('tolère une session sans comptes ni date de validité', async () => {
    mockFetch([['/sessions', json({ session_id: 's' })]]);
    expect(await createSession(creds(), 'c', 'X')).toEqual({ sessionId: 's', aspspName: 'X', validUntil: '', accounts: [] });
  });
});

describe('syncEnableBanking', () => {
  const session = (over: Partial<EbSession> = {}): EbSession => ({
    sessionId: 's',
    aspspName: 'BNP',
    validUntil: inDays(30),
    accounts: [{ uid: 'u1', name: 'Chèques' }],
    ...over,
  });

  it('privilégie le solde comptable et crée un compte courant par compte bancaire', async () => {
    const calls = mockFetch([
      [
        '/accounts/u1/balances',
        json({
          balances: [
            { balance_type: 'ITAV', balance_amount: { amount: '999', currency: 'EUR' } },
            { balance_type: 'CLBD', balance_amount: { amount: '1234.56', currency: 'EUR' } },
          ],
        }),
      ],
      ['/accounts/u2/balances', json({ balances: [{ balance_type: 'ITAV', balance_amount: { amount: '10' } }] })],
    ]);
    const r = await syncEnableBanking(creds([session({ accounts: [{ uid: 'u1', name: 'Chèques' }, { uid: 'u2', name: 'Livret' }] })]));
    expect(r).toEqual({
      warnings: [],
      accounts: [
        { externalId: 'eb-u1', name: 'Chèques', type: 'courant', institution: 'BNP', cashBalanceEur: 1234.56, holdings: [] },
        { externalId: 'eb-u2', name: 'Livret', type: 'courant', institution: 'BNP', cashBalanceEur: 10, holdings: [] },
      ],
    });
    expect(calls).toHaveLength(2);
  });

  it('signale un consentement expiré sans interroger la banque', async () => {
    const calls = mockFetch([]);
    const r = await syncEnableBanking(creds([session({ validUntil: '2020-03-01T00:00:00Z' })]));
    expect(r).toEqual({
      accounts: [],
      warnings: ["BNP : consentement expiré, reconnectez la banque (valable jusqu'au 2020-03-01)"],
    });
    expect(calls).toHaveLength(0);
  });

  it('traite une session sans date de validité comme active', async () => {
    mockFetch([['/balances', json({ balances: [{ balance_amount: { amount: '5', currency: 'EUR' } }] })]]);
    expect((await syncEnableBanking(creds([session({ validUntil: '' })]))).accounts).toHaveLength(1);
  });

  it('signale les soldes indisponibles (vides, illisibles, en devise) et les erreurs par compte', async () => {
    mockFetch([
      ['/accounts/empty/balances', json({})],
      ['/accounts/nan/balances', json({ balances: [{ balance_type: 'CLBD', balance_amount: { amount: 'abc' } }] })],
      ['/accounts/usd/balances', json({ balances: [{ balance_type: 'CLBD', balance_amount: { amount: '5', currency: 'USD' } }] })],
      ['/accounts/ko/balances', text('down', 500)],
    ]);
    const r = await syncEnableBanking(
      creds([
        session({
          accounts: [
            { uid: 'empty', name: 'A' },
            { uid: 'nan', name: 'B' },
            { uid: 'usd', name: 'C' },
            { uid: 'ko', name: 'D' },
          ],
        }),
      ])
    );
    expect(r.accounts).toEqual([]);
    expect(r.warnings).toEqual([
      'BNP / A : solde indisponible',
      'BNP / B : solde indisponible',
      'BNP / C : solde indisponible',
      'BNP / D : Enable Banking HTTP 500 sur /accounts/ko/balances : down',
    ]);
  });
});
