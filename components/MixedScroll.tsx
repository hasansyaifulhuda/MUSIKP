'use client';

import React, { memo } from 'react';
import { Play, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { getHighResImage } from '@/lib/utils';
import { usePlayerStore } from '@/lib/store';
import { useRouter } from 'next/navigation';

interface MixedScrollProps {
  title: string;
  items: any[];
}

export const MixedScroll = memo(function MixedScroll({ title, items }: MixedScrollProps) {
  const playTrack = usePlayerStore((state) => state.playTrack);
  const router = useRouter();

  if (!items || items.length === 0) return null;

  return (
    <section className="mb-7">
      <div className="flex items-center justify-between mb-3 px-4">
        <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight hover:underline cursor-pointer">
          {title}
        </h2>
      </div>
      <div className="flex overflow-x-auto no-scrollbar gap-4 px-4 pb-2 snap-x snap-mandatory scroll-smooth overscroll-x-contain gpu-accelerated">
        {items.map((item, i) => {
          const type = item.type;
          const isArtist = type === 'ARTIST';
          const isPlaylist = type === 'PLAYLIST';
          const isAlbum = type === 'ALBUM';
          const isSong = type === 'SONG' || type === 'VIDEO';

          const titleText = item.name || item.title || 'Unknown';
          const subtitleText = isArtist
            ? 'Artis'
            : isPlaylist
            ? 'Playlist'
            : isAlbum
            ? 'Album'
            : Array.isArray(item.artist)
            ? item.artist.map((a: any) => a.name).join(', ')
            : item.artist?.name || 'Lagu';

          const handleClick = () => {
            if (isArtist && item.artistId) {
              router.push(`/artist/${item.artistId}`);
            } else if (isPlaylist && item.playlistId) {
              router.push(`/playlist/${item.playlistId}`);
            } else if (isAlbum && item.albumId) {
              router.push(`/album/${item.albumId}`);
            } else if (isSong && (item.videoId || item.id)) {
              const songItems = items.filter((it: any) => it.type === 'SONG' || it.type === 'VIDEO' || it.videoId || it.id);
              const songIdx = songItems.findIndex((it: any) => (it.videoId || it.id) === (item.videoId || item.id));
              playTrack(item, songItems.length > 0 ? songItems : [item], 'playlist', songIdx !== -1 ? songIdx : undefined);
            }
          };

          return (
            <div
              key={`${item.videoId || item.playlistId || item.albumId || item.artistId}-${i}`}
              className="flex-none w-36 md:w-44 p-3 bg-[#181818]/60 hover:bg-[#282828] rounded-md cursor-pointer group snap-start transition-colors duration-200 select-none shadow-sm flex flex-col gpu-accelerated content-auto"
              onClick={handleClick}
            >
              <div
                className={`relative w-full aspect-square overflow-hidden mb-3 shadow-md bg-black/40 ${
                  isArtist ? 'rounded-full' : 'rounded-[4px]'
                }`}
              >
                <Image
                  src={getHighResImage(item.thumbnails?.[item.thumbnails.length - 1]?.url, 300)}
                  alt={titleText}
                  fill
                  sizes="(max-width: 768px) 144px, 176px"
                  priority={i < 3}
                  loading={i < 3 ? undefined : 'lazy'}
                  decoding="async"
                  className="object-cover"
                />
                <div className="absolute right-2 bottom-2 w-10 h-10 md:w-11 md:h-11 rounded-full bg-[#1DB954] text-black flex items-center justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 shadow-[0_8px_8px_rgba(0,0,0,0.3)] hover:scale-105 active:scale-95">
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                </div>
              </div>
              <h4 className="text-sm font-bold text-white truncate leading-tight group-hover:underline">
                {titleText}
              </h4>
              <p className="text-xs text-[#b3b3b3] truncate mt-1">{subtitleText}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
});
