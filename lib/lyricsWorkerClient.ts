/**
 * PMUSIC Web Worker Client Controller
 * Master Blueprint PMUSIC Architecture - Phase 1.2 (Point 7)
 *
 * Bridges the UI thread with the background Web Worker,
 * providing non-blocking asynchronous lyrics parsing with transparent fallback.
 */

import { LyricLine, normalizeLyrics } from './performance';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timer: NodeJS.Timeout;
}

class LyricsWorkerClient {
  private worker: Worker | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private reqCounter = 0;
  private isSupported = typeof window !== 'undefined' && typeof Worker !== 'undefined';

  private getWorker(): Worker | null {
    if (!this.isSupported) return null;

    if (!this.worker) {
      try {
        this.worker = new Worker('/workers/lyricsWorker.js');
        this.worker.onmessage = (e: MessageEvent) => {
          const { id, type, result, error } = e.data || {};
          const pending = this.pendingRequests.get(id);
          if (!pending) return;

          clearTimeout(pending.timer);
          this.pendingRequests.delete(id);

          if (type === 'SUCCESS') {
            pending.resolve(result);
          } else {
            pending.reject(new Error(error || 'Worker execution error'));
          }
        };

        this.worker.onerror = (err) => {
          console.warn('[LyricsWorkerClient] Worker encounter error:', err);
        };
      } catch (err) {
        console.warn('[LyricsWorkerClient] Failed to initialize worker, falling back to main thread:', err);
        this.worker = null;
      }
    }

    return this.worker;
  }

  private dispatch<T>(type: string, payload: any): Promise<T> {
    const worker = this.getWorker();
    if (!worker) {
      return Promise.reject(new Error('Web Worker unavailable'));
    }

    const id = `req_${++this.reqCounter}_${Date.now()}`;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Worker request timeout for task: ${type}`));
      }, 5000);

      this.pendingRequests.set(id, { resolve, reject, timer });
      worker.postMessage({ id, type, payload });
    });
  }

  /**
   * Normalizes raw lyric timestamps asynchronously off the main thread.
   * Seamlessly falls back to main thread normalizeLyrics() on failure.
   */
  public async normalize(rawLyrics: any[], trackDuration?: number): Promise<LyricLine[]> {
    if (!Array.isArray(rawLyrics) || rawLyrics.length === 0) return [];

    try {
      return await this.dispatch<LyricLine[]>('NORMALIZE_LYRICS', {
        rawLyrics,
        trackDuration,
      });
    } catch {
      // Graceful main-thread fallback
      return normalizeLyrics(rawLyrics, trackDuration);
    }
  }

  /**
   * Searches within massive lyric arrays asynchronously.
   */
  public async search(lyrics: LyricLine[], query: string): Promise<number[]> {
    if (!Array.isArray(lyrics) || !query?.trim()) return [];

    try {
      return await this.dispatch<number[]>('SEARCH_LYRICS', {
        lyrics,
        query,
      });
    } catch {
      const q = query.toLowerCase().trim();
      const matched: number[] = [];
      lyrics.forEach((l, i) => {
        if (l.text && l.text.toLowerCase().includes(q)) matched.push(i);
      });
      return matched;
    }
  }

  /**
   * Filters offline tracks by title/artist off the main UI thread.
   */
  public async filterTracks<T>(items: T[], query: string): Promise<T[]> {
    if (!Array.isArray(items) || !query?.trim()) return items || [];

    try {
      return await this.dispatch<T[]>('FILTER_TRACKS', {
        items,
        query,
      });
    } catch {
      const q = query.toLowerCase().trim();
      return items.filter((it: any) => {
        const track = it?.track || it;
        const name = (track?.name || '').toLowerCase();
        let artist = '';
        if (Array.isArray(track?.artist)) {
          artist = track.artist.map((a: any) => (typeof a === 'string' ? a : a?.name || '')).join(' ').toLowerCase();
        } else {
          artist = (track?.artist?.name || track?.artist || '').toLowerCase();
        }
        return name.includes(q) || artist.includes(q);
      });
    }
  }

  /**
   * Terminate the worker instance on demand.
   */
  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingRequests.forEach((req) => clearTimeout(req.timer));
    this.pendingRequests.clear();
  }
}

export const lyricsWorkerClient = new LyricsWorkerClient();
