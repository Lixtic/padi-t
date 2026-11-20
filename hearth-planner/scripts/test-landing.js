// www landing page: static-only (CSP), points at the app host, routing rules in vercel.json.
const fs = require('fs'), assert = require('assert'), vm = require('vm');
const html = fs.readFileSync('public/home.html', 'utf8');
const v = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
assert(!/<style|\sstyle=|<script(?![^>]*\ssrc=)(?![^>]*ld\+json)/i.test(html), 'no inline style/script (CSP)');
assert(html.includes('rel="canonical" href="https://www.guidedgh.site/home"'), 'canonical is /home');
assert(html.includes('href="https://app.guidedgh.site/"'), 'CTA opens the app host');
for (const l of ['/guides', '/news', '/lesson-plans']) assert(html.includes('href="' + l + '"'), 'links ' + l);
// Rewrites to static files are routed to the Python function on Vercel, so www / is a redirect, not a rewrite.
const home = v.redirects.find((r) => r.source === '/' && r.has);
assert(home && home.destination === '/home' && new RegExp('^' + home.has[0].value + '$').test('www.guidedgh.site') && !new RegExp('^' + home.has[0].value + '$').test('app.guidedgh.site'), 'www / goes to /home');
assert(!v.rewrites.some((r) => /\.html$/.test(r.destination)), 'no rewrite may point at a static file (500 on Vercel)');
for (const p of ['/parents', '/teachers']) assert(v.redirects.some((r) => r.source === p && r.has && r.destination.startsWith('https://app.guidedgh.site/?for=')), p + ' redirect (www)');
assert(v.headers.some((h) => h.has && h.headers.some((x) => x.key === 'X-Robots-Tag' && /noindex/.test(x.value))), 'app host noindex');
const run = (host, search, standalone) => { let to = null; vm.runInNewContext(fs.readFileSync('public/home.js', 'utf8'), { location: { hostname: host, search, replace: (u) => { to = u; } }, window: { matchMedia: () => ({ matches: standalone }), navigator: {} } }); return to; };
assert.strictEqual(run('www.guidedgh.site', '', false), null);
assert.strictEqual(run('www.guidedgh.site', '?source=pwa', false), 'https://app.guidedgh.site/?source=pwa');
assert.strictEqual(run('www.guidedgh.site', '', true), 'https://app.guidedgh.site/?source=pwa');
assert.strictEqual(run('app.guidedgh.site', '?source=pwa', true), null);
console.log('PASS landing');
