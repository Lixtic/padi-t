/* GuidEd service worker: caches the app shell so it opens instantly and works offline
   for reading saved plans. API calls (/api/*) are never cached. Bump VERSION to force an update. */
const VERSION = 'schoolpadi-v48';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'editor.js', 'schemes.js', 'sample.js', 'plan-join.js', 'sync.js', 'levels.js', 'plans.js', 'profile.js', 'ads.js', 'feedback.js', 'docx-export.js', 'icons/apple-touch-icon.png', 'theme-init.js', 'pwa.js',
  'about', 'privacy', 'refunds', 'ads-policy', 'legal.css', 'legal-theme.js', 'favicon.svg', 'manifest.webmanifest', 'vendor/neon-realtime.js', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {            // network first, fall back to the cached copy when offline
    const key = /^\/(about|privacy|refunds|ads-policy)\/?$/.test(url.pathname) ? url.pathname.replace(/\/$/, '').slice(1) : 'index.html';
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(key, copy)); } return r; })
      .catch(() => caches.match(key).then((hit) => hit || caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => {      // stale while revalidate for static files
    const net = fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
