import { create } from 'zustand';
import { debouncedLocalStorageGet, debouncedLocalStorageSet } from './debouncedStorage';
import { toast } from './toast';

/**
 * Enterprise Floating Lyrics Pill Store
 * Master Blueprint PMUSIC Architecture - Batch 3 (Poin 80)
 *
 * Guarantees:
 * 1. Persistent toggle preference (pmusic_floating_lyrics_pill_v1).
 * 2. Rapid visibility control for compact quick-view lyrics overlay.
 */

const FLOATING_LYRICS_STORAGE_KEY = 'pmusic_floating_lyrics_pill_v1';

export interface FloatingLyricsState {
  isEnabled: boolean;
  toggleEnabled: () => void;
  setEnabled: (enabled: boolean) => void;
}

function getInitialState(): boolean {
  if (typeof window === 'undefined') return true; // Default ON for great UX
  try {
    const raw = debouncedLocalStorageGet(FLOATING_LYRICS_STORAGE_KEY);
    if (raw !== null) {
      return raw === 'true';
    }
  } catch {}
  return true;
}

export const useFloatingLyricsStore = create<FloatingLyricsState>((set, get) => ({
  isEnabled: getInitialState(),

  toggleEnabled: () => {
    const next = !get().isEnabled;
    get().setEnabled(next);
  },

  setEnabled: (enabled: boolean) => {
    set({ isEnabled: enabled });
    debouncedLocalStorageSet(FLOATING_LYRICS_STORAGE_KEY, String(enabled));
    if (enabled) {
      toast.success('Pil Lirik Melayang diaktifkan');
    } else {
      toast.info('Pil Lirik Melayang dinonaktifkan');
    }
  },
}));
