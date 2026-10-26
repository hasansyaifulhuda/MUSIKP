'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Hook to debounce a rapidly changing state or value (e.g. search input or window dimensions).
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
 * Hook to throttle a callback invocation.
 */
export function useThrottleCallback<T extends (...args: any[]) => void>(callback: T, limit: number): T {
  const lastRan = useRef<number>(0);
  const handlerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (handlerRef.current) clearTimeout(handlerRef.current);
    };
  }, []);

  return useCallback(
    ((...args: any[]) => {
      const now = Date.now();
      if (now - lastRan.current >= limit) {
        callback(...args);
        lastRan.current = now;
      } else {
        if (handlerRef.current) clearTimeout(handlerRef.current);
        handlerRef.current = setTimeout(() => {
          callback(...args);
          lastRan.current = Date.now();
        }, limit - (now - lastRan.current));
      }
    }) as T,
    [callback, limit]
  );
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
