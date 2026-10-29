'use client';

import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Search,
  DownloadCloud,
  Library,
  Settings,
  Clock,
  Flame,
  SlidersHorizontal,
  Moon,
  Smartphone,
  Menu,
  X,
  ChevronRight,
  Music,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { useEqualizerStore } from '@/lib/audioEffects';
import { useSleepTimerStore, formatRemainingTimer } from '@/lib/sleepTimerStore';
import { usePlayerStore } from '@/lib/store';

interface DrawerShortcutItem {
  name: string;
  desc: string;
  icon: any;
  badge: string | null;
  href?: string;
  prefetch?: boolean;
  action?: () => void;
  isActive?: boolean;
}

/**
 * Enterprise Responsive Bottom Drawer & Fluid Mobile Navigation
 * Master Blueprint PMUSIC Architecture - Batch 3 (Poin 79)
 *
 * Guarantees:
 * 1. Ergonomic 1-handed thumb-reachable navigation.
 * 2. Hardware-accelerated (translate3d / will-change) fluid 60fps bottom sheet drawer.
 * 3. Drag-to-dismiss gesture physics with spring damping.
 * 4. Instant modal triggers for Equalizer, Sleep Timer, and deep routes.
 */
const PRIMARY_NAV_ITEMS = [
  { name: 'Beranda', href: '/', icon: Home },
  { name: 'Cari', href: '/search', icon: Search },
  { name: 'Download', href: '/download', icon: DownloadCloud },
  { name: 'Koleksi', href: '/library', icon: Library },
];

