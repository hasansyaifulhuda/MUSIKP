'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Track, usePlayerStore } from '@/lib/store';
import { History, Play, Sparkles } from 'lucide-react';
import Image from 'next/image';
import { HorizontalScroll } from '@/components/HorizontalScroll';
import { MixedScroll } from '@/components/MixedScroll';
import { CommunityPlaylistCard } from '@/components/CommunityPlaylistCard';
import { getHighResImage } from '@/lib/utils';
import Link from 'next/link';
import { HomeSkeleton } from '@/components/HomeSkeleton';

const pills = ['Semua', 'Musik', 'Trending', 'Santai', 'Fokus', 'Pop', 'Rock', 'Akustik'];

// In-memory cache for instantaneous navigation without reloading
let homeCache: {
  heroTracks: Track[];
  speedDialTracks: Track[];
  quickPicksTracks: Track[];
  communityPlaylists: any[];
  artists: any[];
  categories: { key: string; title: string; type: 'song' | 'mixed'; items: any[] }[];
} | null = null;

export default function Home() {
  const [heroTracks, setHeroTracks] = useState<Track[]>(homeCache?.heroTracks || []);
  const [speedDialTracks, setSpeedDialTracks] = useState<Track[]>(homeCache?.speedDialTracks || []);
  const [quickPicksTracks, setQuickPicksTracks] = useState<Track[]>(homeCache?.quickPicksTracks || []);
  const [communityPlaylists, setCommunityPlaylists] = useState<any[]>(homeCache?.communityPlaylists || []);
  const [artists, setArtists] = useState<any[]>(homeCache?.artists || []);
  const [categories, setCategories] = useState<{ key: string; title: string; type: 'song' | 'mixed'; items: any[] }[]>(
    homeCache?.categories || []
  );
  const [loading, setLoading] = useState(!homeCache);
  const [activeFilter, setActiveFilter] = useState<string>('Semua');
  const [filterData, setFilterData] = useState<{ title: string; tracks: Track[] }[]>([]);
  const [loadingFilter, setLoadingFilter] = useState(false);

  const playTrack = usePlayerStore((state) => state.playTrack);
  const history = usePlayerStore((state) => state.history);


  // Filter Handling with in-memory caching
  useEffect(() => {
    if (activeFilter === 'Semua') {
      setFilterData([]);
      return;
    }

    let cancelled = false;
    const fetchFilterData = async () => {
      setLoadingFilter(true);
      try {
        const queries = [
          { title: `Hits ${activeFilter} Pilihan`, q: `top ${activeFilter} songs indonesia` },
          { title: `Suasana ${activeFilter}`, q: `${activeFilter} vibes mood songs` },
        ];

        const results = [];
        for (const { title, q } of queries) {
          const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=song`);
          if (res.ok) {
            const data = await res.json();
            results.push({ title, tracks: data.slice(0, 10) });
          }
        }

        if (!cancelled) setFilterData(results);
      } catch (error) {
        console.error('Filter fetch error:', error);
      } finally {
        if (!cancelled) setLoadingFilter(false);
      }
    };

    fetchFilterData();
    return () => {
      cancelled = true;
    };
  }, [activeFilter]);

  const latestHistoryId = history[0]?.track?.videoId || '';

  // Main Home Data Fetcher
  useEffect(() => {
    let cancelled = false;

    const fetchHomeData = async () => {
      try {
        const queries = [
          { key: 'hero', q: 'top hits indonesia viral', type: 'song' },
          { key: 'speedDial', q: 'lagu hits spotify viral 2024', type: 'song' },
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
              const data = await res.json();
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

        // Cache in memory for instant subsequent visits
        homeCache = {
          heroTracks: heroes,
          speedDialTracks: dials,
          quickPicksTracks: picks,
          communityPlaylists: playlists,
          artists: arts,
          categories: cats,
        };
      } catch (error) {
        console.error('Failed to fetch home data:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (!homeCache) {
      fetchHomeData();
    }

    return () => {
      cancelled = true;
    };
  }, [latestHistoryId]);

  // Spotify Top 6-8 Quick Play Grid items (History + SpeedDial)
  const quickGridItems = useMemo(() => {
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

  // Handle Play All Quick Picks
  const handlePlayAllQuickPicks = useCallback(() => {
    if (quickPicksTracks.length > 0) {
      playTrack(quickPicksTracks[0], quickPicksTracks, 'playlist');
    }
  }, [quickPicksTracks, playTrack]);

  return (
    <main className="min-h-screen pt-4 pb-12 px-4 md:px-8 max-w-7xl mx-auto select-none">
      {/* 1. Spotify Top Navigation & Filter Pills Bar */}
      <header className="flex items-center justify-between gap-3 mb-6 pt-1">
        <div className="flex items-center overflow-x-auto no-scrollbar gap-2 flex-1 snap-x snap-mandatory py-1">
          {pills.map((pill) => {
            const isActive = activeFilter === pill;
            return (
              <button
                key={pill}
                onClick={() => setActiveFilter(pill)}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs md:text-sm font-bold transition-all select-none snap-start cursor-pointer ${
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
        <div className="flex items-center gap-2.5 shrink-0">
          <Link
            href="/history"
            className="p-2 bg-black/30 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors cursor-pointer border border-white/5"
            title="Riwayat Pemutaran"
          >
            <History className="w-5 h-5" />
          </Link>
          <Link
            href="/settings"
            className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center relative border border-white/10 cursor-pointer hover:scale-105 transition-transform"
            title="Pengaturan"
          >
            <Image
              src="https://f.top4top.io/p_3733w0g4e0.jpg"
              alt="Pengaturan"
              fill
              sizes="36px"
              className="object-cover"
            />
          </Link>
        </div>
      </header>

      {/* 3. SPOTIFY SIGNATURE 6-8 CARD QUICK PLAY GRID */}
      {activeFilter === 'Semua' && quickGridItems.length > 0 && (
        <section className="mb-8">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 md:gap-3">
            {quickGridItems.map((track, idx) => {
              const thumb = getHighResImage(track.thumbnails?.[track.thumbnails.length - 1]?.url, 120);
              return (
                <div
                  key={`quick-grid-${track.videoId}-${idx}`}
                  onClick={() => playTrack(track, quickGridItems, 'similar', idx)}
                  className="flex items-center bg-white/[0.07] hover:bg-white/[0.14] transition-colors duration-200 rounded-[4px] md:rounded-[6px] overflow-hidden cursor-pointer group shadow-sm select-none relative"
                >
                  <div className="relative w-12 h-12 md:w-16 md:h-16 shrink-0 shadow bg-black/40">
                    <Image src={thumb} alt={track.name} fill sizes="64px" className="object-cover" />
                  </div>
                  <div className="flex-1 min-w-0 px-3 flex items-center justify-between">
                    <span className="text-white text-xs md:text-sm font-bold truncate pr-2 leading-snug">
                      {track.name}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        playTrack(track, quickGridItems, 'similar', idx);
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

      {/* 4. MAIN DASHBOARD CONTENT AREA */}
      {loading || (activeFilter !== 'Semua' && loadingFilter) ? (
        <HomeSkeleton />
      ) : activeFilter !== 'Semua' ? (
        <div className="space-y-8">
          {filterData.map((cat, i) => (
            <HorizontalScroll key={i} title={cat.title} tracks={cat.tracks} />
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
                              <h4 className="text-white font-semibold text-sm truncate group-hover:text-[#1DB954] transition-colors leading-tight">
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

          {/* Top Popular Artists (Round Spotify Cards) */}
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
              <MixedScroll key={i} title={cat.title} items={cat.items} />
            ) : (
              <HorizontalScroll key={i} title={cat.title} tracks={cat.items} />
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
    </main>
  );
}
