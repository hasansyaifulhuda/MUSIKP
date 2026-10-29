/**
 * High-Performance Debounced Storage Engine
 * Prevents main thread stutter and battery drain caused by rapid, synchronous localStorage writes
 * (e.g. volume sliders, playback position updates, frequent queue manipulations).
 * 
 * Features:
 * - Instant synchronous reads via in-memory dirty cache (eliminates SSR hydration lag)
 * - Batched & debounced asynchronous disk persistence
 * - Guaranteed data persistence on page unload (beforeunload & pagehide lifecycle events)
 * - Safe fallback for SSR and restricted/incognito environments
 */

import { StateStorage } from 'zustand/middleware';

const DEFAULT_DEBOUNCE_MS = 600;

class DebouncedStorageManager implements StateStorage {
  private cache: Map<string, string | null> = new Map();
  private dirtyKeys: Set<string> = new Set();
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceMs: number;
  private isBrowser: boolean;

  constructor(debounceMs: number = DEFAULT_DEBOUNCE_MS) {
    this.debounceMs = debounceMs;
    this.isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

    if (this.isBrowser) {
      // Flush pending debounced writes immediately when navigating away or closing tab
      window.addEventListener('beforeunload', () => this.flush());
      window.addEventListener('pagehide', () => this.flush());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.flush();
        }
      });
    }
  }

  /**
   * Synchronous getter with L1 in-memory cache
   */
  public getItem(name: string): string | null {
    if (!this.isBrowser) return null;

    // Check memory cache first (guarantees read-your-own-writes consistency)
    if (this.cache.has(name)) {
      return this.cache.get(name) ?? null;
    }

    try {
      const val = window.localStorage.getItem(name);
      this.cache.set(name, val);
      return val;
    } catch {
      return null;
    }
  }

  /**
   * Debounced setter: updates memory cache instantly and schedules disk write
   */
  public setItem(name: string, value: string): void {
    if (!this.isBrowser) return;

    // Update in-memory cache immediately
    this.cache.set(name, value);
    this.dirtyKeys.add(name);

    this.scheduleFlush();
  }

  /**
   * Removes item from cache and localStorage immediately
   */
  public removeItem(name: string): void {
    if (!this.isBrowser) return;

    this.cache.set(name, null);
    this.dirtyKeys.delete(name);

    try {
      window.localStorage.removeItem(name);
    } catch {}
  }

  /**
   * Schedule debounced flush of dirty keys to localStorage
   */
  private scheduleFlush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flush();
    }, this.debounceMs);
  }

  /**
   * Force flush all pending dirty writes immediately to localStorage
   */
  public flush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (!this.isBrowser || this.dirtyKeys.size === 0) return;

    for (const key of this.dirtyKeys) {
      try {
        const val = this.cache.get(key);
        if (val !== null && val !== undefined) {
          window.localStorage.setItem(key, val);
        } else {
          window.localStorage.removeItem(key);
        }
      } catch (err) {
        console.warn(`[DebouncedStorage] Failed writing key "${key}" to localStorage:`, err);
      }
    }

    this.dirtyKeys.clear();
  }
}

// Global Singleton Instance
export const debouncedStorage = new DebouncedStorageManager();

/**
 * Helper function for non-Zustand debounced localStorage writes
 */
export function debouncedLocalStorageSet(key: string, value: string): void {
  debouncedStorage.setItem(key, value);
}

/**
 * Helper function for non-Zustand cached localStorage reads
 */
export function debouncedLocalStorageGet(key: string): string | null {
  return debouncedStorage.getItem(key);
}

/**
 * Helper function to remove key
 */
export function debouncedLocalStorageRemove(key: string): void {
  debouncedStorage.removeItem(key);
}

/**
 * Explicit manual flush
 */
export function flushDebouncedStorage(): void {
  debouncedStorage.flush();
}
