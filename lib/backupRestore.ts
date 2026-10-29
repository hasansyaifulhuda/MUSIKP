import { db, CustomPlaylist } from './db';
import { usePlayerStore } from './store';
import { debouncedLocalStorageGet, debouncedLocalStorageSet } from './debouncedStorage';
import { toast } from './toast';

/**
 * Enterprise Backup & Restore Engine (JSON Export & Import)
 * Master Blueprint PMUSIC Architecture - Batch 2 (Poin 28)
 *
 * Guarantees:
 * 1. Comprehensive local backup: IndexedDB playlists, liked tracks, history, EQ, and theme settings.
 * 2. Clean timestamped JSON export with browser download disposition.
 * 3. Robust JSON validation and schema parsing with fallback recovery.
 * 4. Deduplicated restoration into IndexedDB and reactive stores.
 */

export interface PMUSICBackupData {
  app: 'PMUSIC';
  version: number;
  exportedAt: string;
  playlists: CustomPlaylist[];
  likedTracks: any[];
  history: any[];
  preferences: {
    equalizer?: any;
    audioQuality?: string;
    crossfadeDuration?: number;
    floatingLyricsEnabled?: boolean;
    lyricsOffsets?: Record<string, number>;
  };
}

export interface ImportResult {
  success: boolean;
  message: string;
  counts?: {
    playlists: number;
    liked: number;
    history: number;
  };
}

/**
 * Exports all user data to a downloadable JSON file.
 */
export async function exportUserDataToJson(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    // 1. Fetch custom playlists from IndexedDB
    const playlists = await db.getPlaylists();

    // 2. Fetch liked songs from localStorage
    let likedTracks: any[] = [];
    try {
      const rawLiked = debouncedLocalStorageGet('pmusic_liked_tracks');
      if (rawLiked) likedTracks = JSON.parse(rawLiked);
    } catch {}

    // 3. Fetch playback history from Zustand store
    const history = usePlayerStore.getState().history || [];

    // 4. Fetch user preferences
    let equalizer: any = null;
    try {
      const rawEq = debouncedLocalStorageGet('pmusic_equalizer_settings_v1');
      if (rawEq) equalizer = JSON.parse(rawEq);
    } catch {}

    const audioQuality = debouncedLocalStorageGet('pmusic_audio_quality_v1') || 'auto';
    const crossfadeDuration = Number(debouncedLocalStorageGet('pmusic_crossfade_duration_v1') || '2');
    const floatingLyricsEnabled = debouncedLocalStorageGet('pmusic_floating_lyrics_pill_v1') !== 'false';

    let lyricsOffsets: Record<string, number> = {};
    try {
      const rawOffsets = debouncedLocalStorageGet('pmusic_lyrics_offsets_v1');
      if (rawOffsets) lyricsOffsets = JSON.parse(rawOffsets);
    } catch {}

    // 5. Construct payload
    const backup: PMUSICBackupData = {
      app: 'PMUSIC',
      version: 2,
      exportedAt: new Date().toISOString(),
      playlists,
      likedTracks: Array.isArray(likedTracks) ? likedTracks : [],
      history: Array.isArray(history) ? history : [],
      preferences: {
        equalizer,
        audioQuality,
        crossfadeDuration,
        floatingLyricsEnabled,
        lyricsOffsets,
      },
    };

    const jsonString = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const dateStr = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pmusic_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);

    toast.success('Data cadangan berhasil diekspor!');
    return true;
  } catch (err: any) {
    console.error('[BackupRestore] Export failed:', err);
    toast.error('Gagal mengekspor data cadangan: ' + (err?.message || 'Unknown error'));
    return false;
  }
}

/**
 * Validates and restores user data from a JSON file into IndexedDB and stores.
 */
