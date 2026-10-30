'use client';

import { useState, useEffect } from 'react';
import { applyPlatformScaling } from '@/lib/platform';

/**
 * Client-Side Platform & Scaling Bootstrapper
 * Uses an isMounted flag (true strictly after initial client hydration in useEffect)
 * to ensure that platform detection (Windows, Debian/Linux, Android APK)
 * and root attributes (data-platform, data-is-apk, etc.)
 * are applied only in the browser, eliminating Next.js SSR hydration mismatches.
 */
export function PlatformBootstrapper() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    // Defer attribute mutation to ensure React hydration has settled
    const rafId = requestAnimationFrame(() => {
      applyPlatformScaling();
    });

    const handleResize = () => {
      applyPlatformScaling();
    };
    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  if (!isMounted) {
    return null;
  }

  return null;
}
