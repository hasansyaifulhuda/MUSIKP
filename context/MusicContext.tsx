'use client';

import React, {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useState,
  useEffect,
  useRef,
} from 'react';
import { usePlayerStore, Track, extractVideoId } from '@/lib/store';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { db, OfflineTrack } from '@/lib/db';
import { toast } from '@/lib/toast';
import { getHighResImage } from '@/lib/utils';

import { getPersistentAudioElement, safePlayAudio, pauseAudioSafely, resetAudioElement, safeFadeOut, safeFadeIn } from '@/lib/audioElement';
import { blobManager } from '@/lib/blobManager';
import { debouncedLocalStorageSet, debouncedLocalStorageGet } from '@/lib/debouncedStorage';
import { initAudioEffects, resumeAudioContextSafely } from '@/lib/audioEffects';
import { useCrossfadeStore } from '@/lib/crossfadeStore';
import { useAudioQualityStore } from '@/lib/audioQualityStore';
import { deduplicatedFetch } from '@/lib/clientDeduplication';
import { useDevModalStore } from '@/lib/devModalStore';

declare global {
  interface Window {
    AndroidMediaBridge?: {
      updateMetadata: (title: string, artist: string, album: string, artworkUrl: string, durationMs: number) => void;
      updatePlaybackState: (state: string, positionMs: number, durationMs: number) => void;
      destroySession: () => void;
    };
    __handleAndroidMediaAction?: (action: string, arg?: any) => void;
  }
}

export interface MusicContextType {
  currentTrack: Track | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  queue: Track[];
  queueIndex: number;
  repeatMode: 'off' | 'all' | 'one';
  isShuffle: boolean;
  dominantColor: string | null;
  isOnline: boolean;

  // Persistent Liked Songs
  likedSongs: Track[];
  isLiked: (videoId: string) => boolean;
  toggleLike: (track: Track) => Promise<boolean>;

  // Actions
  playTrack: (track: any, queue?: any[], context?: 'playlist' | 'similar', forceIndex?: number) => void;
  playQueueIndex: (index: number) => void;
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;
  playNext: () => Promise<void>;
  playPrev: () => void;
  seekTo: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  addToQueue: (track: any) => void;
  insertNextInQueue: (track: any) => void;
  moveQueueItem: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
}

const MusicContext = createContext<MusicContextType | null>(null);

const LIKED_STORAGE_KEY = 'pmusic_liked_tracks';
const AUDIO_SESSION_STORAGE_KEY = 'pmusic_audio_session_v1';

/**
 * Ensures artwork URLs are fully qualified HTTPS URLs so Android NotificationManager
 * and lock screen controllers can load and display notification artwork without failures.
 */
function toAbsoluteArtworkUrl(url: string | undefined, size = 512): string {
  if (!url) return `https://picsum.photos/seed/music/${size}/${size}`;
  const hires = getHighResImage(url, size);
  if (hires.startsWith('//')) {
    return `https:${hires}`;
  }
  if (hires.startsWith('http://') || hires.startsWith('https://')) {
    return hires;
  }
  if (typeof window !== 'undefined') {
    try {
      return new URL(hires, window.location.origin).href;
    } catch {
      return hires;
    }
  }
  return hires;
}

