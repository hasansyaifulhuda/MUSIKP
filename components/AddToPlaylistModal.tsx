'use client';

import { useState, useEffect } from 'react';
import { usePlayerStore } from '@/lib/store';
import { db } from '@/lib/db';
import { X, Plus, Music } from 'lucide-react';
import Image from 'next/image';
import { getHighResImage } from '@/lib/utils';
import { MarqueeText } from './MarqueeText';

import { toast } from '@/lib/toast';

interface Playlist {
  id: string;
  name: string;
  img: string;
  tracks: any[];
}

export function AddToPlaylistModal() {
  const trackToAdd = usePlayerStore((state) => state.trackToAdd);
  const setTrackToAdd = usePlayerStore((state) => state.setTrackToAdd);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const loadPlaylists = async () => {
    const data = await db.getPlaylists();
    setPlaylists(data as Playlist[]);
  };

  useEffect(() => {
    let mounted = true;
    if (trackToAdd) {
      db.getPlaylists()
        .then((data) => {
          if (mounted) {
            setPlaylists(data as Playlist[]);
          }
        })
        .catch(() => {});
    }
    return () => {
      mounted = false;
    };
  }, [trackToAdd]);

  const handleAddToPlaylist = async (playlist: Playlist) => {
    if (!trackToAdd) return;
    const ok = await db.addSongToPlaylist(playlist.id, trackToAdd);
    if (ok) {
      toast.success(`Ditambahkan ke playlist "${playlist.name}"`);
    } else {
      toast.info('Lagu sudah ada di dalam playlist ini');
    }
    setTrackToAdd(null);
  };

  const handleCreateAndAdd = async () => {
    if (!newPlaylistName.trim() || !trackToAdd) return;

    const trimmedName = newPlaylistName.trim();
    const coverUrl = getHighResImage(trackToAdd.thumbnails?.[trackToAdd.thumbnails.length - 1]?.url, 400);
    const created = await db.createPlaylist(trimmedName, coverUrl, [trackToAdd]);
    if (created) {
      toast.success(`Playlist "${trimmedName}" berhasil dibuat`);
    }
    setNewPlaylistName('');
    setIsCreating(false);
    setTrackToAdd(null);
  };

  if (!trackToAdd) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tambahkan ke Playlist"
      className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4 sm:p-0"
      onClick={() => setTrackToAdd(null)}
    >
      <div
        className="bg-[#242424] w-full sm:w-[420px] max-h-[80vh] rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl border border-white/10 transform-gpu"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-base font-bold text-white tracking-tight">Tambahkan ke Playlist</h2>
          <button
            onClick={() => setTrackToAdd(null)}
            className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3.5 flex items-center gap-3 border-b border-white/5 bg-black/20">
          <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 shadow bg-white/5">
            <Image
              src={getHighResImage(trackToAdd.thumbnails?.[trackToAdd.thumbnails.length - 1]?.url, 200)}
              alt={trackToAdd.name}
              fill
              loading="lazy"
              decoding="async"
              className="object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <MarqueeText text={trackToAdd.name} className="text-white font-semibold text-sm" />
            <MarqueeText
              text={Array.isArray(trackToAdd.artist) ? trackToAdd.artist.map((a) => a.name).join(', ') : trackToAdd.artist?.name || ''}
              className="text-[#b3b3b3] text-xs mt-0.5"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {isCreating ? (
            <div className="space-y-4 py-2">
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Beri nama playlist baru..."
                className="w-full bg-[#181818] border border-white/20 rounded-xl px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#1DB954] transition-colors text-sm"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setIsCreating(false)}
                  className="flex-1 py-2.5 rounded-full font-semibold text-white/80 hover:bg-white/10 transition-colors text-sm cursor-pointer"
                >
                  Batal
                </button>
                <button
                  onClick={handleCreateAndAdd}
                  disabled={!newPlaylistName.trim()}
                  className="flex-1 py-2.5 bg-[#1DB954] hover:bg-[#1ed760] text-black rounded-full font-bold disabled:opacity-50 transition-all text-sm shadow-md cursor-pointer disabled:cursor-not-allowed"
                >
                  Buat & Tambah
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={() => setIsCreating(true)}
                className="w-full flex items-center gap-3.5 p-3 hover:bg-white/10 rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center group-hover:bg-[#1DB954] group-hover:text-black transition-colors text-white">
                  <Plus className="w-6 h-6 stroke-[2.5]" />
                </div>
                <span className="text-white font-bold text-sm">Playlist Baru</span>
              </button>

              <div className="my-2 border-t border-white/5" />

              {playlists.length === 0 ? (
                <div className="text-center py-8 text-white/40 text-xs">
                  Belum ada playlist kustom. Buat playlist pertama Anda!
                </div>
              ) : (
                playlists.map((playlist) => (
                  <button
                    key={playlist.id}
                    onClick={() => handleAddToPlaylist(playlist)}
                    className="w-full flex items-center gap-3.5 p-2.5 hover:bg-white/10 rounded-xl transition-colors text-left group cursor-pointer"
                  >
                    <div className="relative w-12 h-12 bg-white/5 rounded-lg overflow-hidden flex items-center justify-center shrink-0 shadow">
                      {playlist.img ? (
                        <Image
                          src={playlist.img}
                          alt={playlist.name}
                          fill
                          loading="lazy"
                          decoding="async"
                          className="object-cover"
                        />
                      ) : (
                        <Music className="w-6 h-6 text-white/40" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-white font-semibold text-sm group-hover:text-[#1DB954] transition-colors truncate block">
                        {playlist.name}
                      </span>
                      <span className="text-[#b3b3b3] text-xs">{playlist.tracks?.length || 0} lagu</span>
                    </div>
                  </button>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
