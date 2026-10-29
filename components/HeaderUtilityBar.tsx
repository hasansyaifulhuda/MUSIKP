'use client';

import React, { memo, useEffect, useState } from 'react';
import { Wifi, WifiOff, HardDrive, Battery, BatteryCharging, RefreshCw } from 'lucide-react';
import { db } from '@/lib/db';
import { useNetworkStore } from '@/lib/networkMonitor';
import { useBatteryStore } from '@/lib/batteryStore';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export interface HeaderUtilityBarProps {
  className?: string;
}

/**
 * Enterprise Header Utility Bar (Storage & Offline Meter)
 * Master Blueprint PMUSIC Architecture - Batch 3 (Poin 85)
 *
 * Guarantees:
 * 1. Live Storage Quota & Offline Track footprint telemetry.
 * 2. Real-time RTT network status and offline indicator badge.
 * 3. Battery telemetry indicator.
 * 4. Micro-compact footprint for top of Library & Settings pages.
 */
export const HeaderUtilityBar = memo(function HeaderUtilityBar({ className }: HeaderUtilityBarProps) {
  const [storageUsageMB, setStorageUsageMB] = useState<number | null>(null);
  const [storageQuotaGB, setStorageQuotaGB] = useState<number | null>(null);
  const [storagePercent, setStoragePercent] = useState<number>(0);

  const isOnline = useNetworkStore((state) => state.isOnline);
  const rttMs = useNetworkStore((state) => state.rttMs);
  const tier = useNetworkStore((state) => state.tier);
  const measureLatency = useNetworkStore((state) => state.measureLatency);

  const batteryLevel = useBatteryStore((state) => state.batteryLevel);
  const isCharging = useBatteryStore((state) => state.isCharging);

  const refreshStorage = () => {
    db.getStorageEstimate().then((estimate) => {
      setStorageUsageMB(Math.round((estimate.usageBytes / (1024 * 1024)) * 10) / 10);
      setStorageQuotaGB(Math.round((estimate.quotaBytes / (1024 * 1024 * 1024)) * 10) / 10);
      setStoragePercent(estimate.percentage);
    }).catch(() => {});
  };

  useEffect(() => {
    refreshStorage();
  }, []);

  return (
    <div
      className={cn(
        'w-full bg-white/[0.03] border border-white/[0.06] rounded-2xl px-3.5 py-2 flex flex-wrap items-center justify-between gap-2.5 text-xs select-none backdrop-blur-md',
        className
      )}
    >
      {/* Network & Latency Badge */}
      <div className="flex items-center gap-2">
        <div
          onClick={() => measureLatency()}
          className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
          title="Klik untuk uji latensi jaringan"
        >
          {isOnline ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="font-semibold text-emerald-400">
                Online {rttMs !== null ? `(${rttMs}ms)` : ''}
              </span>
            </>
          ) : (
            <>
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </span>
              <span className="font-semibold text-amber-400">Mode Offline (Lokal)</span>
            </>
          )}
        </div>

        {/* Battery meter */}
        {batteryLevel !== null && (
          <div className="hidden sm:flex items-center gap-1 text-white/50 pl-2 border-l border-white/10">
            {isCharging ? (
              <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Battery className="w-3.5 h-3.5" />
            )}
            <span>{Math.round(batteryLevel * 100)}%</span>
          </div>
        )}
      </div>

      {/* Storage Quota Meter */}
      <div className="flex items-center gap-2 text-white/70">
        <Link
          href="/download"
          prefetch={true}
          className="flex items-center gap-1.5 hover:text-white transition-colors"
          title="Buka daftar lagu offline"
        >
          <HardDrive className="w-3.5 h-3.5 text-[#1DB954]" />
          <span>
            Penyimpanan:{' '}
            <strong className="text-white font-medium">
              {storageUsageMB !== null ? `${storageUsageMB} MB` : 'Memuat...'}
            </strong>{' '}
            {storageQuotaGB ? `/ ${storageQuotaGB} GB` : ''}
          </span>
        </Link>

        {storagePercent > 0 && (
          <div className="w-12 h-1.5 bg-white/10 rounded-full overflow-hidden hidden sm:block">
            <div
              className={cn(
                'h-full transition-all duration-300',
                storagePercent > 85 ? 'bg-red-500' : 'bg-[#1DB954]'
              )}
              style={{ width: `${Math.min(100, Math.max(3, storagePercent))}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
});
