/* GuidEd service worker: caches the app shell so it opens instantly and works offline
   for reading saved plans. API calls (/api/*) are never cached. Bump VERSION to force an update. */
const VERSION = 'schoolpadi-v177';
const SHELL = ['./', 'index.html', 'styles.css?v=auth175', 'parent-registration.css', 'parent-registration.js', 'parent-dashboard.js', 'family-illustrations.js', 'family-visuals.css', 'guided-family-splash.webp', 'markdown.js', 'motion.js', 'phone-auth.js', 'tour.js', 'myscheme.js', 'app.js', 'editor.js', 'schemes.js', 'sample.js', 'plan-join.js', 'sync.js', 'levels.js', 'plans.js', 'profile.js', 'ads.js', 'rewarded.js', 'feedback.js', 'docx-export.js', 'pdf-export.js', 'slides.js', 'v2.css', 'v2.js', 'icons/apple-touch-icon.png', 'theme-init.js', 'pwa.js',
  'about', 'terms', 'privacy', 'refunds', 'ads-policy', 'legal.css', 'legal-theme.js', 'favicon.svg', 'manifest.webmanifest', 'vendor/neon-realtime.js', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  /* Cache the shell file by file so open pages can show a progress bar while the new version downloads. */
  const tell = (m) => self.clients.matchAll({ includeUncontrolled: true }).then((cs) => cs.forEach((c) => c.postMessage(m)));
  let done = 0; const total = SHELL.length;
  e.waitUntil(tell({ type: 'update-progress', done: 0, total })
    .then(() => caches.open(VERSION))
    .then((c) => Promise.all(SHELL.map((u) => fetch(new Request(u, { cache: 'reload' })).then((r) => { if (!r.ok) throw new Error(u); return c.put(u, r); }).then(() => tell({ type: 'update-progress', done: ++done, total })))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {            // network first, fall back to the cached copy when offline
    const key = /^\/(about|terms|privacy|refunds|ads-policy)\/?$/.test(url.pathname) ? url.pathname.replace(/\/$/, '').slice(1) : 'index.html';
    if (/^\/lesson-plans(\/|$)/.test(url.pathname)) { e.respondWith(fetch(req).catch(() => caches.match('index.html'))); return; }   // public guide pages: never cached over the app shell
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(key, copy)); } return r; })
      .catch(() => caches.match(key).then((hit) => hit || caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => {      // stale while revalidate for static files
    const net = fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
