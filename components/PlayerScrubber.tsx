'use client';

import React, { memo, useState, useCallback, useEffect, useRef } from 'react';
import { usePlayerStore } from '@/lib/store';
import { formatTimeDisplay } from '@/lib/performance';

interface ScrubberProps {
  onSeekCommit?: (time: number) => void;
  className?: string;
}

/**
 * Custom Hook for High-Precision Audio Scrubbing & Seeking:
 * - Uses exact coordinate bounding rect calculations on the track element itself
 * - Eliminates buggy native <input type="range"> that caused hit box bleeding and 00.00 resets on mobile
 * - Supports instant tap/click jumping, smooth dragging via Pointer Events, and Keyboard navigation
 * - Implements a temporary lock to prevent state sync flickers while audio buffers
 */
function useScrubber(onSeekCommit?: (time: number) => void) {
  const progress = usePlayerStore((state) => state.progress);
  const duration = usePlayerStore((state) => state.duration);
  const setProgress = usePlayerStore((state) => state.setProgress);

  const [isDragging, setIsDragging] = useState(false);
  const [seekTime, setSeekTime] = useState(0);

  const isDraggingRef = useRef(false);
  const seekTimeRef = useRef(0);
  const lockTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync seekTimeRef with external playback progress only when not actively dragging
  useEffect(() => {
    if (!isDraggingRef.current) {
      seekTimeRef.current = progress;
    }
  }, [progress]);

  // Clean up lock timeout on unmount
  useEffect(() => {
    return () => {
      if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
    };
  }, []);

  const safeDuration = typeof duration === 'number' && !isNaN(duration) && duration > 0 ? duration : 0;
  const displayTime = isDragging ? seekTime : progress;
  const percent = safeDuration > 0 ? Math.min(100, Math.max(0, (displayTime / safeDuration) * 100)) : 0;

  // Calculate seek timestamp based on the exact bounding rect of the track element
  const getTimeFromPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, trackEl: HTMLDivElement): number => {
      if (!trackEl || safeDuration <= 0) return 0;
      const rect = trackEl.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      const clickX = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, clickX / rect.width));
      return percentage * safeDuration;
    },
    [safeDuration]
  );

  const commitSeek = useCallback(
    (targetTime: number) => {
      const clamped = Math.max(0, Math.min(safeDuration, targetTime));
      seekTimeRef.current = clamped;
      setSeekTime(clamped);
      setProgress(clamped);

      if (onSeekCommit) {
        onSeekCommit(clamped);
      }

      // Lock visual progress to committed timestamp for 1200ms while audio engine range-requests buffer
      if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
      lockTimeoutRef.current = setTimeout(() => {
        isDraggingRef.current = false;
        setIsDragging(false);
      }, 1200);
    },
    [onSeekCommit, safeDuration, setProgress]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Ignore secondary mouse clicks
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      e.stopPropagation();

      const trackEl = e.currentTarget;
      try {
        trackEl.setPointerCapture(e.pointerId);
      } catch {}

      if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);

      isDraggingRef.current = true;
      setIsDragging(true);

      const targetTime = getTimeFromPointer(e, trackEl);
      seekTimeRef.current = targetTime;
      setSeekTime(targetTime);
    },
    [getTimeFromPointer]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      const targetTime = getTimeFromPointer(e, e.currentTarget);
      seekTimeRef.current = targetTime;
      setSeekTime(targetTime);
    },
    [getTimeFromPointer]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      const trackEl = e.currentTarget;
      try {
        if (trackEl.hasPointerCapture(e.pointerId)) {
          trackEl.releasePointerCapture(e.pointerId);
        }
      } catch {}

      const targetTime = getTimeFromPointer(e, trackEl);
      commitSeek(targetTime);
    },
    [getTimeFromPointer, commitSeek]
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      const trackEl = e.currentTarget;
      try {
        if (trackEl.hasPointerCapture(e.pointerId)) {
          trackEl.releasePointerCapture(e.pointerId);
        }
      } catch {}
      isDraggingRef.current = false;
      setIsDragging(false);
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (safeDuration <= 0) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = Math.max(0, displayTime - 5);
        commitSeek(next);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = Math.min(safeDuration, displayTime + 5);
        commitSeek(next);
      }
    },
    [displayTime, safeDuration, commitSeek]
  );

  return {
    displayTime,
    duration: safeDuration,
    percent,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleKeyDown,
  };
}

/**
 * 1. Mobile Mini Player Progress Bar (Visual indicator, isolated re-render)
 */
