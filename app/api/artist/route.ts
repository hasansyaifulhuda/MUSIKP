import { NextResponse } from 'next/server';
import YTMusic from 'ytmusic-api';
import { MemoryCache } from '@/lib/apiCache';

export const dynamic = 'force-dynamic';

const ytmusic = new YTMusic();
let initialized = false;

// 2-Hour in-memory cache for artist profiles
const artistCache = new MemoryCache(200, 1000 * 60 * 120);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'Artist ID required' }, { status: 400 });

  try {
    const artist = await artistCache.getOrFetch(id, async () => {
      if (!initialized) {
        await ytmusic.initialize();
        initialized = true;
      }
      const data = await ytmusic.getArtist(id);

      // Fix ytmusic-api bug where carousels are shifted for artists with extra carousels (like "Live performances")
      if (data.featuredOn && data.featuredOn.length > 0 && data.featuredOn[0].playlistId === data.artistId) {
        const videos = data.featuredOn.map((item: any) => {
          let videoId = item.playlistId;
          if (item.thumbnails && item.thumbnails.length > 0) {
            const match = item.thumbnails[0].url.match(/\/vi\/([a-zA-Z0-9-_]{11})\//);
            if (match) videoId = match[1];
          }
          return { ...item, type: 'VIDEO', videoId };
        });

        if (
          data.similarArtists &&
          data.similarArtists.length > 0 &&
          (data.similarArtists[0].artistId.startsWith('VL') ||
            data.similarArtists[0].artistId.startsWith('PL') ||
            data.similarArtists[0].artistId.startsWith('RD'))
        ) {
          data.featuredOn = data.similarArtists.map((item: any) => ({
            type: 'PLAYLIST',
            playlistId: item.artistId,
            name: item.name,
            artist: { name: data.name, artistId: data.artistId },
            thumbnails: item.thumbnails,
          }));
          data.similarArtists = [];
        } else {
          data.featuredOn = [];
        }

        (data as any).livePerformances = videos;
      }

      return data;
    });

    return NextResponse.json(artist, {
      headers: {
        'Cache-Control': 'public, s-maxage=7200, stale-while-revalidate=86400',
      },
    });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json({ error: 'ZodError', details: error.issues }, { status: 500 });
    }
    if (error?.isAxiosError && error?.response?.status === 400) {
      return NextResponse.json({ error: 'Invalid artist ID' }, { status: 400 });
    }
    console.error(`Artist error for id ${id}:`, error?.message || error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
