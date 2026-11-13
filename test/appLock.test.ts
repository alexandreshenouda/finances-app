/** Tests des règles de verrouillage de l'app (`src/lib/appLock.ts`). */
import { describe, expect, it } from 'vitest';
import { APP_LOCK_GRACE_MS, shouldRelock, unlocksApp } from '@/lib/appLock';

describe('shouldRelock', () => {
  const t0 = 1_700_000_000_000;

  it('ne reverrouille pas si l’app n’est jamais passée en arrière-plan', () => {
    expect(shouldRelock(undefined, t0)).toBe(false);
  });

  it('tolère un passage bref en arrière-plan, reverrouille à partir du délai de grâce', () => {
    expect(shouldRelock(t0, t0 + APP_LOCK_GRACE_MS - 1)).toBe(false);
    expect(shouldRelock(t0, t0 + APP_LOCK_GRACE_MS)).toBe(true);
    expect(shouldRelock(t0, t0 + 3_600_000)).toBe(true);
  });

  it('accepte un délai de grâce personnalisé', () => {
    expect(shouldRelock(t0, t0 + 10, 0)).toBe(true);
    expect(shouldRelock(t0, t0 + 10, 1_000)).toBe(false);
  });
});

describe('unlocksApp', () => {
  it('déverrouille après une authentification réussie', () => {
    expect(unlocksApp({ success: true })).toBe(true);
  });

  it('reste verrouillé sur un échec ou une annulation', () => {
    for (const error of ['user_cancel', 'authentication_failed', 'lockout', 'system_cancel', 'unknown']) {
      expect(unlocksApp({ success: false, error })).toBe(false);
    }
    expect(unlocksApp({ success: false })).toBe(false);
  });

  it('laisse entrer si l’appareil n’a plus aucun verrou à présenter', () => {
    for (const error of ['not_enrolled', 'passcode_not_set', 'not_available']) {
      expect(unlocksApp({ success: false, error })).toBe(true);
    }
  });
});
