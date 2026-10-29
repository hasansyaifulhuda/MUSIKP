/**
 * PMUSIC High-Performance Background Web Worker
 * Master Blueprint PMUSIC Architecture - Phase 1.2 (Point 7)
 *
 * Offloads massive lyrics parsing, timestamp normalization,
 * and text search algorithms off the main UI thread.
 */

// 1. Timestamp Normalization & Chronological Sorting
function parseTimestampToSeconds(minutesOrHours, secondsOrMinutes, fractionalOrSeconds, optionalFractional) {
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

function parseLRC(lrcText, globalOffsetMs = 0) {
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
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || /^\[(ti|ar|al|by|offset|length|re|ve|encoding):/i.test(trimmed)) continue;

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
        for (let j = 0; j < matches.length; j++) {
          const match = matches[j];
          const hasHours = Boolean(match[1]);
          const totalSeconds = hasHours
            ? parseTimestampToSeconds(match[1], match[2], match[3], match[4]) + offsetMs / 1000
            : parseTimestampToSeconds(match[2], match[3], match[4]) + offsetMs / 1000;

          result.push({
            time: Math.max(0, Math.round(totalSeconds * 1000) / 1000),
            text: text,
          });
        }
      }
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

// 1. Timestamp Normalization & Chronological Sorting
function normalizeLyrics(rawLyrics, trackDuration) {
  if (!rawLyrics) return [];

  if (typeof rawLyrics === 'string') {
    return parseLRC(rawLyrics);
  }

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
        .map(function (l) { return l.trim(); })
        .filter(Boolean)
        .map(function (text) { return { time: 0, text: text }; });
    }
    return [];
  }

  if (!Array.isArray(rawLyrics) || rawLyrics.length === 0) return [];

  const parsedLines = [];

  for (let i = 0; i < rawLyrics.length; i++) {
    const item = rawLyrics[i];
    if (!item) continue;

    if (typeof item === 'string') {
      const parsedItem = parseLRC(item);
      if (parsedItem.length > 0) {
        for (let k = 0; k < parsedItem.length; k++) {
          parsedLines.push(parsedItem[k]);
        }
      } else if (item.trim()) {
        parsedLines.push({ time: 0, text: item.trim() });
      }
      continue;
    }

    const text = (item.text ?? item.words ?? item.content ?? item.line ?? '').toString().trim();
    if (!text && !item.text) continue;

    let timeInSeconds = 0;

    if (item.startTimeMs !== undefined && item.startTimeMs !== null && item.startTimeMs !== '') {
      timeInSeconds = Math.max(0, parseFloat(String(item.startTimeMs)) / 1000);
    } else if (item.timeMs !== undefined && item.timeMs !== null && item.timeMs !== '') {
      timeInSeconds = Math.max(0, parseFloat(String(item.timeMs)) / 1000);
    } else if (typeof item.time === 'string') {
      const timeStr = item.time.trim();
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
      const isMilliseconds =
        item.time > 10000 ||
        (Boolean(trackDuration && trackDuration > 0) && item.time > trackDuration * 1.5);
      timeInSeconds = isMilliseconds ? item.time / 1000 : item.time;
    }

    parsedLines.push({
      time: Math.max(0, Math.round(timeInSeconds * 1000) / 1000),
      text: text,
    });
  }

  if (parsedLines.length === 0) return [];
  return parsedLines.sort((a, b) => a.time - b.time);
}

// 2. Off-Thread Substring Search in Lyrics
function searchLyrics(lyrics, query) {
  if (!Array.isArray(lyrics) || !query || !query.trim()) return [];
  const q = query.toLowerCase().trim();
  const matchedIndices = [];

  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i]?.text && lyrics[i].text.toLowerCase().includes(q)) {
      matchedIndices.push(i);
    }
  }

  return matchedIndices;
}

// 3. Off-Thread Massive Metadata Filtering
function filterTracks(items, query) {
  if (!Array.isArray(items) || !query || !query.trim()) return items || [];
  const q = query.toLowerCase().trim();

  return items.filter((it) => {
    const track = it?.track || it;
    const name = (track?.name || '').toLowerCase();
    let artist = '';
    if (Array.isArray(track?.artist)) {
      artist = track.artist.map((a) => (typeof a === 'string' ? a : a?.name || '')).join(' ').toLowerCase();
    } else {
      artist = (track?.artist?.name || track?.artist || '').toLowerCase();
    }
    return name.includes(q) || artist.includes(q);
  });
}

// Worker Message Dispatcher
self.onmessage = function (e) {
  const { id, type, payload } = e.data || {};

  try {
    switch (type) {
      case 'NORMALIZE_LYRICS': {
        const result = normalizeLyrics(payload.rawLyrics, payload.trackDuration);
        self.postMessage({ id, type: 'SUCCESS', result });
        break;
      }

      case 'SEARCH_LYRICS': {
        const result = searchLyrics(payload.lyrics, payload.query);
        self.postMessage({ id, type: 'SUCCESS', result });
        break;
      }

      case 'FILTER_TRACKS': {
        const result = filterTracks(payload.items, payload.query);
        self.postMessage({ id, type: 'SUCCESS', result });
        break;
      }

      default:
        self.postMessage({ id, type: 'ERROR', error: `Unknown task type: ${type}` });
    }
  } catch (err) {
    self.postMessage({ id, type: 'ERROR', error: err ? err.message : String(err) });
  }
};
