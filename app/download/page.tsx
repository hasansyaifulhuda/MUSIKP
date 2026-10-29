'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, DownloadCloud, Play, Shuffle, Trash2, CheckCircle2, Music } from 'lucide-react';
import { db, OfflineTrack } from '@/lib/db';
import { Track } from '@/lib/store';
import { useMusic } from '@/context/MusicContext';
import { getHighResImage } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { MarqueeText } from '@/components/MarqueeText';
import { Equalizer } from '@/components/Equalizer';
import { VirtualTrackList } from '@/components/VirtualTrackList';

export default function DownloadPage() {
  const router = useRouter();
  const [offlineTracks, setOfflineTracks] = useState<OfflineTrack[]>([]);
  const [loading, setLoading] = useState(true);

  const { playTrack, currentTrack, isPlaying } = useMusic();

  const loadOfflineTracks = useCallback(async () => {
    try {
      setLoading(true);
      const data = await db.getOfflineTracks();
      setOfflineTracks([...data].reverse());
    } catch (err) {
      console.error('Failed to load offline tracks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    loadOfflineTracks();

    const handleFocusSync = () => {
      db.getOfflineTracks()
        .then((data) => {
          if (mounted) setOfflineTracks([...data].reverse());
        })
        .catch(() => {});
    };

    window.addEventListener('focus', handleFocusSync);
    return () => {
      mounted = false;
      window.removeEventListener('focus', handleFocusSync);
    };
  }, [loadOfflineTracks]);

  const handlePlayAll = () => {
    if (offlineTracks.length === 0) return;
    const tracks: Track[] = offlineTracks.map((item) => item.track).filter(Boolean);
    if (tracks.length > 0) {
      playTrack(tracks[0], tracks, 'playlist');
      toast.success(`Memutar ${tracks.length} lagu offline`);
    }
  };

  const handleShufflePlay = () => {
    if (offlineTracks.length === 0) return;
    const tracks: Track[] = offlineTracks.map((item) => item.track).filter(Boolean);
    if (tracks.length > 0) {
      const shuffled = [...tracks];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      playTrack(shuffled[0], shuffled, 'playlist');
      toast.success(`Memutar acak ${shuffled.length} lagu offline`);
    }
  };

  const handleRemoveTrack = async (videoId: string, trackName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await db.removeOfflineTrack(videoId);
      setOfflineTracks((prev) => prev.filter((t) => t.videoId !== videoId));
      toast.info(`"${trackName}" dihapus dari unduhan offline`);
    } catch (err) {
      console.error('Remove offline track error:', err);
      toast.error('Gagal menghapus lagu offline');
    }
  };

  const handleClearAll = async () => {
    if (offlineTracks.length === 0) return;
    if (confirm('Hapus semua lagu dari penyimpanan offline?')) {
      try {
        await db.clearOfflineTracks();
        setOfflineTracks([]);
        toast.info('Semua lagu offline berhasil dibersihkan');
      } catch (err) {
        console.error('Clear offline tracks error:', err);
        toast.error('Gagal membersihkan unduhan offline');
      }
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <main className="min-h-screen pb-28 select-none">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-black/60 backdrop-blur-md pt-5 pb-4 px-4 md:px-8 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <button
            onClick={() => router.back()}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
            aria-label="Kembali"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold text-white tracking-tight">
              Download
            </h1>
            <p className="text-xs text-[#b3b3b3] mt-0.5">
              {offlineTracks.length} lagu tersimpan di memori perangkat
            </p>
          </div>
        </div>

        {offlineTracks.length > 0 && (
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={handleClearAll}
              className="text-xs text-white/60 hover:text-red-400 p-2 transition-colors cursor-pointer"
              title="Bersihkan Semua Unduhan"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button
              onClick={handleShufflePlay}
              className="w-9 h-9 sm:w-10 sm:h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer"
              title="Putar Acak Lagu Offline"
            >
              <Shuffle className="w-4 h-4" />
            </button>
            <button
              onClick={handlePlayAll}
              className="flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold text-xs md:text-sm rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Putar Semua</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        {loading ? (
          <div className="space-y-3 py-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : offlineTracks.length === 0 ? (
          <div className="py-24 text-center text-xs text-white/40">
            Belum ada lagu yang diunduh. Lagu yang disimpan saat online akan muncul di sini.
          </div>
        ) : (
          <VirtualTrackList
            tracks={offlineTracks.map((item) => item.track)}
            queue={offlineTracks.map((item) => item.track)}
            renderItem={(track, index) => {
              const isCurrent = currentTrack?.videoId === track.videoId;
              const thumb = getHighResImage(track.thumbnails?.[track.thumbnails.length - 1]?.url, 120);
              const artistName = Array.isArray(track.artist)
                ? track.artist.map((a: any) => a.name).join(', ')
                : track.artist?.name || 'Unknown Artist';

              return (
                <div
                  key={track.videoId ? `${track.videoId}-${index}` : index}
                  onClick={() => {
                    const allTracks = offlineTracks.map((t) => t.track);
                    playTrack(track, allTracks, 'playlist', index);
                  }}
                  className={`flex items-center gap-3.5 p-2.5 md:p-3 rounded-xl transition-all cursor-pointer group select-none ${
                    isCurrent ? 'bg-white/10' : 'hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="w-6 text-center text-xs text-[#b3b3b3] group-hover:text-white font-mono shrink-0">
                    {isCurrent && isPlaying ? (
                      <Equalizer size="sm" />
                    ) : (
                      index + 1
                    )}
                  </div>

                  <div className="relative w-12 h-12 md:w-14 md:h-14 rounded-lg overflow-hidden shrink-0 shadow bg-black/40">
                    <Image
                      src={thumb}
                      alt={track.name}
                      fill
                      sizes="56px"
                      priority={index < 4}
                      loading={index < 4 ? undefined : 'lazy'}
                      decoding="async"
                      className="object-cover"
                    />
                    <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#1DB954] flex items-center justify-center shadow">
                      <CheckCircle2 className="w-3 h-3 text-black stroke-[3]" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 pr-2">
                    <MarqueeText
                      text={track.name}
                      className={`font-semibold text-sm md:text-base leading-tight ${
                        isCurrent ? 'text-[#1DB954]' : 'text-white'
                      }`}
                    />
                    <p className="text-xs text-[#b3b3b3] truncate mt-0.5">{artistName}</p>
                  </div>

                  <div className="hidden sm:block text-xs text-[#b3b3b3] font-mono tabular-nums pr-2">
                    {formatDuration(track.duration)}
                  </div>

                  <button
                    onClick={(e) => handleRemoveTrack(track.videoId, track.name, e)}
                    className="p-2 text-white/40 hover:text-red-400 transition-colors rounded-full hover:bg-white/5 cursor-pointer"
                    title="Hapus dari unduhan"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            }}
          />
        )}
      </div>
    </main>
  );
}
