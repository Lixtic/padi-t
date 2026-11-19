'use strict';
// Guides: every article is a real, crawlable page that is listed, linked and in the sitemap.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), pub = path.join(root, 'public');
const { articles } = require('./build-guides.js');
const index = fs.readFileSync(path.join(pub, 'guides.html'), 'utf8'), map = fs.readFileSync(path.join(pub, 'sitemap.xml'), 'utf8');
const home = fs.readFileSync(path.join(pub, 'index.html'), 'utf8'), vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const results = []; const check = (n, ok) => results.push([n, !!ok]);
const text = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

check('There are at least 15 guides', articles.length >= 15);
check('Slugs, titles and descriptions are all different', new Set(articles.map((a) => a.slug)).size === articles.length && new Set(articles.map((a) => a.title)).size === articles.length && new Set(articles.map((a) => a.desc)).size === articles.length);
check('Slugs are plain URL words', articles.every((a) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug)));
check('Descriptions fit a search result', articles.every((a) => a.desc.length >= 80 && a.desc.length <= 200));
const pages = articles.map((a) => [a, fs.readFileSync(path.join(pub, 'guides', a.slug + '.html'), 'utf8')]);
check('Each page has its own title, h1, canonical link and Article data', pages.every(([a, h]) => h.includes('<title>' + a.title.replace(/&/g, '&amp;')) && /<h1>/.test(h) && h.includes('rel="canonical" href="https://www.guidedgh.site/guides/' + a.slug + '"') && h.includes('"@type":"Article"')));
check('Each page has real text (300+ words)', pages.every(([, h]) => text(h) >= 300));
check('Pages use the shared stylesheet and no inline style blocks or scripts', pages.every(([, h]) => /href="\/legal.css"/.test(h) && !/<style[\s>]/.test(h) && !/<script(?![^>]*(src=|application\/ld\+json))/.test(h)));
check('No page shows "undefined" or leftover markup', pages.every(([, h]) => !/undefined|\[object/.test(h)));
check('Every page is on the index and in the sitemap', articles.every((a) => index.includes('/guides/' + a.slug + '"') && map.includes('/guides/' + a.slug + '<')) && map.includes('/guides<'));
check('Every page links back to the index and onward to other guides', pages.every(([, h]) => h.includes('href="/guides"') && (h.match(/href="\/guides\/[a-z0-9-]+"/g) || []).length >= 2));
check('The home screen describes GuidEd in visible text and links to the guides', /class="hero-more"/.test(home) && /class="hero-links"[^>]*><a href="\/guides"/.test(home));
check('The robots file does not block the guides', !/Disallow:\s*\/(guides)?\s*$/m.test(fs.readFileSync(path.join(pub, 'robots.txt'), 'utf8')));
check('Vercel stays within 12 functions', fs.readdirSync(path.join(root, 'api')).filter((f) => !f.startsWith('_')).length <= 12);

let failed = 0;
for (const [n, ok] of results) { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) failed++; }
if (failed) process.exit(1);
console.log('Guides tests passed.');
