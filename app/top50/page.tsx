'use client';

import { ArrowLeft, Search, Play, Shuffle, MoreVertical, X, Clock, Heart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { usePlayerStore, Track } from '@/lib/store';
import Image from 'next/image';
import { getHighResImage } from '@/lib/utils';
import { useEffect, useState, useMemo } from 'react';
import { MarqueeText } from '@/components/MarqueeText';

export default function Top50Page() {
  const router = useRouter();
  const history = usePlayerStore((state) => state.history);
  const playCounts = usePlayerStore((state) => state.playCounts);
  const playTrack = usePlayerStore((state) => state.playTrack);
  const setTrackToAdd = usePlayerStore((state) => state.setTrackToAdd);

  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate top 50 tracks
  const uniqueTracks = useMemo(() => {
    const valid = history.filter((item) => item?.track?.videoId);
    return Array.from(new Map(valid.map((item) => [item.track.videoId, item.track])).values());
  }, [history]);

  const topTracks = useMemo(() => {
    return uniqueTracks
      .map((track) => ({
        track,
        count: (track?.videoId && playCounts[track.videoId]) || 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50)
      .map((item) => item.track);
  }, [uniqueTracks, playCounts]);

  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return topTracks;
    const q = searchQuery.toLowerCase();
    return topTracks.filter((t) => {
      if (!t?.name) return false;
      const art = Array.isArray(t.artist)
        ? t.artist.map((a) => a?.name).filter(Boolean).join(' ').toLowerCase()
        : t.artist?.name?.toLowerCase() || '';
      return t.name.toLowerCase().includes(q) || art.includes(q);
    });
  }, [topTracks, searchQuery]);

  if (!mounted) return null;

  const totalDuration = topTracks.reduce((acc, track) => acc + (track.duration || 0), 0);
  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h} jam ${m} mnt`;
    return `${m} mnt ${s} dtk`;
  };

  const coverImage =
    topTracks.length > 0
      ? getHighResImage(topTracks[0].thumbnails?.[topTracks[0].thumbnails.length - 1]?.url, 800)
      : 'https://picsum.photos/seed/top50/800/800';

  const handleShufflePlay = () => {
    if (topTracks.length === 0) return;
    const shuffled = [...topTracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    playTrack(shuffled[0], shuffled, 'playlist');
  };

  return (
    <main className="min-h-screen pb-32 max-w-5xl mx-auto px-4 md:px-8 pt-4">
      {/* Top Header */}
      <div className="sticky top-0 z-20 bg-[#121212]/90 backdrop-blur-xl py-3 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-white hover:bg-white/10 p-2 rounded-full transition-colors cursor-pointer"
            aria-label="Kembali"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">Top 50 Teratas Saya</h1>
        </div>
        <button
          onClick={() => {
            setShowSearch(!showSearch);
            if (showSearch) setSearchQuery('');
          }}
          className="text-white/80 hover:text-white hover:bg-white/10 p-2 rounded-full transition-colors cursor-pointer"
          title="Cari lagu"
        >
          {showSearch ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
        </button>
      </div>

      {/* Search Input Box */}
      {showSearch && (
        <div className="mt-3 relative">
          <Search className="w-4 h-4 text-white/50 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari lagu di Top 50..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
            className="w-full bg-[#1e1e1e] border border-white/10 rounded-full py-2 pl-9 pr-4 text-sm text-white placeholder-white/40 focus:outline-none focus:border-[#1DB954] transition-colors"
          />
        </div>
      )}

      {/* Playlist Hero Banner */}
      <div className="flex flex-col md:flex-row items-center md:items-end gap-6 mt-6 mb-8 p-4 bg-gradient-to-b from-white/10 to-transparent rounded-2xl">
        <div className="relative w-48 h-48 md:w-56 md:h-56 rounded-xl overflow-hidden shadow-2xl shrink-0 bg-black/40">
          <Image src={coverImage} alt="Top 50" fill priority sizes="224px" className="object-cover" />
        </div>
        <div className="flex-1 text-center md:text-left">
          <span className="text-xs font-bold uppercase tracking-wider text-[#b3b3b3]">Daftar Putar Pribadi</span>
          <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight mt-1 mb-2">
            Top 50 Teratas
          </h2>
          <p className="text-[#b3b3b3] text-xs md:text-sm mb-4">
            Lagu yang paling sering Anda putar sepanjang waktu • {topTracks.length} lagu • {formatDuration(totalDuration)}
          </p>

          <div className="flex items-center justify-center md:justify-start gap-4">
            <button
              className="w-14 h-14 bg-[#1DB954] hover:bg-[#1ed760] text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl cursor-pointer"
              onClick={() => topTracks.length > 0 && playTrack(topTracks[0], topTracks, 'playlist')}
              title="Putar Semua"
            >
              <Play className="w-7 h-7 fill-current ml-0.5" />
            </button>
            <button
              onClick={handleShufflePlay}
              className="w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer"
              title="Putar Acak"
            >
              <Shuffle className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Track List */}
      <div className="space-y-1">
        {filteredTracks.map((track, index) => {
          const artistName = Array.isArray(track.artist)
            ? track.artist.map((a) => a.name).join(', ')
            : track.artist?.name || 'Unknown Artist';
          const thumb = getHighResImage(track.thumbnails?.[track.thumbnails.length - 1]?.url, 100);

          return (
            <div
              key={track.videoId + index}
              className="flex items-center gap-3.5 py-2.5 px-3 rounded-lg hover:bg-white/10 transition-colors cursor-pointer group select-none"
              onClick={() => playTrack(track, filteredTracks, 'playlist')}
            >
              <div className="w-7 text-center text-[#b3b3b3] group-hover:text-white font-mono text-sm shrink-0">
                {index + 1}
              </div>
              <div className="relative w-11 h-11 rounded-[4px] overflow-hidden shrink-0 shadow bg-white/5">
                <Image
                  src={thumb}
                  alt={track.name}
                  fill
                  sizes="44px"
                  loading="lazy"
                  decoding="async"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Play className="w-4 h-4 fill-white text-white ml-0.5" />
                </div>
              </div>
              <div className="flex-1 min-w-0 pr-2">
                <MarqueeText text={track.name} className="text-white font-semibold text-sm group-hover:text-[#1DB954] transition-colors" />
                <p className="text-[#b3b3b3] text-xs truncate mt-0.5">{artistName}</p>
              </div>
              {track.duration && (
                <span className="hidden sm:block text-xs text-[#b3b3b3] font-mono tabular-nums pr-2">
                  {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setTrackToAdd(track);
                }}
                className="p-2 text-white/40 hover:text-white transition-colors cursor-pointer"
                title="Tambahkan ke Playlist"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>
          );
        })}

        {filteredTracks.length === 0 && (
          <div className="text-center py-16 text-white/50 space-y-2">
            <Clock className="w-12 h-12 mx-auto opacity-30" />
            <p className="text-base font-medium">
              {searchQuery ? 'Tidak ada lagu yang cocok dengan pencarian' : 'Belum ada lagu yang sering diputar'}
            </p>
            <p className="text-xs text-white/40">
              Putar lagu favorit Anda beberapa kali untuk melihat peringkatnya di sini.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
