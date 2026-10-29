'use client';

import React, { memo } from 'react';
import { SlidersHorizontal, Sparkles } from 'lucide-react';
import { useEqualizerStore, EQUALIZER_PRESETS } from '@/lib/audioEffects';
import { cn } from '@/lib/utils';

export interface AudioPresetDrawerProps {
  className?: string;
}

/**
 * Enterprise Audio Preset Quick Selector Drawer
 * Master Blueprint PMUSIC Architecture - Batch 3 (Poin 82)
 *
 * Guarantees:
 * 1. Rapid 1-click preset switching (Flat, Bass Boost, Vocal, Pop, Rock, Electronic, etc.).
 * 2. Visual indicator for currently active Web Audio API DSP preset.
 * 3. Shortcut button to open the granular 5-Band Equalizer Modal.
 */
export const AudioPresetDrawer = memo(function AudioPresetDrawer({ className }: AudioPresetDrawerProps) {
  const isEnabled = useEqualizerStore((state) => state.isEnabled);
  const activePreset = useEqualizerStore((state) => state.activePreset);
  const setPreset = useEqualizerStore((state) => state.setPreset);
  const openModal = useEqualizerStore((state) => state.openModal);

  const presetNames = Object.keys(EQUALIZER_PRESETS);

  return (
    <div className={cn('w-full py-2 px-1 flex items-center gap-2 overflow-x-auto no-scrollbar select-none', className)}>
      {/* Equalizer Modal Trigger Pill */}
      <button
        onClick={openModal}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold shrink-0 transition-colors cursor-pointer border border-white/10"
        title="Buka Equalizer Lengkap"
      >
        <SlidersHorizontal className="w-3.5 h-3.5 text-[#1DB954]" />
        <span>EQ</span>
      </button>

      {/* Preset Pills */}
      {presetNames.map((name) => {
        const isCurrent = isEnabled && activePreset === name;
        return (
          <button
            key={name}
            onClick={() => setPreset(name)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-all cursor-pointer whitespace-nowrap',
              isCurrent
                ? 'bg-[#1DB954] text-black font-bold shadow-md shadow-[#1DB954]/20 scale-[1.02]'
                : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-transparent'
            )}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
});
