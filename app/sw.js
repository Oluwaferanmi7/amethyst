// Offline cache for the app shell. Stale-while-revalidate: opens instantly, refreshes
// in the background for the next launch. Bump VERSION on every release.
const VERSION = 'amethyst-v6';
const SHELL = [
  './',
  'index.html',
  'app.css',
  'manifest.webmanifest',
  'js/main.js',
  'js/table.js',
  'js/player.js',
  'js/hand.js',
  'js/render.js',
  'js/rules.js',
  'js/board.js',
  'js/link.js',
  'js/store.js',
  'js/sound.js',
  'js/anim.js',
  'vendor/peerjs.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (c) => {
      const cached = await c.match(e.request);
      const net = fetch(e.request)
        .then((r) => {
          if (r.ok) c.put(e.request, r.clone());
          return r;
        })
        .catch(() => cached);
      return cached || net;
    }),
  );
});
