/**
 * Service worker — app shell + basemap only. Deliberately hand-written; a
 * generated Workbox config would be more machinery than this needs.
 *
 * The one rule that matters: **API responses are never cached.** This app is
 * a live view of a city; serving a cached backlog after the phone loses signal
 * would show a crew a repaired pothole as still open, with nothing on screen
 * to say the data is stale. The UI has a real offline banner instead — see
 * src/lib/useOnline.ts. So `/api/*` and the websocket are network-only, and
 * failing is allowed to look like failing.
 *
 * What IS cached: the built shell (so the app opens with no signal) and the
 * basemap tiles/glyphs/sprites (immutable, and the whole point of committing
 * a PMTiles extract was that the map works with the venue wifi dead).
 */

const VERSION = 'ut-mobile-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const MAP_CACHE = `${VERSION}-map`;

/**
 * Where this app is mounted — '/' in dev, '/m/' in the production image.
 * Derived from the worker's own URL rather than hardcoded, because a worker at
 * /m/sw.js controls /m/ and nothing above it.
 */
const BASE = new URL('./', self.location).pathname;

/** Enough to boot the app offline; the rest is filled in as it is fetched. */
const SHELL_URLS = [BASE, `${BASE}index.html`, `${BASE}manifest.webmanifest`];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isMapAsset(url) {
  return url.pathname.startsWith('/map/') || url.pathname.startsWith('/data/');
}

function isApi(url) {
  return (
    url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws') || url.pathname === '/health'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept the API or anything cross-origin (the API runs on its own
  // port in dev). Let it hit the network and let it fail loudly.
  if (url.origin !== self.location.origin || isApi(url)) return;

  // Basemap: cache-first and never revalidated — a PMTiles range request for a
  // tile that already exists is a tile that has not changed.
  if (isMapAsset(url)) {
    event.respondWith(
      caches.open(MAP_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        // 206 Partial Content (PMTiles range requests) is not a cacheable
        // response — storing it would poison the cache with one byte range.
        if (response.ok && response.status === 200) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  // Navigations: network-first so a deploy is picked up, shell fallback when
  // the phone is offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(`${BASE}index.html`, copy));
          return response;
        })
        .catch(() => caches.match(`${BASE}index.html`).then((hit) => hit ?? Response.error())),
    );
    return;
  }

  // Hashed build assets: cache-first, they are immutable by filename.
  event.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok && response.status === 200) cache.put(request, response.clone());
      return response;
    }),
  );
});
