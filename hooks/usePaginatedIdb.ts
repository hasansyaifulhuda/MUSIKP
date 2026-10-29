'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PaginatedResult, PaginationOptions } from '@/lib/db';

export interface UsePaginatedIdbOptions {
  pageSize?: number;
  reverse?: boolean;
  autoLoad?: boolean;
}

/**
 * Custom React Hook for Lazy Loading & Paginated IndexedDB reads
 * Master Blueprint PMUSIC Architecture - Phase 1.2 (Point 6)
 *
 * Traverses IndexedDB in memory-efficient chunks, keeping browser heap RAM minimal.
 */
export function usePaginatedIdb<T>(
  fetcher: (options: PaginationOptions) => Promise<PaginatedResult<T>>,
  options: UsePaginatedIdbOptions = {}
) {
  const { pageSize = 30, reverse = false, autoLoad = true } = options;

  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const offsetRef = useRef(0);
  const isFetchingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (isFetchingRef.current || !hasMore) return;
    isFetchingRef.current = true;
    setIsLoading(true);

    try {
      const res = await fetcher({
        offset: offsetRef.current,
        limit: pageSize,
        reverse,
      });

      setItems((prev) => (offsetRef.current === 0 ? res.items : [...prev, ...res.items]));
      setTotal(res.total);
      setHasMore(res.hasMore);
      offsetRef.current += res.items.length;
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [fetcher, pageSize, reverse, hasMore]);

  const refresh = useCallback(async () => {
    offsetRef.current = 0;
    setHasMore(true);
    isFetchingRef.current = false;
    await loadMore();
  }, [loadMore]);

  useEffect(() => {
    if (autoLoad) {
      refresh();
    }
  }, [autoLoad, refresh]);

  return {
    items,
    total,
    isLoading,
    hasMore,
    error,
    loadMore,
    refresh,
  };
}
