import { NextResponse } from 'next/server';
import YTMusic from 'ytmusic-api';
import { MemoryCache } from '@/lib/apiCache';

export const dynamic = 'force-dynamic';

const ytmusic = new YTMusic();
let initialized = false;

// 2-Hour in-memory cache for up next tracks
const upNextCache = new MemoryCache(400, 1000 * 60 * 120);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  try {
    const normalized = await upNextCache.getOrFetch(id, async () => {
      if (!initialized) {
        await ytmusic.initialize();
        initialized = true;
      }
      const upNext = await ytmusic.getUpNexts(id);

      return (upNext || []).map((item: any) => ({
        videoId: item.videoId,
        name: item.title || item.name || 'Unknown Track',
        artist:
          typeof item.artists === 'string'
            ? { name: item.artists }
            : item.artist || { name: 'Unknown Artist' },
        thumbnails: item.thumbnail
          ? [{ url: item.thumbnail, width: 300, height: 300 }]
          : item.thumbnails || [],
        duration:
          typeof item.duration === 'string'
            ? item.duration.split(':').reduce((acc: number, time: string) => 60 * acc + +time, 0)
            : typeof item.duration === 'number'
            ? item.duration
            : undefined,
      }));
    });

    return NextResponse.json(normalized, {
      headers: {
        'Cache-Control': 'public, s-maxage=7200, stale-while-revalidate=86400',
      },
    });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json([]);
    }
    if (error?.message?.includes('Invalid videoId') || (error?.isAxiosError && error?.response?.status === 400)) {
      return NextResponse.json([]);
    }
    console.error(`UpNext error for id ${id}:`, error?.message || error);
    return NextResponse.json([]);
  }
}
