import { create } from 'zustand';
import { debouncedLocalStorageGet, debouncedLocalStorageSet } from './debouncedStorage';
import { toast } from './toast';

/**
 * Enterprise Floating Mini-Player Widget Store
 * Master Blueprint PMUSIC Architecture - Batch 2 (Poin 22)
 *
 * Guarantees:
 * 1. Persistent toggle preference in localStorage.
 * 2. Seamless activation across route transitions.
 * 3. Reactive dismissal when full-screen views expand.
 */

const FLOATING_WIDGET_KEY = 'pmusic_floating_widget_enabled_v1';

export interface FloatingWidgetState {
  isEnabled: boolean;
  isOpen: boolean;

  toggleEnabled: () => void;
  openWidget: () => void;
  closeWidget: () => void;
}

function getInitialFloatingState(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const val = debouncedLocalStorageGet(FLOATING_WIDGET_KEY);
    if (val !== null) {
      return val === 'true';
    }
  } catch {}
  return true; // Enabled by default for rich floating UX
}

export const useFloatingWidgetStore = create<FloatingWidgetState>((set, get) => ({
  isEnabled: getInitialFloatingState(),
  isOpen: false,

  toggleEnabled: () => {
    const next = !get().isEnabled;
    set({ isEnabled: next, isOpen: next });
    debouncedLocalStorageSet(FLOATING_WIDGET_KEY, String(next));
    toast.info(next ? 'Mini-Player melayang diaktifkan' : 'Mini-Player melayang dinonaktifkan');
  },

  openWidget: () => set({ isOpen: true }),
  closeWidget: () => set({ isOpen: false }),
}));
