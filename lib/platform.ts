/**
 * Client Platform & Environment Detection Utility
 * Detects Windows, Debian/Linux, Android, Capacitor APK, and PWA environments.
 * Normalizes visual scaling so that Windows browser displays render with identical
 * balanced proportions and typography as Linux/Debian without layout disruption.
 */

export type PlatformOS = 'windows' | 'linux' | 'debian' | 'android' | 'macos' | 'ios' | 'unknown';

export interface PlatformInfo {
  os: PlatformOS;
  isWindows: boolean;
  isLinux: boolean;
  isDebian: boolean;
  isAndroid: boolean;
  isAndroidApk: boolean;
  isPWA: boolean;
  isMobile: boolean;
  scaleFactor: number;
}

/**
 * Evaluates current client environment. Safe for SSR (returns safe defaults on server).
 */
export function detectPlatform(): PlatformInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
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
  }

  const ua = navigator.userAgent || '';
  const platform = (navigator as any).userAgentData?.platform || navigator.platform || '';

  // 1. Android & Native Capacitor APK Detection
  const isAndroid = /android/i.test(ua);
  const hasCapacitor = Boolean(
    (window as any).Capacitor?.isNativePlatform?.() ||
    (window as any).Capacitor?.getPlatform?.() === 'android'
  );
  const hasAndroidBridge = Boolean((window as any).AndroidMediaBridge);
  const isAndroidApk = isAndroid && (hasCapacitor || hasAndroidBridge);

  // 2. Windows Environment Detection
  const isWindows = /windows|win32|win64/i.test(ua) || /win/i.test(platform);

  // 3. Linux / Debian Detection (excluding Android)
  const isDebian = !isAndroid && (/debian|ubuntu/i.test(ua) || (/linux/i.test(ua) && /x11/i.test(ua)));
  const isLinux = !isAndroid && (/linux|x11/i.test(ua) || /linux/i.test(platform));

  // 4. Apple platforms
  const isIOS = /ipad|iphone|ipod/i.test(ua);
  const isMacOS = !isIOS && (/macintosh|mac os x/i.test(ua) || /mac/i.test(platform));

  // 5. PWA Standalone Detection
  const isPWA =
    Boolean(window.matchMedia?.('(display-mode: standalone)').matches) ||
    Boolean((navigator as any).standalone) ||
    document.referrer.includes('android-app://');

  // 6. Mobile Device Detection
  const isMobile = isAndroid || isIOS || /mobile|tablet|phone/i.test(ua);

  // Determine Primary OS key
  let os: PlatformOS = 'unknown';
  if (isAndroid) os = 'android';
  else if (isWindows) os = 'windows';
  else if (isDebian) os = 'debian';
  else if (isLinux) os = 'linux';
  else if (isMacOS) os = 'macos';
  else if (isIOS) os = 'ios';

  // Windows OS typically applies 125% or 150% display scaling on 1080p/1440p displays.
  // Calibrate scaleFactor dynamically so Windows renders with identical proportional balance as Debian Linux.
  let scaleFactor = 1;
  if (isWindows && !isMobile) {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    if (dpr >= 1.5) {
      scaleFactor = 0.82; // 150% Windows scaling -> normalized to 13.1px
    } else if (dpr >= 1.2) {
      scaleFactor = 0.875; // 125% Windows scaling -> normalized to 14.0px
    } else {
      scaleFactor = 0.91; // 100% Windows scaling -> normalized to 14.5px
    }
  }

  return {
    os,
    isWindows,
    isLinux,
    isDebian,
    isAndroid,
    isAndroidApk,
    isPWA,
    isMobile,
    scaleFactor,
  };
}

/**
 * Applies detected platform attributes and dynamic scaling variables directly to <html> root.
 * Call this immediately on client bootstrap to prevent any Layout Shift / FOUC.
 */
export function applyPlatformScaling(): PlatformInfo {
  const info = detectPlatform();
  if (typeof document === 'undefined') return info;

  const root = document.documentElement;

  // Set data attributes for CSS targeting
  root.setAttribute('data-platform', info.os);
  root.setAttribute('data-is-apk', String(info.isAndroidApk));
  root.setAttribute('data-is-pwa', String(info.isPWA));
  root.setAttribute('data-is-mobile', String(info.isMobile));
  root.setAttribute('data-is-windows-desktop', String(info.isWindows && !info.isMobile));

  // Expose CSS variable for components needing explicit pixel adjustments
  root.style.setProperty('--platform-scale', String(info.scaleFactor));

  // Dynamically normalize root font-size for Windows to prevent oversized "zoom banget" UI
  if (info.isWindows && !info.isMobile) {
    const targetPx = Math.round(16 * info.scaleFactor * 10) / 10;
    root.style.fontSize = `${targetPx}px`;
  } else if (info.isDebian || info.isLinux) {
    root.style.fontSize = '16px';
  }

  return info;
}
