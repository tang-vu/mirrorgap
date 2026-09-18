/**
 * TTL cache honoring documented CMC update frequencies:
 *   map / info / issuers / issuer        → refreshed every ~30s upstream
 *   assets/list, quotes/latest, pairs    → refreshed every ~60s upstream
 * Caching below those intervals saves credits without serving stale data
 * beyond what the API itself already serves.
 */

export const CMC_TTL = {
  map: 30_000,
  info: 30_000,
  issuers: 30_000,
  issuer: 30_000,
  quotes: 55_000,
  assetsList: 55_000,
  marketPairs: 55_000,
  keyInfo: 10_000,
} as const;

interface CacheEntry {
  value: unknown;
  storedAt: number;
  ttlMs: number;
}

export class TtlCache {
  private store = new Map<string, CacheEntry>();

  get<T>(key: string): { value: T; ageMs: number } | null {
    const e = this.store.get(key);
    if (!e) return null;
    const age = Date.now() - e.storedAt;
    if (age > e.ttlMs) {
      this.store.delete(key);
      return null;
    }
    return { value: e.value as T, ageMs: age };
  }

  set(key: string, value: unknown, ttlMs: number): void {
    this.store.set(key, { value, storedAt: Date.now(), ttlMs });
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

export function cacheKey(path: string, params: Record<string, string | number | boolean>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join("&");
  return `${path}?${sorted}`;
}
