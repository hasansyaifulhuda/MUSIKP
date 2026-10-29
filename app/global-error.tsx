'use client';

import { AlertTriangle, RotateCcw, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const handleFullReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <html lang="id" className="dark">
      <body className="bg-black text-white min-h-screen flex items-center justify-center p-6 antialiased font-sans">
        <div className="flex flex-col items-center justify-center text-center max-w-md bg-[#141414] border border-white/10 rounded-2xl p-8 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6 text-red-400 shadow-inner">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold mb-2 tracking-tight">Terjadi Gangguan Sistem Fatal</h1>
          <p className="text-sm text-[#b3b3b3] mb-8 leading-relaxed">
            Aplikasi mendeteksi pengecualian global yang tidak tertangani. Klik tombol di bawah untuk memulihkan sesi Anda secara aman.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => reset()}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold rounded-full transition-all text-sm cursor-pointer shadow-lg shadow-[#1DB954]/20"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Pulihkan Sesi</span>
            </button>
            <button
              onClick={handleFullReload}
              className="flex items-center gap-2 px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-full transition-all text-sm cursor-pointer border border-white/10"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Muat Ulang Penuh</span>
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
