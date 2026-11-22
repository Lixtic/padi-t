'use strict';
// Builds public/guides.html (index) and public/guides/*.html from data/guides/*.js. Run: node scripts/build-guides.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const SITE = 'https://www.guidedgh.site';
const DATE = process.env.GUIDES_DATE || '2026-11-19';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const articles = ['teachers-1', 'teachers-2', 'teachers-3', 'families'].flatMap((f) => require(path.join(root, 'data/guides', f + '.js')));
const bySlug = new Map(articles.map((a) => [a.slug, a]));
if (bySlug.size !== articles.length) throw new Error('Duplicate guide slug');
for (const a of articles) for (const r of a.related || []) if (!bySlug.has(r)) throw new Error(a.slug + ' links to a missing guide: ' + r);

const words = (a) => [a.intro, a.takeaway].concat(a.sections.flatMap((s) => (s.p || []).concat(s.ul || []))).join(' ').split(/\s+/).filter(Boolean).length;
const minutes = (a) => Math.max(2, Math.round(words(a) / 200));

const head = (title, desc, url, ld, img) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#1B45A8"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/icons/icon-192.png" sizes="192x192" type="image/png"><link rel="stylesheet" href="/legal.css"><script src="/legal-theme.js"></script>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article"><meta property="og:site_name" content="GuidEd"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${img || SITE + '/icons/icon-512.png'}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${img || SITE + '/icons/icon-512.png'}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
  <link rel="stylesheet" href="/cookie-consent.css">
  <script src="/cookie-consent.js" defer></script>
