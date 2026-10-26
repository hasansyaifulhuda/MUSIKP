import { create } from 'zustand';

export interface ToastItem {
  id: string;
  message: string;
  type?: 'success' | 'info' | 'error';
  duration?: number;
}

interface ToastStore {
  toasts: ToastItem[];
  showToast: (message: string, type?: 'success' | 'info' | 'error', duration?: number) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  showToast: (message, type = 'info', duration = 2600) => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 6);
    set((state) => ({
      toasts: [...state.toasts.slice(-2), { id, message, type, duration }],
    }));

    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, duration);
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

export const toast = {
  success: (msg: string) => useToastStore.getState().showToast(msg, 'success'),
  info: (msg: string) => useToastStore.getState().showToast(msg, 'info'),
  error: (msg: string) => useToastStore.getState().showToast(msg, 'error'),
};
