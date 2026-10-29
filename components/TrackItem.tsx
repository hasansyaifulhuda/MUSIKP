'use client';

import React, { memo, useCallback, useMemo, useRef, useEffect } from 'react';
import { Track, usePlayerStore } from '@/lib/store';
import { MoreHorizontal, Trash2, Play } from 'lucide-react';
import Image from 'next/image';
import { getHighResImage } from '@/lib/utils';
import { MarqueeText } from './MarqueeText';
import { Equalizer } from './Equalizer';
import { useContextMenuStore } from '@/lib/contextMenuStore';

interface TrackItemProps {
  track: Track;
  queue?: Track[];
  index?: number;
  onRemove?: (track: Track) => void;
}

function formatTrackDuration(seconds?: number): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const TrackItem = memo(function TrackItem({
  track,
  queue,
  index,
  onRemove,
}: TrackItemProps) {
  // Fine-grained Zustand selectors to prevent unnecessary re-renders in large lists
  const playTrack = usePlayerStore((state) => state.playTrack);
  const isCurrent = usePlayerStore((state) => state.currentTrack?.videoId === track.videoId);
  const isPlayingCurrent = usePlayerStore(
    (state) => state.isPlaying && state.currentTrack?.videoId === track.videoId
  );
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);

  // Touch long-press refs
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const didLongPressRef = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    };
  }, []);

  const thumbnail = useMemo(
    () => getHighResImage(track.thumbnails?.[track.thumbnails.length - 1]?.url, 120),
    [track.thumbnails]
  );

  const artistName = useMemo(() => {
    if (Array.isArray(track.artist)) {
      return track.artist.map((a: any) => (typeof a === 'string' ? a : a.name)).join(', ');
    }
    return (track.artist as any)?.name || 'Unknown Artist';
  }, [track.artist]);

  const handleClick = useCallback(() => {
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }
    playTrack(track, queue, 'playlist', index);
  }, [playTrack, track, queue, index]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openContextMenu(track, { x: e.clientX, y: e.clientY });
    },
    [openContextMenu, track]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
      didLongPressRef.current = false;

      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
      touchTimerRef.current = setTimeout(() => {
        didLongPressRef.current = true;
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate?.(35);
        }
        openContextMenu(track, { x: touchStartPosRef.current.x, y: touchStartPosRef.current.y });
      }, 480);
    },
    [openContextMenu, track]
  );

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
    if (dx > 10 || dy > 10) {
      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current);
        touchTimerRef.current = null;
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  }, []);

  const handleOptionsClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      openContextMenu(track, { x: rect.left - 140, y: rect.bottom + 6 });
    },
    [openContextMenu, track]
  );

  const handleRemoveClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onRemove) onRemove(track);
    },
    [onRemove, track]
  );

  return (
    <div
      className="flex items-center p-2 md:p-2.5 hover:bg-white/10 rounded-md cursor-pointer group transition-colors select-none content-auto gpu-accelerated"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Optional Track Number on Desktop */}
      {index !== undefined && (
        <span className="w-8 text-center text-sm font-medium text-[#b3b3b3] group-hover:hidden shrink-0">
          {index + 1}
        </span>
      )}

      {/* Album Art with Equalizer / Play Overlay */}
      <div className="relative w-11 h-11 rounded-[4px] overflow-hidden shrink-0 shadow bg-white/5">
        <Image
          src={thumbnail}
          alt={track.name}
          fill
          sizes="44px"
          priority={index !== undefined && index < 4}
          loading={index !== undefined && index < 4 ? undefined : 'lazy'}
          decoding="async"
          className="object-cover"
        />
        {isPlayingCurrent ? (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <Equalizer size="sm" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Play className="w-4 h-4 fill-white text-white ml-0.5" />
          </div>
        )}
      </div>

      {/* Track Title & Artist (Marquee enabled only on currently active track to save 90% ResizeObservers) */}
      <div className="ml-3 flex-1 min-w-0 pr-2">
        <MarqueeText
          text={track.name}
          enabled={isCurrent}
          className={`font-semibold text-sm ${isCurrent ? 'text-[#1DB954]' : 'text-white'}`}
        />
        <div className="flex items-center gap-1.5 mt-0.5">
          {track.isExplicit && (
            <span className="bg-white/20 text-[9px] px-1 py-0.2 rounded font-bold text-white">E</span>
          )}
          <span className="text-xs text-[#b3b3b3] truncate">{artistName}</span>
        </div>
      </div>

      {/* Duration */}
      {track.duration && (
        <span className="hidden sm:block text-xs text-[#b3b3b3] font-mono tabular-nums pr-2">
          {formatTrackDuration(track.duration)}
        </span>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-1 shrink-0">
        {onRemove && (
          <button
            className="p-1.5 text-white/40 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
            onClick={handleRemoveClick}
            title="Hapus"
            aria-label="Hapus dari antrean"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        <button
          className="p-1.5 text-white/40 hover:text-white transition-colors cursor-pointer"
          onClick={handleOptionsClick}
          title="Opsi"
          aria-label="Opsi lagu"
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
});
