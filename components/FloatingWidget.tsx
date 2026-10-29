'use client';

import React, { memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { usePlayerStore } from '@/lib/store';
import { useFloatingWidgetStore } from '@/lib/floatingWidgetStore';
import { useMusic } from '@/context/MusicContext';
import { getHighResImage, cn } from '@/lib/utils';
import Image from 'next/image';
import { MarqueeText } from './MarqueeText';
import { Play, Pause, SkipForward, Maximize2, X, Loader2 } from 'lucide-react';

/**
 * Enterprise Responsive Floating Mini-Player Widget
 * Master Blueprint PMUSIC Architecture - Batch 2 (Poin 22)
 *
 * Guarantees:
 * 1. Persistent, draggable corner widget that remains active across all routes.
 * 2. Smooth playback controls (Play/Pause, Skip Next, Maximize, Dismiss).
 * 3. Integrated mini progress bar with live track feedback.
 * 4. Automatic suppression when the full expanded player is opened.
 * 5. Touch-friendly physics with bounded viewport dragging.
 */
export const FloatingWidget = memo(function FloatingWidget() {
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const isBuffering = usePlayerStore((state) => state.isBuffering);
  const isExpanded = usePlayerStore((state) => state.isExpanded);
  const setExpanded = usePlayerStore((state) => state.setExpanded);
  const progress = usePlayerStore((state) => state.progress);
  const duration = usePlayerStore((state) => state.duration);

  const isEnabled = useFloatingWidgetStore((state) => state.isEnabled);
  const isOpen = useFloatingWidgetStore((state) => state.isOpen);
  const closeWidget = useFloatingWidgetStore((state) => state.closeWidget);

  const { togglePlay, playNext } = useMusic();

  // Only render if enabled, a track is loaded, and the expanded full player is NOT open
  const shouldShow = Boolean(isEnabled && isOpen && currentTrack && !isExpanded);

  if (!shouldShow || !currentTrack) return null;

  const thumbnail = getHighResImage(
    currentTrack.thumbnails?.[currentTrack.thumbnails.length - 1]?.url,
    150
  );
  const artistName = Array.isArray(currentTrack.artist)
    ? currentTrack.artist.map((a: any) => (typeof a === 'string' ? a : a?.name || '')).filter(Boolean).join(', ')
    : currentTrack.artist?.name || 'Unknown Artist';

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (progress / duration) * 100)) : 0;

  return (
    <AnimatePresence>
      <motion.div
        drag
        dragConstraints={{ top: -450, bottom: 20, left: -320, right: 20 }}
        dragElastic={0.15}
        initial={{ opacity: 0, scale: 0.85, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: 30 }}
        transition={{ type: 'spring', damping: 20, stiffness: 260 }}
        className="fixed bottom-24 right-4 sm:right-6 z-40 w-[300px] sm:w-[330px] bg-[#181818]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-2.5 shadow-2xl shadow-black/80 flex flex-col overflow-hidden select-none cursor-grab active:cursor-grabbing transform-gpu"
        style={{
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        }}
      >
        <div className="flex items-center gap-3">
          {/* Artwork Thumbnail */}
          <div
            onClick={() => setExpanded(true)}
            className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-md cursor-pointer group"
          >
            <Image
              src={thumbnail}
              alt={currentTrack.name}
              fill
              sizes="48px"
              priority
              className={cn(
                'object-cover transition-transform duration-500',
                isPlaying && 'scale-105'
              )}
            />
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Maximize2 className="w-4 h-4 text-white" />
            </div>
          </div>

          {/* Track Name & Artist */}
          <div className="flex-1 min-w-0 pr-1" onClick={() => setExpanded(true)}>
            <MarqueeText
              text={currentTrack.name}
              className="text-white text-xs font-bold truncate tracking-tight hover:underline cursor-pointer"
            />
            <p className="text-white/50 text-[11px] truncate mt-0.5">{artistName}</p>
          </div>

          {/* Playback Controls Cluster */}
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={togglePlay}
              className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-md cursor-pointer"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying && isBuffering ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
              ) : isPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              )}
            </button>

            <button
              onClick={playNext}
              className="p-1.5 text-white/70 hover:text-white transition-colors cursor-pointer"
              title="Berikutnya"
            >
              <SkipForward className="w-4 h-4 fill-current" />
            </button>

            <button
              onClick={() => setExpanded(true)}
              className="p-1.5 text-white/50 hover:text-white transition-colors cursor-pointer"
              title="Buka Pemutar Penuh"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={closeWidget}
              className="p-1 text-white/40 hover:text-white transition-colors rounded-full hover:bg-white/10 cursor-pointer"
              title="Tutup Widget"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Bottom Micro Progress Scrubber */}
        <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
          <div
            className="h-full bg-[#1DB954] transition-all duration-300"
            style={{ width: `${progressPercent}%`, backgroundColor: 'var(--accent-color, #1DB954)' }}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
});
