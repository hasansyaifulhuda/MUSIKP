'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Activity,
  Cpu,
  Database,
  HardDrive,
  Wifi,
  Trash2,
  RefreshCw,
  Wrench,
  Volume2,
  ArrowLeft,
  ShieldAlert,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Play,
} from 'lucide-react';
import { getMemoryStats, runMemoryGarbageMitigation, MemoryStats } from '@/lib/memorySentinel';
import { db } from '@/lib/db';
import { useNetworkStore } from '@/lib/networkMonitor';
import { getPeakLimiterReduction, useEqualizerStore } from '@/lib/audioEffects';
import { getTelemetryLogs, clearTelemetryLogs, runSelfDiagnosis, repairSystemState, DiagnosticReport, TelemetryLog } from '@/lib/selfDiagnosis';
import { blobManager } from '@/lib/blobManager';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

export default function DeveloperDiagnosticPage() {
  const [memory, setMemory] = useState<MemoryStats>(getMemoryStats());
  const [dbInfo, setDbInfo] = useState<{ name: string; version: number; isHealthy: boolean; counts: Record<string, number> } | null>(null);
  const [storage, setStorage] = useState<{ usageMB: number; quotaGB: number; percentage: number } | null>(null);
  const [telemetryLogs, setTelemetryLogs] = useState<TelemetryLog[]>([]);
  const [diagReport, setDiagReport] = useState<DiagnosticReport | null>(null);
  const [limiterDb, setLimiterDb] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [audioCtxState, setAudioCtxState] = useState<string>('unknown');
  const [audioSampleRate, setAudioSampleRate] = useState<number>(0);

  const isOnline = useNetworkStore((state) => state.isOnline);
  const rttMs = useNetworkStore((state) => state.rttMs);
  const tier = useNetworkStore((state) => state.tier);
  const effectiveType = useNetworkStore((state) => state.effectiveType);
  const measureLatency = useNetworkStore((state) => state.measureLatency);

  const eqEnabled = useEqualizerStore((state) => state.isEnabled);
  const eqPreset = useEqualizerStore((state) => state.activePreset);
  const bassBoost = useEqualizerStore((state) => state.bassBoost);
  const reverbPreset = useEqualizerStore((state) => state.reverbPreset);
  const isSpatial = useEqualizerStore((state) => state.isSpatialSurround);

  const refreshAllStats = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Memory
      setMemory(getMemoryStats());

      // DB Info
      const info = await db.getDatabaseInfo();
      setDbInfo(info);

      // Storage
      const est = await db.getStorageEstimate();
      setStorage({
        usageMB: Math.round((est.usageBytes / (1024 * 1024)) * 10) / 10,
        quotaGB: Math.round((est.quotaBytes / (1024 * 1024 * 1024)) * 10) / 10,
        percentage: est.percentage,
      });

      // Telemetry Logs
      setTelemetryLogs(getTelemetryLogs());

      // Web Audio Telemetry
      const chain = (window as any).__PMUSIC_EFFECTS_CHAIN__;
      if (chain?.context) {
        setAudioCtxState(chain.context.state);
        setAudioSampleRate(chain.context.sampleRate);
      }
      setLimiterDb(Math.round(getPeakLimiterReduction() * 100) / 100);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshAllStats();
    const interval = setInterval(() => {
      setMemory(getMemoryStats());
      setLimiterDb(Math.round(getPeakLimiterReduction() * 100) / 100);
    }, 2500);

    return () => clearInterval(interval);
  }, [refreshAllStats]);

  const handleMitigateMemory = async () => {
    const res = await runMemoryGarbageMitigation();
    toast.success(`Mitigasi selesai. Memori dibersihkan.`);
    refreshAllStats();
  };

  const handlePruneDb = async () => {
    const res = await db.pruneExpiredBlobsAndCache();
    toast.success(`Pruning selesai: ${res.prunedMetadataCount} cache kadaluarsa & ${res.prunedTracksCount} blob rusak dibuang.`);
    refreshAllStats();
  };

  const handleRunFullDiagnosis = async () => {
    const report = await runSelfDiagnosis();
    setDiagReport(report);
    toast.info(`Diagnosis mandiri selesai: Status ${report.overallStatus.toUpperCase()}`);
    refreshAllStats();
  };

  const handleAutoRepair = async () => {
    const res = await repairSystemState();
    toast.success(`Pemulihan mandiri selesai (${res.repairedCount} item).`);
    refreshAllStats();
  };

  const handleClearLogs = () => {
    clearTelemetryLogs();
    setTelemetryLogs([]);
    toast.info('Log telemetri dibersihkan.');
  };

  return (
    <main className="min-h-screen pt-4 px-4 md:px-8 pb-32 max-w-6xl mx-auto select-none space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white transition-colors cursor-pointer border border-white/10"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
              <Activity className="w-6 h-6 text-[#1DB954]" />
              <span>Master Developer & Cache Inspector</span>
            </h1>
            <p className="text-xs text-white/50">Audit performa memori V8, skema IndexedDB, dan DSP Web Audio secara real-time.</p>
          </div>
        </div>

        <button
          onClick={refreshAllStats}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
          <span>Refresh</span>
        </button>
      </div>

      {/* SECTION 1: V8 JS HEAP & MEMORY SENTINEL */}
      <section className="bg-[#181818] border border-white/5 rounded-2xl p-4 md:p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm md:text-base font-bold text-white">Client Memory Sentinel (V8 Heap)</h2>
          </div>
          <span
            className={cn(
              'text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider',
              memory.status === 'optimal'
                ? 'bg-emerald-500/20 text-emerald-400'
                : memory.status === 'moderate'
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-red-500/20 text-red-400'
            )}
          >
            {memory.status}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-white/5">
            <span className="text-white/50 block">Used JS Heap</span>
            <span className="text-base font-bold text-white">
              {memory.usedJSHeapMB !== null ? `${memory.usedJSHeapMB} MB` : 'N/A'}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-white/5">
            <span className="text-white/50 block">Total JS Heap</span>
            <span className="text-base font-bold text-white">
              {memory.totalJSHeapMB !== null ? `${memory.totalJSHeapMB} MB` : 'N/A'}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-white/5">
            <span className="text-white/50 block">Active Blob URLs</span>
            <span className="text-base font-bold text-emerald-400">{memory.activeBlobCount}</span>
          </div>
          <div className="p-3 rounded-xl bg-white/5">
            <span className="text-white/50 block">DOM Nodes Count</span>
            <span className="text-base font-bold text-white">{memory.domNodesCount}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={handleMitigateMemory}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer border border-indigo-500/30"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Jalankan Memory Garbage Mitigation</span>
          </button>
        </div>
      </section>

      {/* SECTION 2: INDEXEDDB INSPECTOR & STORAGE */}
      <section className="bg-[#181818] border border-white/5 rounded-2xl p-4 md:p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm md:text-base font-bold text-white">
              IndexedDB Storage Inspector ({dbInfo ? `v${dbInfo.version}` : 'v6'})
            </h2>
          </div>
          {storage && (
            <span className="text-xs text-white/60">
              {storage.usageMB} MB / {storage.quotaGB} GB ({storage.percentage}%)
            </span>
          )}
        </div>

        {dbInfo?.counts && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 text-xs">
            {Object.entries(dbInfo.counts).map(([storeName, count]) => (
              <div key={storeName} className="p-3 rounded-xl bg-white/5 border border-white/5">
                <span className="text-white/50 block truncate font-mono text-[11px]">{storeName}</span>
                <span className="text-base font-bold text-white">{count} item</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={handlePruneDb}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer border border-emerald-500/30"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Prune Expired Cache & Corrupt Blobs</span>
          </button>
        </div>
      </section>

      {/* SECTION 3: WEB AUDIO API & DSP ANTI-CLIPPING */}
      <section className="bg-[#181818] border border-white/5 rounded-2xl p-4 md:p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-purple-400" />
            <h2 className="text-sm md:text-base font-bold text-white">Web Audio API Graph & Anti-Clipping DSP</h2>
          </div>
          <span className="text-xs font-mono text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded-full">
            {audioCtxState.toUpperCase()} {audioSampleRate ? `@ ${audioSampleRate}Hz` : ''}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-white/5">
            <span className="text-white/50 block">Peak Limiter Reduction</span>
            <span className="text-base font-bold text-emerald-400">{limiterDb} dB</span>
          </div>
          <div className="p-3 rounded-xl bg-white/5">
            <span className="text-white/50 block">Equalizer Preset</span>
            <span className="text-base font-bold text-white">{eqEnabled ? eqPreset : 'Bypassed'}</span>
          </div>
          <div className="p-3 rounded-xl bg-white/5">
            <span className="text-white/50 block">Reverb DSP</span>
            <span className="text-base font-bold text-white">{reverbPreset.toUpperCase()}</span>
          </div>
          <div className="p-3 rounded-xl bg-white/5">
            <span className="text-white/50 block">3D Spatial Surround</span>
            <span className="text-base font-bold text-white">{isSpatial ? 'Active' : 'Off'}</span>
          </div>
        </div>
      </section>

      {/* SECTION 4: NETWORK RTT & LATENCY */}
      <section className="bg-[#181818] border border-white/5 rounded-2xl p-4 md:p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Wifi className="w-5 h-5 text-blue-400" />
            <h2 className="text-sm md:text-base font-bold text-white">Client RTT Network Latency Monitor</h2>
          </div>
          <span className="text-xs text-white/60 uppercase">{tier} ({effectiveType})</span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="text-2xl font-black text-white">
              {rttMs !== null ? `${rttMs} ms` : 'N/A'}
            </span>
            <span className="text-xs text-white/50 block mt-0.5">
              Round-Trip Time ke server CDN
            </span>
          </div>
          <button
            onClick={() => measureLatency()}
            className="flex items-center gap-2 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer border border-blue-500/30"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Uji Latensi RTT</span>
          </button>
        </div>
      </section>

      {/* SECTION 5: TELEMETRY & CRASH LOG AUDIT */}
      <section className="bg-[#181818] border border-white/5 rounded-2xl p-4 md:p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm md:text-base font-bold text-white">
              Client Crash Telemetry Logs ({telemetryLogs.length})
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunFullDiagnosis}
              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Uji Diagnostik
            </button>
            <button
              onClick={handleAutoRepair}
              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              Auto-Repair
            </button>
            <button
              onClick={handleClearLogs}
              className="p-1 rounded-lg text-white/40 hover:text-white transition-colors cursor-pointer"
              title="Bersihkan Log"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="max-h-60 overflow-y-auto space-y-1.5 font-mono text-[11px] no-scrollbar">
          {telemetryLogs.map((log) => (
            <div key={log.id} className="p-2 rounded-lg bg-white/5 border border-white/5 flex items-start justify-between gap-2">
              <div>
                <span className="text-amber-400 font-bold">[{log.type}]</span>{' '}
                <span className="text-white/80">{JSON.stringify(log.details)}</span>
              </div>
              <span className="text-white/40 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
            </div>
          ))}
          {telemetryLogs.length === 0 && (
            <div className="text-center text-white/40 py-8">Belum ada riwayat crash atau warning tercatat.</div>
          )}
        </div>
      </section>
    </main>
  );
}
