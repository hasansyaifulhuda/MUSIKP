'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { db, RecentSearch } from '@/lib/db';
import { TrackItem } from '@/components/TrackItem';
import { ArtistItem } from '@/components/ArtistItem';
import { Search as SearchIcon, ArrowLeft, X, ArrowUpLeft, History } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SearchSkeleton } from '@/components/SearchSkeleton';

export default function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('Semua');
  const [isFocused, setIsFocused] = useState(false);
  const router = useRouter();

  const tabs = ['Semua', 'Lagu', 'Video', 'Album', 'Artis'];

  const tracksQueue = useMemo(() => results.filter((r) => r.type !== 'ARTIST'), [results]);

  const displayedResults = useMemo(() => {
    return results.filter((item) => {
      if (activeTab === 'Semua') return true;
      if (activeTab === 'Lagu') return item.type === 'SONG';
      if (activeTab === 'Video') return item.type === 'VIDEO';
      if (activeTab === 'Artis') return item.type === 'ARTIST';
      return false;
    });
  }, [results, activeTab]);

  useEffect(() => {
    const loadRecentSearches = async () => {
      const searches = await db.getRecentSearches();
      setRecentSearches(searches);
    };
    loadRecentSearches();
  }, []);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (query.trim()) {
        try {
          const res = await fetch(`/api/suggest?q=${encodeURIComponent(query)}`);
          if (res.ok) {
            const raw = await res.json();
            const data = Array.isArray(raw) ? raw : (raw?.result || []);
            setSuggestions(data);
          }
        } catch {
          setSuggestions([]);
        }
      } else {
        setSuggestions([]);
      }
    };

    const debounceTimer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounceTimer);
  }, [query]);

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setIsFocused(false);

    // Save to recent searches
    await db.addRecentSearch(searchQuery);
    const searches = await db.getRecentSearches();
    setRecentSearches(searches);

    // If offline: search locally within downloaded IndexedDB tracks
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        const offlineItems = await db.getOfflineTracks();
        const q = searchQuery.toLowerCase();
        const matched = offlineItems
          .filter((it) => {
            const name = it.track?.name?.toLowerCase() || '';
            const artist = Array.isArray(it.track?.artist)
              ? it.track.artist.map((a: any) => a.name).join(' ').toLowerCase()
              : it.track?.artist?.name?.toLowerCase() || '';
            return name.includes(q) || artist.includes(q);
          })
          .map((it) => it.track);
        setResults(matched);
      } catch {}
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const raw = await res.json();
        const data = Array.isArray(raw) ? raw : raw?.result || [];
        setResults(data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  const onSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
  }, [handleSearch, query]);

  const handleRemoveRecentSearch = useCallback(async (e: React.MouseEvent, queryToRemove: string) => {
    e.stopPropagation();
    await db.removeRecentSearch(queryToRemove);
    const searches = await db.getRecentSearches();
    setRecentSearches(searches);
  }, []);

  return (
    <main className="min-h-screen pt-4 pb-32 max-w-5xl mx-auto select-none">
      <div className="px-4 md:px-8 mb-4 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-white hover:bg-white/10 p-2 rounded-full transition-colors cursor-pointer shrink-0"
          title="Kembali"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>

        <form onSubmit={onSubmit} className="relative flex-1">
          <SearchIcon className="w-5 h-5 text-[#b3b3b3] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            placeholder="Apa yang ingin Anda dengarkan?"
            autoFocus
            className="w-full bg-[#242424] hover:bg-[#2a2a2a] text-white rounded-full py-3 pl-11 pr-10 focus:outline-none focus:ring-2 focus:ring-white/40 placeholder:text-[#b3b3b3] transition-all border border-white/5 text-sm font-medium"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setResults([]);
              }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/50 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </form>
      </div>

      {/* PMUSIC Pills Navigation */}
      <div className="flex overflow-x-auto no-scrollbar gap-2 mb-6 px-4 md:px-8 snap-x snap-mandatory">
        {tabs.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
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

      {/* Suggestion Dropdown */}
      {query && isFocused && (
        <div className="mb-6 px-4 md:px-8 space-y-0.5">
          {suggestions.map((suggestion, index) => (
            <div
              key={`suggestion-${suggestion}-${index}`}
              className="flex items-center justify-between px-3 py-2.5 hover:bg-white/10 rounded-lg cursor-pointer transition-colors"
              onClick={() => {
                setQuery(suggestion);
                handleSearch(suggestion);
              }}
            >
              <div className="flex items-center gap-3">
                <SearchIcon className="w-4 h-4 text-white/50" />
                <span className="text-white text-sm font-medium">{suggestion}</span>
              </div>
              <ArrowUpLeft className="w-4 h-4 text-white/40" />
            </div>
          ))}
        </div>
      )}

      {/* Recent Searches */}
      {!query && !loading && results.length === 0 && recentSearches.length > 0 && (
        <div className="mb-6 px-4 md:px-8">
          <h2 className="text-base font-bold text-white mb-2 px-1">Pencarian Terbaru</h2>
          <div className="space-y-0.5">
            {recentSearches.map((search, index) => (
              <div
                key={`recent-${search.query}-${index}`}
                className="flex items-center justify-between px-3 py-2.5 hover:bg-white/10 rounded-lg cursor-pointer transition-colors group select-none"
                onClick={() => {
                  setQuery(search.query);
                  handleSearch(search.query);
                }}
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <History className="w-5 h-5 text-[#b3b3b3] shrink-0" />
                  <span className="text-white text-sm font-semibold truncate">{search.query}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => handleRemoveRecentSearch(e, search.query)}
                    className="text-white/40 hover:text-white p-1 cursor-pointer transition-colors"
                    title="Hapus pencarian"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search Results */}
      <div className="px-4 md:px-8">
        {loading ? (
          <SearchSkeleton />
        ) : displayedResults.length > 0 ? (
          <div className="space-y-1">
            {displayedResults.map((item, index) =>
              item.type === 'ARTIST' ? (
                <ArtistItem key={`artist-${item.artistId}-${index}`} artist={item} />
              ) : (
                <TrackItem
                  key={`track-${item.videoId}-${index}`}
                  track={item}
                  queue={tracksQueue}
                  index={index}
                />
              )
            )}
          </div>
        ) : query ? (
          <div className="flex flex-col items-center justify-center mt-20 text-white/50 space-y-3">
            <SearchIcon className="w-16 h-16 opacity-20" />
            <p className="text-lg font-bold text-white/80">Tidak ada hasil yang ditemukan</p>
            <p className="text-xs text-white/40">Coba kata kunci lain atau periksa ejaan lagu / artis Anda.</p>
          </div>
        ) : recentSearches.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-20 text-white/50 space-y-3">
            <SearchIcon className="w-16 h-16 opacity-20" />
            <p className="text-lg font-bold text-white/80">Cari lagu, album, atau artis favorit Anda</p>
            <p className="text-xs text-white/40">Ketik judul lagu, lirik, atau nama artis di bilah pencarian.</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
