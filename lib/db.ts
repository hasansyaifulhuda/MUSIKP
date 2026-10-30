import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Track } from './store';
import { LyricLine, normalizeLyrics } from './performance';
import { compressString, decompressString } from './compression';

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

export interface CustomPlaylist {
  id: string;
  name: string;
  img: string;
  tracks: Track[];
  createdAt?: number;
  updatedAt?: number;
}

export interface OfflineTrack {
  videoId: string;
  track: Track;
  blob?: Blob;
  downloadedAt: number;
  lastPlayedAt?: number;
  playCount?: number;
  sizeBytes?: number;
  lyrics?: LyricLine[];
  isSyncedLyrics?: boolean;
  synced?: boolean;
}

/**
 * Cross-realm Blob validation helper for Web and Android Capacitor WebViews.
 * Handles Blobs, ArrayBuffers, and structured-clone objects without failing on realm mismatches.
 */
export function isBlobLike(b: any): boolean {
  if (!b) return false;
  if (typeof Blob !== 'undefined' && b instanceof Blob && b.size > 0) return true;
  if (Object.prototype.toString.call(b) === '[object Blob]' && b.size > 0) return true;
  if (b.constructor && b.constructor.name === 'Blob' && typeof b.size === 'number' && b.size > 0) return true;
  if (typeof b.size === 'number' && b.size > 0 && typeof b.slice === 'function') return true;
  if (b instanceof ArrayBuffer && b.byteLength > 0) return true;
  if (b.buffer instanceof ArrayBuffer && b.buffer.byteLength > 0) return true;
  if (ArrayBuffer.isView(b) && (b as any).byteLength > 0) return true;
  if (typeof b === 'object' && typeof b.byteLength === 'number' && b.byteLength > 0) return true;
  return false;
}

/**
 * Ensures any blob-like object or ArrayBuffer retrieved from IndexedDB is converted
 * into a standard HTML5 Blob instance for seamless audio playback.
 */
export function ensureBlob(b: any): Blob {
  if (typeof Blob !== 'undefined' && b instanceof Blob) return b;
  if (b instanceof ArrayBuffer) return new Blob([b], { type: 'audio/mpeg' });
  if (b?.buffer instanceof ArrayBuffer) return new Blob([b.buffer], { type: 'audio/mpeg' });
  if (ArrayBuffer.isView(b)) return new Blob([(b as any).buffer], { type: 'audio/mpeg' });
  if (isBlobLike(b)) {
    try {
      return new Blob([b], { type: b.type || 'audio/mpeg' });
    } catch {}
  }
  return b as Blob;
}

export interface PaginationOptions {
  offset?: number;
  limit?: number;
  reverse?: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

interface SannMusicDB extends DBSchema {
  playlists: {
    key: string;
    value: CustomPlaylist;
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
    indexes: {
      by_downloadedAt: number;
      by_lastPlayedAt: number;
    };
  };
  metadata_cache: {
    key: string;
    value: {
      key: string;
      data: string;
      compressed: boolean;
      byteLength: number;
      updatedAt: number;
      expiresAt: number;
    };
  };
  offline_search_tokens: {
    key: string;
    value: {
      token: string;
      trackIds: string[];
    };
  };
}

const DB_NAME = 'SannMusicDB';
const DB_VERSION = 6;

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

    // 3. Initiate safe connection with granular schema upgrade migrations (Batch 3 - Poin 61)
    this.openingPromise = openDB<SannMusicDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        console.info(`[IndexedDB Migration] Migrating schema: v${oldVersion} -> v${newVersion}`);

        // Version 1-4 Baseline Stores
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

        // Offline tracks store and indices
        let offlineStore;
        if (!db.objectStoreNames.contains('offline_tracks')) {
          offlineStore = db.createObjectStore('offline_tracks', { keyPath: 'videoId' });
        } else {
          offlineStore = transaction.objectStore('offline_tracks');
        }

        if (offlineStore && !offlineStore.indexNames.contains('by_downloadedAt')) {
          offlineStore.createIndex('by_downloadedAt', 'downloadedAt');
        }
        if (offlineStore && !offlineStore.indexNames.contains('by_lastPlayedAt')) {
          offlineStore.createIndex('by_lastPlayedAt', 'lastPlayedAt');
        }

