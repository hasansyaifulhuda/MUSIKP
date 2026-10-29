import { create } from 'zustand';
import { toast } from '@/lib/toast';
import { pauseAudioSafely } from './audioElement';
import { usePlayerStore } from './store';

export interface SleepTimerState {
  isActive: boolean;
  selectedMinutes: number | null;
  targetTimestamp: number | null;
  remainingSeconds: number;
  isModalOpen: boolean;

  openModal: () => void;
  closeModal: () => void;
  startTimer: (minutes: number) => void;
  cancelTimer: () => void;
  tick: () => void;
}

let intervalTimer: NodeJS.Timeout | null = null;

export const useSleepTimerStore = create<SleepTimerState>((set, get) => ({
  isActive: false,
  selectedMinutes: null,
  targetTimestamp: null,
  remainingSeconds: 0,
  isModalOpen: false,

  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),

  startTimer: (minutes: number) => {
    if (minutes <= 0) return;

    if (intervalTimer) {
      clearInterval(intervalTimer);
      intervalTimer = null;
    }

    const now = Date.now();
    const targetTimestamp = now + minutes * 60 * 1000;
    const remainingSeconds = minutes * 60;

    set({
      isActive: true,
      selectedMinutes: minutes,
      targetTimestamp,
      remainingSeconds,
      isModalOpen: false,
    });

    toast.success(`Pengatur waktu tidur diatur untuk ${minutes} menit`);

    intervalTimer = setInterval(() => {
      get().tick();
    }, 1000);
  },

  cancelTimer: () => {
    if (intervalTimer) {
      clearInterval(intervalTimer);
      intervalTimer = null;
    }

    const wasActive = get().isActive;

    set({
      isActive: false,
      selectedMinutes: null,
      targetTimestamp: null,
      remainingSeconds: 0,
    });

    if (wasActive) {
      toast.info('Pengatur waktu tidur dinonaktifkan');
    }
  },

  tick: () => {
    const { isActive, targetTimestamp } = get();
    if (!isActive || !targetTimestamp) {
      if (intervalTimer) {
        clearInterval(intervalTimer);
        intervalTimer = null;
      }
      return;
    }

    const now = Date.now();
    const remainingMs = targetTimestamp - now;

    if (remainingMs <= 0) {
      // Time is up! Stop playback cleanly and notify user
      if (intervalTimer) {
        clearInterval(intervalTimer);
        intervalTimer = null;
      }

      set({
        isActive: false,
        selectedMinutes: null,
        targetTimestamp: null,
        remainingSeconds: 0,
      });

      try {
        pauseAudioSafely();
        usePlayerStore.getState().setPlaying(false);
      } catch {}

      toast.info('Pengatur waktu tidur selesai: Pemutaran musik dihentikan');
    } else {
      set({
        remainingSeconds: Math.ceil(remainingMs / 1000),
      });
    }
  },
}));

/**
 * Format remaining seconds into clean MM:SS or HH:MM:SS string
 */
export function formatRemainingTimer(seconds: number): string {
  if (seconds <= 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}
