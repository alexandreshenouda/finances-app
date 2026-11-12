/** Tests du journal de debug des connecteurs (`src/lib/debugLog.ts`). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logDebug, logDebugError, redactUrl, tracedFetch, useDebugLogStore } from '@/lib/debugLog';
import { json, mockFetch, networkError, text } from './http';

const S = () => useDebugLogStore.getState();

beforeEach(() => {
  S().clear();
  S().setEnabled(false);
});

describe('logDebug / logDebugError', () => {
  it('ne trace rien tant que le mode développeur est désactivé', () => {
    logDebug('tag', 'message');
    logDebugError('tag', 'erreur');
    expect(S().entries).toEqual([]);
  });

  it('trace en tête de journal, avec niveau, id et horodatage', () => {
    S().setEnabled(true);
    logDebug('yahoo', 'GET /chart', '{"ok":true}');
    logDebugError('tr', 'HTTP 401');
    const [last, first] = S().entries;
    expect(last).toMatchObject({ level: 'error', tag: 'tr', message: 'HTTP 401', detail: undefined });
    expect(first).toMatchObject({ level: 'info', tag: 'yahoo', message: 'GET /chart', detail: '{"ok":true}' });
    expect(first.id).not.toBe(last.id);
    expect(Date.parse(first.ts)).not.toBeNaN();
  });

  it('tronque un détail trop long (20 000 caractères + ellipse)', () => {
    S().setEnabled(true);
    logDebug('t', 'gros corps', 'x'.repeat(25_000));
    logDebugError('t', 'gros corps', 'y'.repeat(20_000));
    const [err, info] = S().entries;
    expect(info.detail).toBe(`${'x'.repeat(20_000)}…`);
    // Pile à la limite : rien n'est coupé.
    expect(err.detail).toBe('y'.repeat(20_000));
  });

  it('ne garde que les 500 entrées les plus récentes', () => {
    S().setEnabled(true);
    for (let i = 0; i < 510; i++) logDebug('t', `m${i}`);
    expect(S().entries).toHaveLength(500);
    expect(S().entries[0].message).toBe('m509');
    expect(S().entries[499].message).toBe('m10');
  });

  it('vide le journal', () => {
    S().setEnabled(true);
    logDebug('t', 'm');
    S().clear();
    expect(S().entries).toEqual([]);
  });
});

describe('tracedFetch', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('journal désactivé : relaie la requête sans rien tracer', async () => {
    const calls = mockFetch([['example.test', json({ ok: true })]]);
    const res = await tracedFetch('fx', 'https://example.test/a', { method: 'POST' });
    expect(await res.json()).toEqual({ ok: true });
    expect(calls).toEqual([{ url: 'https://example.test/a', init: { method: 'POST' } }]);
    expect(S().entries).toEqual([]);
  });

  it('trace méthode, URL, statut et durée de chaque requête aboutie', async () => {
    S().setEnabled(true);
    mockFetch([['example.test', json({})]]);
    await tracedFetch('immobilier', 'https://example.test/dvf?code=75056');
    await tracedFetch('kraken', 'https://example.test/private', { method: 'post' });
    const [post, get] = S().entries;
    expect(get).toMatchObject({ level: 'info', tag: 'immobilier' });
    expect(get.message).toMatch(/^GET https:\/\/example\.test\/dvf\?code=75056 → HTTP 200 \(\d+ ms\)$/);
    expect(post.message).toMatch(/^POST https:\/\/example\.test\/private → HTTP 200 \(\d+ ms\)$/);
  });

  it('marque en erreur un statut HTTP en échec, sans lever', async () => {
    S().setEnabled(true);
    mockFetch([['example.test', text('nope', 503)]]);
    const res = await tracedFetch('fx', 'https://example.test/x');
    expect(res.status).toBe(503);
    expect(S().entries[0]).toMatchObject({ level: 'error', tag: 'fx' });
    expect(S().entries[0].message).toContain('→ HTTP 503');
  });

  it("trace une erreur réseau puis la relance à l'appelant", async () => {
    S().setEnabled(true);
    mockFetch([['example.test', networkError('Failed to fetch')]]);
    await expect(tracedFetch('fx', 'https://example.test/x')).rejects.toThrow('Failed to fetch');
    expect(S().entries[0]).toMatchObject({ level: 'error', tag: 'fx' });
    expect(S().entries[0].message).toContain('GET https://example.test/x → Failed to fetch');
  });

  it("expurge les secrets de l'URL journalisée, pas de la requête envoyée", async () => {
    S().setEnabled(true);
    const calls = mockFetch([['example.test', json({})]]);
    const url = 'https://example.test/v1/models?pageSize=100&key=SECRET&signature=abc123#frag';
    await tracedFetch('gemini', url);
    expect(calls[0].url).toBe(url);
    expect(S().entries[0].message).toContain('?pageSize=100&key=***&signature=***#frag');
    expect(S().entries[0].message).not.toContain('SECRET');
  });
});

describe('redactUrl', () => {
  it('masque les paramètres sensibles et laisse les autres intacts', () => {
    expect(redactUrl('https://a.test/p?apiKey=1&q=paris&token=2')).toBe('https://a.test/p?apiKey=***&q=paris&token=***');
    expect(redactUrl('https://a.test/p?monkey=1')).toBe('https://a.test/p?monkey=1');
  });
});
