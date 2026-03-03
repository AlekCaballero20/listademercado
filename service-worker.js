/* service-worker.js — Market Checklist PWA
   Optimizado para GitHub Pages / hosting estático */

const VERSION = 'mc-pwa-v1.1.0'; // 🔁 Cambia esto cuando hagas deploy
const STATIC_CACHE = `static-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

// Archivos críticos para que la app arranque offline
const CORE_ASSETS = [
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
  './js/utils.js'
];

/* =========================
   INSTALL
========================= */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* =========================
   ACTIVATE
========================= */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys.map((key) => {
        if (key !== STATIC_CACHE && key !== RUNTIME_CACHE) {
          return caches.delete(key);
        }
      })
    );

    await self.clients.claim();
  })());
});

/* =========================
   FETCH
========================= */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo manejar GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Solo same-origin
  if (url.origin !== self.location.origin) return;

  // 🔹 Navegación HTML → Network First (para actualizaciones)
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  // 🔹 Archivos estáticos → Cache First
  event.respondWith(cacheFirst(req));
});

/* =========================
   Estrategias
========================= */

async function networkFirst(req) {
  try {
    const fresh = await fetch(req);

    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(req, fresh.clone());

    return fresh;
  } catch (err) {
    const cached = await caches.match(req);
    return cached || caches.match('./offline.html');
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;

  try {
    const res = await fetch(req);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(req, res.clone());
    return res;
  } catch (err) {
    return cached || Promise.reject(err);
  }
}