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
import dynamic from 'next/dynamic';
import { usePlayerStore, Track, extractVideoId } from '@/lib/store';
import { useHotkeys } from '@/hooks/useHotkeys';
import { db } from '@/lib/db';
import { toast } from '@/lib/toast';
import { getHighResImage } from '@/lib/utils';

// Client-only dynamic import of react-youtube to ensure 100% SSR safety
const YouTube = dynamic(() => import('react-youtube'), {
  ssr: false,
});

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

const LIKED_STORAGE_KEY = 'spotify_liked_tracks';

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

  // =========================================================================
  // 1. YouTube Player References & State Machine via react-youtube
  // =========================================================================
  const playerRef = useRef<any>(null);
  const isPlayerReadyRef = useRef<boolean>(false);
  const loadedTrackIdRef = useRef<string | null>(null);
  const isSeekingLockRef = useRef<boolean>(false);
  const seekCooldownTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const consecutiveFailuresRef = useRef<number>(0);
  const stallRecoveryCountRef = useRef<number>(0);
  const bufferingWatchdogRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const fallbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const isFallbackActiveRef = useRef<boolean>(false);
  const [isFallbackActive, setIsFallbackActive] = useState<boolean>(false);
  const lastProgressRef = useRef<number>(-1);
  const lastMediaSessionUpdateRef = useRef<number>(0);

  const setFallbackActive = useCallback((active: boolean) => {
    isFallbackActiveRef.current = active;
    setIsFallbackActive(active);
  }, []);

  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [prevVolume, setPrevVolume] = useState<number>(100);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 1A. Hardware Audio Focus Keep-Alive (prevents mobile background audio ducking)
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

  // 1B. Declare W3C AudioSession 'playback' mode for mobile media focus
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
      try {
        (navigator as any).audioSession.type = 'playback';
      } catch {}
    }
  }, []);

  // Forward declarations for player event handlers
  const handlePlayerEndedRef = useRef<() => void>(() => {});
  const handlePlayerErrorRef = useRef<(code: number) => void>(() => {});
  const handleStreamStalledRef = useRef<() => void>(() => {});

  // =========================================================================
  // 2. Playback Control Wrappers & Event Handlers
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

  const playPrev = useCallback(() => {
    initAudioContextKeepAlive();
    setPlayingStore(true);
    setIsBuffering(true);
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
    playPrevStore();
  }, [playPrevStore, setPlayingStore, setIsBuffering, initAudioContextKeepAlive]);

  const playTrack = useCallback(
    (track: any, queue?: any[], context?: 'playlist' | 'similar', forceIndex?: number) => {
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

      // Reset any active fallback audio element
      if (fallbackAudioRef.current) {
        try {
          fallbackAudioRef.current.pause();
          fallbackAudioRef.current.src = '';
        } catch {}
      }
      setFallbackActive(false);

      // If track is from iTunes fallback (e.g. itunes:12345), resolve real YouTube ID asynchronously
      if (targetVideoId.startsWith('itunes:')) {
        fetch(`/api/stream?id=${encodeURIComponent(targetVideoId)}&json=true`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.success && data.videoId && !data.videoId.startsWith('itunes:')) {
              const updatedTrack = {
                ...track,
                videoId: data.videoId,
                youtubeId: data.videoId,
              };
              const player = playerRef.current;
              if (player && isPlayerReadyRef.current) {
                loadedTrackIdRef.current = data.videoId;
                try {
                  player.loadVideoById(data.videoId);
                  player.playVideo();
                } catch {}
              }
              playTrackStore(updatedTrack, queue, context, forceIndex);
            } else if (data?.streamUrl && fallbackAudioRef.current) {
              setFallbackActive(true);
              fallbackAudioRef.current.src = data.streamUrl;
              fallbackAudioRef.current.play().catch(() => {});
              playTrackStore(track, queue, context, forceIndex);
            }
          })
          .catch((e) => {
            console.warn('[MusicContext] iTunes to YouTube resolution error:', e);
          });
        return;
      }

      // Direct Client-Side YouTube Control: Load ID directly into react-youtube instance
      const player = playerRef.current;
      if (player && isPlayerReadyRef.current) {
        try {
          loadedTrackIdRef.current = targetVideoId;
          isSeekingLockRef.current = false;
          stallRecoveryCountRef.current = 0;
          player.loadVideoById(targetVideoId);
          player.playVideo();
        } catch (e) {
          console.warn('Direct react-youtube play error:', e);
        }
      }

      playTrackStore(track, queue, context, forceIndex);
    },
    [playTrackStore, setPlayingStore, setIsBuffering, initAudioContextKeepAlive]
  );

  const playQueueIndex = useCallback(
    (index: number) => {
      initAudioContextKeepAlive();
      setPlayingStore(true);
      setIsBuffering(true);

      if (fallbackAudioRef.current) {
        try {
          fallbackAudioRef.current.pause();
          fallbackAudioRef.current.src = '';
        } catch {}
      }
      setFallbackActive(false);

      const targetTrack = usePlayerStore.getState().queue[index];
      if (targetTrack) {
        const targetVid = extractVideoId(targetTrack);
        if (targetVid?.startsWith('itunes:')) {
          fetch(`/api/stream?id=${encodeURIComponent(targetVid)}&json=true`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (data?.success && data.videoId && !data.videoId.startsWith('itunes:')) {
                const player = playerRef.current;
                if (player && isPlayerReadyRef.current) {
                  loadedTrackIdRef.current = data.videoId;
                  try {
                    player.loadVideoById(data.videoId);
                    player.playVideo();
                  } catch {}
                }
              } else if (data?.streamUrl && fallbackAudioRef.current) {
                setFallbackActive(true);
                fallbackAudioRef.current.src = data.streamUrl;
                fallbackAudioRef.current.play().catch(() => {});
              }
            })
            .catch(() => {});
        } else if (targetVid && playerRef.current && isPlayerReadyRef.current) {
          try {
            loadedTrackIdRef.current = targetVid;
            isSeekingLockRef.current = false;
            stallRecoveryCountRef.current = 0;
            playerRef.current.loadVideoById(targetVid);
            playerRef.current.playVideo();
          } catch {}
        }
      }

      playQueueIndexStore(index);
    },
    [playQueueIndexStore, setPlayingStore, setIsBuffering, initAudioContextKeepAlive]
  );

  const togglePlay = useCallback(() => {
    initAudioContextKeepAlive();
    const currentStore = usePlayerStore.getState();
    const nextPlaying = !currentStore.isPlaying;
    setPlayingStore(nextPlaying);

    if (isFallbackActiveRef.current && fallbackAudioRef.current) {
      if (nextPlaying) {
        fallbackAudioRef.current.play().catch(() => {});
      } else {
        fallbackAudioRef.current.pause();
      }
    }

    const player = playerRef.current;
    if (player && isPlayerReadyRef.current) {
      try {
        if (nextPlaying) {
          player.playVideo();
        } else {
          player.pauseVideo();
        }
      } catch (err) {
        console.warn('Error toggling play/pause on react-youtube player:', err);
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

      if (isFallbackActiveRef.current && fallbackAudioRef.current) {
        if (playing) {
          fallbackAudioRef.current.play().catch(() => {});
        } else {
          fallbackAudioRef.current.pause();
        }
      }

      const player = playerRef.current;
      if (player && isPlayerReadyRef.current) {
        try {
          if (playing) {
            player.playVideo();
          } else {
            player.pauseVideo();
          }
        } catch (err) {
          console.warn('Error setting playing state on react-youtube player:', err);
        }
      }

      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
      }
    },
    [setPlayingStore, initAudioContextKeepAlive]
  );

  // Flawless Seek Operation directly manipulating react-youtube player instance
  const seekTo = useCallback(
    (time: number) => {
      const player = playerRef.current;
      const currentDur = usePlayerStore.getState().duration;
      const clamped = Math.max(0, Math.min(currentDur || 0, time));

      isSeekingLockRef.current = true;
      setProgress(clamped);

      if (isFallbackActiveRef.current && fallbackAudioRef.current) {
        fallbackAudioRef.current.currentTime = clamped;
        if (usePlayerStore.getState().isPlaying) {
          fallbackAudioRef.current.play().catch(() => {});
        }
      }

      if (player && isPlayerReadyRef.current) {
        try {
          player.seekTo(clamped, true);
          if (usePlayerStore.getState().isPlaying) {
            player.playVideo();
          }
        } catch (err) {
          console.warn('react-youtube seek error:', err);
        }
      }

      if (seekCooldownTimeoutRef.current) clearTimeout(seekCooldownTimeoutRef.current);
      seekCooldownTimeoutRef.current = setTimeout(() => {
        isSeekingLockRef.current = false;
      }, 1000);
    },
    [setProgress]
  );

  // Volume & Mute Handlers
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (fallbackAudioRef.current) {
        fallbackAudioRef.current.muted = next;
      }
      const player = playerRef.current;
      if (player && isPlayerReadyRef.current) {
        try {
          if (next) {
            player.mute();
          } else {
            player.unMute();
            player.setVolume(prevVolume || 80);
          }
        } catch {}
      }
      return next;
    });
  }, [prevVolume]);

  const setVolume = useCallback(
    (vol: number) => {
      if (vol > 0 && isMuted) {
        setIsMuted(false);
      }
      setPrevVolume(vol);
      setVolumeStore(vol);

      if (fallbackAudioRef.current) {
        fallbackAudioRef.current.volume = Math.max(0, Math.min(1, vol / 100));
      }

      const player = playerRef.current;
      if (player && isPlayerReadyRef.current) {
        try {
          player.unMute();
          player.setVolume(Math.max(0, Math.min(100, vol)));
        } catch {}
      }
    },
    [isMuted, setVolumeStore]
  );

  // Attach Ended, Error & Stream Stalled Watchdogs
  useEffect(() => {
    handlePlayerEndedRef.current = () => {
      const { repeatMode } = usePlayerStore.getState();
      const player = playerRef.current;

      if (repeatMode === 'one' && player && isPlayerReadyRef.current) {
        try {
          player.seekTo(0, true);
          player.playVideo();
        } catch {
          playNext();
        }
      } else {
        playNext();
      }
    };

    handleStreamStalledRef.current = () => {
      const player = playerRef.current;
      if (!player || !isPlayerReadyRef.current) return;

      try {
        const stateRes = player.getPlayerState?.();
        const checkState = (state: number) => {
          // 3 = BUFFERING, -1 = UNSTARTED
          if (state === 3 || state === -1) {
            if (stallRecoveryCountRef.current < 1) {
              stallRecoveryCountRef.current++;
              toast.info('Menyambungkan ulang audio stream...');
              player.seekTo(0, true);
              player.playVideo();
              return;
            }

            stallRecoveryCountRef.current = 0;
            toast.info('Koneksi audio YouTube macet, memutar lagu berikutnya...');
            playNext();
          }
        };

        if (stateRes && typeof stateRes.then === 'function') {
          stateRes.then(checkState).catch(() => {});
        } else if (typeof stateRes === 'number') {
          checkState(stateRes);
        }
      } catch {}
    };

    handlePlayerErrorRef.current = (code: number) => {
      console.warn('react-youtube player error code received:', code);

      if (consecutiveFailuresRef.current >= 3) {
        toast.error('Gagal memutar beberapa lagu. Pemutaran dihentikan agar tidak terjadi perulangan.');
        setPlayingStore(false);
        setIsBuffering(false);
        consecutiveFailuresRef.current = 0;
        return;
      }

      consecutiveFailuresRef.current++;

      if (code === 101 || code === 150) {
        // Embed playback disabled by YouTube / content owner
        // Seamlessly switch to backend yt-dlp audio stream without dropping playback
        const curVid = loadedTrackIdRef.current || extractVideoId(usePlayerStore.getState().currentTrack);
        if (curVid && fallbackAudioRef.current) {
          toast.info('Lagu dibatasi oleh YouTube, memutar via audio stream backend...');
          setFallbackActive(true);
          fallbackAudioRef.current.src = `/api/stream?id=${encodeURIComponent(curVid)}`;
          fallbackAudioRef.current.load();
          fallbackAudioRef.current
            .play()
            .then(() => {
              consecutiveFailuresRef.current = 0;
            })
            .catch((err) => {
              console.warn('[MusicContext] Fallback audio playback failed:', err);
              playNext();
            });
          return;
        }
        toast.info('Lagu ini dibatasi oleh YouTube untuk pemutar sematan, memutar lagu berikutnya...');
      } else if (code === 100) {
        toast.info('Lagu tidak ditemukan atau telah dihapus, memutar lagu berikutnya...');
      } else if (code === 2) {
        toast.info('ID lagu tidak valid, memutar lagu berikutnya...');
      } else {
        toast.info('Tidak dapat memutar lagu, memutar lagu berikutnya...');
      }

      playNext();
    };
  }, [playNext, setPlayingStore, setIsBuffering]);

  // =========================================================================
  // 3. Track Synchronization (Load new track into react-youtube player)
  // =========================================================================
  const currentVideoId = extractVideoId(currentTrack);

  useEffect(() => {
    if (!currentVideoId) {
      loadedTrackIdRef.current = null;
      if (isPlayerReadyRef.current && playerRef.current?.stopVideo) {
        try {
          playerRef.current.stopVideo();
        } catch {}
      }
      return;
    }

    if (loadedTrackIdRef.current === currentVideoId) {
      return;
    }

    if (fallbackAudioRef.current) {
      try {
        fallbackAudioRef.current.pause();
        fallbackAudioRef.current.src = '';
      } catch {}
    }
    setFallbackActive(false);

    loadedTrackIdRef.current = currentVideoId;
    isSeekingLockRef.current = false;
    stallRecoveryCountRef.current = 0;
    setIsBuffering(true);

    const player = playerRef.current;
    if (player && isPlayerReadyRef.current) {
      try {
        if (usePlayerStore.getState().isPlaying) {
          player.loadVideoById(currentVideoId);
        } else {
          player.cueVideoById(currentVideoId);
        }
      } catch (err) {
        console.warn('Error synchronizing track to react-youtube player:', err);
      }
    }
  }, [currentVideoId, setIsBuffering]);

  // =========================================================================
  // 4. Play/Pause State Watchdog
  // =========================================================================
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isPlayerReadyRef.current) return;

    try {
      if (isPlaying) {
        player.playVideo();
      } else {
        player.pauseVideo();
      }
    } catch {}
  }, [isPlaying]);

  // =========================================================================
  // 5. Volume & Mute State Watchdog
  // =========================================================================
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isPlayerReadyRef.current) return;

    try {
      if (isMuted) {
        player.mute();
      } else {
        player.unMute();
        player.setVolume(Math.max(0, Math.min(100, volume)));
      }
    } catch {}
  }, [volume, isMuted]);

  // =========================================================================
  // 6. High-Precision Progress & Duration Polling (250ms)
  // =========================================================================
  // 6. Audio Progress Polling & Synchronization (Throttled for High Performance)
  // =========================================================================
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || !isPlayerReadyRef.current) return;

      try {
        if (typeof player.getCurrentTime === 'function') {
          const curRes = player.getCurrentTime();
          const handleCurTime = (cur: number) => {
            if (typeof cur === 'number' && !isNaN(cur) && !isSeekingLockRef.current) {
              // Throttle: only update state if delta >= 0.25s or when starting/resuming
              if (Math.abs(cur - lastProgressRef.current) >= 0.25 || lastProgressRef.current < 0) {
                lastProgressRef.current = cur;
                setProgress(cur);
              }

              // Throttle MediaSession position updates to once every 1.5 seconds to eliminate IPC lag
              const now = Date.now();
              if (now - lastMediaSessionUpdateRef.current >= 1500) {
                lastMediaSessionUpdateRef.current = now;
                const dur = usePlayerStore.getState().duration;
                if (
                  typeof navigator !== 'undefined' &&
                  'mediaSession' in navigator &&
                  'setPositionState' in navigator.mediaSession &&
                  dur &&
                  dur > 0
                ) {
                  try {
                    navigator.mediaSession.setPositionState({
                      duration: dur,
                      playbackRate: 1,
                      position: Math.min(dur, cur),
                    });
                  } catch {}
                }
              }
            }
          };

          if (curRes && typeof curRes.then === 'function') {
            curRes.then(handleCurTime).catch(() => {});
          } else if (typeof curRes === 'number') {
            handleCurTime(curRes);
          }
        }

        if (typeof player.getDuration === 'function') {
          const durRes = player.getDuration();
          const handleDur = (dur: number) => {
            if (typeof dur === 'number' && dur > 0 && Math.abs(dur - usePlayerStore.getState().duration) > 0.5) {
              setDuration(dur);
            }
          };

          if (durRes && typeof durRes.then === 'function') {
            durRes.then(handleDur).catch(() => {});
          } else if (typeof durRes === 'number') {
            handleDur(durRes);
          }
        }
      } catch {}
    }, 250);

    return () => clearInterval(interval);
  }, [isPlaying, setProgress, setDuration]);

  // =========================================================================
  // 7. MediaSession API (Lockscreen, Notification Shade, Headset Controls)
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
      play: () => togglePlay(),
      pause: () => setPlaying(false),
      next: () => playNext(),
      prev: () => playPrev(),
      seekTo: (time: number) => seekTo(time),
    };
  }, [togglePlay, setPlaying, playNext, playPrev, seekTo]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const ms = navigator.mediaSession;
    try {
      ms.setActionHandler('play', () => mediaActionsRef.current.play());
      ms.setActionHandler('pause', () => mediaActionsRef.current.pause());
      ms.setActionHandler('previoustrack', () => mediaActionsRef.current.prev());
      ms.setActionHandler('nexttrack', () => mediaActionsRef.current.next());
      ms.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined && details.seekTime !== null) {
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
      ms.setActionHandler('stop', () => mediaActionsRef.current.pause());
    } catch (e) {
      console.warn('MediaSession handler registration error:', e);
    }
  }, []);

  // Update MediaMetadata
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
          album: 'Spotify',
          artwork: [
            { src: thumbnail, sizes: '96x96', type: 'image/jpeg' },
            { src: thumbnail, sizes: '128x128', type: 'image/jpeg' },
            { src: thumbnail, sizes: '192x192', type: 'image/jpeg' },
            { src: thumbnail, sizes: '256x256', type: 'image/jpeg' },
            { src: thumbnail, sizes: '384x384', type: 'image/jpeg' },
            { src: thumbnail, sizes: '512x512', type: 'image/jpeg' },
          ],
        });
      } catch (e) {
        console.warn('MediaMetadata configuration error:', e);
      }
    }
  }, [currentTrack]);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

  // Screen WakeLock
  useEffect(() => {
    let wakeLock: any = null;

    const requestLock = async () => {
      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && isPlaying) {
        try {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        } catch {}
      }
    };

    if (isPlaying) requestLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isPlaying) {
        requestLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
      }
    };
  }, [isPlaying]);

  // =========================================================================
  // 8. Persistent Liked Songs (localStorage + IndexedDB)
  // =========================================================================
  const [likedSongs, setLikedSongs] = useState<Track[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(LIKED_STORAGE_KEY);
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    return [];
  });

  const likedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    likedIdsRef.current = new Set(likedSongs.map((t) => t.videoId));
  }, [likedSongs]);

  useEffect(() => {
    let active = true;
    db.getLikedSongs().then((idbTracks) => {
      if (!active || !idbTracks || idbTracks.length === 0) return;
      setLikedSongs((current) => {
        const map = new Map<string, Track>();
        idbTracks.forEach((t) => map.set(t.videoId, t));
        current.forEach((t) => map.set(t.videoId, t));
        const merged = Array.from(map.values());
        try {
          localStorage.setItem(LIKED_STORAGE_KEY, JSON.stringify(merged));
        } catch {}
        return merged;
      });
    });
    return () => {
      active = false;
    };
  }, []);

  const isLiked = useCallback((videoId: string) => {
    return likedIdsRef.current.has(videoId);
  }, []);

  const toggleLike = useCallback(
    async (track: Track): Promise<boolean> => {
      if (!track?.videoId) return false;
      const alreadyLiked = likedIdsRef.current.has(track.videoId);

      setLikedSongs((prev) => {
        const next = alreadyLiked
          ? prev.filter((t) => t.videoId !== track.videoId)
          : [track, ...prev];
        try {
          localStorage.setItem(LIKED_STORAGE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });

      try {
        if (alreadyLiked) {
          await db.removeLikedSong(track.videoId);
        } else {
          await db.addLikedSong(track);
        }
      } catch (err) {
        console.error('Error syncing like with IndexedDB:', err);
      }

      return !alreadyLiked;
    },
    []
  );

  // =========================================================================
  // 9. Global Keyboard Shortcuts
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

  // =========================================================================
  // 10. react-youtube Player Configuration (Hidden height: '0', width: '0')
  // =========================================================================
  const youtubeOpts = useMemo(
    () => ({
      height: '0',
      width: '0',
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        enablejsapi: 1,
        iv_load_policy: 3,
      },
    }),
    []
  );

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
      {/* 
        Hidden YouTube Player powered by react-youtube:
        Rendered with height: '0', width: '0' in an off-screen container.
        Plays music continuously in the background across all page navigations.
      */}
      <div
        id="react-youtube-hidden-container"
        aria-hidden="true"
        style={{
          position: 'fixed',
          bottom: 0,
          right: 0,
          width: 0,
          height: 0,
          opacity: 0,
          pointerEvents: 'none',
          zIndex: -9999,
          overflow: 'hidden',
        }}
      >
        {isMounted && currentVideoId && (
          <YouTube
            videoId={currentVideoId}
            id="react-youtube-player-iframe"
            opts={youtubeOpts}
            onReady={(event: any) => {
              playerRef.current = event.target;
              isPlayerReadyRef.current = true;
              loadedTrackIdRef.current = currentVideoId;
              const storeState = usePlayerStore.getState();

              try {
                event.target.setVolume(storeState.volume);
                if (isMuted) {
                  event.target.mute();
                } else {
                  event.target.unMute();
                }
                if (storeState.isPlaying) {
                  event.target.playVideo();
                } else {
                  event.target.pauseVideo();
                }
              } catch (e) {
                console.warn('react-youtube onReady error:', e);
              }
            }}
            onStateChange={(event: any) => {
              const state = event.data;
              if (bufferingWatchdogRef.current) {
                clearTimeout(bufferingWatchdogRef.current);
                bufferingWatchdogRef.current = null;
              }

              // 1: PLAYING
              if (state === 1) {
                setIsBuffering(false);
                consecutiveFailuresRef.current = 0;
                stallRecoveryCountRef.current = 0;
                if (!usePlayerStore.getState().isPlaying) {
                  setPlayingStore(true);
                }
                if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
                  navigator.mediaSession.playbackState = 'playing';
                }
                try {
                  const durRes = event.target.getDuration();
                  if (durRes && typeof durRes.then === 'function') {
                    durRes
                      .then((dur: number) => {
                        if (typeof dur === 'number' && dur > 0) setDuration(dur);
                      })
                      .catch(() => {});
                  } else if (typeof durRes === 'number' && durRes > 0) {
                    setDuration(durRes);
                  }
                } catch {}
              }
              // 2: PAUSED
              else if (state === 2) {
                setIsBuffering(false);
                if (!isSeekingLockRef.current) {
                  if (usePlayerStore.getState().isPlaying) {
                    setPlayingStore(false);
                  }
                  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
                    navigator.mediaSession.playbackState = 'paused';
                  }
                }
              }
              // 3: BUFFERING
              else if (state === 3) {
                setIsBuffering(true);
                bufferingWatchdogRef.current = setTimeout(() => {
                  handleStreamStalledRef.current();
                }, 10000);
              }
              // 0: ENDED
              else if (state === 0) {
                setIsBuffering(false);
                handlePlayerEndedRef.current();
              }
            }}
            onError={(event: any) => {
              setIsBuffering(false);
              if (bufferingWatchdogRef.current) {
                clearTimeout(bufferingWatchdogRef.current);
                bufferingWatchdogRef.current = null;
              }
              handlePlayerErrorRef.current(event.data);
            }}
          />
        )}
      </div>
      <audio
        ref={fallbackAudioRef}
        className="hidden"
        preload="metadata"
        onTimeUpdate={() => {
          if (isFallbackActive && fallbackAudioRef.current && !isSeekingLockRef.current) {
            const cur = fallbackAudioRef.current.currentTime;
            if (Math.abs(cur - lastProgressRef.current) >= 0.25 || lastProgressRef.current < 0) {
              lastProgressRef.current = cur;
              setProgress(cur);
            }
          }
        }}
        onDurationChange={() => {
          if (isFallbackActive && fallbackAudioRef.current && fallbackAudioRef.current.duration) {
            setDuration(fallbackAudioRef.current.duration);
          }
        }}
        onPlay={() => {
          if (isFallbackActive) {
            setPlayingStore(true);
            setIsBuffering(false);
          }
        }}
        onPause={() => {
          if (isFallbackActive) {
            setPlayingStore(false);
          }
        }}
        onWaiting={() => {
          if (isFallbackActive) {
            setIsBuffering(true);
          }
        }}
        onPlaying={() => {
          if (isFallbackActive) {
            setIsBuffering(false);
          }
        }}
        onEnded={() => {
          if (isFallbackActive) {
            setIsBuffering(false);
            handlePlayerEndedRef.current();
          }
        }}
        onError={() => {
          if (isFallbackActive) {
            console.warn('[MusicContext] Audio stream fallback element error, skipping to next track...');
            setIsFallbackActive(false);
            playNext();
          }
        }}
      />
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