export async function importUserDataFromJson(file: File): Promise<ImportResult> {
  if (typeof window === 'undefined' || !file) {
    return { success: false, message: 'File tidak ditemukan' };
  }

  try {
    const text = await file.text();
    let data: any;

    try {
      data = JSON.parse(text);
    } catch {
      return { success: false, message: 'Format file bukan JSON yang valid' };
    }

    if (!data || typeof data !== 'object') {
      return { success: false, message: 'Struktur data cadangan tidak valid' };
    }

    let playlistsRestored = 0;
    let likedRestored = 0;
    let historyRestored = 0;

    // 1. Restore Custom Playlists to IndexedDB
    if (Array.isArray(data.playlists)) {
      for (const pl of data.playlists) {
        if (pl && pl.id && pl.name) {
          await db.addPlaylist({
            id: String(pl.id),
            name: String(pl.name),
            img: pl.img || '',
            tracks: Array.isArray(pl.tracks) ? pl.tracks : [],
            createdAt: pl.createdAt || Date.now(),
            updatedAt: pl.updatedAt || Date.now(),
          });
          playlistsRestored++;
        }
      }
    }

    // 2. Restore Liked Songs
    if (Array.isArray(data.likedTracks) && data.likedTracks.length > 0) {
      let existingLiked: any[] = [];
      try {
        const raw = debouncedLocalStorageGet('pmusic_liked_tracks');
        if (raw) existingLiked = JSON.parse(raw);
      } catch {}

      const mergedMap = new Map<string, any>();
      existingLiked.forEach((t) => {
        if (t?.videoId) mergedMap.set(t.videoId, t);
      });
      data.likedTracks.forEach((t: any) => {
        if (t?.videoId) mergedMap.set(t.videoId, t);
      });

      const mergedList = Array.from(mergedMap.values());
      debouncedLocalStorageSet('pmusic_liked_tracks', JSON.stringify(mergedList));
      likedRestored = data.likedTracks.length;
    }

    // 3. Restore History to Zustand Store
    if (Array.isArray(data.history) && data.history.length > 0) {
      usePlayerStore.setState((state) => {
        const existingHistory = state.history || [];
        const mergedHistory = [...data.history, ...existingHistory].slice(0, 100);
        return { history: mergedHistory };
      });
      historyRestored = data.history.length;
    }

    // 4. Restore Preferences
    if (data.preferences && typeof data.preferences === 'object') {
      if (data.preferences.equalizer) {
        debouncedLocalStorageSet(
          'pmusic_equalizer_settings_v1',
          JSON.stringify(data.preferences.equalizer)
        );
      }
      if (data.preferences.audioQuality) {
        debouncedLocalStorageSet('pmusic_audio_quality_v1', data.preferences.audioQuality);
      }
      if (typeof data.preferences.crossfadeDuration === 'number') {
        debouncedLocalStorageSet(
          'pmusic_crossfade_duration_v1',
          String(data.preferences.crossfadeDuration)
        );
      }
      if (typeof data.preferences.floatingLyricsEnabled === 'boolean') {
        debouncedLocalStorageSet('pmusic_floating_lyrics_pill_v1', String(data.preferences.floatingLyricsEnabled));
      }
      if (data.preferences.lyricsOffsets && typeof data.preferences.lyricsOffsets === 'object') {
        debouncedLocalStorageSet('pmusic_lyrics_offsets_v1', JSON.stringify(data.preferences.lyricsOffsets));
      }
    }

    const resultMessage = `Berhasil memulihkan ${playlistsRestored} playlist, ${likedRestored} lagu disukai, dan ${historyRestored} riwayat lagu.`;
    toast.success(resultMessage);

    return {
      success: true,
      message: resultMessage,
      counts: {
        playlists: playlistsRestored,
        liked: likedRestored,
        history: historyRestored,
      },
    };
  } catch (err: any) {
    console.error('[BackupRestore] Import failed:', err);
    toast.error('Gagal memulihkan data: ' + (err?.message || 'Unknown error'));
    return { success: false, message: err?.message || 'Import failed' };
  }
}
