import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { spawn } from 'child_process';
import { cookieRotator } from '@/lib/cookieRotator';
import { getRandomStealthUserAgent, sanitizeVideoId } from '@/lib/audioResolver';

export interface AudioCacheStats {
  totalFiles: number;
  totalSizeBytes: number;
  totalSizeMB: number;
  totalSizeGB: number;
  maxLimitGB: number;
  cacheDir: string;
}

export interface CachedAudioLookup {
  exists: boolean;
  filePath: string;
  size: number;
}

class AudioCacheManager {
  private cacheDir: string;
  private maxCacheBytes: number;
  private targetCleanBytes: number;
  private inFlightDownloads: Map<string, Promise<string>> = new Map();
  private isCleaning = false;

  constructor() {
    this.cacheDir = path.join(process.cwd(), 'storage', 'audio-cache');
    // Default 10 GB limit (customizable via AUDIO_CACHE_MAX_GB env var)
    const maxGb = parseFloat(process.env.AUDIO_CACHE_MAX_GB || '10');
    this.maxCacheBytes = Math.floor(maxGb * 1024 * 1024 * 1024);
    // Cleanup target: 85% of max capacity to avoid frequent disk thrashing
    this.targetCleanBytes = Math.floor(this.maxCacheBytes * 0.85);

    this.ensureCacheDirExists();
    // Run an initial non-blocking cleanup check on startup
    setTimeout(() => this.runLruCleanupIfNeeded().catch(() => {}), 3000);
  }