</head>
<body><main class="lg"><div class="lg-top"><a class="lg-back" href="/guides" data-back="same">← All guides</a><span class="lg-brand">Guid<em>Ed</em></span><a class="lg-back" href="/">Open GuidEd</a></div>
`;
const foot = `<div class="lg-foot"><a href="/news">News</a><a href="/guides">Guides</a><a href="/career-roadmaps">Careers</a><a href="/lesson-plans">Lesson plans</a><a href="/about">About</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/refunds">Refunds</a><a href="/">Open the app</a></div>
</main></body></html>
`;

function list(items) { return '<ul>\n' + items.map((x) => '<li>' + esc(x) + '</li>').join('\n') + '\n</ul>\n'; }

const SCHEME_TOOL = `<section class="sg" id="scheme-generator" aria-labelledby="sg-h"><h2 id="sg-h">Make a termly scheme of learning</h2>
<p class="sg-sub">Pick a class, subject and term. You get the full week-by-week scheme from the national curriculum, ready to print or open in Word.</p>
<form class="sg-form" id="sgForm"><div><label for="sgClass">Class</label><select id="sgClass" disabled><option>Loading…</option></select></div><div><label for="sgSubject">Subject</label><select id="sgSubject" disabled></select></div><div><label for="sgTerm">Term</label><select id="sgTerm"><option value="1">Term 1</option><option value="2">Term 2</option><option value="3">Term 3</option></select></div><div><label for="sgYear">Academic year</label><input id="sgYear" autocomplete="off" maxlength="12"></div><div><label for="sgSchool">School (optional)</label><input id="sgSchool" autocomplete="off" maxlength="80"></div><div><label for="sgTeacher">Teacher (optional)</label><input id="sgTeacher" autocomplete="off" maxlength="80"></div></form>
<div class="sg-samples" id="sgSamples"><span>Try a sample:</span><button type="button" data-c="Basic 1" data-s="English Language" data-t="1">Basic 1 English Language T1</button><button type="button" data-c="Basic 4" data-s="Mathematics" data-t="2">Basic 4 Mathematics T2</button><button type="button" data-c="Basic 7" data-s="Integrated Science" data-t="2">Basic 7 Integrated Science T2</button><button type="button" data-c="Basic 9" data-s="Social Studies" data-t="3">Basic 9 Social Studies T3</button><button type="button" data-c="SHS 1" data-s="Mathematics" data-t="1">SHS 1 Mathematics T1</button></div>
<p class="sg-msg" id="sgMsg" role="status" aria-live="polite"></p>
<div class="sg-actions" id="sgActions" hidden><button type="button" id="sgPrint">Print or save as PDF</button><button type="button" id="sgWord">Download Word</button></div>
<div class="sg-out" id="sgOut"></div>
<noscript><p>The generator needs JavaScript. You can also browse every scheme on the <a href="/lesson-plans">lesson plans</a> pages.</p></noscript></section>
`;

function articlePage(a) {
  const url = `${SITE}/guides/${a.slug}`;
  const ld = { '@context': 'https://schema.org', '@graph': [{ '@type': 'Article', headline: a.title, description: a.desc, inLanguage: 'en-GH', datePublished: a.date || DATE, dateModified: a.date || DATE, mainEntityOfPage: url, author: { '@type': 'Organization', name: 'GuidEd' }, publisher: { '@type': 'Organization', name: 'GuidEd', url: SITE + '/' } }, { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' }, { '@type': 'ListItem', position: 2, name: 'Guides', item: SITE + '/guides' }, { '@type': 'ListItem', position: 3, name: a.title, item: url }] }] };
  let h = head(`${a.title} · GuidEd`, a.desc, url, ld, a.image ? SITE + a.image.src : '');
  if (a.tool) h = h.replace('</head>', '  <script src="/scheme-gen.js" defer></script>\n</head>');
  h += `<p class="upd">${esc(a.audience)} · ${minutes(a)} min read · Updated ${a.date || DATE}</p>\n<h1>${esc(a.title)}</h1>\n<p class="lede">${esc(a.intro)}</p>\n`;
  if (a.image) h += `<figure class="guide-fig"><a href="${esc(a.image.src)}"><img src="${esc(a.image.src)}" width="${a.image.w}" height="${a.image.h}" alt="${esc(a.image.alt)}" fetchpriority="low"></a><figcaption>${esc(a.image.caption)}</figcaption></figure>\n`;
  if (a.tool === 'scheme-generator') h += a.toolDefault ? SCHEME_TOOL.replace('<section class="sg"', `<section class="sg" data-class="${esc(a.toolDefault.cls)}" data-subject="${esc(a.toolDefault.sub)}"`) : SCHEME_TOOL;
  for (const s of a.sections) {
    h += `<h2>${esc(s.h)}</h2>\n`;
    for (const p of s.p || []) h += `<p>${esc(p)}</p>\n`;
    if (s.ul) h += list(s.ul);
  }
  if (a.sourceUrl) h += `<section class="guide-source" aria-label="Official source"><h2>Official source document</h2><p>${esc(a.sourceNote || "Source document provided by the Ghana Education Service.")}</p><p><a class="guides-primary" href="${esc(a.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(a.sourceLabel || "Open source document")} <span aria-hidden="true">↗</span></a></p></section>\n`;
  h += `<h2>In short</h2>\n<p>${esc(a.takeaway)}</p>\n`;
  const rel = (a.related || []).map((r) => bySlug.get(r));
  if (rel.length) h += `<h2>Keep reading</h2>\n<ul>\n${rel.map((r) => `<li><a href="/guides/${r.slug}">${esc(r.title)}</a></li>`).join('\n')}\n</ul>\n`;
  h += `<p class="upd">Written by the GuidEd team for teachers and families in Ghana. This is general guidance, not an official GES, NaCCA or WAEC document. Always check details such as exam formats against your school and official sources. GuidEd makes weekly <a href="/lesson-plans">lesson plans</a> for Basic 1 to SHS 3, and you can <a href="/">try it free</a>.</p>\n` + foot;
  return h;
}

function topicOf(a) {
  const slug = a.slug;
  if (/lesson-plan|scheme-of-learning|scheme-of-work|term-planning|learning-indicator/.test(slug)) return 'Lesson planning';
  if (/assessment|questioning|depth-of-knowledge/.test(slug)) return 'Assessment';
  if (/bece|wassce/.test(slug)) return 'Exam preparation';
  if (/homework|study-routine|maths/.test(slug)) return 'Learning at home';
  if (/ai-for-lesson/.test(slug)) return 'AI & technology';
  return 'Classroom practice';
}

