import { db } from './db';

/**
 * Enterprise Singleton HTML5 Audio Engine & Immediate Playback Controller
 * 
 * Guarantees:
 * 1. Exactly ONE <audio> element exists across all lifecycles, HMR reloads, and route transitions.
 * 2. CrossOrigin 'anonymous' is set for Web Audio API / Equalizer analysis compatibility.
 * 3. Asynchronous play() promises are guarded against "interrupted by a new load request" AbortErrors.
 * 4. Eliminates duplicate playback, audio overlap, and micro-stutters during track transitions.
 * 5. Synchronous user-gesture execution compliant with mobile (iOS Safari / Android Chrome) autoplay policies.
 */

declare global {
  interface Window {
    __PMUSIC_AUDIO_SINGLETON__?: HTMLAudioElement;
    __PMUSIC_AUDIO_PLAY_PROMISE__?: Promise<void> | null;
  }
}

let memoryAudioInstance: HTMLAudioElement | null = null;

/**
 * Returns the global singleton HTMLAudioElement instance.
 * Idempotently checks window global, DOM, or instantiates exactly once.
 */
export function getPersistentAudioElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;

  // 1. Check window global singleton reference
  if (window.__PMUSIC_AUDIO_SINGLETON__) {
    return window.__PMUSIC_AUDIO_SINGLETON__;
  }

  // 2. Check local memory instance
  if (memoryAudioInstance) {
    window.__PMUSIC_AUDIO_SINGLETON__ = memoryAudioInstance;
    return memoryAudioInstance;
  }

  // 3. Check DOM for existing element (survives React unmounts & HMR)
  let el = (document.getElementById('pmusic-persistent-audio') ||
    document.getElementById('sann-persistent-audio')) as HTMLAudioElement | null;

  if (!el) {
    el = document.createElement('audio');
    el.id = 'pmusic-persistent-audio';
    el.preload = 'auto';
    el.setAttribute('playsinline', 'true');
    el.setAttribute('webkit-playsinline', 'true');
    el.crossOrigin = 'anonymous'; // Vital for Web Audio API / AudioContext without CORS taint

    // Offscreen, non-interfering styles (non-zero size prevents Chromium background media discard)
    el.style.position = 'fixed';
    el.style.bottom = '0';
    el.style.left = '0';
    el.style.width = '1px';
    el.style.height = '1px';
    el.style.opacity = '0.01';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '-9999';

    if (document.body) {
      document.body.appendChild(el);
    } else {
      // If DOM body is not yet ready, append on DOMContentLoaded
      window.addEventListener('DOMContentLoaded', () => {
        if (!document.getElementById('pmusic-persistent-audio')) {
          document.body.appendChild(el!);
        }
      }, { once: true });
    }
  }

  memoryAudioInstance = el;
  window.__PMUSIC_AUDIO_SINGLETON__ = el;
  return el;
}

/**
 * Safe audio play promise executor.
 * Intercepts and suppresses benign browser AbortError and NotAllowedError.
 */
export async function safePlayAudio(audio: HTMLAudioElement): Promise<boolean> {
  try {
    // If a play promise is already in flight, wait or reuse
    if (window.__PMUSIC_AUDIO_PLAY_PROMISE__) {
      try {
        await window.__PMUSIC_AUDIO_PLAY_PROMISE__;
      } catch {}
    }

    const promise = audio.play();
    if (promise !== undefined) {
      window.__PMUSIC_AUDIO_PLAY_PROMISE__ = promise;
      await promise;
      window.__PMUSIC_AUDIO_PLAY_PROMISE__ = null;
      return true;
    }
    return true;
  } catch (err: any) {
    window.__PMUSIC_AUDIO_PLAY_PROMISE__ = null;
    // Benign errors: AbortError (interrupted by load/pause) or NotAllowedError (autoplay blocked)
    if (err?.name === 'AbortError' || err?.name === 'NotAllowedError') {
      return false;
    }
    console.warn('[AudioSingleton] Safe play encountered error:', err);
    return false;
  }
}

/**
 * Safely pauses the singleton audio element without interrupting active play promises.
 */
