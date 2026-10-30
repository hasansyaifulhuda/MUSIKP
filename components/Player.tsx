'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { usePlayerStore, Track } from '@/lib/store';
import { db } from '@/lib/db';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Heart,
  ChevronDown,
  ListMusic,
  Mic2,
  Shuffle,
  Repeat,
  Repeat1,
  Maximize2,
  Minimize2,
  ListPlus,
  Volume2,
  VolumeX,
  Volume1,
  Download,
  Check,
  Disc3,
  Trash2,
  Sparkles,
  RotateCcw,
  Loader2,
  Moon,
  SlidersHorizontal,
  ChevronUp,
  ExternalLink,
  MoreVertical,
} from 'lucide-react';
import { cn, getHighResImage } from '@/lib/utils';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { MarqueeText } from './MarqueeText';
import { toast } from '@/lib/toast';
import { LyricLine, normalizeLyrics } from '@/lib/performance';
import { lyricsWorkerClient } from '@/lib/lyricsWorkerClient';
import {
  getFastCachedLyrics,
  getDeepCachedLyrics,
  saveAllCachedLyrics,
  clearAllCachedLyrics,
} from '@/lib/lyricsCache';
import { useLyricsOffsetStore } from '@/lib/lyricsOffsetStore';
import { autoCalibrateSilenceOffset } from '@/lib/smartLyricsSync';
import { useMusic } from '@/context/MusicContext';
import dynamic from 'next/dynamic';

const AudioVisualizer = dynamic(
  () => import('./AudioVisualizer').then((mod) => mod.AudioVisualizer),
  { ssr: false }
);

const FullScreenLyrics = dynamic(
  () => import('./FullScreenLyrics').then((mod) => mod.FullScreenLyrics),
  { ssr: false }
);
import { FloatingLyricsPill } from './FloatingLyricsPill';
import { useSleepTimerStore } from '@/lib/sleepTimerStore';
import { useEqualizerStore } from '@/lib/audioEffects';
import { useFloatingWidgetStore } from '@/lib/floatingWidgetStore';
import { deduplicatedFetch } from '@/lib/clientDeduplication';
import {
  MiniPlayerProgressBar,
  DesktopScrubber,
  ExpandedScrubber,
  LyricsViewContainer,
} from './PlayerScrubber';
import { ComponentErrorBoundary } from './ComponentErrorBoundary';

