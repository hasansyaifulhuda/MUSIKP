'use client';

import { useState, useEffect, useRef } from 'react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { WifiOff, Wifi } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ToastData {
  id: number;
  type: 'offline' | 'online';
  message: string;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const [toast, setToast] = useState<ToastData | null>(null);
  const prevOnlineRef = useRef<boolean | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // 1. Initial mount check
    if (prevOnlineRef.current === null) {
      prevOnlineRef.current = isOnline;
      // If initial state on mount is offline, notify user briefly for 3.5s
      if (!isOnline) {
        if (timerRef.current) clearTimeout(timerRef.current);
        setToast({
          id: Date.now(),
          type: 'offline',
          message: 'Tidak ada koneksi internet',
        });
        timerRef.current = setTimeout(() => {
          setToast(null);
        }, 3500);
      }
      return;
    }

    // 2. Network state transitions
    if (prevOnlineRef.current !== isOnline) {
      if (timerRef.current) clearTimeout(timerRef.current);

      if (!isOnline) {
        setToast({
          id: Date.now(),
          type: 'offline',
          message: 'Tidak ada koneksi internet',
        });
      } else {
        setToast({
          id: Date.now(),
          type: 'online',
          message: 'Kembali online',
        });
      }

      timerRef.current = setTimeout(() => {
        setToast(null);
      }, 3500);

      prevOnlineRef.current = isOnline;
    }
  }, [isOnline]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <AnimatePresence>
      {toast && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed top-5 left-1/2 -translate-x-1/2 z-[250] pointer-events-none select-none max-w-[90vw]"
        >
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.95 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className={`flex items-center gap-2.5 px-4 py-2 rounded-full border shadow-2xl backdrop-blur-md ${
              toast.type === 'offline'
                ? 'bg-[#181818]/95 border-amber-500/25 text-white shadow-black/60'
                : 'bg-[#181818]/95 border-[#1DB954]/30 text-white shadow-black/60'
            }`}
          >
            {toast.type === 'offline' ? (
              <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0 stroke-[2.2]" />
            ) : (
              <Wifi className="w-3.5 h-3.5 text-[#1DB954] shrink-0 stroke-[2.2]" />
            )}
            <span className="text-xs font-medium tracking-tight text-white/90 whitespace-nowrap">
              {toast.message}
            </span>
            {toast.type === 'offline' ? (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400/80 animate-pulse" />
            ) : (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#1DB954]" />
            )}
          </motion.div>
        </aside>
      )}
    </AnimatePresence>
  );
}
