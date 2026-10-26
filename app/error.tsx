'use client';

import { useEffect } from 'react';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';
import Link from 'next/link';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled UI Exception caught by error boundary:', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6 text-white select-none">
      <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
        <AlertCircle className="w-8 h-8 text-red-500" />
      </div>
      <h1 className="text-2xl font-bold mb-2">Terjadi Kesalahan</h1>
      <p className="text-sm text-[#b3b3b3] max-w-md mb-8 leading-relaxed">
        Maaf, terjadi masalah saat memuat konten ini. Silakan coba muat ulang atau kembali ke beranda.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => reset()}
          className="flex items-center gap-2 px-6 py-2.5 bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold rounded-full hover:scale-105 active:scale-95 transition-all text-sm cursor-pointer shadow-lg shadow-[#1DB954]/20"
        >
          <RotateCcw className="w-4 h-4" />
          Coba Lagi
        </button>
        <Link
          href="/"
          className="flex items-center gap-2 px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white font-medium rounded-full hover:scale-105 active:scale-95 transition-all text-sm cursor-pointer border border-white/10"
        >
          <Home className="w-4 h-4" />
          Beranda
        </Link>
      </div>
    </div>
  );
}
