'use client';

import { memo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Library, Heart, Clock, DownloadCloud, Smartphone, Settings, Music } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Sidebar = memo(function Sidebar() {
  const pathname = usePathname();

  const mainNav = [
    { name: 'Beranda', href: '/', icon: Home },
    { name: 'Cari', href: '/search', icon: Search },
  ];

  const libraryNav = [
    { name: 'Koleksi', href: '/library', icon: Library },
    { name: 'Lagu Disukai', href: '/library', icon: Heart },
    { name: 'Download', href: '/download', icon: DownloadCloud },
    { name: 'Riwayat Putar', href: '/history', icon: Clock },
    { name: 'Install APK', href: '/install-apk', icon: Smartphone },
    { name: 'Pengaturan', href: '/settings', icon: Settings },
  ];

  return (
    <aside className="hidden md:flex flex-col fixed top-0 left-0 bottom-24 w-64 lg:w-72 p-2 gap-2 z-30 select-none bg-black">
      {/* Brand & Main Navigation Card */}
      <div className="bg-[#121212] rounded-lg p-5 flex flex-col gap-5 border border-white/[0.04]">
        <Link href="/" className="flex items-center gap-3 text-white group cursor-pointer">
          <div className="w-9 h-9 rounded-full bg-[#1DB954] flex items-center justify-center text-black shadow-md shadow-[#1DB954]/20 group-hover:scale-105 transition-transform">
            <Music className="w-5 h-5 fill-current stroke-[2.5]" />
          </div>
          <span className="font-extrabold text-xl tracking-tight text-white group-hover:text-[#1DB954] transition-colors">
            Spotify
          </span>
        </Link>

        <nav className="flex flex-col gap-1">
          {mainNav.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-4 px-3 py-2.5 rounded-md text-sm font-bold transition-all cursor-pointer',
                  isActive
                    ? 'text-white bg-white/10'
                    : 'text-[#b3b3b3] hover:text-white hover:bg-white/[0.06]'
                )}
              >
                <item.icon className={cn('w-6 h-6 transition-colors', isActive ? 'text-[#1DB954] fill-current' : 'text-[#b3b3b3]')} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Library & Secondary Navigation Card */}
      <div className="bg-[#121212] rounded-lg p-4 flex-1 flex flex-col min-h-0 border border-white/[0.04]">
        <div className="flex items-center justify-between mb-3 px-2">
          <span className="text-xs font-bold text-[#b3b3b3] uppercase tracking-wider">Koleksi Anda</span>
        </div>

        <nav className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-1 spotify-scrollbar">
          {libraryNav.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3.5 px-3 py-2.5 rounded-md text-sm font-semibold transition-all cursor-pointer',
                  isActive
                    ? 'text-white bg-white/10'
                    : 'text-[#b3b3b3] hover:text-white hover:bg-white/[0.06]'
                )}
              >
                <item.icon className={cn('w-5 h-5 transition-colors', isActive ? 'text-[#1DB954]' : 'text-[#b3b3b3]')} />
                <span className="truncate">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Legal / Spotify Status Badge */}
        <div className="pt-3 border-t border-white/[0.06] px-2 text-[11px] text-[#b3b3b3]/60 flex items-center justify-between">
          <span>Spotify Web Player</span>
          <span className="flex items-center gap-1.5 text-[10px] text-[#1DB954]">
            <span className="w-2 h-2 rounded-full bg-[#1DB954] animate-pulse" />
            <span>Aktif</span>
          </span>
        </div>
      </div>
    </aside>
  );
});
