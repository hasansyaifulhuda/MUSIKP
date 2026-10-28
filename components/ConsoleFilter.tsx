'use client';

import { useEffect } from 'react';

/**
 * ConsoleFilter:
 * Production console error sanitizer that suppresses benign, non-actionable
 * third-party warnings and browser engine noise:
 * - YouTube iframe postMessage origin mismatches & telemetry beacons
 * - HTML5 Audio play() interruption when rapidly skipping songs
 * - Browser Autoplay policy warnings before first user gesture
 * - Chrome extensions & adblocker ERR_BLOCKED_BY_CLIENT notifications
 * - Web Share API user cancellation (AbortError)
 * - ResizeObserver loop completion notifications
 * - Transient IndexedDB closing/abort state reconnections
 */
export function ConsoleFilter() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const NOISY_PATTERNS = [
      'Failed to execute \'postMessage\' on \'DOMWindow\'',
      'The target origin provided',
      'does not match the recipient window\'s origin',
      'The play() request was interrupted',
      'play() failed because the user didn\'t interact',
      'The AudioContext was not allowed to start',
      'message channel closed before a response was received',
      'ResizeObserver loop completed with undelivered notifications',
      'ResizeObserver loop limit exceeded',
      'ERR_BLOCKED_BY_CLIENT',
      'AbortError',
      'Share canceled',
      'www-widgetapi.js',
      'www.youtube.com/iframe_api',
      'youtube.com/generate_204',
      'youtube-nocookie.com',
      'doubleclick.net',
      'InvalidStateError: Failed to execute \'transaction\' on \'IDBDatabase\'',
      'The database connection is closing',
      'The transaction was aborted',
      'TransactionInactiveError',
      'NotSupportedError',
      'NotAllowedError',
      'A listener indicated an asynchronous response',
      'chrome-extension://',
      'moz-extension://',
      'safari-extension://',
      'Navigator.share is not supported',
      'Web Share API is not supported',
      'googlevideo.com',
      'ytimg.com',
    ];

    const isBenignNoise = (val: any): boolean => {
      if (!val) return false;
      const str = typeof val === 'string' ? val : val?.message || String(val);
      return NOISY_PATTERNS.some((pat) => str.includes(pat));
    };

    // 1. Wrap console.error and console.warn
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    console.error = (...args: any[]) => {
      if (args.some((arg) => isBenignNoise(arg))) {
        return;
      }
      originalConsoleError.apply(console, args);
    };

    console.warn = (...args: any[]) => {
      if (args.some((arg) => isBenignNoise(arg))) {
        return;
      }
      originalConsoleWarn.apply(console, args);
    };

    // 2. Intercept unhandled promise rejections for benign noise
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isBenignNoise(event.reason)) {
        event.preventDefault();
      }
    };

    // 3. Intercept global window error events for benign noise
    const handleGlobalError = (event: ErrorEvent) => {
      if (isBenignNoise(event.error) || isBenignNoise(event.message)) {
        event.preventDefault();
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleGlobalError);

    return () => {
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleGlobalError);
    };
  }, []);

  return null;
}
