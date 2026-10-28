'use client';

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { db, SubscribedArtist, SavedAlbum, OfflineTrack } from '@/lib/db';
import { Track, usePlayerStore } from '@/lib/store';
import { TrackItem } from '@/components/TrackItem';
import {
  Heart,
  Plus,
  ListMusic,
  Trash2,
  Play,
  Download,
  TrendingUp,
  Clock,
  Check,
  Shuffle,
  Search,
} from 'lucide-react';
import Image from 'next/image';
import { toast } from '@/lib/toast';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

function LibraryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const isOnline = useOnlineStatus();
  const initialOfflineTabCheckedRef = useRef(false);

  const [likedSongs, setLikedSongs] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [savedAlbums, setSavedAlbums] = useState<SavedAlbum[]>([]);
  const [subscribedArtists, setSubscribedArtists] = useState<SubscribedArtist[]>([]);
  const [offlineTracks, setOfflineTracks] = useState<OfflineTrack[]>([]);
  const [activeTab, setActiveTab] = useState<string>('Semua');
  const [likedSearchQuery, setLikedSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistImg, setNewPlaylistImg] = useState('');
  const playTrack = usePlayerStore((state) => state.playTrack);

  const tabs = ['Semua', 'Daftar putar', 'Lagu Disukai', 'Album', 'Artis', 'Diunduh'];

  // Automatically default to 'Diunduh' once on initial load when offline if no specific tab is selected
  useEffect(() => {
    if (!initialOfflineTabCheckedRef.current && !isOnline && !tabParam) {
      initialOfflineTabCheckedRef.current = true;
      setActiveTab('Diunduh');
    }
  }, [isOnline, tabParam]);

  // Sync tab with URL search query param if present
  useEffect(() => {
    if (!tabParam) return;
    const lower = tabParam.toLowerCase();
    if (lower === 'liked' || lower === 'lagu' || lower === 'lagu-disukai') {
      setActiveTab('Lagu Disukai');
    } else if (lower === 'playlist' || lower === 'playlists') {
      setActiveTab('Daftar putar');
    } else if (lower === 'album' || lower === 'albums') {
      setActiveTab('Album');
    } else if (lower === 'artist' || lower === 'artis') {
      setActiveTab('Artis');
    } else if (lower === 'download' || lower === 'offline' || lower === 'diunduh') {
      setActiveTab('Diunduh');
    }
  }, [tabParam]);

  const loadLibrary = useCallback(async () => {
    try {
      const liked = await db.getLikedSongs();
      const pl = await db.getPlaylists();
      const sa = await db.getSubscribedArtists();
      const albums = await db.getSavedAlbums();
      const offline = await db.getOfflineTracks();
      setLikedSongs(liked);
      setPlaylists(pl);
      setSubscribedArtists(sa);
      setSavedAlbums(albums);
      setOfflineTracks(offline);
    } catch (err) {
      console.error('Failed to load library:', err);
    }
  }, []);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  // Preview of top artists in Liked Songs for Desktop Modern Hero Card
  const likedArtistsPreview = useMemo(() => {
    const names = new Set<string>();
    for (const track of likedSongs) {
      const name = Array.isArray(track.artist)
        ? track.artist.map((a) => a.name).join(', ')
        : track.artist?.name;
      if (name) names.add(name);
      if (names.size >= 5) break;
    }
    return Array.from(names).join(' • ');
  }, [likedSongs]);

  // Total duration calculation for Liked Songs Banner
  const totalLikedDurationFormatted = useMemo(() => {
    const totalSeconds = likedSongs.reduce((acc, t) => acc + (t.duration || 0), 0);
    if (totalSeconds <= 0) return '';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) {
      return `${hours} jam ${minutes} mnt`;
    }
    return `${minutes} mnt`;
  }, [likedSongs]);

  // Real-time search filter inside Liked Songs tab
  const filteredLikedSongs = useMemo(() => {
    if (!likedSearchQuery.trim()) return likedSongs;
    const q = likedSearchQuery.toLowerCase().trim();
    return likedSongs.filter((track) => {
      const titleMatch = track.name?.toLowerCase().includes(q);
      const artistStr = Array.isArray(track.artist)
        ? track.artist.map((a) => a.name).join(' ')
        : track.artist?.name || '';
      const artistMatch = artistStr.toLowerCase().includes(q);
      return titleMatch || artistMatch;
    });
  }, [likedSongs, likedSearchQuery]);

  const handleShuffleLikedSongs = () => {
    if (likedSongs.length === 0) return;
    const shuffled = [...likedSongs].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled, 'playlist');
    toast.success('Memutar acak Lagu Disukai');
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    const name = newPlaylistName.trim();
    const newPlaylist = {
      id: Date.now().toString(),
      name,
      img: newPlaylistImg || 'https://picsum.photos/seed/playlist/200/200',
      tracks: [],
    };
    await db.addPlaylist(newPlaylist);
    toast.success(`Playlist "${name}" berhasil dibuat`);
    setShowCreate(false);
    setNewPlaylistName('');
    setNewPlaylistImg('');
    loadLibrary();
  };

  const handleDeletePlaylist = async (id: string) => {
    if (confirm('Hapus playlist ini?')) {
      await db.deletePlaylist(id);
      toast.info('Playlist berhasil dihapus');
      loadLibrary();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewPlaylistImg(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <main className="min-h-screen pt-4 px-4 md:px-8 pb-32 max-w-6xl mx-auto select-none">
      {/* Header View */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Koleksi Anda</h1>
          <p className="text-xs text-[#b3b3b3] mt-0.5 hidden sm:block">
            Semua musik favorit, playlist, dan unduhan Anda di satu tempat.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
          title="Buat Playlist Baru"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
        </button>
      </div>

      {/* PMUSIC Modern Filter Pills */}
      <div className="flex overflow-x-auto no-scrollbar gap-2 mb-6 snap-x snap-mandatory">
        {tabs.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                if (tab === 'Lagu Disukai') {
                  setLikedSearchQuery('');
                }
              }}
              className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs md:text-sm font-bold transition-all select-none snap-start cursor-pointer ${
                isActive
                  ? 'bg-white text-black shadow-md'
                  : 'bg-[#242424] hover:bg-[#2a2a2a] text-white'
              }`}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* 1. ALL / PLAYLISTS TAB (Featuring PMUSIC Desktop Modern Liked Songs Card) */}
      {/* ========================================================================= */}
      {(activeTab === 'Semua' || activeTab === 'Daftar putar') && (
        <div className="space-y-6">
          {/* Quick Nav Shortcuts */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div
              className="flex items-center gap-3.5 p-3.5 bg-[#181818]/80 hover:bg-[#282828] rounded-xl cursor-pointer transition-colors group select-none shadow-sm border border-white/5"
              onClick={() => setActiveTab('Diunduh')}
            >
              <div className="w-11 h-11 bg-[#1DB954]/20 text-[#1DB954] rounded-lg flex items-center justify-center shrink-0 shadow-md">
                <Download className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-bold text-sm truncate group-hover:text-[#1DB954] transition-colors">
                  Lagu Diunduh
                </h3>
                <p className="text-[#b3b3b3] text-xs mt-0.5">{offlineTracks.length} lagu offline</p>
              </div>
            </div>

            <div
              onClick={() => router.push('/top50')}
              className="flex items-center gap-3.5 p-3.5 bg-[#181818]/80 hover:bg-[#282828] rounded-xl cursor-pointer transition-colors group select-none shadow-sm border border-white/5"
            >
              <div className="w-11 h-11 bg-gradient-to-br from-[#1DB954] to-[#12803b] rounded-lg flex items-center justify-center shrink-0 shadow-md">
                <TrendingUp className="w-5 h-5 text-black" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-bold text-sm truncate group-hover:text-[#1DB954] transition-colors">
                  Top 50 Indonesia
                </h3>
                <p className="text-[#b3b3b3] text-xs mt-0.5">Playlist Viral</p>
              </div>
            </div>

            <div
              onClick={() => router.push('/history')}
              className="flex items-center gap-3.5 p-3.5 bg-[#181818]/80 hover:bg-[#282828] rounded-xl cursor-pointer transition-colors group select-none shadow-sm border border-white/5"
            >
              <div className="w-11 h-11 bg-white/10 rounded-lg flex items-center justify-center shrink-0 shadow-md">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-bold text-sm truncate group-hover:text-[#1DB954] transition-colors">
                  Riwayat Putar
                </h3>
                <p className="text-[#b3b3b3] text-xs mt-0.5">Lagu Terakhir</p>
              </div>
            </div>
          </div>

          {/* Grid Layout: PMUSIC Desktop Modern Liked Songs Card + Playlists */}
          <div>
            <h2 className="text-base font-bold text-white mb-3 px-1">Daftar Putar & Koleksi</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Desktop PMUSIC Modern Liked Songs Hero Card */}
              <div
                onClick={() => setActiveTab('Lagu Disukai')}
                className="relative col-span-1 sm:col-span-2 md:col-span-2 p-6 rounded-2xl cursor-pointer group select-none transition-all duration-300 overflow-hidden bg-gradient-to-br from-[#450af5] via-[#5922e8] to-[#8e8ee5] hover:shadow-2xl hover:shadow-[#450af5]/30 border border-white/10 flex flex-col justify-between min-h-[190px] md:min-h-[220px]"
              >
                {/* Ambient radial glow */}
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform duration-500" />

                <div className="space-y-2 z-10">
                  <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-inner mb-2 group-hover:scale-110 transition-transform">
                    <Heart className="w-6 h-6 fill-white text-white drop-shadow" />
                  </div>
                  <p className="text-xs md:text-sm font-medium text-white/85 line-clamp-2 leading-relaxed">
                    {likedArtistsPreview || 'Lagu favorit yang Anda sukai tersimpan rapi di sini.'}
                  </p>
                </div>

                <div className="flex items-end justify-between z-10 mt-4">
                  <div>
                    <h3 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                      Lagu yang Disukai
                    </h3>
                    <p className="text-xs md:text-sm font-semibold text-white/80 mt-1">
                      {likedSongs.length} lagu disukai
                    </p>
                  </div>

                  {likedSongs.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        playTrack(likedSongs[0], likedSongs, 'playlist');
                      }}
                      className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-[#1DB954] hover:bg-[#1ed760] text-black flex items-center justify-center shadow-xl shadow-black/50 hover:scale-105 active:scale-95 transition-all opacity-0 translate-y-3 group-hover:opacity-100 group-hover:translate-y-0 duration-200 cursor-pointer"
                      title="Putar Semua Lagu Disukai"
                    >
                      <Play className="w-6 h-6 fill-current ml-0.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* User Playlists */}
              {playlists.map((pl) => (
                <div
                  key={pl.id}
                  className="flex flex-col justify-between p-4 bg-[#181818]/70 hover:bg-[#282828] rounded-2xl cursor-pointer transition-all duration-200 group select-none border border-white/5 shadow-sm relative min-h-[190px] md:min-h-[220px]"
                  onClick={() => router.push(`/playlist/${pl.id}`)}
                >
                  <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-white/5 shadow mb-3">
                    <Image src={pl.img} alt={pl.name} fill sizes="(max-width: 768px) 100vw, 300px" className="object-cover group-hover:scale-105 transition-transform duration-300" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (pl.tracks.length > 0) playTrack(pl.tracks[0], pl.tracks, 'playlist');
                        }}
                        className="w-11 h-11 bg-[#1DB954] hover:bg-[#1ed760] rounded-full flex items-center justify-center text-black shadow-lg hover:scale-105 transition-transform cursor-pointer"
                        title="Putar Playlist"
                      >
                        <Play className="w-5 h-5 ml-0.5 fill-current" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0 pr-2">
                      <h4 className="text-white font-bold text-sm truncate group-hover:text-[#1DB954] transition-colors">
                        {pl.name}
                      </h4>
                      <p className="text-[#b3b3b3] text-xs mt-0.5">{pl.tracks?.length || 0} lagu</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePlaylist(pl.id);
                      }}
                      className="p-2 text-white/40 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-colors cursor-pointer"
                      title="Hapus playlist"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. DEDICATED LIKED SONGS VIEW (PMUSIC Desktop Modern Banner & Track List) */}
      {/* ========================================================================= */}
      {activeTab === 'Lagu Disukai' && (
        <div className="space-y-6">
          {/* PMUSIC Desktop Header Banner */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#5038a0]/80 via-[#22184c]/50 to-[#181818]/80 p-6 md:p-8 border border-white/5 shadow-2xl flex flex-col md:flex-row items-start md:items-end gap-6">
            {/* Cover Art Box */}
            <div className="w-32 h-32 md:w-44 md:h-44 rounded-xl shadow-2xl bg-gradient-to-br from-[#450af5] to-[#8e8ee5] flex items-center justify-center shrink-0 border border-white/10 group">
              <Heart className="w-16 h-16 md:w-20 md:h-20 fill-white text-white drop-shadow-xl" />
            </div>

            {/* Meta Information */}
            <div className="flex-1 min-w-0 space-y-2">
              <span className="text-[11px] font-bold tracking-widest uppercase text-white/80 bg-white/10 px-2.5 py-1 rounded-full">
                Daftar Putar
              </span>
              <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight">
                Lagu yang Disukai
              </h2>
              <div className="flex items-center gap-2 text-xs md:text-sm text-white/80 pt-1">
                <span className="font-semibold text-white">Koleksi Anda</span>
                <span>•</span>
                <span>{likedSongs.length} lagu</span>
                {totalLikedDurationFormatted && (
                  <>
                    <span>•</span>
                    <span>{totalLikedDurationFormatted}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Toolbar Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 py-2">
            <div className="flex items-center gap-4">
              {likedSongs.length > 0 && (
                <>
                  <button
                    onClick={() => playTrack(likedSongs[0], likedSongs, 'playlist')}
                    className="w-14 h-14 bg-[#1DB954] hover:bg-[#1ed760] text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-[#1DB954]/20 cursor-pointer"
                    title="Putar Semua"
                  >
                    <Play className="w-7 h-7 fill-current ml-0.5" />
                  </button>
                  <button
                    onClick={handleShuffleLikedSongs}
                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer"
                    title="Putar Acak"
                  >
                    <Shuffle className="w-5 h-5 text-white/80 hover:text-white" />
                  </button>
                </>
              )}
            </div>

            {/* Search Filter Inside Liked Songs */}
            {likedSongs.length > 0 && (
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  type="text"
                  value={likedSearchQuery}
                  onChange={(e) => setLikedSearchQuery(e.target.value)}
                  placeholder="Cari lagu yang disukai..."
                  className="w-full bg-white/10 text-white placeholder-white/40 text-xs rounded-full pl-9 pr-4 py-2 focus:outline-none focus:bg-white/15 focus:ring-1 focus:ring-[#1DB954] transition-all"
                />
              </div>
            )}
          </div>

          {/* Tracks List */}
          <div className="space-y-1">
            {filteredLikedSongs.map((track, i) => (
              <TrackItem key={track.videoId + i} track={track} queue={filteredLikedSongs} index={i} />
            ))}

            {likedSongs.length === 0 && (
              <div className="text-center text-white/50 py-20 space-y-3 bg-[#181818]/40 rounded-2xl border border-white/5">
                <Heart className="w-14 h-14 mx-auto text-white/20" />
                <p className="text-lg font-bold text-white">Belum ada lagu yang disukai</p>
                <p className="text-xs text-white/40 max-w-sm mx-auto">
                  Lagu yang Anda sukai dengan menekan tombol hati akan terkumpul rapi di sini.
                </p>
                <button
                  onClick={() => router.push('/search')}
                  className="mt-2 px-6 py-2.5 bg-white text-black font-bold text-xs rounded-full hover:scale-105 transition-transform shadow-lg cursor-pointer"
                >
                  Cari Lagu Sekarang
                </button>
              </div>
            )}

            {likedSongs.length > 0 && filteredLikedSongs.length === 0 && (
              <div className="text-center text-white/40 py-12">
                <p className="text-sm">Tidak ada lagu yang cocok dengan "{likedSearchQuery}"</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. DOWNLOADED / OFFLINE TAB                                               */}
      {/* ========================================================================= */}
      {activeTab === 'Diunduh' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span>Lagu Diunduh (Offline)</span>
                <Check className="w-5 h-5 text-[#1DB954]" />
              </h2>
              <p className="text-xs text-[#b3b3b3]">Dapat diputar tanpa koneksi internet</p>
            </div>
            {offlineTracks.length > 0 && (
              <button
                onClick={() => playTrack(offlineTracks[0].track, offlineTracks.map((o) => o.track), 'playlist')}
                className="w-12 h-12 bg-[#1DB954] hover:bg-[#1ed760] text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl cursor-pointer"
                title="Putar Offline"
              >
                <Play className="w-6 h-6 fill-current ml-0.5" />
              </button>
            )}
          </div>
          <div className="space-y-1">
            {offlineTracks.map((item, i) => (
              <TrackItem
                key={item.videoId + i}
                track={item.track}
                queue={offlineTracks.map((o) => o.track)}
                index={i}
                onRemove={async (t) => {
                  await db.removeOfflineTrack(t.videoId);
                  loadLibrary();
                }}
              />
            ))}
            {offlineTracks.length === 0 && (
              <div className="text-center text-white/50 py-16 space-y-2">
                <Download className="w-12 h-12 mx-auto opacity-30" />
                <p className="text-base font-semibold">Belum ada lagu yang diunduh</p>
                <p className="text-xs text-white/40">Gunakan tombol download pada pemutar musik untuk menyimpan lagu offline.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. ALBUMS TAB                                                             */}
      {/* ========================================================================= */}
      {activeTab === 'Album' && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white mb-2">Album Disimpan</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {savedAlbums.map((album) => (
              <div
                key={album.albumId}
                className="p-3 bg-[#181818]/60 hover:bg-[#282828] rounded-md cursor-pointer transition-colors duration-200 group select-none shadow-sm flex flex-col"
                onClick={() => router.push(`/album/${album.albumId}`)}
              >
                <div className="relative w-full aspect-square rounded-[4px] overflow-hidden mb-3 shadow bg-black/40">
                  <Image
                    src={album.thumbnails?.[album.thumbnails.length - 1]?.url || 'https://picsum.photos/300/300'}
                    alt={album.name}
                    fill
                    sizes="(max-width: 640px) 50vw, 200px"
                    className="object-cover"
                  />
                  <div className="absolute right-2 bottom-2 w-10 h-10 rounded-full bg-[#1DB954] text-black flex items-center justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 shadow-xl">
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </div>
                </div>
                <h4 className="text-sm font-bold text-white truncate leading-tight group-hover:underline">
                  {album.name}
                </h4>
                <p className="text-xs text-[#b3b3b3] truncate mt-1">{album.artist}</p>
              </div>
            ))}
            {savedAlbums.length === 0 && (
              <div className="col-span-full text-center text-white/50 py-16">Belum ada album yang disimpan.</div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. ARTISTS TAB                                                            */}
      {/* ========================================================================= */}
      {activeTab === 'Artis' && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white mb-2">Artis yang Diikuti</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {subscribedArtists.map((artist) => (
              <div
                key={artist.artistId}
                className="p-3 bg-[#181818]/60 hover:bg-[#282828] rounded-md cursor-pointer transition-colors duration-200 flex flex-col items-center group select-none shadow-sm text-center"
                onClick={() => router.push(`/artist/${artist.artistId}`)}
              >
                <div className="relative w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden mb-3 shadow-lg bg-black/40 group-hover:scale-105 transition-transform duration-200">
                  <Image
                    src={artist.thumbnails?.[artist.thumbnails.length - 1]?.url || 'https://picsum.photos/300/300'}
                    alt={artist.name}
                    fill
                    sizes="128px"
                    className="object-cover"
                  />
                </div>
                <span className="text-sm font-bold text-white truncate w-full group-hover:underline">
                  {artist.name}
                </span>
                <span className="text-xs text-[#b3b3b3] mt-0.5">Artis</span>
              </div>
            ))}
            {subscribedArtists.length === 0 && (
              <div className="col-span-full text-center text-white/50 py-16">Belum ada artis yang diikuti.</div>
            )}
          </div>
        </div>
      )}

      {/* CREATE PLAYLIST MODAL */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-[#242424] rounded-2xl p-6 w-full max-w-sm border border-white/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-white mb-4">Buat Playlist Baru</h2>

            <div className="flex justify-center mb-5">
              <label className="relative w-28 h-28 rounded-xl overflow-hidden cursor-pointer group bg-white/5 flex items-center justify-center border border-dashed border-white/20 hover:border-white/50 transition-colors">
                {newPlaylistImg ? (
                  <Image src={newPlaylistImg} alt="Preview" fill sizes="112px" className="object-cover" />
                ) : (
                  <ListMusic className="w-8 h-8 text-white/50" />
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <span className="text-[11px] font-semibold text-white">Upload Gambar</span>
                </div>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
            </div>

            <input
              type="text"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              placeholder="Nama playlist"
              autoFocus
              className="w-full bg-[#181818] text-white rounded-xl py-2.5 px-4 mb-5 focus:outline-none focus:border-[#1DB954] border border-white/10 text-sm"
            />

            <div className="flex gap-2.5">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2.5 rounded-full font-semibold text-white bg-white/10 hover:bg-white/20 transition-colors text-sm cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleCreatePlaylist}
                disabled={!newPlaylistName.trim()}
                className="flex-1 py-2.5 rounded-full font-bold text-black bg-[#1DB954] hover:bg-[#1ed760] disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm shadow-md cursor-pointer"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function Library() {
  return (
    <Suspense fallback={<div className="min-h-screen pt-8 px-6 text-white/40">Memuat koleksi...</div>}>
      <LibraryContent />
    </Suspense>
  );
}
