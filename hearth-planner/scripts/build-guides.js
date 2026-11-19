'use strict';
// Builds public/guides.html (index) and public/guides/*.html from data/guides/*.js. Run: node scripts/build-guides.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const SITE = 'https://www.guidedgh.site';
const DATE = process.env.GUIDES_DATE || '2026-11-19';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const articles = ['teachers-1', 'teachers-2', 'families'].flatMap((f) => require(path.join(root, 'data/guides', f + '.js')));
const bySlug = new Map(articles.map((a) => [a.slug, a]));
if (bySlug.size !== articles.length) throw new Error('Duplicate guide slug');
for (const a of articles) for (const r of a.related || []) if (!bySlug.has(r)) throw new Error(a.slug + ' links to a missing guide: ' + r);

const words = (a) => [a.intro, a.takeaway].concat(a.sections.flatMap((s) => (s.p || []).concat(s.ul || []))).join(' ').split(/\s+/).filter(Boolean).length;
const minutes = (a) => Math.max(2, Math.round(words(a) / 200));

const head = (title, desc, url, ld) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#1B45A8"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/icons/icon-192.png" sizes="192x192" type="image/png"><link rel="stylesheet" href="/legal.css"><script src="/legal-theme.js"></script>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article"><meta property="og:site_name" content="GuidEd"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/icons/icon-512.png"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${SITE}/icons/icon-512.png">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
  <link rel="stylesheet" href="/cookie-consent.css">
  <script src="/cookie-consent.js" defer></script>
