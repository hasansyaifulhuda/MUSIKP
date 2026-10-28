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
import { db } from '@/lib/db';
import { toast } from '@/lib/toast';
import { getHighResImage } from '@/lib/utils';

// =========================================================================
// Global Persistent Audio Element Singleton
// Attached to document.body, survives all page transitions & component lifecycle
// =========================================================================
let persistentAudioElement: HTMLAudioElement | null = null;

function getPersistentAudioElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!persistentAudioElement) {
    let el = (document.getElementById('pmusic-persistent-audio') ||
      document.getElementById('sann-persistent-audio')) as HTMLAudioElement | null;
    if (!el) {
      el = document.createElement('audio');
      el.id = 'pmusic-persistent-audio';
      el.preload = 'auto';
      el.setAttribute('playsinline', 'true');
      el.setAttribute('webkit-playsinline', 'true');
      el.style.position = 'fixed';
      el.style.bottom = '0';
      el.style.left = '0';
      el.style.width = '0';
      el.style.height = '0';
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
      el.style.zIndex = '-9999';
      document.body.appendChild(el);
    }
    persistentAudioElement = el;
  }
  return persistentAudioElement;
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

  // Local State & Audio Control Refs
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const isSeekingLockRef = useRef<boolean>(false);
  const seekLockTimerRef = useRef<NodeJS.Timeout | null>(null);
  const loadedTrackIdRef = useRef<string | null>(null);
  const lastProgressRef = useRef<number>(-1);
  const lastMediaSessionUpdateRef = useRef<number>(0);
  const activeBlobUrlRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playNextRef = useRef<() => void>(() => {});
  const wakeLockRef = useRef<any>(null);

  // Revoke previous object URLs to prevent memory leaks
  const cleanupActiveBlobUrl = useCallback(() => {
    if (activeBlobUrlRef.current) {
      try {
        URL.revokeObjectURL(activeBlobUrlRef.current);
      } catch {}
      activeBlobUrlRef.current = null;
    }
  }, []);

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
  const initAudioContextKeepAlive = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioContextRef.current) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.00001; // Silent anchor
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        audioContextRef.current = ctx;
      } else if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
    } catch {}
  }, []);

  // Declare W3C AudioSession 'playback' mode for mobile media focus (iOS & modern Android)
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
      try {
        (navigator as any).audioSession.type = 'playback';
      } catch {}
    }
  }, []);

  // =========================================================================
  // Native HTML5 Audio Engine & Hardware Event Listeners
  // Native events (timeupdate, ended, playing) bypass browser background timer throttling
  // =========================================================================
  useEffect(() => {
    const audio = getPersistentAudioElement();
    if (!audio) return;

    // Apply initial volume & muted state
    audio.volume = Math.max(0, Math.min(1, volume / 100));
    audio.muted = isMuted;

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
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
    };

    const handleEnded = () => {
      setIsBuffering(false);
      const curRepeat = usePlayerStore.getState().repeatMode;
      if (curRepeat === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        playNextRef.current();
      }
    };

    const handleError = () => {
      // Silent auto-advance on stream error to maintain clean developer console
      setIsBuffering(false);
      playNextRef.current();
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
  }, [setPlayingStore, setIsBuffering, setDuration, setProgress, updateMediaSessionPosition, volume, isMuted]);

  // =========================================================================
  // Playback Navigation (playNext, playPrev)
  // =========================================================================
  const playNext = useCallback(async () => {
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
      if (!audio) return;

      loadedTrackIdRef.current = targetVid;
      cleanupActiveBlobUrl();
      setIsBuffering(true);

      // 1. Instant Offline Playback via local IndexedDB Blob
      try {
        const offlineItem = await db.getOfflineTrack(targetVid);
        if (offlineItem?.blob) {
          const blobUrl = URL.createObjectURL(offlineItem.blob);
          activeBlobUrlRef.current = blobUrl;
          audio.src = blobUrl;
          audio.currentTime = 0;
          audio.volume = Math.max(0, Math.min(1, volume / 100));
          audio.muted = isMuted;
          audio.load();
          if (autoPlay) {
            audio.play().catch(() => {});
          }
          return;
        }
      } catch {}

      // 2. High-Performance Stealth Stream via /api/stream
      const streamUrl = `/api/stream?id=${encodeURIComponent(targetVid)}`;
      audio.src = streamUrl;
      audio.currentTime = 0;
      audio.volume = Math.max(0, Math.min(1, volume / 100));
      audio.muted = isMuted;
      audio.load();

      if (autoPlay) {
        audio.play().catch(() => {});
      }
    },
    [volume, isMuted, cleanupActiveBlobUrl, setIsBuffering]
  );

  // =========================================================================
  // Play Track & Queue Actions
  // =========================================================================
  const playTrack = useCallback(
    async (track: any, queue?: any[], context?: 'playlist' | 'similar', forceIndex?: number) => {
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
      if (audio) {
        try {
          audio.pause();
          audio.src = '';
        } catch {}
      }
      return;
    }

    if (loadedTrackIdRef.current === currentVideoId) {
      return;
    }

    loadAndPlayTrack(currentVideoId, usePlayerStore.getState().isPlaying);
  }, [currentVideoId, loadAndPlayTrack]);

  // =========================================================================
  // Playback Control Handlers (Play, Pause, Seek, Volume, Mute)
  // =========================================================================
  const togglePlay = useCallback(() => {
    initAudioContextKeepAlive();
    const audio = getPersistentAudioElement();
    const currentStore = usePlayerStore.getState();
    const nextPlaying = !currentStore.isPlaying;
    setPlayingStore(nextPlaying);

    if (audio) {
      if (nextPlaying) {
        if (!audio.src && currentStore.currentTrack) {
          const vid = extractVideoId(currentStore.currentTrack);
          if (vid) {
            audio.src = `/api/stream?id=${encodeURIComponent(vid)}`;
            audio.load();
          }
        }
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    }

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = nextPlaying ? 'playing' : 'paused';
    }
  }, [setPlayingStore, initAudioContextKeepAlive]);

  const setPlaying = useCallback(
    (playing: boolean) => {
      initAudioContextKeepAlive();
      setPlayingStore(playing);
      const audio = getPersistentAudioElement();

      if (audio) {
        if (playing) {
          if (!audio.src && usePlayerStore.getState().currentTrack) {
            const vid = extractVideoId(usePlayerStore.getState().currentTrack);
            if (vid) {
              audio.src = `/api/stream?id=${encodeURIComponent(vid)}`;
              audio.load();
            }
          }
          audio.play().catch(() => {});
        } else {
          audio.pause();
        }
      }

      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
      }
    },
    [setPlayingStore, initAudioContextKeepAlive]
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
    try {
      ms.setActionHandler('play', () => {
        mediaActionsRef.current.play();
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
      });
      ms.setActionHandler('pause', () => {
        mediaActionsRef.current.pause();
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused';
        }
      });
      ms.setActionHandler('previoustrack', () => {
        mediaActionsRef.current.prev();
      });
      ms.setActionHandler('nexttrack', () => {
        mediaActionsRef.current.next();
      });
      ms.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined && details.seekTime !== null && !isNaN(details.seekTime)) {
          mediaActionsRef.current.seekTo(details.seekTime);
        }
      });
      ms.setActionHandler('seekbackward', (details) => {
        const skip = details.seekOffset || 10;
        const cur = usePlayerStore.getState().progress;
        mediaActionsRef.current.seekTo(Math.max(0, cur - skip));
      });
      ms.setActionHandler('seekforward', (details) => {
        const skip = details.seekOffset || 10;
        const cur = usePlayerStore.getState().progress;
        const dur = usePlayerStore.getState().duration;
        mediaActionsRef.current.seekTo(Math.min(dur, cur + skip));
      });
      ms.setActionHandler('stop', () => {
        mediaActionsRef.current.pause();
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused';
        }
      });
    } catch {}
  }, []);

  // Sync MediaMetadata with Current Track
  useEffect(() => {
    if (currentTrack && typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      const thumbnail = getHighResImage(
        currentTrack.thumbnails?.[currentTrack.thumbnails.length - 1]?.url,
        800
      );
      const artist = Array.isArray(currentTrack.artist)
        ? currentTrack.artist.map((a) => a.name).join(', ')
        : currentTrack.artist?.name || 'Unknown Artist';

      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.name,
          artist,
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
      } catch {}
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
