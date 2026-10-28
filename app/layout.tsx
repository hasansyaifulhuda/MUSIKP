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
  title: 'PMUSIC',
  description: 'PMUSIC - Your Ultimate Music Player: dengarkan jutaan lagu dan podcast gratis di platform streaming musik modern.',
  manifest: '/manifest.json',
  referrer: 'no-referrer',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'PMUSIC',
  },
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var NOISY = [
                  "Failed to execute 'postMessage' on 'DOMWindow'",
                  "The target origin provided",
                  "does not match the recipient window's origin",
                  "The play() request was interrupted",
                  "play() failed because the user didn't interact",
                  "The AudioContext was not allowed to start",
                  "message channel closed before a response was received",
                  "ResizeObserver loop completed",
                  "ResizeObserver loop limit exceeded",
                  "ERR_BLOCKED_BY_CLIENT",
                  "AbortError",
                  "Share canceled",
                  "www-widgetapi.js",
                  "www.youtube.com/iframe_api",
                  "youtube.com/generate_204",
                  "youtube-nocookie.com",
                  "doubleclick.net",
                  "InvalidStateError",
                  "database connection is closing",
                  "transaction was aborted",
                  "TransactionInactiveError",
                  "NotSupportedError",
                  "NotAllowedError",
                  "A listener indicated an asynchronous response",
                  "chrome-extension://",
                  "moz-extension://",
                  "safari-extension://",
                  "Navigator.share is not supported",
                  "Web Share API is not supported",
                  "googlevideo.com",
                  "ytimg.com"
                ];
                function isNoise(msg) {
                  if (!msg) return false;
                  var s = typeof msg === 'string' ? msg : (msg && msg.message ? msg.message : String(msg));
                  for (var i = 0; i < NOISY.length; i++) {
                    if (s.indexOf(NOISY[i]) !== -1) return true;
                  }
                  return false;
                }
                var origErr = console.error;
                var origWarn = console.warn;
                console.error = function() {
                  for (var i = 0; i < arguments.length; i++) {
                    if (isNoise(arguments[i])) return;
                  }
                  origErr.apply(console, arguments);
                };
                console.warn = function() {
                  for (var i = 0; i < arguments.length; i++) {
                    if (isNoise(arguments[i])) return;
                  }
                  origWarn.apply(console, arguments);
                };
                window.addEventListener('unhandledrejection', function(e) {
                  if (isNoise(e.reason)) { e.preventDefault(); }
                });
                window.addEventListener('error', function(e) {
                  if (isNoise(e.error) || isNoise(e.message)) { e.preventDefault(); }
                });
              })();
            `,
          }}
        />
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
