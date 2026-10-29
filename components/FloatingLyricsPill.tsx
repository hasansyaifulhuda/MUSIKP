'use client';

import React, { memo, useMemo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic2, Maximize2, X, Sparkles, Disc3, FileText } from 'lucide-react';
import { usePlayerStore } from '@/lib/store';
import { useFloatingLyricsStore } from '@/lib/floatingLyricsStore';
import { useLyricsOffsetStore } from '@/lib/lyricsOffsetStore';
import { LyricLine, findActiveLyricIndex } from '@/lib/performance';
import { cn } from '@/lib/utils';
import { getPersistentAudioElement } from '@/lib/audioElement';

export interface FloatingLyricsPillProps {
  lyrics: LyricLine[];
  isSynced: boolean;
  onOpenLyrics: () => void;
}

/**
 * Enterprise Compact Floating Lyrics Pill (Quick View)
 * Master Blueprint PMUSIC Architecture - Batch 3 (Poin 80)
 *
 * Guarantees:
 * 1. Minimalist floating pill anchored above the Mobile Mini-Player.
 * 2. Instant real-time preview of active vocal line with smooth crossfade animations.
 * 3. Offset-synchronized time tracking.
 * 4. 1-tap expansion directly into Full-Screen Karaoke or Player lyrics.
 * 5. Hardware-accelerated (translate3d) rendering.
 */
export const FloatingLyricsPill = memo(function FloatingLyricsPill({
  lyrics,
  isSynced,
  onOpenLyrics,
}: FloatingLyricsPillProps) {
  const isEnabled = useFloatingLyricsStore((state) => state.isEnabled);
  const toggleEnabled = useFloatingLyricsStore((state) => state.toggleEnabled);

  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const currentTime = usePlayerStore((state) => state.progress);
  const isExpanded = usePlayerStore((state) => state.isExpanded);

  const currentVideoId = currentTrack?.videoId;
  const lyricsOffset = useLyricsOffsetStore((state) => state.getOffset(currentVideoId));

  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const activeIndexRef = useRef<number>(-1);

  // Real-time audio engine listener
  useEffect(() => {
    if (!isSynced || !lyrics || lyrics.length === 0) return;
    const audio = getPersistentAudioElement();
    if (!audio) return;

    let rafId: number | null = null;

    const update = () => {
      const curTime = audio.currentTime;
      const effectiveTime = Math.max(0, curTime + lyricsOffset);
      const idx = findActiveLyricIndex(lyrics, effectiveTime);
      if (idx !== activeIndexRef.current) {
        activeIndexRef.current = idx;
        setActiveIndex(idx);
      }
      if (!audio.paused && !audio.ended) {
        rafId = requestAnimationFrame(update);
      }
    };

    update();
    if (!audio.paused) {
      rafId = requestAnimationFrame(update);
    }

    const handleImmediate = () => update();
    audio.addEventListener('play', update, { passive: true });
    audio.addEventListener('pause', handleImmediate, { passive: true });
    audio.addEventListener('timeupdate', handleImmediate, { passive: true });
    audio.addEventListener('seeked', handleImmediate, { passive: true });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      audio.removeEventListener('play', update);
      audio.removeEventListener('pause', handleImmediate);
      audio.removeEventListener('timeupdate', handleImmediate);
      audio.removeEventListener('seeked', handleImmediate);
    };
  }, [isSynced, lyrics, lyricsOffset]);

  // Scrubber fallback
  useEffect(() => {
    if (!isSynced || !lyrics || lyrics.length === 0) return;
    const effectiveTime = Math.max(0, currentTime + lyricsOffset);
    const idx = findActiveLyricIndex(lyrics, effectiveTime);
    if (idx !== activeIndexRef.current) {
      activeIndexRef.current = idx;
      setActiveIndex(idx);
    }
  }, [currentTime, isSynced, lyrics, lyricsOffset]);

  const activeLyricText = useMemo(() => {
    if (activeIndex >= 0 && lyrics[activeIndex]) {
      return lyrics[activeIndex].text;
    }
    return null;
  }, [activeIndex, lyrics]);

  // Don't display if disabled, expanded full-player is open, or no track is loaded
  if (!isEnabled || isExpanded || !currentTrack || !lyrics || lyrics.length === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 20, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="fixed bottom-[128px] md:bottom-28 left-3 right-3 md:left-72 md:right-auto max-w-sm md:max-w-md mx-auto md:mx-0 z-40 select-none pointer-events-auto"
      >
        <div
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onOpenLyrics();
          }}
          className="group relative flex items-center gap-2.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-full bg-[#121212]/95 hover:bg-[#181818] border border-white/10 hover:border-[#1DB954]/40 shadow-2xl backdrop-blur-xl cursor-pointer transition-all duration-200"
        >
          {/* Status Icon */}
          <div
            className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center shrink-0 shadow-sm',
              !isSynced
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-[#1DB954]/20 text-[#1DB954]'
            )}
          >
            {!isSynced ? (
              <FileText className="w-3.5 h-3.5 text-amber-400" />
            ) : isPlaying ? (
              <Mic2 className="w-3.5 h-3.5 animate-pulse text-[#1DB954]" />
            ) : (
              <Disc3 className="w-3.5 h-3.5 text-white/60" />
            )}
          </div>

          {/* Active Lyrics Line Text with Animated Transition */}
          <div className="flex-1 min-w-0 pr-1 overflow-hidden">
            <AnimatePresence mode="wait">
              {!isSynced ? (
                <motion.p
                  key="plain-indicator"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs font-medium text-amber-300/90 truncate"
                >
                  Lirik Teks Biasa • Ketuk untuk membaca
                </motion.p>
              ) : activeLyricText ? (
                <motion.p
                  key={activeLyricText}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.2 }}
                  className="text-xs font-semibold text-white truncate tracking-tight"
                >
                  {activeLyricText}
                </motion.p>
              ) : (
                <motion.p
                  key="intro"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs font-medium text-white/50 italic truncate"
                >
                  Musik mengalun... • Ketuk untuk lirik penuh
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onOpenLyrics();
              }}
              className="p-1 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Buka lirik layar penuh"
              aria-label="Buka lirik layar penuh"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                toggleEnabled();
              }}
              className="p-1 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Sembunyikan pil lirik"
              aria-label="Tutup pil lirik"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
});
