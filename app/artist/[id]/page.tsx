'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, Share2, Play, Radio, Check, UserPlus } from 'lucide-react';
import { getHighResImage } from '@/lib/utils';
import { TrackItem } from '@/components/TrackItem';
import { usePlayerStore } from '@/lib/store';
import { db } from '@/lib/db';
import { MarqueeText } from '@/components/MarqueeText';
import { ArtistSkeleton } from '@/components/ArtistSkeleton';
import { toast } from '@/lib/toast';

export default function ArtistPage() {
  const params = useParams();
  const router = useRouter();
  const [artist, setArtist] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isBioExpanded, setIsBioExpanded] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const playTrack = usePlayerStore((state) => state.playTrack);

  useEffect(() => {
    let active = true;
    const fetchArtist = async () => {
      try {
        const res = await fetch(`/api/artist?id=${params.id}`);
        const data = await res.json();
        if (active) {
          setArtist(data);
          if (data && data.artistId) {
            const subscribed = await db.isSubscribed(data.artistId);
            setIsSubscribed(subscribed);
          }
        }
      } catch (error) {
        console.error('Failed to fetch artist:', error);
      } finally {
        if (active) setLoading(false);
      }
    };
    if (params.id) {
      fetchArtist();
    }
    return () => {
      active = false;
    };
  }, [params.id]);

  const handleSubscribe = async () => {
    if (!artist) return;

    if (isSubscribed) {
      await db.removeSubscribedArtist(artist.artistId);
      setIsSubscribed(false);
      toast.info(`Berhenti mengikuti ${artist.name}`);
    } else {
      await db.addSubscribedArtist({
        artistId: artist.artistId,
        name: artist.name,
        thumbnails: artist.thumbnails || [],
        subscribedAt: Date.now(),
      });
      setIsSubscribed(true);
      toast.success(`Mengikuti ${artist.name}`);
    }
  };

  const handleRadio = () => {
    if (artist?.topSongs?.length > 0) {
      playTrack(artist.topSongs[0], artist.topSongs, 'similar');
      toast.info(`Memulai Radio Artis: ${artist.name}`);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: artist?.name || 'Artis Spotify',
          url: window.location.href,
        });
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast.success('Tautan artis disalin ke clipboard');
      } catch {
        toast.info('Tautan: ' + window.location.href);
      }
    }
  };

  if (loading) {
    return <ArtistSkeleton />;
  }

  if (!artist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-white p-4">
        <p className="text-lg font-semibold mb-3">Artis tidak ditemukan</p>
        <button
          onClick={() => router.back()}
          className="px-5 py-2 bg-white/10 hover:bg-white/20 rounded-full text-sm font-bold transition cursor-pointer"
        >
          Kembali
        </button>
      </div>
    );
  }

  const headerImage = getHighResImage(artist.thumbnails?.[artist.thumbnails.length - 1]?.url, 1200);

  return (
    <main className="min-h-screen pb-32">
      {/* Hero Header */}
      <div className="relative h-[45vh] min-h-[320px] w-full">
        <Image
          src={headerImage || 'https://picsum.photos/1200/600'}
          alt={artist.name}
          fill
          sizes="100vw"
          className="object-cover opacity-85"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/50 to-black/30" />

        {/* Top Controls */}
        <div className="absolute top-0 left-0 right-0 p-4 md:p-6 flex justify-between items-center z-10">
          <button
            onClick={() => router.back()}
            className="p-2.5 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full text-white transition cursor-pointer border border-white/10"
            title="Kembali"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <button
            onClick={handleShare}
            className="p-2.5 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full text-white transition cursor-pointer border border-white/10"
            title="Bagikan Artis"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>

        {/* Artist Title & Action Row */}
        <div className="absolute bottom-0 left-0 p-6 md:p-8 w-full max-w-5xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#1DB954]" />
            <span className="text-xs uppercase font-bold tracking-wider text-white/90">Artis Terverifikasi</span>
          </div>
          <h1 className="text-4xl md:text-7xl font-black text-white tracking-tight mb-5 leading-none">
            {artist.name}
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleSubscribe}
              className={`px-5 py-2 rounded-full border text-xs md:text-sm font-bold tracking-wide transition-all cursor-pointer flex items-center gap-1.5 ${
                isSubscribed
                  ? 'bg-white text-black border-white hover:bg-white/90 shadow-md'
                  : 'border-white/30 text-white hover:border-white hover:bg-white/10'
              }`}
            >
              {isSubscribed ? <Check className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              <span>{isSubscribed ? 'Mengikuti' : 'Ikuti'}</span>
            </button>
            <button
              onClick={handleRadio}
              className="px-5 py-2 rounded-full border border-white/30 text-white text-xs md:text-sm font-bold flex items-center gap-2 hover:border-white hover:bg-white/10 transition cursor-pointer"
            >
              <Radio className="w-4 h-4" />
              <span>Radio Artis</span>
            </button>
            <button
              className="w-14 h-14 rounded-full bg-[#1DB954] hover:bg-[#1ed760] text-black flex items-center justify-center ml-auto hover:scale-105 active:scale-95 transition-all shadow-xl cursor-pointer"
              onClick={() => {
                if (artist.topSongs?.length > 0) {
                  playTrack(artist.topSongs[0], artist.topSongs, 'playlist');
                }
              }}
              title="Putar Lagu Teratas"
            >
              <Play className="w-7 h-7 fill-current ml-0.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 mt-6 space-y-10 max-w-5xl">
        {/* Top Songs Shelf */}
        {artist.topSongs && artist.topSongs.length > 0 && (
          <section>
            <h2 className="text-xl md:text-2xl font-bold text-white mb-3 tracking-tight">Populer</h2>
            <div className="flex flex-col gap-1">
              {artist.topSongs.slice(0, 5).map((song: any, index: number) => (
                <TrackItem key={`song-${song.videoId}-${index}`} track={song} queue={artist.topSongs} index={index} />
              ))}
            </div>
          </section>
        )}

        {/* Albums Shelf */}
        {artist.topAlbums && artist.topAlbums.length > 0 && (
          <section>
            <h2 className="text-xl md:text-2xl font-bold text-white mb-3 tracking-tight">Album</h2>
            <div className="flex overflow-x-auto no-scrollbar gap-4 snap-x snap-mandatory pb-3 scroll-smooth">
              {artist.topAlbums.map((album: any, index: number) => (
                <div
                  key={`album-${album.albumId}-${index}`}
                  className="w-36 md:w-44 p-3 bg-[#181818]/60 hover:bg-[#282828] rounded-md shrink-0 snap-start group cursor-pointer transition-colors duration-200 select-none flex flex-col"
                  onClick={() => router.push(`/album/${album.albumId}`)}
                >
                  <div className="relative aspect-square rounded-[4px] overflow-hidden mb-3 shadow-md bg-black/40">
                    <Image
                      src={getHighResImage(album.thumbnails?.[album.thumbnails.length - 1]?.url, 400) || 'https://picsum.photos/300/300'}
                      alt={album.name}
                      fill
                      sizes="176px"
                      className="object-cover"
                    />
                    <div className="absolute right-2 bottom-2 w-10 h-10 rounded-full bg-[#1DB954] text-black flex items-center justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 shadow-xl">
                      <Play className="w-5 h-5 fill-current ml-0.5" />
                    </div>
                  </div>
                  <MarqueeText text={album.name} className="text-white text-sm font-bold truncate leading-tight group-hover:underline" />
                  <p className="text-[#b3b3b3] text-xs mt-1">{album.year || 'Album'}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Singles & EPs Shelf */}
        {artist.topSingles && artist.topSingles.length > 0 && (
          <section>
            <h2 className="text-xl md:text-2xl font-bold text-white mb-3 tracking-tight">Single & EP</h2>
            <div className="flex overflow-x-auto no-scrollbar gap-4 snap-x snap-mandatory pb-3 scroll-smooth">
              {artist.topSingles.map((single: any, index: number) => (
                <div
                  key={`single-${single.albumId}-${index}`}
                  className="w-36 md:w-44 p-3 bg-[#181818]/60 hover:bg-[#282828] rounded-md shrink-0 snap-start group cursor-pointer transition-colors duration-200 select-none flex flex-col"
                  onClick={() => router.push(`/album/${single.albumId}`)}
                >
                  <div className="relative aspect-square rounded-[4px] overflow-hidden mb-3 shadow-md bg-black/40">
                    <Image
                      src={getHighResImage(single.thumbnails?.[single.thumbnails.length - 1]?.url, 400) || 'https://picsum.photos/300/300'}
                      alt={single.name}
                      fill
                      sizes="176px"
                      className="object-cover"
                    />
                    <div className="absolute right-2 bottom-2 w-10 h-10 rounded-full bg-[#1DB954] text-black flex items-center justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 shadow-xl">
                      <Play className="w-5 h-5 fill-current ml-0.5" />
                    </div>
                  </div>
                  <MarqueeText text={single.name} className="text-white text-sm font-bold truncate leading-tight group-hover:underline" />
                  <p className="text-[#b3b3b3] text-xs mt-1">{single.year || 'Single'}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Artist Bio */}
        <section className="bg-white/5 rounded-2xl p-6 border border-white/5">
          <h2 className="text-lg font-bold text-white mb-2">Tentang {artist.name}</h2>
          <div className="text-[#b3b3b3] text-sm leading-relaxed">
            <p className={isBioExpanded ? '' : 'line-clamp-3'}>
              Dengarkan karya-karya terbaik dari {artist.name} di platform ini. Jelajahi berbagai lagu populer, album terbaru, single, dan video musik yang telah dirilis. {artist.name} telah memberikan kontribusi besar dalam industri musik dan terus menghibur para penggemarnya dengan karya-karya yang luar biasa.
            </p>
            <button
              onClick={() => setIsBioExpanded(!isBioExpanded)}
              className="text-white mt-2 text-xs font-bold hover:underline cursor-pointer"
            >
              {isBioExpanded ? 'Tampilkan lebih sedikit' : 'Tampilkan lebih banyak'}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
