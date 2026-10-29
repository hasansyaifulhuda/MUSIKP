'use client';

import { db } from './db';
import { toast } from './toast';

/**
 * Enterprise Client-Side Crash Telemetry & Self-Diagnosis Engine
 * Master Blueprint PMUSIC Architecture - Batch 3 (Poin 76)
 *
 * Guarantees:
 * 1. Proactive detection of corrupted localStorage JSON keys or invalid player states.
 * 2. Automated non-destructive state repair without wiping offline downloads.
 * 3. IndexedDB integrity and schema version verification.
 * 4. Web Audio API & AudioContext hardware capability checks.
 * 5. Structured crash telemetry logging persisted locally with FIFO bounds.
 */

export type Severity = 'healthy' | 'warning' | 'error';

export interface DiagnosticIssue {
  id: string;
  category: 'storage' | 'database' | 'audio' | 'network' | 'cache';
  severity: 'info' | 'warning' | 'error';
  message: string;
  fixable: boolean;
  detectedAt: number;
}

export interface DiagnosticReport {
  overallStatus: Severity;
  timestamp: number;
  checks: {
    localStorage: {
      status: 'pass' | 'warn' | 'fail';
      checkedKeys: number;
      corruptedKeys: string[];
      totalSizeBytes: number;
    };
    indexedDb: {
      status: 'pass' | 'warn' | 'fail';
      version: number;
      healthy: boolean;
      storesFound: string[];
      error?: string;
    };
    audioContext: {
      status: 'pass' | 'warn' | 'fail';
      supported: boolean;
      state?: string;
      sampleRate?: number;
    };
    storageQuota: {
      status: 'pass' | 'warn' | 'fail';
      usageBytes: number;
      quotaBytes: number;
      percentage: number;
    };
    network: {
      status: 'pass' | 'warn' | 'fail';
      onLine: boolean;
    };
  };
  issues: DiagnosticIssue[];
}

export interface TelemetryLog {
  id: string;
  timestamp: number;
  type: 'DIAGNOSTIC_RUN' | 'AUTO_REPAIR' | 'CORRUPTED_KEY_REMOVED' | 'UNCAUGHT_ERROR';
  details: any;
}

const TELEMETRY_STORAGE_KEY = 'pmusic_crash_telemetry_v1';
const MAX_TELEMETRY_LOGS = 30;

// Known JSON keys used by PMUSIC that must be valid JSON
const MONITORED_JSON_KEYS = [
  'player-storage',
  'pmusic_audio_session_v1',
  'pmusic_playback_resume',
  'pmusic_equalizer_settings_v1',
  'pmusic_liked_tracks',
  'pmusic_custom_theme',
  'pmusic_crossfade_v1',
  'pmusic_audio_quality_v1',
  'pmusic_lyrics_offsets_v1',
  'pmusic_battery_saver_mode_v1',
];

/**
 * Appends an event to the client-side telemetry log with FIFO trimming.
 */
export function recordTelemetry(type: TelemetryLog['type'], details: any): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(TELEMETRY_STORAGE_KEY);
    const logs: TelemetryLog[] = raw ? JSON.parse(raw) : [];
    logs.unshift({
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      type,
      details,
    });
    const trimmed = logs.slice(0, MAX_TELEMETRY_LOGS);
    localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {}
}

export function getTelemetryLogs(): TelemetryLog[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TELEMETRY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearTelemetryLogs(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(TELEMETRY_STORAGE_KEY);
  } catch {}
}

/**
 * Runs a comprehensive self-diagnostic test across client storage, IDB, audio, and network.
 */
