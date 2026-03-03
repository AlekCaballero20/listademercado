/* service-worker.js — cache básico para offline
   Nota: Esto asume hosting estático (GitHub Pages). */
const VERSION = 'mc-pwa-v1.0.0';
const STATIC_CACHE = `static-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './offline.html',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',

  // JS módulos
  './js/app.js',
  './js/pwa.js',
  './js/state.js',
  './js/models.js',
  './js/storage.local.js',
  './js/ui.actions.js',
  './js/ui.render.js',
  './js/metrics.js',
  './js/utils.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => {
      if (k !== STATIC_CACHE && k !== RUNTIME_CACHE) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo manejar same-origin
  if (url.origin !== self.location.origin) return;

  // Navegación: network-first (para que actualice), con fallback offline
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match('./offline.html');
      }
    })());
    return;
  }

  // Archivos estáticos: cache-first
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;

    try {
      const res = await fetch(req);
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(req, res.clone());
      return res;
    } catch {
      return cached; // si no hay, que falle normal
    }
  })());
});
