import fs from 'fs';
import path from 'path';

export interface CookieSlot {
  filename: string;
  filePath: string;
  sizeBytes: number;
  isValid: boolean;
  lastChecked: number;
  lastUsed: number;
  usageCount: number;
  failCount: number;
  cooldownUntil: number;
  lastError: string | null;
}

export interface CookiePoolStatus {
  totalDiscovered: number;
  activePoolSize: number;
  activeCookieFilenames: string[];
  currentActiveFilename: string | null;
  currentBatchCount: number;
  maxRequestsPerBatch: number;
  usingFallbackStandard: boolean;
  slots: CookieSlot[];
  lastScanTime: number;
}

/**
 * Intelligent & Proactive yt-dlp Cookie Manager
 * 1. Automatically discovers any 'cookie*.txt' or 'cookies*.txt' files in root.
 * 2. Proactively rotates cookie sessions every N requests (default: 5) to mimic natural user browsing.
 * 3. Graceful error recovery: automatic cooldown & immediate skip to next healthy cookie on bot challenge.
 * 4. Fallback: Always ensures safe fallback to cookies.txt or cookie-less execution.
 */
export class CookieManager {
  private slots: Map<string, CookieSlot> = new Map();
  private activeSlotKeys: string[] = [];
  private currentSlotIndex = 0;
  private currentBatchCount = 0;
  private currentBatchStartTime = Date.now();
  private maxRequestsPerBatch = 5; // Rotate proactively every 5 requests
  private maxBatchDurationMs = 15 * 60 * 1000; // or rotate every 15 minutes
  private lastScanTime = 0;
  private scanCacheTtlMs = 15000; // Auto-rescan directory every 15 seconds
  private hasLoggedBanner = false;
  private standardCookieName = 'cookies.txt';

  constructor() {
    const envBatch = parseInt(process.env.COOKIE_ROTATION_BATCH_SIZE || '', 10);
    if (!isNaN(envBatch) && envBatch > 0) {
      this.maxRequestsPerBatch = envBatch;
    }

    this.scanCookieFiles(true);
    this.logDiagnosticBanner();
  }

  /**
   * 1. Automatic Detection of All Cookie Files:
   * Scans root directory for any file matching /^cookie.*\.txt$/i (e.g. cookies.txt, cookies1.txt, cookies2.txt, cookie_acc.txt).
   */
  public scanCookieFiles(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastScanTime < this.scanCacheTtlMs && this.slots.size > 0) {
      return;
    }

    const rootDir = process.cwd();
    const discoveredFiles: string[] = [];

