// Service Worker for web vitals profiler

const CACHE_NAME = 'web-vitals-profiler-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/static/js/main.js',
  '/static/css/main.css'
];

self.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event: any) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

self.addEventListener('activate', (event: any) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('message', (event: any) => {
  if (event.data.type === 'COLLECT_VITALS') {
    const vitals = event.data.vitals;
    // Store vitals in IndexedDB or send to server
    console.log('Vitals collected:', vitals);
  }
});

self.addEventListener('sync', (event: any) => {
  if (event.tag === 'sync-vitals') {
    event.waitUntil(syncVitals());
  }
});

async function syncVitals() {
  // Sync stored vitals to server
  console.log('Syncing vitals to server');
}
