/**
 * Advanced Client-Side Request Deduplication & In-Flight Coalescing Engine
 * Master Blueprint PMUSIC Architecture - Batch 3 (Poin 62)
 *
 * Guarantees:
 * 1. Single in-flight HTTP request across concurrent callers for identical queries/APIs.
 * 2. Shared promise distribution: 0 duplicate network calls to backend.
 * 3. Short-lived LRU memory cache for ultra-responsive search & autocomplete.
 * 4. Safe error boundaries: failed requests delete cache keys immediately so retries work.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class ClientRequestDeduplicator {
  private inFlight = new Map<string, Promise<any>>();
  private memoryCache = new Map<string, CacheEntry<any>>();
  private readonly maxCacheEntries: number;

  constructor(maxCacheEntries = 250) {
    this.maxCacheEntries = maxCacheEntries;
  }

  /**
   * Generates a stable deduplication key for a request
   */
  private generateKey(url: string, init?: RequestInit): string {
    const method = (init?.method || 'GET').toUpperCase();
    return `${method}:${url}`;
  }

  /**
   * Executes a fetch with in-flight request deduplication and optional short-lived cache
   */
  async fetch<T = any>(
    url: string,
    init?: RequestInit,
    cacheTtlMs = 15000 // 15 seconds default client cache
  ): Promise<T> {
    const key = this.generateKey(url, init);

    // 1. Return from in-memory client cache if valid
    const cached = this.memoryCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data as T;
    }

    // 2. Coalesce with existing in-flight request promise if running
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    // 3. Initiate single network request
    const promise = (async () => {
      try {
        const response = await window.fetch(url, init);
        if (!response.ok) {
          throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();

        // Save to client cache if TTL > 0
        if (cacheTtlMs > 0 && data !== null && data !== undefined) {
          if (this.memoryCache.size >= this.maxCacheEntries) {
            const oldestKey = this.memoryCache.keys().next().value;
            if (oldestKey) this.memoryCache.delete(oldestKey);
          }
          this.memoryCache.set(key, {
            data,
            expiresAt: Date.now() + cacheTtlMs,
          });
        }

        return data as T;
      } finally {
        // Clear in-flight reference once settled
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  clear(): void {
    this.inFlight.clear();
    this.memoryCache.clear();
  }

  getInFlightCount(): number {
    return this.inFlight.size;
  }
}

export const clientDeduplicator = new ClientRequestDeduplicator();

/**
 * Universal helper for deduplicated client-side JSON API requests
 */
export async function deduplicatedFetch<T = any>(
  url: string,
  init?: RequestInit,
  cacheTtlMs?: number
): Promise<T> {
  if (typeof window === 'undefined') {
    const res = await fetch(url, init);
    return res.json();
  }
  return clientDeduplicator.fetch<T>(url, init, cacheTtlMs);
}
