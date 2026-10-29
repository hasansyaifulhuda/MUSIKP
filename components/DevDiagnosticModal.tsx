'use client';

import React, { memo, useState, useEffect } from 'react';
import { X, Activity, Cpu, Database, Volume2, Trash2, RefreshCw, ExternalLink } from 'lucide-react';
import { useDevModalStore } from '@/lib/devModalStore';
import { getMemoryStats, runMemoryGarbageMitigation, MemoryStats } from '@/lib/memorySentinel';
import { db } from '@/lib/db';
import { getPeakLimiterReduction } from '@/lib/audioEffects';
import { useNetworkStore } from '@/lib/networkMonitor';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export const DevDiagnosticModal = memo(function DevDiagnosticModal() {
  const isOpen = useDevModalStore((state) => state.isOpen);
  const closeModal = useDevModalStore((state) => state.closeModal);

  const [memory, setMemory] = useState<MemoryStats>(getMemoryStats());
  const [limiterDb, setLimiterDb] = useState<number>(0);
  const [dbVersion, setDbVersion] = useState<number>(6);
  const [offlineCount, setOfflineCount] = useState<number>(0);

  const isOnline = useNetworkStore((state) => state.isOnline);
  const rttMs = useNetworkStore((state) => state.rttMs);

  useEffect(() => {
    if (!isOpen) return;

    const refresh = () => {
      setMemory(getMemoryStats());
      setLimiterDb(Math.round(getPeakLimiterReduction() * 100) / 100);
      db.getDatabaseInfo().then((info) => {
        setDbVersion(info.version);
        setOfflineCount(info.counts?.offline_tracks || 0);
      }).catch(() => {});
    };

    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
      onClick={closeModal}
    >
      <div
        className="bg-[#181818] border border-white/10 rounded-2xl p-5 w-full max-w-lg shadow-2xl space-y-4 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#1DB954]" />
            <h2 className="text-base font-bold text-white">Diagnostic & Memory Inspector</h2>
          </div>
          <button
            onClick={closeModal}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-3 rounded-xl bg-white/5 flex flex-col justify-between">
            <span className="text-white/50">V8 JS Heap:</span>
            <span className="text-base font-bold text-white mt-1">
              {memory.usedJSHeapMB !== null ? `${memory.usedJSHeapMB} MB` : 'N/A'}
            </span>
            <span className="text-[10px] text-white/40">Status: {memory.status}</span>
          </div>

          <div className="p-3 rounded-xl bg-white/5 flex flex-col justify-between">
            <span className="text-white/50">IndexedDB:</span>
            <span className="text-base font-bold text-emerald-400 mt-1">v{dbVersion} OK</span>
            <span className="text-[10px] text-white/40">{offlineCount} lagu offline</span>
          </div>

          <div className="p-3 rounded-xl bg-white/5 flex flex-col justify-between">
            <span className="text-white/50">Anti-Clipping Reduction:</span>
            <span className="text-base font-bold text-white mt-1">{limiterDb} dB</span>
            <span className="text-[10px] text-white/40">Limiter Peak Protector</span>
          </div>

          <div className="p-3 rounded-xl bg-white/5 flex flex-col justify-between">
            <span className="text-white/50">Network Latency (RTT):</span>
            <span className="text-base font-bold text-blue-400 mt-1">
              {rttMs !== null ? `${rttMs} ms` : 'N/A'}
            </span>
            <span className="text-[10px] text-white/40">{isOnline ? 'Online' : 'Offline'}</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          <button
            onClick={async () => {
              await runMemoryGarbageMitigation();
              toast.success('Mitigasi memori berhasil');
              setMemory(getMemoryStats());
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Bersihkan Memori</span>
          </button>

          <Link
            href="/developer"
            prefetch={true}
            onClick={closeModal}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] text-xs font-bold text-black transition-colors cursor-pointer shadow-md"
          >
            <span>Buka Panel Penuh</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
});
