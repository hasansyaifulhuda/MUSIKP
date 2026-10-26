import type { Metadata, Viewport } from 'next';
import './globals.css';
import { BottomNav } from '@/components/BottomNav';
import { Sidebar } from '@/components/Sidebar';
import { Player } from '@/components/Player';
import { BackgroundProvider } from '@/components/BackgroundProvider';
import { MusicProvider } from '@/context/MusicContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ClientModals } from '@/components/ClientModals';

export const metadata: Metadata = {
  title: 'Spotify - Web Player: Musik untuk semua orang',
  description: 'Spotify clone - dengarkan jutaan lagu dan podcast gratis di platform streaming musik modern.',
  manifest: '/manifest.json',
  referrer: 'no-referrer',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Spotify',
  },
  icons: {
    icon: 'https://f.top4top.io/p_3733w0g4e0.jpg',
    apple: 'https://f.top4top.io/p_3733w0g4e0.jpg',
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="dark">
      <head>
        <meta name="referrer" content="no-referrer" />
      </head>
      <body
        className="bg-black text-white antialiased min-h-screen selection:bg-[#1DB954] selection:text-black font-sans overflow-x-hidden"
        suppressHydrationWarning
      >
        <MusicProvider>
          <BackgroundProvider />
          
          {/* Desktop Fixed Left Navigation */}
          <Sidebar />

          {/* Main Content Viewport */}
          <div className="md:pl-64 lg:pl-72 md:p-2 min-h-screen">
            <div className="min-h-[calc(100vh-16px)] bg-[#121212] md:rounded-lg overflow-hidden pb-28 md:pb-32 border border-transparent md:border-white/[0.04] shadow-2xl relative">
              <ErrorBoundary name="MainView">
                {children}
              </ErrorBoundary>
            </div>
          </div>

          {/* Audio Engine & Interactive Player */}
          <ErrorBoundary name="PlayerView">
            <Player />
          </ErrorBoundary>

          {/* Mobile Bottom Navigation Bar */}
          <BottomNav />

          {/* Lazily Loaded Client Modals, PWA & Toasts */}
          <ClientModals />
        </MusicProvider>
      </body>
    </html>
  );
}
