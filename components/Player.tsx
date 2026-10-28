'use client';

import { useEffect, useState, useCallback } from 'react';
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
} from 'lucide-react';
import { cn, getHighResImage } from '@/lib/utils';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { MarqueeText } from './MarqueeText';
import { toast } from '@/lib/toast';
import { LyricLine, normalizeLyrics } from '@/lib/performance';
import { useMusic } from '@/context/MusicContext';
import {
  MiniPlayerProgressBar,
  DesktopScrubber,
  ExpandedScrubber,
  LyricsViewContainer,
} from './PlayerScrubber';

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

  // Music Context (Interruption-Aware Playback, Audio Focus, Seek, Volume & Liked Songs)
  const {
    togglePlay,
    setPlaying,
    playNext,
    playPrev,
    playQueueIndex,
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
  const currentArtistName = Array.isArray(currentTrack?.artist)
    ? currentTrack.artist.map((a: any) => (typeof a === 'string' ? a : a?.name || '')).filter(Boolean).join(' ')
    : currentTrack?.artist?.name || '';
  const currentTrackDuration = currentTrack?.duration;

  // 2. Fetch Synchronized Lyrics (non-blocking, timeout-protected)
  useEffect(() => {
    if (!currentVideoId) {
      setLyrics([]);
      setIsSyncedLyrics(false);
      return;
    }

    let isCancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      try {
        controller.abort();
      } catch {}
    }, 3500);

    setIsLyricsLoading(true);

    const dur = Math.round(duration || currentTrackDuration || 200);
    const url = `/api/lyrics?id=${encodeURIComponent(currentVideoId)}&title=${encodeURIComponent(
      currentTrackName || ''
    )}&artist=${encodeURIComponent(currentArtistName)}&duration=${dur}`;

    fetch(url, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { synced: false, lyrics: [] }))
      .then((data) => {
        if (!isCancelled) {
          const payload = data?.result !== undefined ? data.result : data;
          if (Array.isArray(payload?.lyrics) && payload.lyrics.length > 0) {
            const cleanLyrics = normalizeLyrics(payload.lyrics, dur);
            setLyrics(cleanLyrics);
            setIsSyncedLyrics(Boolean(payload.synced));
          } else {
            setLyrics([]);
            setIsSyncedLyrics(false);
          }
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setLyrics([]);
          setIsSyncedLyrics(false);
        }
      })
      .finally(() => {
        clearTimeout(timeoutId);
        if (!isCancelled) setIsLyricsLoading(false);
      });

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
      try {
        controller.abort();
      } catch {}
    };
  }, [currentVideoId, currentTrackName, currentArtistName, currentTrackDuration, duration]);

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

  // 4. Toggle Download for Offline Playback
  const handleDownload = useCallback(
    async (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (!currentTrack || isDownloading) return;

      const trackToProcess = currentTrack;
      const isCurrentlyDownloaded = isDownloaded;

      // Always activate loading spinner prior to async operations
      setIsDownloading(true);

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

          toast.info('Mengunduh lagu untuk offline...');
          const result = await db.saveOfflineTrack(trackToProcess);
          if (!result || !result.blob) {
            throw new Error('Gagal menyimpan file audio atau data unduhan tidak lengkap');
          }
          setIsDownloaded(true);
          toast.success('Lagu tersimpan untuk offline');
        }
      } catch (err: any) {
        console.error('Download toggle error:', err);
        const errMsg =
          err?.name === 'AbortError'
            ? 'Unduhan terputus atau batas waktu habis (timeout)'
            : err?.name === 'QuotaExceededError'
            ? 'Memori penyimpanan browser HP penuh (Quota Exceeded)'
            : err?.message || 'Gagal mengunduh lagu offline';
        toast.error(errMsg);
      } finally {
        // ALWAYS executed: guarantees spinner stops immediately on success, cancellation, or failure
        setIsDownloading(false);
      }
    },
    [currentTrack, isDownloaded, isDownloading]
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
      seekTo(time);
      if (!isPlaying) setPlaying(true);
    },
    [seekTo, isPlaying, setPlaying]
  );

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
              onClick={() => setExpanded(true)}
            >
              {/* Isolated High-Performance Progress Bar */}
              <MiniPlayerProgressBar />

              {/* Cover Art */}
              <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 mr-3 shadow-md bg-black/40">
                <Image src={thumbnail} alt={currentTrack.name} fill sizes="48px" className="object-cover" />
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
        className="hidden md:flex fixed bottom-0 left-0 right-0 h-24 z-50 bg-[#181818] border-t border-[#282828] px-4 items-center justify-between select-none"
        style={{ boxShadow: '0 -4px 24px rgba(0,0,0,0.8)' }}
      >
        {/* LEFT COLUMN: Track Details, Like, Add & Download */}
        <div className="flex items-center w-[30%] min-w-[200px] max-w-[360px] gap-3">
          <div
            className="relative w-14 h-14 rounded-md overflow-hidden shrink-0 shadow-lg cursor-pointer group"
            onClick={() => setExpanded(true)}
          >
            <Image src={thumbnail} alt={currentTrack.name} fill sizes="56px" className="object-cover" />
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
            onClick={() => {
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
            onClick={() => {
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
            onClick={() => setExpanded(!isExpanded)}
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
            className="fixed inset-0 z-[100] flex flex-col overflow-hidden select-none"
            style={{
              background: dominantColor
                ? `linear-gradient(to bottom, color-mix(in srgb, ${dominantColor} 50%, #121212) 0%, #121212 85%)`
                : 'linear-gradient(to bottom, #2b2b2b 0%, #121212 85%)',
            }}
          >
            {/* Ambient Background Glow for Art */}
            <div className="absolute inset-0 -z-10 overflow-hidden opacity-30 pointer-events-none">
              <Image src={thumbnail} alt="Ambient glow" fill className="object-cover blur-[90px] scale-125" />
            </div>

            {/* Top Navigation Bar */}
            <header className="relative z-10 flex items-center justify-between p-4 md:px-8 md:pt-6">
              <button
                onClick={() => setExpanded(false)}
                className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
                aria-label="Tutup"
              >
                <ChevronDown className="w-7 h-7" />
              </button>

              {/* View Switcher Tabs (Art, Lyrics, Queue) */}
              <div className="flex items-center gap-1 bg-black/40 backdrop-blur-md p-1 rounded-full border border-white/10 shadow-inner">
                <button
                  onClick={() => setActiveView('cover')}
                  className={cn(
                    'px-4 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer',
                    activeView === 'cover' ? 'bg-white text-black shadow-md' : 'text-white/70 hover:text-white'
                  )}
                >
                  <Disc3 className="w-3.5 h-3.5" />
                  <span>Cover</span>
                </button>
                <button
                  onClick={() => setActiveView('lyrics')}
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
                  onClick={() => setActiveView('queue')}
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

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                  title={isDownloaded ? 'Tersimpan offline' : 'Download'}
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
            </header>

            {/* MAIN CONTENT AREA BASED ON ACTIVE VIEW */}
            <div className="flex-1 min-h-0 relative flex flex-col justify-center px-4 md:px-12">
              {/* TAB 1: COVER ART */}
              {activeView === 'cover' && (
                <div className="flex-1 flex items-center justify-center p-4">
                  <motion.div
                    key={currentTrack.videoId}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: isPlaying ? 1 : 0.97 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 120 }}
                    className="relative w-full aspect-square max-w-[340px] md:max-w-[420px] rounded-2xl overflow-hidden shadow-2xl border border-white/10"
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
                      sizes="(max-width: 768px) 340px, 420px"
                      className="object-cover"
                    />
                  </motion.div>
                </div>
              )}

              {/* TAB 2: SYNCHRONIZED SCROLLING LYRICS */}
              {activeView === 'lyrics' && (
                <LyricsViewContainer
                  lyrics={lyrics}
                  onSeek={handleLyricClick}
                  isLoading={isLyricsLoading}
                  isSynced={isSyncedLyrics}
                />
              )}

              {/* TAB 3: UP NEXT QUEUE */}
              {activeView === 'queue' && (
                <div className="flex-1 overflow-y-auto no-scrollbar max-w-2xl mx-auto w-full py-4 space-y-5">
                  <div>
                    <h3 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-2">Sedang Diputar</h3>
                    <div className="flex items-center gap-3 p-3 bg-white/10 rounded-xl border border-white/10">
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0">
                        <Image src={thumbnail} alt={currentTrack.name} fill sizes="48px" className="object-cover" />
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
                          onClick={clearQueue}
                          className="text-xs text-white/60 hover:text-white transition-colors cursor-pointer"
                        >
                          Hapus Antrean
                        </button>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {queue.map((t, idx) => {
                        if (idx <= queueIndex) return null;
                        const thumb = getHighResImage(t.thumbnails?.[t.thumbnails.length - 1]?.url, 100);
                        const art = Array.isArray(t.artist)
                          ? t.artist.map((a: any) => (typeof a === 'string' ? a : a?.name || '')).filter(Boolean).join(', ')
                          : t.artist?.name || 'Unknown Artist';
                        return (
                          <div
                            key={t.videoId + idx}
                            onClick={() => playQueueIndex(idx)}
                            className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/10 transition-colors group cursor-pointer border border-transparent hover:border-white/5"
                          >
                            <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0">
                              <Image src={thumb} alt={t.name} fill sizes="44px" className="object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h5 className="text-white text-sm font-medium truncate group-hover:text-[#1DB954] transition-colors">
                                {t.name}
                              </h5>
                              <p className="text-white/60 text-xs truncate mt-0.5">{art}</p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFromQueue(idx);
                              }}
                              className="p-2 text-white/40 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                              title="Hapus dari antrean"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
    </>
  );
}
