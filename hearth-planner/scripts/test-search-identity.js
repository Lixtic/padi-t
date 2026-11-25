'use strict';
// How GuidEd shows up in search: one indexed home on guidedgh.site, the old vercel.app address kept out of the index.
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const rule = vercel.headers.find((h) => (h.has || []).some((c) => c.type === 'host' && /padi-t/.test(c.value)));
assert.ok(rule, 'vercel.json should add a rule for the old padi-t.vercel.app host');
assert.ok(rule.headers.some((h) => h.key === 'X-Robots-Tag' && /noindex/.test(h.value)), 'the old host should send X-Robots-Tag noindex');
assert.ok(!rule.has.some((c) => /guidedgh/.test(c.value)), 'the noindex rule must not match the real domains');
const home = fs.readFileSync(path.join(root, 'public', 'home.html'), 'utf8');
const m = home.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
assert.ok(m, 'home.html should carry WebSite structured data');
const ld = JSON.parse(m[1]);
assert.strictEqual(ld['@type'], 'WebSite');
assert.strictEqual(ld.name, 'GuidEd');
assert.strictEqual(ld.url, 'https://www.guidedgh.site/');
const app = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
assert.ok(!/exported to Word\./.test(app), 'the app description should mention Word and PDF');
process.stdout.write('Search identity tests passed.\n');