export async function runSelfDiagnosis(): Promise<DiagnosticReport> {
  const issues: DiagnosticIssue[] = [];
  const now = Date.now();

  // 1. Check LocalStorage Integrity
  let totalLocalSize = 0;
  const corruptedKeys: string[] = [];

  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const val = localStorage.getItem(key) || '';
        totalLocalSize += (key.length + val.length) * 2; // Approximate UTF-16 bytes

        if (MONITORED_JSON_KEYS.includes(key)) {
          try {
            JSON.parse(val);
          } catch {
            corruptedKeys.push(key);
            issues.push({
              id: `corrupt_key_${key}`,
              category: 'storage',
              severity: 'error',
              message: `Data preferensi lokal "${key}" mengalami kerusakan struktur (malformed JSON).`,
              fixable: true,
              detectedAt: now,
            });
          }
        }
      }
    } catch (e: any) {
      issues.push({
        id: 'localstorage_access_failed',
        category: 'storage',
        severity: 'warning',
        message: `Akses localStorage dibatasi browser: ${e?.message || 'Unknown'}`,
        fixable: false,
        detectedAt: now,
      });
    }
  }

  // 2. Check IndexedDB Health
  let idbVersion = 0;
  let idbHealthy = false;
  let idbStores: string[] = [];
  let idbError: string | undefined;

  try {
    const info = await db.getDatabaseInfo();
    idbVersion = info.version;
    idbHealthy = info.isHealthy;
    idbStores = info.counts ? Object.keys(info.counts) : [];

    if (!info.isHealthy) {
      issues.push({
        id: 'idb_unhealthy',
        category: 'database',
        severity: 'warning',
        message: 'Basis data IndexedDB melaporkan kegagalan atau tidak siap.',
        fixable: true,
        detectedAt: now,
      });
    }

    if (idbVersion < 6) {
      issues.push({
        id: 'idb_old_version',
        category: 'database',
        severity: 'info',
        message: `Versi basis data (${idbVersion}) memerlukan migrasi skema ke versi terbaru (6).`,
        fixable: true,
        detectedAt: now,
      });
    }
  } catch (err: any) {
    idbError = err?.message || 'IndexedDB connection failed';
    issues.push({
      id: 'idb_exception',
      category: 'database',
      severity: 'error',
      message: `Koneksi IndexedDB lokal gagal diakses: ${idbError}`,
      fixable: true,
      detectedAt: now,
    });
  }

  // 3. Check AudioContext & Web Audio API
  let audioSupported = false;
  let audioState: string | undefined;
  let audioSampleRate: number | undefined;

  if (typeof window !== 'undefined') {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    audioSupported = Boolean(AudioCtx);

    if (!audioSupported) {
      issues.push({
        id: 'audio_unsupported',
        category: 'audio',
        severity: 'warning',
        message: 'Browser tidak mendukung Web Audio API. Efek DSP, Visualizer, dan Reverb akan dinonaktifkan.',
        fixable: false,
        detectedAt: now,
      });
    } else {
      try {
        const dummyCtx = new AudioCtx();
        audioState = dummyCtx.state;
        audioSampleRate = dummyCtx.sampleRate;
        if (dummyCtx.state !== 'closed') {
          dummyCtx.close().catch(() => {});
        }
      } catch {}
    }
  }

  // 4. Check Storage Quota
  let usageBytes = 0;
  let quotaBytes = 0;
  let percentage = 0;
  try {
    const estimate = await db.getStorageEstimate();
    usageBytes = estimate.usageBytes;
    quotaBytes = estimate.quotaBytes;
    percentage = estimate.percentage;

    if (percentage > 90) {
      issues.push({
        id: 'storage_quota_critical',
        category: 'storage',
        severity: 'error',
        message: `Ruang penyimpanan browser hampir penuh (${percentage}%). Diperlukan pembersihan cache lagu offline.`,
        fixable: true,
        detectedAt: now,
      });
    } else if (percentage > 75) {
      issues.push({
        id: 'storage_quota_warning',
        category: 'storage',
        severity: 'warning',
        message: `Penggunaan penyimpanan browser mencapai ${percentage}%.`,
        fixable: true,
        detectedAt: now,
      });
    }
  } catch {}

  // 5. Check Network
  const onLine = typeof navigator !== 'undefined' ? navigator.onLine : true;

  // Determine overall health status
  const hasError = issues.some((i) => i.severity === 'error');
  const hasWarning = issues.some((i) => i.severity === 'warning');
  const overallStatus: Severity = hasError ? 'error' : hasWarning ? 'warning' : 'healthy';

  const report: DiagnosticReport = {
    overallStatus,
    timestamp: now,
    checks: {
      localStorage: {
        status: corruptedKeys.length > 0 ? 'fail' : 'pass',
        checkedKeys: MONITORED_JSON_KEYS.length,
        corruptedKeys,
        totalSizeBytes: totalLocalSize,
      },
      indexedDb: {
        status: !idbHealthy || idbError ? 'fail' : 'pass',
        version: idbVersion,
        healthy: idbHealthy,
        storesFound: idbStores,
        error: idbError,
      },
      audioContext: {
        status: audioSupported ? 'pass' : 'warn',
        supported: audioSupported,
        state: audioState,
        sampleRate: audioSampleRate,
      },
      storageQuota: {
        status: percentage > 90 ? 'fail' : percentage > 75 ? 'warn' : 'pass',
        usageBytes,
        quotaBytes,
        percentage,
      },
      network: {
        status: onLine ? 'pass' : 'warn',
        onLine,
      },
    },
    issues,
  };

  recordTelemetry('DIAGNOSTIC_RUN', {
    status: overallStatus,
    issueCount: issues.length,
    corruptedKeys,
  });

  return report;
}

