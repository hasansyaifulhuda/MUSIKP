'use client';

import { memo, useEffect } from 'react';
import { usePlayerStore } from '@/lib/store';
import { FastAverageColor } from 'fast-average-color';
import { getHighResImage } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export const BackgroundProvider = memo(function BackgroundProvider() {
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const setDominantColor = usePlayerStore((state) => state.setDominantColor);
  const dominantColor = usePlayerStore((state) => state.dominantColor);

  // One-time cleanup on mount: reset root styles and purge obsolete theme/OLED storage
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.classList.remove('oled-theme');
      root.removeAttribute('data-oled');
      root.style.removeProperty('--accent-color');
      root.style.removeProperty('--accent-rgb');
      root.style.removeProperty('--accent-hover');
      root.style.removeProperty('--bg-primary');
      root.style.removeProperty('--bg-surface');
      root.style.removeProperty('--bg-card');
      root.style.removeProperty('--bg-elevated');
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.removeItem('pmusic_theme_accent_id_v1');
        localStorage.removeItem('pmusic_oled_mode_v1');
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (!currentTrack?.thumbnails?.length) {
      setDominantColor(null);
      return;
    }

    const fac = new FastAverageColor();
    const imageUrl = getHighResImage(currentTrack.thumbnails[currentTrack.thumbnails.length - 1].url, 400);

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imageUrl;

    img.onload = () => {
      try {
        const color = fac.getColor(img);
        setDominantColor(color.hex);
      } catch (e) {
        console.error('Failed to get average color', e);
        setDominantColor(null);
      }
    };

    img.onerror = () => {
      setDominantColor(null);
    };

    return () => {
      img.onload = null;
      img.onerror = null;
      img.src = '';
      fac.destroy();
    };
  }, [currentTrack?.videoId, currentTrack?.thumbnails, setDominantColor]);

  return (
    <div className="fixed inset-0 -z-50 bg-[#0A0A0A] overflow-hidden pointer-events-none transition-colors duration-500 gpu-accelerated contain-strict">
      <AnimatePresence>
        {dominantColor && (
          <motion.div
            key={dominantColor}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
            className="absolute inset-0 gpu-accelerated"
            style={{
              background: `radial-gradient(circle at 50% 0%, color-mix(in srgb, ${dominantColor} 40%, #0A0A0A) 0%, #0A0A0A 100%)`,
              willChange: 'opacity, transform',
              transform: 'translateZ(0)',
              backfaceVisibility: 'hidden',
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
});
