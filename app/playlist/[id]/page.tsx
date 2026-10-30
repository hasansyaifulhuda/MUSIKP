'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { usePlayerStore, Track } from '@/lib/store';
import { Play, ArrowLeft, Radio, Music, Trash2, BookmarkPlus, BookmarkCheck, Shuffle, Share2, Pencil } from 'lucide-react';
import Image from 'next/image';
import { TrackItem } from '@/components/TrackItem';
import { VirtualTrackList } from '@/components/VirtualTrackList';
import { PlaylistSkeleton } from '@/components/PlaylistSkeleton';
import { MarqueeText } from '@/components/MarqueeText';
import { toast } from '@/lib/toast';
import { getCachedPlaylist, setCachedPlaylist, prefetchPlaylist } from '@/lib/clientDataCache';

interface Playlist {
  id: string;
  name: string;
  img: string;
  tracks: Track[];
}

export default function PlaylistPage() {
  const params = useParams();
  const router = useRouter();
  const playlistId = params?.id ? String(params.id) : '';
  const initialCached = playlistId ? getCachedPlaylist(playlistId) : null;
  const [playlist, setPlaylist] = useState<Playlist | null>(initialCached);
  const [loading, setLoading] = useState(!initialCached);
  const [isSaved, setIsSaved] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const playTrack = usePlayerStore((state) => state.playTrack);

  useEffect(() => {
    let active = true;
    if (!playlistId) return;

    const cached = getCachedPlaylist(playlistId);
    if (cached && !playlist) {
      setPlaylist(cached);
      setLoading(false);
    }

    const loadPlaylist = async () => {
      try {
        const id = playlistId;
        const data = await db.getPlaylist(id);
        if (data && active) {
          const formatted: Playlist = data as Playlist;
          setPlaylist(formatted);
          setCachedPlaylist(id, formatted);
          setIsSaved(true);
        } else {
          // Try fetching from YouTube Music API with clientDataCache
          if (!cached && !playlist) setLoading(true);
          const ytData = await prefetchPlaylist(id);
          if (ytData && active) {
            const formatted: Playlist = {
              id: ytData.playlistId || ytData.id || id,
              name: ytData.name || ytData.title || 'Playlist',
              img: ytData.thumbnails?.[ytData.thumbnails.length - 1]?.url || '',
              tracks: ytData.videos || ytData.songs || [],
            };
            setPlaylist(formatted);
            setCachedPlaylist(id, formatted);
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
  }, [playlistId]);

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
    if ((playlist.tracks?.length || 0) > 0) {
      playTrack(playlist.tracks[0], playlist.tracks, 'playlist');
      toast.success(`Memutar "${playlist.name}"`);
    }
  };

  const handleShufflePlay = () => {
    if ((playlist.tracks?.length || 0) === 0) return;
    const shuffled = [...playlist.tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    playTrack(shuffled[0], shuffled, 'playlist');
    toast.info('Memutar playlist secara acak');
  };

  const handleRadio = () => {
    if ((playlist.tracks?.length || 0) > 0) {
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
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: playlist.name,
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
        toast.success('Tautan playlist disalin ke clipboard');
      } else {
        toast.info('Tautan: ' + window.location.href);
      }
    } catch {
      toast.info('Tautan: ' + window.location.href);
    }
  };

  const handleOpenRename = () => {
    setEditedName(playlist.name);
    setIsEditingName(true);
  };

  const handleSaveRename = async () => {
    if (!editedName.trim()) return;
    const clean = editedName.trim();
    await db.updatePlaylist(playlist.id, { name: clean });
    setPlaylist((prev) => (prev ? { ...prev, name: clean } : null));
    setIsEditingName(false);
    toast.success('Nama playlist berhasil diperbarui');
  };

  const isSelfCreated = isSaved || /^\d+$/.test(playlist.id) || playlist.id.startsWith('playlist_');

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

          {isEditingName ? (
            <div className="flex items-center gap-2 mt-2 mb-3">
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveRename()}
                autoFocus
                className="bg-white/10 text-white text-xl md:text-2xl font-bold px-3 py-1.5 rounded-lg border border-white/20 focus:outline-none focus:border-[#1DB954] w-full max-w-md"
              />
              <button
                onClick={handleSaveRename}
                className="px-4 py-2 bg-[#1DB954] text-black font-bold text-sm rounded-lg hover:scale-105 transition-all cursor-pointer"
              >
                Simpan
              </button>
              <button
                onClick={() => setIsEditingName(false)}
                className="px-3 py-2 bg-white/10 text-white font-semibold text-sm rounded-lg hover:bg-white/20 transition-all cursor-pointer"
              >
                Batal
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center md:justify-start gap-3 mt-1 mb-2">
              <h1 className="text-2xl md:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
                {playlist.name}
              </h1>
              {isSelfCreated && (
                <button
                  onClick={handleOpenRename}
                  className="p-1.5 text-white/60 hover:text-white bg-white/5 hover:bg-white/15 rounded-full transition-colors cursor-pointer"
                  title="Ubah Nama Playlist"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

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
              disabled={(playlist.tracks?.length || 0) === 0}
              className="w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              title="Putar Acak"
            >
              <Shuffle className="w-5 h-5" />
            </button>

            <button
              onClick={handleRadio}
              disabled={(playlist.tracks?.length || 0) === 0}
              className="w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              title="Radio Berdasarkan Playlist"
            >
              <Radio className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
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
      </div>

      {/* Playlist Track List */}
      <div>
        {(playlist.tracks?.length || 0) === 0 ? (
          <div className="text-center text-white/50 py-16 space-y-2">
            <Music className="w-12 h-12 mx-auto opacity-30" />
            <p className="text-base font-semibold">Belum ada lagu di playlist ini</p>
            <p className="text-xs text-white/40">Gunakan tombol opsi pada lagu apa saja untuk menambahkannya ke sini.</p>
          </div>
        ) : (
          <VirtualTrackList
            tracks={playlist.tracks}
            queue={playlist.tracks}
            onRemove={isSelfCreated ? handleRemoveSong : undefined}
          />
        )}
      </div>
    </main>
  );
}
