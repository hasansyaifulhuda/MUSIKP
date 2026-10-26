/**
 * High-performance utilities and synchronization helpers for 60fps web performance.
 */

export interface LyricLine {
  time: number;
  text: string;
}

/**
 * Binary search to find the active lyric line index with millisecond precision in O(log n).
 * Returns -1 if before the first lyric line.
 */
export function binarySearchLyricIndex(lyrics: LyricLine[], currentTime: number, offsetSeconds = 0): number {
  if (!lyrics || lyrics.length === 0) return -1;
  const time = currentTime + offsetSeconds;

  // Before the first line begins (e.g. musical intro)
  if (time < lyrics[0].time) {
    return -1;
  }

  // After or at the last line
  if (time >= lyrics[lyrics.length - 1].time) {
    return lyrics.length - 1;
  }

  let low = 0;
  let high = lyrics.length - 1;
  let best = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lyrics[mid].time <= time) {
      best = mid;
      low = mid + 1; // Try to find a later line that also qualifies
    } else {
      high = mid - 1;
    }
  }

  return best;
}

/**
 * Standard debounce utility for high-frequency events (resize, typing).
 */
export function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return function (...args: Parameters<T>) {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

/**
 * Standard throttle utility using requestAnimationFrame / time guard.
 */
export function throttle<T extends (...args: any[]) => void>(fn: T, limit: number): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return function (...args: Parameters<T>) {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Format seconds into mm:ss or mm:ss.ms
 */
export function formatTimeDisplay(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
