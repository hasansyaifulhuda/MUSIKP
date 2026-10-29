'use client';

import React, { memo } from 'react';
import Image from 'next/image';
import { getHighResImage } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export const ArtistItem = memo(function ArtistItem({ artist }: { artist: any }) {
  const router = useRouter();
  const thumbnail = getHighResImage(artist.thumbnails?.[artist.thumbnails.length - 1]?.url, 200);

  return (
    <div
      className="flex items-center p-2.5 hover:bg-white/10 rounded-md cursor-pointer group transition-colors select-none content-auto gpu-accelerated"
      onClick={() => router.push(`/artist/${artist.artistId}`)}
    >
      <div className="relative w-12 h-12 rounded-full overflow-hidden shrink-0 shadow bg-white/5">
        {thumbnail && (
          <Image
            src={thumbnail}
            alt={artist.name}
            fill
            sizes="48px"
            loading="lazy"
            decoding="async"
            className="object-cover"
          />
        )}
      </div>
      <div className="ml-3.5 flex-1 min-w-0">
        <h4 className="font-semibold text-sm text-white group-hover:text-[#1DB954] transition-colors truncate">
          {artist.name}
        </h4>
        <span className="text-xs text-[#b3b3b3]">Artis</span>
      </div>
    </div>
  );
});
