import { create } from 'zustand';
import { debouncedLocalStorageGet, debouncedLocalStorageSet } from './debouncedStorage';
import { toast } from './toast';

/**
 * Enterprise Lyrics Offset Synchronization Store
 * Master Blueprint PMUSIC Architecture - Batch 3 (Poin 68)
 *
 * Guarantees:
 * 1. Granular manual adjustment (+/- 0.1s, +/- 0.5s, +/- 1.0s).
 * 2. Per-track persistence across sessions via debounced storage.
 * 3. Zero-delay reactive synchronization for both Full-Screen Karaoke and Floating Lyrics.
 */

const LYRICS_OFFSET_STORAGE_KEY = 'pmusic_lyrics_offsets_v1';

export interface LyricsOffsetState {
  offsets: Record<string, number>; // Mapping videoId -> offset in seconds
  getOffset: (videoId: string | undefined | null) => number;
  setOffset: (videoId: string, offsetSeconds: number) => void;
  adjustOffset: (videoId: string, deltaSeconds: number) => void;
  resetOffset: (videoId: string) => void;
}

function getInitialOffsets(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = debouncedLocalStorageGet(LYRICS_OFFSET_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      }
    }
  } catch {}
  return {};
}

export const useLyricsOffsetStore = create<LyricsOffsetState>((set, get) => ({
  offsets: getInitialOffsets(),

  getOffset: (videoId: string | undefined | null): number => {
    if (!videoId) return 0;
    const val = get().offsets[videoId];
    return typeof val === 'number' && !isNaN(val) ? val : 0;
  },

  setOffset: (videoId: string, offsetSeconds: number) => {
    if (!videoId) return;
    const clamped = Math.max(-15, Math.min(15, Number(offsetSeconds.toFixed(1))));
    const updated = { ...get().offsets, [videoId]: clamped };
    set({ offsets: updated });
    debouncedLocalStorageSet(LYRICS_OFFSET_STORAGE_KEY, JSON.stringify(updated));

    const sign = clamped > 0 ? `+${clamped}` : `${clamped}`;
    toast.success(`Offset lirik diatur ke ${sign} detik`);
  },

  adjustOffset: (videoId: string, deltaSeconds: number) => {
    if (!videoId) return;
    const current = get().getOffset(videoId);
    const next = current + deltaSeconds;
    get().setOffset(videoId, next);
  },

  resetOffset: (videoId: string) => {
    if (!videoId) return;
    const updated = { ...get().offsets };
    delete updated[videoId];
    set({ offsets: updated });
    debouncedLocalStorageSet(LYRICS_OFFSET_STORAGE_KEY, JSON.stringify(updated));
    toast.info('Offset lirik direset ke 0.0 detik');
  },
}));
