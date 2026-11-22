/* Tumult's service worker (web version only; tools/build.mjs fills in the cache name and the core list).
   Files under assets/ are named by their content, so a cached copy is always right: they are served from
   the cache first. The page itself is fetched from the network first, so a new release is picked up on the
   next visit, and the cached page is the fallback when there is no network. A new release has a new cache
   name; the old caches are deleted once it takes over. */
const CACHE = 'tumult-6698eb0956';
const CORE = ["./","./assets/tumult.b4aff2b83d.js","./assets/tumult.ac565a7fd3.css","./assets/ChakraPetch-SemiBold.49fbe9af20.woff2","./assets/Cinzel-Bold.8efa224fe7.woff2"];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('tumult-') && k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // the online server, when there is one, is never cached
  if (url.pathname.includes('/assets/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  } else if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./', copy));
          }
          return res;
        })
        .catch(() => caches.match('./').then((hit) => hit || Response.error())),
    );
  }
});
