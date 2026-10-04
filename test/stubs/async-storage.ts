/** Bouchon de test pour AsyncStorage : une Map en mémoire.
 *  Suffisant pour que le middleware `persist` de zustand s'initialise sous Node. */
const memory = new Map<string, string>();

const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    return memory.get(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    memory.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    memory.delete(key);
  },
  async clear(): Promise<void> {
    memory.clear();
  },
  async getAllKeys(): Promise<string[]> {
    return [...memory.keys()];
  },
};

export default AsyncStorage;
