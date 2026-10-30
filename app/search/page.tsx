'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { db, RecentSearch } from '@/lib/db';
import { TrackItem } from '@/components/TrackItem';
import { ArtistItem } from '@/components/ArtistItem';
import { VirtualTrackList } from '@/components/VirtualTrackList';
import { Search as SearchIcon, ArrowLeft, X, ArrowUpLeft, History } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SearchSkeleton } from '@/components/SearchSkeleton';
import { useDebounce } from '@/hooks/usePerformance';

import { deduplicatedFetch } from '@/lib/clientDeduplication';
import {
  getCachedSearch,
  setCachedSearch,
  getCachedSuggestions,
  setCachedSuggestions,
  prefetchSuggestions,
} from '@/lib/clientDataCache';

let searchStateCache = {
  query: '',
  results: [] as any[],
  activeTab: 'Semua',
};

export default function Search() {
  const [query, setQuery] = useState(searchStateCache.query);
  const [results, setResults] = useState<any[]>(searchStateCache.results);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(searchStateCache.activeTab);
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
    let mounted = true;
    const loadRecentSearches = async () => {
      const searches = await db.getRecentSearches();
      if (mounted) setRecentSearches(searches);
    };
    loadRecentSearches();
    return () => {
      mounted = false;
    };
  }, []);

  const debouncedQuery = useDebounce(query, 250);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const fetchSuggestions = async () => {
      if (debouncedQuery.trim()) {
        const cachedSuggest = getCachedSuggestions(debouncedQuery);
        if (cachedSuggest && active) {
          setSuggestions(cachedSuggest);
          return;
        }
        try {
          const data = await prefetchSuggestions(debouncedQuery);
          if (active) {
            setSuggestions(data);
            setCachedSuggestions(debouncedQuery, data);
          }
        } catch (err: any) {
          if (err?.name !== 'AbortError' && active) {
            setSuggestions([]);
          }
        }
      } else {
        if (active) setSuggestions([]);
      }
    };

    fetchSuggestions();
    return () => {
      active = false;
      try {
        controller.abort();
      } catch {}
    };
  }, [debouncedQuery]);

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    const cleanQ = searchQuery.trim();
    setQuery(cleanQ);
    setIsFocused(false);

    // Save to recent searches
    await db.addRecentSearch(cleanQ);
    const searches = await db.getRecentSearches();
    setRecentSearches(searches);

    // Check clientDataCache for instant 0ms result
    const cachedResults = getCachedSearch(cleanQ);
    if (cachedResults && cachedResults.length > 0) {
      setResults(cachedResults);
      setLoading(false);
      searchStateCache = { query: cleanQ, results: cachedResults, activeTab };
      return;
    }

    setLoading(true);

    // If offline: search locally within downloaded IndexedDB tracks (Batch 3 - Poin 72)
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        const localMatches = await db.searchLocalOffline(cleanQ);
        setResults(localMatches);
      } catch (err) {
        console.warn('Offline local search failed:', err);
      }
      setLoading(false);
      return;
    }

    try {
      const raw = await deduplicatedFetch(
        `/api/search?q=${encodeURIComponent(cleanQ)}`,
        undefined,
        1000 * 60 * 15 // 15 mins client deduplication cache
      );
      const data = Array.isArray(raw) ? raw : raw?.result || [];
      setResults(data);
      setCachedSearch(cleanQ, 'all', data);
      searchStateCache = { query: cleanQ, results: data, activeTab };
    } catch (error) {
      console.error('Search request error:', error);
      // Fallback to local offline tracks if online search fails
      try {
        const localFallback = await db.searchLocalOffline(cleanQ);
        if (localFallback.length > 0) {
          setResults(localFallback);
        }
      } catch {}
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

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
          <VirtualTrackList
            tracks={displayedResults}
            queue={tracksQueue}
            renderItem={(item: any, index: number) =>
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
            }
          />
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
