import { createErrorResponse, createSuccessResponse } from '@/lib/apiResponse';
import { MemoryCache } from '@/lib/cache';
import { ytmusicClient } from '@/lib/ytmusicClient';

interface LyricLine {
  time: number;
  text: string;
}

const lyricsCache = new MemoryCache<{ synced: boolean; lyrics: LyricLine[] }>(600, 1000 * 60 * 60 * 24);

function parseLRC(lrcText: string): LyricLine[] {
  if (!lrcText) return [];
  const lines = lrcText.split('\n');
  const result: LyricLine[] = [];

  let offsetSeconds = 0;
  // Parse global [offset:+/-ms] tag if present
  const offsetMatch = lrcText.match(/\[offset:\s*([+-]?\d+)\s*\]/i);
  if (offsetMatch) {
    const ms = parseInt(offsetMatch[1], 10);
    if (!isNaN(ms)) {
      offsetSeconds = ms / 1000;
    }
  }

  // Matches timestamps like [01:23.45], [01:23:45], [01:23], [1:23.4]
  const tagRegex = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Skip metadata headers
    if (/^\[(ti|ar|al|by|offset|length|re|ve):/i.test(trimmed)) {
      continue;
    }

    const matches = Array.from(trimmed.matchAll(tagRegex));
    if (matches.length > 0) {
      const text = trimmed.replace(tagRegex, '').trim();
      if (text) {
        for (const match of matches) {
          const minutes = parseFloat(match[1]);
          const seconds = parseFloat(match[2]);
          const msStr = match[3] || '0';
          const ms = parseFloat(msStr) / Math.pow(10, msStr.length);
          const totalSeconds = Math.max(0, minutes * 60 + seconds + ms + offsetSeconds);
          result.push({
            time: Math.round(totalSeconds * 100) / 100,
            text,
          });
        }
      }
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

function parsePlainLyrics(plainText: string, totalDuration: number = 200): LyricLine[] {
  const rawLines = plainText
    .replaceAll('\r', '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (rawLines.length === 0) return [];

  const startOffset = Math.min(10, totalDuration * 0.05);
  const endOffset = Math.max(startOffset + 10, totalDuration * 0.95);
  const step = (endOffset - startOffset) / Math.max(1, rawLines.length);

  return rawLines.map((text, i) => ({
    time: Math.round((startOffset + i * step) * 10) / 10,
    text,
  }));
}

function sanitizeText(str: string): string {
  return str
    .replace(/\([^)]*(?:official|video|audio|lyric|mv|remix|version)[^)]*\)/gi, '')
    .replace(/\[[^\]]*(?:official|video|audio|lyric|mv|remix|version)[^\]]*\]/gi, '')
    .replace(/\b(?:feat\.|ft\.|featuring)\b.*$/gi, '')
    .replace(/[\(\)\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const title = searchParams.get('title') || '';
  const artist = searchParams.get('artist') || '';
  const durationParam = searchParams.get('duration');
  const duration = durationParam ? parseFloat(durationParam) : 200;

  if (!id && !title) {
    return createErrorResponse('Parameter "id" atau "title" wajib disertakan.', 400);
  }

  // Cache key
  const cacheKey = `${id || ''}_${title}_${artist}`.toLowerCase();
  const cached = lyricsCache.get(cacheKey);
  if (cached) {
    return createSuccessResponse(cached, 'Lirik lagu berhasil dimuat', 200, {
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      'X-Cache': 'HIT',
    });
  }

  const cleanTitle = sanitizeText(title);
  const cleanArtist = sanitizeText(artist);

  // Helper for safe fetch with timeout
  const fetchWithTimeout = async (url: string, timeoutMs: number = 3000) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'PMUSIC/2.0' },
      });
      clearTimeout(timeout);
      return res;
    } catch {
      clearTimeout(timeout);
      return null;
    }
  };

  const result = await lyricsCache.getOrFetch(cacheKey, async () => {
    // 1. TIER 1: LRCLIB /api/get (exact match)
    if (cleanTitle) {
      try {
        const getUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(cleanArtist || cleanTitle)}` +
          (duration > 0 ? `&duration=${Math.round(duration)}` : '');
        const res = await fetchWithTimeout(getUrl, 2500);
        if (res && res.ok) {
          const data = await res.json();
          if (data.syncedLyrics) {
            const parsed = parseLRC(data.syncedLyrics);
            if (parsed.length > 0) return { synced: true, lyrics: parsed };
          } else if (data.plainLyrics) {
            const parsed = parsePlainLyrics(data.plainLyrics, duration);
            if (parsed.length > 0) return { synced: false, lyrics: parsed };
          }
        }
      } catch {}
    }

    // 2. TIER 2: LRCLIB /api/search with track_name & artist_name
    if (cleanTitle) {
      try {
        const searchUrl = `https://lrclib.net/api/search?track_name=${encodeURIComponent(cleanTitle)}` +
          (cleanArtist ? `&artist_name=${encodeURIComponent(cleanArtist)}` : '');
        const res = await fetchWithTimeout(searchUrl, 3000);
        if (res && res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const candidates = [...data].sort((a, b) => {
              if (a.syncedLyrics && !b.syncedLyrics) return -1;
              if (!a.syncedLyrics && b.syncedLyrics) return 1;
              const diffA = Math.abs((a.duration || duration) - duration);
              const diffB = Math.abs((b.duration || duration) - duration);
              return diffA - diffB;
            });

            const best = candidates[0];
            if (best?.syncedLyrics) {
              const parsed = parseLRC(best.syncedLyrics);
              if (parsed.length > 0) return { synced: true, lyrics: parsed };
            } else if (best?.plainLyrics) {
              const parsed = parsePlainLyrics(best.plainLyrics, duration);
              if (parsed.length > 0) return { synced: false, lyrics: parsed };
            }
          }
        }
      } catch {}
    }

    // 3. TIER 3: LRCLIB /api/search with query string
    if (cleanTitle) {
      try {
        const queryStr = `${cleanTitle} ${cleanArtist}`.trim();
        const qSearchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(queryStr)}`;
        const res = await fetchWithTimeout(qSearchUrl, 3000);
        if (res && res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const candidates = [...data].sort((a, b) => {
              if (a.syncedLyrics && !b.syncedLyrics) return -1;
              if (!a.syncedLyrics && b.syncedLyrics) return 1;
              const diffA = Math.abs((a.duration || duration) - duration);
              const diffB = Math.abs((b.duration || duration) - duration);
              return diffA - diffB;
            });

            const best = candidates[0];
            if (best?.syncedLyrics) {
              const parsed = parseLRC(best.syncedLyrics);
              if (parsed.length > 0) return { synced: true, lyrics: parsed };
            } else if (best?.plainLyrics) {
              const parsed = parsePlainLyrics(best.plainLyrics, duration);
              if (parsed.length > 0) return { synced: false, lyrics: parsed };
            }
          }
        }
      } catch {}
    }

    // 4. TIER 4: Fallback to YouTube Music Lyrics tab if video ID is available
    if (id && id.length === 11) {
      try {
        const ready = await ytmusicClient.ensureInitialized();
        if (ready) {
          const ytmusic = ytmusicClient.getRawInstance();
          const watchPlaylistData = await (ytmusic as any).constructRequest('next', { videoId: id });
        let lyricsId = null;
        const tabs = watchPlaylistData?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs;

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

          if (lyricsText && !lyricsText.includes('Lyrics not available')) {
            const parsed = parsePlainLyrics(lyricsText, duration);
            return { synced: false, lyrics: parsed };
          }
        }
      }
    } catch (e: any) {
        if (e.message !== 'Invalid videoId') {
          console.error('Error fetching YouTube Music lyrics:', e?.message || e);
        }
      }
    }

    // 5. TIER 5: Fallback to Lyrics.ovh API for plain lyrics
    if (cleanTitle && cleanArtist) {
      try {
        const ovhUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`;
        const res = await fetchWithTimeout(ovhUrl, 2500);
        if (res && res.ok) {
          const ovhData = await res.json();
          if (ovhData.lyrics && typeof ovhData.lyrics === 'string') {
            const cleanOvhText = ovhData.lyrics
              .replace(/^.*Paroles de la chanson.*\n?/im, '')
              .replace(/\[[^\]]+\]/g, '')
              .trim();
            if (cleanOvhText.length > 20) {
              const parsed = parsePlainLyrics(cleanOvhText, duration);
              if (parsed.length > 0) return { synced: false, lyrics: parsed };
            }
          }
        }
      } catch {}
    }

    return { synced: false, lyrics: [] };
  });

  return createSuccessResponse(result, 'Lirik lagu berhasil dimuat', 200, {
    'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
    'X-Cache': 'MISS',
  });
}
