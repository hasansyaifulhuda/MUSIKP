'use client';

import React, { useState } from 'react';
import { useSleepTimerStore, formatRemainingTimer } from '@/lib/sleepTimerStore';
import { usePlayerStore } from '@/lib/store';
import { Moon, X, Clock, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SleepTimerModal() {
  const isModalOpen = useSleepTimerStore((state) => state.isModalOpen);
  const closeModal = useSleepTimerStore((state) => state.closeModal);
  const isActive = useSleepTimerStore((state) => state.isActive);
  const remainingSeconds = useSleepTimerStore((state) => state.remainingSeconds);
  const selectedMinutes = useSleepTimerStore((state) => state.selectedMinutes);
  const startTimer = useSleepTimerStore((state) => state.startTimer);
  const cancelTimer = useSleepTimerStore((state) => state.cancelTimer);

  const duration = usePlayerStore((state) => state.duration);
  const progress = usePlayerStore((state) => state.progress);

  const [customInput, setCustomInput] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  if (!isModalOpen) return null;

  const presets = [
    { label: '15 Menit', value: 15 },
    { label: '30 Menit', value: 30 },
    { label: '45 Menit', value: 45 },
    { label: '60 Menit (1 Jam)', value: 60 },
    { label: '90 Menit', value: 90 },
  ];

  // End of current track duration
  const trackRemainingSec = duration > 0 && progress < duration ? Math.ceil(duration - progress) : 0;
  const trackRemainingMins = Math.ceil(trackRemainingSec / 60);

  const handleStartCustom = () => {
    const mins = parseInt(customInput, 10);
    if (!isNaN(mins) && mins > 0 && mins <= 480) {
      startTimer(mins);
      setCustomInput('');
      setShowCustom(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pengatur Waktu Tidur"
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={closeModal}
    >
      <div
        className="relative w-full max-w-sm bg-[#181818] border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col text-white transform-gpu"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#1DB954]/20 flex items-center justify-center text-[#1DB954]">
              <Moon className="w-4 h-4 fill-current" />
            </div>
            <h3 className="text-lg font-bold tracking-tight">Pengatur Waktu Tidur</h3>
          </div>
          <button
            onClick={closeModal}
            className="p-1 text-white/60 hover:text-white rounded-full hover:bg-white/10 transition cursor-pointer"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Active Timer Indicator */}
        {isActive && (
          <div className="my-4 p-4 rounded-xl bg-[#1DB954]/10 border border-[#1DB954]/20 flex items-center justify-between">
            <div>
              <span className="text-xs text-[#1DB954] font-semibold uppercase tracking-wider block">
                Sedang Berjalan
              </span>
              <span className="text-2xl font-black tracking-tight text-white font-mono">
                {formatRemainingTimer(remainingSeconds)}
              </span>
            </div>
            <button
              onClick={cancelTimer}
              className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-bold rounded-lg transition cursor-pointer"
            >
              Matikan
            </button>
          </div>
        )}

        {/* Presets List */}
        <div className="flex flex-col gap-2 my-4 max-h-[260px] overflow-y-auto no-scrollbar">
          {trackRemainingMins > 0 && (
            <button
              onClick={() => startTimer(trackRemainingMins)}
              className={cn(
                'w-full text-left px-4 py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-between cursor-pointer border',
                isActive && selectedMinutes === trackRemainingMins
                  ? 'bg-[#1DB954] text-black border-[#1DB954]'
                  : 'bg-white/5 hover:bg-white/10 text-white/90 border-transparent'
              )}
            >
              <span>Sampai Lagu Ini Selesai ({trackRemainingMins}m)</span>
              {isActive && selectedMinutes === trackRemainingMins && <Check className="w-4 h-4 stroke-[3]" />}
            </button>
          )}

          {presets.map((preset) => {
            const isCurrent = isActive && selectedMinutes === preset.value;
            return (
              <button
                key={preset.value}
                onClick={() => startTimer(preset.value)}
                className={cn(
                  'w-full text-left px-4 py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-between cursor-pointer border',
                  isCurrent
                    ? 'bg-[#1DB954] text-black border-[#1DB954]'
                    : 'bg-white/5 hover:bg-white/10 text-white/90 border-transparent'
                )}
              >
                <span>{preset.label}</span>
                {isCurrent && <Check className="w-4 h-4 stroke-[3]" />}
              </button>
            );
          })}
        </div>

        {/* Custom Minutes Accordion / Input */}
        {showCustom ? (
          <div className="pt-2 border-t border-white/10 flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="480"
              placeholder="Menit (1-480)"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStartCustom()}
              autoFocus
              className="bg-white/10 text-white px-3 py-2 rounded-lg text-sm border border-white/10 focus:outline-none focus:border-[#1DB954] flex-1"
            />
            <button
              onClick={handleStartCustom}
              className="px-4 py-2 bg-[#1DB954] text-black font-bold text-sm rounded-lg hover:bg-[#1ed760] transition cursor-pointer"
            >
              Mulai
            </button>
            <button
              onClick={() => setShowCustom(false)}
              className="px-2.5 py-2 text-white/60 hover:text-white text-sm transition cursor-pointer"
            >
              Batal
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowCustom(true)}
            className="w-full py-2.5 text-center text-xs text-[#1DB954] hover:underline font-bold transition cursor-pointer"
          >
            Atur Waktu Kustom...
          </button>
        )}
      </div>
    </div>
  );
}
