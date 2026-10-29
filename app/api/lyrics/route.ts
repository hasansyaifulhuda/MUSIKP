import { createErrorResponse, createSuccessResponse } from '@/lib/apiResponse';
import { MemoryCache } from '@/lib/cache';
import { ytmusicClient } from '@/lib/ytmusicClient';

export interface LyricLine {
  time: number;
  text: string;
}

export interface LyricsResult {
  synced: boolean;
  lyrics: LyricLine[];
  provider?: string;
}

// In-memory LRU cache for 24 hours (Only populated when lyrics are successfully found)
const lyricsCache = new MemoryCache<LyricsResult>(1000, 1000 * 60 * 60 * 24);

function parseTimestampToSeconds(
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
 * Supports standard and non-standard timestamps:
 * [hh:mm:ss.xxx], [mm:ss.xxx], [mm:ss.xx], [mm:ss:xx], [mm:ss,xx], [m:ss.xx], [mm:ss]
 * Multiple timestamp tags per line: [00:10.00][00:20.00]Repeated lyric line
 * Offset tags: [offset:+/-ms]
 */
function parseLRC(lrcText: string): LyricLine[] {
  if (!lrcText || typeof lrcText !== 'string') return [];
  const lines = lrcText.split('\n');
  const result: LyricLine[] = [];

  let offsetSeconds = 0;
  const offsetMatch = lrcText.match(/\[offset:\s*([+-]?\d+)\s*\]/i);
  if (offsetMatch) {
    const ms = parseInt(offsetMatch[1], 10);
    if (!isNaN(ms)) {
      offsetSeconds = ms / 1000;
    }
  }

  // Matches timestamps like [01:23.45], [01:23:45], [01:23,45], [01:23], [1:23.4]
  const tagRegex = /\[(?:(\d{1,2}):)?(\d{1,3}):(\d{2})(?:[.:,](\d{1,3}))?\]/g;

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
            ? parseTimestampToSeconds(match[1], match[2], match[3], match[4]) + offsetSeconds
            : parseTimestampToSeconds(match[2], match[3], match[4]) + offsetSeconds;

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
 * Cleanly formats plain lyrics text without artificial timestamps.
 * This guarantees plain lyrics display cleanly in comfortable reading mode
 * without erratic auto-scrolling or off-pitch jumps.
 */
function parsePlainLyrics(plainText: string, _totalDuration?: number): LyricLine[] {
  if (!plainText || typeof plainText !== 'string') return [];

  const rawLines = plainText
    .replaceAll('\r', '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (rawLines.length === 0) return [];

  return rawLines.map((text) => ({
    time: 0,
    text,
  }));
}

/**
 * Normalizes diacritics and special accent characters:
 * e.g. "eńau" -> "enau", "café" -> "cafe", "Björk" -> "Bjork"
 */
function normalizeDiacritics(str: string): string {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/**
 * Normalizes string for fuzzy similarity comparisons:
 * Removes diacritics, lowercase, removes all non-alphanumeric chars.
 */
function normalizeForComparison(str: string): string {
  return normalizeDiacritics(str)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Clean track title and artist from YouTube noise, video labels,
 * collaborative tags, and channel metadata.
 */
function cleanMetadata(rawTitle: string, rawArtist: string) {
  let cleanT = rawTitle || '';
  let cleanA = rawArtist || '';

  // Noise cleaning regex (YouTube tags, video types, audio quality labels)
  const noiseRegex = /\s*[\(\[\{](?:official\s*(?:music\s*)?(?:video|audio|visualizer|lyric|lyrics|lirik|mv)|hd|hq|4k|remix|acoustic|live|version|edit|karaoke|with\s+lyrics)[^\)\]\}]*[\)\]\}]/gi;
  cleanT = cleanT.replace(noiseRegex, '');
  cleanA = cleanA.replace(noiseRegex, '');

  // Extract featured collaborator if present
  let featArtist = '';
  const featMatch = cleanT.match(/\s*[\(\[\{]?(?:feat\.|ft\.|featuring)\s+([^\)\]\}]+)[\)\]\}]?/i);
  if (featMatch) {
    featArtist = featMatch[1].trim();
  }

  // Remove feat tags from main title
  cleanT = cleanT.replace(/\s*[\(\[\{]?(?:feat\.|ft\.|featuring)\s+[^\)\]\}]+[\)\]\}]?/gi, '');
  cleanT = cleanT.replace(/\b(?:feat\.|ft\.|featuring)\b.*$/gi, '');

  // Handle separator if Title contains 'Artist - Title'
  const separators = [' - ', ' – ', ' — '];
  for (const sep of separators) {
    if (cleanT.includes(sep)) {
      const parts = cleanT.split(sep);
      if (parts.length >= 2) {
        const p0 = parts[0].trim();
        const p1 = parts.slice(1).join(sep).trim();
        const isUnknownArtist = !cleanA || cleanA.toLowerCase() === 'unknown artist' || cleanA.toLowerCase() === 'artis';

        if (isUnknownArtist) {
          cleanA = p0;
          cleanT = p1;
        } else if (cleanA.toLowerCase().includes(p0.toLowerCase()) || p0.toLowerCase().includes(cleanA.toLowerCase())) {
          cleanT = p1;
        } else {
          // Default to track title = p1 if p0 looks like artist
          cleanT = p1;
        }
      }
      break;
    }
  }

  // Filter out placeholder artist names
  if (
    cleanA.toLowerCase() === 'unknown artist' ||
    cleanA.toLowerCase() === 'artis' ||
    cleanA.toLowerCase() === 'unknown'
  ) {
    cleanA = '';
  }

  // Remove YouTube channel artifacts from artist
  cleanA = cleanA.replace(/\s*-\s*Topic$/i, '').replace(/\s*Official$/i, '').replace(/VEVO$/i, '');

  cleanT = cleanT.replace(/["'“”]/g, '').replace(/\s+/g, ' ').trim();
  cleanA = cleanA.replace(/["'“”]/g, '').replace(/\s+/g, ' ').trim();

  return {
    cleanTitle: cleanT || rawTitle,
    cleanArtist: cleanA,
    featArtist,
  };
}

/**
 * Intelligent Scoring Algorithm for Candidate Matching:
 * Evaluates candidate suitability based on synced status, title match, artist match, and duration.
 */
function scoreCandidate(candidate: any, targetTitle: string, targetArtist: string, targetDuration: number): number {
  let score = 0;

  const hasSynced = candidate.syncedLyrics && typeof candidate.syncedLyrics === 'string' && candidate.syncedLyrics.trim().length > 20;
  const hasPlain = candidate.plainLyrics && typeof candidate.plainLyrics === 'string' && candidate.plainLyrics.trim().length > 20;

  if (hasSynced) {
    score += 60;
  } else if (hasPlain) {
    score += 25;
  } else {
    return -100; // No valid lyrics text
  }

  const candTitle = normalizeForComparison(candidate.trackName || candidate.name || '');
  const candArtist = normalizeForComparison(candidate.artistName || '');
  const normTargetTitle = normalizeForComparison(targetTitle);
  const normTargetArtist = normalizeForComparison(targetArtist);

  // Title match scoring
  if (normTargetTitle && candTitle) {
    if (candTitle === normTargetTitle) {
      score += 40;
    } else if (candTitle.includes(normTargetTitle) || normTargetTitle.includes(candTitle)) {
      score += 25;
    }
  }

  // Artist match scoring
  if (normTargetArtist && candArtist) {
    if (candArtist === normTargetArtist) {
      score += 30;
    } else if (candArtist.includes(normTargetArtist) || normTargetArtist.includes(candArtist)) {
      score += 20;
    }
  }

  // Duration match scoring (soft tolerance for intros/outros)
  if (targetDuration > 0 && candidate.duration > 0) {
    const diff = Math.abs(candidate.duration - targetDuration);
    if (diff <= 4) {
      score += 15;
    } else if (diff <= 12) {
      score += 10;
    } else if (diff <= 25) {
      score += 5;
    }
  }

  return score;
}

/**
 * Robust fetch for LRCLIB with official client headers, 503 ServerOverloaded retry, and ultra-fast timeout
 */
async function fetchLrclib(url: string, timeoutMs: number = 1800): Promise<any[]> {
  const headers = {
    'User-Agent': 'MusicFY/3.0 (Web Music Player; https://github.com/hasansyaifulhuda/MUSIKP; contact: support@musicfy.app)',
    'Lrclib-Client': 'MusicFY-Player',
    Accept: 'application/json',
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    const currentTimeout = attempt === 0 ? timeoutMs : 1000;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      try {
        controller.abort();
      } catch {}
    }, currentTimeout);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers,
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
        if (data && typeof data === 'object' && data.id) return [data];
      }

      // If LRCLIB is experiencing a momentary spike (503 ServerOverloaded), back off briefly and retry once
      if (res.status === 503 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      return [];
    } catch {
      clearTimeout(timer);
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      return [];
    }
  }

  return [];
}

