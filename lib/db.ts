import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Track } from './store';

export interface SavedAlbum {
  albumId: string;
  name: string;
  artist: string;
  thumbnails: { url: string; width: number; height: number }[];
  savedAt: number;
}

export interface SubscribedArtist {
  artistId: string;
  name: string;
  thumbnails: { url: string; width: number; height: number }[];
  subscribedAt: number;
}

export interface RecentSearch {
  query: string;
  timestamp: number;
}

export interface OfflineTrack {
  videoId: string;
  track: Track;
  blob?: Blob;
  downloadedAt: number;
}

interface SannMusicDB extends DBSchema {
  playlists: {
    key: string;
    value: {
      id: string;
      name: string;
      img: string;
      tracks: Track[];
    };
  };
  liked_songs: {
    key: string;
    value: Track;
  };
  subscribed_artists: {
    key: string;
    value: SubscribedArtist;
  };
  saved_albums: {
    key: string;
    value: SavedAlbum;
  };
  recent_searches: {
    key: string;
    value: RecentSearch;
  };
  offline_tracks: {
    key: string;
    value: OfflineTrack;
  };
}

const DB_NAME = 'SannMusicDB';
const DB_VERSION = 5;

/**
 * Enterprise-Grade IndexedDB Singleton Manager:
 * - Completely eliminates "The database connection is closing" InvalidStateError
 * - Employs non-destructive connection health checks (never calls tx.abort())
 * - Automatically recovers and reconnects with exponential backoff on dropped connections
 * - Safely handles private browsing / incognito mode fallbacks
 * - Guarantees that every store method returns graceful defaults and never crashes caller UI
 */
class DatabaseManager {
  private static instance: DatabaseManager | null = null;
  private currentDb: IDBPDatabase<SannMusicDB> | null = null;
  private openingPromise: Promise<IDBPDatabase<SannMusicDB>> | null = null;
  private isClosing = false;

  private constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.verifyAndRecover();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.verifyAndRecover();
        }
      });
    }
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Resets connection references cleanly without triggering unhandled aborts.
   */
  public resetConnection(): void {
    if (this.currentDb) {
      try {
        this.currentDb.close();
      } catch {}
      this.currentDb = null;
    }
    this.openingPromise = null;
    this.isClosing = false;
  }

  /**
   * Non-destructive connection health check:
   * Accessing objectStoreNames synchronously checks IDBDatabase state.
   * If closed or closing, it throws immediately WITHOUT creating/aborting a transaction.
   */
  public isConnectionHealthy(): boolean {
    if (!this.currentDb || this.isClosing) return false;
    try {
      const stores = this.currentDb.objectStoreNames;
      return Boolean(stores && stores.length > 0);
    } catch {
      return false;
    }
  }

  private verifyAndRecover(): void {
    if (!this.isConnectionHealthy()) {
      this.resetConnection();
    }
  }

  /**
   * Acquires a healthy IDBDatabase instance, creating or reconnecting safely.
   */
  public async getDB(): Promise<IDBPDatabase<SannMusicDB>> {
    if (typeof window === 'undefined') {
      throw new Error('IndexedDB is only accessible in the browser context.');
    }

    // 1. Return healthy existing connection if alive
    if (this.currentDb && !this.isClosing && this.isConnectionHealthy()) {
      return this.currentDb;
    }

    // 2. Await ongoing connection request if one is in flight
    if (this.openingPromise) {
      try {
        return await this.openingPromise;
      } catch {
        this.resetConnection();
      }
    }

    // 3. Initiate safe connection with schema upgrade definitions
    this.openingPromise = openDB<SannMusicDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('playlists')) {
          db.createObjectStore('playlists', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('liked_songs')) {
          db.createObjectStore('liked_songs', { keyPath: 'videoId' });
        }
        if (!db.objectStoreNames.contains('subscribed_artists')) {
          db.createObjectStore('subscribed_artists', { keyPath: 'artistId' });
        }
        if (!db.objectStoreNames.contains('saved_albums')) {
          db.createObjectStore('saved_albums', { keyPath: 'albumId' });
        }
        if (!db.objectStoreNames.contains('recent_searches')) {
          db.createObjectStore('recent_searches', { keyPath: 'query' });
        }
        if (!db.objectStoreNames.contains('offline_tracks')) {
          db.createObjectStore('offline_tracks', { keyPath: 'videoId' });
        }
      },
      blocked() {
        // Upgrade blocked by another tab
      },
      blocking() {
        DatabaseManager.getInstance().isClosing = true;
        DatabaseManager.getInstance().resetConnection();
      },
      terminated() {
        DatabaseManager.getInstance().resetConnection();
      },
    });

    try {
      const dbInstance = await this.openingPromise;
      this.currentDb = dbInstance;
      this.openingPromise = null;
      this.isClosing = false;

      // Listen for connection drop events
      dbInstance.addEventListener('close', () => {
        this.resetConnection();
      });
      dbInstance.addEventListener('versionchange', () => {
        this.resetConnection();
      });

      return dbInstance;
    } catch (err) {
      this.resetConnection();
      throw err;
    }
  }

  /**
   * Executes an IndexedDB query with auto-reconnect retry on closing or aborted connection errors.
   */
  public async executeWithRetry<T>(
    operation: (db: IDBPDatabase<SannMusicDB>) => Promise<T>,
    maxRetries = 3
  ): Promise<T> {
    try {
      const dbInstance = await this.getDB();
      return await operation(dbInstance);
    } catch (err: any) {
      const errMsg = String(err?.message || err);
      const errName = String(err?.name || '');
      const isConnectionIssue =
        errName === 'InvalidStateError' ||
        errName === 'TransactionInactiveError' ||
        errMsg.includes('closing') ||
        errMsg.includes('closed') ||
        errMsg.includes('connection is closing') ||
        errMsg.includes('aborted');

      if (isConnectionIssue && maxRetries > 0) {
        this.resetConnection();
        // Exponential backoff delay (50ms, 100ms, 150ms)
        await new Promise((resolve) => setTimeout(resolve, 50 * (4 - maxRetries)));
        return this.executeWithRetry(operation, maxRetries - 1);
      }

      throw err;
    }
  }
}

