'use client';

import { create } from 'zustand';
import { Track } from './store';

/**
 * Enterprise Track Context Menu Store
 * Master Blueprint PMUSIC Architecture - Batch 3 (Poin 78)
 *
 * Provides application-wide state management for right-click and
 * mobile touch long-press contextual menus without DOM hierarchy clipping.
 */

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface ContextMenuState {
  isOpen: boolean;
  position: ContextMenuPosition;
  track: Track | null;
  openContextMenu: (track: Track, position: ContextMenuPosition) => void;
  closeContextMenu: () => void;
}

export const useContextMenuStore = create<ContextMenuState>((set) => ({
  isOpen: false,
  position: { x: 0, y: 0 },
  track: null,

  openContextMenu: (track: Track, position: ContextMenuPosition) => {
    // Clamp coordinates to safe viewport bounds (ensuring menu never clips off-screen)
    const menuWidth = 240;
    const menuHeight = 360;
    const safeX = typeof window !== 'undefined' ? Math.min(position.x, window.innerWidth - menuWidth) : position.x;
    const safeY = typeof window !== 'undefined' ? Math.min(position.y, window.innerHeight - menuHeight) : position.y;
    set({
      isOpen: true,
      track,
      position: { x: Math.max(12, safeX), y: Math.max(12, safeY) },
    });
  },

  closeContextMenu: () => {
    set({ isOpen: false, track: null });
  },
}));