/**
 * Strictly evaluates candidates and extracts the best MATCH with VALID SYNCED LYRICS.
 * Guarantees that only valid timestamped lyrics with at least 2 lines and positive duration are accepted.
 */
function extractBestSyncedLyrics(
  candidates: any[],
  targetTitle: string,
  targetArtist: string,
  duration: number
): LyricsResult | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const validSyncedCandidates = candidates.filter(
    (c) =>
      c &&
      typeof c === 'object' &&
      typeof c.syncedLyrics === 'string' &&
      c.syncedLyrics.trim().length > 20
  );

  if (validSyncedCandidates.length === 0) return null;

  // Score all candidates
  const scored = validSyncedCandidates
    .map((cand) => ({
      candidate: cand,
      score: scoreCandidate(cand, targetTitle, targetArtist, duration),
    }))
    .sort((a, b) => b.score - a.score);

  for (const { candidate } of scored) {
    const parsed = parseLRC(candidate.syncedLyrics);
    // Strict validation: must have at least 2 valid timestamped lines, strictly non-negative finite numbers
    const isValidSynced =
      parsed.length >= 2 &&
      parsed.every((l) => typeof l.time === 'number' && !isNaN(l.time) && isFinite(l.time) && l.time >= 0) &&
      parsed.some((l) => l.time > 0);

    if (isValidSynced) {
      return {
        synced: true,
        lyrics: parsed,
        provider: 'LRCLIB (Synced)',
      };
    }
  }

  return null;
}

