'use strict';
// Guides: every article is a real, crawlable page that is listed, linked and in the sitemap.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), pub = path.join(root, 'public');
const { articles } = require('./build-guides.js');
const index = fs.readFileSync(path.join(pub, 'guides.html'), 'utf8'), map = fs.readFileSync(path.join(pub, 'sitemap.xml'), 'utf8');
const home = fs.readFileSync(path.join(pub, 'index.html'), 'utf8'), vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const results = []; const check = (n, ok) => results.push([n, !!ok]);
const text = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

check('The index exposes an accessible search field and audience/topic filters', /id="guide-search"/.test(index) && /data-audience="Teachers"/.test(index) && /data-topic="Lesson planning"/.test(index));
check('The index renders guide cards with descriptions and reading times', (index.match(/class="guide-card"/g) || []).length === articles.length && /min read/.test(index));
check('The index loads filtering behaviour from an external script', /src="\/guides.js" defer/.test(index) && fs.existsSync(path.join(pub, 'guides.js')));
check('Guide filtering script supports search, audience and topic filters', /matchesQuery/.test(fs.readFileSync(path.join(pub, 'guides.js'), 'utf8')) && /matchesAudience/.test(fs.readFileSync(path.join(pub, 'guides.js'), 'utf8')) && /matchesTopic/.test(fs.readFileSync(path.join(pub, 'guides.js'), 'utf8')));
check('Production build regenerates the SEO pages and guide sitemap', /node scripts\/build-seo\.js/.test(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts.build));
check('The lesson-plan guide preserves the official indicator and separates the lesson objective', /Keep the official content standard and learning indicator exactly as published/.test(require(path.join(root, 'data/guides/teachers-1.js'))[0].sections[1].p[0]));
check('The GES Scheme of Service guide is included for teachers', articles.some((a) => a.slug === 'understanding-the-ges-scheme-of-service' && a.audience === 'Teachers'));
check('The GES guide links to the official PDF and flags the blank implementation date', pages.some(([a, h]) => a.slug === 'understanding-the-ges-scheme-of-service' && h.includes('https://ges.gov.gh/assets/uploads/documents/6ab15045a79a7_1790005317.pdf') && /implementation-date field in this copy is blank/i.test(h)));
check('There are at least 15 guides', articles.length >= 15);
check('Slugs, titles and descriptions are all different', new Set(articles.map((a) => a.slug)).size === articles.length && new Set(articles.map((a) => a.title)).size === articles.length && new Set(articles.map((a) => a.desc)).size === articles.length);
check('Slugs are plain URL words', articles.every((a) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug)));
check('Descriptions fit a search result', articles.every((a) => a.desc.length >= 80 && a.desc.length <= 200));
const pages = articles.map((a) => [a, fs.readFileSync(path.join(pub, 'guides', a.slug + '.html'), 'utf8')]);
check('Article metadata includes social preview and breadcrumb data', pages.every(([, h]) => /twitter:card/.test(h) && /BreadcrumbList/.test(h)));
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
