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

import { getPersistentAudioElement } from '@/lib/audioElement';

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
  clearQueue: () => void;
}

const MusicContext = createContext<MusicContextType | null>(null);

const LIKED_STORAGE_KEY = 'pmusic_liked_tracks';

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
  isMutedRef.current = isMuted;
  const isSeekingLockRef = useRef<boolean>(false);
  const seekLockTimerRef = useRef<NodeJS.Timeout | null>(null);
  const loadedTrackIdRef = useRef<string | null>(null);
  const lastProgressRef = useRef<number>(-1);
  const lastMediaSessionUpdateRef = useRef<number>(0);
  const activeBlobUrlRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playNextRef = useRef<() => void>(() => {});
  const wakeLockRef = useRef<any>(null);

  // User gesture & playback failure safeguards
  const hasUserGestureRef = useRef<boolean>(false);
  const retryCountPerTrackRef = useRef<Map<string, number>>(new Map());
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastErrorTimestampRef = useRef<number>(0);

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

  // Revoke previous object URLs to prevent memory leaks
  const cleanupActiveBlobUrl = useCallback(() => {
    if (activeBlobUrlRef.current) {
      try {
        URL.revokeObjectURL(activeBlobUrlRef.current);
      } catch {}
      activeBlobUrlRef.current = null;
    }
  }, []);

  // Component unmount & resource cleanup (prevents memory leak & OOM crashes on mobile)
  useEffect(() => {
    return () => {
      cleanupActiveBlobUrl();
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
      if (audioContextRef.current) {
        try {
          if (audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(() => {});
          }
        } catch {}
        audioContextRef.current = null;
      }
    };
  }, [cleanupActiveBlobUrl]);

  // Update MediaSession Position State (Throttled for high performance & lockscreen scrubber)
  const updateMediaSessionPosition = useCallback((curTime: number, totalDur?: number) => {
    if (
      typeof navigator !== 'undefined' &&
      'mediaSession' in navigator &&
      'setPositionState' in navigator.mediaSession
    ) {
      const dur = totalDur || usePlayerStore.getState().duration || 0;
      if (dur > 0 && typeof curTime === 'number' && !isNaN(curTime) && curTime >= 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration: dur,
            playbackRate: 1,
            position: Math.min(dur, Math.max(0, curTime)),
          });
        } catch {}
      }
    }
  }, []);

  // Hardware Audio Focus Keep-Alive (prevents mobile background audio ducking / suspension)
  // SAFE: Strictly checked against physical user interaction to eliminate browser Autoplay warnings
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
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioContextRef.current) {
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.00001; // Silent anchor
        osc.connect(gain);
        gain.connect(ctx.destination);
        try {
          osc.start();
        } catch {}
        audioContextRef.current = ctx;
      } else if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
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
        }
      }
    };

    const handleDurationChange = () => {
      if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
        updateMediaSessionPosition(audio.currentTime, audio.duration);
      }
    };

    const handlePlay = () => {
      setPlayingStore(true);
      setIsBuffering(false);
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
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

      // If retry also failed or track is unplayable:
      // STOP playback, pause audio, reset loading/buffering states.
      // NEVER trigger playNext() to prevent infinite auto-skip loops!
      if (audio) {
        try {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        } catch {}
      }

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

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [setPlayingStore, setIsBuffering, setDuration, setProgress, updateMediaSessionPosition]);

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
    async (targetVid: string, autoPlay: boolean = true) => {
      const audio = getPersistentAudioElement();
      if (!audio || !targetVid) return;

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
        const blobUrl = URL.createObjectURL(audioBlob);
        activeBlobUrlRef.current = blobUrl;
        audio.src = blobUrl;
        audio.currentTime = 0;
        audio.volume = Math.max(0, Math.min(1, volume / 100));
        audio.muted = isMuted;
        audio.load();

        if (autoPlay) {
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch((err) => {
              if (err?.name === 'NotAllowedError') {
                setPlayingStore(false);
                setIsBuffering(false);
              }
            });
          }
        }
        setIsBuffering(false);
        return;
      }

      // 2. STRICT OFFLINE GUARD:
      // Only block network streaming if the device is strictly and genuinely offline (navigator.onLine === false)!
      const isStrictlyOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (isStrictlyOffline) {
        cleanupActiveBlobUrl();
        try {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        } catch {}
        setIsBuffering(false);
        setPlayingStore(false);
        if (autoPlay) {
          toast.info('Lagu ini belum diunduh untuk pemutaran offline.');
        }
        return;
      }

      // 3. ONLINE STREAM FALLBACK:
      cleanupActiveBlobUrl();
      const streamUrl = `/api/stream?id=${encodeURIComponent(targetVid)}`;
      const isSameSrc = Boolean(audio.src && audio.src.includes(encodeURIComponent(targetVid)));

      if (!isSameSrc) {
        audio.src = streamUrl;
        audio.currentTime = 0;
        audio.volume = Math.max(0, Math.min(1, volume / 100));
        audio.muted = isMuted;
        audio.load();
      }

      if (autoPlay) {
        try {
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch((err) => {
              if (err?.name === 'NotAllowedError') {
                setPlayingStore(false);
                setIsBuffering(false);
              }
            });
          }
        } catch {}
      }
    },
    [volume, isMuted, cleanupActiveBlobUrl, setIsBuffering, setPlayingStore]
  );

  // =========================================================================
  // Play Track & Queue Actions
  // =========================================================================
  const playTrack = useCallback(
    async (track: any, queue?: any[], context?: 'playlist' | 'similar', forceIndex?: number) => {
      hasUserGestureRef.current = true;
      retryCountPerTrackRef.current.clear();
      initAudioContextKeepAlive();

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
              audio.src.includes(encodeURIComponent(vid))
            )
          );

          if (!isAudioReady) {
            setIsBuffering(true);
            await loadAndPlayTrack(vid, true);
            return;
          }
        }
        audio.play().catch((err) => {
          if (err?.name === 'NotAllowedError') {
            setPlayingStore(false);
            setIsBuffering(false);
          }
        });
      } else {
        audio.pause();
      }
    }

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = nextPlaying ? 'playing' : 'paused';
    }
  }, [setPlayingStore, setIsBuffering, initAudioContextKeepAlive, loadAndPlayTrack]);

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
                audio.src.includes(encodeURIComponent(vid))
              )
            );

            if (!isAudioReady) {
              setIsBuffering(true);
              await loadAndPlayTrack(vid, true);
              return;
            }
          }
          audio.play().catch((err) => {
            if (err?.name === 'NotAllowedError') {
              setPlayingStore(false);
              setIsBuffering(false);
            }
          });
        } else {
          audio.pause();
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
  });

  useEffect(() => {
    mediaActionsRef.current = {
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      next: () => playNext(),
      prev: () => playPrev(),
      seekTo: (time: number) => seekTo(time),
    };
  }, [setPlaying, playNext, playPrev, seekTo]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const ms = navigator.mediaSession;

    // Safe action registration helper to prevent unsupported actions from blocking standard ones
    const safeSetActionHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null
    ) => {
      try {
        ms.setActionHandler(action, handler);
      } catch (err) {
        // Suppress errors for actions not supported by this browser/OS version
        console.warn(`[MediaSession] Action "${action}" not supported on this platform:`, err);
      }
    };

    // 1. Play Action: Resumes playback and restores audio focus safely
    safeSetActionHandler('play', async () => {
      try {
        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume().catch(() => {});
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
    // CRITICAL: NEVER wipe or clear queue state on stop/pause interrupt!
    safeSetActionHandler('stop', () => {
      try {
        mediaActionsRef.current.pause();
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused';
        }
      } catch (err) {
        console.error('[MediaSession] Stop handler error:', err);
      }
    });

    return () => {
      const actions: MediaSessionAction[] = [
        'play',
        'pause',
        'previoustrack',
        'nexttrack',
        'seekto',
        'seekbackward',
        'seekforward',
        'stop',
      ];
      actions.forEach((action) => {
        safeSetActionHandler(action, null);
      });
    };
  }, []);

  // Sync MediaMetadata with Current Track
  useEffect(() => {
    if (currentTrack && typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      const rawThumbnail = currentTrack.thumbnails?.[currentTrack.thumbnails.length - 1]?.url;
      const thumbnail = rawThumbnail ? getHighResImage(rawThumbnail, 800) : '/icon.png';
      const artist = Array.isArray(currentTrack.artist)
        ? currentTrack.artist.map((a: any) => (typeof a === 'string' ? a : a?.name || '')).filter(Boolean).join(', ')
        : (typeof currentTrack.artist === 'string' ? currentTrack.artist : currentTrack.artist?.name) || 'Unknown Artist';

      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.name || 'PMUSIC Track',
          artist: artist || 'PMUSIC Artist',
          album: 'PMUSIC',
          artwork: [
            { src: thumbnail, sizes: '96x96', type: 'image/jpeg' },
            { src: thumbnail, sizes: '128x128', type: 'image/jpeg' },
            { src: thumbnail, sizes: '192x192', type: 'image/jpeg' },
            { src: thumbnail, sizes: '256x256', type: 'image/jpeg' },
            { src: thumbnail, sizes: '384x384', type: 'image/jpeg' },
            { src: thumbnail, sizes: '512x512', type: 'image/jpeg' },
          ],
        });
      } catch (err) {
        console.warn('[MediaSession] Metadata update error:', err);
      }
    }
  }, [currentTrack]);

  // Sync MediaSession playbackState with Store isPlaying
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

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
      const stored = localStorage.getItem(LIKED_STORAGE_KEY) || localStorage.getItem('spotify_liked_tracks');
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
            localStorage.setItem(LIKED_STORAGE_KEY, JSON.stringify(merged));
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
          localStorage.setItem(LIKED_STORAGE_KEY, JSON.stringify(next));
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
