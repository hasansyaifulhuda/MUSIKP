import { LyricLine } from './performance';
import { db } from './db';

export interface CachedLyrics {
  lyrics: LyricLine[];
  synced: boolean;
  provider?: string;
  timestamp?: number;
}

const LOCAL_STORAGE_PREFIX = 'musicfy_lyrics_';
const MAX_LOCAL_STORAGE_ITEMS = 60;

// Tier 0: In-Memory Map Cache for instantaneous (0ms) access during playback session
export const inMemoryLyricsCache = new Map<string, CachedLyrics>();

/**
 * Synchronous Fast Cache Lookup:
 * 1. Checks in-memory cache (0.01ms)
 * 2. Checks localStorage (<1ms)
 * Returns instantly before any network call or async IDB transaction.
 */
export function getFastCachedLyrics(videoId: string): CachedLyrics | null {
  if (!videoId) return null;

  // 1. In-Memory Map
  const mem = inMemoryLyricsCache.get(videoId);
  if (mem && Array.isArray(mem.lyrics) && mem.lyrics.length > 0) {
    return mem;
  }

  // 2. LocalStorage (Synchronous)
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${videoId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.lyrics) && parsed.lyrics.length > 0) {
          const item: CachedLyrics = {
            lyrics: parsed.lyrics,
            synced: Boolean(parsed.synced),
            provider: parsed.provider,
            timestamp: parsed.timestamp,
          };
          // Warm up in-memory map
          inMemoryLyricsCache.set(videoId, item);
          return item;
        }
      }
    } catch {
      // Ignore parse or storage errors
    }
  }

  return null;
}

/**
 * Asynchronous Deep Cache Lookup:
 * Checks IndexedDB (Offline Downloads + Compressed Metadata Cache).
 * Warmed up into in-memory and localStorage when found.
 */
export async function getDeepCachedLyrics(videoId: string): Promise<CachedLyrics | null> {
  if (!videoId || typeof window === 'undefined') return null;

  try {
    // 1. Check Offline Saved Track
    const offlineItem = await db.getOfflineTrack(videoId);
    if (offlineItem && Array.isArray(offlineItem.lyrics) && offlineItem.lyrics.length > 0) {
      const item: CachedLyrics = {
        lyrics: offlineItem.lyrics,
        synced: Boolean(offlineItem.isSyncedLyrics ?? offlineItem.synced),
        provider: 'Offline Storage',
      };
      saveFastCachedLyrics(videoId, item.lyrics, item.synced, item.provider);
      return item;
    }
  } catch (err) {
    console.warn('[LyricsCache] Error reading offline item:', err);
  }

  try {
    // 2. Check Compressed Metadata Cache in IndexedDB
    const cached = await db.getMetadataCache<CachedLyrics>(`lyrics:${videoId}`);
    if (cached && Array.isArray(cached.lyrics) && cached.lyrics.length > 0) {
      saveFastCachedLyrics(videoId, cached.lyrics, Boolean(cached.synced), cached.provider);
      return cached;
    }
  } catch (err) {
    console.warn('[LyricsCache] Error reading metadata cache:', err);
  }

  return null;
}

/**
 * Saves lyrics to Fast Tiers (In-Memory Map + LocalStorage)
 */
export function saveFastCachedLyrics(
  videoId: string,
  lyrics: LyricLine[],
  synced: boolean,
  provider?: string
): void {
  if (!videoId || !Array.isArray(lyrics) || lyrics.length === 0) return;

  const entry: CachedLyrics = {
    lyrics,
    synced,
    provider,
    timestamp: Date.now(),
  };

  // 1. In-Memory Cache
  inMemoryLyricsCache.set(videoId, entry);

  // 2. LocalStorage with automatic quota protection
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${videoId}`, JSON.stringify(entry));
    } catch (err) {
      // Quota exceeded: prune oldest entries
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(LOCAL_STORAGE_PREFIX)) {
            keysToRemove.push(k);
          }
        }
        for (let i = 0; i < Math.min(keysToRemove.length, 15); i++) {
          localStorage.removeItem(keysToRemove[i]);
        }
        localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${videoId}`, JSON.stringify(entry));
      } catch {}
    }
  }
}

/**
 * Saves lyrics to All Tiers: In-Memory + LocalStorage + IndexedDB
 */
export async function saveAllCachedLyrics(
  videoId: string,
  lyrics: LyricLine[],
  synced: boolean,
  provider?: string
): Promise<void> {
  if (!videoId || !Array.isArray(lyrics) || lyrics.length === 0) return;

  saveFastCachedLyrics(videoId, lyrics, synced, provider);

  // Save to IndexedDB with 7-day TTL
  try {
    await db.setMetadataCache(`lyrics:${videoId}`, {
      lyrics,
      synced,
      provider,
    });
  } catch (err) {
    console.warn('[LyricsCache] Failed to write to IndexedDB:', err);
  }
}

/**
 * Purges lyrics from all caching layers (used on manual retry or song refresh)
 */
export async function clearAllCachedLyrics(videoId: string): Promise<void> {
  if (!videoId) return;

  inMemoryLyricsCache.delete(videoId);

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.removeItem(`${LOCAL_STORAGE_PREFIX}${videoId}`);
    } catch {}
  }

  try {
    await db.deleteMetadataCache(`lyrics:${videoId}`);
  } catch {}
}