</head>
<body><main class="lg"><div class="lg-top"><a class="lg-back" href="/guides">← All guides</a><span class="lg-brand">Guid<em>Ed</em></span><a class="lg-back" href="/">Open GuidEd</a></div>
`;
const foot = `<div class="lg-foot"><a href="/guides">Guides</a><a href="/lesson-plans">Lesson plans</a><a href="/about">About</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/refunds">Refunds</a><a href="/">Open the app</a></div>
</main></body></html>
`;

function list(items) { return '<ul>\n' + items.map((x) => '<li>' + esc(x) + '</li>').join('\n') + '\n</ul>\n'; }

function articlePage(a) {
  const url = `${SITE}/guides/${a.slug}`;
  const ld = { '@context': 'https://schema.org', '@graph': [{ '@type': 'Article', headline: a.title, description: a.desc, inLanguage: 'en-GH', datePublished: DATE, dateModified: DATE, mainEntityOfPage: url, author: { '@type': 'Organization', name: 'GuidEd' }, publisher: { '@type': 'Organization', name: 'GuidEd', url: SITE + '/' } }, { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' }, { '@type': 'ListItem', position: 2, name: 'Guides', item: SITE + '/guides' }, { '@type': 'ListItem', position: 3, name: a.title, item: url }] }] };
  let h = head(`${a.title} · GuidEd`, a.desc, url, ld);
  h += `<p class="upd">${esc(a.audience)} · ${minutes(a)} min read · Updated ${DATE}</p>\n<h1>${esc(a.title)}</h1>\n<p class="lede">${esc(a.intro)}</p>\n`;
  for (const s of a.sections) {
    h += `<h2>${esc(s.h)}</h2>\n`;
    for (const p of s.p || []) h += `<p>${esc(p)}</p>\n`;
    if (s.ul) h += list(s.ul);
  }
  h += `<h2>In short</h2>\n<p>${esc(a.takeaway)}</p>\n`;
  const rel = (a.related || []).map((r) => bySlug.get(r));
  if (rel.length) h += `<h2>Keep reading</h2>\n<ul>\n${rel.map((r) => `<li><a href="/guides/${r.slug}">${esc(r.title)}</a></li>`).join('\n')}\n</ul>\n`;
  h += `<p class="upd">Written by the GuidEd team for teachers and families in Ghana. This is general guidance, not an official GES, NaCCA or WAEC document. Always check details such as exam formats against your school and official sources. GuidEd makes weekly <a href="/lesson-plans">lesson plans</a> for Basic 1 to SHS 3, and you can <a href="/">try it free</a>.</p>\n` + foot;
  return h;
}

function topicOf(a) {
  const slug = a.slug;
  if (/lesson-plan|scheme-of-learning|term-planning|learning-indicator/.test(slug)) return 'Lesson planning';
  if (/assessment|questioning|depth-of-knowledge/.test(slug)) return 'Assessment';
  if (/bece|wassce/.test(slug)) return 'Exam preparation';
  if (/homework|study-routine|maths/.test(slug)) return 'Learning at home';
  if (/ai-for-lesson/.test(slug)) return 'AI & technology';
  return 'Classroom practice';
}

function indexPage() {
  const url = \`\${SITE}/guides\`;
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'GuidEd Guides', url, description: 'Practical guides for teachers and families in Ghana.', inLanguage: 'en-GH' };
  let h = head('Guides for Ghana Teachers and Parents · GuidEd', 'Practical guides on lesson planning, classroom teaching, BECE and WASSCE preparation, and supporting learning at home in Ghana.', url, ld).replace('og:type" content="article"', 'og:type" content="website"');
  h = h.replace('</head>', '  <script src="/guides.js" defer></script>\n</head>');
  h += \`<section class="guides-hero"><p class="guides-kicker">THE GUIDED KNOWLEDGE HUB</p><h1>Learn. Teach. Grow.</h1><p class="lede">Practical guidance for Ghanaian classrooms and families. Find a useful idea, put it into practice, and keep learning.</p><a class="guides-primary" href="/">Open GuidEd <span aria-hidden="true">→</span></a></section>\n\`;
  h += \`<section class="guides-discovery" aria-label="Find a guide"><label class="guides-search-label" for="guide-search">What would you like help with?</label><div class="guides-search"><span aria-hidden="true">⌕</span><input id="guide-search" type="search" placeholder="Search lesson planning, BECE, homework…" autocomplete="off"><button type="button" id="guide-search-clear" aria-label="Clear search">×</button></div><div class="guide-filters" role="group" aria-label="Filter guides by audience"><button type="button" class="guide-filter is-active" data-audience="all" aria-pressed="true">Everyone</button><button type="button" class="guide-filter" data-audience="Teachers" aria-pressed="false">Teachers</button><button type="button" class="guide-filter" data-audience="family" aria-pressed="false">Parents & students</button></div></section>\n\`;
  const topics = [...new Set(articles.map(topicOf))];
  h += \`<section class="guides-results"><div class="guides-results-head"><div><h2>Explore the guides</h2><p class="upd">Short, practical reads you can use in real life.</p></div><span id="guide-count" class="guide-count">\${articles.length} guides</span></div><div class="guide-topic-filters" role="group" aria-label="Filter by topic"><button type="button" class="guide-topic is-active" data-topic="all" aria-pressed="true">All topics</button>\${topics.map((t) => \`<button type="button" class="guide-topic" data-topic="\${esc(t)}" aria-pressed="false">\${esc(t)}</button>\`).join('')}</div>\n<div class="guide-card-grid" id="guide-grid">\n\`;
  for (const a of articles) {
    const topic = topicOf(a);
    const audience = a.audience === 'Teachers' ? 'Teachers' : 'family';
    const audienceLabel = a.audience === 'Teachers' ? 'For teachers' : a.audience === 'Parents' ? 'For parents' : a.audience === 'Students' ? 'For students' : 'For parents & students';
    h += \`<article class="guide-card" data-title="\${esc(a.title.toLowerCase())}" data-search="\${esc((a.title + ' ' + a.desc + ' ' + a.audience + ' ' + topic).toLowerCase())}" data-audience="\${audience}" data-topic="\${esc(topic)}"><div class="guide-card-meta"><span class="guide-category">\${esc(topic)}</span><span>\${esc(audienceLabel)}</span></div><h3><a href="/guides/\${a.slug}">\${esc(a.title)}</a></h3><p>\${esc(a.desc)}</p><div class="guide-card-foot"><span>\${minutes(a)} min read</span><a href="/guides/\${a.slug}" aria-label="Read \${esc(a.title)}">Read guide <span aria-hidden="true">→</span></a></div></article>\n\`;
  }
  h += \`</div><p id="guide-empty" class="guide-empty" hidden>No guides match that search. Try another word or clear the filters.</p></section>\n\`;
  h += \`<p class="upd guides-disclaimer">GuidEd is an independent tool and is not an official product of the Ghana Education Service, NaCCA or WAEC. Guides are general guidance; check official sources for current curriculum and examination requirements.</p>\n\` + foot;
  return h;
}

const out = path.join(root, 'public/guides');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
for (const a of articles) fs.writeFileSync(path.join(out, a.slug + '.html'), articlePage(a));
fs.writeFileSync(path.join(root, 'public/guides.html'), indexPage());
module.exports = { articles };
if (require.main === module) console.log(articles.length + ' guides, ' + articles.reduce((n, a) => n + words(a), 0) + ' words');