/**
 * Automated State Self-Repair: Safely resolves corrupted keys and resets stuck states.
 */
export async function repairSystemState(options?: { silent?: boolean }): Promise<{
  repairedCount: number;
  actions: string[];
}> {
  const actions: string[] = [];
  let repairedCount = 0;

  if (typeof window === 'undefined') {
    return { repairedCount: 0, actions };
  }

  // 1. Repair corrupted LocalStorage keys
  for (const key of MONITORED_JSON_KEYS) {
    try {
      const val = localStorage.getItem(key);
      if (!val) continue;
      try {
        JSON.parse(val);
      } catch {
        localStorage.removeItem(key);
        repairedCount++;
        actions.push(`Menghapus data rusak pada kunci "${key}".`);
        recordTelemetry('CORRUPTED_KEY_REMOVED', { key });
      }
    } catch {}
  }

  // 2. Clean up transient playback lock states if corrupted
  try {
    const rawSession = localStorage.getItem('pmusic_audio_session_v1');
    if (rawSession) {
      try {
        const parsed = JSON.parse(rawSession);
        if (!parsed || typeof parsed !== 'object' || !parsed.videoId) {
          localStorage.removeItem('pmusic_audio_session_v1');
          repairedCount++;
          actions.push('Mereset snapshot sesi audio pemutar yang tidak valid.');
        }
      } catch {
        localStorage.removeItem('pmusic_audio_session_v1');
        repairedCount++;
        actions.push('Membersihkan snapshot sesi audio yang korup.');
      }
    }
  } catch {}

  // 3. Evict excess LRU cache if quota exceeded
  try {
    const eviction = await db.evictLruOfflineTracks({ maxItems: 100, quotaThresholdRatio: 0.85 });
    if (eviction.evictedCount > 0) {
      actions.push(
        `Membersihkan ${eviction.evictedCount} lagu cache offline lama (${(eviction.freedBytes / (1024 * 1024)).toFixed(
          1
        )} MB) untuk melegakan penyimpanan.`
      );
      repairedCount += eviction.evictedCount;
    }
  } catch {}

  recordTelemetry('AUTO_REPAIR', { repairedCount, actions });

  if (!options?.silent) {
    if (repairedCount > 0) {
      toast.success(`Pemulihan mandiri berhasil: ${repairedCount} item dipulihkan.`);
    } else {
      toast.info('Sistem dan penyimpanan berada dalam kondisi normal, tidak ada data rusak.');
    }
  }

  return { repairedCount, actions };
}
