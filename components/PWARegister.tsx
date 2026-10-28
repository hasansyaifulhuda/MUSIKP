'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    deferredPrompt?: any;
  }
}

export function PWARegister() {
  useEffect(() => {
    // Purge outdated service worker caches from browser storage
    if (typeof window !== 'undefined' && 'caches' in window) {
      caches.keys().then((keys) => {
        keys.forEach((key) => {
          if (!key.includes('v7-ytdlp-stream')) {
            caches.delete(key).catch(() => {});
          }
        });
      });
    }

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const reg of registrations) {
          reg.update().catch(() => {});
        }
      });

      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          reg.update().catch(() => {});
        })
        .catch((err) => {
          console.error('Service Worker registration failed: ', err);
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