  private ensureCacheDirExists(): void {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
    } catch (err) {
      console.error('[AudioCache] Failed to initialize audio cache directory:', err);
    }
  }

  /**
   * Generates a safe file path for a given YouTube video ID.
   * Strictly prevents directory traversal.
   */
  public getCacheFilePath(videoId: string): string {
    const cleanId = sanitizeVideoId(videoId) || videoId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeFilename = `${cleanId}.mp3`;
    const fullPath = path.join(this.cacheDir, safeFilename);

    // Guard against directory traversal attacks
    if (!fullPath.startsWith(this.cacheDir)) {
      throw new Error('Invalid path traversal attempt');
    }

    return fullPath;
  }

  /**
   * Checks whether a video audio file exists in the VPS disk cache.
   * On cache hit, updates the access time (atime) for LRU tracking.
   */
  public getCachedAudio(videoId: string): CachedAudioLookup | null {
    try {
      const filePath = this.getCacheFilePath(videoId);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        // Valid MP3 audio file must be larger than 10KB (avoid partial/stub files)
        if (stat.isFile() && stat.size > 10240) {
          // Touch access time (atime) asynchronously for accurate LRU tracking
          fs.utimes(filePath, new Date(), stat.mtime, () => {});
          return {
            exists: true,
            filePath,
            size: stat.size,
          };
        }
      }
    } catch {}
    return null;
  }

  /**
   * Streams a local MP3 file directly from the VPS disk with full HTTP Range support.
   * Supports instant byte-level seeking and returns 206 Partial Content or 200 OK.
   */
  public serveCachedAudio(request: Request, filePath: string, videoId: string): Response {
    const stat = fs.statSync(filePath);
    const totalSize = stat.size;
    const rangeHeader = request.headers.get('range');

    const headers = new Headers();
    headers.set('Content-Type', 'audio/mpeg');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('X-Cache', 'HIT');
    headers.set('X-Audio-Source', 'vps-disk');
    headers.set('Access-Control-Allow-Origin', '*');

    // 1. Partial Content Delivery (HTTP Range Seeking)
    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (isNaN(start) || isNaN(end) || start < 0 || end >= totalSize || start > end) {
        return new Response(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${totalSize}`,
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      const chunkSize = end - start + 1;
      headers.set('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      headers.set('Content-Length', String(chunkSize));

      const nodeStream = fs.createReadStream(filePath, { start, end });
      const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

      return new Response(webStream, {
        status: 206,
        headers,
      });
    }

    // 2. Full Content Delivery (200 OK)
    headers.set('Content-Length', String(totalSize));
    const nodeStream = fs.createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    return new Response(webStream, {
      status: 200,
      headers,
    });
  }

  /**
   * Downloads and converts audio to MP3 using yt-dlp with multi-cookie rotation.
   * Uses SingleFlight pattern to prevent duplicate concurrent downloads of the same track.
   */
  public async ensureAudioCached(videoId: string): Promise<string> {
    const targetFilePath = this.getCacheFilePath(videoId);

    // Fast-path: Already cached on disk
    const existing = this.getCachedAudio(videoId);
    if (existing) {
      return existing.filePath;
    }

    // SingleFlight: If download is already in progress for this videoId, wait for it
    const activePromise = this.inFlightDownloads.get(videoId);
    if (activePromise) {
      return activePromise;
    }

    const downloadPromise = this.executeDownloadAndCache(videoId, targetFilePath)
      .finally(() => {
        this.inFlightDownloads.delete(videoId);
      });

    this.inFlightDownloads.set(videoId, downloadPromise);
    return downloadPromise;
  }

  private async executeDownloadAndCache(videoId: string, targetFilePath: string): Promise<string> {
    this.ensureCacheDirExists();
    const cleanId = sanitizeVideoId(videoId) || videoId;
    const tempPrefix = path.join(this.cacheDir, `${cleanId}.tmp-${Date.now()}`);
    const tempOutputTemplate = `${tempPrefix}.%(ext)s`;
    const targetUrl = `https://www.youtube.com/watch?v=${cleanId}`;

    const ytDlpBin = this.findYtDlpBinary();
    const extendedEnv = this.getExtendedEnv();

    // 1. Get rotated cookie file
    const cookiePath = cookieRotator.getNextCookiePath();
    const stealthUserAgent = getRandomStealthUserAgent();

    const baseArgs = [
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificates',
      '--user-agent',
      stealthUserAgent,
      '--add-header',
      'Accept-Language:en-US,en;q=0.9,id;q=0.8',
      '--remote-components',
      'ejs:github',
      '--extract-audio',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '192K',
      '-o',
      tempOutputTemplate,
      targetUrl,
    ];

    let downloadedMp3Path: string | null = null;

    // Attempt 1: With rotated cookie
    if (cookiePath) {
      const argsWithCookies = [...baseArgs, '--cookies', cookiePath];
      try {
        console.info(
          `[AudioCache] Downloading audio for ${cleanId} using rotated cookie: ${path.basename(cookiePath)}...`
        );
        const res = await this.spawnProcess(ytDlpBin, argsWithCookies, extendedEnv, 30000);

        if (res.code === 0) {
          const expectedMp3 = `${tempPrefix}.mp3`;
          if (fs.existsSync(expectedMp3) && fs.statSync(expectedMp3).size > 10240) {
            downloadedMp3Path = expectedMp3;
            cookieRotator.reportCookieSuccess(cookiePath);
          }
        } else {
          // Check for bot detection / invalid cookies
          if (
            /confirm you(?:'|’)?re not a bot|cookies are invalid|HTTP Error 401|login.*required/i.test(
              res.stderr
            )
          ) {
            cookieRotator.reportCookieFailure(cookiePath, res.stderr.slice(0, 150));
          }
          console.warn(`[AudioCache] Primary download attempt failed (code ${res.code}):`, res.stderr.slice(0, 180));
        }
      } catch (err: any) {
        console.warn('[AudioCache] Primary download threw error:', err?.message || err);
      }
    }

    // Attempt 2: Fallback without cookies (visionos, android, mweb client)
    if (!downloadedMp3Path) {
      console.info(`[AudioCache] Attempting fallback download without cookies for ${cleanId}...`);
      const fallbackArgs = [
        '--no-warnings',
        '--no-playlist',
        '--no-check-certificates',
        '--user-agent',
        getRandomStealthUserAgent(),
        '--extractor-args',
        'youtube:player_client=visionos,android,mweb',
        '--extract-audio',
        '--audio-format',
        'mp3',
        '--audio-quality',
        '192K',
        '-o',
        tempOutputTemplate,
        targetUrl,
      ];

      try {
        const res = await this.spawnProcess(ytDlpBin, fallbackArgs, extendedEnv, 30000);
        if (res.code === 0) {
          const expectedMp3 = `${tempPrefix}.mp3`;
          if (fs.existsSync(expectedMp3) && fs.statSync(expectedMp3).size > 10240) {
            downloadedMp3Path = expectedMp3;
          }
        } else {
          console.warn(`[AudioCache] Fallback download failed (code ${res.code}):`, res.stderr.slice(0, 180));
        }
      } catch (err: any) {
        console.warn('[AudioCache] Fallback download threw error:', err?.message || err);
      }
    }

    if (!downloadedMp3Path || !fs.existsSync(downloadedMp3Path)) {
      // Clean up any stray temp files
      this.cleanupTempFiles(tempPrefix);
      throw new Error(`Gagal mendownload audio untuk video ID: ${cleanId}`);
    }

    // Atomic move from temp to final destination
    try {
      fs.renameSync(downloadedMp3Path, targetFilePath);
      console.info(
        `[AudioCache] ✅ Berhasil menyimpan cache audio VPS: ${path.basename(targetFilePath)} (${Math.round(
          fs.statSync(targetFilePath).size / 1024
        )} KB)`
      );
    } catch (renameErr) {
      // Fallback copy if cross-device
      fs.copyFileSync(downloadedMp3Path, targetFilePath);
      fs.unlinkSync(downloadedMp3Path);
    }

    // Clean up any remaining temp files (.webm, .m4a stubs)
    this.cleanupTempFiles(tempPrefix);

    // Run non-blocking LRU disk cleanup in background
    setTimeout(() => this.runLruCleanupIfNeeded().catch(() => {}), 500);

    return targetFilePath;
  }

  private cleanupTempFiles(tempPrefix: string): void {
    try {
      const dir = path.dirname(tempPrefix);
      const base = path.basename(tempPrefix);
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.startsWith(base)) {
            try {
              fs.unlinkSync(path.join(dir, file));
            } catch {}
          }
        }
      }
    } catch {}
  }

  /**
   * LRU (Least Recently Used) Disk Auto-Cleanup Engine.
   * If total cache size approaches the safe limit (default 10 GB),
   * evicts oldest-accessed files until the cache drops to the target safe threshold (8.5 GB).
   */
  public async runLruCleanupIfNeeded(): Promise<void> {
    if (this.isCleaning) return;
    this.isCleaning = true;

    try {
      if (!fs.existsSync(this.cacheDir)) return;

      const entries = fs.readdirSync(this.cacheDir);
      const fileStats: { name: string; fullPath: string; size: number; atime: number }[] = [];
      let totalBytes = 0;

      for (const name of entries) {
        if (!name.endsWith('.mp3')) continue;
        const fullPath = path.join(this.cacheDir, name);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            totalBytes += stat.size;
            fileStats.push({
              name,
              fullPath,
              size: stat.size,
              atime: stat.atimeMs || stat.mtimeMs || 0,
            });
          }
        } catch {}
      }

      // Check if threshold exceeded
      if (totalBytes > this.maxCacheBytes) {
        const currentGb = (totalBytes / (1024 * 1024 * 1024)).toFixed(2);
        const maxGb = (this.maxCacheBytes / (1024 * 1024 * 1024)).toFixed(2);
        console.warn(
          `[AudioCache] ⚠️ Batas aman cache audio VPS tercapai (${currentGb} GB / ${maxGb} GB). Menjalankan auto-cleanup LRU...`
        );

        // Sort by oldest access time first (LRU order)
        fileStats.sort((a, b) => a.atime - b.atime);

        let freedBytes = 0;
        let deletedCount = 0;

        for (const file of fileStats) {
          if (totalBytes - freedBytes <= this.targetCleanBytes) {
            break;
          }

          try {
            fs.unlinkSync(file.fullPath);
            freedBytes += file.size;
            deletedCount++;
          } catch {}
        }

        const freedMb = Math.round(freedBytes / (1024 * 1024));
        const finalGb = ((totalBytes - freedBytes) / (1024 * 1024 * 1024)).toFixed(2);
        console.info(
          `[AudioCache] 🧹 LRU Auto-Cleanup selesai: Menghapus ${deletedCount} berkas audio terlama (${freedMb} MB dibebaskan). Ukuran saat ini: ${finalGb} GB.`
        );
      }
    } catch (err) {
      console.warn('[AudioCache] Warning during LRU cleanup:', err);
    } finally {
      this.isCleaning = false;
    }
  }

  /**
   * Retrieves current disk cache statistics for administrative dashboard.
   */
  public getStats(): AudioCacheStats {
    let totalFiles = 0;
    let totalSizeBytes = 0;

    try {
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir);
        for (const file of files) {
          if (file.endsWith('.mp3')) {
            try {
              const stat = fs.statSync(path.join(this.cacheDir, file));
              if (stat.isFile()) {
                totalFiles++;
                totalSizeBytes += stat.size;
              }
            } catch {}
          }
        }
      }
    } catch {}

    const totalSizeMB = Math.round((totalSizeBytes / (1024 * 1024)) * 100) / 100;
    const totalSizeGB = Math.round((totalSizeBytes / (1024 * 1024 * 1024)) * 100) / 100;
    const maxLimitGB = Math.round((this.maxCacheBytes / (1024 * 1024 * 1024)) * 100) / 100;

    return {
      totalFiles,
      totalSizeBytes,
      totalSizeMB,
      totalSizeGB,
      maxLimitGB,
      cacheDir: this.cacheDir,
    };
  }

  private findYtDlpBinary(): string {
    const home = process.env.HOME || '/root';
    const candidates = [
      path.join(home, '.local', 'bin', 'yt-dlp'),
      '/usr/local/bin/yt-dlp',
      '/usr/bin/yt-dlp',
      'yt-dlp',
    ];

    for (const c of candidates) {
      if (c === 'yt-dlp') return 'yt-dlp';
      try {
        if (fs.existsSync(c) && fs.statSync(c).isFile()) {
          return c;
        }
      } catch {}
    }
    return 'yt-dlp';
  }

  private getExtendedEnv(): NodeJS.ProcessEnv {
    const home = process.env.HOME || '/root';
    const binPaths = [
      path.join(home, '.local', 'bin'),
      path.join(home, '.deno', 'bin'),
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
    ];
    const existingPath = process.env.PATH || '';
    const mergedPath = Array.from(new Set([...binPaths, ...existingPath.split(':')]))
      .filter(Boolean)
      .join(':');

    return {
      ...process.env,
      PATH: mergedPath,
    };
  }

  private spawnProcess(
    bin: string,
    args: string[],
    env: NodeJS.ProcessEnv,
    timeoutMs = 25000
  ): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            child.kill('SIGTERM');
            setTimeout(() => {
              try {
                if (!child.killed) child.kill('SIGKILL');
              } catch {}
            }, 800);
          } catch {}
          reject(new Error(`Process timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      child.stdout.on('data', (d) => {
        if (stdout.length < 2 * 1024 * 1024) stdout += d.toString();
      });
      child.stderr.on('data', (d) => {
        if (stderr.length < 2 * 1024 * 1024) stderr += d.toString();
      });

      child.on('close', (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ stdout, stderr, code });
        }
      });

      child.on('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });
    });
  }
}

// Global singleton instance
export const audioCache = new AudioCacheManager();
