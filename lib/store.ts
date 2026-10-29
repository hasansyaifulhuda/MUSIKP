import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { toast } from '@/lib/toast';
import { playTrackImmediately } from './audioElement';
import { debouncedStorage } from './debouncedStorage';

export interface Track {
  videoId: string;
  youtubeId?: string;
  name: string;
  artist: { name: string; artistId?: string } | { name: string; artistId?: string }[];
  thumbnails: { url: string; width: number; height: number }[];
  duration?: number;
  isExplicit?: boolean;
}

export interface HistoryItem {
  track: Track;
  playedAt: number;
}

export const MAX_HISTORY_ITEMS = 50;

export function extractVideoId(raw: any): string {
  if (!raw) return '';
  let id = '';
  if (typeof raw === 'string') {
    id = raw.trim();
  } else {
    id =
      raw.youtubeId ||
      raw.youtube_id ||
      raw.videoId ||
      raw.video_id ||
      raw.songId ||
      raw.song_id ||
      raw.id ||
      raw.youtubeVideoId ||
      raw.ytId ||
      raw.yt_id ||
      (raw.track && (
        raw.track.youtubeId ||
        raw.track.youtube_id ||
        raw.track.videoId ||
        raw.track.video_id ||
        raw.track.songId ||
        raw.track.song_id ||
        raw.track.id
      )) ||
      raw.url ||
      raw.link ||
      raw.uri ||
      (raw.track && (raw.track.url || raw.track.link || raw.track.uri)) ||
      '';
  }

  if (typeof id === 'string') {
    id = id.trim();
    if (id.includes('v=')) {
      const match = id.match(/v=([a-zA-Z0-9_-]{11})/);
      if (match) return match[1];
    } else if (id.includes('youtu.be/')) {
      const match = id.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
      if (match) return match[1];
    } else if (id.includes('/embed/')) {
      const match = id.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      if (match) return match[1];
    } else if (id.includes('/shorts/')) {
      const match = id.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (match) return match[1];
    } else if (/^[a-zA-Z0-9_-]{11}$/.test(id)) {
      return id;
    }
  }

  return typeof id === 'string' ? id : '';
}

export function normalizeTrack(raw: any): Track {
  if (!raw) {
    return {
      videoId: '',
      youtubeId: '',
      name: 'Unknown Track',
      artist: { name: 'Unknown Artist' },
      thumbnails: [{ url: 'https://picsum.photos/300/300', width: 300, height: 300 }],
    };
  }

  const videoId = extractVideoId(raw);
  const name = raw.name || raw.title || (raw.track && (raw.track.name || raw.track.title)) || 'Unknown Track';

  let artist: { name: string; artistId?: string } | { name: string; artistId?: string }[] = { name: 'Unknown Artist' };
  const rawArtist = raw.artist || raw.artists || (raw.track && (raw.track.artist || raw.track.artists));

  if (Array.isArray(rawArtist)) {
    artist = rawArtist.map((a: any) =>
      typeof a === 'string' ? { name: a } : { name: a?.name || 'Unknown Artist', artistId: a?.artistId }
    );
  } else if (typeof rawArtist === 'object' && rawArtist !== null) {
    artist = { name: rawArtist.name || 'Unknown Artist', artistId: rawArtist.artistId };
  } else if (typeof rawArtist === 'string') {
    artist = { name: rawArtist };
  }

  let thumbnails = [{ url: 'https://picsum.photos/300/300', width: 300, height: 300 }];
  const rawThumb = raw.thumbnails || raw.thumbnail || (raw.track && (raw.track.thumbnails || raw.track.thumbnail));
  if (Array.isArray(rawThumb) && rawThumb.length > 0) {
    thumbnails = rawThumb.map((t: any) =>
      typeof t === 'string' ? { url: t, width: 300, height: 300 } : { url: t.url || '', width: t.width || 300, height: t.height || 300 }
    );
  } else if (rawThumb) {
    thumbnails = [{ url: typeof rawThumb === 'string' ? rawThumb : rawThumb.url || '', width: 300, height: 300 }];
  }

  let duration: number | undefined = undefined;
  const rawDur = raw.duration || (raw.track && raw.track.duration);
  if (typeof rawDur === 'number') {
    duration = rawDur;
  } else if (typeof rawDur === 'string') {
    const parts = rawDur.split(':').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      duration = parts[0] * 60 + parts[1];
    } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
  }

  return {
    videoId,
    youtubeId: videoId,
    name,
    artist,
    thumbnails,
    duration,
    isExplicit: !!(raw.isExplicit || (raw.track && raw.track.isExplicit)),
  };
}

interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  isBuffering: boolean;
  isExpanded: boolean;
  volume: number;
  progress: number;
  duration: number;
  playContext: 'playlist' | 'similar';
  trackToAdd: Track | null;
  history: HistoryItem[];
  playCounts: Record<string, number>;
  dominantColor: string | null;

  originalQueue: Track[];
  isShuffle: boolean;
  repeatMode: 'off' | 'all' | 'one';

  playTrack: (track: any, queue?: any[], context?: 'playlist' | 'similar', forceIndex?: number) => void;
  playNext: () => Promise<void>;
  playPrev: () => void;
  playQueueIndex: (index: number) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;
  setIsBuffering: (isBuffering: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  setProgress: (progress: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  addToQueue: (track: any) => void;
  insertNextInQueue: (track: any) => void;
  moveQueueItem: (fromIndex: number, toIndex: number) => void;
  reorderQueue: (newQueue: Track[]) => void;
  setTrackToAdd: (track: any | null) => void;
  setDominantColor: (color: string | null) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  clearHistory: () => void;
  removeFromHistory: (videoId: string, playedAt?: number) => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      currentTrack: null,
      queue: [],
      queueIndex: -1,
      isPlaying: false,
      isBuffering: false,
      isExpanded: false,
      volume: 100,
      progress: 0,
      duration: 0,
      playContext: 'similar',
      trackToAdd: null,
      history: [],
      playCounts: {},
      dominantColor: null,

      originalQueue: [],
      isShuffle: false,
      repeatMode: 'off',

      playTrack: (rawTrack, rawQueue, context = 'similar', forceIndex?: number) => {
        const targetId = extractVideoId(rawTrack);
        if (!rawTrack || !targetId) return;
        const track = normalizeTrack(rawTrack);

        let queue = rawQueue && rawQueue.length > 0 ? rawQueue.map(normalizeTrack) : undefined;

        const state = get();
        const newHistoryItem: HistoryItem = { track, playedAt: Date.now() };

        const filteredHistory = state.history.filter((h) => h.track.videoId !== track.videoId);
        const newHistory = [newHistoryItem, ...filteredHistory].slice(0, MAX_HISTORY_ITEMS);

        const newPlayCounts = { ...state.playCounts };
        newPlayCounts[track.videoId] = (newPlayCounts[track.videoId] || 0) + 1;

        let newQueue = queue || [track];
        
        let newIndex = -1;
        if (typeof forceIndex === 'number' && forceIndex >= 0 && forceIndex < newQueue.length) {
          newIndex = forceIndex;
          newQueue[newIndex] = track;
        } else {
          newIndex = newQueue.findIndex((t) => t.videoId === track.videoId);
          if (newIndex === -1 && track.name) {
            newIndex = newQueue.findIndex((t) => t.name.toLowerCase() === track.name.toLowerCase());
          }
        }

        // If track is still not in queue, insert it at beginning
        if (newIndex === -1) {
          newQueue = [track, ...newQueue];
          newIndex = 0;
        }

        const originalQueue = [...newQueue];

        if (state.isShuffle && newQueue.length > 1) {
          const current = newQueue[newIndex];
          const others = newQueue.filter((_, i) => i !== newIndex);
          for (let i = others.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [others[i], others[j]] = [others[j], others[i]];
          }
          newQueue = [current, ...others];
          newIndex = 0;
        }

        // Trigger immediate synchronous autoplay on user gesture
        playTrackImmediately(targetId, true);

        // Sanitize repeatMode: reset 'one' to 'off' when explicitly picking a new song
        const nextRepeatMode = state.repeatMode === 'one' ? 'off' : state.repeatMode;

        set({
          currentTrack: track,
          isPlaying: true,
          queue: newQueue,
          originalQueue: originalQueue,
          queueIndex: newIndex,
          progress: 0,
          playContext: context,
          history: newHistory,
          playCounts: newPlayCounts,
          repeatMode: nextRepeatMode,
        });
      },

      playNext: async () => {
        const { queue, queueIndex, playContext, currentTrack, repeatMode } = get();
        if (queueIndex < queue.length - 1) {
          const nextIndex = queueIndex + 1;
          const nextTrack = queue[nextIndex];

          const state = get();
          const newHistoryItem = { track: nextTrack, playedAt: Date.now() };
          const filteredHistory = state.history.filter((h) => h.track.videoId !== nextTrack.videoId);
          const newHistory = [newHistoryItem, ...filteredHistory].slice(0, MAX_HISTORY_ITEMS);

          const newPlayCounts = { ...state.playCounts };
          newPlayCounts[nextTrack.videoId] = (newPlayCounts[nextTrack.videoId] || 0) + 1;

          playTrackImmediately(extractVideoId(nextTrack), true);

          set({
            currentTrack: nextTrack,
            queueIndex: nextIndex,
            isPlaying: true,
            progress: 0,
            history: newHistory,
            playCounts: newPlayCounts,
          });
        } else if (repeatMode === 'all' && queue.length > 0) {
          const nextIndex = 0;
          const nextTrack = queue[nextIndex];

          const state = get();
          const newHistoryItem = { track: nextTrack, playedAt: Date.now() };
          const filteredHistory = state.history.filter((h) => h.track.videoId !== nextTrack.videoId);
          const newHistory = [newHistoryItem, ...filteredHistory].slice(0, MAX_HISTORY_ITEMS);

          const newPlayCounts = { ...state.playCounts };
          newPlayCounts[nextTrack.videoId] = (newPlayCounts[nextTrack.videoId] || 0) + 1;

          playTrackImmediately(extractVideoId(nextTrack), true);

          set({
            currentTrack: nextTrack,
            queueIndex: nextIndex,
            isPlaying: true,
            progress: 0,
            history: newHistory,
            playCounts: newPlayCounts,
          });
        } else {
          if (playContext === 'similar' && currentTrack && currentTrack.videoId) {
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
              return;
            }
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 4000);
              const res = await fetch(`/api/upnext?id=${encodeURIComponent(currentTrack.videoId)}`, {
                signal: controller.signal,
              }).catch(() => null);
              clearTimeout(timeoutId);

              if (res && res.ok) {
                const raw = await res.json().catch(() => []);
                const data = Array.isArray(raw) ? raw : (raw?.result || []);
                if (Array.isArray(data) && data.length > 0) {
                  const nextTracks = data
                    .filter((t: any) => {
                      const id = extractVideoId(t);
                      return id && id !== currentTrack.videoId;
                    })
                    .map(normalizeTrack);

                  if (nextTracks.length > 0) {
                    const nextTrack = nextTracks[0];

                    const state = get();
                    const newHistoryItem = { track: nextTrack, playedAt: Date.now() };
                    const filteredHistory = state.history.filter((h) => h.track.videoId !== nextTrack.videoId);
                    const newHistory = [newHistoryItem, ...filteredHistory].slice(0, MAX_HISTORY_ITEMS);

                    const newPlayCounts = { ...state.playCounts };
                    newPlayCounts[nextTrack.videoId] = (newPlayCounts[nextTrack.videoId] || 0) + 1;

                    let finalNextTracks = nextTracks;
                    if (state.isShuffle) {
                      const others = nextTracks.slice(1);
                      for (let i = others.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [others[i], others[j]] = [others[j], others[i]];
                      }
                      finalNextTracks = [nextTrack, ...others];
                    }

                    playTrackImmediately(extractVideoId(nextTrack), true);

                    set({
                      queue: [...queue, ...finalNextTracks],
                      originalQueue: state.originalQueue.length > 0 ? [...state.originalQueue, ...nextTracks] : [],
                      currentTrack: nextTrack,
                      queueIndex: queueIndex + 1,
                      isPlaying: true,
                      progress: 0,
                      history: newHistory,
                      playCounts: newPlayCounts,
                    });
                    return;
                  }
                }
              }
            } catch (e) {
              console.warn('Safe upnext fetch fallback:', e);
            }
          }
          // Safe fallback when queue ends: loop if repeatMode === 'all', otherwise halt safely
          const { repeatMode } = get();
          if (repeatMode === 'all' && queue.length > 0) {
            const nextTrack = queue[0];
            playTrackImmediately(extractVideoId(nextTrack), true);
            set({
              currentTrack: nextTrack,
              queueIndex: 0,
              isPlaying: true,
              progress: 0,
            });
            return;
          }
          set({ isPlaying: false, progress: 0 });
        }
      },

      playPrev: () => {
        const { queue, queueIndex, progress, repeatMode } = get();
        if (progress > 3) {
          set({ progress: 0 });
          return;
        }
        if (queueIndex > 0) {
          const prevIndex = queueIndex - 1;
          const prevTrack = queue[prevIndex];

          const state = get();
          const newHistoryItem = { track: prevTrack, playedAt: Date.now() };
          const filteredHistory = state.history.filter((h) => h.track.videoId !== prevTrack.videoId);
          const newHistory = [newHistoryItem, ...filteredHistory].slice(0, MAX_HISTORY_ITEMS);

          const newPlayCounts = { ...state.playCounts };
          newPlayCounts[prevTrack.videoId] = (newPlayCounts[prevTrack.videoId] || 0) + 1;

          playTrackImmediately(extractVideoId(prevTrack), true);

          set({
            currentTrack: prevTrack,
            queueIndex: prevIndex,
            isPlaying: true,
            progress: 0,
            history: newHistory,
            playCounts: newPlayCounts,
          });
        } else if (repeatMode === 'all' && queue.length > 0) {
          const prevIndex = queue.length - 1;
          const prevTrack = queue[prevIndex];

          const state = get();
          const newHistoryItem = { track: prevTrack, playedAt: Date.now() };
          const filteredHistory = state.history.filter((h) => h.track.videoId !== prevTrack.videoId);
          const newHistory = [newHistoryItem, ...filteredHistory].slice(0, MAX_HISTORY_ITEMS);

          const newPlayCounts = { ...state.playCounts };
          newPlayCounts[prevTrack.videoId] = (newPlayCounts[prevTrack.videoId] || 0) + 1;

          playTrackImmediately(extractVideoId(prevTrack), true);

          set({
            currentTrack: prevTrack,
            queueIndex: prevIndex,
            isPlaying: true,
            progress: 0,
            history: newHistory,
            playCounts: newPlayCounts,
          });
        } else {
          set({ progress: 0 });
        }
      },

      playQueueIndex: (index: number) => {
        const state = get();
        if (index < 0 || index >= state.queue.length) return;
        const targetTrack = state.queue[index];

        const newHistoryItem = { track: targetTrack, playedAt: Date.now() };
        const filteredHistory = state.history.filter((h) => h.track.videoId !== targetTrack.videoId);
        const newHistory = [newHistoryItem, ...filteredHistory].slice(0, MAX_HISTORY_ITEMS);

        const newPlayCounts = { ...state.playCounts };
        newPlayCounts[targetTrack.videoId] = (newPlayCounts[targetTrack.videoId] || 0) + 1;

        playTrackImmediately(extractVideoId(targetTrack), true);

        set({
          currentTrack: targetTrack,
          queueIndex: index,
          isPlaying: true,
          progress: 0,
          history: newHistory,
          playCounts: newPlayCounts,
        });
      },

      removeFromQueue: (index: number) => {
        const state = get();
        if (index < 0 || index >= state.queue.length) return;
        const newQueue = state.queue.filter((_, i) => i !== index);
        let newIndex = state.queueIndex;
        if (index < state.queueIndex) {
          newIndex = Math.max(0, state.queueIndex - 1);
        } else if (index === state.queueIndex) {
          if (newQueue.length === 0) {
            set({ queue: [], queueIndex: -1, currentTrack: null, isPlaying: false, progress: 0 });
            return;
          }
          newIndex = Math.min(state.queueIndex, newQueue.length - 1);
          set({
            queue: newQueue,
            queueIndex: newIndex,
            currentTrack: newQueue[newIndex],
            progress: 0,
          });
          return;
        }
        set({ queue: newQueue, queueIndex: newIndex });
      },

      clearQueue: () => {
        const state = get();
        if (state.currentTrack) {
          set({
            queue: [state.currentTrack],
            originalQueue: [state.currentTrack],
            queueIndex: 0,
          });
        } else {
          set({ queue: [], originalQueue: [], queueIndex: -1 });
        }
        toast.info('Antrean dibersihkan');
      },

      togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
      setPlaying: (playing) => set({ isPlaying: playing }),
      setIsBuffering: (isBuffering) => set({ isBuffering }),
      setExpanded: (expanded) => set({ isExpanded: expanded }),
      setProgress: (progress) => set({ progress }),
      setDuration: (duration) => set({ duration }),
      setVolume: (volume) => set({ volume }),
      addToQueue: (rawTrack) => {
        const id = extractVideoId(rawTrack);
        if (!rawTrack || !id) return;
        const track = normalizeTrack(rawTrack);
        set((state) => ({
          queue: [...state.queue, track],
          originalQueue: state.originalQueue.length > 0 ? [...state.originalQueue, track] : [track],
        }));
        toast.success(`"${track.name}" ditambahkan ke antrean`);
      },
      insertNextInQueue: (rawTrack) => {
        const id = extractVideoId(rawTrack);
        if (!rawTrack || !id) return;
        const track = normalizeTrack(rawTrack);
        set((state) => {
          if (state.queue.length === 0 || state.queueIndex === -1) {
            return {
              queue: [track],
              originalQueue: [track],
              queueIndex: 0,
            };
          }
          const insertIdx = state.queueIndex + 1;
          const nextQueue = [...state.queue];
          nextQueue.splice(insertIdx, 0, track);

          const nextOrig = [...state.originalQueue];
          const origInsertIdx = Math.min(nextOrig.length, insertIdx);
          nextOrig.splice(origInsertIdx, 0, track);

          return {
            queue: nextQueue,
            originalQueue: nextOrig,
          };
        });
        toast.success(`"${track.name}" akan diputar berikutnya`);
      },
      moveQueueItem: (fromIndex, toIndex) => {
        set((state) => {
          if (
            fromIndex < 0 ||
            fromIndex >= state.queue.length ||
            toIndex < 0 ||
            toIndex >= state.queue.length ||
            fromIndex === toIndex
          ) {
            return state;
          }

          const newQueue = [...state.queue];
          const [movedItem] = newQueue.splice(fromIndex, 1);
          newQueue.splice(toIndex, 0, movedItem);

          let newIndex = state.queueIndex;
          if (state.queueIndex === fromIndex) {
            newIndex = toIndex;
          } else if (fromIndex < state.queueIndex && toIndex >= state.queueIndex) {
            newIndex = state.queueIndex - 1;
          } else if (fromIndex > state.queueIndex && toIndex <= state.queueIndex) {
            newIndex = state.queueIndex + 1;
          }

          return {
            queue: newQueue,
            queueIndex: newIndex,
          };
        });
      },
      reorderQueue: (newQueue) => {
        set((state) => {
          const currentTrack = state.currentTrack;
          let newIndex = state.queueIndex;
          if (currentTrack?.videoId) {
            const foundIndex = newQueue.findIndex((t) => t.videoId === currentTrack.videoId);
            if (foundIndex !== -1) {
              newIndex = foundIndex;
            }
          }
          return {
            queue: newQueue,
            queueIndex: newIndex,
          };
        });
      },
      setTrackToAdd: (rawTrack) => {
        const id = extractVideoId(rawTrack);
        const track = rawTrack && id ? normalizeTrack(rawTrack) : null;
        set({ trackToAdd: track });
      },
      setDominantColor: (color) => set({ dominantColor: color }),
      toggleShuffle: () => {
        const state = get();
        const newIsShuffle = !state.isShuffle;
        if (newIsShuffle) {
          const current = state.queue[state.queueIndex];
          const others = state.queue.filter((_, i) => i !== state.queueIndex);
          for (let i = others.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [others[i], others[j]] = [others[j], others[i]];
          }
          const newQueue = current ? [current, ...others] : others;
          set({
            isShuffle: true,
            originalQueue: state.queue,
            queue: newQueue,
            queueIndex: current ? 0 : -1,
          });
          toast.info('Putar acak diaktifkan');
        } else {
          const current = state.queue[state.queueIndex];
          const newQueue = state.originalQueue.length > 0 ? state.originalQueue : state.queue;
          let newIndex = newQueue.findIndex((t) => t.videoId === current?.videoId);
          if (newIndex === -1) newIndex = 0;
          set({
            isShuffle: false,
            queue: newQueue,
            queueIndex: newIndex,
          });
          toast.info('Putar acak dinonaktifkan');
        }
      },
      toggleRepeat: () =>
        set((state) => {
          const nextMode = state.repeatMode === 'off' ? 'all' : state.repeatMode === 'all' ? 'one' : 'off';
          if (nextMode === 'all') {
            toast.info('Ulangi semua lagu');
          } else if (nextMode === 'one') {
            toast.info('Ulangi lagu ini');
          } else {
            toast.info('Pengulangan dimatikan');
          }
          return { repeatMode: nextMode };
        }),
      clearHistory: () => {
        set({ history: [] });
        toast.info('Riwayat putar telah dibersihkan');
      },
      removeFromHistory: (videoId: string, playedAt?: number) =>
        set((state) => ({
          history: state.history.filter((item) => {
            if (playedAt !== undefined) {
              return !(item.track.videoId === videoId && item.playedAt === playedAt);
            }
            return item.track.videoId !== videoId;
          }),
        })),
    }),
    {
      name: 'player-storage',
      storage: createJSONStorage(() => debouncedStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Always ensure the player hydrates in paused & ready state
          state.isPlaying = false;
          state.isBuffering = false;
          if (state.repeatMode === 'one') {
            state.repeatMode = 'off';
          }
          // Trim history to MAX_HISTORY_ITEMS to prevent browser storage quota bloat and memory leaks
          if (Array.isArray(state.history) && state.history.length > MAX_HISTORY_ITEMS) {
            state.history = state.history.slice(0, MAX_HISTORY_ITEMS);
          }
          // If currentTrack is empty but history exists, recover last track in paused state
          if (!state.currentTrack && Array.isArray(state.history) && state.history.length > 0) {
            const lastTrack = state.history[0]?.track;
            if (lastTrack && lastTrack.videoId) {
              state.currentTrack = lastTrack;
              if (!state.queue || state.queue.length === 0) {
                state.queue = [lastTrack];
                state.originalQueue = [lastTrack];
                state.queueIndex = 0;
              }
            }
          }
        }
      },
      partialize: (state) => ({
        currentTrack: state.currentTrack,
        queue: state.queue,
        queueIndex: state.queueIndex,
        originalQueue: state.originalQueue,
        history: state.history,
        playCounts: state.playCounts,
        volume: state.volume,
        isShuffle: state.isShuffle,
        repeatMode: state.repeatMode === 'one' ? 'off' : state.repeatMode,
      }),
    }
  )
);
