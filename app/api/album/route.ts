import YTMusic from 'ytmusic-api';
import { metadataCache } from '@/lib/cache';
import { createErrorResponse, createSuccessResponse } from '@/lib/apiResponse';

export const dynamic = 'force-dynamic';

const ytmusic = new YTMusic();
let initialized = false;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id || !id.trim()) {
    return createErrorResponse('Parameter "id" album wajib disertakan.', 400);
  }

  const cleanId = id.trim();

  try {
    const album = await metadataCache.getOrFetch(`album:${cleanId}`, async () => {
      if (!initialized) {
        await ytmusic.initialize();
        initialized = true;
      }
      return await ytmusic.getAlbum(cleanId);
    });

    return createSuccessResponse(
      album,
      'Detail album berhasil dimuat',
      200,
      {
        'Cache-Control': 'public, s-maxage=7200, stale-while-revalidate=86400',
      }
    );
  } catch (error: any) {
    if (error?.isAxiosError && error?.response?.status === 400) {
      return createErrorResponse('ID album tidak valid atau tidak ditemukan.', 400);
    }
    console.error(`Album error for id ${cleanId}:`, error?.message || error);
    return createErrorResponse(
      error?.message || 'Gagal memuat detail album.',
      500,
      { albumId: cleanId }
    );
  }
}
