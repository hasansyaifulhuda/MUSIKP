/**
 * Intelligent Server & Client In-Memory LRU Cache with In-Flight Request Deduplication.
 * Ensures zero duplicate upstream requests to YouTube, reducing bot suspicion and rate-limits.
 * Minimum TTL: 2 Hours (configurable).
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class MemoryCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private inFlight = new Map<string, Promise<T>>();
  private readonly maxSize: number;
  private readonly defaultTtlMs: number;

  constructor(maxSize = 800, defaultTtlMs = 1000 * 60 * 60 * 2) {
    this.maxSize = maxSize;
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Refresh LRU order (delete & re-set moves key to the end of insertion order)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data;
  }

  set(key: string, data: T, ttlMs?: number): void {
    if (this.cache.size >= this.maxSize) {
      // Evict oldest item
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttlMs || this.defaultTtlMs),
    });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Fetch with in-flight request deduplication:
   * If concurrent requests arrive for the exact same track or query,
   * only 1 network fetch runs and all callers receive the shared promise result.
   */
  async getOrFetch(key: string, fetcher: () => Promise<T>, ttlMs?: number): Promise<T> {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const existingPromise = this.inFlight.get(key);
    if (existingPromise) {
      return existingPromise;
    }

    const promise = (async () => {
      try {
        const result = await fetcher();
        if (result !== undefined && result !== null) {
          this.set(key, result, ttlMs);
        }
        return result;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  delete(key: string): void {
    this.cache.delete(key);
    this.inFlight.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.inFlight.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// -----------------------------------------------------------------------------
// Pre-configured Global In-Memory Caches
// -----------------------------------------------------------------------------

// Stream URLs: 4-Hour TTL (Google Video direct URLs expire in ~6 hours)
export const streamCache = new MemoryCache(1000, 1000 * 60 * 60 * 4);

// Search Results: 2-Hour TTL (minimizes outbound catalog searches)
export const searchCache = new MemoryCache(800, 1000 * 60 * 60 * 2);

// Albums & Playlists: 2-Hour TTL
export const metadataCache = new MemoryCache(500, 1000 * 60 * 60 * 2);
