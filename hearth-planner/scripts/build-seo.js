'use strict';
// Builds public pages for each class and subject (public/lesson-plans/*.html) and public/sitemap.xml
// from data/schemes.json and api/_levels.js. Run: node scripts/build-seo.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const L = require(path.join(root, 'api/_levels.js'));
const D = require(path.join(root, 'data/schemes.json')).subjects;
const SITE = 'https://www.guidedgh.site';
const OUT = path.join(root, 'public/lesson-plans');
const DATE = new Date().toISOString().slice(0, 10);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pageSlug = (cls, sub) => slug(cls) + '-' + slug(sub);
const clsSlug = slug;
const levelOf = (cls) => L.levelOfClass(cls);

const head = (title, desc, url) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#006A4E"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/icons/icon-192.png" sizes="192x192" type="image/png"><link rel="stylesheet" href="/legal.css"><script src="/legal-theme.js"></script>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website"><meta property="og:site_name" content="GuidEd"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/icons/icon-512.png">
</head>
<body><main class="lg"><div class="lg-top"><a class="lg-back" href="/lesson-plans">← All lesson plans</a><span class="lg-brand">Guid<em>Ed</em></span></div>
`;
const foot = `<div class="lg-foot"><a href="/about">About</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/refunds">Refunds</a><a href="/">Open the app</a></div>
</main></body></html>
`;

function range(w) { const a = [].concat(w); return a.length > 1 ? 'Weeks ' + a[0] + '–' + a[a.length - 1] : 'Week ' + a[0]; }

// Group a term's rows into topics (same sub-strand / strand across consecutive weeks).
function topics(rows) {
  const out = [];
  for (const r of rows) {
    if (r.type !== 'teach') continue;
    const name = [r.strand, r.substrand].filter(Boolean).join(': ') || r.focus || '';
    if (!name) continue;
    const last = out[out.length - 1];
    if (last && last.name === name) { last.weeks = last.weeks.concat(r.weeks); if (r.standard && !last.stds.includes(r.standard)) last.stds.push(r.standard); }
    else out.push({ name, weeks: [].concat(r.weeks), stds: r.standard ? [r.standard] : [] });
  }
  return out;
}

function subjectPage(cls, sub) {
  const lv = levelOf(cls), data = D[sub].classes[cls], terms = Object.keys(data).sort();
  const url = `${SITE}/lesson-plans/${pageSlug(cls, sub)}`;
  const title = `${cls} ${sub} Lesson Plans (GES & NaCCA) · GuidEd`;
  const desc = `Free ${cls} ${sub} lesson plans for Ghana teachers, following the NaCCA scheme of learning week by week. Notes, ${lv.exam.section} and Word export.`;
  let h = head(title, desc, url);
  h += `<h1>${esc(cls)} ${esc(sub)} lesson plans</h1>\n<p class="lede">Make a ready-to-teach weekly lesson plan for ${esc(cls)} ${esc(sub)} that follows the Ghana Education Service (GES) and NaCCA scheme of learning. You get two lessons, ${esc(lv.notes.toggle.toLowerCase())} and ${esc(lv.exam.section)} with a marking guide, as a Word file you can edit.</p>\n<p><a href="/"><strong>Make a ${esc(cls)} ${esc(sub)} plan now</strong></a>. A Lesson 1 preview needs no account.</p>\n`;
  h += `<h2>What ${esc(cls)} ${esc(sub)} covers</h2>\n<p>Topics by week, from the scheme of learning that GuidEd uses to write each plan.</p>\n`;
  for (const t of terms) {
    const tp = topics(data[t]);
    if (!tp.length) continue;
    h += `<h3>Term ${esc(t)}</h3>\n<ul>\n`;
    for (const x of tp) h += `<li><strong>${esc(range(x.weeks))}:</strong> ${esc(x.name)}${x.stds.length ? '<br><span class="upd">' + x.stds.slice(0, 3).map(esc).join('; ') + '</span>' : ''}</li>\n`;
    h += `</ul>\n`;
  }
  if (terms.length < 3 && /^Basic [789]$/.test(cls)) h += `<p class="upd">Term 1 is available now. Terms 2 and 3 are being added.</p>\n`;
  const sibs = lv.classes.filter((c) => c !== cls && D[sub].classes[c]).map((c) => `<a href="/lesson-plans/${pageSlug(c, sub)}">${esc(c)} ${esc(sub)}</a>`);
  const subs = Object.keys(D).filter((s) => s !== sub && D[s].classes[cls]).map((s) => `<a href="/lesson-plans/${pageSlug(cls, s)}">${esc(cls)} ${esc(s)}</a>`);
  if (subs.length) h += `<h2>More ${esc(cls)} subjects</h2>\n<ul>${subs.map((x) => '<li>' + x + '</li>').join('')}</ul>\n`;
  if (sibs.length) h += `<h2>${esc(sub)} for other classes</h2>\n<ul>${sibs.map((x) => '<li>' + x + '</li>').join('')}</ul>\n`;
  h += `<p class="upd">GuidEd uses AI and can make mistakes. Check each plan against your syllabus and textbook. GuidEd is an independent tool, not an official GES or NaCCA product.</p>\n` + foot;
  return h;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const urls = [];
let pages = 0;
// class pages
const allClasses = L.ALL_CLASSES.filter((c) => Object.keys(D).some((s) => D[s].classes[c]));
for (const cls of allClasses) {
  const subs = Object.keys(D).filter((s) => D[s].classes[cls]).sort();
  const url = `${SITE}/lesson-plans/${clsSlug(cls)}`;
  let h = head(`${cls} Lesson Plans for Ghana (GES & NaCCA) · GuidEd`, `Free ${cls} lesson plans for every subject, following the GES and NaCCA scheme of learning.`, url);
  h += `<h1>${esc(cls)} lesson plans</h1>\n<p class="lede">Pick a subject to see what ${esc(cls)} covers each week, then make a plan in GuidEd.</p>\n<ul>\n${subs.map((s) => `<li><a href="/lesson-plans/${pageSlug(cls, s)}">${esc(cls)} ${esc(s)}</a></li>`).join('\n')}\n</ul>\n` + foot;
  fs.writeFileSync(path.join(OUT, clsSlug(cls) + '.html'), h);
  urls.push(url); pages++;
  for (const s of subs) { fs.writeFileSync(path.join(OUT, pageSlug(cls, s) + '.html'), subjectPage(cls, s)); urls.push(`${SITE}/lesson-plans/${pageSlug(cls, s)}`); pages++; }
}
// hub list inside lesson-plans.html
const hubFile = path.join(root, 'public/lesson-plans.html');
let hub = fs.readFileSync(hubFile, 'utf8');
const list = '<!--CLASSES-->\n<h2>Find your class</h2>\n<ul>\n' + L.LEVELS.map((lv) => `<li><strong>${esc(lv.name)}:</strong> ` + lv.classes.filter((c) => allClasses.includes(c)).map((c) => `<a href="/lesson-plans/${clsSlug(c)}">${esc(c)}</a>`).join(', ') + '</li>').join('\n') + '\n</ul>\n<!--/CLASSES-->';
hub = /<!--CLASSES-->/.test(hub) ? hub.replace(/<!--CLASSES-->[\s\S]*<!--\/CLASSES-->/, list) : hub.replace('<h2>What you get each week</h2>', list + '\n\n<h2>What you get each week</h2>');
fs.writeFileSync(hubFile, hub);
// sitemap
const core = [['/', '1.0'], ['/lesson-plans', '0.9'], ['/about', '0.5'], ['/terms', '0.2'], ['/privacy', '0.2'], ['/refunds', '0.2'], ['/ads-policy', '0.2']];
const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
  .concat(core.map(([p, pr]) => `  <url><loc>${SITE}${p}</loc><lastmod>${DATE}</lastmod><priority>${pr}</priority></url>`))
  .concat(urls.map((u) => `  <url><loc>${u}</loc><lastmod>${DATE}</lastmod><priority>0.7</priority></url>`)).concat('</urlset>', '');
fs.writeFileSync(path.join(root, 'public/sitemap.xml'), xml.join('\n'));
console.log(pages + ' pages, ' + (urls.length + core.length) + ' sitemap URLs');
