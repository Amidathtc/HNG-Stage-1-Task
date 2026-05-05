/**
 * Simple in-process LRU-style cache with TTL.
 * No external dependencies — just a Map with timestamps.
 * Good for hundreds to low-thousands of QPM with repeated filter patterns.
 */

interface CacheEntry {
  value: any;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 60_000; // 60 seconds
const MAX_ENTRIES = 500; // cap memory usage

export const cache = {
  get(key: string): any | null {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }
    return entry.value;
  },

  set(key: string, value: any, ttlMs = DEFAULT_TTL_MS): void {
    // Evict oldest entry if at cap
    if (store.size >= MAX_ENTRIES) {
      const firstKey = store.keys().next().value;
      if (firstKey !== undefined) store.delete(firstKey);
    }
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
  },

  delete(key: string): void {
    store.delete(key);
  },

  flush(): void {
    store.clear();
  },

  size(): number {
    return store.size;
  },
};
