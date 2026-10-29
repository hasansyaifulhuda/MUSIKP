'use client';

import React from 'react';
import {
  useEqualizerStore,
  EQUALIZER_PRESETS,
  EQ_LABELS,
  REVERB_PRESETS,
  ReverbPreset,
} from '@/lib/audioEffects';
import { SlidersHorizontal, X, RotateCcw, Volume2, Flame, Compass, Waves } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EqualizerModal() {
  const isModalOpen = useEqualizerStore((state) => state.isModalOpen);
  const closeModal = useEqualizerStore((state) => state.closeModal);
  const isEnabled = useEqualizerStore((state) => state.isEnabled);
  const toggleEnabled = useEqualizerStore((state) => state.toggleEnabled);
  const activePreset = useEqualizerStore((state) => state.activePreset);
  const setPreset = useEqualizerStore((state) => state.setPreset);
  const bands = useEqualizerStore((state) => state.bands);
  const setBandGain = useEqualizerStore((state) => state.setBandGain);
  const bassBoost = useEqualizerStore((state) => state.bassBoost);
  const setBassBoost = useEqualizerStore((state) => state.setBassBoost);
  const isSpatialSurround = useEqualizerStore((state) => state.isSpatialSurround);
  const toggleSpatialSurround = useEqualizerStore((state) => state.toggleSpatialSurround);
  const reverbPreset = useEqualizerStore((state) => state.reverbPreset);
  const setReverbPreset = useEqualizerStore((state) => state.setReverbPreset);
  const resetToFlat = useEqualizerStore((state) => state.resetToFlat);

  if (!isModalOpen) return null;

  const presetList = Object.keys(EQUALIZER_PRESETS);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Equalizer Suara"
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={closeModal}
    >
      <div
        className="relative w-full max-w-lg bg-[#181818] border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col text-white max-h-[90vh] overflow-y-auto no-scrollbar transform-gpu"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#1DB954]/20 flex items-center justify-center text-[#1DB954]">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight">Equalizer Suara</h3>
              <p className="text-xs text-white/50">Sesuaikan frekuensi audio dan bass Web Audio API</p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="p-1.5 text-white/60 hover:text-white rounded-full hover:bg-white/10 transition cursor-pointer"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Master Switch & Reset */}
        <div className="flex items-center justify-between my-4 p-3 bg-white/5 rounded-xl border border-white/5">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleEnabled}
              className={cn(
                'relative w-12 h-6 rounded-full transition-colors cursor-pointer',
                isEnabled ? 'bg-[#1DB954]' : 'bg-white/20'
              )}
              aria-label="Toggle Equalizer"
            >
              <div
                className={cn(
                  'w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5',
                  isEnabled ? 'left-6.5' : 'left-0.5'
                )}
              />
            </button>
            <span className="text-sm font-semibold">
              {isEnabled ? 'Equalizer Aktif' : 'Equalizer Nonaktif'}
            </span>
          </div>

          <button
            onClick={resetToFlat}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition cursor-pointer font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Flat</span>
          </button>
        </div>

        {/* Presets Horizontal Pills */}
        <div className="mb-5">
          <div className="text-xs font-bold text-white/60 uppercase tracking-wider mb-2">Preset Pilihan</div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {presetList.map((presetName) => {
              const isSelected = activePreset === presetName;
              return (
                <button
                  key={presetName}
                  onClick={() => setPreset(presetName)}
                  disabled={!isEnabled}
                  className={cn(
                    'px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border',
                    isSelected && isEnabled
                      ? 'bg-[#1DB954] text-black border-[#1DB954] shadow-md shadow-[#1DB954]/20'
                      : 'bg-white/5 hover:bg-white/10 text-white/80 border-transparent disabled:opacity-40 disabled:cursor-not-allowed'
                  )}
                >
                  {presetName}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bass Boost Special Slider */}
        <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-[#1DB954]/10 to-transparent border border-[#1DB954]/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-[#1DB954]" />
              <span className="text-sm font-bold text-white">Bass Boost</span>
            </div>
            <span className="text-xs font-mono font-bold text-[#1DB954] bg-[#1DB954]/20 px-2 py-0.5 rounded-full">
              +{bassBoost} dB
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="10"
            step="1"
            value={bassBoost}
            disabled={!isEnabled}
            onChange={(e) => setBassBoost(Number(e.target.value))}
            className="w-full h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer accent-[#1DB954] disabled:opacity-40"
          />
        </div>

        {/* Spatial / 3D Audio & Reverb DSP Filters (Batch 3 - Poin 73) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {/* Spatial 3D Surround */}
          <div className="p-3.5 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#1DB954]/20 text-[#1DB954] flex items-center justify-center">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-white block">Spatial 3D Surround</span>
                <span className="text-[10px] text-white/50">Efek panggung virtual</span>
              </div>
            </div>

            <button
              onClick={toggleSpatialSurround}
              disabled={!isEnabled}
              className={cn(
                'relative w-11 h-5 rounded-full transition-colors cursor-pointer shrink-0 disabled:opacity-40',
                isSpatialSurround && isEnabled ? 'bg-[#1DB954]' : 'bg-white/20'
              )}
              aria-label="Toggle Spatial Audio"
            >
              <div
                className={cn(
                  'w-4 h-4 rounded-full bg-white transition-transform absolute top-0.5',
                  isSpatialSurround && isEnabled ? 'left-6' : 'left-0.5'
                )}
              />
            </button>
          </div>

          {/* Reverb DSP Mode */}
          <div className="p-3 bg-white/5 rounded-xl border border-white/5 flex flex-col justify-between gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Waves className="w-3.5 h-3.5 text-[#1DB954]" />
                <span className="text-xs font-bold text-white">Reverb DSP</span>
              </div>
              <span className="text-[10px] font-mono text-[#1DB954] font-semibold">
                {REVERB_PRESETS[reverbPreset]?.name}
              </span>
            </div>

            <div className="flex gap-1 overflow-x-auto no-scrollbar pt-1">
              {(Object.keys(REVERB_PRESETS) as ReverbPreset[]).map((presetKey) => {
                const isSelected = reverbPreset === presetKey;
                return (
                  <button
                    key={presetKey}
                    onClick={() => setReverbPreset(presetKey)}
                    disabled={!isEnabled}
                    className={cn(
                      'px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all cursor-pointer shrink-0 disabled:opacity-40 border',
                      isSelected && isEnabled
                        ? 'bg-[#1DB954] text-black border-[#1DB954]'
                        : 'bg-white/5 text-white/60 border-white/5 hover:text-white'
                    )}
                  >
                    {REVERB_PRESETS[presetKey].name.split(' ')[0]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 5-Band Vertical Frequency Sliders */}
        <div className="mb-4">
          <div className="text-xs font-bold text-white/60 uppercase tracking-wider mb-3 text-center">
            Frekuensi Audio (5-Band)
          </div>

          <div className="grid grid-cols-5 gap-2 p-4 bg-white/5 rounded-xl border border-white/5">
            {EQ_LABELS.map((label, idx) => {
              const gain = bands[idx] ?? 0;
              return (
                <div key={label} className="flex flex-col items-center">
                  {/* Current Gain Value */}
                  <span className="text-[11px] font-mono text-white/80 font-bold mb-2">
                    {gain > 0 ? `+${gain}` : gain}
                    <span className="text-[9px] text-white/40">dB</span>
                  </span>

                  {/* Vertical Slider Wrapper */}
                  <div className="relative h-36 flex items-center justify-center my-1">
                    {/* Zero center indicator line */}
                    <div className="absolute w-5 h-0.5 bg-white/20 top-1/2 -translate-y-1/2 pointer-events-none" />

                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="1"
                      value={gain}
                      disabled={!isEnabled}
                      onChange={(e) => setBandGain(idx, Number(e.target.value))}
                      style={{
                        writingMode: 'vertical-lr',
                        direction: 'rtl',
                        WebkitAppearance: 'slider-vertical',
                      }}
                      className="h-32 w-4 bg-transparent cursor-pointer accent-[#1DB954] disabled:opacity-40"
                      aria-label={`Gain untuk ${label}`}
                    />
                  </div>

                  {/* Frequency Label */}
                  <span className="text-[11px] font-semibold text-white/60 mt-2 truncate max-w-full">
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Helper footnote */}
        <div className="text-[11px] text-white/40 text-center">
          Efek Web Audio API terhubung langsung ke pemutar audio tanpa mempengaruhi performa streaming.
        </div>
      </div>
    </div>
  );
}
