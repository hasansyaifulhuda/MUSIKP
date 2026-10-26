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

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

/**
 * Loads the official YouTube IFrame Player API script in the browser.
 * Guarantees singleton script injection and promise-based readiness with polling fallback.
 */
function loadYouTubeIframeApi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return;

    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }

    const pollInterval = setInterval(() => {
      if (window.YT && window.YT.Player) {
        clearInterval(pollInterval);
        resolve();
      }
    }, 50);

    setTimeout(() => {
      clearInterval(pollInterval);
    }, 10000);

    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevCallback === 'function') {
        try {
          prevCallback();
        } catch {}
      }
      clearInterval(pollInterval);
      resolve();
    };

    if (!document.getElementById('youtube-iframe-api-script')) {
      const tag = document.createElement('script');
      tag.id = 'youtube-iframe-api-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }
    }
  });
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
  // 1. YouTube IFrame Player References & State Machine
  // =========================================================================
  const playerRef = useRef<any>(null);
  const portalContainerRef = useRef<HTMLDivElement>(null);
  const isPlayerReadyRef = useRef<boolean>(false);
  const loadedTrackIdRef = useRef<string | null>(null);
  const pendingVideoIdRef = useRef<string | null>(null);
  const pendingAutoPlayRef = useRef<boolean>(true);
  const isSeekingLockRef = useRef<boolean>(false);
  const seekCooldownTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const consecutiveFailuresRef = useRef<number>(0);
  const stallRecoveryCountRef = useRef<number>(0);
  const bufferingWatchdogRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(100);

  // 1A. Hardware Audio Focus Keep-Alive (protects against iOS/Android background audio ducking)
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

  // 1C. Initialize YouTube IFrame Player Instance (singleton on mount)
  useEffect(() => {
    let isCancelled = false;

    loadYouTubeIframeApi().then(() => {
      if (isCancelled) return;

      const container = portalContainerRef.current;
      if (!container || !window.YT || !window.YT.Player) return;

      // Check if existing player iframe is still connected to the DOM
      if (playerRef.current) {
        try {
          const iframe = typeof playerRef.current.getIframe === 'function' ? playerRef.current.getIframe() : null;
          if (iframe && document.body.contains(iframe)) {
            return;
          }
        } catch {}
        try {
          playerRef.current.destroy();
        } catch {}
        playerRef.current = null;
        isPlayerReadyRef.current = false;
      }

      try {
        container.innerHTML = '<div id="youtube-hidden-player-mount"></div>';
        const targetVideoId = pendingVideoIdRef.current || extractVideoId(usePlayerStore.getState().currentTrack);

        const playerConfig: any = {
          height: '200',
          width: '200',
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            rel: 0,
            modestbranding: 1,
            playsinline: 1, // Crucial for iOS / Android mobile browsers
            enablejsapi: 1,
            iv_load_policy: 3,
            origin: typeof window !== 'undefined' && window.location.origin ? window.location.origin : undefined,
          },
          events: {
            onReady: (event: any) => {
              isPlayerReadyRef.current = true;
              const storeState = usePlayerStore.getState();

              // Sync initial volume
              try {
                event.target.setVolume(storeState.volume);
                if (isMuted) {
                  event.target.mute();
                } else {
                  event.target.unMute();
                }
              } catch {}

              // If a track was queued before onReady
              const vidToLoad = pendingVideoIdRef.current || extractVideoId(storeState.currentTrack);
              if (vidToLoad) {
                loadedTrackIdRef.current = vidToLoad;
                pendingVideoIdRef.current = null;
                try {
                  event.target.loadVideoById({ videoId: vidToLoad, startSeconds: 0 });
                  if (storeState.isPlaying || pendingAutoPlayRef.current) {
                    event.target.playVideo();
                  } else {
                    event.target.pauseVideo();
                  }
                } catch (e) {
                  console.warn('Error loading video on player ready:', e);
                }
              }
            },
            onStateChange: (event: any) => {
              const state = event.data;
              const YTState = window.YT.PlayerState;

              // Clear watchdog timer whenever state updates
              if (bufferingWatchdogRef.current) {
                clearTimeout(bufferingWatchdogRef.current);
                bufferingWatchdogRef.current = null;
              }

              if (state === YTState.PLAYING) {
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
                  const dur = event.target.getDuration();
                  if (typeof dur === 'number' && dur > 0) {
                    setDuration(dur);
                  }
                } catch {}
              } else if (state === YTState.PAUSED) {
                setIsBuffering(false);
                if (!isSeekingLockRef.current) {
                  if (usePlayerStore.getState().isPlaying) {
                    setPlayingStore(false);
                  }
                  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
                    navigator.mediaSession.playbackState = 'paused';
                  }
                }
              } else if (state === YTState.BUFFERING) {
                setIsBuffering(true);
                // Watchdog: If buffering exceeds 10s, trigger stream stall recovery
                bufferingWatchdogRef.current = setTimeout(() => {
                  handleStreamStalledRef.current();
                }, 10000);
              } else if (state === YTState.ENDED) {
                setIsBuffering(false);
                handlePlayerEndedRef.current();
              }
            },
            onError: (event: any) => {
              setIsBuffering(false);
              if (bufferingWatchdogRef.current) {
                clearTimeout(bufferingWatchdogRef.current);
                bufferingWatchdogRef.current = null;
              }
              handlePlayerErrorRef.current(event.data);
            },
          },
        };

        if (targetVideoId) {
          playerConfig.videoId = targetVideoId;
        }

        playerRef.current = new window.YT.Player('youtube-hidden-player-mount', playerConfig);
      } catch (err) {
        console.error('Failed to initialize YouTube IFrame Player:', err);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [setPlayingStore, setIsBuffering, setDuration, isMuted]);

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
      setPlayingStore(true);
      setIsBuffering(true);
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
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
      playQueueIndexStore(index);
    },
    [playQueueIndexStore, setPlayingStore, setIsBuffering, initAudioContextKeepAlive]
  );

  const togglePlay = useCallback(() => {
    initAudioContextKeepAlive();
    const nextPlaying = !usePlayerStore.getState().isPlaying;
    setPlayingStore(nextPlaying);

    const player = playerRef.current;
    if (player && isPlayerReadyRef.current) {
      try {
        if (nextPlaying) {
          player.playVideo();
        } else {
          player.pauseVideo();
        }
      } catch (err) {
        console.warn('Error toggling play/pause on YouTube player:', err);
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

      const player = playerRef.current;
      if (player && isPlayerReadyRef.current) {
        try {
          if (playing) {
            player.playVideo();
          } else {
            player.pauseVideo();
          }
        } catch (err) {
          console.warn('Error setting playing state on YouTube player:', err);
        }
      }

      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
      }
    },
    [setPlayingStore, initAudioContextKeepAlive]
  );

  // Flawless Seek Operation directly manipulating YouTube IFrame API
  const seekTo = useCallback(
    (time: number) => {
      const player = playerRef.current;
      const currentDur = usePlayerStore.getState().duration;
      const clamped = Math.max(0, Math.min(currentDur || 0, time));

      isSeekingLockRef.current = true;
      setProgress(clamped);

      if (player && isPlayerReadyRef.current) {
        try {
          player.seekTo(clamped, true);
          if (usePlayerStore.getState().isPlaying) {
            player.playVideo();
          }
        } catch (err) {
          console.warn('YouTube seek error:', err);
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
        const state = player.getPlayerState?.();
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
      } catch {}
    };

    handlePlayerErrorRef.current = (code: number) => {
      console.warn('YouTube player error code received:', code);

      if (consecutiveFailuresRef.current >= 4) {
        toast.error('Gagal memutar beberapa lagu. Pemutaran dihentikan.');
        setPlayingStore(false);
        setIsBuffering(false);
        consecutiveFailuresRef.current = 0;
        return;
      }

      consecutiveFailuresRef.current++;

      if (code === 101 || code === 150) {
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
  // 3. Track Synchronization (Load new track in YouTube player)
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

    loadedTrackIdRef.current = currentVideoId;
    isSeekingLockRef.current = false;
    stallRecoveryCountRef.current = 0;
    setIsBuffering(true);

    const player = playerRef.current;
    if (player && isPlayerReadyRef.current) {
      try {
        if (usePlayerStore.getState().isPlaying) {
          player.loadVideoById({
            videoId: currentVideoId,
            startSeconds: 0,
          });
        } else {
          player.cueVideoById({
            videoId: currentVideoId,
            startSeconds: 0,
          });
        }
      } catch (err) {
        console.warn('Error loading track into YouTube player:', err);
      }
    } else {
      pendingVideoIdRef.current = currentVideoId;
      pendingAutoPlayRef.current = usePlayerStore.getState().isPlaying;
    }
  }, [currentVideoId, setIsBuffering]);

  // =========================================================================
  // 4. Play/Pause State Watchdog
  // =========================================================================
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isPlayerReadyRef.current) return;

    try {
      const state = player.getPlayerState?.();
      if (isPlaying) {
        if (state !== 1 && state !== 3) {
          player.playVideo();
        }
      } else {
        if (state === 1 || state === 3) {
          player.pauseVideo();
        }
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
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || !isPlayerReadyRef.current) return;

      try {
        if (typeof player.getPlayerState === 'function') {
          const state = player.getPlayerState();
          if (state === 1) {
            const dur = player.getDuration?.();
            if (typeof dur === 'number' && dur > 0 && dur !== usePlayerStore.getState().duration) {
              setDuration(dur);
            }

            if (!isSeekingLockRef.current) {
              const cur = player.getCurrentTime?.();
              if (typeof cur === 'number' && !isNaN(cur)) {
                setProgress(cur);

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

  const likedIds = useMemo(() => new Set(likedSongs.map((t) => t.videoId)), [likedSongs]);

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

  const isLiked = useCallback((videoId: string) => likedIds.has(videoId), [likedIds]);

  const toggleLike = useCallback(
    async (track: Track): Promise<boolean> => {
      if (!track?.videoId) return false;
      const alreadyLiked = likedIds.has(track.videoId);

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
    [likedIds]
  );

  // =========================================================================
  // 9. Pintasan Keyboard Global
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
      {/* 
        Ref-isolated portal container for YouTube IFrame Player.
        React will never attempt to reconcile or overwrite the inner iframe created by the YouTube API.
        Positioned at bottom: 0, right: 0 with 200x200 and opacity: 0.005, it remains active in the viewport
        without browser background audio throttling and 100% invisible behind the application UI.
      */}
      <div
        ref={portalContainerRef}
        id="youtube-player-portal"
        aria-hidden="true"
        style={{
          position: 'fixed',
          bottom: 0,
          right: 0,
          width: 200,
          height: 200,
          opacity: 0.005,
          pointerEvents: 'none',
          zIndex: -9999,
          overflow: 'hidden',
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
