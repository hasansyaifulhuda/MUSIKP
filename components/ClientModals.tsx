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

export function ClientModals() {
  return (
    <>
      <ConsoleFilter />
      <AddToPlaylistModal />
      <ToastContainer />
      <PWARegister />
    </>
  );
}
