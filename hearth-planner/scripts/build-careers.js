'use strict';
// Builds one public page per career (public/careers/<id>.html) from public/career-data.js and career-sources.js.
// Run by scripts/build-seo.js. Pages are orientation only: they never claim a route has been verified.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const SITE = 'https://www.guidedgh.site';
const DATE = new Date().toISOString().slice(0, 10);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const win = {}; vm.runInNewContext(fs.readFileSync(path.join(root, 'public/career-sources.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'public/career-data.js'), 'utf8'), { window: win });
const careers = win.GuidEdCareers || [], sources = win.GuidEdCareerSources || {};
const out = path.join(root, 'public/careers');

const head = (title, desc, url, ld) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#006A4E"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/icons/icon-192.png" sizes="192x192" type="image/png"><link rel="stylesheet" href="/legal.css"><script src="/legal-theme.js"></script>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article"><meta property="og:site_name" content="GuidEd"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/icons/icon-512.png"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
  <link rel="stylesheet" href="/cookie-consent.css">
  <script src="/cookie-consent.js" defer></script>
</head>
<body><main class="lg"><div class="lg-top"><a class="lg-back" href="/career-roadmaps" data-back="same">← Career Roadmaps</a><span class="lg-brand">Guid<em>Ed</em></span><a class="lg-back" href="/">Open GuidEd</a></div>
`;
const foot = `<div class="lg-foot"><a href="/career-roadmaps">Career Roadmaps</a><a href="/guides">Guides</a><a href="/lesson-plans">Lesson plans</a><a href="/about">About</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/refunds">Refunds</a><a href="/">Open the app</a></div>
</main></body></html>
`;
const ul = (a) => '<ul>\n' + a.map((x) => '<li>' + esc(x) + '</li>').join('\n') + '\n</ul>\n';

function page(c) {
  const url = `${SITE}/careers/${c.id}`;
  const title = `${c.title} Career in Ghana: Pathway, Subjects and First Steps · GuidEd`;
  const desc = `${c.summary} See the school subjects that help, a step-by-step pathway, skills to build and a first step you can take now.`;
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Article', headline: `${c.title} career pathway in Ghana`, description: desc, inLanguage: 'en-GH', dateModified: DATE, mainEntityOfPage: url, author: { '@type': 'Organization', name: 'GuidEd' }, publisher: { '@type': 'Organization', name: 'GuidEd' } },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Career Roadmaps', item: SITE + '/career-roadmaps' }, { '@type': 'ListItem', position: 2, name: c.title, item: url }] }] };
  let h = head(title, desc, url, ld);
  h += `<p class="upd">${esc(c.category)} · Career orientation</p>\n<h1>${esc(c.icon)} ${esc(c.title)}: career pathway in Ghana</h1>\n<p class="lede">${esc(c.summary)}</p>\n`;
  h += `<h2>Your pathway, step by step</h2>\n<ol>\n${c.routes.map((r) => `<li><strong>${esc(r.name)}.</strong> ${esc(r.detail)}</li>`).join('\n')}\n</ol>\n`;
  h += `<h2>School subjects that help</h2>\n${ul(c.subjects)}<h2>Skills to build</h2>\n${ul(c.skills)}`;
  h += `<h2>A first step you can take now</h2>\n<p>${esc(c.next)}</p>\n`;
  h += `<p class="upd">${esc(c.caution)}</p>\n`;
  const refs = (c.sourceRefs || []).map((id) => sources[id]).filter(Boolean);
  if (refs.length) h += `<h2>Official Ghana reference points</h2>\n<ul>\n${refs.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a>: ${esc(s.kind)}</li>`).join('\n')}\n</ul>\n<p class="upd">Use these to check current requirements. A reference link does not confirm that a particular course or provider is accredited.</p>\n`;
  const rel = careers.filter((x) => x.id !== c.id && x.category === c.category).slice(0, 4);
  if (rel.length) h += `<h2>Related careers</h2>\n<ul>\n${rel.map((x) => `<li><a href="/careers/${x.id}">${esc(x.title)}</a></li>`).join('\n')}\n</ul>\n`;
  h += `<p><a class="guides-primary" href="/career-roadmaps">Explore more careers or start your roadmap →</a></p>\n`;
  h += `<p class="upd">This is orientation for learners, not official admissions, licensing or employment advice. Check entry requirements with the institution's current prospectus and the relevant professional regulator. Written by the GuidEd team.</p>\n`;
  return h + foot;
}

fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
for (const c of careers) fs.writeFileSync(path.join(out, c.id + '.html'), page(c));
module.exports = { careers };
if (require.main === module) console.log(careers.length + ' career pages');