export function MusicProvider({ children }: { children: React.ReactNode }) {
  // Store subscriptions
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const duration = usePlayerStore((state) => state.duration);
  const volume = usePlayerStore((state) => state.volume);
  const queue = usePlayerStore((state) => state.queue);
  const queueIndex = usePlayerStore((state) => state.queueIndex);
  const repeatMode = usePlayerStore((state) => state.repeatMode);
  const isShuffle = usePlayerStore((state) => state.isShuffle);
  const dominantColor = usePlayerStore((state) => state.dominantColor);

  // Network Online/Offline reactive status
  const isOnline = useOnlineStatus();

  // Store actions
  const playTrackStore = usePlayerStore((state) => state.playTrack);
  const setPlayingStore = usePlayerStore((state) => state.setPlaying);
  const setIsBuffering = usePlayerStore((state) => state.setIsBuffering);
  const playNextStore = usePlayerStore((state) => state.playNext);
  const playPrevStore = usePlayerStore((state) => state.playPrev);
  const playQueueIndexStore = usePlayerStore((state) => state.playQueueIndex);
  const setProgress = usePlayerStore((state) => state.setProgress);
  const setDuration = usePlayerStore((state) => state.setDuration);
  const setVolumeStore = usePlayerStore((state) => state.setVolume);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const toggleRepeat = usePlayerStore((state) => state.toggleRepeat);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const insertNextInQueue = usePlayerStore((state) => state.insertNextInQueue);
  const moveQueueItem = usePlayerStore((state) => state.moveQueueItem);
  const clearQueue = usePlayerStore((state) => state.clearQueue);

  // Network state change handler: prevent hanging spinners or orphaned buffers
  useEffect(() => {
    const handleOnline = () => {
      setIsBuffering(false);
    };

    const handleOffline = () => {
      // If currently buffering an online network stream when connection drops,
      // release loading spinner immediately so UI never hangs!
      const audio = getPersistentAudioElement();
      if (audio && !audio.src.startsWith('blob:')) {
        setIsBuffering(false);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setIsBuffering]);

  // Local State & Audio Control Refs
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const isMutedRef = useRef<boolean>(isMuted);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);
  const isSeekingLockRef = useRef<boolean>(false);
  const seekLockTimerRef = useRef<NodeJS.Timeout | null>(null);
  const loadedTrackIdRef = useRef<string | null>(null);
  const lastProgressRef = useRef<number>(-1);
  const lastMediaSessionUpdateRef = useRef<number>(0);
  const activeBlobUrlRef = useRef<string | null>(null);
  const playNextRef = useRef<() => void>(() => {});
  const wakeLockRef = useRef<any>(null);

  // Poin 63: Background Audio Session Recovery refs
  const pendingResumePositionRef = useRef<number | null>(null);
  const isSessionRestoredRef = useRef<boolean>(false);

  // Poin 51: Predictive Smart Cache Preloading ref
  const preloadedNextTrackIdRef = useRef<string | null>(null);

  // User gesture & playback failure safeguards
  const hasUserGestureRef = useRef<boolean>(false);
  const retryCountPerTrackRef = useRef<Map<string, number>>(new Map());
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastErrorTimestampRef = useRef<number>(0);

  // Poin 51: Predictive Smart Cache Preloading callback
  const preloadNextTrackSafely = useCallback(async (nextVid: string, nextTrack: Track) => {
    try {
      if (db.isOfflineTrackSync(nextVid)) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;

      const streamUrl = useAudioQualityStore.getState().getStreamUrl(nextVid);
      if (streamUrl && typeof window !== 'undefined') {
        fetch(streamUrl, {
          headers: { Range: 'bytes=0-131071' },
          priority: 'low' as any,
        }).catch(() => {});
      }

      const cachedLyrics = await db.getMetadataCache(`lyrics:${nextVid}`);
      if (!cachedLyrics) {
        let artist = '';
        if (typeof (nextTrack as any).artistName === 'string') {
          artist = (nextTrack as any).artistName;
        } else if (typeof nextTrack.artist === 'string') {
          artist = nextTrack.artist;
        } else if (Array.isArray(nextTrack.artist)) {
          artist = nextTrack.artist.map((a: any) => (typeof a === 'string' ? a : a?.name || '')).filter(Boolean).join(' ');
        } else if (nextTrack.artist && typeof nextTrack.artist === 'object') {
          artist = (nextTrack.artist as any).name || '';
        }
        const dur = Math.round(nextTrack.duration || 200);
        const url = `/api/lyrics?id=${encodeURIComponent(nextVid)}&title=${encodeURIComponent(
          nextTrack.name || ''
        )}&artist=${encodeURIComponent(artist)}&duration=${dur}`;
        deduplicatedFetch(url).catch(() => {});
      }
    } catch {}
  }, []);

  // Safely register physical user gesture (click/touch/key) to allow AudioContext creation
  useEffect(() => {
    const markUserInteraction = () => {
      hasUserGestureRef.current = true;
    };
    window.addEventListener('pointerdown', markUserInteraction, { capture: true, passive: true });
    window.addEventListener('keydown', markUserInteraction, { capture: true, passive: true });
    window.addEventListener('touchstart', markUserInteraction, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', markUserInteraction, { capture: true });
      window.removeEventListener('keydown', markUserInteraction, { capture: true });
      window.removeEventListener('touchstart', markUserInteraction, { capture: true });
    };
  }, []);

  // Revoke previous object URLs via centralized Blob URL registry to prevent memory leaks
  const cleanupActiveBlobUrl = useCallback(() => {
    if (activeBlobUrlRef.current) {
      blobManager.revoke(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
  }, []);

  // Component unmount & resource cleanup (prevents memory leak & OOM crashes on mobile)
  useEffect(() => {
    return () => {
      cleanupActiveBlobUrl();
      blobManager.revokeAll();
      if (seekLockTimerRef.current) {
        clearTimeout(seekLockTimerRef.current);
        seekLockTimerRef.current = null;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (wakeLockRef.current) {
        try {
          wakeLockRef.current.release();
        } catch {}
        wakeLockRef.current = null;
      }
    };
  }, [cleanupActiveBlobUrl]);

  // Update MediaSession Position State (Throttled for high performance & lockscreen scrubber)
  const updateMediaSessionPosition = useCallback((curTime: number, totalDur?: number) => {
    const dur = totalDur || usePlayerStore.getState().duration || 0;
    if (
      typeof navigator !== 'undefined' &&
      'mediaSession' in navigator &&
      'setPositionState' in navigator.mediaSession
    ) {
      if (
        dur > 0 &&
        isFinite(dur) &&
        !isNaN(dur) &&
        typeof curTime === 'number' &&
        !isNaN(curTime) &&
        isFinite(curTime) &&
        curTime >= 0
      ) {
        try {
          navigator.mediaSession.setPositionState({
            duration: dur,
            playbackRate: 1,
            position: Math.min(dur, Math.max(0, curTime)),
          });
        } catch {}
      }
    }

    // Synchronize lockscreen/notification scrubber in Android APK
    if (typeof window !== 'undefined' && window.AndroidMediaBridge) {
      try {
        const isCurrentPlaying = usePlayerStore.getState().isPlaying;
        window.AndroidMediaBridge.updatePlaybackState(
          isCurrentPlaying ? 'playing' : 'paused',
          Math.round(Math.max(0, curTime) * 1000),
          Math.round(Math.max(0, dur) * 1000)
        );
      } catch {}
    }
  }, []);

  // Poin 63: Background Audio Session Recovery (PWA State Restoration)
  // Restores last playback position, queue, and player state after browser reload or unexpected PWA termination
  useEffect(() => {
    if (isSessionRestoredRef.current) return;
    isSessionRestoredRef.current = true;

    try {
      const raw = debouncedLocalStorageGet(AUDIO_SESSION_STORAGE_KEY) || localStorage.getItem(AUDIO_SESSION_STORAGE_KEY);
      if (!raw) return;
      const session = JSON.parse(raw);
      if (!session || !session.videoId) return;

      // Only restore if saved within reasonable time (14 days)
      if (session.savedAt && Date.now() - session.savedAt > 14 * 24 * 60 * 60 * 1000) return;

      const current = usePlayerStore.getState().currentTrack;
      if (!current && session.track) {
        usePlayerStore.setState({
          currentTrack: session.track,
          queue: session.queue?.length ? session.queue : [session.track],
          queueIndex: session.queueIndex ?? 0,
          isPlaying: false,
        });
      }

      if (session.position && session.position > 1) {
        pendingResumePositionRef.current = session.position;
        setProgress(session.position);
        if (session.duration) {
          setDuration(session.duration);
        }
        updateMediaSessionPosition(session.position, session.duration);
      }
    } catch (err) {
      console.warn('[SessionRecovery] Error restoring audio session state:', err);
    }
  }, [setProgress, setDuration, updateMediaSessionPosition]);

  // Synchronous session backup immediately on PWA close / tab switch / page unload / freeze
  useEffect(() => {
    const handleSaveSession = () => {
      try {
        const audio = getPersistentAudioElement();
        const curr = usePlayerStore.getState().currentTrack;
        if (curr?.videoId && audio) {
          const snapshot = {
            videoId: curr.videoId,
            track: curr,
            queue: usePlayerStore.getState().queue,
            queueIndex: usePlayerStore.getState().queueIndex,
            position: Math.floor(audio.currentTime || 0),
            duration: Math.floor(audio.duration || 0),
            volume: usePlayerStore.getState().volume,
            savedAt: Date.now(),
          };
          localStorage.setItem(AUDIO_SESSION_STORAGE_KEY, JSON.stringify(snapshot));
        }
      } catch {}
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        handleSaveSession();
      }
    };

    window.addEventListener('pagehide', handleSaveSession);
    window.addEventListener('beforeunload', handleSaveSession);
    window.addEventListener('freeze', handleSaveSession);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', handleSaveSession);
      window.removeEventListener('beforeunload', handleSaveSession);
      window.removeEventListener('freeze', handleSaveSession);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Hardware Audio Focus Keep-Alive (prevents mobile background audio ducking / suspension)
  // SAFE: Reuses the audioEffects singleton AudioContext and complies with mobile autoplay policies
  const initAudioContextKeepAlive = useCallback(() => {
    if (typeof window === 'undefined') return;

    // Physical user gesture safeguard: Never instantiate AudioContext without user interaction
    const isUserActive =
      hasUserGestureRef.current ||
      (typeof navigator !== 'undefined' && Boolean((navigator as any).userActivation?.hasBeenActive));

    if (!isUserActive) {
      return;
    }

    try {
      initAudioEffects();
      resumeAudioContextSafely();
    } catch {}
  }, []);

  // Declare W3C AudioSession 'playback' mode for mobile media focus (iOS & modern Android)
  // Also request Persistent Storage and populate in-memory offline cache
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
      try {
        (navigator as any).audioSession.type = 'playback';
      } catch {}
    }

    // Proactively initialize offline cache and request persistent storage
    db.initOfflineCache().catch(() => {});
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then((granted) => {
        if (granted) {
          console.log('Storage will not be cleared except by explicit user action');
        }
      }).catch(() => {});
    }
  }, []);

  // =========================================================================
  // Native HTML5 Audio Engine & Hardware Event Listeners
  // Native events (timeupdate, ended, playing) bypass browser background timer throttling
  // =========================================================================
  useEffect(() => {
    const audio = getPersistentAudioElement();
    if (!audio) return;

    // Apply initial volume & muted state safely
    const initialVolume = usePlayerStore.getState().volume ?? 100;
    audio.volume = Math.max(0, Math.min(1, initialVolume / 100));
    audio.muted = isMutedRef.current;

    const handleTimeUpdate = () => {
      if (!isSeekingLockRef.current) {
        const cur = audio.currentTime;
        if (Math.abs(cur - lastProgressRef.current) >= 0.25 || lastProgressRef.current < 0) {
          lastProgressRef.current = cur;
          setProgress(cur);
        }
        const now = Date.now();
        if (now - lastMediaSessionUpdateRef.current >= 1200) {
          lastMediaSessionUpdateRef.current = now;
          updateMediaSessionPosition(cur, audio.duration);

          // Debounced state persistence for song playback position & full audio session (Poin 63)
          const curr = usePlayerStore.getState().currentTrack;
          if (curr?.videoId && cur > 1) {
            const sessionData = {
              videoId: curr.videoId,
              track: curr,
              queue: usePlayerStore.getState().queue,
              queueIndex: usePlayerStore.getState().queueIndex,
              position: Math.floor(cur),
              duration: Math.floor(audio.duration || 0),
              volume: usePlayerStore.getState().volume,
              savedAt: now,
            };
            debouncedLocalStorageSet(AUDIO_SESSION_STORAGE_KEY, JSON.stringify(sessionData));
            debouncedLocalStorageSet(
              'pmusic_playback_resume',
              JSON.stringify({
                videoId: curr.videoId,
                position: Math.floor(cur),
                duration: Math.floor(audio.duration || 0),
                savedAt: now,
              })
            );
          }
        }

        // Crossfade smooth volume fade-out when reaching track end
        const crossfadeSec = useCrossfadeStore.getState().crossfadeDuration;
        if (
          crossfadeSec > 0 &&
          audio.duration > 15 &&
          audio.duration - cur <= crossfadeSec &&
          audio.duration - cur > 0 &&
          !audio.paused
        ) {
          const ratio = Math.max(0, (audio.duration - cur) / crossfadeSec);
          const targetVol = Math.max(0, Math.min(1, (usePlayerStore.getState().volume ?? 100) / 100));
          audio.volume = targetVol * ratio;
        }

        // Poin 51: Predictive Smart Cache Preloading (Gapless Next Track Buffer)
        // When current track has <= 18s remaining (and > 8s played), proactively buffer next track
        if (audio.duration > 25 && audio.duration - cur <= 18 && cur > 8) {
          const state = usePlayerStore.getState();
          const q = state.queue;
          const idx = state.queueIndex;
          if (Array.isArray(q) && q.length > 0) {
            const nextIdx = idx + 1 < q.length ? idx + 1 : state.repeatMode === 'all' ? 0 : -1;
            if (nextIdx !== -1 && q[nextIdx]) {
              const nextTrack = q[nextIdx];
              const nextVid = extractVideoId(nextTrack);
              if (nextVid && preloadedNextTrackIdRef.current !== nextVid) {
                preloadedNextTrackIdRef.current = nextVid;
                preloadNextTrackSafely(nextVid, nextTrack);
              }
            }
          }
        }
      }
    };

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
        updateMediaSessionPosition(audio.currentTime, audio.duration);
      }
    };

    const handleDurationChange = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
        updateMediaSessionPosition(audio.currentTime, audio.duration);
      }
    };

    const handlePlay = () => {
      setPlayingStore(true);
      setIsBuffering(false);
      try {
        initAudioEffects();
        resumeAudioContextSafely();
      } catch {}
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
        updateMediaSessionPosition(audio.currentTime, audio.duration);
      }
    };

    const handlePause = () => {
      // Only set playing to false if the user/code explicitly triggered a pause on audio
      // DO NOT pause if tab is merely hidden or buffering
      if (!audio.seeking && audio.paused) {
        setPlayingStore(false);
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused';
        }
        if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
          updateMediaSessionPosition(audio.currentTime, audio.duration);
        }
      }
    };

    const handleWaiting = () => {
      setIsBuffering(true);
    };

    const handlePlaying = () => {
      setIsBuffering(false);
      setPlayingStore(true);
      // Reset retry count on successful track playback
      const activeTrack = usePlayerStore.getState().currentTrack;
      if (activeTrack) {
        const vid = extractVideoId(activeTrack);
        if (vid) {
          retryCountPerTrackRef.current.delete(vid);
        }
      }
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
        updateMediaSessionPosition(audio.currentTime, audio.duration);
      }
    };

    const handleEnded = () => {
      setIsBuffering(false);
      const curRepeat = usePlayerStore.getState().repeatMode;
      if (curRepeat === 'one') {
        audio.currentTime = 0;
        try {
          const p = audio.play();
          if (p !== undefined) {
            p.catch(() => {});
          }
        } catch {}
      } else {
        playNextRef.current();
      }
    };

    const handleError = () => {
      setIsBuffering(false);
      const audio = getPersistentAudioElement();
      const state = usePlayerStore.getState();
      const currentTrack = state.currentTrack;
      const trackId = currentTrack ? extractVideoId(currentTrack) : '';

      // 1. Guard against empty, uninitialized, or reset audio elements
      if (!audio || !audio.src || audio.src === '' || audio.src === window.location.href || !trackId) {
        return;
      }

      // 2. Guard against initial mount / unprompted errors without active playback
      // Error toast or retries MUST ONLY occur if playback was actively initiated
      if (!hasUserGestureRef.current || !state.isPlaying) {
        return;
      }

      const now = Date.now();
      // Debounce rapid duplicate error events (within 1000ms)
      if (now - lastErrorTimestampRef.current < 1000) {
        return;
      }
      lastErrorTimestampRef.current = now;

      const isDeviceOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      const isBlobSrc = audio.src.startsWith('blob:');

      // STRICT OFFLINE & LOCAL BLOB GUARD:
      // If offline or if the error occurred on an IndexedDB blob, NEVER retry with /api/stream!
      if (isDeviceOffline || isBlobSrc) {
        try {
          audio.pause();
        } catch {}
        setPlayingStore(false);
        setIsBuffering(false);
        if (isDeviceOffline && !isBlobSrc) {
          toast.info('Mode offline: Hubungkan ke internet untuk memutar lagu online.');
        } else if (isBlobSrc) {
          toast.error('File audio offline tidak dapat diputar.');
        }
        return;
      }

      const retries = retryCountPerTrackRef.current.get(trackId) || 0;

      // Retry Limit: Allow at most 1 single retry attempt per track
      if (retries < 1 && trackId !== '') {
        retryCountPerTrackRef.current.set(trackId, retries + 1);
        setIsBuffering(true);

        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
        }
        retryTimerRef.current = setTimeout(() => {
          if (audio && usePlayerStore.getState().isPlaying) {
            const streamUrl = `/api/stream?id=${encodeURIComponent(trackId)}&retry=1&t=${Date.now()}`;
            audio.src = streamUrl;
            audio.load();
            audio.play().catch(() => {});
          }
        }, 1000);
        return;
      }

      // Poin 54: Zero-Error Offline Fallback & Cache Swapping
      // If network stream fails or drops mid-playback, attempt instant fallback to local IndexedDB blob
      db.getOfflineTrack(trackId).then((offlineFallback) => {
        if (offlineFallback?.blob) {
          try {
            cleanupActiveBlobUrl();
            const blobUrl = blobManager.create(offlineFallback.blob);
            activeBlobUrlRef.current = blobUrl;
            audio.src = blobUrl;
            audio.currentTime = lastProgressRef.current > 0 ? lastProgressRef.current : 0;
            audio.load();
            safePlayAudio(audio).then((ok) => {
              if (ok) {
                toast.info('Koneksi terputus: Beralih ke cadangan lagu offline.');
              }
            });
            return;
          } catch {}
        }

        // If retry also failed and no offline copy exists:
        // Cleanly pause and reset loading state without crashing
        if (audio) {
          try {
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
          } catch {}
        }
        setIsBuffering(false);
        setPlayingStore(false);
        toast.error(`Koneksi audio terputus untuk lagu ini.`);
      }).catch(() => {
        setIsBuffering(false);
        setPlayingStore(false);
      });

      setPlayingStore(false);
      setIsBuffering(false);

      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        try {
          navigator.mediaSession.playbackState = 'paused';
        } catch {}
      }

      // Display friendly error notification to user ONLY if user consciously initiated playback
      if (hasUserGestureRef.current && state.isPlaying) {
        const trackName = currentTrack?.name ? `"${currentTrack.name}"` : 'lagu ini';
        toast.error(`Gagal memutar ${trackName}. Silakan pilih lagu lain.`);
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [setPlayingStore, setIsBuffering, setDuration, setProgress, updateMediaSessionPosition, cleanupActiveBlobUrl, preloadNextTrackSafely]);

  // =========================================================================
  // Playback Navigation (playNext, playPrev)
  // =========================================================================
  const playNext = useCallback(async () => {
    hasUserGestureRef.current = true;
    retryCountPerTrackRef.current.clear();
    initAudioContextKeepAlive();
    setPlayingStore(true);
    setIsBuffering(true);
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
    await playNextStore();
  }, [playNextStore, setPlayingStore, setIsBuffering, initAudioContextKeepAlive]);

  useEffect(() => {
    playNextRef.current = () => {
      playNext();
    };
  }, [playNext]);

  const playPrev = useCallback(() => {
    hasUserGestureRef.current = true;
    retryCountPerTrackRef.current.clear();
    initAudioContextKeepAlive();
    setPlayingStore(true);
    setIsBuffering(true);
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
    playPrevStore();
  }, [playPrevStore, setPlayingStore, setIsBuffering, initAudioContextKeepAlive]);

  // =========================================================================
  // Core Track Loader: Loads audio source directly into Persistent HTML5 Audio
  // =========================================================================
  const loadAndPlayTrack = useCallback(
    async (targetVid: string, autoPlay: boolean = true, startPosition?: number) => {
      const audio = getPersistentAudioElement();
      if (!audio || !targetVid) return;

      const resumePosition =
        startPosition !== undefined
          ? startPosition
          : pendingResumePositionRef.current !== null
          ? pendingResumePositionRef.current
          : 0;
      pendingResumePositionRef.current = null;

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      // Guard: if audio element is already loaded with this videoId, don't interrupt or recreate
      const isAudioAlreadyLoaded = Boolean(
        audio.src &&
        audio.src !== '' &&
        audio.src !== window.location.href &&
        (
          (activeBlobUrlRef.current && audio.src === activeBlobUrlRef.current) ||
          blobManager.isRegistered(audio.src) ||
          audio.src.includes(encodeURIComponent(targetVid))
        )
      );

      if (loadedTrackIdRef.current === targetVid && isAudioAlreadyLoaded) {
        if (autoPlay && audio.paused) {
          audio.play().catch(() => {});
        }
        setIsBuffering(false);
        return;
      }

      loadedTrackIdRef.current = targetVid;
      preloadedNextTrackIdRef.current = null;

      if (autoPlay) {
        setIsBuffering(true);
      }

      // 1. OFFLINE INDEXEDDB CHECK FIRST:
      // If track was saved locally in IndexedDB, play directly from the local Blob!
      let offlineItem: OfflineTrack | undefined;
      try {
        offlineItem = await db.getOfflineTrack(targetVid);
      } catch (err) {
        console.warn('[OfflinePlay] Error reading offline track from IndexedDB:', err);
      }

      // Guard: abort if user picked another track while waiting for IndexedDB
      if (loadedTrackIdRef.current !== targetVid) {
        return;
      }

      let audioBlob: Blob | null = null;
      if (offlineItem?.blob instanceof Blob) {
        audioBlob = offlineItem.blob;
      } else if (offlineItem?.blob && (offlineItem.blob as any).buffer) {
        audioBlob = new Blob([(offlineItem.blob as any).buffer], { type: 'audio/mpeg' });
      } else if (offlineItem?.blob && typeof (offlineItem.blob as any).slice === 'function') {
        audioBlob = offlineItem.blob as Blob;
      }

      if (audioBlob && audioBlob.size > 0) {
        cleanupActiveBlobUrl();
        const blobUrl = blobManager.create(audioBlob);
        activeBlobUrlRef.current = blobUrl;
        audio.src = blobUrl;
        audio.currentTime = resumePosition;
        if (resumePosition > 0) setProgress(resumePosition);
        audio.volume = Math.max(0, Math.min(1, volume / 100));
        audio.muted = isMuted;
        audio.load();

        // Update LRU access timestamp for offline playback
        db.recordOfflineTrackPlay(targetVid).catch(() => {});

        if (autoPlay) {
          safePlayAudio(audio).then((ok) => {
            if (!ok) {
              setPlayingStore(false);
              setIsBuffering(false);
            } else {
              if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'playing';
              }
              if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
                updateMediaSessionPosition(audio.currentTime, audio.duration);
              }
            }
          });
        }
        setIsBuffering(false);
        return;
      }

      // 2. STRICT OFFLINE GUARD:
      // Only block network streaming if the device is strictly and genuinely offline (navigator.onLine === false)!
      const isStrictlyOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (isStrictlyOffline) {
        cleanupActiveBlobUrl();
        resetAudioElement(audio);
        setIsBuffering(false);
        setPlayingStore(false);
        if (autoPlay) {
          toast.info('Lagu ini belum diunduh untuk pemutaran offline.');
        }
        return;
      }

      // 3. ONLINE STREAM FALLBACK:
      cleanupActiveBlobUrl();
      const streamUrl = useAudioQualityStore.getState().getStreamUrl(targetVid);
      const isSameSrc = Boolean(audio.src && audio.src.includes(encodeURIComponent(targetVid)));

      if (!isSameSrc) {
        const crossfadeSec = useCrossfadeStore.getState().crossfadeDuration;
        if (crossfadeSec > 0 && !audio.paused && audio.currentTime > 1) {
          try {
            await safeFadeOut(audio, Math.min(600, crossfadeSec * 300));
          } catch {}
        }

        pauseAudioSafely(audio);
        audio.src = streamUrl;
        audio.currentTime = resumePosition;
        if (resumePosition > 0) setProgress(resumePosition);
        audio.volume = Math.max(0, Math.min(1, volume / 100));
        audio.muted = isMuted;
        audio.load();
      }

      if (autoPlay) {
        safePlayAudio(audio).then((ok) => {
          if (!ok) {
            setPlayingStore(false);
            setIsBuffering(false);
          } else {
            if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
              navigator.mediaSession.playbackState = 'playing';
            }
            if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
              updateMediaSessionPosition(audio.currentTime, audio.duration);
            }
            const crossfadeSec = useCrossfadeStore.getState().crossfadeDuration;
            if (crossfadeSec > 0) {
              const targetVol = Math.max(0, Math.min(1, volume / 100));
              safeFadeIn(audio, targetVol, Math.min(700, crossfadeSec * 350)).catch(() => {});
            }
          }
        });
      }
    },
    [volume, isMuted, cleanupActiveBlobUrl, setIsBuffering, setPlayingStore, setProgress, updateMediaSessionPosition]
  );

  // =========================================================================
  // Play Track & Queue Actions
  // =========================================================================
  const playTrack = useCallback(
    async (track: any, queue?: any[], context?: 'playlist' | 'similar', forceIndex?: number) => {
      hasUserGestureRef.current = true;
      retryCountPerTrackRef.current.clear();
      initAudioContextKeepAlive();

      // Request notification permission for Android/mobile notification controls if not yet granted
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }

      const targetVideoId = extractVideoId(track);
      if (!targetVideoId) {
        toast.info('ID lagu tidak ditemukan.');
        return;
      }

      setPlayingStore(true);
      setIsBuffering(true);
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }

      playTrackStore(track, queue, context, forceIndex);
      await loadAndPlayTrack(targetVideoId, true);
    },
    [playTrackStore, setPlayingStore, setIsBuffering, initAudioContextKeepAlive, loadAndPlayTrack]
  );

  const playQueueIndex = useCallback(
    async (index: number) => {
      hasUserGestureRef.current = true;
      retryCountPerTrackRef.current.clear();
      initAudioContextKeepAlive();
      setPlayingStore(true);
      setIsBuffering(true);

      const targetTrack = usePlayerStore.getState().queue[index];
      if (targetTrack) {
        const targetVid = extractVideoId(targetTrack);
        if (targetVid) {
          playQueueIndexStore(index);
          await loadAndPlayTrack(targetVid, true);
          return;
        }
      }

      playQueueIndexStore(index);
    },
    [playQueueIndexStore, setPlayingStore, setIsBuffering, initAudioContextKeepAlive, loadAndPlayTrack]
  );

  // Synchronize track changes (e.g., from playNext, playPrev, or external store triggers)
  const currentVideoId = extractVideoId(currentTrack);
  useEffect(() => {
    if (!currentVideoId) {
      loadedTrackIdRef.current = null;
      const audio = getPersistentAudioElement();
      if (audio && audio.src) {
        try {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        } catch {}
      }
      return;
    }

    // If loadedTrackIdRef already matches the active track, do NOT re-execute to prevent race conditions
    if (loadedTrackIdRef.current === currentVideoId) {
      return;
    }

    const isPlayingStore = usePlayerStore.getState().isPlaying;
    if (!isPlayingStore) {
      loadedTrackIdRef.current = currentVideoId;
      setIsBuffering(false);
      return;
    }

    loadAndPlayTrack(currentVideoId, isPlayingStore);
  }, [currentVideoId, loadAndPlayTrack, setIsBuffering]);

  // =========================================================================
  // Playback Control Handlers (Play, Pause, Seek, Volume, Mute)
  // =========================================================================
  const togglePlay = useCallback(async () => {
    hasUserGestureRef.current = true;
    initAudioContextKeepAlive();
    const audio = getPersistentAudioElement();
    const currentStore = usePlayerStore.getState();
    const nextPlaying = !currentStore.isPlaying;
    setPlayingStore(nextPlaying);

    if (audio) {
      if (nextPlaying) {
        const vid = currentStore.currentTrack ? extractVideoId(currentStore.currentTrack) : '';
        if (vid) {
          const isAudioReady = Boolean(
            audio.src &&
            audio.src !== '' &&
            audio.src !== window.location.href &&
            (
              (activeBlobUrlRef.current && audio.src === activeBlobUrlRef.current) ||
              blobManager.isRegistered(audio.src) ||
              audio.src.includes(encodeURIComponent(vid))
            )
          );

          if (!isAudioReady) {
            setIsBuffering(true);
            await loadAndPlayTrack(vid, true);
            return;
          }
        }
        if (pendingResumePositionRef.current !== null && pendingResumePositionRef.current > 0) {
          const seekPos = pendingResumePositionRef.current;
          pendingResumePositionRef.current = null;
          audio.currentTime = seekPos;
          setProgress(seekPos);
        }
        safePlayAudio(audio).then((ok) => {
          if (!ok) {
            setPlayingStore(false);
            setIsBuffering(false);
          }
        });
      } else {
        pauseAudioSafely(audio);
      }
    }

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = nextPlaying ? 'playing' : 'paused';
    }
  }, [setPlayingStore, setIsBuffering, initAudioContextKeepAlive, loadAndPlayTrack, setProgress]);

  const setPlaying = useCallback(
    async (playing: boolean) => {
      if (playing) {
        hasUserGestureRef.current = true;
        initAudioContextKeepAlive();
      }
      setPlayingStore(playing);
      const audio = getPersistentAudioElement();

      if (audio) {
        if (playing) {
          const currentTrack = usePlayerStore.getState().currentTrack;
          const vid = currentTrack ? extractVideoId(currentTrack) : '';
          if (vid) {
            const isAudioReady = Boolean(
              audio.src &&
              audio.src !== '' &&
              audio.src !== window.location.href &&
              (
                (activeBlobUrlRef.current && audio.src === activeBlobUrlRef.current) ||
                blobManager.isRegistered(audio.src) ||
                audio.src.includes(encodeURIComponent(vid))
              )
            );

            if (!isAudioReady) {
              setIsBuffering(true);
              await loadAndPlayTrack(vid, true);
              return;
            }
          }
          safePlayAudio(audio).then((ok) => {
            if (!ok) {
              setPlayingStore(false);
              setIsBuffering(false);
            }
          });
        } else {
          pauseAudioSafely(audio);
        }
      }

      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
      }
    },
    [setPlayingStore, setIsBuffering, initAudioContextKeepAlive, loadAndPlayTrack]
  );

  const seekTo = useCallback(
    (time: number) => {
      const audio = getPersistentAudioElement();
      const dur = usePlayerStore.getState().duration || 0;
      const clamped = Math.max(0, Math.min(dur > 0 ? dur : 9999, time));

      isSeekingLockRef.current = true;
      lastProgressRef.current = clamped;
      setProgress(clamped);

      if (audio) {
        try {
          audio.currentTime = clamped;
          if (usePlayerStore.getState().isPlaying && audio.paused) {
            audio.play().catch(() => {});
          }
        } catch {}
      }

      updateMediaSessionPosition(clamped, dur);

      if (seekLockTimerRef.current) clearTimeout(seekLockTimerRef.current);
      seekLockTimerRef.current = setTimeout(() => {
        isSeekingLockRef.current = false;
      }, 400);
    },
    [setProgress, updateMediaSessionPosition]
  );

  const setVolume = useCallback(
    (val: number) => {
      const clamped = Math.max(0, Math.min(100, val));
      setVolumeStore(clamped);
      const audio = getPersistentAudioElement();
      if (audio) {
        audio.volume = clamped / 100;
      }
    },
    [setVolumeStore]
  );

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    setIsMuted(next);
    const audio = getPersistentAudioElement();
    if (audio) {
      audio.muted = next;
    }
  }, [isMuted]);

  // Synchronize volume & mute whenever state changes
  useEffect(() => {
    const audio = getPersistentAudioElement();
    if (audio) {
      audio.volume = Math.max(0, Math.min(1, volume / 100));
      audio.muted = isMuted;
    }
  }, [volume, isMuted]);

  // =========================================================================
  // Media Session API (Mobile Background & Lockscreen Notification Controls)
  // Fully configured for continuous background control across PC and Mobile
  // =========================================================================
  const mediaActionsRef = useRef({
    play: () => {},
    pause: () => {},
    next: () => {},
    prev: () => {},
    seekTo: (time: number) => {},
    toggleShuffle: () => {},
    toggleRepeat: () => {},
  });

  useEffect(() => {
    mediaActionsRef.current = {
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      next: () => playNext(),
      prev: () => playPrev(),
      seekTo: (time: number) => seekTo(time),
      toggleShuffle: () => toggleShuffle(),
      toggleRepeat: () => toggleRepeat(),
    };
  }, [setPlaying, playNext, playPrev, seekTo, toggleShuffle, toggleRepeat]);

  // Hook for Native Android MediaSession (Status Bar & Lockscreen Notification in APK)
  useEffect(() => {
    window.__handleAndroidMediaAction = (action: string, arg?: any) => {
      try {
        if (action === 'play') {
          mediaActionsRef.current.play();
        } else if (action === 'pause') {
          mediaActionsRef.current.pause();
        } else if (action === 'next') {
          mediaActionsRef.current.next();
        } else if (action === 'prev') {
          mediaActionsRef.current.prev();
        } else if (action === 'seekTo' && typeof arg === 'number') {
          mediaActionsRef.current.seekTo(arg);
        } else if (action === 'stop') {
          mediaActionsRef.current.pause();
        }
      } catch (err) {
        console.error('[AndroidMediaBridge] Action error:', err);
      }
    };

    return () => {
      delete window.__handleAndroidMediaAction;
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const ms = navigator.mediaSession;

    const VALID_MEDIA_SESSION_ACTIONS: MediaSessionAction[] = [
      'play',
      'pause',
      'previoustrack',
      'nexttrack',
      'seekto',
      'seekbackward',
      'seekforward',
      'stop',
    ];

    // Safe action registration helper to prevent unsupported actions from throwing or blocking standard ones
    const safeSetActionHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null
    ) => {
      try {
        if (!VALID_MEDIA_SESSION_ACTIONS.includes(action)) return;
        ms.setActionHandler(action, handler);
      } catch {
        // Silently suppress in case specific platform does not implement the action
      }
    };

    // 1. Play Action: Resumes playback and restores audio focus safely
    safeSetActionHandler('play', async () => {
      try {
        resumeAudioContextSafely();
        const audio = getPersistentAudioElement();
        if (audio && audio.paused && audio.src) {
          safePlayAudio(audio).catch(() => {});
        }
        mediaActionsRef.current.play();
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
      } catch (err) {
        console.error('[MediaSession] Play handler error:', err);
      }
    });

    // 2. Pause Action: Pauses audio smoothly on system interrupt without touching queue
    safeSetActionHandler('pause', () => {
      try {
        const audio = getPersistentAudioElement();
        if (audio && !audio.paused) {
          pauseAudioSafely(audio);
        }
        mediaActionsRef.current.pause();
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused';
        }
      } catch (err) {
        console.error('[MediaSession] Pause handler error:', err);
      }
    });

    // 3. Previous Track Action: Navigates queue safely
    safeSetActionHandler('previoustrack', () => {
      try {
        mediaActionsRef.current.prev();
      } catch (err) {
        console.error('[MediaSession] Prev handler error:', err);
      }
    });

    // 4. Next Track Action: Navigates queue safely
    safeSetActionHandler('nexttrack', () => {
      try {
        mediaActionsRef.current.next();
      } catch (err) {
        console.error('[MediaSession] Next handler error:', err);
      }
    });

    // 5. Seek To Action: Scrubbing from lock screen / Bluetooth controller
    safeSetActionHandler('seekto', (details) => {
      try {
        if (
          details.seekTime !== undefined &&
          details.seekTime !== null &&
          !isNaN(details.seekTime) &&
          isFinite(details.seekTime)
        ) {
          mediaActionsRef.current.seekTo(details.seekTime);
        }
      } catch (err) {
        console.error('[MediaSession] SeekTo handler error:', err);
      }
    });

    // 6. Seek Backward Action: Quick rewind 10s
    safeSetActionHandler('seekbackward', (details) => {
      try {
        const skip = details.seekOffset || 10;
        const cur = usePlayerStore.getState().progress;
        mediaActionsRef.current.seekTo(Math.max(0, cur - skip));
      } catch (err) {
        console.error('[MediaSession] SeekBackward handler error:', err);
      }
    });

    // 7. Seek Forward Action: Quick fast-forward 10s
    safeSetActionHandler('seekforward', (details) => {
      try {
        const skip = details.seekOffset || 10;
        const cur = usePlayerStore.getState().progress;
        const dur = usePlayerStore.getState().duration;
        mediaActionsRef.current.seekTo(Math.min(dur, cur + skip));
      } catch (err) {
        console.error('[MediaSession] SeekForward handler error:', err);
      }
    });

    // 8. Stop Action: Handles mobile OS audio focus abandonment or notification dismiss
    safeSetActionHandler('stop', () => {
      try {
        const audio = getPersistentAudioElement();
        if (audio) {
          pauseAudioSafely(audio);
        }
        mediaActionsRef.current.pause();
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'none';
        }
      } catch (err) {
        console.error('[MediaSession] Stop handler error:', err);
      }
    });

    return () => {
      VALID_MEDIA_SESSION_ACTIONS.forEach((action) => {
        safeSetActionHandler(action, null);
      });
    };
  }, []);

  // Sync MediaMetadata with Current Track and Playback Status (Web & Android APK)
  useEffect(() => {
    if (!currentTrack) {
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        try {
          navigator.mediaSession.metadata = null;
          navigator.mediaSession.playbackState = 'none';
        } catch {}
      }
      if (typeof window !== 'undefined' && window.AndroidMediaBridge) {
        try {
          window.AndroidMediaBridge.destroySession();
        } catch {}
      }
      return;
    }

    const rawThumbnail = currentTrack.thumbnails?.[currentTrack.thumbnails.length - 1]?.url;
    const artist = Array.isArray(currentTrack.artist)
      ? currentTrack.artist.map((a: any) => (typeof a === 'string' ? a : a?.name || '')).filter(Boolean).join(', ')
      : (typeof currentTrack.artist === 'string' ? currentTrack.artist : currentTrack.artist?.name) || 'Unknown Artist';

    const albumTitle = (currentTrack as any).album?.name || (currentTrack as any).album || 'MusicFY';
    const trackTitle = currentTrack.name || 'MusicFY Track';
    const absoluteArtwork = toAbsoluteArtworkUrl(rawThumbnail, 512);
    const durMs = Math.round((currentTrack.duration || 0) * 1000);
    const posMs = Math.round((usePlayerStore.getState().progress || 0) * 1000);

    // 1. Standard Web MediaSession API (for Chrome / mobile browser & desktop)
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      if (typeof window !== 'undefined' && 'MediaMetadata' in window) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: trackTitle,
            artist: artist || 'MusicFY Artist',
            album: albumTitle,
            artwork: [
              { src: toAbsoluteArtworkUrl(rawThumbnail, 96), sizes: '96x96' },
              { src: toAbsoluteArtworkUrl(rawThumbnail, 128), sizes: '128x128' },
              { src: toAbsoluteArtworkUrl(rawThumbnail, 192), sizes: '192x192' },
              { src: toAbsoluteArtworkUrl(rawThumbnail, 256), sizes: '256x256' },
              { src: toAbsoluteArtworkUrl(rawThumbnail, 384), sizes: '384x384' },
              { src: absoluteArtwork, sizes: '512x512' },
            ],
          });
        } catch (err) {
          console.warn('[MediaSession] Metadata update error:', err);
        }
      }

      try {
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      } catch {}
    }

    // 2. Native Android MediaSession Bridge (for Capacitor APK Status Bar & Lockscreen Controls)
    if (typeof window !== 'undefined' && window.AndroidMediaBridge) {
      try {
        window.AndroidMediaBridge.updateMetadata(trackTitle, artist, albumTitle, absoluteArtwork, durMs);
        window.AndroidMediaBridge.updatePlaybackState(
          isPlaying ? 'playing' : 'paused',
          posMs,
          durMs
        );
      } catch (err) {
        console.warn('[AndroidMediaBridge] Metadata bridge error:', err);
      }
    }

    const audio = getPersistentAudioElement();
    if (audio) {
      audio.title = `${trackTitle} • ${artist}`;
      if (currentTrack.duration && isFinite(currentTrack.duration) && currentTrack.duration > 0) {
        updateMediaSessionPosition(audio.currentTime || 0, currentTrack.duration);
      }
    }
  }, [currentTrack, isPlaying, updateMediaSessionPosition]);

  // Sync MediaSession playbackState with Store isPlaying (Web & Android APK)
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
    if (typeof window !== 'undefined' && window.AndroidMediaBridge) {
      try {
        const curDur = Math.round((usePlayerStore.getState().duration || 0) * 1000);
        const curPos = Math.round((usePlayerStore.getState().progress || 0) * 1000);
        window.AndroidMediaBridge.updatePlaybackState(isPlaying ? 'playing' : 'paused', curPos, curDur);
      } catch {}
    }
  }, [isPlaying]);

  // Poin 95: Dynamic Document Title & Favicon Sync
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!currentTrack) {
      document.title = 'MusicFY - Pemutar Musik';
      return;
    }

    const artist = Array.isArray(currentTrack.artist)
      ? currentTrack.artist.map((a: any) => (typeof a === 'string' ? a : a?.name || '')).filter(Boolean).join(', ')
      : (typeof currentTrack.artist === 'string' ? currentTrack.artist : currentTrack.artist?.name) || 'Unknown Artist';

    const cleanTitle = currentTrack.name || 'Lagu';
    if (isPlaying) {
      document.title = `▶ ${cleanTitle} • ${artist} | MusicFY`;
    } else {
      document.title = `❚❚ ${cleanTitle} • ${artist} | MusicFY`;
    }
  }, [currentTrack, isPlaying]);

  // Poin 90: Tab Visibility API Smart Pausing
  // Throttles non-essential animations when tab is hidden while keeping audio continuous
  useEffect(() => {
    const handleVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        document.documentElement.setAttribute('data-tab-hidden', 'true');
      } else {
        document.documentElement.removeAttribute('data-tab-hidden');
        resumeAudioContextSafely();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // =========================================================================
  // Background Playback Guardian & Screen WakeLock
  // ABSOLUTELY NEVER PAUSES AUDIO ON VISIBILITY CHANGE / PAGEHIDE / BLUR
  // =========================================================================
  useEffect(() => {
    const requestLock = async () => {
      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && isPlaying) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch {}
      }
    };

    if (isPlaying) requestLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (usePlayerStore.getState().isPlaying) {
          requestLock();
          if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
          }
        }
      } else {
        // Tab hidden, screen locked, or minimized:
        // NEVER PAUSE AUDIO!
        // Reinforce MediaSession playing state to keep background audio alive!
        if (usePlayerStore.getState().isPlaying && typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [isPlaying]);

  // =========================================================================
  // Persistent Liked Songs (localStorage + IndexedDB)
  // =========================================================================
  const [likedSongs, setLikedSongs] = useState<Track[]>([]);

  // Safely hydrate from localStorage on client mount (prevents SSR hydration mismatch)
  useEffect(() => {
    try {
      const stored = debouncedLocalStorageGet(LIKED_STORAGE_KEY) || localStorage.getItem('spotify_liked_tracks');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLikedSongs(parsed);
        }
      }
    } catch {}
  }, []);

  const likedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    likedIdsRef.current = new Set(likedSongs.map((t) => t.videoId));
  }, [likedSongs]);

  // Hydrate Liked Songs from IndexedDB
  useEffect(() => {
    let mounted = true;
    db.getLikedSongs()
      .then((idbSongs) => {
        if (!mounted || !idbSongs) return;
        setLikedSongs((prev) => {
          const map = new Map<string, Track>();
          prev.forEach((t) => map.set(t.videoId, t));
          idbSongs.forEach((t) => map.set(t.videoId, t));
          const merged = Array.from(map.values());
          try {
            debouncedLocalStorageSet(LIKED_STORAGE_KEY, JSON.stringify(merged));
          } catch {}
          return merged;
        });
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  const isLiked = useCallback((videoId: string): boolean => {
    if (!videoId) return false;
    return likedIdsRef.current.has(videoId);
  }, []);

  const toggleLike = useCallback(
    async (track: Track): Promise<boolean> => {
      if (!track?.videoId) return false;

      const alreadyLiked = likedIdsRef.current.has(track.videoId);

      setLikedSongs((prev) => {
        let next: Track[];
        if (alreadyLiked) {
          next = prev.filter((t) => t.videoId !== track.videoId);
        } else {
          next = [track, ...prev.filter((t) => t.videoId !== track.videoId)];
        }
        try {
          debouncedLocalStorageSet(LIKED_STORAGE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });

      if (alreadyLiked) {
        db.removeLikedSong(track.videoId).catch(() => {});
        toast.info('Dihapus dari Lagu yang Disukai');
      } else {
        db.addLikedSong(track).catch(() => {});
        toast.success('Disimpan ke Lagu yang Disukai');
      }

      return !alreadyLiked;
    },
    []
  );

  // =========================================================================
  // Global Keyboard Shortcuts
  // =========================================================================
  useHotkeys({
    onTogglePlay: togglePlay,
    onSeekBackward: () => {
      const cur = usePlayerStore.getState().progress;
      seekTo(Math.max(0, cur - 5));
    },
    onSeekForward: () => {
      const cur = usePlayerStore.getState().progress;
      const dur = usePlayerStore.getState().duration || 0;
      seekTo(Math.min(dur, cur + 5));
    },
    onToggleMute: toggleMute,
    onNextTrack: playNext,
    onPrevTrack: playPrev,
    onVolumeUp: () => {
      const curVol = usePlayerStore.getState().volume ?? 100;
      setVolume(Math.min(100, curVol + 5));
    },
    onVolumeDown: () => {
      const curVol = usePlayerStore.getState().volume ?? 100;
      setVolume(Math.max(0, curVol - 5));
    },
    onToggleDevPanel: () => {
      useDevModalStore.getState().toggleModal();
    },
  });

  const value = useMemo<MusicContextType>(
    () => ({
      currentTrack,
      isPlaying,
      get progress() {
        return usePlayerStore.getState().progress;
      },
      duration,
      volume,
      isMuted,
      queue,
      queueIndex,
      repeatMode,
      isShuffle,
      dominantColor,
      isOnline,
      likedSongs,
      isLiked,
      toggleLike,
      playTrack,
      playQueueIndex,
      togglePlay,
      setPlaying,
      playNext,
      playPrev,
      seekTo,
      setVolume,
      toggleMute,
      toggleShuffle,
      toggleRepeat,
      addToQueue,
      insertNextInQueue,
      moveQueueItem,
      clearQueue,
    }),
    [
      currentTrack,
      isPlaying,
      duration,
      volume,
      isMuted,
      queue,
      queueIndex,
      repeatMode,
      isShuffle,
      dominantColor,
      isOnline,
      likedSongs,
      isLiked,
      toggleLike,
      playTrack,
      playQueueIndex,
      togglePlay,
      setPlaying,
      playNext,
      playPrev,
      seekTo,
      setVolume,
      toggleMute,
      toggleShuffle,
      toggleRepeat,
      addToQueue,
      insertNextInQueue,
      moveQueueItem,
      clearQueue,
    ]
  );

  return (
    <MusicContext.Provider value={value}>
      {children}
    </MusicContext.Provider>
  );
}

export function useMusic(): MusicContextType {
  const context = useContext(MusicContext);
  if (!context) {
    throw new Error('useMusic must be used within a MusicProvider');
  }
  return context;
}
