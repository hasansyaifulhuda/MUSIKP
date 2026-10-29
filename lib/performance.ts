/**
 * High-performance utilities and synchronization helpers for 60fps web performance.
 */

export interface LyricLine {
  time: number;
  text: string;
}

/**
 * Accurately parses timestamp components into exact seconds.
 * Formula: ((hours * 60 + minutes) * 60 + seconds) * 1000 + ms -> converted to float seconds.
 * Standardizes fractional milliseconds accurately:
 * - 2-digit centiseconds: e.g. [00:12.34] -> 34 centiseconds = 340 milliseconds
 * - 3-digit milliseconds: e.g. [01:23.456] -> 456 milliseconds
 * - 1-digit deciseconds: e.g. [00:12.3] -> 3 deciseconds = 300 milliseconds
 * - 0-digit / no fraction: e.g. [01:23] -> 0 milliseconds
 */
export function parseTimestampToSeconds(
  minutesOrHours: string | number,
  secondsOrMinutes: string | number,
  fractionalOrSeconds?: string | number,
  optionalFractional?: string
): number {
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  let fracStr = '';

  if (optionalFractional !== undefined) {
    hours = parseInt(String(minutesOrHours), 10) || 0;
    minutes = parseInt(String(secondsOrMinutes), 10) || 0;
    seconds = parseInt(String(fractionalOrSeconds), 10) || 0;
    fracStr = String(optionalFractional || '').trim();
  } else {
    minutes = parseInt(String(minutesOrHours), 10) || 0;
    seconds = parseInt(String(secondsOrMinutes), 10) || 0;
    fracStr = String(fractionalOrSeconds || '').trim();
  }

  let ms = 0;
  if (fracStr) {
    const standardizedMsStr = fracStr.padEnd(3, '0').slice(0, 3);
    ms = parseInt(standardizedMsStr, 10) || 0;
  }

  const totalMs = ((hours * 60 + minutes) * 60 + seconds) * 1000 + ms;
  return Math.max(0, totalMs / 1000);
}

/**
 * Robust LRC Parser:
 * - Supports [hh:mm:ss.xxx], [mm:ss.xxx], [mm:ss.xx], [mm:ss:xx], [mm:ss,xx], [m:ss.xx], [mm:ss]
 * - Supports multiple tags per line: [00:10.50][00:20.50]Repeated lyric line
 * - Supports global offset tag: [offset:+/-ms]
 * - Strips metadata headers ([ar:...], [ti:...], [length:...])
 * - Decodes HTML entities and sorts lines chronologically
 */
