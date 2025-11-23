// service-worker.js – Offline-first PWA for Pukekohe HS Photo Stamper

// Figure out the root path from the service worker scope so this works
// on GitHub Pages at /phsphoto/ or any other subfolder.
const ROOT = new URL(self.registration.scope).pathname;

// Bump this when you change core assets so old caches are cleaned up
const CACHE_NAME = 'phs-stamper-v246';

// Core assets to cache for offline use
const CORE_ASSETS = [
  ROOT,
  ROOT + 'index.html',
  ROOT + 'styles.css',
  ROOT + 'script.js',
  ROOT + 'selections.json',
  ROOT + 'manifest.webmanifest',
  ROOT + 'icon-152.png',
  ROOT + 'icon-192.png',
  ROOT + 'icon-512.png',
  ROOT + 'crest-152.png',
  ROOT + 'crest-192.png',
  ROOT + 'crest-512.png'
];

// Install – cache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate – clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('phs-stamper-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch – network-first with cache fallback
self.addEventListener('fetch', event => {
  const req = event.request;

  // Only handle GET requests
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req)
        .then(response => {
          // Cache successful same-origin responses
          if (response && response.status === 200 && response.type === 'basic') {
            caches.open(CACHE_NAME).then(cache => cache.put(req, response.clone()));
          }
          return response;
        })
        .catch(() => {
          // Offline: fall back to cache, or index.html as a last resort
          return cached || caches.match(ROOT + 'index.html');
        });

      // Prefer cached version if we have it, otherwise use network
      return cached || network;
    })
  );
});
