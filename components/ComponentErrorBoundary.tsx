'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
  className?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ComponentErrorBoundary (Poin 94: Granular Component-Level Error Isolation)
 * Prevents unhandled subcomponent errors from propagating up and breaking the entire page or player.
 */
export class ComponentErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('[IsolatedComponentError]:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className={`p-4 rounded-2xl bg-white/5 border border-red-500/20 text-center select-none ${
            this.props.className || ''
          }`}
        >
          <div className="flex items-center justify-center gap-2 text-xs text-red-400 mb-2 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{this.props.fallbackTitle || 'Komponen mengalami kendala visual'}</span>
          </div>
          <p className="text-[11px] text-white/50 mb-3 max-w-xs mx-auto">
            {this.state.error?.message || 'Terjadi kesalahan eksekusi pada modul ini.'}
          </p>
          <button
            onClick={this.handleRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer"
          >
            <RotateCcw className="w-3 h-3 text-[#1DB954]" />
            <span>Muat Ulang Komponen</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
