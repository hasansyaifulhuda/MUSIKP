import { metadataCache } from '@/lib/cache';
import { createErrorResponse, createSuccessResponse } from '@/lib/apiResponse';
import { ytmusicClient } from '@/lib/ytmusicClient';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id || !id.trim()) {
    return createErrorResponse('Parameter "id" artist wajib disertakan.', 400);
  }

  const cleanId = id.trim();

  try {
    const artist = await metadataCache.getOrFetch(`artist:${cleanId}`, async () => {
      const data = await ytmusicClient.getArtist(cleanId);
      if (!data) return null;

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

    if (!artist) {
      return createErrorResponse('Artist tidak ditemukan atau server YouTube sedang sibuk.', 404);
    }

    return createSuccessResponse(
      artist,
      'Profil artis berhasil dimuat',
      200,
      {
        'Cache-Control': 'public, s-maxage=7200, stale-while-revalidate=86400',
      }
    );
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return createErrorResponse('Data artis tidak dapat diparse (ZodError).', 500, { details: error.issues });
    }
    if (error?.isAxiosError && error?.response?.status === 400) {
      return createErrorResponse('ID artist tidak valid atau tidak ditemukan.', 400);
    }
    console.error(`Artist error for id ${cleanId}:`, error?.message || error);
    return createErrorResponse(
      error?.message || 'Gagal memuat profil artis.',
      500,
      { artistId: cleanId }
    );
  }
}
