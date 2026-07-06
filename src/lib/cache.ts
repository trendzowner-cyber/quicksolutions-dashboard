// Simple in-memory cache for API responses
// Reduces load on WordPress/WooCommerce APIs

interface CacheEntry {
  data: unknown;
  expiry: number;
}

const store = new Map<string, CacheEntry>();

// Clean expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiry < now) store.delete(key);
  }
}, 300000);

export function getCached<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiry < Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache(key: string, data: unknown, ttlSeconds = 60): void {
  store.set(key, { data, expiry: Date.now() + ttlSeconds * 1000 });
}

// Only keep last 100 entries to prevent memory leaks
// Cleanup old entries when store grows too large
const origSet = store.set.bind(store);
store.set = function (key: string, value: CacheEntry) {
  if (store.size > 100) {
    const firstKey = store.keys().next().value;
    if (firstKey) store.delete(firstKey);
  }
  return origSet(key, value);
};
