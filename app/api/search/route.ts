import { NextResponse } from 'next/server';
import YTMusic from 'ytmusic-api';
import { MemoryCache } from '@/lib/apiCache';

export const dynamic = 'force-dynamic';

const ytmusic = new YTMusic();
let initialized = false;

// 1-Hour in-memory cache with automatic LRU eviction and in-flight request deduplication
const searchCache = new MemoryCache(800, 1000 * 60 * 60);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const type = searchParams.get('type') || 'combined';

  if (!query) return NextResponse.json({ error: 'Query required' }, { status: 400 });

  const cacheKey = `${type}:${query.toLowerCase().trim()}`;

  try {
    const data = await searchCache.getOrFetch(cacheKey, async () => {
      if (!initialized) {
        await ytmusic.initialize();
        initialized = true;
      }

      if (type === 'playlist') {
        const playlists = await ytmusic
          .searchPlaylists(query)
          .catch((e) => {
            console.error('Error searching playlists:', e.name === 'ZodError' ? 'ZodError' : e);
            return [];
          });
        return playlists.filter((p: any) => p.playlistId && !p.playlistId.startsWith('RD'));
      }

      if (type === 'artist') {
        return await ytmusic.searchArtists(query).catch((e) => {
          console.error('Error searching artists:', e.name === 'ZodError' ? 'ZodError' : e);
          return [];
        });
      }

      if (type === 'song') {
        return await ytmusic.searchSongs(query).catch((e) => {
          console.error('Error searching songs:', e.name === 'ZodError' ? 'ZodError' : e);
          return [];
        });
      }

      if (type === 'video') {
        return await ytmusic.searchVideos(query).catch((e) => {
          console.error('Error searching videos:', e.name === 'ZodError' ? 'ZodError' : e);
          return [];
        });
      }

      if (type === 'all') {
        return await ytmusic.search(query).catch((e) => {
          console.error('Error searching all:', e.name === 'ZodError' ? 'ZodError' : e);
          return [];
        });
      }

      // Default: Sequential fallback to avoid 403 rate limits
      const songs = await ytmusic.searchSongs(query).catch(() => []);
      const videos = await ytmusic.searchVideos(query).catch(() => []);
      const artists = await ytmusic.searchArtists(query).catch(() => []);
      return [...songs, ...videos, ...artists];
    });

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Search API route error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
