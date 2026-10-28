'use client';

import { useState, useEffect } from 'react';

/**
 * Senior-Architect Reactive Hook for Online/Offline state detection.
 * 1. Initial state is ALWAYS true (guarantees normal online UI on initial load/SSR).
 * 2. Only switches to false when browser strictly reports navigator.onLine === false.
 * 3. Accurately updates via 'online' and 'offline' window events with proper cleanup.
 */
export function useOnlineStatus(): boolean {
  // Initial state MUST strictly default to true so users never get trapped in offline mode
  const [isOnline, setIsOnline] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Strict offline check on client mount: only false if navigator.onLine is explicitly false
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setIsOnline(false);
    } else {
      setIsOnline(true);
    }

    const handleOnline = () => {
      setIsOnline(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
