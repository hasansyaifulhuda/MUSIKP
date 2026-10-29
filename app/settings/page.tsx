'use client';

import { useState, useRef } from 'react';
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
  SlidersHorizontal,
  Moon,
  Download,
  Upload,
  Radio,
  Volume2,
  Sparkles,
  Battery,
  BatteryCharging,
  Activity,
  Wrench,
  CheckCircle2,
  AlertCircle,
  Terminal,
} from 'lucide-react';
import { usePlayerStore } from '@/lib/store';
import { db } from '@/lib/db';
import { toast } from '@/lib/toast';
import { useEqualizerStore } from '@/lib/audioEffects';
import { useSleepTimerStore, formatRemainingTimer } from '@/lib/sleepTimerStore';
import { useFloatingWidgetStore } from '@/lib/floatingWidgetStore';
import { useFloatingLyricsStore } from '@/lib/floatingLyricsStore';
import { useCrossfadeStore } from '@/lib/crossfadeStore';
import { useAudioQualityStore, AUDIO_QUALITY_OPTIONS, AudioQuality } from '@/lib/audioQualityStore';
import { exportUserDataToJson, importUserDataFromJson } from '@/lib/backupRestore';
import { useBatteryStore } from '@/lib/batteryStore';
import { runSelfDiagnosis, repairSystemState, DiagnosticReport } from '@/lib/selfDiagnosis';
import { useDevModalStore } from '@/lib/devModalStore';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useEffect } from 'react';

