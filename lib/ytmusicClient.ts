import YTMusic from 'ytmusic-api';

export interface YTMusicClientStatus {
  isInitialized: boolean;
  isInCooldown: boolean;
  cooldownRemainingSec: number;
  failureCount: number;
  lastFailureReason: string | null;
}

/**
 * Singleton & Resilient YTMusic Client Manager
 * 1. Guarantees a single shared YTMusic instance across all API routes.
 * 2. In-flight initialization deduplication (SingleFlight): prevents duplicate concurrent init calls.
 * 3. Non-blocking with 4s timeout: Never hangs API requests on ETIMEDOUT.
 * 4. Circuit Breaker / Cooldown (60s): After a failure or timeout, avoids retrying YouTube for 60 seconds,
 *    allowing search routes to instantly and smoothly serve fallback data (e.g. iTunes API) in ~50ms without error logs.
 */
class YTMusicClientManager {
  private instance: YTMusic;
  private isInitialized = false;
  private initPromise: Promise<boolean> | null = null;
  private lastFailureTime = 0;
  private failureCount = 0;
  private lastFailureReason: string | null = null;
  private cooldownDurationMs = 60000; // 60 seconds cooldown on connection failure
  private defaultTimeoutMs = 4000; // 4s timeout for initialization
  private operationTimeoutMs = 5000; // 5s timeout for API operations

  constructor() {
    this.instance = new YTMusic();
  }

  /**
   * Checks whether the client is currently in cooldown mode after a failure.
   */
  public isInCooldown(): boolean {
    if (this.lastFailureTime === 0) return false;
    return Date.now() - this.lastFailureTime < this.cooldownDurationMs;
  }

  /**
   * Safe lazy initialization with SingleFlight deduplication and non-blocking timeout.
   * Returns true if ready, or false if in cooldown / failed.
   */
  public async ensureInitialized(timeoutMs = this.defaultTimeoutMs): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    // Circuit Breaker: If in cooldown, fast-fail without attempting network call
    if (this.isInCooldown()) {
      return false;
    }

    // SingleFlight: Re-use active in-flight initialization promise
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('YTMusic initialization timed out (ETIMEDOUT protection)')), timeoutMs)
        );

        await Promise.race([this.instance.initialize(), timeoutPromise]);

        this.isInitialized = true;
        this.lastFailureTime = 0;
        this.failureCount = 0;
        this.lastFailureReason = null;
        return true;
      } catch (err: any) {
        this.isInitialized = false;
        this.lastFailureTime = Date.now();
        this.failureCount++;
        this.lastFailureReason = err?.message || 'Unknown network error';

        console.warn(
          `[YTMusicClient] ⚠️ Inisialisasi YTMusic gagal (${this.lastFailureReason}). Cooldown 60 detik diaktifkan; pencarian dialihkan otomatis ke tier cadangan.`
        );
        return false;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * Executes a YTMusic operation with strict timeout and graceful fallback to null.
   */
  private async executeSafe<T>(operation: (client: YTMusic) => Promise<T>, fallbackValue: T): Promise<T> {
    const ready = await this.ensureInitialized();
    if (!ready) {
      return fallbackValue;
    }

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('YTMusic operation timed out')), this.operationTimeoutMs)
      );

      return await Promise.race([operation(this.instance), timeoutPromise]);
    } catch (err: any) {
      console.warn(`[YTMusicClient] Operation warning: ${err?.message || err}. Beralih ke tier cadangan.`);
      return fallbackValue;
    }
  }

  // --- Safe Search Wrappers ---

  public async searchSongs(query: string): Promise<any[]> {
    return this.executeSafe((c) => c.searchSongs(query), []);
  }

  public async searchPlaylists(query: string): Promise<any[]> {
    return this.executeSafe((c) => c.searchPlaylists(query), []);
  }

  public async searchArtists(query: string): Promise<any[]> {
    return this.executeSafe((c) => c.searchArtists(query), []);
  }

  public async searchVideos(query: string): Promise<any[]> {
    return this.executeSafe((c) => c.searchVideos(query), []);
  }

  public async search(query: string): Promise<any[]> {
    return this.executeSafe((c) => c.search(query), []);
  }

  public async searchCombined(query: string): Promise<any[]> {
    const ready = await this.ensureInitialized();
    if (!ready) return [];

    try {
      const songs = await this.executeSafe((c) => c.searchSongs(query), []);
      const videos = await this.executeSafe((c) => c.searchVideos(query), []);
      const artists = await this.executeSafe((c) => c.searchArtists(query), []);
      return [...songs, ...videos, ...artists];
    } catch {
      return [];
    }
  }

  // --- Safe Metadata Wrappers ---

  public async getAlbum(id: string): Promise<any | null> {
    return this.executeSafe((c) => c.getAlbum(id), null);
  }

  public async getArtist(id: string): Promise<any | null> {
    return this.executeSafe((c) => c.getArtist(id), null);
  }

  public async getPlaylist(id: string): Promise<any | null> {
    return this.executeSafe((c) => c.getPlaylist(id), null);
  }

  public async getPlaylistVideos(id: string): Promise<any[]> {
    return this.executeSafe((c) => (c as any).getPlaylistVideos?.(id) || [], []);
  }

  public async getLyrics(id: string): Promise<any | null> {
    return this.executeSafe((c) => (c as any).getLyrics?.(id) || null, null);
  }

  public async getUpNexts(id: string): Promise<any[]> {
    return this.executeSafe((c) => (c as any).getUpNexts?.(id) || (c as any).getUpNext?.(id) || [], []);
  }

  public async getUpNext(id: string): Promise<any[]> {
    return this.getUpNexts(id);
  }

  public getRawInstance(): YTMusic {
    return this.instance;
  }

  public getStatus(): YTMusicClientStatus {
    const now = Date.now();
    const remainingMs = Math.max(0, this.cooldownDurationMs - (now - this.lastFailureTime));
    return {
      isInitialized: this.isInitialized,
      isInCooldown: this.isInCooldown(),
      cooldownRemainingSec: Math.ceil(remainingMs / 1000),
      failureCount: this.failureCount,
      lastFailureReason: this.lastFailureReason,
    };
  }
}

// Global singleton instance
export const ytmusicClient = new YTMusicClientManager();
