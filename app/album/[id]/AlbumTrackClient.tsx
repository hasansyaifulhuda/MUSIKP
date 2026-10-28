'use client';

import React, { memo } from 'react';
import { MoreVertical } from 'lucide-react';
import { usePlayerStore } from '@/lib/store';
import { MarqueeText } from '@/components/MarqueeText';

interface AlbumTrackClientProps {
  track: any;
  index: number;
  album: any;
  artistName: string;
}

const AlbumTrackClient = memo(function AlbumTrackClient({
  track,
  index,
  album,
  artistName,
}: AlbumTrackClientProps) {
  const playTrack = usePlayerStore((state) => state.playTrack);
  const isCurrent = usePlayerStore((state) => state.currentTrack?.videoId === track.videoId);
  const isPlayingCurrent = usePlayerStore(
    (state) => state.isPlaying && state.currentTrack?.videoId === track.videoId
  );
  const setTrackToAdd = usePlayerStore((state) => state.setTrackToAdd);

  return (
    <div
      className="flex items-center gap-3.5 py-2.5 px-3 rounded-lg hover:bg-white/10 transition-colors cursor-pointer group select-none content-auto gpu-accelerated"
      onClick={() => playTrack(track, album?.songs || [], 'playlist', index)}
    >
      <div className="w-7 text-center text-[#b3b3b3] group-hover:text-white font-mono text-sm shrink-0">
        {isPlayingCurrent ? (
          <div className="flex gap-0.5 items-end h-3 justify-center">
            <div className="w-1 bg-[#1DB954] animate-[bounce_0.8s_infinite_0ms]" />
            <div className="w-1 bg-[#1DB954] animate-[bounce_0.8s_infinite_200ms]" />
            <div className="w-1 bg-[#1DB954] animate-[bounce_0.8s_infinite_400ms]" />
          </div>
        ) : (
          index + 1
        )}
      </div>

      <div className="flex-1 min-w-0 pr-2">
        <MarqueeText
          text={track.name}
          enabled={isCurrent}
          className={`font-semibold text-sm leading-tight ${isCurrent ? 'text-[#1DB954]' : 'text-white'}`}
        />
        <p className="text-xs text-[#b3b3b3] truncate mt-0.5">{artistName}</p>
      </div>

      {track.duration && (
        <span className="hidden sm:block text-xs text-[#b3b3b3] font-mono tabular-nums pr-2">
          {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
        </span>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          setTrackToAdd(track);
        }}
        className="p-1.5 text-white/40 hover:text-white transition-colors cursor-pointer"
        title="Tambahkan ke Playlist"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
    </div>
  );
});

export default AlbumTrackClient;
