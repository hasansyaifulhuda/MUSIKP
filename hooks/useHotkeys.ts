'use client';

import { useEffect, useRef } from 'react';

interface HotkeyOptions {
  onTogglePlay?: () => void;
  onSeekBackward?: () => void;
  onSeekForward?: () => void;
  onToggleMute?: () => void;
  onNextTrack?: () => void;
  onPrevTrack?: () => void;
  onVolumeUp?: () => void;
  onVolumeDown?: () => void;
  onToggleDevPanel?: () => void;
}

/**
 * Global Keyboard Shortcuts Master Controls (Poin 97):
 * - Space / 'k': Play / Pause
 * - ArrowLeft / 'j': Seek backward 5s
 * - ArrowRight / 'l': Seek forward 5s
 * - ArrowUp: Volume +5%
 * - ArrowDown: Volume -5%
 * - 'm' / 'M': Mute / Unmute
 * - 'n' / 'N': Next Track
 * - 'p' / 'P': Prev Track
 * - Ctrl + Shift + D: Developer Diagnostic Modal (Poin 100)
 */
export function useHotkeys(options: HotkeyOptions) {
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Secret developer shortcut: Ctrl+Shift+D
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'D' || event.key === 'd')) {
        event.preventDefault();
        optionsRef.current.onToggleDevPanel?.();
        return;
      }

      const target = event.target as HTMLElement | null;

      // Ignore when user is actively typing in input fields
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Check modifier keys (don't override Cmd+C, Ctrl+R, etc.)
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      switch (event.code) {
        // Play / Pause
        case 'Space':
        case 'KeyK': {
          event.preventDefault();
          optionsRef.current.onTogglePlay?.();
          break;
        }

        // Seek Backward (5s)
        case 'ArrowLeft':
        case 'KeyJ': {
          event.preventDefault();
          optionsRef.current.onSeekBackward?.();
          break;
        }

        // Seek Forward (5s)
        case 'ArrowRight':
        case 'KeyL': {
          event.preventDefault();
          optionsRef.current.onSeekForward?.();
          break;
        }

        // Volume Up (+5%)
        case 'ArrowUp': {
          event.preventDefault();
          optionsRef.current.onVolumeUp?.();
          break;
        }

        // Volume Down (-5%)
        case 'ArrowDown': {
          event.preventDefault();
          optionsRef.current.onVolumeDown?.();
          break;
        }

        // Mute / Unmute
        case 'KeyM': {
          event.preventDefault();
          optionsRef.current.onToggleMute?.();
          break;
        }

        // Next Track
        case 'KeyN': {
          event.preventDefault();
          optionsRef.current.onNextTrack?.();
          break;
        }

        // Previous Track
        case 'KeyP': {
          event.preventDefault();
          optionsRef.current.onPrevTrack?.();
          break;
        }

        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
