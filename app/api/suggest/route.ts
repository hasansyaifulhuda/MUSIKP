import { metadataCache } from '@/lib/cache';
import { createSuccessResponse } from '@/lib/apiResponse';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (!q || !q.trim()) {
    return createSuccessResponse([], 'Query pencarian kosong');
  }

  const queryKey = q.toLowerCase().trim();

  try {
    const suggestions = await metadataCache.getOrFetch(`suggest:${queryKey}`, async () => {
      // Tier 1: Google Suggest API via HTTPS with timeout
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const res = await fetch(
          `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&client=firefox&q=${encodeURIComponent(
            queryKey
          )}`,
          {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0' },
          }
        );
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.[1]) && data[1].length > 0) {
            return data[1];
          }
        }
      } catch (err) {
        console.warn('[SuggestRoute] Google suggest error:', err);
      }

      // Tier 2: iTunes Search Hint Fallback
      try {
        const itunesRes = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(queryKey)}&entity=song&limit=6`,
          { headers: { Accept: 'application/json' } }
        );
        if (itunesRes.ok) {
          const data = await itunesRes.json();
          if (Array.isArray(data.results)) {
            const hints = Array.from(
              new Set(data.results.map((r: any) => `${r.trackName} - ${r.artistName}`))
            );
            return hints.slice(0, 5);
          }
        }
      } catch {}

      return [];
    });

    return createSuccessResponse(
      suggestions,
      'Saran pencarian berhasil diambil',
      200,
      {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      }
    );
  } catch (error) {
    console.error('[SuggestRoute] Suggestion error:', error);
    return createSuccessResponse([], 'Gagal mengambil saran pencarian');
  }
}
