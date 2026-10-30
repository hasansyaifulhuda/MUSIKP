'use client';

import { useState, useEffect } from 'react';
import { detectPlatform, applyPlatformScaling, PlatformInfo } from '@/lib/platform';

const DEFAULT_PLATFORM: PlatformInfo = {
  os: 'unknown',
  isWindows: false,
  isLinux: false,
  isDebian: false,
  isAndroid: false,
  isAndroidApk: false,
  isPWA: false,
  isMobile: false,
  scaleFactor: 1,
};

/**
 * React hook to access client platform information (Windows, Linux/Debian, Android APK, PWA).
 * Uses isMounted to ensure server-rendered markup and initial client hydration match 100%.
 */
export function usePlatform(): PlatformInfo & { isMounted: boolean } {
  const [isMounted, setIsMounted] = useState(false);
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo>(DEFAULT_PLATFORM);

  useEffect(() => {
    setIsMounted(true);
    const info = applyPlatformScaling();
    setPlatformInfo(info);
  }, []);

  return {
    ...platformInfo,
    isMounted,
  };
}
