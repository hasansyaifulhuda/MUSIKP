/**
 * Centralized Blob URL Registry & Anti-Memory Leak Manager
 * Master Blueprint PMUSIC Architecture - Phase 1.1 (Point 3)
 *
 * Responsibilities:
 * 1. Maintain a Set registry of all active Blob URLs in browser memory.
 * 2. Ensure deterministic revocation (URL.revokeObjectURL) when tracks change or unmount.
 * 3. Global lifecycle hooks (pagehide, beforeunload) to purge all orphaned object URLs.
 */

class BlobUrlRegistry {
  private activeUrls: Set<string> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      const purge = () => {
        // Do NOT revoke the Blob URL actively playing in the persistent HTML5 audio element
        const audio = typeof document !== 'undefined' ? (document.querySelector('audio') as HTMLAudioElement | null) : null;
        const activeSrc = audio?.src || '';
        this.revokeAll(activeSrc.startsWith('blob:') ? activeSrc : null);
      };
      window.addEventListener('pagehide', purge);
      window.addEventListener('beforeunload', purge);
    }
  }

  /**
   * Creates a new Blob Object URL and registers it into the active Set.
   */
  public create(source: Blob | MediaSource): string {
    if (
      typeof window === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function'
    ) {
      return '';
    }

    try {
      const url = URL.createObjectURL(source);
      this.activeUrls.add(url);
      return url;
    } catch (err) {
      console.warn('[BlobUrlRegistry] Failed to create Blob URL:', err);
      return '';
    }
  }

  /**
   * Safely revokes a specific Blob URL and purges it from the active Set.
   */
  public revoke(url: string | null | undefined): void {
    if (!url || typeof window === 'undefined' || typeof URL === 'undefined') return;

    try {
      if (this.activeUrls.has(url) || url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
        this.activeUrls.delete(url);
      }
    } catch (err) {
      // Ignore revocation errors safely
    }
  }

  /**
   * Purges and revokes all currently tracked Blob URLs to completely free RAM.
   * Can preserve an actively playing blob URL if specified.
   */
  public revokeAll(exceptUrl?: string | null): void {
    if (typeof window === 'undefined' || typeof URL === 'undefined') return;

    for (const url of Array.from(this.activeUrls)) {
      if (exceptUrl && url === exceptUrl) continue;
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Silently continue
      }
      this.activeUrls.delete(url);
    }
  }

  /**
   * Checks whether a specific URL is registered in this manager.
   */
  public isRegistered(url: string | null | undefined): boolean {
    if (!url) return false;
    return this.activeUrls.has(url);
  }

  /**
   * Returns current count of active Blob URLs tracked in memory.
   */
  public get size(): number {
    return this.activeUrls.size;
  }

  public getActiveCount(): number {
    return this.activeUrls.size;
  }
}

export const blobManager = new BlobUrlRegistry();
