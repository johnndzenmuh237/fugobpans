/* FUGOBPANS service worker.
 * Safety rules:
 *  - NEVER caches /api/*, other-origin requests, or any signed-in area (owner, admin, accountant, teacher, employee, student, parent),
 *    so private data and logins are always live and nothing private is stored on the phone by this worker.
 *  - Public pages are network-first (you always get the newest version online) and fall back to the last copy when offline.
 *  - Bump VERSION to force every phone to drop old copies.
 */
const VERSION = 'v1';
const CACHE = `fugobpans-public-${VERSION}`;
const PRECACHE = ['/offline.html', '/index.html', '/assets/css/style.css', '/assets/css/responsive.css', '/assets/js/config.js', '/assets/js/pwa.js', '/assets/icons/icon-192.png'];
const PRIVATE = /^\/(owner|admin|accountant|teacher|employee|student|parent|change-password|messages)(\/|\.html|$)/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('fugobpans-public-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || PRIVATE.test(url.pathname) || url.pathname === '/sw.js') return;
  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh.ok && fresh.type === 'basic') { const copy = fresh.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return fresh;
    } catch {
      const hit = await caches.match(req);
      if (hit) return hit;
      if (req.mode === 'navigate') return (await caches.match('/offline.html')) || Response.error();
      return Response.error();
    }
  })());
});