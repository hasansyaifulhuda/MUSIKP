'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { ErrorBoundary } from './ErrorBoundary';

interface RouteContainerProps {
  children: React.ReactNode;
}

/**
 * Route-Aware Isolation Container
 * Guarantees that route transitions reset component errors and unmount stale state,
 * preventing unhandled route exceptions or component corruption from causing full app reloads.
 */
export function RouteContainer({ children }: RouteContainerProps) {
  const pathname = usePathname();

  return (
    <ErrorBoundary key={pathname} name={`Halaman: ${pathname}`}>
      {children}
    </ErrorBoundary>
  );
}
