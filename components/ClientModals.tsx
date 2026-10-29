'use client';

import dynamic from 'next/dynamic';

const AddToPlaylistModal = dynamic(
  () => import('@/components/AddToPlaylistModal').then((mod) => mod.AddToPlaylistModal),
  { ssr: false }
);

const ToastContainer = dynamic(
  () => import('@/components/ToastContainer').then((mod) => mod.ToastContainer),
  { ssr: false }
);

const PWARegister = dynamic(
  () => import('@/components/PWARegister').then((mod) => mod.PWARegister),
  { ssr: false }
);

const ConsoleFilter = dynamic(
  () => import('@/components/ConsoleFilter').then((mod) => mod.ConsoleFilter),
  { ssr: false }
);

const OfflineIndicator = dynamic(
  () => import('@/components/OfflineIndicator').then((mod) => mod.OfflineIndicator),
  { ssr: false }
);

const SleepTimerModal = dynamic(
  () => import('@/components/SleepTimerModal').then((mod) => mod.SleepTimerModal),
  { ssr: false }
);

const EqualizerModal = dynamic(
  () => import('@/components/EqualizerModal').then((mod) => mod.EqualizerModal),
  { ssr: false }
);

const FloatingWidget = dynamic(
  () => import('@/components/FloatingWidget').then((mod) => mod.FloatingWidget),
  { ssr: false }
);

const TrackContextMenu = dynamic(
  () => import('@/components/TrackContextMenu').then((mod) => mod.TrackContextMenu),
  { ssr: false }
);

const DevDiagnosticModal = dynamic(
  () => import('@/components/DevDiagnosticModal').then((mod) => mod.DevDiagnosticModal),
  { ssr: false }
);

import { ComponentErrorBoundary } from '@/components/ComponentErrorBoundary';

export function ClientModals() {
  return (
    <>
      <ConsoleFilter />
      <ComponentErrorBoundary fallbackTitle="Playlist Modal">
        <AddToPlaylistModal />
      </ComponentErrorBoundary>
      <ComponentErrorBoundary fallbackTitle="Sleep Timer Modal">
        <SleepTimerModal />
      </ComponentErrorBoundary>
      <ComponentErrorBoundary fallbackTitle="Equalizer Modal">
        <EqualizerModal />
      </ComponentErrorBoundary>
      <ComponentErrorBoundary fallbackTitle="Floating Widget">
        <FloatingWidget />
      </ComponentErrorBoundary>
      <ComponentErrorBoundary fallbackTitle="Context Menu">
        <TrackContextMenu />
      </ComponentErrorBoundary>
      <ComponentErrorBoundary fallbackTitle="Developer Diagnostic Modal">
        <DevDiagnosticModal />
      </ComponentErrorBoundary>
      <ToastContainer />
      <PWARegister />
      <OfflineIndicator />
    </>
  );
}