export default function SettingsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearHistory = usePlayerStore((state) => state.clearHistory);
  const [clearing, setClearing] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const openDevModal = useDevModalStore((state) => state.openModal);

  const openEqualizerModal = useEqualizerStore((state) => state.openModal);
  const isEqualizerEnabled = useEqualizerStore((state) => state.isEnabled);
  const activePreset = useEqualizerStore((state) => state.activePreset);

  const openSleepTimerModal = useSleepTimerStore((state) => state.openModal);
  const isSleepTimerActive = useSleepTimerStore((state) => state.isActive);
  const remainingSeconds = useSleepTimerStore((state) => state.remainingSeconds);

  const isFloatingEnabled = useFloatingWidgetStore((state) => state.isEnabled);
  const toggleFloatingEnabled = useFloatingWidgetStore((state) => state.toggleEnabled);

  const isFloatingLyricsEnabled = useFloatingLyricsStore((state) => state.isEnabled);
  const toggleFloatingLyrics = useFloatingLyricsStore((state) => state.toggleEnabled);

  const crossfadeDuration = useCrossfadeStore((state) => state.crossfadeDuration);
  const setCrossfadeDuration = useCrossfadeStore((state) => state.setCrossfadeDuration);

  const audioQuality = useAudioQualityStore((state) => state.quality);
  const setAudioQuality = useAudioQualityStore((state) => state.setQuality);

  // Battery Saver (Poin 74)
  const batteryLevel = useBatteryStore((state) => state.batteryLevel);
  const isCharging = useBatteryStore((state) => state.isCharging);
  const isLowPowerActive = useBatteryStore((state) => state.isLowPowerActive);
  const isAutoLowPower = useBatteryStore((state) => state.isAutoLowPower);
  const toggleManualSaver = useBatteryStore((state) => state.toggleManualSaver);
  const initBatteryListener = useBatteryStore((state) => state.initBatteryListener);

  useEffect(() => {
    initBatteryListener();
  }, [initBatteryListener]);

  // Self-Diagnosis & Crash Telemetry (Poin 76)
  const [isRunningDiag, setIsRunningDiag] = useState(false);
  const [diagReport, setDiagReport] = useState<DiagnosticReport | null>(null);
  const [isRepairing, setIsRepairing] = useState(false);

  const handleRunDiagnosis = async () => {
    setIsRunningDiag(true);
    try {
      const report = await runSelfDiagnosis();
      setDiagReport(report);
      if (report.overallStatus === 'healthy') {
        toast.success('Pemeriksaan selesai: Seluruh komponen sistem sehat!');
      } else if (report.overallStatus === 'warning') {
        toast.info('Pemeriksaan selesai: Ditemukan beberapa peringatan ringan.');
      } else {
        toast.error('Pemeriksaan selesai: Ditemukan masalah integritas.');
      }
    } finally {
      setIsRunningDiag(false);
    }
  };

  const handleRepairState = async () => {
    setIsRepairing(true);
    try {
      await repairSystemState();
      const fresh = await runSelfDiagnosis();
      setDiagReport(fresh);
    } finally {
      setIsRepairing(false);
    }
  };

  // Backup & Restore Handlers
  const handleExportBackup = async () => {
    try {
      setIsExporting(true);
      await exportUserDataToJson();
    } finally {
      setIsExporting(false);
    }
  };

  const handleTriggerImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm(`Pulihkan data dari file "${file.name}"? Data playlist, lagu favorit, dan riwayat akan digabungkan.`)) {
      e.target.value = '';
      return;
    }

    try {
      setIsImporting(true);
      const res = await importUserDataFromJson(file);
      if (res.success) {
        // Trigger page re-sync
        setTimeout(() => {
          router.refresh();
        }, 500);
      }
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

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

        {/* SECTION 2: CADANGKAN & PULIHKAN DATA (BATCH 2 - POIN 28) */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Download className="w-5 h-5 text-[#1DB954]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#b3b3b3]">
              Cadangkan & Pulihkan Data (JSON)
            </h2>
          </div>

          {/* Hidden File Input for Backup Restore */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleFileChange}
          />

          <div className="bg-[#181818] border border-white/5 rounded-2xl divide-y divide-white/5 overflow-hidden shadow-lg">
            {/* Export Backup */}
            <div className="p-4 md:p-5 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-sm md:text-base font-bold text-white">Ekspor Cadangan Data (.json)</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1DB954]/20 text-[#1DB954]">
                    Batch 2
                  </span>
                </div>
                <p className="text-xs text-[#b3b3b3]">
                  Unduh seluruh daftar playlist lokal, lagu favorit, riwayat putar, dan preferensi equalizer ke dalam file .json.
                </p>
              </div>
              <button
                onClick={handleExportBackup}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#1DB954] hover:bg-[#1ed760] text-black rounded-full text-xs font-bold transition-all cursor-pointer shrink-0 shadow-md shadow-[#1DB954]/20 disabled:opacity-50"
              >
                <Download className={`w-3.5 h-3.5 ${isExporting ? 'animate-bounce' : ''}`} />
                <span>{isExporting ? 'Mengekspor...' : 'Unduh Cadangan'}</span>
              </button>
            </div>

            {/* Import Backup */}
            <div className="p-4 md:p-5 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 pr-2">
                <h3 className="text-sm md:text-base font-bold text-white mb-0.5">
                  Pulihkan Cadangan Data (.json)
                </h3>
                <p className="text-xs text-[#b3b3b3]">
                  Pulihkan playlist, riwayat, dan lagu favorit Anda dari file cadangan JSON tanpa menghapus data yang sudah ada.
                </p>
              </div>
              <button
                onClick={handleTriggerImport}
                disabled={isImporting}
                className="flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs font-semibold transition-colors cursor-pointer shrink-0 disabled:opacity-50"
              >
                <Upload className={`w-3.5 h-3.5 ${isImporting ? 'animate-pulse' : ''}`} />
                <span>{isImporting ? 'Memulihkan...' : 'Pilih File JSON'}</span>
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 3: KUALITAS AUDIO & HEMAT DATA (BATCH 2 - POIN 30) */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Radio className="w-5 h-5 text-[#1DB954]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#b3b3b3]">
              Kualitas Audio & Penghemat Data (Data Saver)
            </h2>
          </div>

          <div className="bg-[#181818] border border-white/5 rounded-2xl p-4 md:p-5 shadow-lg space-y-4">
            <div>
              <h3 className="text-sm md:text-base font-bold text-white mb-0.5">Tingkat Kualitas Streaming</h3>
              <p className="text-xs text-[#b3b3b3]">
                Pilih opsi penghematan kuota seluler atau nikmati fidelitas audio maksimum.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {AUDIO_QUALITY_OPTIONS.map((opt) => {
                const isSelected = audioQuality === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setAudioQuality(opt.id)}
                    className={cn(
                      'p-3.5 rounded-xl border transition-all cursor-pointer text-left flex flex-col justify-between gap-2',
                      isSelected
                        ? 'bg-white/10 border-[#1DB954] shadow-md ring-1 ring-[#1DB954]/50'
                        : 'bg-white/5 border-transparent hover:bg-white/10'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'w-4 h-4 rounded-full border flex items-center justify-center transition-colors',
                            isSelected ? 'border-[#1DB954] bg-[#1DB954]' : 'border-white/40'
                          )}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                        </div>
                        <span className="text-sm font-bold text-white">{opt.name}</span>
                      </div>
                      {opt.id === 'low' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          Hemat Kuota &gt; 50%
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-white/80 font-medium">{opt.bitrateDesc}</p>
                      <p className="text-[11px] text-[#b3b3b3] mt-0.5">{opt.dataUsageDesc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* SECTION 4: AUDIO & PLAYBACK FEATURES (BATCH 2) */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <SlidersHorizontal className="w-5 h-5 text-[#1DB954]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#b3b3b3]">
              Fitur Pemutar & Efek Audio
            </h2>
          </div>

          <div className="bg-[#181818] border border-white/5 rounded-2xl divide-y divide-white/5 overflow-hidden shadow-lg">
            {/* Crossfade Antar Lagu (Poin 29) */}
            <div className="p-4 md:p-5 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-sm md:text-base font-bold text-white">Crossfade Antar Lagu</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1DB954]/20 text-[#1DB954]">
                      {crossfadeDuration === 0 ? 'Nonaktif' : `${crossfadeDuration} detik`}
                    </span>
                  </div>
                  <p className="text-xs text-[#b3b3b3]">
                    Efek transisi pudar halus (fade-out &amp; fade-in) saat berganti trek lagu untuk menghilangkan jeda hening.
                  </p>
                </div>
              </div>

              {/* Crossfade Selector Buttons */}
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                {[0, 2, 4, 6, 8, 12].map((sec) => {
                  const isActive = crossfadeDuration === sec;
                  return (
                    <button
                      key={sec}
                      onClick={() => setCrossfadeDuration(sec)}
                      className={cn(
                        'px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer border',
                        isActive
                          ? 'bg-[#1DB954] text-black border-[#1DB954] font-bold shadow-md shadow-[#1DB954]/20'
                          : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      {sec === 0 ? 'Mati' : `${sec} dtk`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Equalizer */}
            <div className="p-4 md:p-5 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-sm md:text-base font-bold text-white">Equalizer Suara (Web Audio API)</h3>
                  {isEqualizerEnabled ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1DB954]/20 text-[#1DB954]">
                      Aktif ({activePreset})
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/50">
                      Nonaktif
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#b3b3b3]">
                  Kustomisasi frekuensi bass, mid, treble, dan bass boost untuk kualitas suara optimal.
                </p>
              </div>
              <button
                onClick={openEqualizerModal}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#1DB954] hover:bg-[#1ed760] text-black rounded-full text-xs font-bold transition-all cursor-pointer shrink-0 shadow-md shadow-[#1DB954]/20"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Buka Equalizer</span>
              </button>
            </div>

            {/* Sleep Timer */}
            <div className="p-4 md:p-5 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-sm md:text-base font-bold text-white">Pengatur Waktu Tidur (Sleep Timer)</h3>
                  {isSleepTimerActive && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1DB954]/20 text-[#1DB954] font-mono">
                      {formatRemainingTimer(remainingSeconds)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#b3b3b3]">
                  Atur waktu mundur otomatis untuk menghentikan pemutaran musik saat Anda tertidur.
                </p>
              </div>
              <button
                onClick={openSleepTimerModal}
                className="flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs font-semibold transition-colors cursor-pointer shrink-0"
              >
                <Moon className="w-3.5 h-3.5" />
                <span>{isSleepTimerActive ? 'Kelola Timer' : 'Atur Timer'}</span>
              </button>
            </div>

            {/* Floating Mini-Player Widget */}
            <div className="p-4 md:p-5 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-sm md:text-base font-bold text-white">Mini-Player Melayang (Floating Widget)</h3>
                  {isFloatingEnabled ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1DB954]/20 text-[#1DB954]">
                      Aktif
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/50">
                      Nonaktif
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#b3b3b3]">
                  Tampilkan widget pemutar melayang di sudut layar saat menjelajahi halaman lain.
                </p>
              </div>
              <button
                onClick={toggleFloatingEnabled}
                className={cn(
                  'relative w-12 h-6 rounded-full transition-colors cursor-pointer shrink-0',
                  isFloatingEnabled ? 'bg-[#1DB954]' : 'bg-white/20'
                )}
                aria-label="Toggle Floating Widget"
              >
                <div
                  className={cn(
                    'w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5',
                    isFloatingEnabled ? 'left-6.5' : 'left-0.5'
                  )}
                />
              </button>
            </div>

            {/* Floating Lyrics Pill (Batch 3 - Poin 80) */}
            <div className="p-4 md:p-5 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-sm md:text-base font-bold text-white">Pil Lirik Melayang (Quick View)</h3>
                  {isFloatingLyricsEnabled ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1DB954]/20 text-[#1DB954]">
                      Aktif
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/50">
                      Nonaktif
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#b3b3b3]">
                  Tampilkan tombol pil lirik aktif sekilas yang mengapung di atas pemutar mini saat bernavigasi.
                </p>
              </div>
              <button
                onClick={toggleFloatingLyrics}
                className={cn(
                  'relative w-12 h-6 rounded-full transition-colors cursor-pointer shrink-0',
                  isFloatingLyricsEnabled ? 'bg-[#1DB954]' : 'bg-white/20'
                )}
                aria-label="Toggle Floating Lyrics Pill"
              >
                <div
                  className={cn(
                    'w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5',
                    isFloatingLyricsEnabled ? 'left-6.5' : 'left-0.5'
                  )}
                />
              </button>
            </div>

            {/* Battery Saver & Low-Power Mode (Batch 3 - Poin 74) */}
            <div className="p-4 md:p-5 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-sm md:text-base font-bold text-white">Mode Hemat Daya Baterai</h3>
                  {isLowPowerActive ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                      Aktif {isAutoLowPower ? '(Otomatis)' : '(Manual)'}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/50">
                      Nonaktif
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#b3b3b3]">
                  Kurangi beban CPU/GPU dengan membatasi animasi visualizer ke ~15 FPS dan meredupkan efek blur saat baterai melemah.
                </p>
                {batteryLevel !== null && (
                  <div className="flex items-center gap-1.5 mt-2 text-[11px] text-white/70">
                    {isCharging ? (
                      <BatteryCharging className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Battery className="w-3.5 h-3.5 text-white/70 shrink-0" />
                    )}
                    <span>
                      Status Baterai: {Math.round(batteryLevel * 100)}%
                      {isCharging ? ' (Sedang Mengisi Daya)' : ' (Baterai)'}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={toggleManualSaver}
                className={cn(
                  'relative w-12 h-6 rounded-full transition-colors cursor-pointer shrink-0',
                  isLowPowerActive ? 'bg-[#1DB954]' : 'bg-white/20'
                )}
                aria-label="Toggle Battery Saver Mode"
              >
                <div
                  className={cn(
                    'w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5',
                    isLowPowerActive ? 'left-6.5' : 'left-0.5'
                  )}
                />
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 5: APP SHORTCUTS & INFO */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <ShieldCheck className="w-5 h-5 text-[#1DB954]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#b3b3b3]">Aplikasi</h2>
          </div>

          <div className="bg-[#181818] border border-white/5 rounded-2xl p-4 md:p-5 space-y-3 shadow-lg">
            <div className="flex items-center justify-between text-sm py-1">
              <span className="text-white/70">Aplikasi</span>
              <span className="text-white font-semibold">MusicFY Web Player</span>
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
                prefetch={false}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs font-semibold transition-colors cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5 text-[#1DB954]" />
                <span>Install APK / PWA</span>
              </Link>
            </div>
          </div>
        </section>

        {/* SECTION 6: SELF-DIAGNOSIS & AUTOMATED RECOVERY (BATCH 3 - POIN 76) */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Activity className="w-5 h-5 text-[#1DB954]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#b3b3b3]">
              Diagnostik Klien & Pemulihan Mandiri
            </h2>
          </div>

          <div className="bg-[#181818] border border-white/5 rounded-2xl p-4 md:p-5 shadow-lg space-y-4">
            <div>
              <h3 className="text-sm md:text-base font-bold text-white mb-0.5">
                Uji Integritas Basis Data & State Pemutar
              </h3>
              <p className="text-xs text-[#b3b3b3]">
                Pindai apakah ada data preferensi lokal yang korup, periksa koneksi IndexedDB, dan pulihkan kondisi sistem secara otomatis jika terjadi galat tak terduga.
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                onClick={handleRunDiagnosis}
                disabled={isRunningDiag}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                <Activity className={cn('w-3.5 h-3.5 text-[#1DB954]', isRunningDiag && 'animate-spin')} />
                <span>{isRunningDiag ? 'Memindai Sistem...' : 'Jalankan Diagnosis Mandiri'}</span>
              </button>

              <button
                onClick={handleRepairState}
                disabled={isRepairing}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600/30 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                <Wrench className={cn('w-3.5 h-3.5', isRepairing && 'animate-spin')} />
                <span>{isRepairing ? 'Memulihkan...' : 'Pulihkan State Sistem'}</span>
              </button>

              <button
                onClick={openDevModal}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600/30 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                title="Buka Developer Diagnostic Panel (Ctrl+Shift+D)"
              >
                <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                <span>Master Dev Panel</span>
                <span className="text-[10px] bg-indigo-500/30 px-1.5 py-0.5 rounded text-indigo-200">Ctrl+Shift+D</span>
              </button>
            </div>

            {diagReport && (
              <div className="pt-3 border-t border-white/5 space-y-3">
                <div className="flex items-center justify-between text-xs py-1">
                  <span className="text-white/60">Status Kesehatan Keseluruhan:</span>
                  <span
                    className={cn(
                      'font-bold px-2.5 py-0.5 rounded-full text-[10px]',
                      diagReport.overallStatus === 'healthy'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : diagReport.overallStatus === 'warning'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-red-500/20 text-red-400'
                    )}
                  >
                    {diagReport.overallStatus === 'healthy'
                      ? 'Sistem Sehat (Optimal)'
                      : diagReport.overallStatus === 'warning'
                      ? 'Peringatan Ringan'
                      : 'Perlu Pemulihan'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-white/5 flex items-center justify-between">
                    <span className="text-white/70">Penyimpanan Lokal:</span>
                    <span className="font-semibold text-white">
                      {diagReport.checks.localStorage.checkedKeys} kunci dicek (
                      {diagReport.checks.localStorage.corruptedKeys.length === 0 ? '0 galat' : `${diagReport.checks.localStorage.corruptedKeys.length} galat`})
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white/5 flex items-center justify-between">
                    <span className="text-white/70">IndexedDB Versi:</span>
                    <span className="font-semibold text-emerald-400">
                      v{diagReport.checks.indexedDb.version} (
                      {diagReport.checks.indexedDb.healthy ? 'Tersambung' : 'Kendala'})
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white/5 flex items-center justify-between">
                    <span className="text-white/70">Web Audio API:</span>
                    <span className="font-semibold text-white">
                      {diagReport.checks.audioContext.supported ? 'Didukung Hardware' : 'Tidak Didukung'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white/5 flex items-center justify-between">
                    <span className="text-white/70">Kuota Browser:</span>
                    <span className="font-semibold text-white">
                      {diagReport.checks.storageQuota.percentage}% Digunakan
                    </span>
                  </div>
                </div>

                {diagReport.issues.length > 0 && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-amber-400">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Catatan Temuan Diagnostik:</span>
                    </div>
                    {diagReport.issues.map((issue) => (
                      <p key={issue.id} className="text-white/80 pl-5">
                        • {issue.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