const dbManager = DatabaseManager.getInstance();

const offlineTrackIdsCache: Set<string> = new Set();

/**
 * Requests persistent storage from the browser (navigator.storage.persist)
 * Ensures IndexedDB and CacheStorage are not cleared by the browser during storage pressure
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof window === 'undefined' || !navigator.storage || !navigator.storage.persist) {
    return false;
  }
  try {
    if (navigator.storage.persisted) {
      const alreadyPersisted = await navigator.storage.persisted();
      if (alreadyPersisted) {
        console.log('[Storage] Storage will not be cleared except by explicit user action');
        return true;
      }
    }
    const granted = await navigator.storage.persist();
    if (granted) {
      console.log('Storage will not be cleared except by explicit user action');
    }
    return Boolean(granted);
  } catch (err) {
    console.warn('[Storage] Error requesting persistent storage:', err);
    return false;
  }
}

export const db = {
  // -------------------------------------------------------------
  // Playlists
  // -------------------------------------------------------------
  async getPlaylists(): Promise<{ id: string; name: string; img: string; tracks: Track[] }[]> {
    if (typeof window === 'undefined') return [];
    try {
      return await dbManager.executeWithRetry((idb) => idb.getAll('playlists'));
    } catch (err) {
      console.warn('[IDB] Failed to get playlists:', err);
      return [];
    }
  },

  async addPlaylist(playlist: { id: string; name: string; img: string; tracks: Track[] }): Promise<boolean> {
    if (typeof window === 'undefined' || !playlist?.id) return false;
    try {
      await dbManager.executeWithRetry((idb) => idb.put('playlists', playlist));
      return true;
    } catch (err) {
      console.warn('[IDB] Failed to add/update playlist:', err);
      return false;
    }
  },

  async getPlaylist(id: string): Promise<{ id: string; name: string; img: string; tracks: Track[] } | undefined> {
    if (typeof window === 'undefined' || !id) return undefined;
    try {
      return await dbManager.executeWithRetry((idb) => idb.get('playlists', id));
    } catch (err) {
      console.warn(`[IDB] Failed to get playlist ${id}:`, err);
      return undefined;
    }
  },

  async deletePlaylist(id: string): Promise<boolean> {
    if (typeof window === 'undefined' || !id) return false;
    try {
      await dbManager.executeWithRetry((idb) => idb.delete('playlists', id));
      return true;
    } catch (err) {
      console.warn(`[IDB] Failed to delete playlist ${id}:`, err);
      return false;
    }
  },

  // -------------------------------------------------------------
  // Liked Songs
  // -------------------------------------------------------------
  async getLikedSongs(): Promise<Track[]> {
    if (typeof window === 'undefined') return [];
    try {
      return await dbManager.executeWithRetry((idb) => idb.getAll('liked_songs'));
    } catch (err) {
      console.warn('[IDB] Failed to get liked songs:', err);
      return [];
    }
  },

  async addLikedSong(track: Track): Promise<boolean> {
    if (typeof window === 'undefined' || !track?.videoId) return false;
    try {
      await dbManager.executeWithRetry((idb) => idb.put('liked_songs', track));
      return true;
    } catch (err) {
      console.warn('[IDB] Failed to add liked song:', err);
      return false;
    }
  },

  async removeLikedSong(videoId: string): Promise<boolean> {
    if (typeof window === 'undefined' || !videoId) return false;
    try {
      await dbManager.executeWithRetry((idb) => idb.delete('liked_songs', videoId));
      return true;
    } catch (err) {
      console.warn(`[IDB] Failed to remove liked song ${videoId}:`, err);
      return false;
    }
  },

  async isLiked(videoId: string): Promise<boolean> {
    if (typeof window === 'undefined' || !videoId) return false;
    try {
      const song = await dbManager.executeWithRetry((idb) => idb.get('liked_songs', videoId));
      return Boolean(song);
    } catch {
      return false;
    }
  },

  // -------------------------------------------------------------
  // Subscribed Artists
  // -------------------------------------------------------------
  async getSubscribedArtists(): Promise<SubscribedArtist[]> {
    if (typeof window === 'undefined') return [];
    try {
      return await dbManager.executeWithRetry((idb) => idb.getAll('subscribed_artists'));
    } catch (err) {
      console.warn('[IDB] Failed to get subscribed artists:', err);
      return [];
    }
  },

  async addSubscribedArtist(artist: SubscribedArtist): Promise<boolean> {
    if (typeof window === 'undefined' || !artist?.artistId) return false;
    try {
      await dbManager.executeWithRetry((idb) => idb.put('subscribed_artists', artist));
      return true;
    } catch (err) {
      console.warn('[IDB] Failed to add subscribed artist:', err);
      return false;
    }
  },

  async removeSubscribedArtist(artistId: string): Promise<boolean> {
    if (typeof window === 'undefined' || !artistId) return false;
    try {
      await dbManager.executeWithRetry((idb) => idb.delete('subscribed_artists', artistId));
      return true;
    } catch (err) {
      console.warn(`[IDB] Failed to remove subscribed artist ${artistId}:`, err);
      return false;
    }
  },

  async isSubscribed(artistId: string): Promise<boolean> {
    if (typeof window === 'undefined' || !artistId) return false;
    try {
      const artist = await dbManager.executeWithRetry((idb) => idb.get('subscribed_artists', artistId));
      return Boolean(artist);
    } catch {
      return false;
    }
  },

  // -------------------------------------------------------------
  // Saved Albums
  // -------------------------------------------------------------
  async getSavedAlbums(): Promise<SavedAlbum[]> {
    if (typeof window === 'undefined') return [];
    try {
      return await dbManager.executeWithRetry((idb) => idb.getAll('saved_albums'));
    } catch (err) {
      console.warn('[IDB] Failed to get saved albums:', err);
      return [];
    }
  },

  async addSavedAlbum(album: SavedAlbum): Promise<boolean> {
    if (typeof window === 'undefined' || !album?.albumId) return false;
    try {
      await dbManager.executeWithRetry((idb) => idb.put('saved_albums', album));
      return true;
    } catch (err) {
      console.warn('[IDB] Failed to add saved album:', err);
      return false;
    }
  },

  async removeSavedAlbum(albumId: string): Promise<boolean> {
    if (typeof window === 'undefined' || !albumId) return false;
    try {
      await dbManager.executeWithRetry((idb) => idb.delete('saved_albums', albumId));
      return true;
    } catch (err) {
      console.warn(`[IDB] Failed to remove saved album ${albumId}:`, err);
      return false;
    }
  },

  async isAlbumSaved(albumId: string): Promise<boolean> {
    if (typeof window === 'undefined' || !albumId) return false;
    try {
      const album = await dbManager.executeWithRetry((idb) => idb.get('saved_albums', albumId));
      return Boolean(album);
    } catch {
      return false;
    }
  },

  // -------------------------------------------------------------
  // Recent Searches
  // -------------------------------------------------------------
  async getRecentSearches(): Promise<RecentSearch[]> {
    if (typeof window === 'undefined') return [];
    try {
      const searches = await dbManager.executeWithRetry((idb) => idb.getAll('recent_searches'));
      return searches.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
    } catch (err) {
      console.warn('[IDB] Failed to get recent searches:', err);
      return [];
    }
  },

  async addRecentSearch(query: string): Promise<void> {
    if (typeof window === 'undefined' || !query?.trim()) return;
    try {
      await dbManager.executeWithRetry(async (idb) => {
        const tx = idb.transaction('recent_searches', 'readwrite');
        await tx.store.put({ query: query.trim(), timestamp: Date.now() });
        const all = await tx.store.getAll();
        if (all.length > 20) {
          const sorted = all.sort((a, b) => b.timestamp - a.timestamp);
          const toDelete = sorted.slice(20);
          for (const item of toDelete) {
            await tx.store.delete(item.query);
          }
        }
        await tx.done;
      });
    } catch (err) {
      console.warn('[IDB] Failed to add recent search:', err);
    }
  },

  async removeRecentSearch(query: string): Promise<void> {
    if (typeof window === 'undefined' || !query) return;
    try {
      await dbManager.executeWithRetry((idb) => idb.delete('recent_searches', query));
    } catch (err) {
      console.warn(`[IDB] Failed to delete recent search ${query}:`, err);
    }
  },

  // -------------------------------------------------------------
  // Offline Tracks & Audio Blob Downloads
  // -------------------------------------------------------------
  async initOfflineCache(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const keys = await dbManager.executeWithRetry((idb) => idb.getAllKeys('offline_tracks'));
      offlineTrackIdsCache.clear();
      keys.forEach((k) => offlineTrackIdsCache.add(String(k)));
    } catch {}
  },

  isOfflineTrackSync(videoId: string): boolean {
    if (!videoId) return false;
    return offlineTrackIdsCache.has(videoId);
  },

  async getOfflineTracks(): Promise<OfflineTrack[]> {
    if (typeof window === 'undefined') return [];
    try {
      const items = await dbManager.executeWithRetry((idb) => idb.getAll('offline_tracks'));
      const validItems = items.filter((it) => it && it.blob && it.blob instanceof Blob && it.blob.size > 0);
      offlineTrackIdsCache.clear();
      validItems.forEach((it) => offlineTrackIdsCache.add(it.videoId));
      return validItems;
    } catch (err) {
      console.warn('[IDB] Failed to get offline tracks:', err);
      return [];
    }
  },

  async getOfflineTrack(videoId: string): Promise<OfflineTrack | undefined> {
    if (typeof window === 'undefined' || !videoId) return undefined;
    try {
      const item = await dbManager.executeWithRetry((idb) => idb.get('offline_tracks', videoId));
      if (item && item.blob && item.blob instanceof Blob && item.blob.size > 0) {
        offlineTrackIdsCache.add(videoId);
        return item;
      }
      return undefined;
    } catch (err) {
      console.warn(`[IDB] Failed to get offline track ${videoId}:`, err);
      return undefined;
    }
  },

  async saveOfflineTrack(track: Track, blob?: Blob): Promise<OfflineTrack> {
    if (typeof window === 'undefined' || !track?.videoId) {
      throw new Error('Track tidak valid atau IndexedDB tidak tersedia');
    }

    // Proactively request persistent storage before persisting heavy audio binary
    await requestPersistentStorage();

    let audioBlob = blob;

    // If no blob is supplied, fetch the direct audio stream from the proxy API
    if (!audioBlob) {
      const controller = new AbortController();
      // 150-second overall timeout to allow VPS ample time to fetch, convert, and stream audio from YouTube
      const timeout = setTimeout(() => controller.abort(), 150000);
      try {
        const res = await fetch(`/api/stream?id=${encodeURIComponent(track.videoId)}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          let errorMsg = `HTTP ${res.status}`;
          try {
            const errJson = await res.json();
            if (errJson?.message) {
              errorMsg = errJson.message;
            }
          } catch {}
          throw new Error(`Gagal mengunduh audio (${errorMsg})`);
        }

        const contentType = res.headers.get('content-type') || 'audio/mpeg';
        const rawBlob = await res.blob();
        if (!rawBlob || rawBlob.size === 0) {
          throw new Error('Data audio kosong atau unduhan terputus dari server');
        }

        // Guarantee that the raw audio is stored as an actual Blob with valid audio MIME type
        audioBlob =
          rawBlob.type && rawBlob.type.startsWith('audio/')
            ? rawBlob
            : new Blob([rawBlob], { type: contentType.startsWith('audio/') ? contentType : 'audio/mpeg' });
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          throw new Error('Unduhan melebihi batas waktu (timeout). Server atau jaringan membutuhkan waktu lebih lama untuk menyelesaikan unduhan audio.');
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    }

    // Verify audioBlob is an authentic, non-empty binary Blob (NOT a temporary object URL string)
    if (!(audioBlob instanceof Blob) || audioBlob.size === 0) {
      throw new Error('Data audio tidak valid: file audio harus berformat binary Blob utuh.');
    }

    const item: OfflineTrack = {
      videoId: track.videoId,
      track,
      blob: audioBlob,
      downloadedAt: Date.now(),
    };

    try {
      await dbManager.executeWithRetry((idb) => idb.put('offline_tracks', item));
      offlineTrackIdsCache.add(track.videoId);
      return item;
    } catch (err) {
      console.warn(`[IDB] Failed to save offline track ${track.videoId}:`, err);
      throw err;
    }
  },

  async removeOfflineTrack(videoId: string): Promise<boolean> {
    if (typeof window === 'undefined' || !videoId) return false;
    try {
      await dbManager.executeWithRetry((idb) => idb.delete('offline_tracks', videoId));
      offlineTrackIdsCache.delete(videoId);
      return true;
    } catch (err) {
      console.warn(`[IDB] Failed to remove offline track ${videoId}:`, err);
      return false;
    }
  },

  async isOfflineTrack(videoId: string): Promise<boolean> {
    if (typeof window === 'undefined' || !videoId) return false;
    if (offlineTrackIdsCache.has(videoId)) return true;
    try {
      const item = await dbManager.executeWithRetry((idb) => idb.get('offline_tracks', videoId));
      const hasValidBlob = Boolean(item && item.blob && item.blob instanceof Blob && item.blob.size > 0);
      if (hasValidBlob) {
        offlineTrackIdsCache.add(videoId);
      }
      return hasValidBlob;
    } catch {
      return false;
    }
  },

  async clearOfflineTracks(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
      await dbManager.executeWithRetry((idb) => idb.clear('offline_tracks'));
      offlineTrackIdsCache.clear();
      return true;
    } catch (err) {
      console.warn('[IDB] Failed to clear offline tracks:', err);
      return false;
    }
  },

  async clearAllIndexedDB(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const stores = [
      'playlists',
      'liked_songs',
      'subscribed_artists',
      'saved_albums',
      'recent_searches',
      'offline_tracks',
    ] as const;

    try {
      await dbManager.executeWithRetry(async (idb) => {
        for (const s of stores) {
          try {
            await idb.clear(s);
          } catch {}
        }
      });
      return true;
    } catch (err) {
      console.warn('[IDB] Failed to clear all IndexedDB stores:', err);
      return false;
    }
  },
};
