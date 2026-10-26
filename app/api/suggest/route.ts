import { NextResponse } from 'next/server';
import { MemoryCache } from '@/lib/apiCache';

export const dynamic = 'force-dynamic';

const suggestCache = new MemoryCache(500, 1000 * 60 * 60);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (!q) {
    return NextResponse.json([]);
  }

  const queryKey = q.toLowerCase().trim();

  try {
    const suggestions = await suggestCache.getOrFetch(queryKey, async () => {
      const res = await fetch(
        `http://suggestqueries.google.com/complete/search?client=youtube&ds=yt&client=firefox&q=${encodeURIComponent(
          q
        )}`
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data[1] || [];
    });

    return NextResponse.json(suggestions, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    return NextResponse.json([]);
  }
}
