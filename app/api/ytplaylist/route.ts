import { NextResponse } from 'next/server';
import YTMusic from 'ytmusic-api';
import { MemoryCache } from '@/lib/apiCache';

export const dynamic = 'force-dynamic';

const ytmusic = new YTMusic();
let initialized = false;

// 2-Hour in-memory cache with request deduplication
const playlistCache = new MemoryCache(400, 1000 * 60 * 120);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id || id === 'undefined' || id === 'null') {
    return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 });
  }

  try {
    const data = await playlistCache.getOrFetch(id, async () => {
      if (!initialized) {
        await ytmusic.initialize();
        initialized = true;
      }

      try {
        const playlist = (await ytmusic.getPlaylist(id)) as any;
        let videos = playlist.videos || [];
        if (videos.length === 0) {
          try {
            videos = await ytmusic.getPlaylistVideos(id);
          } catch (e) {
            console.error('Failed to get playlist videos:', e);
          }
        }
        return {
          ...playlist,
          videos,
        };
      } catch (e: any) {
        // Fallback to album mapping
        const album = await ytmusic.getAlbum(id);
        return {
          playlistId: album.albumId,
          name: album.name,
          artist: album.artist,
          thumbnails: album.thumbnails,
          videos: album.songs.map((song: any) => ({
            videoId: song.videoId,
            name: song.name,
            artist: song.artist || [album.artist],
            duration: song.duration,
            thumbnails: song.thumbnails || album.thumbnails,
          })),
        };
      }
    });

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=7200, stale-while-revalidate=86400',
      },
    });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json({ error: 'ZodError', details: error.issues }, { status: 500 });
    }
    if (error?.isAxiosError && error?.response?.status === 400) {
      return NextResponse.json({ error: 'Invalid playlist/album ID' }, { status: 400 });
    }
    console.error(`Error fetching playlist/album for id ${id}:`, error?.message || error);
    return NextResponse.json({ error: 'Failed to fetch playlist' }, { status: 500 });
  }
}