/**
 * Extracts plain lyrics ONLY as a last-resort fallback when NO synced lyrics exist.
 */
function extractBestPlainLyrics(
  candidates: any[],
  targetTitle: string,
  targetArtist: string,
  duration: number
): LyricsResult | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const validPlainCandidates = candidates.filter(
    (c) =>
      c &&
      typeof c === 'object' &&
      typeof c.plainLyrics === 'string' &&
      c.plainLyrics.trim().length > 20
  );

  if (validPlainCandidates.length === 0) return null;

  const scored = validPlainCandidates
    .map((cand) => ({
      candidate: cand,
      score: scoreCandidate(cand, targetTitle, targetArtist, duration),
    }))
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    const best = scored[0].candidate;
    const parsed = parsePlainLyrics(best.plainLyrics, duration);
    if (parsed.length > 0) {
      return {
        synced: false,
        lyrics: parsed,
        provider: 'LRCLIB (Plain Fallback)',
      };
    }
  }

  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id') || '';
  const rawTitle = searchParams.get('title') || '';
  const rawArtist = searchParams.get('artist') || '';
  const durationParam = searchParams.get('duration');
  const duration = durationParam ? parseFloat(durationParam) : 200;
  const force = searchParams.get('force') === 'true' || searchParams.get('force') === '1';

  if (!id && !rawTitle) {
    return createErrorResponse('Parameter "id" atau "title" wajib disertakan.', 400);
  }

  // Clean metadata from video tags, noise, and featured labels
  const { cleanTitle, cleanArtist, featArtist } = cleanMetadata(rawTitle, rawArtist);
  const cacheKey = `${id}_${cleanTitle}_${cleanArtist}`.toLowerCase();

  // If forced retry requested, purge cached records
  if (force) {
    lyricsCache.delete(cacheKey);
    if (id) lyricsCache.delete(`vid:${id}`);
  }

  // Check in-memory cache
  if (!force) {
    const cached = lyricsCache.get(cacheKey) || (id ? lyricsCache.get(`vid:${id}`) : null);
    if (cached && Array.isArray(cached.lyrics) && cached.lyrics.length > 0) {
      return createSuccessResponse(cached, 'Lirik lagu berhasil dimuat (Cache)', 200, {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
        'X-Cache': 'HIT',
      });
    }
  }

  // =========================================================================
  // MULTI-LAYER SEARCH MECHANISM (Strict Synced-Lyrics-First Priority)
  // Concurrent parallel execution of specific query (Title + Artist) and
  // fallback broad query (Title only) to guarantee < 2.5s response time.
  // =========================================================================

  const specificPromise = (async (): Promise<any[]> => {
    if (!cleanArtist) return [];
    const urls: string[] = [
      `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanTitle} ${cleanArtist}`)}`,
      `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(cleanArtist)}&duration=${Math.round(duration)}`,
    ];
    if (featArtist) {
      urls.push(`https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanTitle} ${cleanArtist} ${featArtist}`)}`);
    }
    const settled = await Promise.all(urls.map((u) => fetchLrclib(u, 1800)));
    return settled.flat();
  })();

  const broadPromise = (async (): Promise<any[]> => {
    const urls: string[] = [
      `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)}`,
    ];
    const settled = await Promise.all(urls.map((u) => fetchLrclib(u, 1800)));
    return settled.flat();
  })();

  // Execute both queries concurrently
  const [candidates1, candidates2] = await Promise.all([specificPromise, broadPromise]);

  // -------------------------------------------------------------------------
  // PRIORITY CHECK 1: Specific search candidates with VALID SYNCED LYRICS
  // -------------------------------------------------------------------------
  const syncedResult1 = extractBestSyncedLyrics(candidates1, cleanTitle, cleanArtist, duration);
  if (syncedResult1) {
    lyricsCache.set(cacheKey, syncedResult1);
    if (id) lyricsCache.set(`vid:${id}`, syncedResult1);
    return createSuccessResponse(syncedResult1, 'Lirik lagu berhasil dimuat (Synced)', 200, {
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
    });
  }

  // -------------------------------------------------------------------------
  // PRIORITY CHECK 2: Synced-First Fallback Search (Title Only across DB)
  // MANDAT 1: Jika hasil spesifik hanya teks biasa (atau kosong), sistem
  // WAJIB melanjutkan pencarian fallback ke entri/rilis lain di database yang
  // memiliki syncedLyrics terlebih dahulu SEBELUM menyerah ke teks biasa!
  // -------------------------------------------------------------------------
  const syncedResult2 = extractBestSyncedLyrics(candidates2, cleanTitle, cleanArtist, duration);
  if (syncedResult2) {
    lyricsCache.set(cacheKey, syncedResult2);
    if (id) lyricsCache.set(`vid:${id}`, syncedResult2);
    return createSuccessResponse(syncedResult2, 'Lirik lagu berhasil dimuat (Fallback Synced)', 200, {
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
    });
  }

  // -------------------------------------------------------------------------
  // STAGE 3: Plain Lyrics Last-Resort Fallback
  // Only reached if NO candidate in Stage 1 OR Stage 2 has synced lyrics!
  // -------------------------------------------------------------------------
  const plainResult1 = extractBestPlainLyrics(candidates1, cleanTitle, cleanArtist, duration);
  if (plainResult1) {
    lyricsCache.set(cacheKey, plainResult1);
    if (id) lyricsCache.set(`vid:${id}`, plainResult1);
    return createSuccessResponse(plainResult1, 'Lirik lagu dimuat (Mode Teks Biasa)', 200, {
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
    });
  }

  const plainResult2 = extractBestPlainLyrics(candidates2, cleanTitle, cleanArtist, duration);
  if (plainResult2) {
    lyricsCache.set(cacheKey, plainResult2);
    if (id) lyricsCache.set(`vid:${id}`, plainResult2);
    return createSuccessResponse(plainResult2, 'Lirik lagu dimuat (Mode Teks Biasa Fallback)', 200, {
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
    });
  }

  // -------------------------------------------------------------------------
  // LAYER 3: Secondary External Public APIs (Lyrics.ovh & YouTube Music Native)
  // -------------------------------------------------------------------------
  const secondaryPromises: Promise<LyricsResult | null>[] = [];

  // 3A. Free public Lyrics.ovh API
  if (cleanArtist && cleanTitle) {
    secondaryPromises.push(
      (async () => {
        try {
          const ovhUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`;
          const ovhRes = await fetch(ovhUrl, { signal: AbortSignal.timeout(2200) });
          if (ovhRes.ok) {
            const ovhData = await ovhRes.json();
            if (ovhData.lyrics && typeof ovhData.lyrics === 'string') {
              const cleanOvh = ovhData.lyrics.replace(/^.*Paroles de la chanson.*\n?/im, '').trim();
              if (cleanOvh.length > 20) {
                const parsed = parsePlainLyrics(cleanOvh, duration);
                if (parsed.length > 0) {
                  return { synced: false, lyrics: parsed, provider: 'Lyrics.ovh' };
                }
              }
            }
          }
        } catch {}
        return null;
      })()
    );
  }

  // 3B. YouTube Music Native Transcript Lyrics (if videoId provided)
  if (id && id.length === 11) {
    secondaryPromises.push(
      (async () => {
        try {
          const ready = await ytmusicClient.ensureInitialized();
          if (ready) {
            const ytmusic = ytmusicClient.getRawInstance();
            const watchPlaylistData = await (ytmusic as any).constructRequest('next', { videoId: id });
            const tabs = watchPlaylistData?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs;
            let lyricsId = null;

            if (tabs) {
              for (const tab of tabs) {
                const tabRenderer = tab.tabRenderer;
                if (
                  tabRenderer?.endpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig
                    ?.pageType === 'MUSIC_PAGE_TYPE_TRACK_LYRICS'
                ) {
                  lyricsId = tabRenderer.endpoint.browseEndpoint.browseId;
                  break;
                }
              }
            }

            if (lyricsId) {
              const lyricsData = await (ytmusic as any).constructRequest('browse', { browseId: lyricsId });
              const runs = lyricsData?.contents?.sectionListRenderer?.contents?.[0]?.musicDescriptionShelfRenderer?.description?.runs;
              let lyricsText = null;

              if (runs) {
                lyricsText = runs.map((r: any) => r.text).join('');
              }

              if (lyricsText && !lyricsText.includes('Lyrics not available') && lyricsText.trim().length > 20) {
                const parsedL = parsePlainLyrics(lyricsText, duration);
                if (parsedL.length > 0) {
                  return { synced: false, lyrics: parsedL, provider: 'YouTube Music' };
                }
              }
            }
          }
        } catch {}
        return null;
      })()
    );
  }

  if (secondaryPromises.length > 0) {
    const secondaryResults = await Promise.all(secondaryPromises);
    const validSecondary = secondaryResults.find((r) => r !== null);
    if (validSecondary) {
      lyricsCache.set(cacheKey, validSecondary);
      if (id) lyricsCache.set(`vid:${id}`, validSecondary);
      return createSuccessResponse(validSecondary, `Lirik lagu berhasil dimuat (${validSecondary.provider})`, 200);
    }
  }

  // If no lyrics could be found across all layers:
  return createSuccessResponse(
    { synced: false, lyrics: [] },
    'Lirik lagu belum tersedia',
    200
  );
}
