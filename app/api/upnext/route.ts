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
    return createErrorResponse('Parameter "id" lagu wajib disertakan.', 400);
  }

  const cleanId = id.trim();

  try {
    const normalized = await metadataCache.getOrFetch(`upnext:${cleanId}`, async () => {
      if (!initialized) {
        await ytmusic.initialize();
        initialized = true;
      }
      const upNext = await ytmusic.getUpNexts(cleanId);

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

    return createSuccessResponse(
      normalized,
      'Daftar putar berikutnya berhasil dimuat',
      200,
      {
        'Cache-Control': 'public, s-maxage=7200, stale-while-revalidate=86400',
      }
    );
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return createSuccessResponse([], 'Data kosong (ZodError)');
    }
    if (error?.message?.includes('Invalid videoId') || (error?.isAxiosError && error?.response?.status === 400)) {
      return createSuccessResponse([], 'ID video tidak valid');
    }
    console.error(`UpNext error for id ${cleanId}:`, error?.message || error);
    return createErrorResponse(error?.message || 'Gagal memuat rekomendasi lagu.', 500, { result: [] });
  }
}
