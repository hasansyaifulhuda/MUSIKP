'use client';

import { create } from 'zustand';

/**
 * Enterprise Network Latency Monitor & Adaptive Resource Loading
 * Master Blueprint PMUSIC Architecture - Batch 3 (Poin 89 & 98)
 *
 * Guarantees:
 * 1. Precision Round Trip Time (RTT) measurement in milliseconds.
 * 2. Integration with Network Information API (navigator.connection).
 * 3. Dynamic resource degradation recommendations for slow connections or Save-Data mode.
 * 4. Reactive state for UI meters, Settings, and Master Developer Panel.
 */

export type NetworkTier = 'ultra' | 'good' | 'moderate' | 'poor' | 'offline';

export interface NetworkState {
  rttMs: number | null;
  effectiveType: string;
  downlinkMb: number | null;
  saveData: boolean;
  tier: NetworkTier;
  isOnline: boolean;
  lastCheckedAt: number;

  measureLatency: () => Promise<number | null>;
  initNetworkListeners: () => void;
}

export function evaluateNetworkTier(rtt: number | null, effectiveType: string, isOnline: boolean): NetworkTier {
  if (!isOnline) return 'offline';
  if (effectiveType === 'slow-2g' || effectiveType === '2g') return 'poor';
  if (rtt === null) return effectiveType === '4g' ? 'good' : 'moderate';

  if (rtt < 90) return 'ultra';
  if (rtt < 220) return 'good';
  if (rtt < 450) return 'moderate';
  return 'poor';
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  rttMs: null,
  effectiveType: '4g',
  downlinkMb: null,
  saveData: false,
  tier: 'good',
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  lastCheckedAt: 0,

  measureLatency: async (): Promise<number | null> => {
    if (typeof window === 'undefined') return null;
    if (!navigator.onLine) {
      set({ tier: 'offline', isOnline: false, rttMs: null });
      return null;
    }

    try {
      const start = performance.now();
      const res = await fetch('/manifest.json?ping=' + Date.now(), {
        method: 'HEAD',
        cache: 'no-store',
      });
      const end = performance.now();
      const latency = Math.round(end - start);

      const navConn = (navigator as any).connection;
      const effectiveType = navConn?.effectiveType || '4g';
      const downlink = navConn?.downlink || null;
      const saveData = Boolean(navConn?.saveData);
      const tier = evaluateNetworkTier(latency, effectiveType, true);

      set({
        rttMs: latency,
        effectiveType,
        downlinkMb: downlink,
        saveData,
        tier,
        isOnline: true,
        lastCheckedAt: Date.now(),
      });

      return latency;
    } catch {
      const isOnline = navigator.onLine;
      set({
        tier: isOnline ? 'poor' : 'offline',
        isOnline,
        rttMs: isOnline ? 999 : null,
        lastCheckedAt: Date.now(),
      });
      return null;
    }
  },

  initNetworkListeners: () => {
    if (typeof window === 'undefined') return;

    const updateFromNavigator = () => {
      const navConn = (navigator as any).connection;
      const effectiveType = navConn?.effectiveType || '4g';
      const downlink = navConn?.downlink || null;
      const saveData = Boolean(navConn?.saveData);
      const isOnline = navigator.onLine;
      const currentRtt = get().rttMs;
      const tier = evaluateNetworkTier(currentRtt, effectiveType, isOnline);

      set({
        effectiveType,
        downlinkMb: downlink,
        saveData,
        isOnline,
        tier,
      });
    };

    window.addEventListener('online', updateFromNavigator);
    window.addEventListener('offline', updateFromNavigator);

    const navConn = (navigator as any).connection;
    if (navConn) {
      navConn.addEventListener('change', updateFromNavigator);
    }

    // Measure initial latency
    get().measureLatency();
  },
}));
