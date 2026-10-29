'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    deferredPrompt?: any;
  }
}

export function PWARegister() {
  useEffect(() => {
    // 1. In Development Mode: Proactively unregister any active Service Worker
    // This prevents stale webpack dev chunks, fast-refresh reload loops, and routing collisions
    if (process.env.NODE_ENV !== 'production') {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const reg of registrations) {
            reg.unregister().catch(() => {});
          }
        });
      }
      if (typeof window !== 'undefined' && 'caches' in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => {
            if (key.startsWith('pmusic-') || key.startsWith('musicfy-')) {
              caches.delete(key).catch(() => {});
            }
          });
        });
      }
      return;
    }

    // 2. In Production Mode: Purge legacy PMUSIC caches
    if (typeof window !== 'undefined' && 'caches' in window) {
      caches.keys().then((keys) => {
        keys.forEach((key) => {
          if (!key.startsWith('musicfy-')) {
            caches.delete(key).catch(() => {});
          }
        });
      });
    }

    // 3. Register production service worker cleanly
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch(() => {
          // Non-blocking fallback for restricted or unsupported Service Worker contexts
        });
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      window.deferredPrompt = e;
      window.dispatchEvent(new Event('pwa-prompt-available'));
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  return null;
}
