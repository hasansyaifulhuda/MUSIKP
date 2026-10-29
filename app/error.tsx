'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw, Home, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    console.error('[AppRouter:ErrorPage] Unhandled route error:', error);
  }, [error]);

  const handleFullReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-[75vh] flex flex-col items-center justify-center text-center p-6 text-white select-none">
      <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6 text-red-400 shadow-inner">
        <AlertTriangle className="w-8 h-8" />
      </div>

      <h1 className="text-2xl md:text-3xl font-extrabold mb-2 tracking-tight">Terjadi Kesalahan Halaman</h1>
      <p className="text-sm text-[#b3b3b3] max-w-md mb-8 leading-relaxed">
        Maaf, terjadi kendala saat memuat rute ini. Sesi pemutaran musik di latar belakang tetap aman.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
        <button
          onClick={() => reset()}
          className="flex items-center gap-2 px-6 py-2.5 bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold rounded-full transition-all text-sm cursor-pointer shadow-lg shadow-[#1DB954]/20"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Coba Lagi</span>
        </button>

        <button
          onClick={handleFullReload}
          className="flex items-center gap-2 px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-full transition-all text-sm cursor-pointer border border-white/10"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Muat Ulang</span>
        </button>

        <Link
          href="/"
          className="flex items-center gap-2 px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white font-medium rounded-full transition-all text-sm cursor-pointer border border-white/5"
        >
          <Home className="w-4 h-4" />
          <span>Beranda</span>
        </Link>
      </div>

      {/* Expandable details */}
      <div className="max-w-md w-full pt-4 border-t border-white/5">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center justify-between w-full text-xs text-white/40 hover:text-white/70 transition-colors py-1 cursor-pointer"
        >
          <span>Detail Teknis (Pengembang)</span>
          {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showDetails && (
          <div className="mt-2 p-3 bg-black/60 rounded-xl text-left border border-white/10 overflow-x-auto max-h-36 no-scrollbar">
            <p className="text-xs font-mono text-red-400 font-semibold break-words">
              {error.message || 'Unknown error'}
            </p>
            {error.digest && (
              <p className="text-[10px] font-mono text-white/40 mt-1">
                Digest: {error.digest}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
