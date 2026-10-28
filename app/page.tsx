'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  DownloadCloud,
  Play,
  Shuffle,
  Search,
  Flame,
  History,
  Settings,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Music,
  SlidersHorizontal,
  HardDriveDownload,
  Info,
} from 'lucide-react';
import { db, OfflineTrack } from '@/lib/db';
import { Track } from '@/lib/store';
import { useMusic } from '@/context/MusicContext';
import { getHighResImage } from '@/lib/utils';
import { MarqueeText } from '@/components/MarqueeText';
import { toast } from '@/lib/toast';

type FilterType = 'semua' | 'terbaru' | 'artis';

function formatDuration(seconds?: number | string): string {
  if (!seconds) return '0:00';
  const num = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
  if (isNaN(num)) return '0:00';
  const m = Math.floor(num / 60);
  const s = Math.floor(num % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function Home() {
  const router = useRouter();
  const { playTrack, currentTrack, isPlaying } = useMusic();

  const [offlineTracks, setOfflineTracks] = useState<OfflineTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>('semua');
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Load downloaded songs from IndexedDB
  const loadDownloadedTracks = useCallback(async () => {
    try {
      setLoading(true);
      const items = await db.getOfflineTracks();
      const sorted = (items || []).sort(
        (a, b) => (b.downloadedAt || 0) - (a.downloadedAt || 0)
      );
      setOfflineTracks(sorted);
    } catch (err) {
      console.error('Failed to load downloaded tracks on Home:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDownloadedTracks();

    // Auto-sync when window regains focus in case user downloaded a track in the player
    const handleSync = () => {
      db.getOfflineTracks()
        .then((items) => {
          const sorted = (items || []).sort(
            (a, b) => (b.downloadedAt || 0) - (a.downloadedAt || 0)
          );
          setOfflineTracks(sorted);
        })
        .catch(() => {});
    };

    window.addEventListener('focus', handleSync);
    return () => window.removeEventListener('focus', handleSync);
  }, [loadDownloadedTracks]);

  // Dynamic Greeting based on client local time
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 11) return 'Selamat Pagi';
    if (hour < 15) return 'Selamat Siang';
    if (hour < 18) return 'Selamat Sore';
    return 'Selamat Malam';
  }, []);

  // Filtered tracks based on search and selected filter
  const filteredOfflineTracks = useMemo(() => {
    let result = [...offlineTracks];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((item) => {
        const title = item.track?.name?.toLowerCase() || '';
        const artist = Array.isArray(item.track?.artist)
          ? item.track.artist.map((a: any) => a.name).join(' ').toLowerCase()
          : item.track?.artist?.name?.toLowerCase() || '';
        return title.includes(q) || artist.includes(q);
      });
    }

    if (activeFilter === 'terbaru') {
      result.sort((a, b) => (b.downloadedAt || 0) - (a.downloadedAt || 0));
    }

    return result;
  }, [offlineTracks, searchQuery, activeFilter]);

  // Extract unique artists from downloaded songs for artist shelf
  const downloadedArtists = useMemo(() => {
    const map = new Map<string, { name: string; trackCount: number; thumb?: string; tracks: Track[] }>();

    offlineTracks.forEach((item) => {
      const track = item.track;
      if (!track) return;
      const artistName = Array.isArray(track.artist)
        ? track.artist[0]?.name || 'Unknown Artist'
        : track.artist?.name || 'Unknown Artist';

      const thumb = track.thumbnails?.[track.thumbnails.length - 1]?.url;
      const existing = map.get(artistName);

      if (existing) {
        existing.trackCount++;
        existing.tracks.push(track);
      } else {
        map.set(artistName, {
          name: artistName,
          trackCount: 1,
          thumb,
          tracks: [track],
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.trackCount - a.trackCount);
  }, [offlineTracks]);

  // Top 4 - 8 Quick Play Grid items from downloaded songs
  const quickGridItems = useMemo(() => {
    return offlineTracks.slice(0, 8).map((item) => item.track);
  }, [offlineTracks]);

  // Handlers for bulk playback
  const handlePlayAll = useCallback(() => {
    if (filteredOfflineTracks.length === 0) return;
    const tracks = filteredOfflineTracks.map((item) => item.track);
    playTrack(tracks[0], tracks, 'playlist', 0);
    toast.success(`Memutar ${tracks.length} lagu offline`);
  }, [filteredOfflineTracks, playTrack]);

  const handleShufflePlay = useCallback(() => {
    if (filteredOfflineTracks.length === 0) return;
    const tracks = [...filteredOfflineTracks.map((item) => item.track)];
    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }
    playTrack(tracks[0], tracks, 'playlist', 0);
    toast.success(`Memutar acak ${tracks.length} lagu offline`);
  }, [filteredOfflineTracks, playTrack]);

  return (
    <main className="min-h-screen pt-4 pb-28 px-4 md:px-8 max-w-7xl mx-auto select-none">
      {/* 1. Header Bar: Greeting, Offline Status, and Navigation Shortcuts */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pt-1">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#1DB954]/20 text-[#1DB954] border border-[#1DB954]/30 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1DB954] animate-pulse" />
              Offline Mode
            </span>
            <span className="text-xs text-white/40">•</span>
            <span className="text-xs text-white/50 font-medium">IndexedDB Storage</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
            {greeting}
          </h1>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-center shrink-0">
          <Link
            href="/history"
            prefetch={true}
            className="p-2.5 bg-white/5 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors cursor-pointer border border-white/10"
            title="Riwayat Pemutaran"
          >
            <History className="w-4 h-4" />
          </Link>
          <Link
            href="/download"
            prefetch={true}
            className="p-2.5 bg-white/5 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors cursor-pointer border border-white/10 relative"
            title="Kelola Unduhan"
          >
            <DownloadCloud className="w-4 h-4" />
            {offlineTracks.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#1DB954] text-black text-[10px] font-black flex items-center justify-center">
                {offlineTracks.length > 99 ? '99+' : offlineTracks.length}
              </span>
            )}
          </Link>
          <Link
            href="/settings"
            prefetch={true}
            className="p-2.5 bg-white/5 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors cursor-pointer border border-white/10"
            title="Pengaturan"
          >
            <Settings className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* 2. Loading State */}
      {loading ? (
        <div className="space-y-6 animate-pulse py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-white/5 rounded-lg" />
            ))}
          </div>
          <div className="h-36 bg-white/5 rounded-2xl" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-white/5 rounded-xl" />
            ))}
          </div>
        </div>
      ) : offlineTracks.length === 0 ? (
        /* 3. EMPTY STATE (Belum Ada Unduhan / Offline Ready) */
        <section className="min-h-[62vh] flex flex-col items-center justify-center text-center px-4 py-8">
          <div className="relative mb-6">
            {/* Glowing Backdrop */}
            <div className="absolute inset-0 bg-[#1DB954]/20 rounded-full blur-2xl" />
            <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-[#1DB954]/25 via-white/[0.08] to-white/[0.02] border border-[#1DB954]/30 flex items-center justify-center text-[#1DB954] shadow-[0_0_40px_rgba(29,185,84,0.15)]">
              <DownloadCloud className="w-12 h-12 stroke-[1.75]" />
            </div>
          </div>

          <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mb-2.5">
            Belum Ada Lagu yang Diunduh
          </h2>
          <p className="text-sm md:text-base text-[#b3b3b3] max-w-md mx-auto mb-8 leading-relaxed">
            Belum ada lagu yang diunduh. Silakan unduh lagu terlebih dahulu untuk dinikmati saat offline tanpa kuota internet.
          </p>

          {/* Action Navigation Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3.5 w-full max-w-sm mb-10">
            <Link
              href="/search"
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold text-sm rounded-full shadow-[0_8px_20px_rgba(29,185,84,0.3)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <Search className="w-4 h-4 stroke-[2.5]" />
              <span>Cari & Jelajahi Musik</span>
            </Link>
            <Link
              href="/top50"
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-white/10 hover:bg-white/15 text-white font-bold text-sm rounded-full border border-white/10 hover:border-white/20 hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <Flame className="w-4 h-4 text-[#1DB954]" />
              <span>Lihat Top 50 Hits</span>
            </Link>
          </div>

          {/* Quick Guide Card: How to Download */}
          <div className="w-full max-w-md bg-white/[0.03] border border-white/10 rounded-2xl p-5 text-left backdrop-blur-sm">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
              <Info className="w-4 h-4 text-[#1DB954]" />
              <span>Cara Menyimpan Lagu Offline:</span>
            </h3>
            <ol className="space-y-2.5 text-xs text-white/70">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-white/10 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">
                  1
                </span>
                <span>Cari lagu kesukaan Anda di halaman <strong>Cari</strong> atau <strong>Top 50</strong>.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-white/10 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">
                  2
                </span>
                <span>Putar lagu dan buka bar pemutar musik di bagian bawah.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-white/10 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">
                  3
                </span>
                <span>Ketuk ikon <strong>Download</strong> (📥) untuk menyimpan audio langsung ke perangkat.</span>
              </li>
            </ol>
          </div>
        </section>
      ) : (
        /* 4. CONTENT STATE: Downloaded Songs Library */
        <div className="space-y-8">
          {/* 4A. Signature 4-8 Card Quick Play Grid */}
          {quickGridItems.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3 px-1">
                <h2 className="text-sm font-bold text-white/80 uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#1DB954]" />
                  <span>Putar Cepat Lagu Terunduh</span>
                </h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
                {quickGridItems.map((track, idx) => {
                  const thumb = getHighResImage(
                    track.thumbnails?.[track.thumbnails.length - 1]?.url,
                    120
                  );
                  const isCurrent = currentTrack?.videoId === track.videoId;

                  return (
                    <div
                      key={`quick-grid-${track.videoId}-${idx}`}
                      onClick={() => playTrack(track, quickGridItems, 'playlist', idx)}
                      className={`flex items-center bg-white/[0.07] hover:bg-white/[0.14] transition-all duration-200 rounded-lg overflow-hidden cursor-pointer group shadow-sm select-none relative ${
                        isCurrent ? 'ring-1 ring-[#1DB954]/50 bg-white/[0.12]' : ''
                      }`}
                    >
                      <div className="relative w-14 h-14 md:w-16 md:h-16 shrink-0 bg-black/40">
                        <Image
                          src={thumb}
                          alt={track.name}
                          fill
                          sizes="64px"
                          className="object-cover"
                          priority={idx < 4}
                        />
                        <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-[#1DB954] flex items-center justify-center shadow">
                          <CheckCircle2 className="w-2.5 h-2.5 text-black stroke-[3]" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 px-3 flex items-center justify-between">
                        <span className="text-white text-xs md:text-sm font-bold truncate pr-2 leading-snug">
                          {track.name}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playTrack(track, quickGridItems, 'playlist', idx);
                          }}
                          className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-[#1DB954] text-black flex items-center justify-center opacity-0 group-hover:opacity-100 shadow-[0_8px_8px_rgba(0,0,0,0.3)] hover:scale-105 active:scale-95 transition-all duration-200 shrink-0 cursor-pointer"
                          title="Putar"
                        >
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 4B. Hero Download Control Banner */}
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950/40 via-[#181818] to-black border border-white/10 p-5 md:p-6 shadow-xl">
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#1DB954] text-black">
                    Koleksi Offline
                  </span>
                  <span className="text-xs text-white/60">
                    {offlineTracks.length} lagu tersimpan di perangkat
                  </span>
                </div>
                <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
                  Musik Offline Anda
                </h2>
                <p className="text-xs md:text-sm text-[#b3b3b3] mt-1 max-w-lg">
                  Putar semua lagu favorit yang telah diunduh secara instan tanpa memerlukan koneksi internet.
                </p>
              </div>

              {/* Bulk Playback Buttons */}
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={handlePlayAll}
                  className="flex items-center gap-2 px-5 py-3 bg-[#1DB954] hover:bg-[#1ed760] text-black font-extrabold text-xs md:text-sm rounded-full shadow-[0_8px_16px_rgba(29,185,84,0.3)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Putar Semua</span>
                </button>
                <button
                  onClick={handleShufflePlay}
                  className="flex items-center gap-2 px-4 py-3 bg-white/10 hover:bg-white/15 text-white font-bold text-xs md:text-sm rounded-full border border-white/10 hover:border-white/20 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  title="Putar Acak"
                >
                  <Shuffle className="w-4 h-4" />
                  <span className="hidden sm:inline">Acak</span>
                </button>
              </div>
            </div>
          </section>

          {/* 4C. Search & Filter Bar for Downloaded Songs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                placeholder="Cari lagu atau artis di koleksi terunduh..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white/5 hover:bg-white/10 focus:bg-white/10 text-white placeholder-white/40 text-xs md:text-sm rounded-full border border-white/10 focus:border-[#1DB954] outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-xs px-1"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveFilter('semua')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeFilter === 'semua'
                    ? 'bg-white text-black shadow'
                    : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/5'
                }`}
              >
                Semua ({offlineTracks.length})
              </button>
              <button
                onClick={() => setActiveFilter('terbaru')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeFilter === 'terbaru'
                    ? 'bg-white text-black shadow'
                    : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/5'
                }`}
              >
                Terbaru Diunduh
              </button>
              <button
                onClick={() => setActiveFilter('artis')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeFilter === 'artis'
                    ? 'bg-white text-black shadow'
                    : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/5'
                }`}
              >
                Artis ({downloadedArtists.length})
              </button>
            </div>
          </div>

          {/* 4D. Artis Shelf (When 'artis' filter is active or as complementary shelf) */}
          {activeFilter === 'artis' ? (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-white">Artis dalam Koleksi Offline</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {downloadedArtists.map((artist) => (
                  <div
                    key={artist.name}
                    onClick={() => {
                      playTrack(artist.tracks[0], artist.tracks, 'playlist', 0);
                      toast.success(`Memutar lagu dari ${artist.name}`);
                    }}
                    className="p-3 bg-white/[0.04] hover:bg-white/10 rounded-xl cursor-pointer group transition-all text-center flex flex-col items-center"
                  >
                    <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden mb-3 bg-black/40 shadow">
                      {artist.thumb ? (
                        <Image
                          src={getHighResImage(artist.thumb, 200)}
                          alt={artist.name}
                          fill
                          sizes="96px"
                          className="object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-white/5 text-white/40">
                          <Music className="w-8 h-8" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <div className="w-9 h-9 rounded-full bg-[#1DB954] text-black flex items-center justify-center shadow">
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        </div>
                      </div>
                    </div>
                    <span className="text-xs md:text-sm font-bold text-white truncate max-w-full block">
                      {artist.name}
                    </span>
                    <span className="text-[11px] text-[#b3b3b3] mt-0.5 block">
                      {artist.trackCount} lagu terunduh
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            /* 4E. Master List of Downloaded Tracks */
            <section className="space-y-2">
              <div className="flex items-center justify-between pb-1 px-1">
                <h3 className="text-lg md:text-xl font-bold text-white tracking-tight">
                  {searchQuery ? 'Hasil Pencarian Koleksi' : 'Semua Lagu Terunduh'}
                </h3>
                <span className="text-xs text-white/50">
                  {filteredOfflineTracks.length} lagu
                </span>
              </div>

              {filteredOfflineTracks.length === 0 ? (
                <div className="py-12 text-center text-white/50 text-sm">
                  Tidak ditemukan lagu offline dengan kata kunci &quot;{searchQuery}&quot;
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredOfflineTracks.map((item, index) => {
                    const track = item.track;
                    const isCurrent = currentTrack?.videoId === track.videoId;
                    const thumb = getHighResImage(
                      track.thumbnails?.[track.thumbnails.length - 1]?.url,
                      120
                    );
                    const artistName = Array.isArray(track.artist)
                      ? track.artist.map((a: any) => a.name).join(', ')
                      : track.artist?.name || 'Unknown Artist';

                    return (
                      <div
                        key={`downloaded-track-${track.videoId}-${index}`}
                        onClick={() => {
                          const allTracks = filteredOfflineTracks.map((t) => t.track);
                          playTrack(track, allTracks, 'playlist', index);
                        }}
                        className={`flex items-center gap-3 md:gap-4 p-2.5 md:p-3 rounded-xl transition-all cursor-pointer group select-none ${
                          isCurrent
                            ? 'bg-white/10 shadow-sm'
                            : 'hover:bg-white/[0.06]'
                        }`}
                      >
                        {/* Track Index or Equalizer */}
                        <div className="w-6 text-center text-xs text-[#b3b3b3] group-hover:text-white font-mono shrink-0">
                          {isCurrent && isPlaying ? (
                            <div className="flex gap-0.5 items-end h-3.5 justify-center">
                              <div className="w-1 bg-[#1DB954] animate-[bounce_0.8s_infinite_0ms]" />
                              <div className="w-1 bg-[#1DB954] animate-[bounce_0.8s_infinite_200ms]" />
                              <div className="w-1 bg-[#1DB954] animate-[bounce_0.8s_infinite_400ms]" />
                            </div>
                          ) : (
                            index + 1
                          )}
                        </div>

                        {/* Thumbnail with Downloaded Badge */}
                        <div className="relative w-12 h-12 md:w-14 md:h-14 rounded-lg overflow-hidden shrink-0 shadow bg-black/40">
                          <Image
                            src={thumb}
                            alt={track.name}
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                          <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-[#1DB954] flex items-center justify-center shadow">
                            <CheckCircle2 className="w-2.5 h-2.5 text-black stroke-[3]" />
                          </div>
                        </div>

                        {/* Track Details */}
                        <div className="flex-1 min-w-0 pr-2">
                          <MarqueeText
                            text={track.name}
                            className={`text-sm md:text-base font-semibold truncate leading-tight ${
                              isCurrent ? 'text-[#1DB954]' : 'text-white'
                            }`}
                          />
                          <p className="text-xs text-[#b3b3b3] truncate mt-1">
                            {artistName}
                          </p>
                        </div>

                        {/* Duration & Play Action */}
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-[#b3b3b3] font-mono hidden sm:inline">
                            {formatDuration(track.duration)}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const allTracks = filteredOfflineTracks.map((t) => t.track);
                              playTrack(track, allTracks, 'playlist', index);
                            }}
                            className="w-8 h-8 rounded-full bg-white/10 group-hover:bg-[#1DB954] group-hover:text-black text-white flex items-center justify-center transition-all cursor-pointer"
                            title="Putar"
                          >
                            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* 4F. Explore More Banner (Shortcut to search/top50 when user is online) */}
          <section className="pt-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-2xl bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 shrink-0">
                <Music className="w-5 h-5 text-[#1DB954]" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Ingin Menambah Lagu Offline?</h4>
                <p className="text-xs text-white/50">Cari lagu favorit secara online lalu unduh untuk koleksi Anda.</p>
              </div>
            </div>
            <Link
              href="/search"
              className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white font-bold text-xs rounded-full border border-white/10 flex items-center gap-1.5 transition-all shrink-0 hover:scale-105 active:scale-95"
            >
              <span>Eksplorasi Lagu Baru</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </section>
        </div>
      )}
    </main>
  );
}
