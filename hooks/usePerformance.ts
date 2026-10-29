'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Hook to debounce a rapidly changing state or value (e.g. search input or window dimensions).
 * Master Blueprint PMUSIC Architecture - Phase 1.2 (Point 8)
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook to debounce a callback invocation cleanly.
 */
export function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );
}

/**
 * Hook to throttle a callback invocation (e.g. for high-frequency scroll or resize events).
 */
export function useThrottleCallback<T extends (...args: any[]) => void>(
  callback: T,
  limit: number
): (...args: Parameters<T>) => void {
  const lastRan = useRef<number>(0);
  const handlerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (handlerRef.current) clearTimeout(handlerRef.current);
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastRan.current >= limit) {
        callbackRef.current(...args);
        lastRan.current = now;
      } else {
        if (handlerRef.current) clearTimeout(handlerRef.current);
        handlerRef.current = setTimeout(() => {
          callbackRef.current(...args);
          lastRan.current = Date.now();
        }, limit - (now - lastRan.current));
      }
    },
    [limit]
  );
}

/**
 * Hook for throttled scroll event listeners on window or scrollable container.
 */
export function useThrottledScroll(
  onScroll: (scrollTop: number, event: Event) => void,
  limit: number = 50,
  targetElement?: HTMLElement | null
) {
  const throttledHandler = useThrottleCallback(onScroll, limit);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const target: EventTarget = targetElement || window;
    const handleScroll = (e: Event) => {
      const top = targetElement
        ? targetElement.scrollTop
        : window.scrollY || document.documentElement.scrollTop;
      throttledHandler(top, e);
    };

    target.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      target.removeEventListener('scroll', handleScroll);
    };
  }, [throttledHandler, targetElement]);
}

/**
 * High-performance requestAnimationFrame loop with auto-pause on document visibility hidden.
 */
export function useAnimationFrame(callback: (delta: number) => void, enabled: boolean = true) {
  const requestRef = useRef<number | null>(null);
  const previousTimeRef = useRef<number | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      previousTimeRef.current = null;
      return;
    }

    const animate = (time: number) => {
      if (previousTimeRef.current != null) {
        const delta = time - previousTimeRef.current;
        callbackRef.current(delta);
      }
      previousTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [enabled]);
}
