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

let dbPromise: Promise<IDBPDatabase<SannMusicDB>>;

if (typeof window !== 'undefined') {
  dbPromise = openDB<SannMusicDB>('SannMusicDB', 5, {
    upgrade(db, oldVersion, newVersion, transaction) {
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
  });
}

export const db = {
  async getPlaylists() {
    if (typeof window === 'undefined') return [];
    const db = await dbPromise;
    return db.getAll('playlists');
  },
  async addPlaylist(playlist: { id: string; name: string; img: string; tracks: Track[] }) {
    if (typeof window === 'undefined') return;
    const db = await dbPromise;
    return db.put('playlists', playlist);
  },
  async getPlaylist(id: string) {
    if (typeof window === 'undefined') return undefined;
    const db = await dbPromise;
    return db.get('playlists', id);
  },
  async deletePlaylist(id: string) {
    if (typeof window === 'undefined') return;
    const db = await dbPromise;
    return db.delete('playlists', id);
  },
  async getLikedSongs() {
    if (typeof window === 'undefined') return [];
    const db = await dbPromise;
    return db.getAll('liked_songs');
  },
  async addLikedSong(track: Track) {
    if (typeof window === 'undefined') return;
    const db = await dbPromise;
    return db.put('liked_songs', track);
  },
  async removeLikedSong(videoId: string) {
    if (typeof window === 'undefined') return;
    const db = await dbPromise;
    return db.delete('liked_songs', videoId);
  },
  async isLiked(videoId: string) {
    if (typeof window === 'undefined') return false;
    const db = await dbPromise;
    const song = await db.get('liked_songs', videoId);
    return !!song;
  },
  async getSubscribedArtists() {
    if (typeof window === 'undefined') return [];
    const db = await dbPromise;
    return db.getAll('subscribed_artists');
  },
  async addSubscribedArtist(artist: SubscribedArtist) {
    if (typeof window === 'undefined') return;
    const db = await dbPromise;
    return db.put('subscribed_artists', artist);
  },
  async removeSubscribedArtist(artistId: string) {
    if (typeof window === 'undefined') return;
    const db = await dbPromise;
    return db.delete('subscribed_artists', artistId);
  },
  async isSubscribed(artistId: string) {
    if (typeof window === 'undefined') return false;
    const db = await dbPromise;
    const artist = await db.get('subscribed_artists', artistId);
    return !!artist;
  },
  async getSavedAlbums() {
    if (typeof window === 'undefined') return [];
    const db = await dbPromise;
    return db.getAll('saved_albums');
  },
  async addSavedAlbum(album: SavedAlbum) {
    if (typeof window === 'undefined') return;
    const db = await dbPromise;
    return db.put('saved_albums', album);
  },
  async removeSavedAlbum(albumId: string) {
    if (typeof window === 'undefined') return;
    const db = await dbPromise;
    return db.delete('saved_albums', albumId);
  },
  async isAlbumSaved(albumId: string) {
    if (typeof window === 'undefined') return false;
    const db = await dbPromise;
    const album = await db.get('saved_albums', albumId);
    return !!album;
  },
  async getRecentSearches() {
    if (typeof window === 'undefined') return [];
    const db = await dbPromise;
    const searches = await db.getAll('recent_searches');
    return searches.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
  },
  async addRecentSearch(query: string) {
    if (typeof window === 'undefined') return;
    const db = await dbPromise;
    await db.put('recent_searches', { query, timestamp: Date.now() });

    // Keep only 20
    const searches = await db.getAll('recent_searches');
    if (searches.length > 20) {
      const sorted = searches.sort((a, b) => b.timestamp - a.timestamp);
      const toDelete = sorted.slice(20);
      const tx = db.transaction('recent_searches', 'readwrite');
      for (const item of toDelete) {
        tx.store.delete(item.query);
      }
      await tx.done;
    }
  },
  async removeRecentSearch(query: string) {
    if (typeof window === 'undefined') return;
    const db = await dbPromise;
    return db.delete('recent_searches', query);
  },

  // Offline / Downloaded Tracks
  async getOfflineTracks(): Promise<OfflineTrack[]> {
    if (typeof window === 'undefined') return [];
    const db = await dbPromise;
    return db.getAll('offline_tracks');
  },
  async getOfflineTrack(videoId: string): Promise<OfflineTrack | undefined> {
    if (typeof window === 'undefined') return undefined;
    const db = await dbPromise;
    return db.get('offline_tracks', videoId);
  },
  async saveOfflineTrack(track: Track, blob?: Blob) {
    if (typeof window === 'undefined') return;
    const db = await dbPromise;

    const item: OfflineTrack = {
      videoId: track.videoId,
      track,
      blob: blob,
      downloadedAt: Date.now(),
    };
    return db.put('offline_tracks', item);
  },
  async removeOfflineTrack(videoId: string) {
    if (typeof window === 'undefined') return;
    const db = await dbPromise;
    return db.delete('offline_tracks', videoId);
  },
  async isOfflineTrack(videoId: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const db = await dbPromise;
    const item = await db.get('offline_tracks', videoId);
    return !!item;
  },
  async clearOfflineTracks() {
    if (typeof window === 'undefined') return;
    const db = await dbPromise;
    return db.clear('offline_tracks');
  },
  async clearAllIndexedDB() {
    if (typeof window === 'undefined') return;
    const db = await dbPromise;
    const stores = ['playlists', 'liked_songs', 'subscribed_artists', 'saved_albums', 'recent_searches', 'offline_tracks'] as const;
    for (const s of stores) {
      try {
        await db.clear(s);
      } catch {}
    }
  },
};
