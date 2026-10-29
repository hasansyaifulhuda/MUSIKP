'use client';

import React, { memo, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { usePlayerStore, Track } from '@/lib/store';
import { useMusic } from '@/context/MusicContext';
import { LyricLine, findActiveLyricIndex, interpolateLyricsTimestamps } from '@/lib/performance';
import { getHighResImage, cn } from '@/lib/utils';
import Image from 'next/image';
import {
  Minimize2,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Heart,
  Radio,
  Disc3,
  Sparkles,
  Loader2,
  Clock,
  RotateCcw,
  FileText,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useLyricsOffsetStore } from '@/lib/lyricsOffsetStore';
import { db } from '@/lib/db';
import { getFastCachedLyrics } from '@/lib/lyricsCache';
import { getPersistentAudioElement } from '@/lib/audioElement';

export interface FullScreenLyricsProps {
  lyrics: LyricLine[];
  onClose: () => void;
  onSeek: (time: number) => void;
  isSynced: boolean;
  isLoading?: boolean;
}

/**
 * Enterprise Immersive Full-Screen Karaoke Lyrics Experience
 * Master Blueprint PMUSIC Architecture - Batch 2 (Poin 24)
 *
 * Guarantees:
 * 1. 100% full-screen immersive canvas with dynamic ambient color gradients.
 * 2. Ultra-large high-contrast responsive typography (text-3xl to text-6xl).
 * 3. 60fps smooth vertical scrolling with automatic viewport auto-centering.
 * 4. Interactive click-to-seek and manual scroll re-sync pill.
 * 5. Floating minimal playback controller island.
 * 6. Keyboard accessibility: Escape to exit, Spacebar to toggle play/pause.
 */
export const FullScreenLyrics = memo(function FullScreenLyrics({
  lyrics,
  onClose,
  onSeek,
  isSynced,
  isLoading = false,
}: FullScreenLyricsProps) {
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const currentTime = usePlayerStore((state) => state.progress);
  const duration = usePlayerStore((state) => state.duration);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const isBuffering = usePlayerStore((state) => state.isBuffering);
  const dominantColor = usePlayerStore((state) => state.dominantColor);

  const { togglePlay, playNext, playPrev, isLiked: checkLiked, toggleLike } = useMusic();
  const isLiked = currentTrack ? checkLiked(currentTrack.videoId) : false;

  const currentVideoId = currentTrack?.videoId;
  const lyricsOffset = useLyricsOffsetStore((state) => state.getOffset(currentVideoId));
  const adjustOffset = useLyricsOffsetStore((state) => state.adjustOffset);
  const resetOffset = useLyricsOffsetStore((state) => state.resetOffset);
  const [showOffsetControls, setShowOffsetControls] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isUserScrollingRef = useRef<boolean>(false);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const activeIndexRef = useRef<number>(-1);
  const isFirstScrollRef = useRef<boolean>(true);
  const [showSyncButton, setShowSyncButton] = useState<boolean>(false);

  // Keyboard shortcut listener (ESC to exit, Space to toggle playback)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, togglePlay]);

  // Fallback to offline/cached lyrics if prop is momentarily empty
  const [localLyrics, setLocalLyrics] = useState<LyricLine[] | null>(null);
  const [localIsSynced, setLocalIsSynced] = useState<boolean>(false);

  useEffect(() => {
    if ((!lyrics || lyrics.length === 0) && currentVideoId) {
      // 1. Check synchronous fast cache (Memory + LocalStorage)
      const fast = getFastCachedLyrics(currentVideoId);
      if (fast && fast.lyrics.length > 0) {
        setLocalLyrics(fast.lyrics);
        setLocalIsSynced(fast.synced);
        return;
      }

      let isMounted = true;
      db.getOfflineTrack(currentVideoId).then((off) => {
        if (isMounted && off?.lyrics && off.lyrics.length > 0) {
          setLocalLyrics(off.lyrics);
          setLocalIsSynced(Boolean(off.isSyncedLyrics ?? off.synced));
          return;
        }
        db.getMetadataCache<{ lyrics: LyricLine[]; synced: boolean }>(`lyrics:${currentVideoId}`).then((c) => {
          if (isMounted && c?.lyrics && c.lyrics.length > 0) {
            setLocalLyrics(c.lyrics);
            setLocalIsSynced(Boolean(c.synced));
          }
        }).catch(() => {});
      }).catch(() => {});
      return () => {
        isMounted = false;
      };
    } else {
      setLocalLyrics(null);
    }
  }, [lyrics, currentVideoId]);

  const activeLyrics = useMemo(() => {
    return lyrics && lyrics.length > 0 ? lyrics : localLyrics || [];
  }, [lyrics, localLyrics]);

  const activeIsSynced = useMemo(() => {
    return lyrics && lyrics.length > 0 ? isSynced : localIsSynced;
  }, [lyrics, isSynced, localIsSynced]);

  // Optional User Toggle: Automatically interpolate timing estimates if lyrics are plain text
  const [isAutoTimingEnabled, setIsAutoTimingEnabled] = useState(false);

  const effectiveLyrics = useMemo(() => {
    if (!activeIsSynced && isAutoTimingEnabled && activeLyrics.length > 0) {
      return interpolateLyricsTimestamps(activeLyrics, duration);
    }
    return activeLyrics;
  }, [activeLyrics, activeIsSynced, isAutoTimingEnabled, duration]);

  const effectiveIsSynced = useMemo(() => {
    return activeIsSynced || isAutoTimingEnabled;
  }, [activeIsSynced, isAutoTimingEnabled]);

  // 1. Real-time 60fps RAF Synchronization directly with native HTML5 audio element
  useEffect(() => {
    if (!effectiveIsSynced || !effectiveLyrics || effectiveLyrics.length === 0) {
      return;
    }

    const audio = getPersistentAudioElement();
    if (!audio) return;

    let rafId: number | null = null;

    const checkAndUpdateLyric = () => {
      const curTime = audio.currentTime;
      const effectiveTime = Math.max(0, curTime + lyricsOffset);
      const newIndex = findActiveLyricIndex(effectiveLyrics, effectiveTime);

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

    // Initial check
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
  }, [effectiveIsSynced, effectiveLyrics, lyricsOffset]);

  // 2. Immediate synchronization when seeking via external progress bar
  useEffect(() => {
    if (!effectiveIsSynced || !effectiveLyrics || effectiveLyrics.length === 0) return;
    const effectiveTime = Math.max(0, currentTime + lyricsOffset);
    const idx = findActiveLyricIndex(effectiveLyrics, effectiveTime);
    if (idx !== activeIndexRef.current) {
      activeIndexRef.current = idx;
      setActiveIndex(idx);
    }
  }, [currentTime, effectiveIsSynced, effectiveLyrics, lyricsOffset]);

  // 3. Smooth auto-scroll active lyric line to vertical center using container-relative math
  const scrollToActiveLine = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    if (index < 0 || isUserScrollingRef.current) return;
    const container = containerRef.current;
    const activeEl = lineRefs.current[index];
    if (!container || !activeEl) return;

    const containerHeight = container.clientHeight;
    const lineTop = activeEl.offsetTop;
    const lineHeight = activeEl.offsetHeight;
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
    if (!effectiveIsSynced || isUserScrollingRef.current || activeIndex < 0) return;
    const behavior: ScrollBehavior = isFirstScrollRef.current ? 'auto' : 'smooth';
    isFirstScrollRef.current = false;
    scrollToActiveLine(activeIndex, behavior);
  }, [activeIndex, effectiveIsSynced, scrollToActiveLine]);

  // 4. User interaction & manual re-sync handling
  const handleUserInteraction = useCallback(() => {
    isUserScrollingRef.current = true;
    setShowSyncButton(true);

    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    userScrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
      setShowSyncButton(false);
      if (activeIndexRef.current >= 0) {
        scrollToActiveLine(activeIndexRef.current, 'smooth');
      }
    }, 3500);
  }, [scrollToActiveLine]);

  const handleManualSync = useCallback(() => {
    isUserScrollingRef.current = false;
    setShowSyncButton(false);
    if (activeIndexRef.current >= 0) {
      scrollToActiveLine(activeIndexRef.current, 'smooth');
    }
  }, [scrollToActiveLine]);

  if (!currentTrack) return null;

  const thumbnail = getHighResImage(
    currentTrack.thumbnails?.[currentTrack.thumbnails.length - 1]?.url,
    200
  );
  const artistName = Array.isArray(currentTrack.artist)
    ? currentTrack.artist.map((a: any) => (typeof a === 'string' ? a : a?.name || '')).filter(Boolean).join(', ')
    : currentTrack.artist?.name || 'Unknown Artist';

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[200] bg-[#070707] text-white flex flex-col overflow-hidden select-none"
    >
      {/* Ambient Dynamic Glow Orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10">
        <div
          className="absolute -top-[25%] -left-[10%] w-[70vw] h-[70vw] max-w-[800px] max-h-[800px] rounded-full opacity-40 blur-[120px] transition-all duration-1000"
          style={{
            backgroundColor: dominantColor || '#1DB954',
          }}
        />
        <div
          className="absolute -bottom-[20%] -right-[10%] w-[60vw] h-[60vw] max-w-[700px] max-h-[700px] rounded-full opacity-25 blur-[140px] transition-all duration-1000"
          style={{
            backgroundColor: dominantColor || '#10B981',
          }}
        />
        <div className="absolute inset-0 bg-black/60 backdrop-blur-3xl" />
      </div>

      {/* TOP HEADER */}
      <header className="relative z-20 flex items-center justify-between p-4 md:px-8 border-b border-white/5 bg-black/20 backdrop-blur-md">
        <div className="flex items-center gap-3.5 min-w-0 pr-4">
          <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 shadow-lg border border-white/10">
            <Image src={thumbnail} alt={currentTrack.name} fill sizes="44px" priority className="object-cover" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm md:text-base font-bold text-white truncate tracking-tight">
              {currentTrack.name}
            </h2>
            <p className="text-xs text-white/60 truncate">{artistName}</p>
          </div>
          {activeIsSynced && (
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#1DB954]/20 border border-[#1DB954]/30 rounded-full text-[11px] font-semibold text-[#1DB954] shrink-0 ml-2">
              <Sparkles className="w-3 h-3" />
              <span>Tersinkronisasi</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Lyrics Offset Calibration Trigger (Batch 3 - Poin 68) */}
          {activeIsSynced && currentVideoId && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setShowOffsetControls((prev) => !prev);
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer border',
                lyricsOffset !== 0
                  ? 'bg-[#1DB954]/20 border-[#1DB954]/50 text-[#1DB954]'
                  : 'bg-white/10 hover:bg-white/20 border-white/10 text-white/80'
              )}
              title="Atur kalibrasi waktu lirik"
            >
              <Clock className="w-3.5 h-3.5 text-[#1DB954]" />
              <span className="font-mono">
                {lyricsOffset > 0 ? `+${lyricsOffset.toFixed(1)}s` : `${lyricsOffset.toFixed(1)}s`}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onClose();
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 rounded-full text-xs font-bold text-white transition-all cursor-pointer shadow-lg active:scale-95"
            title="Tutup mode layar penuh (Esc)"
          >
            <Minimize2 className="w-4 h-4" />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </header>

      {/* Floating Offset Calibration Bar in Full-Screen Lyrics */}
      {showOffsetControls && activeIsSynced && currentVideoId && (
        <div className="relative z-30 bg-black/60 backdrop-blur-xl border-b border-white/10 py-2 px-4 flex items-center justify-center animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span className="text-xs text-white/60 font-medium mr-1">Kalibrasi Sinkronisasi:</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                adjustOffset(currentVideoId, -0.5);
              }}
              className="px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              -0.5s
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                adjustOffset(currentVideoId, -0.1);
              }}
              className="px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              -0.1s
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                resetOffset(currentVideoId);
              }}
              className="flex items-center gap-1 px-3 py-1 bg-[#1DB954]/20 hover:bg-[#1DB954]/30 border border-[#1DB954]/40 text-[#1DB954] rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                adjustOffset(currentVideoId, 0.1);
              }}
              className="px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              +0.1s
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                adjustOffset(currentVideoId, 0.5);
              }}
              className="px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              +0.5s
            </button>
          </div>
        </div>
      )}

      {/* MAIN LYRICS SCROLLER */}
      <main className="flex-1 relative min-h-0 w-full overflow-hidden flex flex-col justify-center">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-white/50 space-y-3 animate-in fade-in duration-200">
            <Loader2 className="w-10 h-10 animate-spin text-[#1DB954]" />
            <p className="text-sm font-semibold text-white/80 animate-pulse">Mencari & menyiapkan lirik imersif...</p>
          </div>
        ) : !activeLyrics || activeLyrics.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/50 space-y-3 px-6 text-center animate-in fade-in duration-300">
            <Disc3 className="w-12 h-12 text-white/30 animate-spin" style={{ animationDuration: '8s' }} />
            <p className="text-xl font-bold text-white/80">Lirik Belum Tersedia</p>
            <p className="text-xs text-white/50 max-w-sm leading-relaxed">
              Lirik belum ditemukan di database publik untuk lagu ini. Tekan tombol di bawah untuk mencoba pencarian ulang multi-layer.
            </p>
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
              className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 bg-[#1DB954]/20 hover:bg-[#1DB954]/30 text-white rounded-full text-xs font-bold transition-all cursor-pointer active:scale-95 border border-[#1DB954]/40 shadow-lg hover:shadow-[#1DB954]/15"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#1DB954]" />
              <span>Coba Cari Ulang Lirik</span>
            </button>
          </div>
        ) : (
          <div
            ref={containerRef}
            onTouchStart={handleUserInteraction}
            onTouchMove={handleUserInteraction}
            onWheel={handleUserInteraction}
            className="flex-1 overflow-y-auto no-scrollbar py-[38vh] px-6 sm:px-12 md:px-20 max-w-4xl mx-auto w-full text-center space-y-6 md:space-y-8 lyrics-mask gpu-accelerated relative"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {/* Mode Banner for Plain Lyrics with Retry and Auto-Timing Action */}
            {!activeIsSynced && (
              <div className="flex flex-col items-center gap-2 mb-6 max-w-md mx-auto animate-in fade-in duration-200">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-amber-500/15 border border-amber-500/30 rounded-full text-xs font-semibold text-amber-300 backdrop-blur-md shadow-lg">
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span>Lirik Teks Biasa • Belum Ada Lirik Sinkron</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('musicfy:reload-lyrics', { detail: { force: true } }));
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 hover:bg-white/20 active:scale-95 text-white/80 hover:text-white rounded-full text-[11px] font-medium transition-all cursor-pointer border border-white/10"
                    title="Paksa cari ulang versi sinkron di database publik"
                  >
                    <RotateCcw className="w-3 h-3 text-[#1DB954]" />
                    <span>Cari Ulang Versi Sinkron</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setIsAutoTimingEnabled((prev) => !prev);
                    }}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer border',
                      isAutoTimingEnabled
                        ? 'bg-[#1DB954]/20 border-[#1DB954]/40 text-[#1DB954]'
                        : 'bg-white/10 hover:bg-white/20 border-white/10 text-white/80 hover:text-white'
                    )}
                    title="Estimasi timing sinkronisasi otomatis berdasarkan durasi lagu"
                  >
                    <Sparkles className="w-3 h-3 text-[#1DB954]" />
                    <span>{isAutoTimingEnabled ? 'Estimasi Aktif (Mode Baca)' : 'Konversi Otomatis ke Karaoke'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Intro Instrumental Indicator (Synced Mode Only) */}
            {effectiveIsSynced && activeIndex === -1 && (
              <div className="py-6 flex flex-col items-center justify-center gap-2 text-white/40 animate-pulse">
                <Disc3 className="w-7 h-7 animate-spin text-[#1DB954]/70" style={{ animationDuration: '4s' }} />
                <span className="text-xs font-bold tracking-widest uppercase text-white/60">
                  Musik Mengalun • Intro
                </span>
              </div>
            )}

            {/* Lyric Lines (Supports Synced Karaoke, Auto-Converted, and Plain Lyrics) */}
            {effectiveLyrics.map((line, idx) => {
              const textTrimmed = (line.text || '').trim();
              const isSectionHeader = /^\[.*?\]$/.test(textTrimmed);

              if (isSectionHeader) {
                return (
                  <div key={`fs-header-${idx}`} className="pt-4 pb-1">
                    <span className="text-xs sm:text-sm font-bold text-[#1DB954] tracking-widest uppercase">
                      {textTrimmed.replace(/[\[\]]/g, '')}
                    </span>
                  </div>
                );
              }

              // Plain Lyrics Mode: Highly legible, comfortable reading styling
              if (!effectiveIsSynced) {
                return (
                  <div
                    key={`fs-plain-${idx}`}
                    className="py-1.5 px-4 select-text text-white/85 hover:text-white text-xl sm:text-2xl md:text-3xl font-medium leading-relaxed transition-colors"
                  >
                    <p>{line.text}</p>
                  </div>
                );
              }

              // Synced Karaoke Mode: High-contrast active line highlight with smooth focus
              const isActive = idx === activeIndex;
              return (
                <div
                  key={`fs-lyric-${idx}`}
                  ref={(el) => {
                    lineRefs.current[idx] = el;
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onSeek(line.time);
                  }}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    'py-2.5 px-4 cursor-pointer transition-all duration-300 ease-out transform-gpu select-none rounded-2xl',
                    isActive
                      ? 'scale-[1.04] font-black text-white text-3xl sm:text-4xl md:text-5xl lg:text-6xl opacity-100 drop-shadow-[0_4px_30px_rgba(255,255,255,0.45)]'
                      : 'scale-100 font-bold text-white/30 text-xl sm:text-2xl md:text-3xl lg:text-4xl opacity-35 hover:opacity-75 hover:text-white/80'
                  )}
                >
                  <p className="leading-tight tracking-tight transition-colors duration-200">
                    {line.text}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Floating Re-Sync Button */}
        {showSyncButton && activeIndex >= 0 && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleManualSync();
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#1DB954] text-black font-bold text-xs shadow-2xl hover:scale-105 active:scale-95 transition-transform cursor-pointer"
            >
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>Kembali ke lirik aktif</span>
            </button>
          </div>
        )}
      </main>

      {/* FLOATING BOTTOM CONTROLLER ISLAND */}
      <footer className="relative z-20 pb-6 pt-2 px-4 flex justify-center">
        <div className="flex items-center gap-4 bg-black/60 backdrop-blur-2xl border border-white/10 rounded-full py-2.5 px-6 shadow-2xl">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (currentTrack) toggleLike(currentTrack);
            }}
            className="p-1.5 text-white/60 hover:text-white transition-colors cursor-pointer"
            title="Sukai lagu"
          >
            <Heart className={cn('w-5 h-5', isLiked && 'fill-[#1DB954] text-[#1DB954]')} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              playPrev();
            }}
            className="p-1.5 text-white/70 hover:text-white transition-colors cursor-pointer"
            title="Sebelumnya"
          >
            <SkipBack className="w-5 h-5 fill-current" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              togglePlay();
            }}
            className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-lg cursor-pointer"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying && isBuffering ? (
              <Loader2 className="w-5 h-5 animate-spin text-black" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              playNext();
            }}
            className="p-1.5 text-white/70 hover:text-white transition-colors cursor-pointer"
            title="Berikutnya"
          >
            <SkipForward className="w-5 h-5 fill-current" />
          </button>

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-white/50 font-mono pl-2 border-l border-white/10">
            <span>{formatTime(currentTime)}</span>
            <span>/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </footer>
    </motion.div>
  );
});
