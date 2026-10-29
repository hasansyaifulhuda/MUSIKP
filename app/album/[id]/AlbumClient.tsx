'use client';

import { Play, Shuffle, BookmarkPlus, BookmarkCheck, Share2 } from 'lucide-react';
import { usePlayerStore } from '@/lib/store';
import { db } from '@/lib/db';
import { useState, useEffect } from 'react';
import { toast } from '@/lib/toast';

export default function AlbumClient({ album }: { album: any }) {
  const playTrack = usePlayerStore((state) => state.playTrack);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    let active = true;
    const checkSaved = async () => {
      if (album?.albumId) {
        const saved = await db.isAlbumSaved(album.albumId);
        if (active) setIsSaved(saved);
      }
    };
    checkSaved();
    return () => {
      active = false;
    };
  }, [album?.albumId]);

  const handleSaveAlbum = async () => {
    if (!album?.albumId) return;

    if (isSaved) {
      await db.removeSavedAlbum(album.albumId);
      setIsSaved(false);
      toast.info('Dihapus dari Koleksi');
    } else {
      await db.addSavedAlbum({
        albumId: album.albumId,
        name: album.name || 'Album',
        artist: typeof album.artist === 'string' ? album.artist : album.artist?.name || 'Unknown Artist',
        thumbnails: album.thumbnails || [],
        savedAt: Date.now(),
      });
      setIsSaved(true);
      toast.success('Disimpan ke Koleksi');
    }
  };

  const handleShufflePlay = () => {
    if (!album?.songs || album.songs.length === 0) return;
    const shuffled = [...album.songs];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    playTrack(shuffled[0], shuffled, 'playlist');
    toast.info('Memutar album secara acak');
  };

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: album?.name || 'Album MusicFY',
          url: window.location.href,
        });
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        toast.success('Tautan album disalin!');
      } else {
        toast.info('Tautan: ' + window.location.href);
      }
    } catch {
      toast.info('Tautan: ' + window.location.href);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={handleSaveAlbum}
        className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors cursor-pointer"
        title={isSaved ? 'Hapus dari Koleksi' : 'Simpan ke Koleksi'}
      >
        {isSaved ? <BookmarkCheck className="w-5 h-5 text-[#1DB954]" /> : <BookmarkPlus className="w-5 h-5 text-white" />}
      </button>

      <button
        className="w-14 h-14 bg-[#1DB954] hover:bg-[#1ed760] text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl cursor-pointer"
        onClick={() => (album?.songs?.length || 0) > 0 && playTrack(album.songs[0], album.songs, 'playlist')}
        title="Putar Album"
      >
        <Play className="w-7 h-7 fill-current ml-0.5" />
      </button>

      <button
        onClick={handleShufflePlay}
        className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors cursor-pointer text-white"
        title="Acak Album"
      >
        <Shuffle className="w-5 h-5" />
      </button>

      <button
        onClick={handleShare}
        className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors cursor-pointer text-white"
        title="Bagikan"
      >
        <Share2 className="w-5 h-5" />
      </button>
    </div>
  );
}