export function pauseAudioSafely(audio?: HTMLAudioElement | null): void {
  const el = audio || getPersistentAudioElement();
  if (!el) return;

  try {
    if (window.__PMUSIC_AUDIO_PLAY_PROMISE__) {
      window.__PMUSIC_AUDIO_PLAY_PROMISE__
        .then(() => {
          el.pause();
        })
        .catch(() => {
          el.pause();
        });
    } else {
      el.pause();
    }
  } catch {}
}

/**
 * Checks whether audio is currently playing.
 */
export function isAudioPlaying(audio?: HTMLAudioElement | null): boolean {
  const el = audio || getPersistentAudioElement();
  if (!el) return false;
  return Boolean(!el.paused && !el.ended && el.currentTime > 0 && el.readyState > 2);
}

/**
 * Resets audio element state cleanly (stops playback and unloads stream buffer).
 */
export function resetAudioElement(audio?: HTMLAudioElement | null): void {
  const el = audio || getPersistentAudioElement();
  if (!el) return;

  try {
    pauseAudioSafely(el);
    el.removeAttribute('src');
    el.load();
  } catch {}
}

/**
 * Smoothly fades out audio volume to 0 over specified duration (in milliseconds).
 */
export async function safeFadeOut(
  audio?: HTMLAudioElement | null,
  durationMs: number = 600
): Promise<void> {
  const el = audio || getPersistentAudioElement();
  if (!el || el.paused || el.volume <= 0.05) return;

  const startVolume = el.volume;
  const steps = 12;
  const stepTime = Math.max(16, durationMs / steps);
  const volumeStep = startVolume / steps;

  return new Promise((resolve) => {
    let currentStep = 0;
    const interval = setInterval(() => {
      currentStep++;
      const nextVol = Math.max(0, startVolume - volumeStep * currentStep);
      try {
        el.volume = nextVol;
      } catch {}

      if (currentStep >= steps || nextVol <= 0.01) {
        clearInterval(interval);
        try {
          el.volume = 0;
        } catch {}
        resolve();
      }
    }, stepTime);
  });
}

/**
 * Smoothly fades in audio volume from 0 to target volume over specified duration.
 */
export async function safeFadeIn(
  audio?: HTMLAudioElement | null,
  targetVolume: number = 1.0,
  durationMs: number = 600
): Promise<void> {
  const el = audio || getPersistentAudioElement();
  if (!el || targetVolume <= 0) return;

  const boundedTarget = Math.max(0.01, Math.min(1.0, targetVolume));
  el.volume = 0;
  const steps = 12;
  const stepTime = Math.max(16, durationMs / steps);
  const volumeStep = boundedTarget / steps;

  return new Promise((resolve) => {
    let currentStep = 0;
    const interval = setInterval(() => {
      currentStep++;
      const nextVol = Math.min(boundedTarget, volumeStep * currentStep);
      try {
        el.volume = nextVol;
      } catch {}

      if (currentStep >= steps || nextVol >= boundedTarget - 0.01) {
        clearInterval(interval);
        try {
          el.volume = boundedTarget;
        } catch {}
        resolve();
      }
    }, stepTime);
  });
}

/**
 * Immediate, synchronous audio playback invocation.
 * Executed synchronously within physical user click/touch handlers
 * to guarantee browser Autoplay policy compliance across Chrome, Safari iOS, and Android.
 */
export function playTrackImmediately(targetVid: string, autoPlay: boolean = true): void {
  if (typeof window === 'undefined' || !targetVid) return;
  try {
    const audio = getPersistentAudioElement();
    if (!audio) return;

    // If device is offline or track is stored in IndexedDB, do NOT set network stream URL!
    // MusicContext's loadAndPlayTrack will resolve the local Blob from IndexedDB directly.
    if ((typeof navigator !== 'undefined' && !navigator.onLine) || db.isOfflineTrackSync(targetVid)) {
      return;
    }

    const streamUrl = `/api/stream?id=${encodeURIComponent(targetVid)}`;
    const isSameSrc = Boolean(audio.src && audio.src.includes(encodeURIComponent(targetVid)));

    if (!isSameSrc) {
      pauseAudioSafely(audio);
      audio.src = streamUrl;
      audio.currentTime = 0;
      audio.load();
    }

    if (autoPlay) {
      safePlayAudio(audio).catch(() => {});
    }
  } catch {}
}
