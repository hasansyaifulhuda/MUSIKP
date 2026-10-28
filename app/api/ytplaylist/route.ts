import YTMusic from 'ytmusic-api';
import { metadataCache } from '@/lib/cache';
import { createErrorResponse, createSuccessResponse } from '@/lib/apiResponse';

export const dynamic = 'force-dynamic';

const ytmusic = new YTMusic();
let initialized = false;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id || id === 'undefined' || id === 'null' || !id.trim()) {
    return createErrorResponse('Parameter "id" playlist/album wajib disertakan.', 400);
  }

  const cleanId = id.trim();

  try {
    const data = await metadataCache.getOrFetch(`playlist:${cleanId}`, async () => {
      if (!initialized) {
        await ytmusic.initialize();
        initialized = true;
      }

      try {
        const playlist = (await ytmusic.getPlaylist(cleanId)) as any;
        let videos = playlist.videos || [];
        if (videos.length === 0) {
          try {
            videos = await ytmusic.getPlaylistVideos(cleanId);
          } catch (e) {
            console.error('Failed to get playlist videos:', e);
          }
        }
        return {
          ...playlist,
          videos,
        };
      } catch {
        // Fallback to album mapping
        const album = await ytmusic.getAlbum(cleanId);
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

    return createSuccessResponse(
      data,
      'Playlist berhasil dimuat',
      200,
      {
        'Cache-Control': 'public, s-maxage=7200, stale-while-revalidate=86400',
      }
    );
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return createErrorResponse('Data playlist tidak dapat diparse (ZodError).', 500, { details: error.issues });
    }
    if (error?.isAxiosError && error?.response?.status === 400) {
      return createErrorResponse('ID playlist/album tidak valid.', 400);
    }
    console.error(`Error fetching playlist/album for id ${cleanId}:`, error?.message || error);
    return createErrorResponse('Gagal memuat playlist atau album.', 500, { playlistId: cleanId });
  }
}
