'use client';

import React, { memo, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Mic2, Loader2, Disc3, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { binarySearchLyricIndex } from '@/lib/performance';

export interface LyricLine {
  time: number;
  text: string;
}

interface LyricsViewProps {
  lyrics: LyricLine[];
  currentTime: number;
  onSeek: (time: number) => void;
  isLoading: boolean;
  isSynced: boolean;
}

export const LyricsView = memo(function LyricsView({
  lyrics,
  currentTime,
  onSeek,
  isLoading,
  isSynced: _isSynced,
}: LyricsViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const prevActiveIndexRef = useRef<number>(-1);
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUserScrollingRef = useRef<boolean>(false);
  const [showSyncButton, setShowSyncButton] = useState<boolean>(false);
  const rafScrollIdRef = useRef<number | null>(null);

  // 1. High-precision binary search active index computation (Millisecond Accuracy, O(log n))
  const activeIndex = useMemo(() => {
    if (!lyrics || lyrics.length === 0) return -1;
    return binarySearchLyricIndex(lyrics, currentTime);
  }, [lyrics, currentTime]);

  // Keep lineRefs array in sync with lyrics length
  useEffect(() => {
    lineRefs.current = lineRefs.current.slice(0, lyrics.length);
  }, [lyrics.length]);

  // Smooth scroll centering helper with cancellation of previous frame
  const scrollToActiveLine = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const container = containerRef.current;
    if (!container || index < 0) return;

    const targetEl = lineRefs.current[index];
    if (!targetEl) return;

    if (rafScrollIdRef.current) {
      cancelAnimationFrame(rafScrollIdRef.current);
    }

    rafScrollIdRef.current = requestAnimationFrame(() => {
      if (!container || !targetEl) return;
      // Calculate dynamic center offset
      const containerHeight = container.clientHeight;
      const targetTop = targetEl.offsetTop;
      const targetHeight = targetEl.clientHeight;
      const scrollPosition = targetTop - containerHeight / 2 + targetHeight / 2;

      container.scrollTo({
        top: Math.max(0, scrollPosition),
        behavior,
      });
    });
  }, []);

  // 2. Buttery-smooth Auto-scrolling: Centers the active lyric line dynamically
  useEffect(() => {
    if (activeIndex < 0 || isUserScrollingRef.current) return;
    if (prevActiveIndexRef.current === activeIndex) return;

    prevActiveIndexRef.current = activeIndex;
    scrollToActiveLine(activeIndex, 'smooth');

    return () => {
      if (rafScrollIdRef.current) {
        cancelAnimationFrame(rafScrollIdRef.current);
      }
    };
  }, [activeIndex, scrollToActiveLine]);

  // 3. User Touch / Scroll Handling: temporarily pauses auto-scroll & presents re-sync button
  const handleUserInteraction = useCallback(() => {
    isUserScrollingRef.current = true;
    setShowSyncButton(true);

    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }

    // Auto-resume smooth tracking after 3.2 seconds of user idle
    userScrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
      setShowSyncButton(false);
      if (prevActiveIndexRef.current >= 0) {
        scrollToActiveLine(prevActiveIndexRef.current, 'smooth');
      }
    }, 3200);
  }, [scrollToActiveLine]);

  // Manual re-sync to current playback
  const handleManualSync = useCallback(() => {
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    isUserScrollingRef.current = false;
    setShowSyncButton(false);
    if (activeIndex >= 0) {
      scrollToActiveLine(activeIndex, 'smooth');
    }
  }, [activeIndex, scrollToActiveLine]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
      if (rafScrollIdRef.current) cancelAnimationFrame(rafScrollIdRef.current);
    };
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-white/60 py-28 select-none">
        <div className="relative">
          <Loader2 className="w-10 h-10 text-[#1DB954] animate-spin" />
          <div className="absolute inset-0 blur-md bg-[#1DB954]/20 rounded-full" />
        </div>
        <p className="text-sm font-semibold tracking-wide text-white/80 animate-pulse">
          Menyiapkan lirik...
        </p>
      </div>
    );
  }

  // Empty state
  if (!lyrics || lyrics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/50 space-y-4 py-28 select-none text-center px-4 max-w-md mx-auto">
        <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 shadow-inner">
          <Mic2 className="w-9 h-9 opacity-50" />
        </div>
        <div className="space-y-1">
          <p className="text-lg font-bold text-white/90">Lirik tidak tersedia untuk lagu ini</p>
          <p className="text-xs text-white/40 leading-relaxed">
            Lagu ini belum memiliki lirik. Coba putar lagu populer lainnya.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative flex flex-col min-h-0 w-full overflow-hidden select-none">
      {/* Main Boxless Karaoke Lyrics Container with Smooth Vertical Fade Mask */}
      <div
        ref={containerRef}
        onTouchStart={handleUserInteraction}
        onTouchMove={handleUserInteraction}
        onWheel={handleUserInteraction}
        className="flex-1 overflow-y-auto no-scrollbar py-[35vh] px-4 sm:px-8 max-w-3xl mx-auto w-full text-center space-y-5 md:space-y-6 lyrics-mask gpu-accelerated scroll-smooth"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Intro Instrumental / Musical Break Indicator (if before first lyric) */}
        {activeIndex === -1 && (
          <div className="py-6 flex flex-col items-center justify-center gap-2 text-white/40 animate-pulse">
            <Disc3 className="w-6 h-6 animate-spin text-[#1DB954]/60" style={{ animationDuration: '4s' }} />
            <span className="text-xs font-semibold tracking-wider uppercase text-white/50">
              Musik Mengalun • Intro
            </span>
          </div>
        )}

        {/* Clean, True Karaoke Lyric Lines (No containers, No badges, Pure Zoom-In Text) */}
        {lyrics.map((line, idx) => {
          const isActive = idx === activeIndex;

          return (
            <div
              key={`lyric-${idx}`}
              ref={(el) => {
                lineRefs.current[idx] = el;
              }}
              onClick={() => onSeek(line.time)}
              role="button"
              tabIndex={0}
              className={cn(
                'py-3.5 px-4 cursor-pointer transition-all duration-300 ease-out transform-gpu gpu-accelerated select-none focus:outline-none origin-center',
                isActive
                  ? 'scale-[1.08] font-black text-white text-2xl sm:text-3xl md:text-4xl opacity-100 drop-shadow-[0_4px_24px_rgba(255,255,255,0.25)]'
                  : 'scale-100 font-semibold text-white/35 text-lg sm:text-xl md:text-2xl opacity-40 hover:opacity-75 hover:text-white/70'
              )}
            >
              <p className="leading-relaxed tracking-tight">
                {line.text}
              </p>
            </div>
          );
        })}
      </div>

      {/* Floating Re-Sync Pill Button (Visible when user scrolls away from active line) */}
      {showSyncButton && activeIndex >= 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <button
            onClick={handleManualSync}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#1DB954] text-black font-bold text-xs shadow-2xl hover:scale-105 active:scale-95 transition-transform cursor-pointer"
          >
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>Kembali ke lirik aktif</span>
          </button>
        </div>
      )}
    </div>
  );
});
