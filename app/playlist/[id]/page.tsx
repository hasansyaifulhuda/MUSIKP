'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { usePlayerStore, Track } from '@/lib/store';
import { Play, ArrowLeft, Radio, Music, Trash2, BookmarkPlus, BookmarkCheck, Shuffle, Share2 } from 'lucide-react';
import Image from 'next/image';
import { TrackItem } from '@/components/TrackItem';
import { PlaylistSkeleton } from '@/components/PlaylistSkeleton';
import { MarqueeText } from '@/components/MarqueeText';
import { toast } from '@/lib/toast';

interface Playlist {
  id: string;
  name: string;
  img: string;
  tracks: Track[];
}

export default function PlaylistPage() {
  const params = useParams();
  const router = useRouter();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const playTrack = usePlayerStore((state) => state.playTrack);

  useEffect(() => {
    let active = true;
    const loadPlaylist = async () => {
      if (!params.id) return;
      try {
        const id = String(params.id);
        const data = await db.getPlaylist(id);
        if (data && active) {
          setPlaylist(data as Playlist);
          setIsSaved(true);
        } else {
          // Try fetching from YouTube Music API
          const res = await fetch(`/api/ytplaylist?id=${id}`);
          if (res.ok && active) {
            const ytData = await res.json();
            setPlaylist({
              id: ytData.playlistId || ytData.id || id,
              name: ytData.name || ytData.title || 'Playlist',
              img: ytData.thumbnails?.[ytData.thumbnails.length - 1]?.url || '',
              tracks: ytData.videos || ytData.songs || [],
            });
            setIsSaved(false);
          }
        }
      } catch (error) {
        console.error('Failed to load playlist:', error);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadPlaylist();
    return () => {
      active = false;
    };
  }, [params.id]);

  if (loading) {
    return <PlaylistSkeleton />;
  }

  if (!playlist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-white p-4">
        <p className="mb-4 text-lg font-semibold">Playlist tidak ditemukan</p>
        <button
          onClick={() => router.back()}
          className="px-5 py-2 bg-white/10 hover:bg-white/20 rounded-full text-sm font-bold transition cursor-pointer"
        >
          Kembali
        </button>
      </div>
    );
  }

  const handlePlayAll = () => {
    if (playlist.tracks.length > 0) {
      playTrack(playlist.tracks[0], playlist.tracks, 'playlist');
      toast.success(`Memutar "${playlist.name}"`);
    }
  };

  const handleShufflePlay = () => {
    if (playlist.tracks.length === 0) return;
    const shuffled = [...playlist.tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    playTrack(shuffled[0], shuffled, 'playlist');
    toast.info('Memutar playlist secara acak');
  };

  const handleRadio = () => {
    if (playlist.tracks.length > 0) {
      playTrack(playlist.tracks[0], undefined, 'similar');
      toast.info('Memulai Radio berdasarkan playlist');
    }
  };

  const handleDeletePlaylist = async () => {
    if (confirm('Apakah Anda yakin ingin menghapus playlist ini?')) {
      await db.deletePlaylist(playlist.id);
      toast.info(`Playlist "${playlist.name}" dihapus`);
      router.back();
    }
  };

  const handleRemoveSong = async (trackToRemove: Track) => {
    const updatedTracks = playlist.tracks.filter((t) => t.videoId !== trackToRemove.videoId);
    const updatedPlaylist = { ...playlist, tracks: updatedTracks };
    await db.addPlaylist(updatedPlaylist);
    setPlaylist(updatedPlaylist);
    toast.info(`"${trackToRemove.name}" dihapus dari playlist`);
  };

  const handleSavePlaylist = async () => {
    if (isSaved) {
      await db.deletePlaylist(playlist.id);
      setIsSaved(false);
      toast.info('Dihapus dari Koleksi');
    } else {
      await db.addPlaylist(playlist);
      setIsSaved(true);
      toast.success('Disimpan ke Koleksi');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: playlist.name,
          url: window.location.href,
        });
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast.success('Tautan playlist disalin ke clipboard');
      } catch {
        toast.info('Tautan: ' + window.location.href);
      }
    }
  };

  const isSelfCreated = /^\d+$/.test(playlist.id);

  return (
    <main className="min-h-screen pb-32 max-w-5xl mx-auto px-4 md:px-8 pt-4">
      {/* Top Header */}
      <div className="sticky top-0 z-20 bg-[#121212]/90 backdrop-blur-xl py-3 flex items-center justify-between border-b border-white/5">
        <button
          onClick={() => router.back()}
          className="text-white hover:bg-white/10 p-2 rounded-full transition-colors cursor-pointer"
          aria-label="Kembali"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <button
          onClick={handleShare}
          className="text-white/80 hover:text-white hover:bg-white/10 p-2 rounded-full transition-colors cursor-pointer"
          title="Bagikan"
        >
          <Share2 className="w-5 h-5" />
        </button>
      </div>

      {/* Playlist Hero Banner */}
      <div className="flex flex-col md:flex-row items-center md:items-end gap-6 mt-6 mb-8 p-4 md:p-6 bg-gradient-to-b from-white/10 to-transparent rounded-2xl">
        <div className="w-48 h-48 md:w-56 md:h-56 rounded-xl overflow-hidden shadow-2xl shrink-0 relative bg-black/40 flex items-center justify-center">
          {playlist.img ? (
            <Image
              src={playlist.img}
              alt={playlist.name}
              fill
              priority
              sizes="(max-width: 640px) 192px, 224px"
              className="object-cover"
            />
          ) : (
            <Music className="w-20 h-20 text-white/20" />
          )}
        </div>

        <div className="flex-1 text-center md:text-left">
          <span className="text-xs font-bold uppercase tracking-wider text-[#b3b3b3]">
            {isSelfCreated ? 'Playlist Kustom' : 'Playlist Pilihan'}
          </span>
          <h1 className="text-2xl md:text-4xl lg:text-5xl font-black text-white tracking-tight mt-1 mb-2 leading-tight">
            {playlist.name}
          </h1>
          <p className="text-[#b3b3b3] text-xs md:text-sm mb-5">{playlist.tracks.length} lagu</p>

          <div className="flex items-center justify-center md:justify-start gap-3.5 flex-wrap">
            <button
              onClick={handlePlayAll}
              disabled={playlist.tracks.length === 0}
              className="w-14 h-14 bg-[#1DB954] hover:bg-[#1ed760] text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              title="Putar Semua"
            >
              <Play className="w-7 h-7 fill-current ml-0.5" />
            </button>

            <button
              onClick={handleShufflePlay}
              disabled={playlist.tracks.length === 0}
              className="w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              title="Putar Acak"
            >
              <Shuffle className="w-5 h-5" />
            </button>

            <button
              onClick={handleRadio}
              disabled={playlist.tracks.length === 0}
              className="w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              title="Radio Berdasarkan Playlist"
            >
              <Radio className="w-5 h-5" />
            </button>

            {!isSelfCreated && (
              <button
                onClick={handleSavePlaylist}
                className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors cursor-pointer"
                title={isSaved ? 'Hapus dari Koleksi' : 'Simpan ke Koleksi'}
              >
                {isSaved ? <BookmarkCheck className="w-5 h-5 text-[#1DB954]" /> : <BookmarkPlus className="w-5 h-5 text-white" />}
              </button>
            )}

            {isSelfCreated && isSaved && (
              <button
                onClick={handleDeletePlaylist}
                className="w-12 h-12 bg-white/10 hover:bg-red-500/20 text-white hover:text-red-400 rounded-full flex items-center justify-center transition-colors cursor-pointer"
                title="Hapus Playlist"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Playlist Track List */}
      <div>
        {playlist.tracks.length === 0 ? (
          <div className="text-center text-white/50 py-16 space-y-2">
            <Music className="w-12 h-12 mx-auto opacity-30" />
            <p className="text-base font-semibold">Belum ada lagu di playlist ini</p>
            <p className="text-xs text-white/40">Gunakan tombol opsi pada lagu apa saja untuk menambahkannya ke sini.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {playlist.tracks.map((track, index) => (
              <TrackItem
                key={`${track.videoId}-${index}`}
                track={track}
                queue={playlist.tracks}
                index={index}
                onRemove={isSelfCreated ? handleRemoveSong : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