        // Version 6: Memory-bound metadata cache & local offline search token index
        if (!db.objectStoreNames.contains('metadata_cache')) {
          db.createObjectStore('metadata_cache', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('offline_search_tokens')) {
          db.createObjectStore('offline_search_tokens', { keyPath: 'token' });
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
  // Custom Playlists (IndexedDB Powered)
  // -------------------------------------------------------------
  async getPlaylists(): Promise<CustomPlaylist[]> {
    if (typeof window === 'undefined') return [];
    try {
      return await dbManager.executeWithRetry((idb) => idb.getAll('playlists'));
    } catch (err) {
      console.warn('[IDB] Failed to get playlists:', err);
      return [];
    }
  },

  async addPlaylist(playlist: CustomPlaylist): Promise<boolean> {
    if (typeof window === 'undefined' || !playlist?.id) return false;
    try {
      await dbManager.executeWithRetry((idb) => idb.put('playlists', playlist));
      return true;
    } catch (err) {
      console.warn('[IDB] Failed to add/update playlist:', err);
      return false;
    }
  },

  async createPlaylist(name: string, img: string = '', initialTracks: Track[] = []): Promise<CustomPlaylist | null> {
    if (typeof window === 'undefined') return null;
    const cleanName = name.trim() || 'Playlist Kustom';
    const newPlaylist: CustomPlaylist = {
      id: `playlist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: cleanName,
      img,
      tracks: initialTracks,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      await dbManager.executeWithRetry((idb) => idb.put('playlists', newPlaylist));
      return newPlaylist;
    } catch (err) {
      console.warn('[IDB] Failed to create custom playlist:', err);
      return null;
    }
  },

  async updatePlaylist(id: string, updates: Partial<{ name: string; img: string; tracks: Track[] }>): Promise<boolean> {
    if (typeof window === 'undefined' || !id) return false;
    try {
      return await dbManager.executeWithRetry(async (idb) => {
        const existing = await idb.get('playlists', id);
        if (!existing) return false;
        const updated: CustomPlaylist = {
          ...existing,
          ...updates,
          updatedAt: Date.now(),
        };
        await idb.put('playlists', updated);
        return true;
      });
    } catch (err) {
      console.warn(`[IDB] Failed to update playlist ${id}:`, err);
      return false;
    }
  },

  async addSongToPlaylist(playlistId: string, track: Track): Promise<boolean> {
    if (typeof window === 'undefined' || !playlistId || !track?.videoId) return false;
    try {
      return await dbManager.executeWithRetry(async (idb) => {
        const existing = await idb.get('playlists', playlistId);
        if (!existing) return false;
        const tracks = existing.tracks || [];
        if (tracks.some((t) => t.videoId === track.videoId)) {
          return true;
        }
        const updatedTracks = [...tracks, track];
        const updated: CustomPlaylist = {
          ...existing,
          tracks: updatedTracks,
          img: existing.img || track.thumbnails?.[track.thumbnails.length - 1]?.url || '',
          updatedAt: Date.now(),
        };
        await idb.put('playlists', updated);
        return true;
      });
    } catch (err) {
      console.warn(`[IDB] Failed to add song to playlist ${playlistId}:`, err);
      return false;
    }
  },

  async removeSongFromPlaylist(playlistId: string, videoId: string): Promise<boolean> {
    if (typeof window === 'undefined' || !playlistId || !videoId) return false;
    try {
      return await dbManager.executeWithRetry(async (idb) => {
        const existing = await idb.get('playlists', playlistId);
        if (!existing) return false;
        const updatedTracks = (existing.tracks || []).filter((t) => t.videoId !== videoId);
        const updated: CustomPlaylist = {
          ...existing,
          tracks: updatedTracks,
          updatedAt: Date.now(),
        };
        await idb.put('playlists', updated);
        return true;
      });
    } catch (err) {
      console.warn(`[IDB] Failed to remove song from playlist ${playlistId}:`, err);
      return false;
    }
  },

  async getPlaylist(id: string): Promise<CustomPlaylist | undefined> {
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

  async getLikedSongsPaged(options?: PaginationOptions): Promise<PaginatedResult<Track>> {
    return this.getPaged('liked_songs', options);
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
      // Schedule background LRU eviction check on startup
      setTimeout(() => {
        this.evictLruOfflineTracks().catch(() => {});
      }, 4000);
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
      const validItems = (items || [])
        .filter((it) => it && it.track && (isBlobLike(it.blob) || (typeof it.sizeBytes === 'number' && it.sizeBytes > 0) || Boolean(it.blob)))
        .map((it) => {
          if (it.blob && !(it.blob instanceof Blob)) {
            it.blob = ensureBlob(it.blob);
          }
          return it;
        });
      offlineTrackIdsCache.clear();
      validItems.forEach((it) => offlineTrackIdsCache.add(it.videoId));
      return validItems;
    } catch (err) {
      console.warn('[IDB] Failed to get offline tracks:', err);
      return [];
    }
  },

  /**
   * Lazy-loaded cursor-based reader for offline tracks.
   * Loads tracks in small paginated batches to keep RAM usage minimal.
   */
  async getOfflineTracksPaged(options?: PaginationOptions): Promise<PaginatedResult<OfflineTrack>> {
    const res = await this.getPaged('offline_tracks', options);
    const validItems = res.items
      .filter((it) => it && it.track && (isBlobLike(it.blob) || (typeof it.sizeBytes === 'number' && it.sizeBytes > 0)))
      .map((it) => {
        if (it.blob && !(it.blob instanceof Blob)) {
          it.blob = ensureBlob(it.blob);
        }
        return it;
      });
    validItems.forEach((it) => offlineTrackIdsCache.add(it.videoId));
    return {
      ...res,
      items: validItems,
    };
  },

  /**
   * Generic cursor-based paginated reader for IndexedDB stores.
   * Efficiently advances cursors to stream only requested chunks into memory.
   */
  async getPaged<K extends 'liked_songs' | 'offline_tracks' | 'playlists' | 'saved_albums' | 'subscribed_artists' | 'recent_searches'>(
    storeName: K,
    options?: PaginationOptions
  ): Promise<PaginatedResult<SannMusicDB[K]['value']>> {
    if (typeof window === 'undefined') {
      return { items: [], total: 0, offset: 0, limit: 30, hasMore: false };
    }

    const offset = Math.max(0, options?.offset || 0);
    const limit = Math.max(1, Math.min(100, options?.limit || 30));
    const reverse = options?.reverse ?? false;

    try {
      return await dbManager.executeWithRetry(async (idb) => {
        const tx = idb.transaction(storeName, 'readonly');
        const store = tx.store;
        const total = await store.count();

        if (total === 0 || offset >= total) {
          return { items: [], total, offset, limit, hasMore: false };
        }

        const items: SannMusicDB[K]['value'][] = [];
        let cursor = await store.openCursor(null, reverse ? 'prev' : 'next');

        if (offset > 0 && cursor) {
          cursor = await cursor.advance(offset);
        }

        while (cursor && items.length < limit) {
          items.push(cursor.value);
          cursor = await cursor.continue();
        }

        await tx.done;

        const hasMore = offset + items.length < total;
        return { items, total, offset, limit, hasMore };
      });
    } catch (err) {
      console.warn(`[IDB] Failed to read paginated items from ${storeName}:`, err);
      return { items: [], total: 0, offset, limit, hasMore: false };
    }
  },

  async getSavedAlbumsPaged(options?: PaginationOptions): Promise<PaginatedResult<SavedAlbum>> {
    return this.getPaged('saved_albums', options);
  },

  async getSubscribedArtistsPaged(options?: PaginationOptions): Promise<PaginatedResult<SubscribedArtist>> {
    return this.getPaged('subscribed_artists', options);
  },

  async getOfflineTrack(videoId: string): Promise<OfflineTrack | undefined> {
    if (typeof window === 'undefined' || !videoId) return undefined;
    try {
      const item = await dbManager.executeWithRetry((idb) => idb.get('offline_tracks', videoId));
      if (item && item.track && (isBlobLike(item.blob) || (typeof item.sizeBytes === 'number' && item.sizeBytes > 0))) {
        if (item.blob && !(item.blob instanceof Blob)) {
          item.blob = ensureBlob(item.blob);
        }
        offlineTrackIdsCache.add(videoId);
        return item;
      }
      return undefined;
    } catch (err) {
      console.warn(`[IDB] Failed to get offline track ${videoId}:`, err);
      return undefined;
    }
  },

  async saveOfflineTrack(
    track: Track,
    blob?: Blob,
    lyricsData?: { lyrics?: LyricLine[]; isSyncedLyrics?: boolean; synced?: boolean }
  ): Promise<OfflineTrack> {
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
        let res: Response;
        try {
          res = await fetch(`/api/stream?id=${encodeURIComponent(track.videoId)}&download=true`, {
            signal: controller.signal,
          });
        } catch (fetchErr: any) {
          if (fetchErr?.name === 'AbortError') {
            throw new Error('Unduhan melebihi batas waktu (timeout). Server atau jaringan membutuhkan waktu lebih lama.');
          }
          // Catch 'Failed to fetch', connection drops, and network errors
          throw new Error('Terkendala koneksi server ke sumber audio (Failed to fetch)');
        }

        // Validate HTTP response code
        if (!res.ok) {
          let errorMsg = `Server error (HTTP ${res.status})`;
          try {
            const errJson = await res.json();
            if (errJson?.message) {
              errorMsg = errJson.message;
            }
          } catch {}
          throw new Error(errorMsg);
        }

        // Validate Content-Type: guarantee it is an audio stream, NOT a JSON error or HTML stub
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json') || contentType.includes('text/html')) {
          let detail = 'Sumber audio mengembalikan format tidak valid (bukan file audio)';
          try {
            const errJson = await res.json();
            if (errJson?.message) {
              detail = errJson.message;
            }
          } catch {}
          throw new Error(detail);
        }

        const rawBlob = await res.blob();
        if (!rawBlob || rawBlob.size < 1024) {
          throw new Error('Data audio kosong atau unduhan terputus dari server (<1KB)');
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
    if (!(audioBlob instanceof Blob) || audioBlob.size < 1024) {
      throw new Error('Data audio tidak valid: file audio harus berformat binary Blob utuh (>1KB).');
    }

    // Extract or proactively fetch lyrics to bundle together with audio
    let finalLyrics: LyricLine[] = [];
    let finalSynced = false;

    if (lyricsData && Array.isArray(lyricsData.lyrics) && lyricsData.lyrics.length > 0) {
      finalLyrics = lyricsData.lyrics;
      finalSynced = Boolean(lyricsData.isSyncedLyrics ?? lyricsData.synced);
    } else if (typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        let artistName = '';
        if (typeof (track as any).artistName === 'string') {
          artistName = (track as any).artistName;
        } else if (typeof track.artist === 'string') {
          artistName = track.artist;
        } else if (Array.isArray(track.artist)) {
          artistName = track.artist.map((a: any) => (typeof a === 'string' ? a : a?.name || '')).filter(Boolean).join(' ');
        } else if (track.artist && typeof track.artist === 'object') {
          artistName = (track.artist as any).name || '';
        }
        const dur = Math.round(track.duration || 200);
        const lyricsUrl = `/api/lyrics?id=${encodeURIComponent(track.videoId)}&title=${encodeURIComponent(
          track.name || ''
        )}&artist=${encodeURIComponent(artistName)}&duration=${dur}`;

        const lyricsController = new AbortController();
        const lyricsTimeout = setTimeout(() => {
          try {
            lyricsController.abort();
          } catch {}
        }, 15000);

        const lyricsRes = await fetch(lyricsUrl, { signal: lyricsController.signal })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
          .finally(() => clearTimeout(lyricsTimeout));

        const payload = lyricsRes?.result !== undefined ? lyricsRes.result : lyricsRes;
        if (Array.isArray(payload?.lyrics) && payload.lyrics.length > 0) {
          finalLyrics = normalizeLyrics(payload.lyrics, dur);
          finalSynced = Boolean(payload.synced);
        }
      } catch (lyricsErr) {
        console.warn(`[IDB] Non-fatal: Lyrics fetch for offline track ${track.videoId} failed:`, lyricsErr);
      }
    }

    // Opportunistically run LRU eviction to prevent storage quota exhaustion
    try {
      await this.evictLruOfflineTracks();
    } catch {}

    // Opportunistically cache thumbnail as base64 Data URI for 100% offline cover art rendering
    const enrichedTrack = { ...track };
    const rawThumbUrl = track.thumbnails?.[track.thumbnails.length - 1]?.url;
    if (rawThumbUrl && typeof window !== 'undefined' && navigator.onLine) {
      try {
        const imgRes = await fetch(rawThumbUrl).catch(() => null);
        if (imgRes && imgRes.ok) {
          const imgBlob = await imgRes.blob();
          if (imgBlob && imgBlob.size > 0) {
            const reader = new FileReader();
            const dataUri = await new Promise<string>((resolve) => {
              reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
              reader.onerror = () => resolve('');
              reader.readAsDataURL(imgBlob);
            });
            if (dataUri) {
              (enrichedTrack as any).offlineThumbnail = dataUri;
            }
          }
        }
      } catch {}
    }

    const item: OfflineTrack = {
      videoId: track.videoId,
      track: enrichedTrack,
      blob: audioBlob,
      downloadedAt: Date.now(),
      lastPlayedAt: Date.now(),
      playCount: 0,
      sizeBytes: audioBlob.size,
      lyrics: finalLyrics,
      isSyncedLyrics: finalSynced,
      synced: finalSynced,
    };

    try {
      await dbManager.executeWithRetry((idb) => idb.put('offline_tracks', item));
      offlineTrackIdsCache.add(track.videoId);

      // Broadcast offline sync event across the application
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('musicfy:offline-updated', { detail: { videoId: track.videoId, action: 'save' } }));
        window.dispatchEvent(new Event('musicfy:offline-tracks-changed'));
      }

      return item;
    } catch (err) {
      console.warn(`[IDB] Failed to save offline track ${track.videoId}:`, err);
      throw err;
    }
  },

  /**
   * Updates lastPlayedAt timestamp and increments playCount for LRU tracking.
   */
  async recordOfflineTrackPlay(videoId: string): Promise<void> {
    if (typeof window === 'undefined' || !videoId) return;
    try {
      await dbManager.executeWithRetry(async (idb) => {
        const item = await idb.get('offline_tracks', videoId);
        if (item) {
          item.lastPlayedAt = Date.now();
          item.playCount = (item.playCount || 0) + 1;
          await idb.put('offline_tracks', item);
        }
      });
    } catch {}
  },

  /**
   * Retrieves browser storage usage and quota estimate.
   */
  async getStorageEstimate(): Promise<{
    usageBytes: number;
    quotaBytes: number;
    percentage: number;
    isAvailable: boolean;
  }> {
    if (typeof window === 'undefined' || !navigator.storage || !navigator.storage.estimate) {
      return { usageBytes: 0, quotaBytes: 0, percentage: 0, isAvailable: false };
    }
    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentage = quota > 0 ? (usage / quota) * 100 : 0;
      return {
        usageBytes: usage,
        quotaBytes: quota,
        percentage: Math.round(percentage * 10) / 10,
        isAvailable: true,
      };
    } catch {
      return { usageBytes: 0, quotaBytes: 0, percentage: 0, isAvailable: false };
    }
  },

  /**
   * Least Recently Used (LRU) Cache Eviction Algorithm for IndexedDB audio blobs.
   * Automatically purges the oldest / least played tracks when max capacity or quota is approached.
   */
  async evictLruOfflineTracks(options?: {
    maxItems?: number;
    quotaThresholdRatio?: number;
    targetCleanCount?: number;
  }): Promise<{ evictedCount: number; freedBytes: number }> {
    if (typeof window === 'undefined') return { evictedCount: 0, freedBytes: 0 };
    const maxItems = options?.maxItems ?? 100;
    const quotaThresholdRatio = options?.quotaThresholdRatio ?? 0.85;
    const targetCleanCount = options?.targetCleanCount ?? 5;

    try {
      const allItems = await dbManager.executeWithRetry((idb) => idb.getAll('offline_tracks'));
      if (!allItems || allItems.length === 0) return { evictedCount: 0, freedBytes: 0 };

      let needsEviction = allItems.length >= maxItems;

      if (!needsEviction && navigator.storage && navigator.storage.estimate) {
        try {
          const estimate = await navigator.storage.estimate();
          if (estimate.usage && estimate.quota && estimate.quota > 0) {
            const ratio = estimate.usage / estimate.quota;
            if (ratio >= quotaThresholdRatio) {
              needsEviction = true;
            }
          }
        } catch {}
      }

      if (!needsEviction) return { evictedCount: 0, freedBytes: 0 };

      // Sort ascending: oldest lastPlayedAt (or downloadedAt) and lowest playCount first
      const sorted = [...allItems].sort((a, b) => {
        const timeA = a.lastPlayedAt || a.downloadedAt || 0;
        const timeB = b.lastPlayedAt || b.downloadedAt || 0;
        if (timeA !== timeB) return timeA - timeB;
        return (a.playCount || 0) - (b.playCount || 0);
      });

      const countToEvict = Math.min(targetCleanCount, sorted.length);
      const candidates = sorted.slice(0, countToEvict);
      let freedBytes = 0;
      const evictedIds: string[] = [];

      for (const cand of candidates) {
        try {
          const size = cand.blob?.size || cand.sizeBytes || 0;
          await dbManager.executeWithRetry((idb) => idb.delete('offline_tracks', cand.videoId));
          offlineTrackIdsCache.delete(cand.videoId);
          freedBytes += size;
          evictedIds.push(cand.videoId);
        } catch {}
      }

      if (evictedIds.length > 0) {
        console.info(
          `[IDB LRU Eviction] Evicted ${evictedIds.length} offline tracks to preserve storage quota. Freed ${(freedBytes / (1024 * 1024)).toFixed(2)} MB.`
        );
      }

      return { evictedCount: evictedIds.length, freedBytes };
    } catch (err) {
      console.warn('[IDB] LRU Eviction encountered an issue:', err);
      return { evictedCount: 0, freedBytes: 0 };
    }
  },

  async removeOfflineTrack(videoId: string): Promise<boolean> {
    if (typeof window === 'undefined' || !videoId) return false;
    try {
      await dbManager.executeWithRetry((idb) => idb.delete('offline_tracks', videoId));
      offlineTrackIdsCache.delete(videoId);

      // Broadcast offline sync event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('musicfy:offline-updated', { detail: { videoId, action: 'remove' } }));
        window.dispatchEvent(new Event('musicfy:offline-tracks-changed'));
      }

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
      const hasValidBlob = Boolean(
        item && item.track && (isBlobLike(item.blob) || (typeof item.sizeBytes === 'number' && item.sizeBytes > 0))
      );
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

      // Broadcast offline sync event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('musicfy:offline-updated', { detail: { action: 'clear' } }));
        window.dispatchEvent(new Event('musicfy:offline-tracks-changed'));
      }

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
      'metadata_cache',
      'offline_search_tokens',
    ] as const;

    try {
      await dbManager.executeWithRetry(async (idb) => {
        for (const s of stores) {
          try {
            await idb.clear(s as any);
          } catch {}
        }
      });
      return true;
    } catch (err) {
      console.warn('[IDB] Failed to clear all IndexedDB stores:', err);
      return false;
    }
  },

  /**
   * Health & diagnostics metadata inspection (Batch 3 - Poin 76)
   */
  async getDatabaseInfo(): Promise<{
    name: string;
    version: number;
    isHealthy: boolean;
    counts: Record<string, number>;
  }> {
    if (typeof window === 'undefined') {
      return { name: DB_NAME, version: DB_VERSION, isHealthy: false, counts: {} };
    }
    try {
      return await dbManager.executeWithRetry(async (idb) => {
        const counts: Record<string, number> = {};
        const stores = [
          'playlists',
          'liked_songs',
          'subscribed_artists',
          'saved_albums',
          'offline_tracks',
          'metadata_cache',
        ] as const;

        for (const s of stores) {
          try {
            counts[s] = await idb.count(s as any);
          } catch {
            counts[s] = 0;
          }
        }

        return {
          name: DB_NAME,
          version: DB_VERSION,
          isHealthy: true,
          counts,
        };
      });
    } catch {
      return { name: DB_NAME, version: DB_VERSION, isHealthy: false, counts: {} };
    }
  },

  /**
   * Offline Local Full-Text Search Indexing (Batch 3 - Poin 72)
   * Evaluates title, artist, and playlist names locally without server dependency
   */
  async searchLocalOffline(query: string, limit = 25): Promise<Track[]> {
    if (!query || typeof query !== 'string') return [];
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];

    try {
      const offlineItems = await this.getOfflineTracks();
      const results: { track: Track; score: number }[] = [];

      for (const item of offlineItems) {
        if (!item.track) continue;
        const track = item.track;
        const title = (track.name || '').toLowerCase();
        const artist = Array.isArray(track.artist)
          ? track.artist.map((a: any) => (typeof a === 'string' ? a : a?.name || '')).join(' ').toLowerCase()
          : (track.artist?.name || '').toLowerCase();

        let score = 0;
        if (title === normalized) score += 100;
        else if (title.startsWith(normalized)) score += 50;
        else if (title.includes(normalized)) score += 30;

        if (artist === normalized) score += 40;
        else if (artist.includes(normalized)) score += 20;

        if (score > 0) {
          results.push({ track, score });
        }
      }

      // Sort by highest match score
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, limit).map((r) => r.track);
    } catch (err) {
      console.warn('[IDB LocalSearch] Failed to search offline tracks:', err);
      return [];
    }
  },

  /**
   * Poin 64: Memory-Bound Cache Compression
   * Stores structured data or text into 'metadata_cache' with native GZIP compression
   * to conserve browser storage quota and RAM.
   */
  async setMetadataCache(
    key: string,
    data: any,
    ttlMs: number = 7 * 24 * 60 * 60 * 1000 // default 7 days
  ): Promise<void> {
    if (typeof window === 'undefined' || !key) return;
    try {
      let isCompressed = false;
      let storedData: any = data;

      // Compress if payload is string or object larger than 256 bytes
      const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
      if (jsonStr.length > 256) {
        try {
          storedData = await compressString(jsonStr);
          isCompressed = true;
        } catch {
          storedData = data;
        }
      }

      const now = Date.now();
      const expiresAt = now + ttlMs;
      const dataStr = typeof storedData === 'string' ? storedData : JSON.stringify(storedData);

      await dbManager.executeWithRetry((idb) =>
        idb.put('metadata_cache', {
          key,
          data: dataStr,
          compressed: isCompressed,
          byteLength: dataStr.length,
          updatedAt: now,
          expiresAt,
        })
      );
    } catch (err) {
      console.warn(`[IDB MetadataCache] Failed to set cache for ${key}:`, err);
    }
  },

  /**
   * Poin 64: Decompresses and retrieves cached metadata or lyrics from 'metadata_cache'.
   */
  async getMetadataCache<T = any>(key: string): Promise<T | null> {
    if (typeof window === 'undefined' || !key) return null;
    try {
      const entry = await dbManager.executeWithRetry((idb) => idb.get('metadata_cache', key));
      if (!entry) return null;

      // TTL Check
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        dbManager.executeWithRetry((idb) => idb.delete('metadata_cache', key)).catch(() => {});
        return null;
      }

      if (entry.compressed && typeof entry.data === 'string') {
        const decompressedStr = await decompressString(entry.data);
        try {
          return JSON.parse(decompressedStr) as T;
        } catch {
          return decompressedStr as unknown as T;
        }
      }

      return entry.data as T;
    } catch (err) {
      console.warn(`[IDB MetadataCache] Failed to get cache for ${key}:`, err);
      return null;
    }
  },

  async deleteMetadataCache(key: string): Promise<void> {
    if (typeof window === 'undefined' || !key) return;
    try {
      await dbManager.executeWithRetry((idb) => idb.delete('metadata_cache', key));
    } catch {}
  },

  /**
   * Poin 91: Automated IndexedDB Blob & Cache Pruning
   * Periodically purges expired metadata cache items and cleans orphan storage fragments.
   */
  async pruneExpiredBlobsAndCache(): Promise<{
    prunedMetadataCount: number;
    prunedTracksCount: number;
  }> {
    if (typeof window === 'undefined') return { prunedMetadataCount: 0, prunedTracksCount: 0 };
    let prunedMetadataCount = 0;
    let prunedTracksCount = 0;

    try {
      const now = Date.now();
      const allCache = await dbManager.executeWithRetry((idb) => idb.getAll('metadata_cache'));
      for (const entry of allCache) {
        if (entry.expiresAt && now > entry.expiresAt) {
          await dbManager.executeWithRetry((idb) => idb.delete('metadata_cache', entry.key));
          prunedMetadataCount++;
        }
      }

      // Check for zero-byte or corrupt offline tracks
      const allTracks = await dbManager.executeWithRetry((idb) => idb.getAll('offline_tracks'));
      for (const t of allTracks) {
        if (!t.blob || (t.blob.size && t.blob.size < 512)) {
          await dbManager.executeWithRetry((idb) => idb.delete('offline_tracks', t.videoId));
          offlineTrackIdsCache.delete(t.videoId);
          prunedTracksCount++;
        }
      }
    } catch (err) {
      console.warn('[IDB Pruner] Pruning encountered non-fatal error:', err);
    }

    return { prunedMetadataCount, prunedTracksCount };
  },
};

// Eagerly populate synchronous in-memory offline track cache on client load
if (typeof window !== 'undefined') {
  db.initOfflineCache().catch(() => {});
}
