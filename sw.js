// Update this version string when you make changes to the app
const CACHE_NAME = 'zakat-calc-v38'; 

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.png'
];

// 1. Install Event: Caches the assets immediately
self.addEventListener('install', (event) => {
  // Forces the waiting service worker to become the active service worker
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// 2. Activate Event: Cleans up OLD caches (Crucial for updates)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  // Takes control of the page immediately
  self.clients.claim(); 
});

// 3. Fetch Event: Serve from Cache first, fallback to Network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached version if found, otherwise fetch from network
      return response || fetch(event.request);
    })
  );
});