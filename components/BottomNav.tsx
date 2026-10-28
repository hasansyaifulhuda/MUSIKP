'use client';

import { memo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, DownloadCloud, Library, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

export const BottomNav = memo(function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    { name: 'Beranda', href: '/', icon: Home },
    { name: 'Cari', href: '/search', icon: Search },
    { name: 'Download', href: '/download', icon: DownloadCloud },
    { name: 'Koleksi', href: '/library', icon: Library },
    { name: 'Pengaturan', href: '/settings', icon: Settings },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#121212]/95 backdrop-blur-xl border-t border-white/10 pb-safe gpu-accelerated">
      <div className="flex justify-around items-center h-16 px-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              prefetch={true}
              className={cn(
                'flex flex-col items-center justify-center w-full h-full py-1 transition-all select-none cursor-pointer',
                isActive ? 'text-white font-semibold' : 'text-[#b3b3b3] hover:text-white'
              )}
            >
              <item.icon
                className={cn('w-5 h-5 transition-transform duration-200', isActive && 'text-[#1DB954] scale-110 fill-current')}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              <span className={cn('text-[10px] mt-1 tracking-tight truncate max-w-[64px]', isActive ? 'text-[#1DB954] font-bold' : 'text-[#b3b3b3]')}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
});
