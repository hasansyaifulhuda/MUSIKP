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
import { usePlayerStore } from '@/lib/store';
import { useEqualizerStore } from '@/lib/audioEffects';
import { useSleepTimerStore } from '@/lib/sleepTimerStore';
import { useContextMenuStore } from '@/lib/contextMenuStore';
import { useDevModalStore } from '@/lib/devModalStore';
import { useFloatingWidgetStore } from '@/lib/floatingWidgetStore';

export function ClientModals() {
  const hasTrackToAdd = usePlayerStore((state) => state.trackToAdd !== null);
  const isEqualizerOpen = useEqualizerStore((state) => state.isModalOpen);
  const isSleepTimerOpen = useSleepTimerStore((state) => state.isModalOpen);
  const isContextMenuOpen = useContextMenuStore((state) => state.isOpen);
  const isDevModalOpen = useDevModalStore((state) => state.isOpen);

  const isWidgetEnabled = useFloatingWidgetStore((state) => state.isEnabled);
  const isWidgetOpen = useFloatingWidgetStore((state) => state.isOpen);
  const hasCurrentTrack = usePlayerStore((state) => Boolean(state.currentTrack));
  const isPlayerExpanded = usePlayerStore((state) => state.isExpanded);

  const showFloatingWidget = Boolean(isWidgetEnabled && isWidgetOpen && hasCurrentTrack && !isPlayerExpanded);

  return (
    <>
      <ConsoleFilter />

      {hasTrackToAdd && (
        <ComponentErrorBoundary fallbackTitle="Playlist Modal">
          <AddToPlaylistModal />
        </ComponentErrorBoundary>
      )}

      {isSleepTimerOpen && (
        <ComponentErrorBoundary fallbackTitle="Sleep Timer Modal">
          <SleepTimerModal />
        </ComponentErrorBoundary>
      )}

      {isEqualizerOpen && (
        <ComponentErrorBoundary fallbackTitle="Equalizer Modal">
          <EqualizerModal />
        </ComponentErrorBoundary>
      )}

      {showFloatingWidget && (
        <ComponentErrorBoundary fallbackTitle="Floating Widget">
          <FloatingWidget />
        </ComponentErrorBoundary>
      )}

      {isContextMenuOpen && (
        <ComponentErrorBoundary fallbackTitle="Context Menu">
          <TrackContextMenu />
        </ComponentErrorBoundary>
      )}

      {isDevModalOpen && (
        <ComponentErrorBoundary fallbackTitle="Developer Diagnostic Modal">
          <DevDiagnosticModal />
        </ComponentErrorBoundary>
      )}

      <ToastContainer />
      <PWARegister />
      <OfflineIndicator />
    </>
  );
}
