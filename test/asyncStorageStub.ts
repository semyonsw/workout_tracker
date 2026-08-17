/**
 * In-memory `AsyncStorage`, aliased in by `vitest.config.ts`.
 *
 * Implements only what `zustand/middleware`'s `createJSONStorage` calls. The real
 * module is a native module and cannot load under Node; this is enough to let the
 * persisted stores be constructed and their rehydration logic exercised.
 */

const store = new Map<string, string>();

const AsyncStorage = {
  getItem: async (key: string): Promise<string | null> => store.get(key) ?? null,
  setItem: async (key: string, value: string): Promise<void> => {
    store.set(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    store.delete(key);
  },
  clear: async (): Promise<void> => {
    store.clear();
  },
};

export default AsyncStorage;
