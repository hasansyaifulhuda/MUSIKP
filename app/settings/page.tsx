'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Trash2,
  Database,
  HardDrive,
  RefreshCw,
  Smartphone,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { usePlayerStore } from '@/lib/store';
import { db } from '@/lib/db';
import { toast } from '@/lib/toast';
import Link from 'next/link';

export default function SettingsPage() {
  const router = useRouter();

  const clearHistory = usePlayerStore((state) => state.clearHistory);
  const [clearing, setClearing] = useState<string | null>(null);

  // 1. Clear Song & Playback History
  const handleClearHistory = () => {
    if (confirm('Apakah Anda yakin ingin menghapus semua riwayat pemutaran lagu?')) {
      clearHistory();
    }
  };

  // 2. Clear IndexedDB Offline Tracks
  const handleClearIndexedDB = async () => {
    if (confirm('Hapus semua unduhan lagu offline dari penyimpanan perangkat?')) {
      try {
        setClearing('idb');
        await db.clearOfflineTracks();
        toast.success('Semua unduhan lagu offline berhasil dibersihkan');
      } catch (err) {
        console.error('Error clearing IndexedDB:', err);
        toast.error('Gagal membersihkan data IndexedDB');
      } finally {
        setClearing(null);
      }
    }
  };

  // 3. Clear Service Worker & Browser Caches
  const handleClearCache = async () => {
    if (confirm('Bersihkan cache browser dan Service Worker? Aplikasi akan memuat versi terbaru.')) {
      try {
        setClearing('cache');
        if ('caches' in window) {
          const cacheKeys = await caches.keys();
          await Promise.all(cacheKeys.map((key) => caches.delete(key)));
        }
        toast.success('Cache aplikasi dan Service Worker berhasil dibersihkan');
      } catch (err) {
        console.error('Error clearing cache:', err);
        toast.error('Gagal membersihkan cache browser');
      } finally {
        setClearing(null);
      }
    }
  };

  // 4. Reset LocalStorage Data
  const handleClearLocalStorage = () => {
    if (
      confirm(
        'Peringatan: Ini akan mereset pengaturan volume, preferensi acak/repeat, dan cache lokal ke default. Lanjutkan?'
      )
    ) {
      try {
        setClearing('storage');
        localStorage.clear();
        toast.success('Data preferensi dan LocalStorage berhasil direset');
        setTimeout(() => {
          window.location.reload();
        }, 800);
      } catch (err) {
        console.error('Error clearing localStorage:', err);
        toast.error('Gagal mereset LocalStorage');
      } finally {
        setClearing(null);
      }
    }
  };

  return (
    <main className="min-h-screen pb-28 select-none">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-black/60 backdrop-blur-md pt-5 pb-4 px-4 md:px-8 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
            aria-label="Kembali"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl md:text-2xl font-extrabold text-white tracking-tight">Pengaturan</h1>
        </div>
      </div>

      <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-8">
        {/* SECTION 1: DATA & STORAGE MANAGEMENT */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Database className="w-5 h-5 text-[#1DB954]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#b3b3b3]">
              Manajemen Penyimpanan & Data
            </h2>
          </div>

          <div className="bg-[#181818] border border-white/5 rounded-2xl divide-y divide-white/5 overflow-hidden shadow-lg">
            {/* 1. Clear History */}
            <div className="p-4 md:p-5 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 pr-2">
                <h3 className="text-sm md:text-base font-bold text-white mb-0.5">Bersihkan Riwayat Putar</h3>
                <p className="text-xs text-[#b3b3b3]">Hapus seluruh daftar lagu yang pernah Anda dengarkan.</p>
              </div>
              <button
                onClick={handleClearHistory}
                className="flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs font-semibold transition-colors cursor-pointer shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Riwayat</span>
              </button>
            </div>

            {/* 2. Clear IndexedDB Offline Tracks */}
            <div className="p-4 md:p-5 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 pr-2">
                <h3 className="text-sm md:text-base font-bold text-white mb-0.5">
                  Kosongkan Unduhan Offline (IndexedDB)
                </h3>
                <p className="text-xs text-[#b3b3b3]">
                  Hapus semua file lagu yang disimpan untuk mode offline guna menghemat ruang penyimpanan.
                </p>
              </div>
              <button
                onClick={handleClearIndexedDB}
                disabled={clearing === 'idb'}
                className="flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs font-semibold transition-colors cursor-pointer shrink-0 disabled:opacity-50"
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>{clearing === 'idb' ? 'Menghapus...' : 'Hapus Unduhan'}</span>
              </button>
            </div>

            {/* 3. Clear Service Worker & Browser Cache */}
            <div className="p-4 md:p-5 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 pr-2">
                <h3 className="text-sm md:text-base font-bold text-white mb-0.5">
                  Bersihkan Cache Service Worker
                </h3>
                <p className="text-xs text-[#b3b3b3]">
                  Hapus cache thumbnail dan aset sementara untuk menyegarkan aplikasi ke versi terbaru.
                </p>
              </div>
              <button
                onClick={handleClearCache}
                disabled={clearing === 'cache'}
                className="flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs font-semibold transition-colors cursor-pointer shrink-0 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${clearing === 'cache' ? 'animate-spin' : ''}`} />
                <span>{clearing === 'cache' ? 'Membersihkan...' : 'Hapus Cache'}</span>
              </button>
            </div>

            {/* 4. Reset LocalStorage */}
            <div className="p-4 md:p-5 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 pr-2">
                <h3 className="text-sm md:text-base font-bold text-red-400 mb-0.5 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span>Reset LocalStorage & Preferensi</span>
                </h3>
                <p className="text-xs text-[#b3b3b3]">
                  Kembalikan semua preferensi pemutar ke pengaturan pabrik dan reload aplikasi.
                </p>
              </div>
              <button
                onClick={handleClearLocalStorage}
                disabled={clearing === 'storage'}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-full text-xs font-semibold transition-colors cursor-pointer shrink-0 disabled:opacity-50 border border-red-500/30"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{clearing === 'storage' ? 'Mereset...' : 'Reset Data'}</span>
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 2: APP SHORTCUTS & INFO */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <ShieldCheck className="w-5 h-5 text-[#1DB954]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#b3b3b3]">Aplikasi</h2>
          </div>

          <div className="bg-[#181818] border border-white/5 rounded-2xl p-4 md:p-5 space-y-3 shadow-lg">
            <div className="flex items-center justify-between text-sm py-1">
              <span className="text-white/70">Aplikasi</span>
              <span className="text-white font-semibold">Spotify Web Player</span>
            </div>
            <div className="flex items-center justify-between text-sm py-1">
              <span className="text-white/70">Versi PWA</span>
              <span className="text-[#1DB954] font-semibold">v2.0 (Mobile Optimized)</span>
            </div>
            <div className="flex items-center justify-between text-sm py-1">
              <span className="text-white/70">Penyimpanan Offline</span>
              <span className="text-white font-semibold">IndexedDB Didukung</span>
            </div>

            <div className="pt-3 border-t border-white/5 flex flex-wrap gap-2">
              <Link
                href="/install-apk"
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs font-semibold transition-colors cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5 text-[#1DB954]" />
                <span>Install APK / PWA</span>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
