/**
 * High-performance utilities and synchronization helpers for 60fps web performance.
 */

export interface LyricLine {
  time: number;
  text: string;
}

/**
 * Normalizes, validates, and sorts raw lyric timestamps into exact seconds matching audio.currentTime.
 * Supports:
 * - Seconds (float/int): e.g. 12.34
 * - Milliseconds (auto-detected when timestamps > 1000 or exceed track duration): e.g. 12340 -> 12.34
 * - Explicit ms fields: { startTimeMs: "12340" } or { timeMs: 12340 }
 * - Timestamp strings: "[01:23.45]", "[01:23:45]", "01:23.45", "01:23", "83.45"
 * - Automatically sorts output chronologically to guarantee O(log n) binary search correctness.
 */
export function normalizeLyrics(rawLyrics: any[], trackDuration?: number): LyricLine[] {
  if (!Array.isArray(rawLyrics) || rawLyrics.length === 0) return [];

  const parsedLines: { rawTime: number; text: string }[] = [];

  for (const item of rawLyrics) {
    if (!item) continue;
    const text = (item.text ?? item.words ?? item.content ?? item.line ?? '').toString().trim();
    if (!text && !item.text) continue;

    let rawTime = 0;

    // 1. Explicit millisecond fields
    if (item.startTimeMs !== undefined && item.startTimeMs !== null && item.startTimeMs !== '') {
      rawTime = parseFloat(String(item.startTimeMs)) / 1000;
    } else if (item.timeMs !== undefined && item.timeMs !== null && item.timeMs !== '') {
      rawTime = parseFloat(String(item.timeMs)) / 1000;
    } else if (typeof item.time === 'string') {
      const timeStr = item.time.trim();
      // Match [mm:ss.xx], [mm:ss:xx], mm:ss.xx, mm:ss, or [m:ss.xx]
      const match = timeStr.match(/^(?:\[)?(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?(?:\])?$/);
      if (match) {
        const m = parseFloat(match[1]);
        const s = parseFloat(match[2]);
        const msStr = match[3] || '0';
        const ms = parseFloat(msStr) / Math.pow(10, msStr.length);
        rawTime = m * 60 + s + ms;
      } else {
        const num = parseFloat(timeStr);
        rawTime = !isNaN(num) ? num : 0;
      }
    } else if (typeof item.time === 'number') {
      rawTime = item.time;
    }

    parsedLines.push({ rawTime, text });
  }

  if (parsedLines.length === 0) return [];

  // 2. Millisecond vs Seconds Detection:
  const maxRawTime = Math.max(...parsedLines.map((l) => l.rawTime));
  const isMilliseconds = maxRawTime > 1000 && (
    !trackDuration || trackDuration <= 0 || maxRawTime > trackDuration * 1.5
  );

  const factor = isMilliseconds ? 0.001 : 1;

  // 3. Construct clean LyricLine array with seconds rounded to 2 decimal places
  const normalized: LyricLine[] = parsedLines.map((l) => ({
    time: Math.max(0, Math.round(l.rawTime * factor * 100) / 100),
    text: l.text,
  }));

  // Ensure strict chronological sort for binary search accuracy
  return normalized.sort((a, b) => a.time - b.time);
}

/**
 * Highly accurate active lyric index search.
 * A lyric line `i` is active when:
 * lyrics[i].time <= currentTime < (lyrics[i + 1]?.time ?? Infinity)
 * Returns -1 if before the first lyric line (musical intro).
 * Guarantees zero off-by-one or line mismatch issues.
 */
export function findActiveLyricIndex(lyrics: LyricLine[], currentTime: number): number {
  if (!lyrics || lyrics.length === 0) return -1;

  // 1. Before the first line begins (musical intro)
  if (currentTime < lyrics[0].time) {
    return -1;
  }

  // 2. At or after the last line
  const lastIndex = lyrics.length - 1;
  if (currentTime >= lyrics[lastIndex].time) {
    return lastIndex;
  }

  // 3. Exact interval check: lyrics[i].time <= currentTime < lyrics[i + 1].time
  for (let i = 0; i < lastIndex; i++) {
    if (currentTime >= lyrics[i].time && currentTime < lyrics[i + 1].time) {
      return i;
    }
  }

  return lastIndex;
}

/**
 * Backward compatibility alias for findActiveLyricIndex
 */
export const binarySearchLyricIndex = findActiveLyricIndex;

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
