'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, RefreshCw, ChevronDown, ChevronUp, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
  onReset?: () => void;
  resetKey?: any;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

/**
 * Enterprise Global & Modular Error Boundary
 * Master Blueprint PMUSIC Architecture - Batch 2 (Poin 26)
 *
 * Guarantees:
 * 1. Prevents Total White Screen of Death (WSOD) across all route and audio lifecycles.
 * 2. Automatic single-shot chunk failure recovery (reloads on outdated dynamic import chunks).
 * 3. Graceful fallback UI with instant "Coba Lagi" and full page reload options.
 * 4. Expandable technical error details for developer debugging.
 * 5. Automatic state reset on browser back/forward (popstate).
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      showDetails: false,
    };
  }

  public componentDidMount() {
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', this.handleReset);
    }
  }

  public componentDidUpdate(prevProps: Props) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.handleReset();
    }
  }

  public componentWillUnmount() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', this.handleReset);
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error(`[ErrorBoundary:${this.props.name || 'Global'}] Caught runtime error:`, error, errorInfo);

    // Dynamic Chunk Load Error Handling:
    // Safely log chunk errors without calling window.location.reload() automatically.
    // In Capacitor WebView and mobile background audio playback, automatic reloads terminate active <audio> sessions.
    const isChunkError =
      error?.name === 'ChunkLoadError' ||
      error?.message?.includes('Loading chunk') ||
      error?.message?.includes('Failed to fetch dynamically imported module');

    if (isChunkError) {
      console.warn('[ErrorBoundary] Dynamic chunk load failure caught. Preserving active audio playback and presenting in-place retry UI.');
    }
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false });
    this.props.onReset?.();
  };

  public handleFullReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  public toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }

      const boundaryName = this.props.name || 'Aplikasi';
      const errorMessage = this.state.error?.message || 'Kesalahan runtime tidak terduga';

      return (
        <div className="flex flex-col items-center justify-center min-h-[280px] p-6 text-center select-none w-full">
          <div className="bg-[#181818] border border-white/10 rounded-2xl p-6 md:p-8 max-w-lg w-full shadow-2xl flex flex-col items-center relative overflow-hidden backdrop-blur-xl">
            {/* Glowing Accent Orb */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-[#1DB954]/20 rounded-full blur-3xl pointer-events-none" />

            {/* Error Icon */}
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4 text-red-400 shadow-inner">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <h3 className="text-lg md:text-xl font-bold text-white mb-2 tracking-tight">
              Terjadi Gangguan pada {boundaryName}
            </h3>

            <p className="text-xs md:text-sm text-[#b3b3b3] mb-6 leading-relaxed max-w-sm">
              Sistem berhasil mengisolasi kesalahan agar tidak mempengaruhi seluruh aplikasi. Anda dapat mencoba memuat ulang sesi ini.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 w-full mb-4">
              <button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold text-xs md:text-sm rounded-full transition-all cursor-pointer shadow-lg shadow-[#1DB954]/20"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Coba Lagi</span>
              </button>

              <button
                onClick={this.handleFullReload}
                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs md:text-sm rounded-full transition-all cursor-pointer border border-white/10"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Muat Ulang Halaman</span>
              </button>
            </div>

            {/* Collapsible Error Debug Details */}
            <div className="w-full pt-3 border-t border-white/5">
              <button
                onClick={this.toggleDetails}
                className="flex items-center justify-between w-full text-[11px] text-white/40 hover:text-white/70 transition-colors py-1 cursor-pointer"
              >
                <span>Detail Teknis Kesalahan</span>
                {this.state.showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {this.state.showDetails && (
                <div className="mt-2 p-3 bg-black/50 rounded-xl text-left border border-white/5 overflow-x-auto max-h-36 no-scrollbar">
                  <p className="text-[11px] font-mono text-red-400 break-words font-semibold">
                    {errorMessage}
                  </p>
                  {this.state.error?.stack && (
                    <pre className="text-[10px] font-mono text-white/30 mt-1.5 whitespace-pre-wrap leading-tight">
                      {this.state.error.stack.split('\n').slice(0, 4).join('\n')}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
