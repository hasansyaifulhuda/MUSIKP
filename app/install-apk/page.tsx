'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, DownloadCloud, Smartphone, CheckCircle2, ShieldCheck, Zap, ExternalLink, Globe } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast';

/**
 * TAUTAN UNDUHAN APK EKSTERNAL
 * Silakan ganti '#' dengan URL Google Drive, MediaFire, atau hosting APK Anda
 * Contoh: const APK_DOWNLOAD_URL = 'https://drive.google.com/file/d/YOUR_FILE_ID/view?usp=sharing';
 */
const APK_DOWNLOAD_URL: string = '#';

export default function InstallApkPage() {
  const router = useRouter();
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode (already installed PWA)
    if (
      (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) ||
      (typeof navigator !== 'undefined' && (navigator as any).standalone)
    ) {
      setIsInstalled(true);
    }

    if (typeof window !== 'undefined' && window.deferredPrompt) {
      setCanInstall(true);
    }

    const onPromptAvailable = () => setCanInstall(true);
    const onAppInstalled = () => {
      setIsInstalled(true);
      setCanInstall(false);
      toast.success('MusicFY berhasil terpasang di perangkat Anda!');
    };

    window.addEventListener('pwa-prompt-available', onPromptAvailable);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('pwa-prompt-available', onPromptAvailable);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const handleInstallPwa = async () => {
    if (typeof window !== 'undefined' && window.deferredPrompt) {
      try {
        toast.info('Membuka pemasangan aplikasi MusicFY...');
        await window.deferredPrompt.prompt();
        const choiceResult = await window.deferredPrompt.userChoice;
        if (choiceResult.outcome === 'accepted') {
          toast.success('Menginstal MusicFY...');
          setIsInstalled(true);
        } else {
          toast.info('Instalasi dibatalkan');
        }
        window.deferredPrompt = null;
        setCanInstall(false);
      } catch (err) {
        console.error('Install prompt error:', err);
        toast.error('Tidak dapat memicu instalasi otomatis');
      }
    } else {
      // Guide user based on browser/device
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const isIOS = /iPad|iPhone|iPod/.test(userAgent);
      if (isIOS) {
        toast.info('Ketuk ikon "Bagikan" (Share) di Safari lalu pilih "Tambahkan ke Layar Utama"');
      } else {
        toast.info('Buka menu titik tiga browser (⋮) lalu pilih "Instal aplikasi" atau "Tambahkan ke Layar Utama"');
      }
    }
  };

  const handleApkDownloadClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!APK_DOWNLOAD_URL || APK_DOWNLOAD_URL === '#' || APK_DOWNLOAD_URL.trim() === '') {
      e.preventDefault();
      toast.info('Tautan file .apk belum diatur. Silakan perbarui konstanta APK_DOWNLOAD_URL dengan link Google Drive / MediaFire Anda.');
    }
  };

  return (
    <div className="min-h-[85vh] flex flex-col justify-between p-4 md:p-8 select-none">
      {/* Top Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
          aria-label="Kembali"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl md:text-2xl font-extrabold text-white tracking-tight">Instal MusicFY</h1>
      </div>

      {/* Main Centered Hero */}
      <div className="flex-1 flex flex-col items-center justify-center text-center max-w-lg mx-auto py-8">
        <div className="relative mb-6">
          <div className="w-24 h-24 md:w-28 md:h-28 rounded-3xl bg-[#1DB954] flex items-center justify-center shadow-[0_16px_40px_rgba(29,185,84,0.35)]">
            <Smartphone className="w-12 h-12 md:w-14 md:h-14 text-black stroke-[2.2]" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-md">
            <Zap className="w-4 h-4 text-[#1DB954] fill-current" />
          </div>
        </div>

        <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-3 tracking-tight">
          Pasang Aplikasi MusicFY
        </h2>
        <p className="text-sm md:text-base text-[#b3b3b3] mb-8 leading-relaxed max-w-sm">
          Nikmati pengalaman pemutaran audio lancar tanpa lag, kontrol notifikasi layar kunci, dan akses offline instan di perangkat Anda.
        </p>

        {/* Buttons Action Container */}
        <div className="w-full max-w-xs flex flex-col gap-3">
          {/* 1. Tombol Utama: Instal PWA / Shortcut Web */}
          {isInstalled ? (
            <div className="flex items-center justify-center gap-2.5 px-6 py-3.5 bg-white/10 border border-white/15 rounded-full text-white font-semibold text-sm">
              <CheckCircle2 className="w-5 h-5 text-[#1DB954]" />
              <span>Shortcut Web / PWA Sudah Terpasang</span>
            </div>
          ) : (
            <button
              onClick={handleInstallPwa}
              className="w-full flex items-center justify-center gap-2.5 px-6 py-4 bg-[#1DB954] hover:bg-[#1ed760] text-black font-extrabold text-sm md:text-base rounded-full hover:scale-105 active:scale-95 transition-all shadow-[0_12px_32px_rgba(29,185,84,0.4)] cursor-pointer"
            >
              <Globe className="w-5 h-5 stroke-[2.5]" />
              <span>Instal PWA / Shortcut Web</span>
            </button>
          )}

          {/* 2. Tombol Kedua: Instal sebagai .apk */}
          <a
            href={APK_DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleApkDownloadClick}
            className="w-full flex items-center justify-center gap-2.5 px-6 py-3.5 bg-white/10 hover:bg-white/20 text-white font-bold text-sm md:text-base rounded-full border border-white/15 transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-lg"
          >
            <Smartphone className="w-5 h-5 text-[#1DB954]" />
            <span>Instal sebagai .apk</span>
            <ExternalLink className="w-4 h-4 text-white/50 ml-0.5" />
          </a>
        </div>

        {/* Features / Benefits Badges */}
        <div className="flex items-center justify-center gap-6 mt-10 text-xs text-[#b3b3b3]/80">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#1DB954]" />
            <span>Resmi & Ringan</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-[#1DB954]" />
            <span>Bebas Iklan</span>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="text-center text-xs text-[#b3b3b3]/50 pb-2">
        Aplikasi Web Progresif (PWA) & Paket Android MusicFY • Versi 3.0
      </div>
    </div>
  );
}
