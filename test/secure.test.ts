/** Tests du stockage des secrets (`src/lib/secure.ts`) : SecureStore en natif,
 *  localStorage en repli sur le web. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Platform } from './stubs/react-native';
import { __secureMemory } from './stubs/expo-secure-store';
import { connectionSecretKey, deleteSecret, getSecret, setSecret } from '@/lib/secure';

afterEach(() => {
  Platform.OS = 'android';
  __secureMemory.clear();
  vi.unstubAllGlobals();
});

describe('natif (SecureStore)', () => {
  it('écrit, relit et supprime sous un préfixe dédié', async () => {
    await setSecret('k', 'v');
    expect(__secureMemory.get('patrimoine.secret.k')).toBe('v');
    expect(await getSecret('k')).toBe('v');
    await deleteSecret('k');
    expect(await getSecret('k')).toBeNull();
  });
});

describe('web (localStorage)', () => {
  it('passe par localStorage et jamais par SecureStore', async () => {
    Platform.OS = 'web';
    const memory = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      setItem: (k: string, v: string) => memory.set(k, v),
      getItem: (k: string) => memory.get(k) ?? null,
      removeItem: (k: string) => memory.delete(k),
    });
    await setSecret('k', 'v');
    expect(memory.get('patrimoine.secret.k')).toBe('v');
    expect(__secureMemory.size).toBe(0);
    expect(await getSecret('k')).toBe('v');
    await deleteSecret('k');
    expect(await getSecret('k')).toBeNull();
  });

  it('renvoie null sans planter si localStorage est indisponible', async () => {
    Platform.OS = 'web';
    vi.stubGlobal('localStorage', undefined);
    await expect(setSecret('k', 'v')).resolves.toBeUndefined();
    await expect(deleteSecret('k')).resolves.toBeUndefined();
    expect(await getSecret('k')).toBeNull();
  });
});

describe('connectionSecretKey', () => {
  it('dérive une clé par connexion', () => {
    expect(connectionSecretKey('abc')).toBe('conn.abc');
  });
});
