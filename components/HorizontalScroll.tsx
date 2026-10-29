'use client';

import React, { memo } from 'react';
import { Track, usePlayerStore } from '@/lib/store';
import Image from 'next/image';
import { getHighResImage } from '@/lib/utils';
import { Play, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface HorizontalScrollProps {
  title: string;
  tracks: Track[];
  isFirstShelf?: boolean;
}

export const HorizontalScroll = memo(function HorizontalScroll({ title, tracks, isFirstShelf = false }: HorizontalScrollProps) {
  const playTrack = usePlayerStore((state) => state.playTrack);
  const router = useRouter();

  if (!tracks || tracks.length === 0) return null;

  let headerContent = (
    <div className="flex items-center justify-between mb-3 px-4">
      <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight hover:underline cursor-pointer">
        {title}
      </h2>
    </div>
  );

  if (title.startsWith('Serupa dengan ')) {
    const mainTitle = title.replace('Serupa dengan ', '');
    const headerImage = getHighResImage(tracks[0]?.thumbnails?.[0]?.url, 100);

    let artistId = '';
    for (const track of tracks) {
      if (track.artist && !Array.isArray(track.artist) && track.artist.artistId) {
        artistId = track.artist.artistId;
        break;
      } else if (Array.isArray(track.artist) && track.artist[0]?.artistId) {
        artistId = track.artist[0].artistId;
        break;
      }
    }

    const handleHeaderClick = () => {
      if (artistId) {
        router.push(`/artist/${artistId}`);
      } else {
        router.push(`/search?q=${encodeURIComponent(mainTitle)}`);
      }
    };

    headerContent = (
      <div
        className="flex items-center justify-between mb-3 px-4 cursor-pointer group select-none"
        onClick={handleHeaderClick}
      >
        <div className="flex items-center gap-3">
          {headerImage && (
            <div className="w-11 h-11 rounded-full overflow-hidden relative shrink-0 shadow-md">
              <Image
                src={headerImage}
                alt={mainTitle}
                fill
                loading="lazy"
                decoding="async"
                className="object-cover"
              />
            </div>
          )}
          <div className="flex flex-col justify-center">
            <span className="text-[11px] text-[#b3b3b3] font-semibold uppercase tracking-wider">Serupa dengan</span>
            <h2 className="text-lg md:text-2xl font-bold text-white tracking-tight group-hover:text-[#1DB954] transition-colors">
              {mainTitle}
            </h2>
          </div>
        </div>
        <button className="p-2 text-[#b3b3b3] group-hover:text-white transition-colors cursor-pointer">
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <section className="mb-7">
      {headerContent}
      <div className="flex overflow-x-auto no-scrollbar gap-4 px-4 pb-2 snap-x snap-mandatory scroll-smooth overscroll-x-contain gpu-accelerated">
        {tracks.map((track, i) => {
          const thumbnail = getHighResImage(track.thumbnails?.[track.thumbnails.length - 1]?.url, 300);
          const artistName = Array.isArray(track.artist)
            ? track.artist.map((a) => a.name).join(', ')
            : track.artist?.name || 'Unknown Artist';

          return (
            <div
              key={`${track.videoId}-${i}`}
              className="flex-none w-36 md:w-44 p-3 bg-[#181818]/60 hover:bg-[#282828] rounded-md cursor-pointer group snap-start transition-colors duration-200 select-none shadow-sm flex flex-col gpu-accelerated content-auto"
              onClick={() => playTrack(track, tracks, 'playlist', i)}
            >
              <div className="relative w-full aspect-square rounded-[4px] overflow-hidden mb-3 shadow-md bg-black/40">
                <Image
                  src={thumbnail}
                  alt={track.name}
                  fill
                  sizes="(max-width: 768px) 144px, 176px"
                  priority={isFirstShelf && i < 4}
                  loading={isFirstShelf && i < 4 ? undefined : 'lazy'}
                  decoding="async"
                  className="object-cover"
                />
                {/* Floating PMUSIC Green Play Button */}
                <div className="absolute right-2 bottom-2 w-10 h-10 md:w-11 md:h-11 rounded-full bg-[#1DB954] text-black flex items-center justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 shadow-[0_8px_8px_rgba(0,0,0,0.3)] hover:scale-105 active:scale-95">
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                </div>
              </div>
              <h4 className="text-sm font-bold text-white truncate leading-tight group-hover:underline">
                {track.name}
              </h4>
              <p className="text-xs text-[#b3b3b3] truncate mt-1">{artistName}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
});
