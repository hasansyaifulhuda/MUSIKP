import { create } from 'zustand';
import { debouncedLocalStorageGet, debouncedLocalStorageSet } from './debouncedStorage';
import { toast } from './toast';

/**
 * Enterprise Audio Crossfade Store
 * Master Blueprint PMUSIC Architecture - Batch 2 (Poin 29)
 *
 * Guarantees:
 * 1. Persistent crossfade duration (0s, 2s, 4s, 6s, 8s, 12s).
 * 2. Seamless state synchronization with audio volume ramps.
 */

const CROSSFADE_STORAGE_KEY = 'pmusic_crossfade_duration_v1';

export interface CrossfadeState {
  crossfadeDuration: number; // In seconds (0 = off)
  setCrossfadeDuration: (seconds: number) => void;
}

function getInitialCrossfade(): number {
  if (typeof window === 'undefined') return 2; // Default 2 seconds
  try {
    const raw = debouncedLocalStorageGet(CROSSFADE_STORAGE_KEY);
    if (raw !== null) {
      const parsed = Number(raw);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 12) {
        return parsed;
      }
    }
  } catch {}
  return 2;
}

export const useCrossfadeStore = create<CrossfadeState>((set) => ({
  crossfadeDuration: getInitialCrossfade(),

  setCrossfadeDuration: (seconds: number) => {
    const clamped = Math.max(0, Math.min(12, Math.round(seconds)));
    set({ crossfadeDuration: clamped });
    debouncedLocalStorageSet(CROSSFADE_STORAGE_KEY, String(clamped));

    if (clamped === 0) {
      toast.info('Crossfade dinonaktifkan');
    } else {
      toast.success(`Crossfade diatur ke ${clamped} detik`);
    }
  },
}));
