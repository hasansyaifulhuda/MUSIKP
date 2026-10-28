'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, DownloadCloud, Smartphone, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast';

export default function InstallApkPage() {
  const router = useRouter();
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode (already installed PWA)
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    if (window.deferredPrompt) {
      setCanInstall(true);
    }

    const onPromptAvailable = () => setCanInstall(true);
    const onAppInstalled = () => {
      setIsInstalled(true);
      setCanInstall(false);
      toast.success('PMUSIC berhasil terpasang di perangkat Anda!');
    };

    window.addEventListener('pwa-prompt-available', onPromptAvailable);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('pwa-prompt-available', onPromptAvailable);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (window.deferredPrompt) {
      try {
        toast.info('Membuka pemasangan aplikasi...');
        await window.deferredPrompt.prompt();
        const choiceResult = await window.deferredPrompt.userChoice;
        if (choiceResult.outcome === 'accepted') {
          toast.success('Menginstal PMUSIC...');
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
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS) {
        toast.info('Ketuk ikon "Bagikan" (Share) di Safari lalu pilih "Tambahkan ke Layar Utama"');
      } else {
        toast.info('Buka menu titik tiga browser (⋮) lalu pilih "Instal aplikasi" atau "Tambahkan ke Layar Utama"');
      }
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
        <h1 className="text-xl md:text-2xl font-extrabold text-white tracking-tight">Install APK</h1>
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
          Pasang Aplikasi PMUSIC
        </h2>
        <p className="text-sm md:text-base text-[#b3b3b3] mb-8 leading-relaxed max-w-sm">
          Nikmati pengalaman pemutaran audio lancar tanpa lag, kontrol notifikasi layar kunci, dan akses offline instan di ponsel Anda.
        </p>

        {/* Clean Centered Install Button */}
        {isInstalled ? (
          <div className="flex items-center gap-2.5 px-6 py-3.5 bg-white/10 border border-white/15 rounded-full text-white font-semibold text-sm">
            <CheckCircle2 className="w-5 h-5 text-[#1DB954]" />
            <span>Aplikasi Sudah Terpasang di Perangkat Ini</span>
          </div>
        ) : (
          <button
            onClick={handleInstallClick}
            className="flex items-center justify-center gap-3 px-8 py-4 bg-[#1DB954] hover:bg-[#1ed760] text-black font-extrabold text-base rounded-full hover:scale-105 active:scale-95 transition-all shadow-[0_12px_32px_rgba(29,185,84,0.4)] cursor-pointer"
          >
            <DownloadCloud className="w-5 h-5 stroke-[2.5]" />
            <span>Install APK Sekarang</span>
          </button>
        )}

        <div className="flex items-center gap-6 mt-10 text-xs text-[#b3b3b3]/80">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#1DB954]" />
            <span>Resmi & Ringan</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-[#1DB954]" />
            <span>Tanpa Unduh Ulang</span>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="text-center text-xs text-[#b3b3b3]/50 pb-2">
        Aplikasi Web Progresif (PWA) PMUSIC • Versi 2.0
      </div>
    </div>
  );
}
