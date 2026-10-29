'use client';

import React, { memo, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Mic2, Loader2, Disc3, Radio, FileText, CheckCircle2, Clock, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { findActiveLyricIndex, normalizeLyrics, LyricLine } from '@/lib/performance';
import { getPersistentAudioElement } from '@/lib/audioElement';
import { usePlayerStore } from '@/lib/store';
import { useLyricsOffsetStore } from '@/lib/lyricsOffsetStore';
import { db } from '@/lib/db';

export type { LyricLine };

interface LyricsViewProps {
  lyrics?: any[];
  currentTime?: number;
  onSeek: (time: number) => void;
  isLoading?: boolean;
  isSynced?: boolean;
}

interface LyricRowProps {
  idx: number;
  text: string;
  time: number;
  isActive: boolean;
  onSeek: (time: number) => void;
  setRef: (el: HTMLDivElement | null) => void;
}

/**
 * Isolated, high-performance Lyric Row component.
 * Custom comparator ensures ONLY the row becoming active or inactive re-renders,
 * eliminating 99% of React reconciliation overhead during audio playback.
 */
const LyricRow = memo(
  function LyricRow({ idx, text, time, isActive, onSeek, setRef }: LyricRowProps) {
    const handleClick = useCallback(() => {
      onSeek(time);
    }, [onSeek, time]);

    return (
      <div
        ref={setRef}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label={`Lirik baris ${idx + 1}: ${text}`}
        className={cn(
          'py-3.5 px-4 cursor-pointer transition-all duration-300 ease-out transform-gpu select-none focus:outline-none origin-center text-center rounded-2xl',
          isActive
            ? 'scale-[1.06] font-black text-white text-2xl sm:text-3xl md:text-4xl opacity-100 drop-shadow-[0_4px_30px_rgba(255,255,255,0.45)]'
            : 'scale-100 font-bold text-white/35 text-lg sm:text-xl md:text-2xl opacity-40 hover:opacity-75 hover:text-white/75'
        )}
      >
        <p className="leading-relaxed tracking-tight transition-colors duration-200 text-center">{text}</p>
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.idx === next.idx &&
      prev.text === next.text &&
      prev.time === next.time &&
      prev.isActive === next.isActive
    );
  }
);

export const LyricsView = memo(function LyricsView({
  lyrics = [],
  currentTime,
  onSeek,
  isLoading = false,
  isSynced = false,
}: LyricsViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 1. Performance-First State & Ref Management:
  // Active lyric index is mirrored in a ref to avoid setState calls on every raw audio tick!
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const activeIndexRef = useRef<number>(-1);
  const isFirstScrollRef = useRef<boolean>(true);

  // User scrolling safeguards
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUserScrollingRef = useRef<boolean>(false);
  const [showSyncButton, setShowSyncButton] = useState<boolean>(false);

  const duration = usePlayerStore((state) => state.duration);
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const currentVideoId = currentTrack?.videoId;

  // Lyrics Offset Calibration (Batch 3 - Poin 68)
  const lyricsOffset = useLyricsOffsetStore((state) => state.getOffset(currentVideoId));
  const adjustOffset = useLyricsOffsetStore((state) => state.adjustOffset);
  const resetOffset = useLyricsOffsetStore((state) => state.resetOffset);
  const [showOffsetBar, setShowOffsetBar] = useState(false);

  // Direct Offline Status Indicator
  const isOfflineLoaded = useMemo(() => {
    if (!currentVideoId) return false;
    return db.isOfflineTrackSync(currentVideoId);
  }, [currentVideoId]);

  // Combine prop lyrics and normalize timestamps: seconds vs milliseconds, strings, and chronological sorting
  const normalizedLyrics = useMemo(() => {
    return normalizeLyrics(lyrics, duration);
  }, [lyrics, duration]);

  // Keep lineRefs array in sync with lyrics length
  useEffect(() => {
    lineRefs.current = lineRefs.current.slice(0, normalizedLyrics.length);
  }, [normalizedLyrics.length]);

  // Reset active index when a new song or set of lyrics is loaded
  useEffect(() => {
    activeIndexRef.current = -1;
    setActiveIndex(-1);
    isFirstScrollRef.current = true;
    setShowSyncButton(false);
    isUserScrollingRef.current = false;
  }, [normalizedLyrics]);

  // 4. Real-Time 60fps RAF Audio Event Listener with calibrated lyrics offset:
  useEffect(() => {
    if (!isSynced || normalizedLyrics.length === 0) return;

    const audio = getPersistentAudioElement();
    if (!audio) return;

    let rafId: number | null = null;

    const checkAndUpdateLyric = () => {
      const curTime = audio.currentTime;
      const effectiveTime = Math.max(0, curTime + lyricsOffset);
      const newIndex = findActiveLyricIndex(normalizedLyrics, effectiveTime);

      // Throttling: ONLY trigger React state update if the line index actually changed
      if (newIndex !== activeIndexRef.current) {
        activeIndexRef.current = newIndex;
        setActiveIndex(newIndex);
      }

      if (!audio.paused && !audio.ended) {
        rafId = requestAnimationFrame(checkAndUpdateLyric);
      }
    };

    const handlePlay = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(checkAndUpdateLyric);
    };

    const handlePause = () => {
      if (rafId) cancelAnimationFrame(rafId);
      checkAndUpdateLyric();
    };

    const handleImmediate = () => {
      checkAndUpdateLyric();
    };

    // Initial evaluation
    checkAndUpdateLyric();
    if (!audio.paused) {
      rafId = requestAnimationFrame(checkAndUpdateLyric);
    }

    audio.addEventListener('play', handlePlay, { passive: true });
    audio.addEventListener('pause', handlePause, { passive: true });
    audio.addEventListener('timeupdate', handleImmediate, { passive: true });
    audio.addEventListener('seeked', handleImmediate, { passive: true });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('timeupdate', handleImmediate);
      audio.removeEventListener('seeked', handleImmediate);
    };
  }, [isSynced, normalizedLyrics, lyricsOffset]);

  // 5. Synchronize when external scrubber progress changes (seeking via progress bar)
  useEffect(() => {
    if (!isSynced || normalizedLyrics.length === 0) return;
    if (typeof currentTime === 'number' && !isNaN(currentTime)) {
      const effectiveTime = Math.max(0, currentTime + lyricsOffset);
      const newIndex = findActiveLyricIndex(normalizedLyrics, effectiveTime);
      if (newIndex !== activeIndexRef.current) {
        activeIndexRef.current = newIndex;
        setActiveIndex(newIndex);
      }
    }
  }, [currentTime, isSynced, normalizedLyrics, lyricsOffset]);

  // 6. Smooth Scroll & Auto-Center:
  // Automatically scrolls the active lyric line to vertical center using container-relative math
  const scrollToActiveLine = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    if (index < 0 || isUserScrollingRef.current) return;
    const container = containerRef.current;
    const targetEl = lineRefs.current[index];
    if (!container || !targetEl) return;

    const containerHeight = container.clientHeight;
    const lineTop = targetEl.offsetTop;
    const lineHeight = targetEl.offsetHeight;
    const targetScrollTop = lineTop - containerHeight / 2 + lineHeight / 2;

    try {
      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior,
      });
    } catch {
      container.scrollTop = Math.max(0, targetScrollTop);
    }
  }, []);

  useEffect(() => {
    if (!isSynced || isUserScrollingRef.current || activeIndex < 0) return;

    const behavior: ScrollBehavior = isFirstScrollRef.current ? 'auto' : 'smooth';
    isFirstScrollRef.current = false;
    scrollToActiveLine(activeIndex, behavior);
  }, [activeIndex, isSynced, scrollToActiveLine]);

  // 7. User Touch / Scroll Handling: temporarily pauses auto-scroll & displays floating re-sync pill
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
      if (activeIndexRef.current >= 0) {
        scrollToActiveLine(activeIndexRef.current, 'smooth');
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
    if (activeIndexRef.current >= 0) {
      scrollToActiveLine(activeIndexRef.current, 'smooth');
    }
  }, [scrollToActiveLine]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
    };
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-white/60 py-28 select-none animate-in fade-in duration-200">
        <div className="relative">
          <Loader2 className="w-10 h-10 text-[#1DB954] animate-spin" />
          <div className="absolute inset-0 blur-md bg-[#1DB954]/20 rounded-full" />
        </div>
        <p className="text-sm font-semibold tracking-wide text-white/80 animate-pulse">
          Mencari & menyiapkan lirik otomatis...
        </p>
      </div>
    );
  }

  // Clean, resilient empty state
  if (!normalizedLyrics || normalizedLyrics.length === 0) {
    const isDeviceOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/50 space-y-4 py-28 select-none text-center px-4 max-w-md mx-auto animate-in fade-in duration-300">
        <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 shadow-inner">
          <Mic2 className="w-9 h-9 opacity-50" />
        </div>
        <div className="space-y-1.5">
          <p className="text-lg font-bold text-white/90">
            {isDeviceOffline ? 'Lirik Belum Tersimpan Offline' : 'Lirik Belum Tersedia'}
          </p>
          <p className="text-xs text-white/50 leading-relaxed">
            {isDeviceOffline
              ? 'Lirik lagu ini belum diunduh ke penyimpanan offline. Sambungkan internet untuk memuat lirik otomatis.'
              : 'Sistem belum menemukan lirik di database publik. Tekan tombol di bawah untuk mencoba pencarian ulang multi-layer.'}
          </p>
        </div>
        {!isDeviceOffline && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('musicfy:reload-lyrics', { detail: { force: true } }));
                window.dispatchEvent(new CustomEvent('pmusic:reload-lyrics', { detail: { force: true } }));
              }
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 mt-2 bg-[#1DB954]/15 hover:bg-[#1DB954]/25 active:scale-95 text-white text-xs font-bold rounded-full transition-all border border-[#1DB954]/30 cursor-pointer shadow-lg hover:shadow-[#1DB954]/10"
            title="Cari ulang lirik lagu ini"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#1DB954]" />
            <span>Coba Cari Ulang Lirik</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 relative flex flex-col min-h-0 w-full overflow-hidden select-none">
      {/* Informative mode badge for offline lyrics and plain lyrics */}
      <div className="pt-3 pb-1 flex flex-wrap items-center justify-center gap-2 shrink-0">
        {isOfflineLoaded && normalizedLyrics.length > 0 && (
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 bg-[#1DB954]/10 border border-[#1DB954]/20 rounded-full text-[11px] font-semibold text-[#1DB954]">
            <CheckCircle2 className="w-3 h-3 text-[#1DB954]" />
            <span>Lirik Offline (IndexedDB)</span>
          </div>
        )}

        {!isSynced && normalizedLyrics.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/15 border border-amber-500/30 rounded-full text-[11px] font-semibold text-amber-300">
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>Lirik Teks Biasa • Belum Ada Lirik Sinkron</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('musicfy:reload-lyrics', { detail: { force: true } }));
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/10 hover:bg-white/20 active:scale-95 text-white/80 hover:text-white rounded-full text-[11px] font-medium transition-all cursor-pointer border border-white/10"
              title="Paksa cari ulang versi sinkron di database publik"
            >
              <RotateCcw className="w-3 h-3 text-[#1DB954]" />
              <span>Cari Ulang Sinkron</span>
            </button>
          </div>
        )}

        {/* Lyrics Offset Calibration Trigger (Batch 3 - Poin 68) */}
        {isSynced && currentVideoId && (
          <button
            onClick={() => setShowOffsetBar((prev) => !prev)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-semibold border transition-all cursor-pointer',
              lyricsOffset !== 0
                ? 'bg-[#1DB954]/20 border-[#1DB954]/40 text-[#1DB954]'
                : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
            )}
            title="Atur kalibrasi ketepatan waktu lirik"
          >
            <Clock className="w-3 h-3 text-[#1DB954]" />
            <span>
              Offset: {lyricsOffset > 0 ? `+${lyricsOffset.toFixed(1)}s` : `${lyricsOffset.toFixed(1)}s`}
            </span>
            {showOffsetBar ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {/* Expanded Lyrics Offset Calibration Controller */}
      {showOffsetBar && isSynced && currentVideoId && (
        <div className="mx-auto max-w-sm w-full px-4 pt-1 pb-2 z-20 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="bg-[#181818]/90 backdrop-blur-md border border-white/10 rounded-2xl p-2.5 shadow-xl flex flex-col items-center gap-2">
            <div className="flex items-center justify-between w-full px-1">
              <span className="text-[11px] text-white/60 font-medium">Kalibrasi Waktu Lirik</span>
              <span className="text-xs font-mono font-bold text-[#1DB954]">
                {lyricsOffset > 0 ? `+${lyricsOffset.toFixed(1)}s` : `${lyricsOffset.toFixed(1)}s`}
              </span>
            </div>

            <div className="flex items-center gap-1.5 w-full justify-center">
              <button
                onClick={() => adjustOffset(currentVideoId, -0.5)}
                className="px-2.5 py-1 bg-white/5 hover:bg-white/15 border border-white/10 rounded-lg text-xs font-semibold text-white transition-colors cursor-pointer"
                title="Lirik mundur 0.5 detik"
              >
                -0.5s
              </button>
              <button
                onClick={() => adjustOffset(currentVideoId, -0.1)}
                className="px-2.5 py-1 bg-white/5 hover:bg-white/15 border border-white/10 rounded-lg text-xs font-semibold text-white transition-colors cursor-pointer"
                title="Lirik mundur 0.1 detik"
              >
                -0.1s
              </button>
              <button
                onClick={() => resetOffset(currentVideoId)}
                className="flex items-center gap-1 px-3 py-1 bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg text-xs font-bold text-white transition-colors cursor-pointer"
                title="Reset offset ke 0"
              >
                <RotateCcw className="w-3 h-3 text-[#1DB954]" />
                <span>Reset</span>
              </button>
              <button
                onClick={() => adjustOffset(currentVideoId, 0.1)}
                className="px-2.5 py-1 bg-white/5 hover:bg-white/15 border border-white/10 rounded-lg text-xs font-semibold text-white transition-colors cursor-pointer"
                title="Lirik maju 0.1 detik"
              >
                +0.1s
              </button>
              <button
                onClick={() => adjustOffset(currentVideoId, 0.5)}
                className="px-2.5 py-1 bg-white/5 hover:bg-white/15 border border-white/10 rounded-lg text-xs font-semibold text-white transition-colors cursor-pointer"
                title="Lirik maju 0.5 detik"
              >
                +0.5s
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Boxless Karaoke Lyrics Container with Smooth Vertical Fade Mask */}
      <div
        ref={containerRef}
        onTouchStart={handleUserInteraction}
        onTouchMove={handleUserInteraction}
        onWheel={handleUserInteraction}
        className="flex-1 overflow-y-auto no-scrollbar py-[35vh] px-4 sm:px-8 max-w-3xl mx-auto w-full text-center space-y-4 md:space-y-5 lyrics-mask gpu-accelerated relative"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Intro Instrumental Indicator (Synced Mode Only) */}
        {isSynced && activeIndex === -1 && (
          <div className="py-6 flex flex-col items-center justify-center gap-2 text-white/40 animate-pulse text-center">
            <Disc3 className="w-6 h-6 animate-spin text-[#1DB954]/60" style={{ animationDuration: '4s' }} />
            <span className="text-xs font-semibold tracking-wider uppercase text-white/50">
              Musik Mengalun • Intro
            </span>
          </div>
        )}

        {/* Clean, True Karaoke Lyric Lines or High-Readability Plain Text */}
        {normalizedLyrics.map((line, idx) => {
          const textTrimmed = (line.text || '').trim();
          const isSectionHeader = /^\[.*?\]$/.test(textTrimmed);

          if (isSectionHeader) {
            return (
              <div key={`lyric-header-${idx}`} className="pt-3 pb-0.5 text-center">
                <span className="text-xs font-bold text-[#1DB954] tracking-widest uppercase">
                  {textTrimmed.replace(/[\[\]]/g, '')}
                </span>
              </div>
            );
          }

          if (!isSynced) {
            return (
              <div
                key={`lyric-plain-${idx}`}
                className="py-1 px-3 select-text text-white/85 hover:text-white text-lg sm:text-xl md:text-2xl font-medium leading-relaxed transition-colors text-center"
              >
                <p className="text-center">{line.text}</p>
              </div>
            );
          }

          return (
            <LyricRow
              key={`lyric-${idx}`}
              idx={idx}
              text={line.text}
              time={line.time}
              isActive={idx === activeIndex}
              onSeek={onSeek}
              setRef={(el) => {
                lineRefs.current[idx] = el;
              }}
            />
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
