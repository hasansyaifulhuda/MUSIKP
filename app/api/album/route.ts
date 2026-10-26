import { NextResponse } from 'next/server';
import YTMusic from 'ytmusic-api';
import { MemoryCache } from '@/lib/apiCache';

export const dynamic = 'force-dynamic';

const ytmusic = new YTMusic();
let initialized = false;

// 2-Hour in-memory cache for albums
const albumCache = new MemoryCache(300, 1000 * 60 * 120);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Album ID is required' }, { status: 400 });
  }

  try {
    const album = await albumCache.getOrFetch(id, async () => {
      if (!initialized) {
        await ytmusic.initialize();
        initialized = true;
      }
      return await ytmusic.getAlbum(id);
    });

    return NextResponse.json(album, {
      headers: {
        'Cache-Control': 'public, s-maxage=7200, stale-while-revalidate=86400',
      },
    });
  } catch (error: any) {
    if (error?.isAxiosError && error?.response?.status === 400) {
      return NextResponse.json({ error: 'Invalid album ID' }, { status: 400 });
    }
    console.error(`Album error for id ${id}:`, error?.message || error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
