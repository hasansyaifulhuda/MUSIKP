import YTMusic from 'ytmusic-api';
import { searchCache } from '@/lib/cache';
import { searchLimiter, getClientIp, createRateLimitResponse } from '@/lib/rateLimit';
import { createErrorResponse, createSuccessResponse } from '@/lib/apiResponse';

export const dynamic = 'force-dynamic';

const ytmusic = new YTMusic();
let initialized = false;

/**
 * Clean multi-tier fallback to iTunes Catalog Search.
 * Completely immune to YouTube rate limits, 403 Forbidden, and VPS IP blocks.
 */
async function searchItunesCatalog(query: string, type: string) {
  try {
    const itunesEntity = type === 'artist' ? 'musicArtist' : type === 'album' ? 'album' : 'song';
    const limit = 30;
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=${itunesEntity}&limit=${limit}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data.results) || data.results.length === 0) return [];

    if (type === 'artist') {
      return data.results.map((item: any) => ({
        artistId: String(item.artistId),
        name: item.artistName,
        type: 'ARTIST',
      }));
    }

    if (type === 'album') {
      return data.results.map((item: any) => ({
        albumId: String(item.collectionId),
        name: item.collectionName,
        artist: { name: item.artistName, artistId: item.artistId ? String(item.artistId) : undefined },
        thumbnails: [
          {
            url: item.artworkUrl100?.replace('100x100bb.jpg', '600x600bb.jpg') || item.artworkUrl100,
            width: 600,
            height: 600,
          },
          { url: item.artworkUrl100, width: 100, height: 100 },
        ],
        type: 'ALBUM',
      }));
    }

    // Default: Song tracks
    return data.results.map((item: any) => ({
      videoId: `itunes:${item.trackId}`,
      youtubeId: `itunes:${item.trackId}`,
      name: item.trackName,
      artist: { name: item.artistName, artistId: item.artistId ? String(item.artistId) : undefined },
      album: item.collectionName ? { name: item.collectionName } : undefined,
      thumbnails: [
        {
          url: item.artworkUrl100?.replace('100x100bb.jpg', '600x600bb.jpg') || item.artworkUrl100,
          width: 600,
          height: 600,
        },
        { url: item.artworkUrl100, width: 100, height: 100 },
      ],
      duration: item.trackTimeMillis ? Math.round(item.trackTimeMillis / 1000) : undefined,
      isExplicit: item.trackExplicitness === 'explicit',
      type: 'SONG',
    }));
  } catch (err) {
    console.warn('[SearchRoute] iTunes fallback search failed or timed out:', err);
    return [];
  }
}

export async function GET(request: Request) {
  // 1. In-Memory Rate Limiting
  const clientIp = getClientIp(request);
  const rateLimit = searchLimiter.check(clientIp);
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

  // 2. Query Parameter Validation
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const type = searchParams.get('type') || 'combined';

  if (!query || !query.trim()) {
    return createErrorResponse('Parameter query "q" wajib disertakan.', 400);
  }

  const cleanQuery = query.trim();
  const cacheKey = `${type}:${cleanQuery.toLowerCase()}`;

  try {
    const data = await searchCache.getOrFetch(cacheKey, async () => {
      // -------------------------------------------------------------
      // Tier 1: YouTube Music API
      // -------------------------------------------------------------
      let ytSuccess = false;
      let ytResults: any[] = [];

      try {
        if (!initialized) {
          await Promise.race([
            ytmusic.initialize(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('YTMusic init timeout')), 5000)),
          ]);
          initialized = true;
        }

        if (type === 'playlist') {
          const playlists = await ytmusic.searchPlaylists(cleanQuery).catch(() => []);
          ytResults = playlists.filter((p: any) => p.playlistId && !p.playlistId.startsWith('RD'));
          ytSuccess = ytResults.length > 0;
        } else if (type === 'artist') {
          ytResults = await ytmusic.searchArtists(cleanQuery).catch(() => []);
          ytSuccess = ytResults.length > 0;
        } else if (type === 'song') {
          ytResults = await ytmusic.searchSongs(cleanQuery).catch(() => []);
          ytSuccess = ytResults.length > 0;
        } else if (type === 'video') {
          ytResults = await ytmusic.searchVideos(cleanQuery).catch(() => []);
          ytSuccess = ytResults.length > 0;
        } else if (type === 'all') {
          ytResults = await ytmusic.search(cleanQuery).catch(() => []);
          ytSuccess = ytResults.length > 0;
        } else {
          // Default: combined search
          const songs = await ytmusic.searchSongs(cleanQuery).catch(() => []);
          const videos = await ytmusic.searchVideos(cleanQuery).catch(() => []);
          const artists = await ytmusic.searchArtists(cleanQuery).catch(() => []);
          ytResults = [...songs, ...videos, ...artists];
          ytSuccess = ytResults.length > 0;
        }
      } catch (ytErr) {
        console.warn('[SearchRoute] YTMusic primary search failed or blocked:', ytErr);
        ytSuccess = false;
      }

      if (ytSuccess && ytResults.length > 0) {
        return ytResults;
      }

      // -------------------------------------------------------------
      // Tier 2: Automatic Fallback to Clean iTunes Catalog
      // -------------------------------------------------------------
      console.info(`[SearchRoute] Triggering Tier 2 iTunes fallback for query "${cleanQuery}"...`);
      const itunesResults = await searchItunesCatalog(cleanQuery, type);
      return itunesResults;
    });

    return createSuccessResponse(
      data,
      'Hasil pencarian berhasil didapatkan',
      200,
      {
        'Cache-Control': 'public, s-maxage=7200, stale-while-revalidate=86400',
        'X-RateLimit-Remaining': String(rateLimit.remaining),
      }
    );
  } catch (error: any) {
    console.error('[SearchRoute] Unexpected search API error:', error);
    return createErrorResponse(
      error?.message || 'Terjadi kesalahan sistem saat melakukan pencarian.',
      500
    );
  }
}
