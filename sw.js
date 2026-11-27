/* TalkieFriends PWA Service Worker — Offline Shell & Nano Banana Asset Cache */
const CACHE_NAME = 'talkiefriends-v5.4-audiofix';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './js/data.js',
  './js/rig.js',
  './js/voice.js',
  './js/gemini-live.js',
  './js/sync.js',
  './js/engine.js',
  './js/report.js',
  './js/app.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/backgrounds/snack_shop.webp',
  './assets/backgrounds/picnic_park.webp',
  './assets/backgrounds/animal_clinic.webp',
  './assets/backgrounds/cloud_playground.webp',
  './assets/backgrounds/phonics_market.webp'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Never intercept API calls, WebSockets, or cross-origin requests
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  // Network-first for HTML/JS/CSS so updates arrive immediately; cache-first for static images
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached || fetch(event.request).then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return resp;
        })
      )
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((resp) => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return resp;
      })
      .catch(() => caches.match(event.request))
  );
});
