'use client';

import { useToastStore } from '@/lib/toast';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Info, AlertCircle } from 'lucide-react';

export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <div
      className="fixed bottom-20 md:bottom-28 left-1/2 -translate-x-1/2 z-[120] pointer-events-none flex flex-col items-center gap-2 max-w-[90vw] select-none"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="flex items-center gap-2.5 px-4 py-2.5 bg-[#282828] text-white border border-white/10 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.8)] backdrop-blur-md pointer-events-auto"
          >
            {t.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#1DB954] shrink-0 stroke-[2.5]" />
            ) : t.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 stroke-[2.5]" />
            ) : (
              <Info className="w-4 h-4 text-[#1DB954] shrink-0 stroke-[2.5]" />
            )}
            <span className="text-xs md:text-sm font-semibold tracking-tight whitespace-nowrap">
              {t.message}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
