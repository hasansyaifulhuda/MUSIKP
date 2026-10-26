'use client';

import { useEffect, useRef } from 'react';

interface HotkeyOptions {
  onTogglePlay?: () => void;
  onSeekBackward?: () => void;
  onSeekForward?: () => void;
  onToggleMute?: () => void;
  onNextTrack?: () => void;
  onPrevTrack?: () => void;
}

/**
 * Global Keyboard Shortcuts Hook:
 * - Space: Play / Pause
 * - ArrowLeft / 'j': Seek backward 5s
 * - ArrowRight / 'l': Seek forward 5s
 * - 'm' / 'M': Mute / Unmute
 *
 * Automatically disables shortcuts when focus is inside text inputs, textareas, or contentEditable elements.
 */
export function useHotkeys(options: HotkeyOptions) {
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;

      // Ignore when user is actively typing in an input, textarea, select, or editable element
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Check modifier keys (don't override Cmd+C, Ctrl+R, Alt+Tab, etc.)
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

        // Mute / Unmute
        case 'KeyM': {
          event.preventDefault();
          optionsRef.current.onToggleMute?.();
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