export function Player() {
  const router = useRouter();

  // Zustand Store State
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const isBuffering = usePlayerStore((state) => state.isBuffering);
  const isExpanded = usePlayerStore((state) => state.isExpanded);
  const duration = usePlayerStore((state) => state.duration);
  const volume = usePlayerStore((state) => state.volume);
  const queue = usePlayerStore((state) => state.queue);
  const queueIndex = usePlayerStore((state) => state.queueIndex);
  const isShuffle = usePlayerStore((state) => state.isShuffle);
  const repeatMode = usePlayerStore((state) => state.repeatMode);
  const dominantColor = usePlayerStore((state) => state.dominantColor);

  // UI State
  const setExpanded = usePlayerStore((state) => state.setExpanded);
  const removeFromQueue = usePlayerStore((state) => state.removeFromQueue);
  const setTrackToAdd = usePlayerStore((state) => state.setTrackToAdd);

  // Sleep Timer & Equalizer Store State
  const isSleepTimerActive = useSleepTimerStore((state) => state.isActive);
  const openSleepTimerModal = useSleepTimerStore((state) => state.openModal);
  const isEqualizerEnabled = useEqualizerStore((state) => state.isEnabled);
  const openEqualizerModal = useEqualizerStore((state) => state.openModal);

  // Floating Widget & Full-Screen Lyrics State (Batch 2)
  const openFloatingWidget = useFloatingWidgetStore((state) => state.openWidget);
  const [isFullScreenLyricsOpen, setIsFullScreenLyricsOpen] = useState(false);

  // Music Context (Interruption-Aware Playback, Audio Focus, Seek, Volume & Liked Songs)
  const {
    togglePlay,
    setPlaying,
    playNext,
    playPrev,
    playQueueIndex,
    moveQueueItem,
    toggleShuffle,
    toggleRepeat,
    clearQueue,
    isLiked: checkLiked,
    toggleLike,
    seekTo,
    isMuted,
    toggleMute,
    setVolume,
  } = useMusic();
  const isLiked = currentTrack ? checkLiked(currentTrack.videoId) : false;

  // Local Component State
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [activeView, setActiveView] = useState<'cover' | 'lyrics' | 'queue'>('cover');
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [isSyncedLyrics, setIsSyncedLyrics] = useState(false);
  const [isLyricsLoading, setIsLyricsLoading] = useState(false);
  const [lyricsSearchPass, setLyricsSearchPass] = useState(1);
  const [isMobileUtilityMenuOpen, setIsMobileUtilityMenuOpen] = useState(false);

  // Auto-close mobile utility dropdown when player is collapsed
  useEffect(() => {
    if (!isExpanded) {
      setIsMobileUtilityMenuOpen(false);
    }
  }, [isExpanded]);

  // 1. Check Offline Status for active track
  useEffect(() => {
    let active = true;
    if (currentTrack?.videoId) {
      db.getOfflineTrack(currentTrack.videoId).then((offlineItem) => {
        if (active) {
          setIsDownloaded(Boolean(offlineItem && offlineItem.blob));
        }
      });
    } else {
      setIsDownloaded(false);
    }
    // Prevent infinite spinning if user changed track during download
    setIsDownloading(false);
    return () => {
      active = false;
    };
  }, [currentTrack?.videoId]);

  const currentVideoId = currentTrack?.videoId;
  const currentTrackName = currentTrack?.name;
  const currentArtistName = useMemo(() => {
    if (!currentTrack) return '';
    if (typeof (currentTrack as any).artistName === 'string') {
      return (currentTrack as any).artistName;
    }
    const rawArtist = currentTrack.artist;
    if (typeof rawArtist === 'string') return rawArtist;
    if (Array.isArray(rawArtist)) {
      return rawArtist
        .map((a: any) => (typeof a === 'string' ? a : a?.name || ''))
        .filter(Boolean)
        .join(', ');
    }
    if (typeof rawArtist === 'object' && rawArtist !== null) {
      return (rawArtist as any).name || '';
    }
    return '';
  }, [currentTrack]);
  const currentTrackDuration = currentTrack?.duration;

  const [lyricsRetryCount, setLyricsRetryCount] = useState(0);

  // Listen to manual lyrics retry/reload events from LyricsView & FullScreenLyrics
  useEffect(() => {
    const handleReload = () => {
      if (currentVideoId) {
        clearAllCachedLyrics(currentVideoId).catch(() => {});
      }
      setLyricsRetryCount((prev) => prev + 1);
    };
    window.addEventListener('musicfy:reload-lyrics', handleReload);
    window.addEventListener('pmusic:reload-lyrics', handleReload);
    return () => {
      window.removeEventListener('musicfy:reload-lyrics', handleReload);
      window.removeEventListener('pmusic:reload-lyrics', handleReload);
    };
  }, [currentVideoId]);

  // 2. Fetch Synchronized Lyrics (Multi-Tier Caching + Cascading 5-Pass Auto-Search)
  useEffect(() => {
    if (!currentVideoId) {
      setLyrics([]);
      setIsSyncedLyrics(false);
      setIsLyricsLoading(false);
      setLyricsSearchPass(1);
      return;
    }

    // 1. TIER 0 & TIER 1: INSTANT SYNCHRONOUS CACHE (In-Memory Map & localStorage)
    // Instant 0ms display on replay or page refresh without spinner or network hit
    if (lyricsRetryCount === 0) {
      const fastHit = getFastCachedLyrics(currentVideoId);
      if (fastHit && Array.isArray(fastHit.lyrics) && fastHit.lyrics.length > 0) {
        setLyrics(fastHit.lyrics);
        setIsSyncedLyrics(Boolean(fastHit.synced));
        setIsLyricsLoading(false);
        setLyricsSearchPass(1);
        return; // Instant 0ms Cache Hit!
      }
    }

    let isCancelled = false;
    setIsLyricsLoading(true);
    setLyricsSearchPass(1);

    const abortController = new AbortController();

    const loadLyricsForCurrentTrack = async () => {
      // 2. TIER 2: ASYNC INDEXEDDB DEEP CACHE (Offline Track + Compressed Metadata Cache)
      if (lyricsRetryCount === 0) {
        try {
          const deepHit = await getDeepCachedLyrics(currentVideoId);
          if (deepHit && Array.isArray(deepHit.lyrics) && deepHit.lyrics.length > 0) {
            if (!isCancelled) {
              setLyrics(deepHit.lyrics);
              setIsSyncedLyrics(Boolean(deepHit.synced));
              setIsLyricsLoading(false);
              setLyricsSearchPass(1);
            }
            return; // Found in IndexedDB!
          }
        } catch {}
      }

      // 3. IF DEVICE IS OFFLINE: Do NOT make a network request to /api/lyrics
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (!isCancelled) {
          setLyrics([]);
          setIsSyncedLyrics(false);
          setIsLyricsLoading(false);
        }
        return;
      }

      // 4. CASCADING 5-PASS AUTOMATIC RETRY SEARCH
      // Automatically iterates through metadata variations and fallback queries (up to 5 passes)
      // until valid synchronized or plain lyrics are found.
      const dur = Math.round(duration || currentTrackDuration || 200);

      // Clean metadata and extract primary artist for targeted passes
      const rawA = currentArtistName || '';
      const primaryArtist = rawA
        .split(/[,&x\/]|(?:\b(?:feat|ft|featuring|x)\b)/i)[0]
        .replace(/\s*-\s*Topic$/i, '')
        .replace(/\s*Official$/i, '')
        .replace(/VEVO$/i, '')
        .trim();

      const rawT = currentTrackName || '';
      // Simplified title stripped of parentheses, brackets, and subtitles
      const simplifiedTitle = rawT
        .replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]/g, '')
        .replace(/^\s*\d{1,3}[\.\-\s]+\s*/, '')
        .replace(/\s*[\|\/].*$/, '')
        .trim();

      const searchPasses = [
        // Pass 1: Standard clean metadata search
        {
          title: rawT,
          artist: rawA,
          force: lyricsRetryCount > 0,
          passNumber: 1,
          timeout: 6000,
        },
        // Pass 2: Primary artist search (eliminates feat / multi-artist 404s on LRCLIB)
        {
          title: rawT,
          artist: primaryArtist || rawA,
          force: false,
          passNumber: 2,
          timeout: 5500,
        },
        // Pass 3: Simplified title without parentheticals or subtitles (e.g. "(OST)", "[Live]", "(From ...)")
        {
          title: simplifiedTitle || rawT,
          artist: primaryArtist || rawA,
          force: false,
          passNumber: 3,
          timeout: 5000,
        },
        // Pass 4: Broad title-only search across LRCLIB with duration matching
        {
          title: simplifiedTitle || rawT,
          artist: '',
          force: false,
          passNumber: 4,
          timeout: 5000,
        },
        // Pass 5: Deep fallback to YouTube Music native transcript & secondary sources with forced cache purge
        {
          title: rawT,
          artist: rawA,
          force: true,
          passNumber: 5,
          timeout: 6500,
        },
      ];

      let foundValidLyrics = false;

      for (const passConfig of searchPasses) {
        if (isCancelled || foundValidLyrics) break;

        if (!isCancelled) {
          setLyricsSearchPass(passConfig.passNumber);
        }

        const passController = new AbortController();
        const passTimer = setTimeout(() => {
          try {
            passController.abort('PASS_TIMEOUT');
          } catch {}
        }, passConfig.timeout);

        try {
          const url = `/api/lyrics?id=${encodeURIComponent(currentVideoId)}&title=${encodeURIComponent(
            passConfig.title
          )}&artist=${encodeURIComponent(passConfig.artist)}&duration=${dur}&pass=${passConfig.passNumber}${
            passConfig.force ? '&force=true' : ''
          }`;

          const response = await fetch(url, { signal: passController.signal });
          clearTimeout(passTimer);

          if (response.ok) {
            const data = await response.json();
            const payload = data?.result !== undefined ? data.result : data;
            if (Array.isArray(payload?.lyrics) && payload.lyrics.length > 0) {
              const cleanLyrics = await lyricsWorkerClient.normalize(payload.lyrics, dur);
              const syncedVal = Boolean(payload.synced);

              if (!isCancelled) {
                setLyrics(cleanLyrics);
                setIsSyncedLyrics(syncedVal);
                foundValidLyrics = true;

                // Auto-calibrate intro silence offset if candidate duration differs slightly from audio duration
                autoCalibrateSilenceOffset(currentVideoId, payload.candidateDuration, dur);

                // Save to all caching tiers (In-Memory Map + LocalStorage + IndexedDB)
                saveAllCachedLyrics(currentVideoId, cleanLyrics, syncedVal, payload.provider).catch(() => {});

                // Update offline track item if already downloaded
                try {
                  const offItem = await db.getOfflineTrack(currentVideoId);
                  if (offItem) {
                    offItem.lyrics = cleanLyrics;
                    offItem.isSyncedLyrics = syncedVal;
                    offItem.synced = syncedVal;
                    await db.saveOfflineTrack(offItem.track, offItem.blob, { lyrics: cleanLyrics, synced: syncedVal });
                  }
                } catch {}

                if (lyricsRetryCount > 0 || passConfig.passNumber > 1) {
                  toast.success(
                    passConfig.passNumber > 1
                      ? `Lirik sinkron ditemukan otomatis (Percobaan ${passConfig.passNumber}/5)`
                      : 'Lirik berhasil ditemukan!'
                  );
                }
              }
              break; // Success! Break pass loop immediately
            }
          }
        } catch {
          clearTimeout(passTimer);
          // Pass failed or timed out: proceed to next fallback pass automatically
        }

        // Brief 250ms pause before attempting next fallback pass
        if (!foundValidLyrics && !isCancelled && passConfig.passNumber < searchPasses.length) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }

      if (!foundValidLyrics && !isCancelled) {
        setLyrics([]);
        setIsSyncedLyrics(false);
        if (lyricsRetryCount > 0) {
          toast.info('Lirik belum tersedia untuk lagu ini setelah 5 percobaan pencarian otomatis.');
        }
      }

      if (!isCancelled) {
        setIsLyricsLoading(false);
      }
    };

    // Execute in background via requestIdleCallback to guarantee zero-lag on UI thread
    const idleId: any =
      typeof window !== 'undefined' && 'requestIdleCallback' in window
        ? (window as any).requestIdleCallback(() => loadLyricsForCurrentTrack(), { timeout: 200 })
        : setTimeout(() => loadLyricsForCurrentTrack(), 16);

    return () => {
      isCancelled = true;
      if (typeof window !== 'undefined' && 'cancelIdleCallback' in window && typeof idleId === 'number') {
        (window as any).cancelIdleCallback(idleId);
      } else if (idleId) {
        clearTimeout(idleId);
      }
      try {
        abortController.abort();
      } catch {}
    };
  }, [currentVideoId, currentTrackName, currentArtistName, currentTrackDuration, duration, lyricsRetryCount]);

  // 3. Toggle Like Song
  const handleLike = useCallback(
    async (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (!currentTrack) return;
      try {
        const nextLiked = await toggleLike(currentTrack);
        if (nextLiked) {
          toast.success('Ditambahkan ke Lagu Disukai');
        } else {
          toast.info('Dihapus dari Lagu Disukai');
        }
      } catch (err) {
        console.error('Like toggle error:', err);
      }
    },
    [currentTrack, toggleLike]
  );

  // 4. Toggle Download for Offline Playback (Audio + Lyrics)
  const handleDownload = useCallback(
    async (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (!currentTrack || isDownloading) return;

      const trackToProcess = currentTrack;
      const isCurrentlyDownloaded = isDownloaded;

      // Always activate loading spinner prior to async operations
      // Prevent download attempts when browser is completely offline
      if (typeof navigator !== 'undefined' && !navigator.onLine && !isCurrentlyDownloaded) {
        toast.error('Gagal mengunduh: Terkendala koneksi server ke sumber audio (Koneksi offline)');
        setIsDownloading(false);
        return;
      }

      try {
        if (isCurrentlyDownloaded) {
          await db.removeOfflineTrack(trackToProcess.videoId);
          setIsDownloaded(false);
          toast.info('Lagu dihapus dari penyimpanan offline');
        } else {
          // Request persistent storage from browser when user initiates an offline download
          if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().then((granted) => {
              if (granted) {
                console.log('Storage will not be cleared except by explicit user action');
              }
            }).catch(() => {});
          }

          toast.info('Mengunduh lagu dan lirik untuk offline...');

          // Prepare lyrics data to save alongside the audio binary
          let lyricsToPersist: LyricLine[] = [];
          let syncedToPersist = false;

          // If current track lyrics are already loaded in player state, reuse them
          if (lyrics.length > 0 && currentVideoId === trackToProcess.videoId) {
            lyricsToPersist = lyrics;
            syncedToPersist = isSyncedLyrics;
          } else {
            const cachedLyrics = getFastCachedLyrics(trackToProcess.videoId);
            if (cachedLyrics && cachedLyrics.lyrics.length > 0) {
              lyricsToPersist = cachedLyrics.lyrics;
              syncedToPersist = cachedLyrics.synced;
            }
          }

          if (lyricsToPersist.length === 0 && typeof navigator !== 'undefined' && navigator.onLine) {
            // Otherwise, fetch lyrics from API with safe timeout
            try {
              const dur = Math.round(duration || trackToProcess.duration || 200);
              const lyricsUrl = `/api/lyrics?id=${encodeURIComponent(trackToProcess.videoId)}&title=${encodeURIComponent(
                trackToProcess.name || ''
              )}&artist=${encodeURIComponent(currentArtistName)}&duration=${dur}`;

              const lyricsController = new AbortController();
              const lyricsTimeout = setTimeout(() => {
                try {
                  lyricsController.abort();
                } catch {}
              }, 4000);

              const res = await fetch(lyricsUrl, { signal: lyricsController.signal });
              clearTimeout(lyricsTimeout);
              if (res.ok) {
                const data = await res.json();
                const payload = data?.result !== undefined ? data.result : data;
                if (Array.isArray(payload?.lyrics) && payload.lyrics.length > 0) {
                  lyricsToPersist = await lyricsWorkerClient.normalize(payload.lyrics, dur);
                  syncedToPersist = Boolean(payload.synced);
                  saveAllCachedLyrics(trackToProcess.videoId, lyricsToPersist, syncedToPersist, payload.provider).catch(() => {});
                  // Update player state if this track is currently active
                  if (currentVideoId === trackToProcess.videoId) {
                    setLyrics(lyricsToPersist);
                    setIsSyncedLyrics(syncedToPersist);
                  }
                }
              }
            } catch (lyricErr) {
              console.warn('[handleDownload] Non-fatal lyrics fetch issue:', lyricErr);
            }
          }

          const result = await db.saveOfflineTrack(trackToProcess, undefined, {
            lyrics: lyricsToPersist,
            isSyncedLyrics: syncedToPersist,
            synced: syncedToPersist,
          });

          if (!result || !result.blob) {
            throw new Error('Gagal menyimpan file audio atau data unduhan tidak lengkap');
          }
          setIsDownloaded(true);
          toast.success(
            lyricsToPersist.length > 0
              ? 'Lagu dan lirik tersimpan untuk offline'
              : 'Lagu tersimpan untuk offline'
          );
        }
      } catch (err: any) {
        console.error('Download toggle error:', err);
        let errMsg = 'Gagal mengunduh: Terkendala koneksi server ke sumber audio';

        const rawMsg = typeof err === 'string' ? err : err?.message || '';
        if (err?.name === 'AbortError' || rawMsg.includes('timeout') || rawMsg.includes('batas waktu')) {
          errMsg = 'Gagal mengunduh: Batas waktu habis (timeout). Server membutuhkan waktu lebih lama.';
        } else if (err?.name === 'QuotaExceededError' || rawMsg.includes('Quota')) {
          errMsg = 'Gagal mengunduh: Memori penyimpanan browser HP penuh (Quota Exceeded)';
        } else if (
          rawMsg.includes('Failed to fetch') ||
          rawMsg.includes('NetworkError') ||
          rawMsg.includes('koneksi') ||
          (typeof navigator !== 'undefined' && !navigator.onLine)
        ) {
          errMsg = 'Gagal mengunduh: Terkendala koneksi server ke sumber audio';
        } else if (rawMsg) {
          errMsg = rawMsg.startsWith('Gagal mengunduh') ? rawMsg : `Gagal mengunduh: ${rawMsg}`;
        }

        toast.error(errMsg);
      } finally {
        // ALWAYS executed: guarantees spinner stops immediately on success, cancellation, or failure
        setIsDownloading(false);
      }
    },
    [currentTrack, isDownloaded, isDownloading, lyrics, currentVideoId, isSyncedLyrics, duration, currentArtistName]
  );

  // 5. Flawless Seek Commit Handlers directly delegating to global MusicContext
  const handleSeekCommit = useCallback(
    (time: number) => {
      seekTo(time);
    },
    [seekTo]
  );

  const handleLyricClick = useCallback(
    (time: number) => {
      const currentOffset = useLyricsOffsetStore.getState().getOffset(currentVideoId);
      const targetAudioTime = Math.max(0, time - currentOffset);
      seekTo(targetAudioTime);
      if (!isPlaying) setPlaying(true);
    },
    [seekTo, isPlaying, setPlaying, currentVideoId]
  );

  // Poin 84: Mini-Player Touch Gestures (Swipe left: Next, Swipe right: Prev, Swipe up: Expand)
  const miniTouchStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const didSwipeRef = useRef<boolean>(false);

  const handleMiniTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    miniTouchStartRef.current = { x: t.clientX, y: t.clientY };
    didSwipeRef.current = false;
  }, []);

  const handleMiniTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - miniTouchStartRef.current.x;
      const dy = t.clientY - miniTouchStartRef.current.y;

      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
        didSwipeRef.current = true;
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate?.(30);
        }
        if (dx < 0) {
          playNext();
          toast.info('Lagu berikutnya');
        } else {
          playPrev();
          toast.info('Lagu sebelumnya');
        }
      } else if (dy < -40 && Math.abs(dy) > Math.abs(dx)) {
        didSwipeRef.current = true;
        setExpanded(true);
      }
    },
    [playNext, playPrev, setExpanded]
  );

  const handleMiniClick = useCallback(() => {
    if (didSwipeRef.current) {
      didSwipeRef.current = false;
      return;
    }
    setExpanded(true);
  }, [setExpanded]);

  if (!currentTrack) return null;

  const thumbnail = getHighResImage(currentTrack.thumbnails?.[currentTrack.thumbnails.length - 1]?.url, 800);
  const artistName = Array.isArray(currentTrack.artist)
    ? currentTrack.artist.map((a: any) => (typeof a === 'string' ? a : a?.name || '')).filter(Boolean).join(', ')
    : currentTrack.artist?.name || 'Unknown Artist';

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. MOBILE MINI-PLAYER (Floating above bottom navigation bar)              */}
      {/* ========================================================================= */}
      <div className="md:hidden">
        <AnimatePresence>
          {!isExpanded && (
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed bottom-[68px] left-2 right-2 z-50 bg-[#181818]/95 backdrop-blur-xl rounded-xl p-2.5 flex items-center shadow-2xl border border-white/10 cursor-pointer overflow-hidden group select-none gpu-accelerated"
              onTouchStart={handleMiniTouchStart}
              onTouchEnd={handleMiniTouchEnd}
              onClick={handleMiniClick}
            >
              {/* Isolated High-Performance Progress Bar */}
              <MiniPlayerProgressBar />

              {/* Cover Art */}
              <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 mr-3 shadow-md bg-black/40">
                <Image
                  src={thumbnail}
                  alt={currentTrack.name}
                  fill
                  priority
                  sizes="48px"
                  className="object-cover"
                />
              </div>

              {/* Title & Artist */}
              <div className="flex-1 min-w-0 pr-2">
                <MarqueeText text={currentTrack.name} className="text-white text-sm font-semibold tracking-tight" />
                <div className="flex items-center gap-1.5 mt-0.5">
                  {currentTrack.isExplicit && (
                    <span className="bg-white/20 text-[9px] px-1 py-0.2 rounded font-bold text-white">E</span>
                  )}
                  <span className="text-white/60 text-xs truncate">{artistName}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={handleLike}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer"
                  aria-label="Sukai lagu"
                >
                  <Heart className={cn('w-5 h-5 transition-transform active:scale-125', isLiked && 'fill-[#1DB954] text-[#1DB954]')} />
                </button>
                <button
                  onClick={togglePlay}
                  className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-lg cursor-pointer"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying && isBuffering ? (
                    <Loader2 className="w-5 h-5 animate-spin text-black" />
                  ) : isPlaying ? (
                    <Pause className="w-5 h-5 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ========================================================================= */}
      {/* 2. DESKTOP BOTTOM PLAYER BAR (PMUSIC Symmetrical 3-Column Bar)   */}
      {/* ========================================================================= */}
      <footer
        className="hidden md:flex fixed bottom-0 left-0 right-0 h-24 z-50 bg-[#181818] border-t border-[#282828] px-4 items-center justify-between select-none gpu-accelerated contain-paint"
        style={{ boxShadow: '0 -4px 24px rgba(0,0,0,0.8)' }}
      >
        {/* LEFT COLUMN: Track Details, Like, Add & Download */}
        <div className="flex items-center w-[30%] min-w-[200px] max-w-[360px] gap-3">
          <div
            className="relative w-14 h-14 rounded-md overflow-hidden shrink-0 shadow-lg cursor-pointer group"
            onClick={() => setExpanded(true)}
          >
            <Image
              src={thumbnail}
              alt={currentTrack.name}
              fill
              priority
              sizes="56px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <ChevronDown className="w-6 h-6 rotate-180 text-white" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h4
              onClick={() => setExpanded(true)}
              className="text-white text-sm font-semibold truncate hover:underline cursor-pointer"
            >
              {currentTrack.name}
            </h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              {currentTrack.isExplicit && (
                <span className="bg-white/20 text-[9px] px-1 py-0.2 rounded font-bold text-white">E</span>
              )}
              <span
                onClick={() => {
                  const artistId = Array.isArray(currentTrack.artist)
                    ? currentTrack.artist[0]?.artistId
                    : currentTrack.artist?.artistId;
                  if (artistId) router.push(`/artist/${artistId}`);
                }}
                className="text-[#b3b3b3] text-xs truncate hover:underline hover:text-white cursor-pointer"
              >
                {artistName}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 text-[#b3b3b3]">
            <button
              onClick={handleLike}
              className="p-1.5 hover:text-white transition-colors cursor-pointer"
              title={isLiked ? 'Hapus dari lagu yang disukai' : 'Simpan ke lagu yang disukai'}
            >
              <Heart className={cn('w-5 h-5', isLiked && 'fill-[#1DB954] text-[#1DB954]')} />
            </button>
            <button
              onClick={() => setTrackToAdd(currentTrack)}
              className="p-1.5 hover:text-white transition-colors cursor-pointer"
              title="Tambahkan ke Playlist"
            >
              <ListPlus className="w-5 h-5" />
            </button>
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="p-1.5 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
              title={isDownloaded ? 'Tersimpan offline' : 'Download untuk offline'}
            >
              {isDownloading ? (
                <Loader2 className="w-5 h-5 animate-spin text-[#1DB954]" />
              ) : isDownloaded ? (
                <Check className="w-5 h-5 text-[#1DB954]" />
              ) : (
                <Download className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* CENTER COLUMN: Playback Controls & Enhanced Thick High-Contrast Seek Bar */}
        <div className="flex flex-col items-center w-[40%] max-w-[680px]">
          {/* Controls Cluster */}
          <div className="flex items-center gap-5 mb-1.5">
            <button
              onClick={toggleShuffle}
              className={cn(
                'relative p-1 transition-colors cursor-pointer',
                isShuffle ? 'text-[#1DB954]' : 'text-[#b3b3b3] hover:text-white'
              )}
              title="Acak"
            >
              <Shuffle className="w-4 h-4" />
              {isShuffle && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#1DB954] rounded-full" />}
            </button>

            <button
              onClick={playPrev}
              className="text-[#b3b3b3] hover:text-white transition-colors p-1 cursor-pointer"
              title="Sebelumnya"
            >
              <SkipBack className="w-5 h-5 fill-current" />
            </button>

            <button
              onClick={togglePlay}
              className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-md cursor-pointer"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying && isBuffering ? (
                <Loader2 className="w-4 h-4 animate-spin text-black" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>

            <button
              onClick={playNext}
              className="text-[#b3b3b3] hover:text-white transition-colors p-1 cursor-pointer"
              title="Berikutnya"
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>

            <button
              onClick={toggleRepeat}
              className={cn(
                'relative p-1 transition-colors cursor-pointer',
                repeatMode !== 'off' ? 'text-[#1DB954]' : 'text-[#b3b3b3] hover:text-white'
              )}
              title="Ulangi"
            >
              {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
              {repeatMode !== 'off' && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#1DB954] rounded-full" />
              )}
            </button>
          </div>

          {/* Enhanced Duration Progress Bar: Isolated Scrubber */}
          <DesktopScrubber onSeekCommit={handleSeekCommit} />
        </div>

        {/* RIGHT COLUMN: Lyrics, Queue, Volume Slider & Fullscreen Toggle */}
        <div className="flex items-center justify-end w-[30%] min-w-[200px] max-w-[360px] gap-3 text-[#b3b3b3]">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setActiveView('lyrics');
              setExpanded(true);
            }}
            className={cn(
              'p-1.5 hover:text-white transition-colors cursor-pointer',
              isExpanded && activeView === 'lyrics' && 'text-[#1DB954]'
            )}
            title="Lirik"
          >
            <Mic2 className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setActiveView('queue');
              setExpanded(true);
            }}
            className={cn(
              'p-1.5 hover:text-white transition-colors cursor-pointer',
              isExpanded && activeView === 'queue' && 'text-[#1DB954]'
            )}
            title="Antrean Up Next"
          >
            <ListMusic className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              openEqualizerModal();
            }}
            className={cn(
              'relative p-1.5 hover:text-white transition-colors cursor-pointer hidden lg:block',
              isEqualizerEnabled ? 'text-[#1DB954]' : 'hover:text-white'
            )}
            title="Equalizer Suara"
          >
            <SlidersHorizontal className="w-5 h-5" />
            {isEqualizerEnabled && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-[#1DB954] rounded-full" />
            )}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              openSleepTimerModal();
            }}
            className={cn(
              'relative p-1.5 hover:text-white transition-colors cursor-pointer hidden lg:block',
              isSleepTimerActive ? 'text-[#1DB954]' : 'hover:text-white'
            )}
            title="Pengatur Waktu Tidur"
          >
            <Moon className="w-5 h-5" />
            {isSleepTimerActive && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-[#1DB954] rounded-full" />
            )}
          </button>

          {/* Volume Control */}
          <div className="flex items-center gap-2 group/vol w-28">
            <button
              onClick={toggleMute}
              className="hover:text-white transition-colors cursor-pointer"
              title="Volume"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-5 h-5" />
              ) : volume < 50 ? (
                <Volume1 className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </button>
            <div className="relative flex-1 flex items-center group py-2 cursor-pointer">
              <div className="w-full h-1.5 bg-[#333333] rounded-full overflow-hidden relative">
                <div
                  className="h-full bg-white group-hover:bg-[#1DB954] rounded-full transition-colors"
                  style={{ width: `${isMuted ? 0 : volume}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={isMuted ? 0 : volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              openFloatingWidget();
              setExpanded(false);
            }}
            className="p-1.5 hover:text-white transition-colors cursor-pointer"
            title="Mini-Player Melayang (PiP)"
          >
            <ExternalLink className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setExpanded(!isExpanded);
            }}
            className="p-1.5 hover:text-white transition-colors cursor-pointer"
            title={isExpanded ? 'Tutup Fullscreen' : 'Buka Fullscreen'}
          >
            {isExpanded ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>
      </footer>

      {/* ========================================================================= */}
      {/* 3. FULLSCREEN EXPANDED PLAYER MODAL (Lyrics, Queue & Art View)           */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            className="fixed inset-0 z-[100] flex flex-col overflow-hidden select-none gpu-accelerated"
            style={{
              background: dominantColor
                ? `linear-gradient(to bottom, color-mix(in srgb, ${dominantColor} 50%, #121212) 0%, #121212 85%)`
                : 'linear-gradient(to bottom, #2b2b2b 0%, #121212 85%)',
            }}
          >
            {/* Ambient Background Glow for Art */}
            <div className="absolute inset-0 -z-10 overflow-hidden opacity-30 pointer-events-none">
              <Image src={thumbnail} alt="Ambient glow" fill priority className="object-cover blur-[90px] scale-125" />
            </div>

            {/* Top Navigation Bar */}
            <header
              className={cn(
                'relative flex items-center justify-between p-4 md:px-8 md:pt-6 transition-[z-index]',
                isMobileUtilityMenuOpen ? 'z-50' : 'z-30'
              )}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setExpanded(false);
                }}
                className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
                aria-label="Tutup"
              >
                <ChevronDown className="w-7 h-7" />
              </button>

              {/* View Switcher Tabs (Art, Lyrics, Queue) */}
              <div className="flex items-center gap-1 bg-black/40 backdrop-blur-md p-1 rounded-full border border-white/10 shadow-inner">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setActiveView('cover');
                  }}
                  className={cn(
                    'px-4 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer',
                    activeView === 'cover' ? 'bg-white text-black shadow-md' : 'text-white/70 hover:text-white'
                  )}
                >
                  <Disc3 className="w-3.5 h-3.5" />
                  <span>Cover</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setActiveView('lyrics');
                  }}
                  className={cn(
                    'px-4 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer',
                    activeView === 'lyrics' ? 'bg-white text-black shadow-md' : 'text-white/70 hover:text-white'
                  )}
                >
                  <Mic2 className="w-3.5 h-3.5" />
                  <span>Lirik</span>
                  {isSyncedLyrics && <Sparkles className="w-3 h-3 text-[#1DB954]" />}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setActiveView('queue');
                  }}
                  className={cn(
                    'px-4 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer',
                    activeView === 'queue' ? 'bg-white text-black shadow-md' : 'text-white/70 hover:text-white'
                  )}
                >
                  <ListMusic className="w-3.5 h-3.5" />
                  <span>Antrean</span>
                  {queue.length > 0 && <span className="text-[10px] opacity-70">({queue.length})</span>}
                </button>
              </div>

              {/* TOP RIGHT UTILITY CONTROLS: Desktop Direct Buttons + Mobile 3-Dots Popover Menu */}
              <div className="relative">
                {/* 1. DESKTOP VIEW: Directly displays all 4 utility buttons side-by-side */}
                <div className="hidden md:flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      openEqualizerModal();
                    }}
                    className={cn(
                      'relative w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer',
                      isEqualizerEnabled ? 'text-[#1DB954]' : 'text-white/80 hover:text-white'
                    )}
                    title="Equalizer Suara"
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    {isEqualizerEnabled && (
                      <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#1DB954] rounded-full" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      openSleepTimerModal();
                    }}
                    className={cn(
                      'relative w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer',
                      isSleepTimerActive ? 'text-[#1DB954]' : 'text-white/80 hover:text-white'
                    )}
                    title="Pengatur Waktu Tidur"
                  >
                    <Moon className="w-4 h-4" />
                    {isSleepTimerActive && (
                      <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#1DB954] rounded-full" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      openFloatingWidget();
                      setExpanded(false);
                    }}
                    className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
                    title="Mini-Player Melayang (PiP)"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleDownload();
                    }}
                    disabled={isDownloading}
                    className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                    title={isDownloaded ? 'Tersimpan offline' : 'Download'}
                  >
                    {isDownloading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#1DB954]" />
                    ) : isDownloaded ? (
                      <Check className="w-4 h-4 text-[#1DB954]" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* 2. MOBILE VIEW: Compact Single 3-Dots Button with Interactive Popover Menu */}
                <div className="relative md:hidden">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setIsMobileUtilityMenuOpen((prev) => !prev);
                    }}
                    className={cn(
                      'relative w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer border',
                      isMobileUtilityMenuOpen
                        ? 'bg-white/20 text-white border-white/30 shadow-md'
                        : 'bg-white/5 hover:bg-white/15 text-white/80 hover:text-white border-white/10'
                    )}
                    title="Menu Utilitas Pemutar"
                    aria-label="Menu Utilitas Pemutar"
                  >
                    <MoreVertical className="w-4 h-4" />
                    {(isEqualizerEnabled || isSleepTimerActive || isDownloading) && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#1DB954] ring-2 ring-black animate-pulse" />
                    )}
                  </button>

                  {/* Interactive Popover Dropdown */}
                  <AnimatePresence>
                    {isMobileUtilityMenuOpen && (
                      <>
                        {/* Tap-outside Backdrop */}
                        <div
                          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsMobileUtilityMenuOpen(false);
                          }}
                        />

                        {/* Dropdown Card */}
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: 4 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: 4 }}
                          transition={{ duration: 0.15, ease: 'easeOut' }}
                          className="absolute top-full right-0 mt-2 w-64 max-w-[calc(100vw-32px)] z-50 bg-[#161616]/95 backdrop-blur-2xl border border-white/15 rounded-2xl p-2 shadow-2xl flex flex-col gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase text-white/40 border-b border-white/5 flex items-center justify-between">
                            <span>Menu Utilitas</span>
                            <span className="text-[#1DB954] font-semibold text-[9px]">MusicFY</span>
                          </div>

                          {/* 1. Equalizer */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsMobileUtilityMenuOpen(false);
                              openEqualizerModal();
                            }}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer w-full',
                              isEqualizerEnabled ? 'bg-[#1DB954]/15 text-[#1DB954]' : 'hover:bg-white/10 text-white/90'
                            )}
                          >
                            <div
                              className={cn(
                                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                                isEqualizerEnabled ? 'bg-[#1DB954]/20 text-[#1DB954]' : 'bg-white/10 text-white/70'
                              )}
                            >
                              <SlidersHorizontal className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-white">Equalizer Suara</p>
                                {isEqualizerEnabled && (
                                  <span className="text-[10px] font-bold text-[#1DB954] bg-[#1DB954]/20 px-1.5 py-0.5 rounded-full">
                                    Aktif
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-white/50 truncate">Atur bass & frekuensi audio</p>
                            </div>
                          </button>

                          {/* 2. Sleep Timer */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsMobileUtilityMenuOpen(false);
                              openSleepTimerModal();
                            }}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer w-full',
                              isSleepTimerActive ? 'bg-[#1DB954]/15 text-[#1DB954]' : 'hover:bg-white/10 text-white/90'
                            )}
                          >
                            <div
                              className={cn(
                                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                                isSleepTimerActive ? 'bg-[#1DB954]/20 text-[#1DB954]' : 'bg-white/10 text-white/70'
                              )}
                            >
                              <Moon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-white">Sleep Timer</p>
                                {isSleepTimerActive && (
                                  <span className="text-[10px] font-bold text-[#1DB954] bg-[#1DB954]/20 px-1.5 py-0.5 rounded-full">
                                    Aktif
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-white/50 truncate">Waktu penghenti otomatis</p>
                            </div>
                          </button>

                          {/* 3. Floating Widget (PiP) */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsMobileUtilityMenuOpen(false);
                              openFloatingWidget();
                              setExpanded(false);
                            }}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-white/10 transition-colors cursor-pointer w-full text-white/90"
                          >
                            <div className="w-8 h-8 rounded-lg bg-white/10 text-white/70 flex items-center justify-center shrink-0">
                              <ExternalLink className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-white">Player Melayang (PiP)</p>
                              <p className="text-[11px] text-white/50 truncate">Jendela mini saat multitask</p>
                            </div>
                          </button>

                          {/* 4. Download Lagu */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsMobileUtilityMenuOpen(false);
                              handleDownload();
                            }}
                            disabled={isDownloading}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer w-full',
                              isDownloaded ? 'text-[#1DB954] hover:bg-white/5' : 'hover:bg-white/10 text-white/90',
                              isDownloading && 'opacity-60 cursor-not-allowed'
                            )}
                          >
                            <div
                              className={cn(
                                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                                isDownloaded ? 'bg-[#1DB954]/20 text-[#1DB954]' : 'bg-white/10 text-white/70'
                              )}
                            >
                              {isDownloading ? (
                                <Loader2 className="w-4 h-4 animate-spin text-[#1DB954]" />
                              ) : isDownloaded ? (
                                <Check className="w-4 h-4 text-[#1DB954]" />
                              ) : (
                                <Download className="w-4 h-4" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-white">
                                  {isDownloaded ? 'Tersimpan Offline' : isDownloading ? 'Mengunduh...' : 'Download Lagu'}
                                </p>
                                {isDownloaded && (
                                  <span className="text-[10px] font-bold text-[#1DB954]">Offline</span>
                                )}
                              </div>
                              <p className="text-[11px] text-white/50 truncate">
                                {isDownloaded ? 'Tersimpan di IndexedDB lokal' : 'Dengarkan tanpa internet'}
                              </p>
                            </div>
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </header>

            {/* MAIN CONTENT AREA BASED ON ACTIVE VIEW */}
            <div className="flex-1 min-h-0 relative flex flex-col justify-center px-4 md:px-8">
              {/* TAB 1: COVER ART */}
              {activeView === 'cover' && (
                <div className="flex-1 flex flex-col items-center justify-center p-4">
                  <motion.div
                    key={currentTrack.videoId}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: isPlaying ? 1 : 0.97 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 120 }}
                    className="relative w-full aspect-square max-w-[320px] md:max-w-[400px] rounded-2xl overflow-hidden shadow-2xl border border-white/10"
                    style={{
                      boxShadow: dominantColor
                        ? `0 20px 50px -10px ${dominantColor}50`
                        : '0 20px 50px -10px rgba(0,0,0,0.8)',
                    }}
                  >
                    <Image
                      src={thumbnail}
                      alt={currentTrack.name}
                      fill
                      priority
                      sizes="(max-width: 768px) 320px, 400px"
                      className="object-cover"
                    />
                  </motion.div>

                  {/* Real-Time Audio Visualizer under Album Cover */}
                  <div className="w-full max-w-[320px] md:max-w-[400px] mt-4 px-1">
                    <AudioVisualizer isPlaying={isPlaying} barCount={28} height={36} />
                  </div>
                </div>
              )}

              {/* TAB 2: SYNCHRONIZED SCROLLING LYRICS */}
              {activeView === 'lyrics' && (
                <div className="flex-1 min-h-0 flex flex-col relative w-full">
                  <div
                    className={cn(
                      'absolute top-2 left-0 md:left-auto md:right-4 z-10 transition-all duration-200',
                      isMobileUtilityMenuOpen && 'opacity-0 pointer-events-none scale-90'
                    )}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setExpanded(true);
                        setIsFullScreenLyricsOpen(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-full text-xs font-bold transition-all shadow-lg backdrop-blur-md cursor-pointer"
                      title="Buka Mode Lirik Layar Penuh Imersif"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Layar Penuh</span>
                    </button>
                  </div>

                  <LyricsViewContainer
                    lyrics={lyrics}
                    onSeek={handleLyricClick}
                    isLoading={isLyricsLoading}
                    isSynced={isSyncedLyrics}
                    searchPass={lyricsSearchPass}
                  />
                </div>
              )}

              {/* TAB 3: UP NEXT QUEUE */}
              {activeView === 'queue' && (
                <div className="flex-1 overflow-y-auto no-scrollbar max-w-2xl mx-auto w-full py-4 space-y-5">
                  <div>
                    <h3 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-2">Sedang Diputar</h3>
                    <div className="flex items-center gap-3 p-3 bg-white/10 rounded-xl border border-white/10">
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0">
                        <Image src={thumbnail} alt={currentTrack.name} fill priority sizes="48px" className="object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <div className="flex gap-0.5 items-end h-3">
                            <div className="w-1 bg-[#1DB954] animate-[bounce_0.8s_infinite_0ms]" />
                            <div className="w-1 bg-[#1DB954] animate-[bounce_0.8s_infinite_200ms]" />
                            <div className="w-1 bg-[#1DB954] animate-[bounce_0.8s_infinite_400ms]" />
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-white font-semibold text-sm truncate">{currentTrack.name}</h4>
                        <p className="text-white/60 text-xs truncate mt-0.5">{artistName}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-bold text-white/60 uppercase tracking-wider">
                        Berikutnya dalam Antrean ({queue.length > 0 ? queue.length - 1 - queueIndex : 0})
                      </h3>
                      {queue.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            clearQueue();
                          }}
                          className="text-xs text-white/60 hover:text-white transition-colors cursor-pointer"
                        >
                          Hapus Antrean
                        </button>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {queue.map((t, idx) => {
                        if (idx <= queueIndex) return null;
                        const isFirstNext = idx === queueIndex + 1;
                        const isLastInQueue = idx === queue.length - 1;
                        const thumb = getHighResImage(t.thumbnails?.[t.thumbnails.length - 1]?.url, 100);
                        const art = Array.isArray(t.artist)
                          ? t.artist.map((a: any) => (typeof a === 'string' ? a : a?.name || '')).filter(Boolean).join(', ')
                          : t.artist?.name || 'Unknown Artist';
                        return (
                          <div
                            key={t.videoId + idx}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              playQueueIndex(idx);
                            }}
                            className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/10 transition-colors group cursor-pointer border border-transparent hover:border-white/5 relative"
                          >
                            <span className="text-[11px] font-mono text-white/40 w-5 text-center shrink-0">
                              #{idx - queueIndex}
                            </span>
                            <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0">
                              <Image
                                src={thumb}
                                alt={t.name}
                                fill
                                sizes="44px"
                                loading="lazy"
                                decoding="async"
                                className="object-cover"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h5 className="text-white text-sm font-medium truncate group-hover:text-accent transition-colors">
                                {t.name}
                              </h5>
                              <p className="text-white/60 text-xs truncate mt-0.5">{art}</p>
                            </div>

                            {/* Interactive Reordering & Queue Management Controls */}
                            <div
                              className="flex items-center gap-0.5 shrink-0 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  moveQueueItem(idx, idx - 1);
                                }}
                                disabled={isFirstNext}
                                className="p-1.5 text-white/50 hover:text-white disabled:opacity-20 disabled:hover:text-white/50 transition-colors cursor-pointer"
                                title="Pindahkan ke atas"
                              >
                                <ChevronUp className="w-4 h-4" />
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  moveQueueItem(idx, idx + 1);
                                }}
                                disabled={isLastInQueue}
                                className="p-1.5 text-white/50 hover:text-white disabled:opacity-20 disabled:hover:text-white/50 transition-colors cursor-pointer"
                                title="Pindahkan ke bawah"
                              >
                                <ChevronDown className="w-4 h-4" />
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  removeFromQueue(idx);
                                }}
                                className="p-1.5 text-white/40 hover:text-red-400 transition-colors cursor-pointer"
                                title="Hapus dari antrean"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {queue.length <= queueIndex + 1 && (
                        <div className="p-8 text-center text-white/40 space-y-2">
                          <ListMusic className="w-10 h-10 mx-auto opacity-30" />
                          <p className="text-sm">Antrean habis</p>
                          <p className="text-xs text-white/30">Lagu berikutnya akan diambil otomatis berdasarkan kemiripan.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* EXPANDED CONTROLS FOOTER */}
            <footer className="relative z-10 p-6 md:px-12 max-w-2xl mx-auto w-full">
              {/* Title & Like / Add Row */}
              <div className="flex items-center justify-between mb-4">
                <div className="min-w-0 flex-1 pr-4">
                  <MarqueeText text={currentTrack.name} className="text-2xl font-bold text-white mb-1 tracking-tight" />
                  <div className="flex items-center gap-2">
                    {currentTrack.isExplicit && (
                      <span className="bg-white/20 text-[9px] px-1 py-0.2 rounded font-bold text-white">E</span>
                    )}
                    <span
                      onClick={() => {
                        const artistId = Array.isArray(currentTrack.artist)
                          ? currentTrack.artist[0]?.artistId
                          : currentTrack.artist?.artistId;
                        if (artistId) {
                          setExpanded(false);
                          router.push(`/artist/${artistId}`);
                        }
                      }}
                      className="text-white/70 text-base truncate hover:underline hover:text-white cursor-pointer"
                    >
                      {artistName}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setTrackToAdd(currentTrack)}
                    className="p-2 text-white/70 hover:text-white transition-colors cursor-pointer"
                    title="Tambahkan ke Playlist"
                  >
                    <ListPlus className="w-6 h-6" />
                  </button>
                  <button
                    onClick={handleLike}
                    className="p-2 text-white/70 hover:text-white transition-colors cursor-pointer"
                    title="Sukai lagu"
                  >
                    <Heart className={cn('w-7 h-7 transition-transform active:scale-125', isLiked && 'fill-[#1DB954] text-[#1DB954]')} />
                  </button>
                </div>
              </div>

              {/* Enhanced Duration Progress Bar (Thick & High-Contrast Scrubber) */}
              <ExpandedScrubber onSeekCommit={handleSeekCommit} />

              {/* Main Playback Controls Cluster */}
              <div className="flex items-center justify-between px-2 mb-4">
                <button
                  onClick={toggleShuffle}
                  className={cn(
                    'relative p-2 transition-colors cursor-pointer',
                    isShuffle ? 'text-[#1DB954]' : 'text-white/60 hover:text-white'
                  )}
                  title="Acak"
                >
                  <Shuffle className="w-6 h-6" />
                  {isShuffle && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#1DB954] rounded-full" />}
                </button>

                <button
                  onClick={playPrev}
                  className="p-2 text-white/80 hover:text-white hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  title="Sebelumnya"
                >
                  <SkipBack className="w-9 h-9 fill-current" />
                </button>

                <button
                  onClick={togglePlay}
                  className="w-18 h-18 md:w-20 md:h-20 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-2xl cursor-pointer"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying && isBuffering ? (
                    <Loader2 className="w-9 h-9 animate-spin text-black" />
                  ) : isPlaying ? (
                    <Pause className="w-9 h-9 fill-current" />
                  ) : (
                    <Play className="w-9 h-9 fill-current ml-1" />
                  )}
                </button>

                <button
                  onClick={playNext}
                  className="p-2 text-white/80 hover:text-white hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  title="Berikutnya"
                >
                  <SkipForward className="w-9 h-9 fill-current" />
                </button>

                <button
                  onClick={toggleRepeat}
                  className={cn(
                    'relative p-2 transition-colors cursor-pointer',
                    repeatMode !== 'off' ? 'text-[#1DB954]' : 'text-white/60 hover:text-white'
                  )}
                  title="Ulangi"
                >
                  {repeatMode === 'one' ? <Repeat1 className="w-6 h-6" /> : <Repeat className="w-6 h-6" />}
                  {repeatMode !== 'off' && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#1DB954] rounded-full" />
                  )}
                </button>
              </div>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Immersive Full Screen Karaoke Lyrics Modal (Batch 2 - Poin 24) */}
      <AnimatePresence>
        {isFullScreenLyricsOpen && (
          <ComponentErrorBoundary
            fallbackTitle="Lirik Layar Penuh"
            onReset={() => {
              setIsFullScreenLyricsOpen(false);
              setExpanded(true);
            }}
          >
            <FullScreenLyrics
              lyrics={lyrics}
              onClose={() => {
                setIsFullScreenLyricsOpen(false);
                setExpanded(true);
              }}
              onSeek={handleLyricClick}
              isSynced={isSyncedLyrics}
              isLoading={isLyricsLoading}
            />
          </ComponentErrorBoundary>
        )}
      </AnimatePresence>

      {/* Compact Floating Lyrics Pill Quick View (Batch 3 - Poin 80) */}
      <FloatingLyricsPill
        lyrics={lyrics}
        isSynced={isSyncedLyrics}
        onOpenLyrics={() => {
          setExpanded(true);
          setIsFullScreenLyricsOpen(true);
        }}
      />
    </>
  );
}
