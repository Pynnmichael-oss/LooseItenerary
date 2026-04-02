/* ============================================================
   LOOSE ITINERARY — sw.js
   Service Worker: offline support, cache strategies
   ============================================================ */

const CACHE_NAME = 'loose-itinerary-v1';

// Assets to cache on install
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './trips/index.html',
  './assets/css/main.css',
  './assets/css/globe.css',
  './assets/css/trip.css',
  './assets/js/app.js',
  './assets/js/globe.js',
  './assets/js/supabase.js',
  './assets/js/storage.js',
  './assets/js/pwa.js',
  './assets/icons/icon-192.svg',
  './assets/icons/icon-512.svg',
  './manifest.json'
];

// ── Install: precache static assets ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing strategy ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Network-first for Supabase API calls
  if (url.hostname.includes('supabase.co') || url.hostname.includes('supabase.io')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Network-first for Mapbox API/tiles
  if (url.hostname.includes('mapbox.com') || url.hostname.includes('mapbox.net')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Network-first for Google Fonts (so updates apply)
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Cache-first for all other static assets
  event.respondWith(cacheFirst(event.request));
});

// ── Cache-first strategy ──
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return offline fallback for navigation requests
    if (request.mode === 'navigate') {
      const cached = await caches.match('./index.html');
      if (cached) return cached;
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// ── Network-first strategy ──
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}
