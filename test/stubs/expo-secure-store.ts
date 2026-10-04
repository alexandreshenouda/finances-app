/** Bouchon de test pour `expo-secure-store` (Keystore/Keychain natif, indisponible sous Node) :
 *  une Map en mémoire, exposée pour que les tests puissent l'inspecter ou la vider. */
export const __secureMemory = new Map<string, string>();

export async function setItemAsync(key: string, value: string): Promise<void> {
  __secureMemory.set(key, value);
}

export async function getItemAsync(key: string): Promise<string | null> {
  return __secureMemory.get(key) ?? null;
}

export async function deleteItemAsync(key: string): Promise<void> {
  __secureMemory.delete(key);
}