export const MiniPlayerProgressBar = memo(function MiniPlayerProgressBar() {
  const progress = usePlayerStore((state) => state.progress);
  const duration = usePlayerStore((state) => state.duration);

  const percent = duration > 0 ? Math.min(100, Math.max(0, (progress / duration) * 100)) : 0;

  return (
    <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#333333] overflow-hidden pointer-events-none">
      <div
        className="h-full bg-[#1DB954] transition-all duration-150 ease-linear transform-gpu will-change-transform pointer-events-none"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
});

/**
 * 2. Desktop Bottom Player Scrubber (Zero-lag dragging & instant coordinate click jump)
 */
export const DesktopScrubber = memo(function DesktopScrubber({ onSeekCommit }: ScrubberProps) {
  const {
    displayTime,
    duration,
    percent,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleKeyDown,
  } = useScrubber(onSeekCommit);

  return (
    <div
      className="flex items-center gap-2.5 w-full text-xs text-[#b3b3b3] font-mono select-none"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="w-9 text-right tabular-nums text-white/60 pointer-events-none select-none">
        {formatTimeDisplay(displayTime)}
      </span>

      {/* Tightly isolated hit box with py-2 touch padding and touch-none */}
      <div
        className="relative flex-1 flex items-center group/bar py-2 cursor-pointer touch-none outline-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={handleKeyDown}
        role="slider"
        tabIndex={0}
        aria-label="Durasi pemutaran musik"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={Math.round(displayTime)}
      >
        {/* Track Line */}
        <div className="w-full h-1.5 md:h-2 bg-[#333333] border border-white/5 rounded-full overflow-hidden relative shadow-inner pointer-events-none">
          <div
            className="h-full bg-white group-hover/bar:bg-[#1DB954] rounded-full transition-colors transform-gpu pointer-events-none"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.8)] border border-black/20 pointer-events-none group-hover/bar:scale-125 transition-transform duration-100"
          style={{ left: `calc(${percent}% - 7px)` }}
        />
      </div>

      <span className="w-9 text-left tabular-nums text-white/60 pointer-events-none select-none">
        {formatTimeDisplay(duration)}
      </span>
    </div>
  );
});

/**
 * 3. Fullscreen Expanded Player Scrubber (Isolated hit box & coordinate seeking)
 */
export const ExpandedScrubber = memo(function ExpandedScrubber({ onSeekCommit }: ScrubberProps) {
  const {
    displayTime,
    duration,
    percent,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleKeyDown,
  } = useScrubber(onSeekCommit);

  return (
    <div
      className="w-full select-none mb-5"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Tightly restricted hit box: py-2 touch zone (no bleeding into title or buttons) */}
      <div
        className="relative flex items-center w-full py-2 cursor-pointer group/expbar touch-none outline-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={handleKeyDown}
        role="slider"
        tabIndex={0}
        aria-label="Durasi pemutaran musik"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={Math.round(displayTime)}
      >
        {/* Track Line */}
        <div className="w-full h-1.5 md:h-2 bg-[#333333] border border-white/10 rounded-full overflow-hidden relative shadow-inner pointer-events-none">
          <div
            className="h-full bg-white group-hover/expbar:bg-[#1DB954] rounded-full transition-colors transform-gpu pointer-events-none"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Grab Handle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 md:w-4 md:h-4 bg-white rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.9)] border border-black/20 pointer-events-none transition-transform group-hover/expbar:scale-125"
          style={{ left: `calc(${percent}% - 7px)` }}
        />
      </div>

      {/* Time indicators - strictly below the track, non-interactive */}
      <div className="flex justify-between text-xs text-white/60 mt-1 font-mono tabular-nums pointer-events-none select-none">
        <span>{formatTimeDisplay(displayTime)}</span>
        <span>{formatTimeDisplay(duration)}</span>
      </div>
    </div>
  );
});

/**
 * 4. Lyrics View Wrapper Component:
 * Subscribes only to progress and passes millisecond currentTime to LyricsView,
 * preventing Player from re-rendering on every audio tick.
 */
export const LyricsViewContainer = memo(function LyricsViewContainer({
  lyrics,
  onSeek,
  isLoading,
  isSynced,
}: {
  lyrics: any[];
  onSeek: (time: number) => void;
  isLoading: boolean;
  isSynced: boolean;
}) {
  const currentTime = usePlayerStore((state) => state.progress);

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full">
      <LyricsViewWithTime
        lyrics={lyrics}
        currentTime={currentTime}
        onSeek={onSeek}
        isLoading={isLoading}
        isSynced={isSynced}
      />
    </div>
  );
});

import dynamic from 'next/dynamic';

const LyricsViewWithTime = dynamic(
  () => import('./LyricsView').then((m) => m.LyricsView),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center text-white/50 animate-pulse text-sm">
        Memuat lirik...
      </div>
    ),
  }
);

