// PMUSIC PWA Service Worker (v6)
// Advanced Offline & Client-Side Cache Strategy

const CACHE_NAME = 'pmusic-v6-cache';
const CORE_ASSETS = [
  '/',
  '/download',
  '/library',
  '/history',
  '/settings',
  '/manifest.json',
  '/icon.png',
  '/favicon.ico',
];

// 1. Install Event: Cache critical app shell routes & assets immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use individual catches so any single missing asset does NOT fail the entire installation
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
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Clean PWA strategy with seamless offline support
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

  // Bypass all API endpoints, hot module reload, and external audio/video CDNs
  if (
    url.pathname.startsWith('/api/') ||
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
    return;
  }

  // Bypass any HTTP Range requests (crucial for audio/video stream playback stability)
  if (event.request.headers.has('range')) {
    return;
  }

  // Navigation requests (HTML pages): Network-First with resilient Offline App Shell Fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseClone).catch(() => {});
              })
              .catch(() => {});
          }
          return networkResponse;
        })
        .catch(async () => {
          // 1. Try exact cached navigation route (e.g. /download, /library, /)
          const cachedMatch = await caches.match(event.request);
          if (cachedMatch) return cachedMatch;

          // 2. Try URL pathname without query strings
          const cleanPathMatch = await caches.match(url.pathname);
          if (cleanPathMatch) return cleanPathMatch;

          // 3. If navigation is to download page, check /download
          if (url.pathname.includes('/download')) {
            const downloadCached = await caches.match('/download');
            if (downloadCached) return downloadCached;
          }

          // 4. Fallback to cached root App Shell (Next.js SPA client router will mount)
          const rootCached = await caches.match('/');
          if (rootCached) return rootCached;

          // 5. If root is missing, try /download shell
          const anyDownloadCached = await caches.match('/download');
          if (anyDownloadCached) return anyDownloadCached;

          // 6. Absolute last resort fallback: Non-blocking 200 OK navigation fallback
          // NEVER return a 503 error or blocking screen that locks the user out
          return new Response(
            `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>PMUSIC</title>
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
    <h2>PMUSIC Mode Offline</h2>
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
        })
    );
    return;
  }

  // Static assets (Next.js bundles, styles, icons, fonts): Cache-First with Network Revalidation
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Revalidate in background for future requests
        fetch(event.request)
          .then((networkResponse) => {
            if (
              networkResponse &&
              networkResponse.status === 200 &&
              (networkResponse.type === 'basic' || networkResponse.type === 'cors')
            ) {
              const responseClone = networkResponse.clone();
              caches
                .open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseClone).catch(() => {});
                })
                .catch(() => {});
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            (networkResponse.type === 'basic' || networkResponse.type === 'cors')
          ) {
            const responseClone = networkResponse.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseClone).catch(() => {});
              })
              .catch(() => {});
          }
          return networkResponse;
        })
        .catch(async () => {
          // If search parameters exist (e.g. Next.js _rsc), try matching without search params
          if (url.search) {
            const cleanMatch = await caches.match(url.pathname);
            if (cleanMatch) return cleanMatch;
          }
          return new Response('', { status: 408 });
        });
    })
  );
});
