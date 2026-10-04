/** Tests du journal de debug des connecteurs (`src/lib/debugLog.ts`). */
import { beforeEach, describe, expect, it } from 'vitest';
import { logDebug, logDebugError, useDebugLogStore } from '@/lib/debugLog';

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

  it('ne garde que les 300 entrées les plus récentes', () => {
    S().setEnabled(true);
    for (let i = 0; i < 310; i++) logDebug('t', `m${i}`);
    expect(S().entries).toHaveLength(300);
    expect(S().entries[0].message).toBe('m309');
    expect(S().entries[299].message).toBe('m10');
  });

  it('vide le journal', () => {
    S().setEnabled(true);
    logDebug('t', 'm');
    S().clear();
    expect(S().entries).toEqual([]);
  });
});
