'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Production-grade Error Boundary for Audio & Views:
 * Gracefully catches runtime errors, network dropouts, or unhandled exceptions,
 * presenting a clean, minimalist Spotify dark UI with an instant retry action.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.name || 'Global'}] Caught error:`, error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[220px] p-6 text-center select-none">
          <div className="bg-[#181818] border border-white/5 rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4 text-[#1DB954]">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base md:text-lg font-bold text-white mb-2">
              Terjadi Gangguan Sementara
            </h3>
            <p className="text-xs md:text-sm text-[#b3b3b3] mb-6 leading-relaxed">
              Koneksi terputus atau gagal memuat konten. Silakan coba kembali untuk melanjutkan pemutaran.
            </p>
            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 px-6 py-2.5 bg-white text-black font-semibold text-xs md:text-sm rounded-full hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-md"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Coba Lagi</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
