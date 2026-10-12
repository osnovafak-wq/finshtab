/* Финштаб — service worker: офлайн-режим и обновления.
   При каждом обновлении файлов увеличивайте VERSION — так телефоны узнают о новой версии. */
const VERSION = 'finshtab-1.0.0';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'core.js',
  'store.js',
  'sync.js',
  'ui.js',
  'views.js',
  'settings.js',
  'app.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('finshtab-') && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // GitHub API и прочее — напрямую в сеть
  if (req.mode === 'navigate' && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html'))) {
    // само приложение — сразу из кэша (мгновенный запуск и работа без интернета)
    event.respondWith(
      caches.match('index.html', { ignoreSearch: true }).then((r) => r || fetch(req))
    );
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req))
  );
});
