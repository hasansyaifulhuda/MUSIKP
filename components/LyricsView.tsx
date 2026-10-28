'use client';

import React, { memo, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Mic2, Loader2, Disc3, Radio, FileText, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { findActiveLyricIndex, normalizeLyrics, LyricLine } from '@/lib/performance';
import { getPersistentAudioElement } from '@/lib/audioElement';
import { usePlayerStore } from '@/lib/store';
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
          'py-3.5 px-4 cursor-pointer transition-all duration-300 ease-out transform-gpu select-none focus:outline-none origin-center rounded-2xl',
          isActive
            ? 'scale-[1.05] font-black text-white text-2xl sm:text-3xl md:text-4xl opacity-100 drop-shadow-[0_4px_24px_rgba(255,255,255,0.35)] bg-white/[0.04]'
            : 'scale-100 font-semibold text-white/35 text-lg sm:text-xl md:text-2xl opacity-40 hover:opacity-75 hover:text-white/70 hover:bg-white/[0.02]'
        )}
      >
        <p className="leading-relaxed tracking-tight transition-colors duration-200">{text}</p>
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

  // 2. Direct Offline IndexedDB Support:
  // If track was downloaded or device is offline, read lyrics directly from IndexedDB without network fetch
  const [localOfflineLyrics, setLocalOfflineLyrics] = useState<LyricLine[] | null>(null);
  const [isLocalOfflineSynced, setIsLocalOfflineSynced] = useState<boolean>(false);
  const [isReadingLocalDb, setIsReadingLocalDb] = useState<boolean>(false);
  const [isOfflineLoaded, setIsOfflineLoaded] = useState<boolean>(false);

  useEffect(() => {
    if (!currentVideoId) {
      setLocalOfflineLyrics(null);
      setIsLocalOfflineSynced(false);
      setIsOfflineLoaded(false);
      return;
    }

    // If lyrics prop is already provided with data
    if (Array.isArray(lyrics) && lyrics.length > 0) {
      const isDownloaded = db.isOfflineTrackSync(currentVideoId);
      setIsOfflineLoaded(isDownloaded);
      return;
    }

    // Otherwise (lyrics empty or offline or downloaded track): read directly from IndexedDB
    let isCancelled = false;
    setIsReadingLocalDb(true);

    db.getOfflineTrack(currentVideoId)
      .then((offlineItem) => {
        if (!isCancelled && offlineItem && Array.isArray(offlineItem.lyrics) && offlineItem.lyrics.length > 0) {
          setLocalOfflineLyrics(offlineItem.lyrics);
          setIsLocalOfflineSynced(Boolean(offlineItem.isSyncedLyrics ?? offlineItem.synced));
          setIsOfflineLoaded(true);
        }
      })
      .catch((err) => {
        console.warn('[LyricsView] Error reading lyrics from IndexedDB:', err);
      })
      .finally(() => {
        if (!isCancelled) setIsReadingLocalDb(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [currentVideoId, lyrics]);

  // Combine prop lyrics and IndexedDB offline lyrics
  const activeLyricsSource = useMemo(() => {
    if (Array.isArray(lyrics) && lyrics.length > 0) return lyrics;
    if (Array.isArray(localOfflineLyrics) && localOfflineLyrics.length > 0) return localOfflineLyrics;
    return [];
  }, [lyrics, localOfflineLyrics]);

  const activeIsSynced = useMemo(() => {
    if (Array.isArray(lyrics) && lyrics.length > 0) return isSynced;
    if (Array.isArray(localOfflineLyrics) && localOfflineLyrics.length > 0) return isLocalOfflineSynced;
    return isSynced;
  }, [lyrics, isSynced, localOfflineLyrics, isLocalOfflineSynced]);

  const effectiveIsLoading = isLoading || isReadingLocalDb;

  // 3. Normalize and validate timestamps: seconds vs milliseconds, strings, and chronological sorting
  const normalizedLyrics = useMemo(() => {
    return normalizeLyrics(activeLyricsSource, duration);
  }, [activeLyricsSource, duration]);

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

  // 4. Ultra-Low Overhead Audio Event Listener (Fix Freeze Bug):
  // Evaluates active index on timeupdate, but triggers React setState ONLY when the active index changes!
  useEffect(() => {
    const audio = getPersistentAudioElement();
    if (!audio) return;

    const checkAndUpdateLyric = () => {
      const curTime = audio.currentTime;
      const newIndex = findActiveLyricIndex(normalizedLyrics, curTime);

      // Throttling: ONLY trigger React state update if the line index actually changed
      if (newIndex !== activeIndexRef.current) {
        activeIndexRef.current = newIndex;
        setActiveIndex(newIndex);
      }
    };

    // Initial evaluation
    checkAndUpdateLyric();

    audio.addEventListener('timeupdate', checkAndUpdateLyric, { passive: true });
    audio.addEventListener('seeked', checkAndUpdateLyric, { passive: true });

    return () => {
      audio.removeEventListener('timeupdate', checkAndUpdateLyric);
      audio.removeEventListener('seeked', checkAndUpdateLyric);
    };
  }, [normalizedLyrics]);

  // 5. Synchronize when external scrubber progress changes (seeking via progress bar)
  useEffect(() => {
    if (typeof currentTime === 'number' && !isNaN(currentTime)) {
      const newIndex = findActiveLyricIndex(normalizedLyrics, currentTime);
      if (newIndex !== activeIndexRef.current) {
        activeIndexRef.current = newIndex;
        setActiveIndex(newIndex);
      }
    }
  }, [currentTime, normalizedLyrics]);

  // 6. Smooth Scroll & Auto-Center:
  // Automatically scrolls the active lyric line to center using native scrollIntoView safely
  useEffect(() => {
    if (activeIndex < 0 || isUserScrollingRef.current) return;

    const targetEl = lineRefs.current[activeIndex];
    if (!targetEl) return;

    // First time opening the lyrics tab: jump instantly without animated scroll
    const behavior: ScrollBehavior = isFirstScrollRef.current ? 'auto' : 'smooth';
    isFirstScrollRef.current = false;

    try {
      targetEl.scrollIntoView({
        behavior,
        block: 'center',
        inline: 'nearest',
      });
    } catch {
      try {
        targetEl.scrollIntoView(true);
      } catch {}
    }
  }, [activeIndex]);

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
        const targetEl = lineRefs.current[activeIndexRef.current];
        if (targetEl) {
          try {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          } catch {}
        }
      }
    }, 3200);
  }, []);

  // Manual re-sync to current playback
  const handleManualSync = useCallback(() => {
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    isUserScrollingRef.current = false;
    setShowSyncButton(false);
    if (activeIndexRef.current >= 0) {
      const targetEl = lineRefs.current[activeIndexRef.current];
      if (targetEl) {
        try {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        } catch {}
      }
    }
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
    };
  }, []);

  // Loading state
  if (effectiveIsLoading) {
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

  // Clean, resilient empty state
  if (!normalizedLyrics || normalizedLyrics.length === 0) {
    const isDeviceOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/50 space-y-4 py-28 select-none text-center px-4 max-w-md mx-auto">
        <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 shadow-inner">
          <Mic2 className="w-9 h-9 opacity-50" />
        </div>
        <div className="space-y-1">
          <p className="text-lg font-bold text-white/90">
            {isDeviceOffline ? 'Lirik belum tersimpan di memori offline' : 'Lirik tidak tersedia untuk lagu ini'}
          </p>
          <p className="text-xs text-white/40 leading-relaxed">
            {isDeviceOffline
              ? 'Lirik lagu ini belum diunduh ke penyimpanan IndexedDB perangkat. Unduh lagu saat terhubung internet untuk menyertakan liriknya.'
              : 'Lagu ini belum memiliki lirik di database kami. Pemutaran lagu tetap berjalan normal.'}
          </p>
        </div>
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

        {!activeIsSynced && normalizedLyrics.length > 0 && (
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 bg-white/5 border border-white/10 rounded-full text-[11px] font-medium text-white/70">
            <FileText className="w-3 h-3 text-[#1DB954]" />
            <span>Mode Lirik Teks • Ketuk baris untuk melompat</span>
          </div>
        )}
      </div>

      {/* Main Boxless Karaoke Lyrics Container with Smooth Vertical Fade Mask */}
      <div
        ref={containerRef}
        onTouchStart={handleUserInteraction}
        onTouchMove={handleUserInteraction}
        onWheel={handleUserInteraction}
        className="flex-1 overflow-y-auto no-scrollbar py-[35vh] px-4 sm:px-8 max-w-3xl mx-auto w-full text-center space-y-3.5 md:space-y-4 lyrics-mask gpu-accelerated relative"
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

        {/* Clean, True Karaoke Lyric Lines rendered via isolated memoized LyricRow */}
        {normalizedLyrics.map((line, idx) => (
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
        ))}
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