export function parseLRC(lrcText: string, globalOffsetMs: number = 0): LyricLine[] {
  if (!lrcText || typeof lrcText !== 'string') return [];

  let offsetMs = globalOffsetMs;
  const offsetMatch = lrcText.match(/\[offset:\s*([+-]?\d+)\s*\]/i);
  if (offsetMatch) {
    const parsedOffset = parseInt(offsetMatch[1], 10);
    if (!isNaN(parsedOffset)) {
      offsetMs += parsedOffset;
    }
  }

  const tagRegex = /\[(?:(\d{1,2}):)?(\d{1,3}):(\d{2})(?:[.:,](\d{1,3}))?\]/g;
  const lines = lrcText.split('\n');
  const result: LyricLine[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip metadata headers
    if (/^\[(ti|ar|al|by|offset|length|re|ve|encoding):/i.test(trimmed)) {
      continue;
    }

    const matches = Array.from(trimmed.matchAll(tagRegex));
    if (matches.length > 0) {
      let text = trimmed.replace(tagRegex, '').trim();
      text = text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

      if (text) {
        for (const match of matches) {
          const hasHours = Boolean(match[1]);
          const totalSeconds = hasHours
            ? parseTimestampToSeconds(match[1], match[2], match[3], match[4]) + offsetMs / 1000
            : parseTimestampToSeconds(match[2], match[3], match[4]) + offsetMs / 1000;

          result.push({
            time: Math.max(0, Math.round(totalSeconds * 1000) / 1000),
            text,
          });
        }
      }
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

/**
 * Normalizes, validates, and sorts raw lyric timestamps into exact seconds matching audio.currentTime.
 * Supports:
 * - Array of objects with seconds or milliseconds ({ time, text }, { startTimeMs, text }, { timeMs, text })
 * - Raw LRC formatted strings
 * - Single text lines with timestamps
 * - Guaranteed strict chronological sorting for binary search accuracy
 */
export function normalizeLyrics(rawLyrics: any, trackDuration?: number): LyricLine[] {
  if (!rawLyrics) return [];

  // 1. If rawLyrics is a string (e.g. raw LRC file contents)
  if (typeof rawLyrics === 'string') {
    return parseLRC(rawLyrics);
  }

  // 2. If rawLyrics is an object with syncedLyrics or lyrics property
  if (typeof rawLyrics === 'object' && !Array.isArray(rawLyrics)) {
    if (typeof rawLyrics.syncedLyrics === 'string') {
      return parseLRC(rawLyrics.syncedLyrics);
    }
    if (Array.isArray(rawLyrics.lyrics)) {
      return normalizeLyrics(rawLyrics.lyrics, trackDuration);
    }
    if (typeof rawLyrics.plainLyrics === 'string') {
      return rawLyrics.plainLyrics
        .split('\n')
        .map((l: string) => l.trim())
        .filter(Boolean)
        .map((text: string) => ({ time: 0, text }));
    }
    return [];
  }

  if (!Array.isArray(rawLyrics) || rawLyrics.length === 0) return [];

  const parsedLines: LyricLine[] = [];

  for (const item of rawLyrics) {
    if (!item) continue;

    // Handle raw string item inside array e.g. ["[00:12.34] Text"]
    if (typeof item === 'string') {
      const parsedItem = parseLRC(item);
      if (parsedItem.length > 0) {
        parsedLines.push(...parsedItem);
      } else if (item.trim()) {
        parsedLines.push({ time: 0, text: item.trim() });
      }
      continue;
    }

    const text = (item.text ?? item.words ?? item.content ?? item.line ?? '').toString().trim();
    if (!text && !item.text) continue;

    let timeInSeconds = 0;

    // Explicit millisecond fields
    if (item.startTimeMs !== undefined && item.startTimeMs !== null && item.startTimeMs !== '') {
      timeInSeconds = Math.max(0, parseFloat(String(item.startTimeMs)) / 1000);
    } else if (item.timeMs !== undefined && item.timeMs !== null && item.timeMs !== '') {
      timeInSeconds = Math.max(0, parseFloat(String(item.timeMs)) / 1000);
    } else if (typeof item.time === 'string') {
      const timeStr = item.time.trim();
      // Match timestamp tags [hh:mm:ss.xxx] or [mm:ss.xxx]
      const tagMatch = timeStr.match(/^(?:\[)?(?:(\d{1,2}):)?(\d{1,3}):(\d{2})(?:[.:,](\d{1,3}))?(?:\])?$/);
      if (tagMatch) {
        const hasHours = Boolean(tagMatch[1]);
        timeInSeconds = hasHours
          ? parseTimestampToSeconds(tagMatch[1], tagMatch[2], tagMatch[3], tagMatch[4])
          : parseTimestampToSeconds(tagMatch[2], tagMatch[3], tagMatch[4]);
      } else {
        const num = parseFloat(timeStr);
        timeInSeconds = !isNaN(num) ? num : 0;
      }
    } else if (typeof item.time === 'number') {
      // If time is exceedingly large (> 10000) or clearly exceeds 1.5x trackDuration, it's in milliseconds
      const isMilliseconds =
        item.time > 10000 ||
        (Boolean(trackDuration && trackDuration > 0) && item.time > (trackDuration as number) * 1.5);
      timeInSeconds = isMilliseconds ? item.time / 1000 : item.time;
    }

    parsedLines.push({
      time: Math.max(0, Math.round(timeInSeconds * 1000) / 1000),
      text,
    });
  }

  if (parsedLines.length === 0) return [];

  // Ensure strict chronological sort for binary search accuracy
  return parsedLines.sort((a, b) => a.time - b.time);
}

/**
 * Poin 70: Fuzzy Timestamp Matching & Duration Interpolation
 * Handles plain text lyrics without timestamps or partially synchronized lines.
 * Uses character & syllable weight estimation to distribute lines evenly across the song duration.
 */
export function interpolateLyricsTimestamps(lyrics: LyricLine[], trackDuration?: number): LyricLine[] {
  if (!Array.isArray(lyrics) || lyrics.length === 0) return [];
  const duration = trackDuration && trackDuration > 10 ? trackDuration : 180;

  const allZero = lyrics.every((l) => l.time === 0);
  if (allZero) {
    const introOffset = Math.min(15, Math.max(6, duration * 0.05));
    const availableTime = Math.max(10, duration - introOffset - 5);

    const totalChars = lyrics.reduce((acc, l) => acc + Math.max(10, l.text.length), 0);
    let accumulatedTime = introOffset;

    return lyrics.map((l) => {
      const lineTime = Math.round(accumulatedTime * 100) / 100;
      const weight = Math.max(10, l.text.length) / totalChars;
      accumulatedTime += weight * availableTime;
      return {
        time: lineTime,
        text: l.text,
      };
    });
  }

  const result: LyricLine[] = [...lyrics];
  for (let i = 0; i < result.length; i++) {
    if (result[i].time === 0 && i > 0) {
      let nextAnchor = -1;
      for (let j = i + 1; j < result.length; j++) {
        if (result[j].time > 0) {
          nextAnchor = j;
          break;
        }
      }
      const prevTime = result[i - 1].time;
      const nextTime = nextAnchor !== -1 ? result[nextAnchor].time : duration - 2;
      const gapSteps = (nextAnchor !== -1 ? nextAnchor : result.length) - i + 1;
      const stepDelta = Math.max(0.5, (nextTime - prevTime) / gapSteps);
      result[i].time = Math.round((prevTime + stepDelta) * 100) / 100;
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

/**
 * Highly accurate active lyric index search via O(log n) Binary Search.
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

  // 2. Binary search to find the latest line where line.time <= currentTime
  let low = 0;
  let high = lyrics.length - 1;
  let activeIndex = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lyrics[mid].time <= currentTime) {
      activeIndex = mid;
      low = mid + 1; // Seek later candidate
    } else {
      high = mid - 1;
    }
  }

  return activeIndex;
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
