'use client';

import { AlertCircle, RotateCcw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="id" className="dark">
      <body className="bg-black text-white min-h-screen flex items-center justify-center p-6 antialiased font-sans">
        <div className="flex flex-col items-center justify-center text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Terjadi Gangguan Sistem</h1>
          <p className="text-sm text-[#b3b3b3] mb-8 leading-relaxed">
            Aplikasi mengalami kesalahan fatal yang tidak terduga. Klik tombol di bawah untuk memulihkan sesi Anda.
          </p>
          <button
            onClick={() => reset()}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold rounded-full hover:scale-105 active:scale-95 transition-all text-sm cursor-pointer shadow-lg shadow-[#1DB954]/20"
          >
            <RotateCcw className="w-4 h-4" />
            Muat Ulang Aplikasi
          </button>
        </div>
      </body>
    </html>
  );
}