function indexPage() {
  const url = `${SITE}/guides`;
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'GuidEd Guides', url, description: 'Practical guides for teachers and families in Ghana.', inLanguage: 'en-GH' };
  let h = head('Guides for Ghana Teachers and Parents · GuidEd', 'Practical guides on lesson planning, classroom teaching, BECE and WASSCE preparation, and supporting learning at home in Ghana.', url, ld).replace('og:type" content="article"', 'og:type" content="website"');
  h = h.replace('<a class="lg-back" href="/guides" data-back="same">← All guides</a>', '<a class="lg-back" href="/" data-back="any">← Back</a>');
  h = h.replace('</head>', '  <script src="/guides.js" defer></script>\n</head>');
  h += `<section class="guides-hero" aria-labelledby="guides-hero-title"><img class="guides-hero-image" src="/guided-family-splash.webp" alt="A Ghanaian teacher supporting learners as they work together in a classroom" fetchpriority="high"><div class="guides-hero-shade"></div><div class="guides-hero-content"><p class="guides-kicker">THE GUIDED KNOWLEDGE HUB</p><h1 id="guides-hero-title">Learn. Teach. Grow.</h1><p class="lede">Practical guidance for Ghanaian classrooms and families. Find a useful idea, put it into practice, and keep learning.</p><a class="guides-primary" href="/">Open GuidEd <span aria-hidden="true">→</span></a></div></section>\n`;
  h += `<section class="guides-discovery" aria-label="Find a guide"><label class="guides-search-label" for="guide-search">What would you like help with?</label><div class="guides-search"><span aria-hidden="true">⌕</span><input id="guide-search" type="search" placeholder="Search lesson planning, BECE, homework…" autocomplete="off"><button type="button" id="guide-search-clear" aria-label="Clear search">×</button></div><div class="guide-filters" role="group" aria-label="Filter guides by audience"><button type="button" class="guide-filter is-active" data-audience="all" aria-pressed="true">Everyone</button><button type="button" class="guide-filter" data-audience="Teachers" aria-pressed="false">Teachers</button><button type="button" class="guide-filter" data-audience="family" aria-pressed="false">Parents & students</button></div></section>\n`;
  const topics = [...new Set(articles.map(topicOf))];
  h += `<section class="guides-results"><div class="guides-results-head"><div><h2>Explore the guides</h2><p class="upd">Short, practical reads you can use in real life.</p></div><span id="guide-count" class="guide-count">${articles.length} guides</span></div><div class="guide-topic-filters" role="group" aria-label="Filter by topic"><button type="button" class="guide-topic is-active" data-topic="all" aria-pressed="true">All topics</button>${topics.map((t) => `<button type="button" class="guide-topic" data-topic="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join('')}</div>\n<div class="guide-card-grid" id="guide-grid">\n`;
  for (const a of articles) {
    const topic = topicOf(a);
    const audience = a.audience === 'Teachers' ? 'Teachers' : 'family';
    const audienceLabel = a.audience === 'Teachers' ? 'For teachers' : a.audience === 'Parents' ? 'For parents' : a.audience === 'Students' ? 'For students' : 'For parents & students';
    h += `<article class="guide-card" data-title="${esc(a.title.toLowerCase())}" data-search="${esc((a.title + ' ' + a.desc + ' ' + a.audience + ' ' + topic).toLowerCase())}" data-audience="${audience}" data-topic="${esc(topic)}"><div class="guide-card-meta"><span class="guide-category">${esc(topic)}</span><span>${esc(audienceLabel)}</span></div><h3><a href="/guides/${a.slug}">${esc(a.title)}</a></h3><p>${esc(a.desc)}</p><div class="guide-card-foot"><span>${minutes(a)} min read</span><a href="/guides/${a.slug}" aria-label="Read ${esc(a.title)}">Read guide <span aria-hidden="true">→</span></a></div></article>\n`;
  }
  h += `</div><nav class="guide-pager" id="guide-pager" aria-label="Guides pages" hidden></nav><p id="guide-empty" class="guide-empty" hidden>No guides match that search. Try another word or clear the filters.</p></section>\n`;
  h += `<p class="upd guides-disclaimer">GuidEd is an independent tool and is not an official product of the Ghana Education Service, NaCCA or WAEC. Guides are general guidance; check official sources for current curriculum and examination requirements.</p>\n` + foot;
  return h;
}

const out = path.join(root, 'public/guides');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
for (const a of articles) fs.writeFileSync(path.join(out, a.slug + '.html'), articlePage(a));
fs.writeFileSync(path.join(root, 'public/guides.html'), indexPage());
// Data for the scheme generator, loaded only when someone uses it.
{
  const D = require(path.join(root, 'data/schemes.json')).subjects, out2 = {};
  for (const [sub, v] of Object.entries(D)) for (const [cls, terms] of Object.entries(v.classes)) for (const [t, rows] of Object.entries(terms))
    ((out2[cls] = out2[cls] || {})[sub] = out2[cls][sub] || {})[t] = rows.map((r) => [r.weeks, r.type === 'teach' ? 0 : r.type === 'exam' ? 2 : 1, r.strand || '', r.substrand || '', r.standard || '', r.indicators || [], r.focus || '']);
  fs.writeFileSync(path.join(root, 'public/scheme-gen.json'), JSON.stringify(out2));
}
module.exports = { articles };
if (require.main === module) console.log(articles.length + ' guides, ' + articles.reduce((n, a) => n + words(a), 0) + ' words');
