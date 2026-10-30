'use client';

import { useState, useEffect } from 'react';
import { detectPlatform, applyPlatformScaling, PlatformInfo } from '@/lib/platform';

/**
 * React hook to access client platform information (Windows, Linux/Debian, Android APK, PWA).
 */
export function usePlatform(): PlatformInfo {
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo>(() => {
    if (typeof window !== 'undefined') {
      return applyPlatformScaling();
    }
    return detectPlatform();
  });

  useEffect(() => {
    const info = applyPlatformScaling();
    setPlatformInfo(info);
  }, []);

  return platformInfo;
}