    try {
      if (fs.existsSync(rootDir)) {
        const entries = fs.readdirSync(rootDir);
        for (const entry of entries) {
          // Matches cookies.txt, cookies1.txt, cookies5.txt, cookie_alt.txt, cookie*.txt
          if (/^cookie.*\.txt$/i.test(entry)) {
            const fullPath = path.join(rootDir, entry);
            try {
              const stat = fs.statSync(fullPath);
              if (stat.isFile() && stat.size > 50) {
                discoveredFiles.push(entry);
                const existing = this.slots.get(entry);
                if (existing) {
                  existing.sizeBytes = stat.size;
                  existing.lastChecked = now;
                } else {
                  this.slots.set(entry, {
                    filename: entry,
                    filePath: fullPath,
                    sizeBytes: stat.size,
                    isValid: true,
                    lastChecked: now,
                    lastUsed: 0,
                    usageCount: 0,
                    failCount: 0,
                    cooldownUntil: 0,
                    lastError: null,
                  });
                }
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      console.warn('[CookieManager] Error scanning root directory for cookie files:', err);
    }

    // Remove any slots that no longer exist on disk
    for (const [key] of this.slots) {
      if (!discoveredFiles.includes(key)) {
        this.slots.delete(key);
      }
    }

    // Sort slot keys naturally: cookies1.txt, cookies2.txt, ... then cookies.txt
    this.activeSlotKeys = Array.from(this.slots.keys()).sort((a, b) => {
      // Prioritize numbered multi-cookies (cookies1, cookies2...) before standard cookies.txt
      const isAStandard = a.toLowerCase() === 'cookies.txt';
      const isBStandard = b.toLowerCase() === 'cookies.txt';
      if (isAStandard && !isBStandard) return 1;
      if (!isAStandard && isBStandard) return -1;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    this.lastScanTime = now;
  }

  /**
   * Retrieves list of all valid slots not currently under cooldown.
   */
  private getHealthySlots(): CookieSlot[] {
    this.scanCookieFiles();
    const now = Date.now();
    const healthy: CookieSlot[] = [];

    for (const key of this.activeSlotKeys) {
      const slot = this.slots.get(key);
      if (slot && slot.isValid && slot.cooldownUntil <= now) {
        healthy.push(slot);
      }
    }

    return healthy;
  }

  /**
   * 2. Proactive & Gradual Rotation (Every N requests / Cycle):
   * Selects an active cookie and automatically rotates to the next one every N requests (default: 5)
   * or every 15 minutes, distributing traffic naturally across sacrificial accounts without waiting for bans.
   */
  public getNextCookiePath(): string | null {
    const healthy = this.getHealthySlots();

    if (healthy.length === 0) {
      // Fallback: If all are in cooldown, pick the slot that expires soonest
      const allSlots = Array.from(this.slots.values()).filter((s) => s.sizeBytes > 50);
      if (allSlots.length > 0) {
        allSlots.sort((a, b) => a.cooldownUntil - b.cooldownUntil);
        const earliest = allSlots[0];
        earliest.lastUsed = Date.now();
        earliest.usageCount++;
        return earliest.filePath;
      }
      return null;
    }

    const now = Date.now();

    // Check if we need to proactively rotate to the next cookie in the list
    const isBatchLimitReached = this.currentBatchCount >= this.maxRequestsPerBatch;
    const isDurationLimitReached = now - this.currentBatchStartTime >= this.maxBatchDurationMs;

    if ((isBatchLimitReached || isDurationLimitReached) && healthy.length > 1) {
      const prevSlot = healthy[this.currentSlotIndex % healthy.length];
      this.currentSlotIndex = (this.currentSlotIndex + 1) % healthy.length;
      this.currentBatchCount = 0;
      this.currentBatchStartTime = now;
      const nextSlot = healthy[this.currentSlotIndex % healthy.length];

      console.info(
        `[CookieManager] 🔄 Proactive Rotation: Beralih dari "${prevSlot?.filename}" ke "${nextSlot?.filename}" (Selesai ${this.maxRequestsPerBatch} request siklus pemakaian bertahap).`
      );
    }

    // Safe index bounds
    const selectedSlot = healthy[this.currentSlotIndex % healthy.length];
    if (selectedSlot) {
      this.currentBatchCount++;
      selectedSlot.lastUsed = now;
      selectedSlot.usageCount++;
      return selectedSlot.filePath;
    }

    return null;
  }

  /**
   * 3. Fallback & Error Recovery:
   * Called when yt-dlp signals a bot verification, expired cookie, or 401 error.
   * Marks slot as failed, sets a 5-minute cooldown, and immediately skips to the next available healthy cookie.
   */
  public reportCookieFailure(filePath: string, errorReason: string): void {
    const filename = path.basename(filePath);
    const slot = this.slots.get(filename);
    if (!slot) return;

    slot.failCount++;
    slot.lastError = errorReason.slice(0, 200);

    // 5-minute cooldown on flagged cookie
    const cooldownDurationMs = 5 * 60 * 1000;
    slot.cooldownUntil = Date.now() + cooldownDurationMs;

    console.warn(
      `[CookieManager] ⚠️ Berkas cookie "${filename}" terdeteksi invalid/bot challenge (Fail: ${slot.failCount}). Melewati berkas ini selama 5 menit. Alasan: ${slot.lastError}`
    );

    // Immediately advance to next slot and reset batch count
    const healthy = this.getHealthySlots();
    if (healthy.length > 0) {
      this.currentSlotIndex = (this.currentSlotIndex + 1) % healthy.length;
      this.currentBatchCount = 0;
      this.currentBatchStartTime = Date.now();
      const nextSlot = healthy[this.currentSlotIndex % healthy.length];
      console.info(
        `[CookieManager] 🛡️ Failover Recovery: Otomatis beralih ke cookie aktif berikutnya: "${nextSlot?.filename}".`
      );
    }
  }

  /**
   * Confirms a cookie file was used successfully, resetting fail counters.
   */
  public reportCookieSuccess(filePath: string): void {
    const filename = path.basename(filePath);
    const slot = this.slots.get(filename);
    if (slot) {
      slot.failCount = 0;
      slot.lastError = null;
      slot.cooldownUntil = 0;
    }
  }

  /**
   * Records usage for search or auxiliary API operations.
   */
  public trackSearchUsage(): string | null {
    return this.getNextCookiePath();
  }

  /**
   * Retrieves full pool diagnostics for monitoring and debugging.
   */
  public getPoolStatus(): CookiePoolStatus {
    this.scanCookieFiles();
    const healthy = this.getHealthySlots();
    const currentSlot = healthy.length > 0 ? healthy[this.currentSlotIndex % healthy.length] : null;

    return {
      totalDiscovered: this.slots.size,
      activePoolSize: healthy.length,
      activeCookieFilenames: healthy.map((s) => s.filename),
      currentActiveFilename: currentSlot?.filename || null,
      currentBatchCount: this.currentBatchCount,
      maxRequestsPerBatch: this.maxRequestsPerBatch,
      usingFallbackStandard:
        healthy.length === 1 && healthy[0].filename.toLowerCase() === 'cookies.txt',
      slots: Array.from(this.slots.values()),
      lastScanTime: this.lastScanTime,
    };
  }

  /**
   * Terminal Banner logger displayed on boot.
   */
  public logDiagnosticBanner(): void {
    if (this.hasLoggedBanner) return;
    this.hasLoggedBanner = true;

    const status = this.getPoolStatus();

    if (status.activePoolSize > 1) {
      const names = status.activeCookieFilenames.join(', ');
      console.info('\n' + [
        '╔══════════════════════════════════════════════════════════════════════════════╗',
        '║ 🔄  [COOKIE MANAGER] Sistem Rotasi Proaktif & Multi-Cookie Aktif (PMUSIC)    ║',
        '╠══════════════════════════════════════════════════════════════════════════════╣',
        `║ Terdeteksi   : ${String(status.totalDiscovered).padEnd(2)} berkas cookie dinamis di root VPS (${names})`.slice(0, 78).padEnd(79) + '║',
        `║ Siklus Rotasi: Berganti otomatis setiap ${status.maxRequestsPerBatch} pemutaran lagu (Proactive Cycle)`.padEnd(79) + '║',
        `║ Active Cookie: ${status.currentActiveFilename || 'N/A'}`.padEnd(79) + '║',
        '║ Proteksi     : Auto-Failover & Cooldown jika mendeteksi bot challenge/429     ║',
        '╚══════════════════════════════════════════════════════════════════════════════╝',
      ].join('\n') + '\n');
    } else if (status.usingFallbackStandard) {
      console.info('\n' + [
        '╔══════════════════════════════════════════════════════════════════════════════╗',
        '║ 🛡️  [COOKIE MANAGER] Mode Fallback Tunggal (cookies.txt Aktif)               ║',
        '╠══════════════════════════════════════════════════════════════════════════════╣',
        '║ File Aktif   : cookies.txt standar di root VPS                               ║',
        '║ Tips Proaktif: Tambahkan cookies1.txt s/d cookies5.txt untuk rotasi multi-akun║',
        '╚══════════════════════════════════════════════════════════════════════════════╝',
      ].join('\n') + '\n');
    } else {
      console.warn('\n' + [
        '╔══════════════════════════════════════════════════════════════════════════════╗',
        '║ ⚠️  [COOKIE MANAGER] Tidak Ada Berkas Cookie Ditemukan                       ║',
        '╠══════════════════════════════════════════════════════════════════════════════╣',
        '║ Status       : Fallback otomatis ke mode multi-client tanpa cookies          ║',
        '╚══════════════════════════════════════════════════════════════════════════════╝',
      ].join('\n') + '\n');
    }
  }
}

// Global singleton instance
export const cookieManager = new CookieManager();
// Backwards-compatible alias for existing imports
export const cookieRotator = cookieManager;
