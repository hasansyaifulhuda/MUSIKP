'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Disc3 } from 'lucide-react';
import { getHighResImage } from '@/lib/utils';
import AlbumClient from './AlbumClient';
import AlbumTrackClient from './AlbumTrackClient';
import { MarqueeText } from '@/components/MarqueeText';

export default function AlbumPage() {
  const params = useParams();
  const router = useRouter();
  const albumId = params?.id as string;
  const [album, setAlbum] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchAlbum = async () => {
      if (!albumId) return;
      try {
        setLoading(true);
        setError(false);
        const res = await fetch(`/api/album?id=${encodeURIComponent(albumId)}`);
        if (!res.ok) throw new Error('Album not found');
        const raw = await res.json();
        const data = raw?.result !== undefined ? raw.result : raw;
        if (active) {
          setAlbum(data);
        }
      } catch (err) {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchAlbum();
    return () => {
      active = false;
    };
  }, [albumId]);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen pb-24 bg-black flex flex-col items-center justify-center p-8 animate-pulse">
        <div className="w-64 h-64 bg-white/5 rounded-2xl mb-6 shadow-2xl" />
        <div className="w-48 h-6 bg-white/10 rounded-full mb-3" />
        <div className="w-32 h-4 bg-white/5 rounded-full mb-6" />
        <div className="w-full max-w-xl space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 bg-white/5 rounded-lg w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !album) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6 text-white">
        <Disc3 className="w-16 h-16 text-white/20 mb-4 animate-spin-slow" />
        <h2 className="text-xl font-bold mb-2">Album tidak ditemukan</h2>
        <p className="text-sm text-[#b3b3b3] mb-6">Album yang Anda cari mungkin tidak tersedia atau telah dihapus.</p>
        <button
          onClick={() => router.push('/')}
          className="px-6 py-2.5 bg-white text-black font-semibold rounded-full hover:scale-105 transition-all text-sm cursor-pointer"
        >
          Kembali ke Beranda
        </button>
      </div>
    );
  }

  const coverImage =
    album.thumbnails?.[album.thumbnails.length - 1]?.url || 'https://picsum.photos/seed/album/800/800';
  const totalDuration = (album.songs || []).reduce((acc: number, song: any) => acc + (song.duration || 0), 0);

  return (
    <main className="min-h-screen pb-24 bg-black">
      <div className="sticky top-0 z-10 bg-black/60 backdrop-blur-md pt-5 pb-3 px-4 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <button
            onClick={() => router.back()}
            className="text-white hover:bg-white/10 p-2 rounded-full transition-colors shrink-0 cursor-pointer"
            aria-label="Kembali"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <MarqueeText text={album.name} className="text-lg md:text-xl font-bold text-white" />
        </div>
      </div>

      <div className="flex flex-col items-center px-4 mt-6 mb-8 text-center">
        <div className="relative w-56 h-56 md:w-64 md:h-64 rounded-xl overflow-hidden shadow-[0_16px_40px_rgba(0,0,0,0.8)] mb-6 ring-1 ring-white/10">
          <Image
            src={getHighResImage(coverImage, 800)}
            alt={album.name}
            fill
            sizes="(max-width: 640px) 100vw, 300px"
            className="object-cover"
            priority
          />
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-2 max-w-xl line-clamp-2">
          {album.name}
        </h1>
        {album.artist?.artistId ? (
          <Link
            href={`/artist/${album.artist.artistId}`}
            className="text-white/80 hover:text-white hover:underline text-sm md:text-base font-semibold mb-2 transition-colors"
          >
            {album.artist.name}
          </Link>
        ) : (
          <span className="text-white/80 text-sm md:text-base font-semibold mb-2">
            {album.artist?.name || 'Artis'}
          </span>
        )}
        <p className="text-[#b3b3b3] text-xs md:text-sm mb-6">
          {album.year ? `${album.year} • ` : ''}
          {album.songs?.length || 0} lagu • {formatDuration(totalDuration)}
        </p>

        <AlbumClient album={album} />
      </div>

      <div className="max-w-4xl mx-auto px-2 md:px-4 space-y-1">
        {(album.songs || []).map((track: any, index: number) => {
          const artistName = Array.isArray(track.artist)
            ? track.artist.map((a: any) => a.name).join(', ')
            : track.artist?.name || album.artist?.name || 'Artis';

          return (
            <AlbumTrackClient
              key={`${track.videoId || track.id || index}-${index}`}
              track={track}
              index={index}
              album={album}
              artistName={artistName}
            />
          );
        })}
      </div>
    </main>
  );
}
