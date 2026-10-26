const CACHE_NAME = 'spotify-clone-v6-client-audio-instant';
const STATIC_ASSETS = [
  '/',
  '/search',
  '/library',
  '/history',
  '/download',
  '/install-apk',
  '/settings',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('PWA: Static asset caching warning:', err);
      });
    })
  );
});

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

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Instantly short-circuit legacy /api/audio requests so they never hit network or throw format/timeout errors
  if (url.pathname.startsWith('/api/audio')) {
    event.respondWith(
      new Response(
        JSON.stringify({
          error: 'Audio endpoint removed: player uses client-side YouTube IFrame playback',
        }),
        {
          status: 410,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    return;
  }

  // 2. Bypass non-GET requests and external media/streaming CDN traffic (YouTube IFrame, audio, images)
  if (
    event.request.method !== 'GET' ||
    url.hostname.includes('youtube.com') ||
    url.hostname.includes('youtube-nocookie.com') ||
    url.hostname.includes('googlevideo.com') ||
    url.hostname.includes('ytimg.com') ||
    url.hostname.includes('ggpht.com') ||
    url.hostname.includes('doubleclick.net')
  ) {
    return;
  }

  // 3. Navigation & API requests: Network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (
          !response ||
          response.status !== 200 ||
          (response.type !== 'basic' && response.type !== 'cors')
        ) {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache).catch(() => {});
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          return new Response(JSON.stringify({ offline: true }), {
            headers: { 'Content-Type': 'application/json' },
            status: 503,
          });
        });
      })
  );
});
