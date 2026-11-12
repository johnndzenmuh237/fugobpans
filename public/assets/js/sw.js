/* FUGOBPANS service worker — ONE worker for the whole site (scope "/").
 *  1. Installability: has a fetch handler and an offline page.
 *  2. Privacy: never caches /api/*, other origins, or any signed-in area (owner, admin, accountant, teacher, employee,
 *     student, parent, messages, communication). Nothing private is stored on the phone by this worker.
 *  3. Web Push: shows notifications even when the app/browser is closed, and opens the right page when tapped.
 * Bump VERSION to make every phone drop old copies.
 */
const VERSION = 'v4';
const CACHE = `fugobpans-${VERSION}`;
const PRECACHE = ['/offline.html', '/index.html', '/assets/css/style.css', '/assets/css/responsive.css', '/assets/js/config.js', '/assets/js/pwa.js', '/assets/icons/icon-192.png', '/assets/icons/icon-512.png'];
const PRIVATE = /^\/(owner|admin|accountant|teacher|employee|student|parent|change-password|messages|communication|notifications)(\/|\.html|$)/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('fugobpans') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;
  const isPrivate = PRIVATE.test(url.pathname);
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh.ok && !isPrivate && fresh.type === 'basic') { const copy = fresh.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return fresh;
      } catch {
        return (!isPrivate && (await caches.match(req))) || (await caches.match('/offline.html')) || Response.error();
      }
    })());
    return;
  }
  if (isPrivate) return;
  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh.ok && fresh.type === 'basic') { const copy = fresh.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return fresh;
    } catch {
      return (await caches.match(req)) || Response.error();
    }
  })());
});

/* ---------- Web Push ---------- */
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: 'FUGOBPANS', body: e.data ? e.data.text() : '' }; }
  const title = String(data.title || 'FUGOBPANS').slice(0, 100);
  e.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body: String(data.body || '').slice(0, 200),
      icon: '/assets/icons/icon-192.png',
      badge: '/assets/icons/icon-192.png',
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { url: typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/' },
    });
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((c) => c.postMessage({ type: 'push-received' }));
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin);
  if (target.origin !== self.location.origin) return;
  e.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clients) {
      if (new URL(c.url).origin === target.origin && 'focus' in c) { await c.focus(); if ('navigate' in c) { try { await c.navigate(target.href); } catch { /* fall through */ } } return; }
    }
    await self.clients.openWindow(target.href);
  })());
});

self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => cs.forEach((c) => c.postMessage({ type: 'push-resubscribe' }))));
});