'use client';

import React, { memo, useEffect, useRef, useCallback, useState } from 'react';
import {
  Play,
  ListPlus,
  ListVideo,
  Heart,
  FolderPlus,
  Download,
  Share2,
  Trash2,
  Check,
} from 'lucide-react';
import { useContextMenuStore } from '@/lib/contextMenuStore';
import { useMusic } from '@/context/MusicContext';
import { usePlayerStore } from '@/lib/store';
import { db } from '@/lib/db';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

/**
 * Enterprise Contextual Long-Press & Right-Click Quick Menu
 * Master Blueprint PMUSIC Architecture - Batch 3 (Poin 78)
 *
 * Guarantees:
 * 1. Absolute viewport positioning with overflow collision avoidance.
 * 2. Instant dismissal on click-outside, scroll, or Escape key.
 * 3. Quick actions: Play Now, Play Next, Queue, Playlist, Offline Download, Like, Copy Link.
 * 4. Micro-animations and tactile glassmorphic design.
 */
export const TrackContextMenu = memo(function TrackContextMenu() {
  const isOpen = useContextMenuStore((state) => state.isOpen);
  const position = useContextMenuStore((state) => state.position);
  const track = useContextMenuStore((state) => state.track);
  const closeContextMenu = useContextMenuStore((state) => state.closeContextMenu);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const { playTrack, insertNextInQueue, addToQueue, toggleLike, isLiked } = useMusic();
  const setTrackToAdd = usePlayerStore((state) => state.setTrackToAdd);

  const [isDownloaded, setIsDownloaded] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Check offline download state when menu opens for this track
  useEffect(() => {
    if (!isOpen || !track?.videoId) {
      setIsDownloaded(false);
      return;
    }
    const syncStatus = db.isOfflineTrackSync(track.videoId);
    setIsDownloaded(syncStatus);
    setCopied(false);
  }, [isOpen, track?.videoId]);

  // Handle outside click, scroll, and escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeContextMenu();
      }
    };

    const handleScroll = () => {
      closeContextMenu();
    };

    window.addEventListener('mousedown', handleClickOutside, { passive: true });
    window.addEventListener('touchstart', handleClickOutside, { passive: true });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });

    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [isOpen, closeContextMenu]);

  const handlePlayNow = useCallback(() => {
    if (!track) return;
    playTrack(track);
    closeContextMenu();
  }, [playTrack, track, closeContextMenu]);

  const handlePlayNext = useCallback(() => {
    if (!track) return;
    insertNextInQueue(track);
    toast.success(`"${track.name}" akan diputar berikutnya`);
    closeContextMenu();
  }, [insertNextInQueue, track, closeContextMenu]);

  const handleAddToQueue = useCallback(() => {
    if (!track) return;
    addToQueue(track);
    toast.success(`"${track.name}" ditambahkan ke antrean`);
    closeContextMenu();
  }, [addToQueue, track, closeContextMenu]);

  const handleToggleLike = useCallback(async () => {
    if (!track) return;
    await toggleLike(track);
    closeContextMenu();
  }, [toggleLike, track, closeContextMenu]);

  const handleAddToPlaylist = useCallback(() => {
    if (!track) return;
    closeContextMenu();
    setTrackToAdd(track);
  }, [track, closeContextMenu, setTrackToAdd]);

  const handleToggleDownload = useCallback(async () => {
    if (!track?.videoId) return;
    if (isDownloading) return;

    if (isDownloaded) {
      try {
        await db.removeOfflineTrack(track.videoId);
        setIsDownloaded(false);
        toast.info(`"${track.name}" dihapus dari unduhan offline`);
      } catch {
        toast.error('Gagal menghapus unduhan');
      }
      closeContextMenu();
      return;
    }

    try {
      setIsDownloading(true);
      toast.info(`Mengunduh "${track.name}" untuk pemutaran offline...`);
      await db.saveOfflineTrack(track);
      setIsDownloaded(true);
      toast.success(`"${track.name}" berhasil diunduh secara offline`);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal mengunduh audio offline');
    } finally {
      setIsDownloading(false);
      closeContextMenu();
    }
  }, [track, isDownloading, isDownloaded, closeContextMenu]);

  const handleCopyLink = useCallback(async () => {
    if (!track?.videoId) return;
    const url = `https://youtu.be/${track.videoId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Tautan lagu disalin ke papan klip');
      setTimeout(() => {
        closeContextMenu();
      }, 350);
    } catch {
      toast.error('Gagal menyalin tautan');
    }
  }, [track?.videoId, closeContextMenu]);

  if (!isOpen || !track) return null;

  const liked = isLiked(track.videoId);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Menu Opsi Lagu"
      style={{
        top: `${position.y}px`,
        left: `${position.x}px`,
      }}
      className={cn(
        'fixed z-[9999] min-w-[210px] sm:min-w-[230px] p-1.5 rounded-2xl shadow-2xl',
        'bg-neutral-900/95 backdrop-blur-2xl border border-white/10 text-white select-none',
        'animate-in fade-in zoom-in-95 duration-150 transform-gpu'
      )}
    >
      {/* Track Header preview */}
      <div className="px-3 py-2 border-b border-white/10 mb-1">
        <p className="text-xs font-bold text-white truncate max-w-[200px]">{track.name}</p>
        <p className="text-[11px] text-white/50 truncate max-w-[200px]">
          {Array.isArray(track.artist)
            ? track.artist.map((a: any) => (typeof a === 'string' ? a : a.name)).join(', ')
            : (track.artist as any)?.name || 'Unknown Artist'}
        </p>
      </div>

      <div className="space-y-0.5">
        <button
          onClick={handlePlayNow}
          className="w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded-xl hover:bg-white/10 text-white/90 hover:text-white transition-colors cursor-pointer text-left"
        >
          <Play className="w-4 h-4 fill-white text-white shrink-0" />
          <span>Putar Sekarang</span>
        </button>

        <button
          onClick={handlePlayNext}
          className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer text-left"
        >
          <ListPlus className="w-4 h-4 text-white/70 shrink-0" />
          <span>Putar Berikutnya</span>
        </button>

        <button
          onClick={handleAddToQueue}
          className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer text-left"
        >
          <ListVideo className="w-4 h-4 text-white/70 shrink-0" />
          <span>Tambah ke Antrean</span>
        </button>

        <button
          onClick={handleToggleLike}
          className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer text-left"
        >
          <Heart
            className={cn(
              'w-4 h-4 shrink-0 transition-colors',
              liked ? 'fill-[#1DB954] text-[#1DB954]' : 'text-white/70'
            )}
          />
          <span>{liked ? 'Hapus dari Lagu Disukai' : 'Sukai Lagu'}</span>
        </button>

        <button
          onClick={handleAddToPlaylist}
          className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer text-left"
        >
          <FolderPlus className="w-4 h-4 text-white/70 shrink-0" />
          <span>Tambah ke Playlist</span>
        </button>

        <button
          onClick={handleToggleDownload}
          disabled={isDownloading}
          className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer text-left disabled:opacity-50"
        >
          {isDownloaded ? (
            <>
              <Trash2 className="w-4 h-4 text-red-400 shrink-0" />
              <span className="text-red-400">Hapus Unduhan Offline</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4 text-white/70 shrink-0" />
              <span>{isDownloading ? 'Mengunduh...' : 'Simpan Offline'}</span>
            </>
          )}
        </button>

        <div className="border-t border-white/10 my-1" />

        <button
          onClick={handleCopyLink}
          className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer text-left"
        >
          {copied ? (
            <Check className="w-4 h-4 text-[#1DB954] shrink-0" />
          ) : (
            <Share2 className="w-4 h-4 text-white/70 shrink-0" />
          )}
          <span>{copied ? 'Tautan Disalin!' : 'Salin Tautan Lagu'}</span>
        </button>
      </div>
    </div>
  );
});
