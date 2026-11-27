/* Draughtie Trivia service worker: keeps the app and questions.json available offline. */
const CACHE = 'draughtie-trivia-v4';
const PRECACHE = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'questions.json',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// questions.json: try the network briefly (so edits show up), else use the saved copy.
async function networkFirst(request, timeoutMs) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(request.url, { cache: 'no-cache' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

// Everything else: serve the saved copy instantly, refresh it quietly in the background.
async function staleWhileRevalidate(event) {
  const request = event.request;
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const refresh = fetch(request.url, { cache: 'no-cache' })
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  const res = await refresh;
  if (res) return res;
  if (request.mode === 'navigate') {
    const fallback = await cache.match('index.html');
    if (fallback) return fallback;
  }
  return Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/questions.json')) {
    event.respondWith(networkFirst(request, 3000));
    return;
  }
  event.respondWith(staleWhileRevalidate(event));
});
