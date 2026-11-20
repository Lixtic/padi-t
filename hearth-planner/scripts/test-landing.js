// www landing page: static-only (CSP), points at the app host, routing rules in vercel.json.
const fs = require('fs'), assert = require('assert'), vm = require('vm');
const html = fs.readFileSync('public/home.html', 'utf8');
const v = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
assert(!/<style|\sstyle=|<script(?![^>]*\ssrc=)(?![^>]*ld\+json)/i.test(html), 'no inline style/script (CSP)');
assert(html.includes('href="https://www.guidedgh.site/"'), 'canonical is /');
assert(html.includes('href="https://app.guidedgh.site/"'), 'CTA opens the app host');
for (const l of ['/guides', '/news', '/lesson-plans']) assert(html.includes('href="' + l + '"'), 'links ' + l);
const home = v.rewrites.find((r) => r.source === '/' && r.has);
assert(home && home.destination === '/home.html' && home.has[0].value.includes('www'), 'www / rewrite');
assert(new RegExp('^' + home.has[0].value + '$').test('www.guidedgh.site') && !new RegExp('^' + home.has[0].value + '$').test('app.guidedgh.site'));
for (const p of ['/parents', '/teachers']) assert(v.redirects.some((r) => r.source === p && r.destination.startsWith('https://app.guidedgh.site')), p + ' redirect');
assert(v.headers.some((h) => h.has && h.headers.some((x) => x.key === 'X-Robots-Tag' && /noindex/.test(x.value))), 'app host noindex');
const run = (host, search, standalone) => { let to = null; vm.runInNewContext(fs.readFileSync('public/home.js', 'utf8'), { location: { hostname: host, search, replace: (u) => { to = u; } }, window: { matchMedia: () => ({ matches: standalone }), navigator: {} } }); return to; };
assert.strictEqual(run('www.guidedgh.site', '', false), null);
assert.strictEqual(run('www.guidedgh.site', '?source=pwa', false), 'https://app.guidedgh.site/?source=pwa');
assert.strictEqual(run('www.guidedgh.site', '', true), 'https://app.guidedgh.site/?source=pwa');
assert.strictEqual(run('app.guidedgh.site', '?source=pwa', true), null);
console.log('PASS landing');
// Vercel serves a real public/index.html for "/" before it looks at rewrites, so it must not exist.
assert(!fs.existsSync('public/index.html') && fs.existsSync('public/app.html'), 'the app lives in app.html');
const rewrites = v.rewrites.filter((r) => r.source === '/');
assert(rewrites.length === 2 && rewrites[0].has && !rewrites[1].has && rewrites[1].destination === '/app.html', 'www gets the landing page, every other host the app');
console.log('PASS root routing');
