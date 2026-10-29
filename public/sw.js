// MusicFY PWA Service Worker (v3)
// Advanced Stale-While-Revalidate Caching Strategy & Shell Pre-caching
// Excludes Next.js internal chunks & RSC routes to guarantee seamless client-side navigation without full-page reloads

const CACHE_NAME = 'musicfy-v3-cache';
const CORE_ASSETS = [
  '/',
  '/manifest.json',
  '/icon.png',
  '/favicon.ico',
  '/workers/lyricsWorker.js',
];

// 1. Install Event: Cache critical standalone app shell assets immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        CORE_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn(`[SW] Pre-caching asset skipped: ${asset}`, err);
          })
        )
      );
    })
  );
});

// 2. Activate Event: Clean up outdated caches and immediately claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Resilient Offline HTML Response when no cache exists
function getOfflineFallbackHtml() {
  return new Response(
    `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>MusicFY - Offline</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { background: #0a0a0a; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #121212; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 32px 24px; max-width: 400px; width: 100%; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    h2 { font-size: 20px; margin: 0 0 10px; font-weight: 700; color: #fff; }
    p { color: #b3b3b3; font-size: 14px; margin: 0 0 24px; line-height: 1.5; }
    .links { display: flex; flex-direction: column; gap: 12px; }
    a { display: inline-flex; align-items: center; justify-content: center; padding: 12px 20px; border-radius: 9999px; font-size: 14px; font-weight: 600; text-decoration: none; transition: transform 0.15s ease; }
    a:active { transform: scale(0.97); }
    .primary { background: #1DB954; color: #000; }
    .primary:hover { background: #1ed760; }
    .secondary { background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.1); }
    .secondary:hover { background: rgba(255,255,255,0.15); }
  </style>
</head>
<body>
  <div class="card">
    <h2>MusicFY Mode Offline</h2>
    <p>Koneksi internet tidak tersedia. Anda tetap dapat menikmati seluruh lagu yang telah tersimpan di memori perangkat.</p>
    <div class="links">
      <a href="/download" class="primary">Buka Menu Download</a>
      <a href="/" class="secondary">Buka Beranda Offline</a>
    </div>
  </div>
</body>
</html>`,
    {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  );
}

// 3. Fetch Event: Stale-While-Revalidate with strict audio stream exclusion
self.addEventListener('fetch', (event) => {
  // Only process standard GET requests
  if (event.request.method !== 'GET') return;

  const urlString = event.request.url;
  // Ignore non-http schemes (chrome-extension, blob, data, etc.)
  if (!urlString || !urlString.startsWith('http')) return;

  let url;
  try {
    url = new URL(urlString);
  } catch {
    return;
  }

  // --------------------------------------------------------------------------
  // STRICT EXCLUSIONS (Do NOT intercept or cache):
  // 1. Next.js internal chunks, dynamic code splits, and RSC route payloads
  // 2. Streaming backend audio endpoints (/api/stream, /api/audio, /api/download)
  // 3. Dynamic API data routes (/api/)
  // 4. HTTP Range requests (crucial for chunked audio buffer & seek stability)
  // 5. Hot Module Replacement & Next.js fast refresh (dev)
  // 6. External streaming & telemetry domains
  // --------------------------------------------------------------------------
  const isRSC =
    url.searchParams.has('_rsc') ||
    event.request.headers.get('RSC') === '1' ||
    event.request.headers.get('Next-Router-State-Tree') ||
    event.request.headers.get('Next-Router-Prefetch') ||
    event.request.headers.get('Next-Url');

  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/') ||
    isRSC ||
    event.request.headers.has('range') ||
    url.pathname.includes('/_next/webpack-hmr') ||
    url.hostname.includes('youtube.com') ||
    url.hostname.includes('youtube-nocookie.com') ||
    url.hostname.includes('googlevideo.com') ||
    url.hostname.includes('ytimg.com') ||
    url.hostname.includes('ggpht.com') ||
    url.hostname.includes('mzstatic.com') ||
    url.hostname.includes('itunes.apple.com') ||
    url.hostname.includes('doubleclick.net')
  ) {
    // Let browser perform direct network request without Service Worker interference
    return;
  }

  // --------------------------------------------------------------------------
  // STALE-WHILE-REVALIDATE STRATEGY FOR STANDALONE APP SHELL:
  // --------------------------------------------------------------------------
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Only match cache for exact request
      const cachedResponse = await cache.match(event.request);

      // Background network revalidation
      const networkFetchPromise = fetch(event.request)
        .then(async (networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            (networkResponse.type === 'basic' || networkResponse.type === 'cors')
          ) {
            const responseToCache = networkResponse.clone();
            cache.put(event.request, responseToCache).catch(() => {});
          }
          return networkResponse;
        })
        .catch(() => null);

      if (cachedResponse) {
        event.waitUntil(networkFetchPromise);
        return cachedResponse;
      }

      const freshNetworkResponse = await networkFetchPromise;
      if (freshNetworkResponse) {
        return freshNetworkResponse;
      }

      // Offline Fallback ONLY for full HTML document navigation
      if (event.request.mode === 'navigate') {
        const rootCached = await cache.match('/');
        if (rootCached) return rootCached;
        return getOfflineFallbackHtml();
      }

      return new Response('', { status: 404, statusText: 'Offline Asset Unavailable' });
    })()
  );
});
