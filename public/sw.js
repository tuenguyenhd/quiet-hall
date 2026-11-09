// Quiet Hall service worker: the hall, timer, breathing and sounds work offline.
// Page = network-first (so updates arrive), assets = cache-first (hashed file names).
const CACHE = 'qh-v3';
const CORE = ['/', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png',
  '/fonts/zen-maru-400.woff2', '/fonts/zen-maru-500.woff2', '/fonts/zen-maru-700.woff2',
  '/fonts/zen-mincho-400.woff2', '/fonts/zen-mincho-600.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'cache' && Array.isArray(e.data.urls)) {
    e.waitUntil(caches.open(CACHE).then((c) => Promise.all(e.data.urls.map((u) => c.add(u).catch(() => {})))));
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/ws') || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => {
          // only the app page is the offline fallback (not /privacy.html etc.)
          if (url.pathname === '/' && r.ok) {
            const copy = r.clone();
            caches.open(CACHE).then((c) => c.put('/', copy));
          }
          return r;
        })
        .catch(async () => (await caches.match(url.pathname === '/' ? '/' : req)) ?? caches.match('/')),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((r) => {
          if (r.ok) {
            const copy = r.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return r;
        }),
    ),
  );
});