export const BottomNav = memo(function BottomNav() {
  const pathname = usePathname();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const openEqualizer = useEqualizerStore((state) => state.openModal);
  const isEqualizerActive = useEqualizerStore((state) => state.isEnabled);

  const openSleepTimer = useSleepTimerStore((state) => state.openModal);
  const isSleepTimerActive = useSleepTimerStore((state) => state.isActive);
  const sleepTimerSeconds = useSleepTimerStore((state) => state.remainingSeconds);

  const currentTrack = usePlayerStore((state) => state.currentTrack);

  // Close drawer on route change
  useEffect(() => {
    setIsDrawerOpen(false);
  }, [pathname]);

  const toggleDrawer = useCallback(() => {
    setIsDrawerOpen((prev) => !prev);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  // Memoized secondary drawer shortcuts to prevent re-creation on navigation
  const drawerShortcuts: DrawerShortcutItem[] = useMemo(() => [
    {
      name: 'Riwayat Putar',
      desc: 'Lagu yang baru saja didengarkan',
      href: '/history',
      icon: Clock,
      badge: null,
      prefetch: true,
    },
    {
      name: 'Top 50 Populer',
      desc: 'Tangga lagu tren teratas',
      href: '/top50',
      icon: Flame,
      badge: 'Trending',
      prefetch: true,
    },
    {
      name: 'Equalizer Audio',
      desc: 'Kustomisasi bass & frekuensi',
      action: () => {
        closeDrawer();
        openEqualizer();
      },
      icon: SlidersHorizontal,
      badge: isEqualizerActive ? 'Aktif' : null,
      isActive: isEqualizerActive,
    },
    {
      name: 'Sleep Timer',
      desc: 'Waktu mundur penghenti musik',
      action: () => {
        closeDrawer();
        openSleepTimer();
      },
      icon: Moon,
      badge: isSleepTimerActive ? formatRemainingTimer(sleepTimerSeconds) : null,
      isActive: isSleepTimerActive,
    },
    {
      name: 'Pengaturan',
      desc: 'Preferensi audio & sistem',
      href: '/settings',
      icon: Settings,
      badge: null,
      prefetch: true,
    },
    {
      name: 'Install APK / PWA',
      desc: 'Aplikasi versi mandiri offline',
      href: '/install-apk',
      icon: Smartphone,
      badge: 'APK',
      prefetch: false,
    },
  ], [closeDrawer, openEqualizer, isEqualizerActive, openSleepTimer, isSleepTimerActive, sleepTimerSeconds]);

  const isDrawerRouteActive = useMemo(
    () => ['/history', '/top50', '/settings', '/install-apk'].includes(pathname),
    [pathname]
  );

  return (
    <>
      {/* 1. PRIMARY FIXED BOTTOM NAV BAR */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#121212]/95 backdrop-blur-xl border-t border-white/10 pb-safe gpu-accelerated contain-paint">
        <div className="flex justify-around items-center h-16 px-1">
          {PRIMARY_NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href && !isDrawerOpen;
            return (
              <Link
                key={item.name}
                href={item.href}
                prefetch={true}
                onClick={closeDrawer}
                className={cn(
                  'flex flex-col items-center justify-center w-full h-full py-1 transition-all select-none cursor-pointer',
                  isActive ? 'text-white font-semibold' : 'text-[#b3b3b3] hover:text-white'
                )}
              >
                <item.icon
                  className={cn(
                    'w-5 h-5 transition-transform duration-200',
                    isActive && 'text-[#1DB954] scale-110 fill-current'
                  )}
                  strokeWidth={isActive ? 2.5 : 1.8}
                />
                <span
                  className={cn(
                    'text-[10px] mt-1 tracking-tight truncate max-w-[64px]',
                    isActive ? 'text-[#1DB954] font-bold' : 'text-[#b3b3b3]'
                  )}
                >
                  {item.name}
                </span>
              </Link>
            );
          })}

          {/* Menu / Drawer Toggle Button */}
          <button
            onClick={toggleDrawer}
            className={cn(
              'flex flex-col items-center justify-center w-full h-full py-1 transition-all select-none cursor-pointer relative',
              isDrawerOpen || isDrawerRouteActive ? 'text-[#1DB954] font-bold' : 'text-[#b3b3b3] hover:text-white'
            )}
            aria-label="Buka Menu Lanjutan"
          >
            <div className="relative">
              <Menu
                className={cn(
                  'w-5 h-5 transition-transform duration-200',
                  (isDrawerOpen || isDrawerRouteActive) && 'text-[#1DB954] scale-110'
                )}
                strokeWidth={isDrawerOpen || isDrawerRouteActive ? 2.5 : 1.8}
              />
              {(isEqualizerActive || isSleepTimerActive) && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#1DB954] ring-2 ring-black animate-pulse" />
              )}
            </div>
            <span
              className={cn(
                'text-[10px] mt-1 tracking-tight truncate max-w-[64px]',
                isDrawerOpen || isDrawerRouteActive ? 'text-[#1DB954] font-bold' : 'text-[#b3b3b3]'
              )}
            >
              Menu
            </span>
          </button>
        </div>
      </nav>

      {/* 2. RESPONSIVE FLUID BOTTOM DRAWER (SHEET) */}
      <AnimatePresence>
        {isDrawerOpen && (
          <div className="md:hidden fixed inset-0 z-[60] flex flex-col justify-end">
            {/* Backdrop with Blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeDrawer}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />

            {/* Bottom Sheet Drawer Container */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300, mass: 0.8 }}
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={0.15}
              onDragEnd={(_, info) => {
                if (info.offset.y > 100 || info.velocity.y > 400) {
                  closeDrawer();
                }
              }}
              className="relative w-full bg-[#121212]/98 border-t border-white/10 rounded-t-3xl pt-3 pb-8 px-4 max-h-[82vh] overflow-y-auto no-scrollbar shadow-2xl gpu-accelerated select-none"
              style={{
                touchAction: 'pan-y',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {/* Drag Handle Bar */}
              <div className="w-12 h-1.5 rounded-full bg-white/20 mx-auto mb-3 cursor-grab active:cursor-grabbing hover:bg-white/40 transition-colors" />

              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#1DB954]/20 text-[#1DB954] flex items-center justify-center">
                    <Music className="w-4 h-4 fill-current stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">Navigasi Cepat</h3>
                    <p className="text-[11px] text-white/50">Menu &amp; Pintasan Fitur MusicFY</p>
                  </div>
                </div>
                <button
                  onClick={closeDrawer}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer"
                  aria-label="Tutup Menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Shortcuts Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {drawerShortcuts.map((item: DrawerShortcutItem) => {
                  const Icon = item.icon;
                  const isRoute = 'href' in item && typeof item.href === 'string';
                  const isCurrentActive = isRoute ? pathname === item.href : Boolean(item.isActive);

                  const content = (
                    <div
                      className={cn(
                        'flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer',
                        isCurrentActive
                          ? 'bg-white/10 border-[#1DB954]/50 shadow-md ring-1 ring-[#1DB954]/30'
                          : 'bg-white/[0.04] border-white/5 hover:bg-white/[0.08]'
                      )}
                    >
                      <div className="flex items-center gap-3.5 min-w-0 pr-2">
                        <div
                          className={cn(
                            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                            isCurrentActive
                              ? 'bg-[#1DB954] text-black font-bold'
                              : 'bg-white/10 text-white/80'
                          )}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white truncate">{item.name}</span>
                            {item.badge && (
                              <span
                                className={cn(
                                  'text-[10px] font-bold px-1.5 py-0.2 rounded-full',
                                  isCurrentActive
                                    ? 'bg-[#1DB954]/20 text-[#1DB954]'
                                    : 'bg-white/10 text-white/60'
                                )}
                              >
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-white/50 truncate mt-0.5">{item.desc}</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />
                    </div>
                  );

                  if (isRoute && item.href) {
                    return (
                      <Link key={item.name} href={item.href} prefetch={true} onClick={closeDrawer}>
                        {content}
                      </Link>
                    );
                  }

                  return (
                    <div key={item.name} onClick={item.action}>
                      {content}
                    </div>
                  );
                })}
              </div>

              {/* Bottom Drawer Footer Info */}
              <div className="mt-5 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-white/40 px-1">
                <span>MusicFY v2.0 • Mobile Fluid Nav</span>
                <span className="flex items-center gap-1.5 text-[#1DB954]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1DB954] animate-pulse" />
                  <span>Siap Offline</span>
                </span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
});
