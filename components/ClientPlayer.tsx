'use client';

import dynamic from 'next/dynamic';

/**
 * Dynamically Chunked Client Player Component
 * Master Blueprint PMUSIC Architecture - Phase 1.1 (Point 1)
 *
 * Loaded on demand exclusively on the client side ({ ssr: false }),
 * preventing the 42KB audio engine & player state bundle from blocking initial SSR.
 */
export const ClientPlayer = dynamic(
  () => import('@/components/Player').then((mod) => mod.Player),
  {
    ssr: false,
    loading: () => null,
  }
);
