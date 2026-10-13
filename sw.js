/**
 * SIGAP — Service Worker (Offline-First Cache)
 * Versi Cache: v3.2
 */
const CACHE_NAME = 'sigap-cache-v3.2';

const OFFLINE_RESOURCES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon.svg',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(OFFLINE_RESOURCES).catch(err => {
        console.warn('Gagal memuat sebagian resource eksternal saat pre-cache:', err);
        return cache.addAll(['./', './index.html', './style.css', './app.js', './manifest.json']);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Hanya proses GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Cache-hit: kembalikan versi offline segera
        return cachedResponse;
      }
      // Cache-miss: coba ambil dari jaringan
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Jika jaringan gagal dan tidak ada di cache
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
