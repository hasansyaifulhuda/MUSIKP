'use client';

import { useState, useEffect, memo } from 'react';
import { Play, Check, PlusSquare, Radio } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { usePlayerStore, Track } from '@/lib/store';
import { db } from '@/lib/db';
import { MarqueeText } from './MarqueeText';

interface PlaylistData {
  playlistId: string;
  name: string;
  thumbnails: { url: string; width: number; height: number }[];
  videos: Track[];
}

export const CommunityPlaylistCard = memo(function CommunityPlaylistCard({ playlistId }: { playlistId: string }) {
  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState(false);
  const router = useRouter();
  const playTrack = usePlayerStore((state) => state.playTrack);

  useEffect(() => {
    let active = true;
    const fetchPlaylist = async () => {
      try {
        const res = await fetch(`/api/ytplaylist?id=${playlistId}`);
        if (res.ok) {
          const data = await res.json();
          if (active) {
            setPlaylist({
              ...data,
              videos: data.videos || data.songs || [],
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch playlist:', error);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchPlaylist();
    return () => {
      active = false;
    };
  }, [playlistId]);

  if (loading) {
    return (
      <div className="w-[300px] md:w-[320px] bg-[#181818] rounded-2xl p-4 shrink-0 snap-center flex flex-col animate-pulse border border-white/5">
        <div className="flex gap-3 mb-5">
          <div className="w-20 h-20 rounded-xl bg-white/10 shrink-0" />
          <div className="flex flex-col justify-center flex-1">
            <div className="h-5 w-3/4 bg-white/10 rounded-md mb-2" />
            <div className="h-3 w-1/2 bg-white/10 rounded-md" />
          </div>
        </div>
        <div className="flex-1 space-y-3 mb-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white/10 shrink-0" />
              <div className="flex flex-col flex-1 gap-2">
                <div className="h-3.5 w-full bg-white/10 rounded-md" />
                <div className="h-2.5 w-2/3 bg-white/10 rounded-md" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-auto pt-2">
          <div className="w-12 h-12 rounded-full bg-white/10" />
          <div className="w-10 h-10 rounded-full bg-white/10" />
        </div>
      </div>
    );
  }

  if (!playlist) return null;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (playlist.videos && playlist.videos.length > 0) {
      playTrack(playlist.videos[0], playlist.videos, 'playlist');
    }
  };

  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!added) {
      await db.addPlaylist({
        id: playlist.playlistId,
        name: playlist.name,
        img: playlist.thumbnails?.[playlist.thumbnails.length - 1]?.url || '',
        tracks: playlist.videos || [],
      });
      setAdded(true);
    }
  };

  const handleRadio = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (playlist.videos && playlist.videos.length > 0) {
      playTrack(playlist.videos[0], [], 'similar');
    }
  };

  const handleClick = () => {
    router.push(`/playlist/${playlist.playlistId}`);
  };

  const displayTracks = playlist.videos?.slice(0, 3) || [];

  return (
    <div
      onClick={handleClick}
      className="w-[300px] md:w-[320px] bg-[#181818]/80 hover:bg-[#282828] rounded-2xl p-4 shrink-0 snap-start cursor-pointer transition-all duration-300 flex flex-col border border-white/5 shadow-lg group select-none"
    >
      <div className="flex gap-3.5 mb-4">
        <div className="w-20 h-20 rounded-xl overflow-hidden relative shrink-0 shadow-md bg-black/40">
          {playlist.videos && playlist.videos.length >= 4 ? (
            <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
              {playlist.videos.slice(0, 4).map((track, i) => (
                <div key={i} className="relative w-full h-full">
                  <Image
                    src={track.thumbnails?.[track.thumbnails.length - 1]?.url || 'https://picsum.photos/100/100'}
                    alt={track.name}
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          ) : (
            <Image
              src={playlist.thumbnails?.[playlist.thumbnails.length - 1]?.url || 'https://picsum.photos/200/200'}
              alt={playlist.name}
              fill
              sizes="80px"
              className="object-cover"
            />
          )}
        </div>
        <div className="flex flex-col justify-center min-w-0 flex-1">
          <MarqueeText text={playlist.name} className="text-white font-bold text-base leading-tight mb-1 group-hover:text-[#1DB954] transition-colors" />
          <p className="text-[#b3b3b3] text-xs">{playlist.videos?.length || 0} lagu</p>
        </div>
      </div>

      <div className="flex-1 space-y-2.5 mb-4">
        {displayTracks.map((track, i) => (
          <div key={i} className="flex items-center gap-2.5 p-1 rounded-lg hover:bg-white/5 transition-colors">
            <div className="w-9 h-9 rounded-md overflow-hidden relative shrink-0 bg-white/5">
              <Image
                src={track.thumbnails?.[track.thumbnails.length - 1]?.url || 'https://picsum.photos/60/60'}
                alt={track.name}
                fill
                sizes="36px"
                className="object-cover"
              />
            </div>
            <div className="flex flex-col overflow-hidden min-w-0 flex-1">
              <span className="text-white text-xs font-semibold truncate">{track.name}</span>
              <span className="text-[#b3b3b3] text-[11px] truncate">
                {Array.isArray(track.artist) ? track.artist.map((a) => a.name).join(', ') : track.artist?.name || 'Unknown'}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/5">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePlay}
            className="w-11 h-11 bg-[#1DB954] hover:bg-[#1ed760] text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md cursor-pointer"
            title="Putar Playlist"
          >
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </button>
          <button
            onClick={handleRadio}
            className="w-9 h-9 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors cursor-pointer"
            title="Mulai Radio"
          >
            <Radio className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={handleAdd}
          className="w-9 h-9 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors cursor-pointer"
          title={added ? 'Tersimpan di Koleksi' : 'Simpan ke Koleksi'}
        >
          {added ? <Check className="w-4 h-4 text-[#1DB954]" /> : <PlusSquare className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
});
