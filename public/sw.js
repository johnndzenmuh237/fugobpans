/* Service worker: makes the site installable and shows a friendly page when offline.
 * It NEVER caches API calls, logins or payments: those always go to the network. */
const VERSION = 'fugobpans-v2';
const SHELL = ['/offline.html', '/assets/icons/icon-192.png'];
const PUBLIC_PAGES = ['/', '/index.html', '/about.html', '/classes.html', '/admissions.html', '/contact.html', '/announcements.html', '/reviews.html', '/students.html', '/parents.html', '/register.html'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return; // network only
  if (req.mode === 'navigate') {
    const isPublic = PUBLIC_PAGES.includes(url.pathname);
    e.respondWith(fetch(req).then((res) => { if (isPublic && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })
      .catch(async () => (isPublic && (await caches.match(req))) || caches.match('/offline.html')));
    return;
  }
  if (url.pathname.startsWith('/assets/')) { // show the saved copy fast, refresh it in the background
    e.respondWith(caches.open(VERSION).then(async (c) => { const hit = await c.match(req); const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit); return hit || net; }));
  }
});
