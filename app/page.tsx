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
  History,
  Settings,
  CheckCircle2,
  Music,
  ArrowRight,
  HardDriveDownload,
  Info,
  Sparkles,
} from 'lucide-react';
import { db, OfflineTrack } from '@/lib/db';
import { Track, usePlayerStore } from '@/lib/store';
import { useMusic } from '@/context/MusicContext';
import { getHighResImage } from '@/lib/utils';
import { MarqueeText } from '@/components/MarqueeText';
import { toast } from '@/lib/toast';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { HorizontalScroll } from '@/components/HorizontalScroll';
import { MixedScroll } from '@/components/MixedScroll';
import { CommunityPlaylistCard } from '@/components/CommunityPlaylistCard';
import { HomeSkeleton } from '@/components/HomeSkeleton';

const ONLINE_PILLS = ['Semua', 'Musik', 'Trending', 'Santai', 'Fokus', 'Pop', 'Rock', 'Akustik'];

function formatDuration(seconds?: number | string): string {
  if (!seconds) return '0:00';
  const num = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
  if (isNaN(num)) return '0:00';
  const m = Math.floor(num / 60);
  const s = Math.floor(num % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// In-memory cache for instant online home navigation without repeated network requests
let homeCache: {
  heroTracks: Track[];
  speedDialTracks: Track[];
  quickPicksTracks: Track[];
  communityPlaylists: any[];
  artists: any[];
  categories: { key: string; title: string; type: 'song' | 'mixed'; items: any[] }[];
} | null = null;

export default function Home() {
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const { playTrack, currentTrack, isPlaying } = useMusic();
  const history = usePlayerStore((state) => state.history);

  // -------------------------------------------------------------
  // Offline State (IndexedDB)
  // -------------------------------------------------------------
  const [offlineTracks, setOfflineTracks] = useState<OfflineTrack[]>([]);
  const [offlineLoading, setOfflineLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // -------------------------------------------------------------
  // Online State (API Stream & Shelves)
  // -------------------------------------------------------------
  const [heroTracks, setHeroTracks] = useState<Track[]>(homeCache?.heroTracks || []);
  const [speedDialTracks, setSpeedDialTracks] = useState<Track[]>(homeCache?.speedDialTracks || []);
  const [quickPicksTracks, setQuickPicksTracks] = useState<Track[]>(homeCache?.quickPicksTracks || []);
  const [communityPlaylists, setCommunityPlaylists] = useState<any[]>(homeCache?.communityPlaylists || []);
  const [artists, setArtists] = useState<any[]>(homeCache?.artists || []);
  const [categories, setCategories] = useState<
    { key: string; title: string; type: 'song' | 'mixed'; items: any[] }[]
  >(homeCache?.categories || []);
  const [onlineLoading, setOnlineLoading] = useState(!homeCache);
  const [activeOnlineFilter, setActiveOnlineFilter] = useState<string>('Semua');
  const [filterData, setFilterData] = useState<{ title: string; tracks: Track[] }[]>([]);
  const [loadingFilter, setLoadingFilter] = useState(false);



  // -------------------------------------------------------------
  // 1. Load Downloaded Tracks from IndexedDB
  // -------------------------------------------------------------
  const loadDownloadedTracks = useCallback(async () => {
    try {
      setOfflineLoading(true);
      const items = await db.getOfflineTracks();
      const sorted = (items || []).sort(
        (a, b) => (b.downloadedAt || 0) - (a.downloadedAt || 0)
      );
      setOfflineTracks(sorted);
    } catch (err) {
      console.warn('Failed to load downloaded tracks on Home:', err);
    } finally {
      setOfflineLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDownloadedTracks();

    // Auto-sync when window regains focus in case user downloaded/deleted a track
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

  // -------------------------------------------------------------
  // 2. Load Online Data (when online)
  // -------------------------------------------------------------
  useEffect(() => {
    if (!isOnline) return;

    let cancelled = false;

    const fetchHomeData = async () => {
      try {
        const queries = [
          { key: 'hero', q: 'top hits indonesia viral', type: 'song' },
          { key: 'speedDial', q: 'lagu hits viral 2024', type: 'song' },
          { key: 'quickPicks', q: 'pop indonesia hits terbaru', type: 'song' },
          { key: 'community', q: 'chill acoustic indonesia', type: 'playlist' },
          { key: 'artists', q: 'artis indonesia populer', type: 'artist' },
          { key: 'cat0', title: 'Trending Hari Ini', q: 'lagu indonesia hits terbaru', type: 'song' },
          { key: 'cat1', title: 'Rilis Terbaru Pilihan', q: 'lagu pop indonesia rilis terbaru', type: 'song' },
          { key: 'cat2', title: 'Top 50 Indonesia', q: 'top 50 indonesia playlist update', type: 'song' },
          { key: 'cat3', title: 'Viral di TikTok', q: 'lagu fyp tiktok viral', type: 'song' },
          { key: 'cat4', title: 'Santai Bersama Akustik', q: 'lagu akustik cafe santai', type: 'song' },
          { key: 'cat5', title: 'Rock & Alternatif Terbaik', q: 'lagu rock indonesia terbaik', type: 'song' },
        ];

        const chunkResults = await Promise.all(
          queries.map(async ({ key, title, q, type }) => {
            try {
              const url = type
                ? `/api/search?q=${encodeURIComponent(q)}&type=${type}`
                : `/api/search?q=${encodeURIComponent(q)}`;
              const res = await fetch(url);
              if (!res.ok) return { key, title, data: [] };
              const raw = await res.json();
              const data = Array.isArray(raw) ? raw : raw?.result || [];
              return { key, title, data };
            } catch {
              return { key, title, data: [] };
            }
          })
        );

        if (cancelled) return;

        let heroes: Track[] = [];
        let dials: Track[] = [];
        let picks: Track[] = [];
        let playlists: any[] = [];
        let arts: any[] = [];
        const cats: { key: string; title: string; type: 'song' | 'mixed'; items: any[] }[] = [];

        chunkResults.forEach(({ key, title, data }) => {
          if (!data || data.length === 0) return;
          if (key === 'hero') heroes = data.slice(0, 4);
          else if (key === 'speedDial') dials = data.slice(0, 30);
          else if (key === 'quickPicks') picks = data.slice(0, 16);
          else if (key === 'community') playlists = data.slice(0, 10);
          else if (key === 'artists') arts = data.slice(0, 12);
          else if (key.startsWith('cat') && title) {
            cats.push({ key, title, type: 'song', items: data.slice(0, 10) });
          }
        });

        setHeroTracks(heroes);
        setSpeedDialTracks(dials);
        setQuickPicksTracks(picks);
        setCommunityPlaylists(playlists);
        setArtists(arts);
        setCategories(cats);

        homeCache = {
          heroTracks: heroes,
          speedDialTracks: dials,
          quickPicksTracks: picks,
          communityPlaylists: playlists,
          artists: arts,
          categories: cats,
        };
      } catch (error) {
        console.warn('Failed to fetch home data:', error);
      } finally {
        if (!cancelled) setOnlineLoading(false);
      }
    };

    if (!homeCache || homeCache.categories.length === 0) {
      fetchHomeData();
    } else {
      setOnlineLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [isOnline]);

  // Online Filter Query handling
  useEffect(() => {
    if (!isOnline || activeOnlineFilter === 'Semua') {
      setFilterData([]);
      return;
    }

    let cancelled = false;
    const fetchFilterData = async () => {
      setLoadingFilter(true);
      try {
        const queries = [
          { title: `Hits ${activeOnlineFilter} Pilihan`, q: `top ${activeOnlineFilter} songs indonesia` },
          { title: `Suasana ${activeOnlineFilter}`, q: `${activeOnlineFilter} vibes mood songs` },
        ];

        const results = [];
        for (const { title, q } of queries) {
          const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=song`);
          if (res.ok) {
            const raw = await res.json();
            const data = Array.isArray(raw) ? raw : raw?.result || [];
            results.push({ title, tracks: data.slice(0, 10) });
          }
        }

        if (!cancelled) setFilterData(results);
      } catch (error) {
        console.warn('Filter fetch error:', error);
      } finally {
        if (!cancelled) setLoadingFilter(false);
      }
    };

    fetchFilterData();
    return () => {
      cancelled = true;
    };
  }, [activeOnlineFilter, isOnline]);

  // Online Quick Play Grid (History + SpeedDial)
  const onlineQuickGridItems = useMemo(() => {
    const list: Track[] = [];
    history.slice(0, 8).forEach((h) => {
      if (!list.some((t) => t.videoId === h.track.videoId)) {
        list.push(h.track);
      }
    });
    heroTracks.concat(speedDialTracks).forEach((t) => {
      if (list.length < 8 && !list.some((x) => x.videoId === t.videoId)) {
        list.push(t);
      }
    });
    return list.slice(0, 8);
  }, [history, heroTracks, speedDialTracks]);

  // -------------------------------------------------------------
  // 3. Offline Mode Helpers (Filtered tracks)
  // -------------------------------------------------------------
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

    return result;
  }, [offlineTracks, searchQuery]);

  const handlePlayAllOffline = useCallback(() => {
    if (filteredOfflineTracks.length === 0) return;
    const tracks = filteredOfflineTracks.map((item) => item.track);
    playTrack(tracks[0], tracks, 'playlist', 0);
    toast.success(`Memutar ${tracks.length} lagu offline`);
  }, [filteredOfflineTracks, playTrack]);

  const handleShufflePlayOffline = useCallback(() => {
    if (filteredOfflineTracks.length === 0) return;
    const tracks = [...filteredOfflineTracks.map((item) => item.track)];
    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }
    playTrack(tracks[0], tracks, 'playlist', 0);
    toast.success(`Memutar acak ${tracks.length} lagu offline`);
  }, [filteredOfflineTracks, playTrack]);

  const handlePlayAllQuickPicks = useCallback(() => {
    if (quickPicksTracks.length > 0) {
      playTrack(quickPicksTracks[0], quickPicksTracks, 'playlist');
    }
  }, [quickPicksTracks, playTrack]);

  // =========================================================================
  // VIEW RENDERER: Dynamically Switch based on isOnline (No Full-Screen Blocker)
  // =========================================================================

  return (
    <main className="min-h-screen pt-4 pb-28 px-4 md:px-8 max-w-7xl mx-auto select-none">
      {/* 1. OFFLINE VIEW HEADER (When Offline) */}
      {!isOnline && (
        <header className="flex items-center justify-between gap-4 mb-4 pt-1">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              Lagu Unduhan
            </h1>
            {!offlineLoading && offlineTracks.length > 0 && (
              <span className="text-xs text-white/40 font-medium">
                {filteredOfflineTracks.length} lagu
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {filteredOfflineTracks.length > 0 && (
              <>
                <button
                  onClick={handlePlayAllOffline}
                  className="px-3.5 py-1.5 bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold text-xs rounded-full flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer shadow-sm"
                  title="Putar Semua"
                >
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  <span className="hidden sm:inline">Putar Semua</span>
                </button>
                <button
                  onClick={handleShufflePlayOffline}
                  className="p-2 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white rounded-full border border-white/10 transition-colors cursor-pointer"
                  title="Putar Acak"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                </button>
              </>
            )}

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
      )}

      {/* 2. DYNAMIC VIEW SWITCHER */}
      {isOnline ? (
        /* ========================================================================= */
        /* ONLINE VIEW: Clean Direct Categories & Music Shelves (No Greeting Header) */
        /* ========================================================================= */
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Online Category Pills & Top Utility Navigation */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center overflow-x-auto no-scrollbar gap-2 snap-x snap-mandatory py-1 flex-1 min-w-0">
              {ONLINE_PILLS.map((pill) => {
                const isActive = activeOnlineFilter === pill;
                return (
                  <button
                    key={pill}
                    onClick={() => setActiveOnlineFilter(pill)}
                    className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs md:text-sm font-bold transition-all select-none snap-start cursor-pointer shrink-0 ${
                      isActive
                        ? 'bg-white text-black shadow-md'
                        : 'bg-[#242424] hover:bg-[#2a2a2a] text-white hover:text-white'
                    }`}
                  >
                    {pill}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 shrink-0">
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
          </div>

          {/* Quick Play 6-8 Grid */}
          {activeOnlineFilter === 'Semua' && onlineQuickGridItems.length > 0 && (
            <section className="mb-8">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 md:gap-3">
                {onlineQuickGridItems.map((track, idx) => {
                  const thumb = getHighResImage(track.thumbnails?.[track.thumbnails.length - 1]?.url, 120);
                  const isCurrent = currentTrack?.videoId === track.videoId;
                  return (
                    <div
                      key={`quick-grid-${track.videoId}-${idx}`}
                      onClick={() => playTrack(track, onlineQuickGridItems, 'similar', idx)}
                      className={`flex items-center transition-colors duration-200 rounded-[4px] md:rounded-[6px] overflow-hidden cursor-pointer group shadow-sm select-none relative ${
                        isCurrent ? 'bg-white/[0.15]' : 'bg-white/[0.07] hover:bg-white/[0.14]'
                      }`}
                    >
                      <div className="relative w-12 h-12 md:w-16 md:h-16 shrink-0 shadow bg-black/40">
                        <Image
                          src={thumb}
                          alt={track.name}
                          fill
                          sizes="64px"
                          className="object-cover"
                          priority={idx < 4}
                        />
                      </div>
                      <div className="flex-1 min-w-0 px-3 flex items-center justify-between">
                        <span className={`text-xs md:text-sm font-bold truncate pr-2 leading-snug ${
                          isCurrent ? 'text-[#1DB954]' : 'text-white'
                        }`}>
                          {track.name}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playTrack(track, onlineQuickGridItems, 'similar', idx);
                          }}
                          className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-[#1DB954] text-black flex items-center justify-center opacity-0 group-hover:opacity-100 shadow-[0_8px_8px_rgba(0,0,0,0.3)] hover:scale-105 active:scale-95 transition-all duration-200 shrink-0 cursor-pointer"
                          title="Putar"
                        >
                          <Play className="w-4 h-4 md:w-5 md:h-5 fill-current ml-0.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Online Main Dashboard Content Area */}
          {onlineLoading || (activeOnlineFilter !== 'Semua' && loadingFilter) ? (
            <HomeSkeleton />
          ) : activeOnlineFilter !== 'Semua' ? (
            <div className="space-y-8">
              {filterData.map((cat, i) => (
                <HorizontalScroll key={`filter-${cat.title}-${i}`} title={cat.title} tracks={cat.tracks} />
              ))}
            </div>
          ) : (
            <div className="space-y-8">
              {/* Quick Picks Shelf */}
              {quickPicksTracks.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div>
                      <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight hover:underline cursor-pointer">
                        Pilihan Cepat
                      </h2>
                      <p className="text-xs text-[#b3b3b3] mt-0.5">Dipilih khusus sesuai selera musik Anda</p>
                    </div>
                    <button
                      onClick={handlePlayAllQuickPicks}
                      className="text-xs font-bold text-white/90 hover:text-white border border-white/20 rounded-full px-3.5 py-1.5 hover:border-white hover:scale-105 transition-all cursor-pointer"
                    >
                      Putar Semua
                    </button>
                  </div>

                  <div className="flex overflow-x-auto no-scrollbar gap-4 pb-2 snap-x snap-mandatory scroll-smooth">
                    {Array.from({ length: Math.ceil(quickPicksTracks.length / 4) }).map((_, i) => {
                      const chunk = quickPicksTracks.slice(i * 4, i * 4 + 4);
                      return (
                        <div
                          key={`quickpicks-chunk-${i}`}
                          className="w-[85vw] sm:w-[380px] shrink-0 snap-start flex flex-col gap-1.5"
                        >
                          {chunk.map((track, j) => {
                            const thumb = getHighResImage(track.thumbnails?.[track.thumbnails.length - 1]?.url, 100);
                            const art = Array.isArray(track.artist)
                              ? track.artist.map((a) => a.name).join(', ')
                              : track.artist?.name || 'Unknown Artist';
                            const isCurrent = currentTrack?.videoId === track.videoId;
                            return (
                              <div
                                key={`quickpicks-${track.videoId}-${j}`}
                                className="flex items-center gap-3 cursor-pointer group hover:bg-white/10 p-2 rounded-md transition-colors select-none"
                                onClick={() => playTrack(track, quickPicksTracks, 'similar')}
                              >
                                <div className="relative w-12 h-12 rounded-[4px] overflow-hidden shrink-0 shadow-md bg-white/5">
                                  <Image src={thumb} alt={track.name} fill sizes="48px" className="object-cover" />
                                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Play className="w-4 h-4 fill-white text-white ml-0.5" />
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className={`font-semibold text-sm truncate transition-colors leading-tight ${
                                    isCurrent ? 'text-[#1DB954]' : 'text-white group-hover:text-[#1DB954]'
                                  }`}>
                                    {track.name}
                                  </h4>
                                  <p className="text-[#b3b3b3] text-xs truncate mt-0.5">{art}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Downloaded Songs Shelf (accessible even while Online!) */}
              {offlineTracks.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight hover:underline cursor-pointer">
                        Lagu Terunduh (Offline Ready)
                      </h2>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#1DB954]/20 text-[#1DB954] border border-[#1DB954]/30">
                        {offlineTracks.length} Lagu
                      </span>
                    </div>
                    <Link
                      href="/download"
                      className="text-xs font-bold text-white/80 hover:text-white transition-colors"
                    >
                      Lihat Semua
                    </Link>
                  </div>
                  <HorizontalScroll
                    title=""
                    tracks={offlineTracks.slice(0, 15).map((it) => it.track)}
                  />
                </section>
              )}

              {/* Popular Artists Shelf */}
              {artists.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight hover:underline cursor-pointer">
                      Artis Terpopuler
                    </h2>
                  </div>
                  <div className="flex overflow-x-auto no-scrollbar gap-4 pb-2 snap-x snap-mandatory scroll-smooth">
                    {artists.map((artist, i) => {
                      const artistName = artist.name || 'Artist';
                      const thumb = getHighResImage(artist.thumbnails?.[artist.thumbnails.length - 1]?.url, 400);
                      return (
                        <Link
                          href={`/artist/${artist.artistId}`}
                          key={`artist-${artist.artistId}-${i}`}
                          className="flex-none w-36 md:w-44 p-3 bg-[#181818]/60 hover:bg-[#282828] rounded-md cursor-pointer group snap-start transition-colors duration-200 select-none shadow-sm flex flex-col items-center text-center"
                        >
                          <div className="relative w-28 h-28 md:w-36 md:h-36 rounded-full overflow-hidden shadow-xl bg-black/40 mb-3 group-hover:scale-105 transition-transform duration-200">
                            <Image src={thumb} alt={artistName} fill sizes="144px" className="object-cover" />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <div className="w-10 h-10 rounded-full bg-[#1DB954] text-black flex items-center justify-center shadow-lg">
                                <Play className="w-5 h-5 fill-current ml-0.5" />
                              </div>
                            </div>
                          </div>
                          <div className="w-full">
                            <span className="text-sm font-bold text-white truncate block group-hover:underline">
                              {artistName}
                            </span>
                            <span className="text-xs text-[#b3b3b3] block mt-0.5">Artis</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Categorized Shelves */}
              {categories.map((cat, i) =>
                cat.type === 'mixed' ? (
                  <MixedScroll key={`cat-mixed-${cat.key || i}`} title={cat.title} items={cat.items} />
                ) : (
                  <HorizontalScroll key={`cat-song-${cat.key || i}`} title={cat.title} tracks={cat.items} />
                )
              )}

              {/* Community Playlists */}
              {communityPlaylists.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight hover:underline cursor-pointer">
                      Playlist Komunitas
                    </h2>
                  </div>
                  <div className="flex overflow-x-auto no-scrollbar gap-4 pb-2 snap-x snap-mandatory scroll-smooth">
                    {communityPlaylists.map((playlist, i) => {
                      const id = playlist.playlistId;
                      if (!id) return null;
                      return <CommunityPlaylistCard key={`community-playlist-${id}-${i}`} playlistId={id} />;
                    })}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ========================================================================= */
        /* OFFLINE VIEW: 100% Focused on Downloaded Tracks List (Clean & Minimalist)  */
        /* ========================================================================= */
        <div className="space-y-4 animate-in fade-in duration-300">
          {offlineLoading ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-14 bg-white/[0.03] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : offlineTracks.length === 0 ? (
            /* Clean Minimalist Empty State */
            <div className="py-20 text-center text-xs text-white/40">
              Belum ada lagu terunduh. Lagu yang disimpan saat online akan otomatis muncul di sini.
            </div>
          ) : (
            /* Total Focus on Downloaded Track List */
            <>
              {/* Compact Search Bar if user has multiple tracks */}
              {offlineTracks.length > 4 && (
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-white/30 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari lagu unduhan..."
                    className="w-full max-w-xs bg-white/[0.04] hover:bg-white/[0.06] focus:bg-white/[0.08] border border-white/10 rounded-full py-1.5 pl-9 pr-3 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-colors"
                  />
                </div>
              )}

              {filteredOfflineTracks.length === 0 ? (
                <div className="py-12 text-center text-white/40 text-xs">
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
                        key={`offline-track-${track.videoId}-${index}`}
                        onClick={() => {
                          const allTracks = filteredOfflineTracks.map((t) => t.track);
                          playTrack(track, allTracks, 'playlist', index);
                        }}
                        className={`flex items-center gap-3 md:gap-4 p-2.5 rounded-xl transition-all cursor-pointer group select-none ${
                          isCurrent
                            ? 'bg-white/10 text-white shadow-sm'
                            : 'hover:bg-white/[0.05] text-white/90'
                        }`}
                      >
                        {/* Track Index or Equalizer */}
                        <div className="w-6 text-center text-xs text-white/40 group-hover:text-white font-mono shrink-0">
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
                        <div className="relative w-11 h-11 md:w-12 md:h-12 rounded-lg overflow-hidden shrink-0 shadow bg-white/5">
                          <Image
                            src={thumb}
                            alt={track.name}
                            fill
                            sizes="48px"
                            className="object-cover"
                          />
                          <div className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-[#1DB954] flex items-center justify-center shadow">
                            <CheckCircle2 className="w-2 h-2 text-black stroke-[3]" />
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
                          <p className="text-xs text-white/50 truncate mt-0.5">
                            {artistName}
                          </p>
                        </div>

                        {/* Duration & Play Action */}
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-white/40 font-mono hidden sm:inline">
                            {formatDuration(track.duration)}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const allTracks = filteredOfflineTracks.map((t) => t.track);
                              playTrack(track, allTracks, 'playlist', index);
                            }}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                              isCurrent
                                ? 'bg-[#1DB954] text-black opacity-100 shadow'
                                : 'bg-white/10 text-white opacity-0 group-hover:opacity-100 hover:bg-[#1DB954] hover:text-black'
                            }`}
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
            </>
          )}
        </div>
      )}
    </main>
  );
}
