// PMUSIC PWA Service Worker (v5)
// Standard, clean offline caching without evaluation crashes or range request issues

const CACHE_NAME = 'pmusic-v5-cache';
const CORE_ASSETS = [
  '/',
  '/manifest.json',
  '/icon.png',
];

// 1. Install Event: Cache critical shell assets safely
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use individual catches so any single missing asset does NOT fail the entire installation
      return Promise.allSettled(
        CORE_ASSETS.map((asset) => cache.add(asset).catch(() => {}))
      );
    })
  );
});

// 2. Activate Event: Clean up outdated caches and claim all clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      }),
      self.clients.claim(),
    ])
  );
});

// 3. Fetch Event: Clean PWA strategy
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

  // Bypass all API endpoints, audio/video streams, and external media CDNs
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

  // Bypass any HTTP Range requests (crucial for audio/video playback stability)
  if (event.request.headers.has('range')) {
    return;
  }

  // Navigation requests (HTML pages): Network-First with Cache Fallback
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
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            return caches.match('/').then((rootCached) => {
              return (
                rootCached ||
                new Response(
                  '<!DOCTYPE html><html><head><title>PMUSIC Offline</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="background:#0a0a0a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center;"><h2>PMUSIC Offline</h2><p style="color:#888;">Periksa koneksi internet Anda.</p></div></body></html>',
                  {
                    status: 503,
                    headers: { 'Content-Type': 'text/html; charset=utf-8' },
                  }
                )
              );
            });
          });
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
        .catch(() => {
          return new Response('', { status: 408 });
        });
    })
  );
});
