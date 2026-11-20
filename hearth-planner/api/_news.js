'use strict';
// News: posts written by admins (Admin > News) and shown as plain pages at /news and /news/<slug>, so search engines can read them.
//   Admin (through api/admin.js): list(), save(me, body), remove(id)
//   Public (through api/sync.js, see vercel.json rewrites): page(req, res), sitemap(req, res)
const crypto = require('crypto');
const db = require('./_db');
const SITE = 'https://www.guidedgh.site';
const LIMITS = { title: [8, 140], summary: [20, 300], body: [100, 20000] };

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const slugify = (s) => String(s).toLowerCase().replace(/&/g, ' and ').normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (ms) => { const d = new Date(Number(ms)); return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
const isoDate = (ms) => new Date(Number(ms)).toISOString();

// Plain text in, safe HTML out: blank line = new paragraph, "## " = heading, "- " = bullet, [text](https://link) = link.
function renderBody(text) {
  const blocks = String(text || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const inline = (t) => esc(t).replace(/\[([^\]\n]{1,120})\]\((https:\/\/[^\s()<>"']{4,300})\)/g, (m, label, url) => '<a href="' + url + '" rel="noopener">' + label + '</a>');
  return blocks.map((b) => {
    if (/^##\s+/.test(b) && !b.includes('\n')) return '<h2>' + inline(b.replace(/^##\s+/, '')) + '</h2>';
    const lines = b.split('\n');
    if (lines.every((l) => /^[-*]\s+/.test(l))) return '<ul>\n' + lines.map((l) => '<li>' + inline(l.replace(/^[-*]\s+/, '')) + '</li>').join('\n') + '\n</ul>';
    return '<p>' + lines.map(inline).join('<br>') + '</p>';
  }).join('\n');
}

function validate(b) {
  const out = { title: String(b.title || '').trim(), summary: String(b.summary || '').trim(), body: String(b.body || '').replace(/\r\n?/g, '\n').trim(), source_name: String(b.source_name || '').trim().slice(0, 120), source_url: String(b.source_url || '').trim(), status: b.status === 'draft' ? 'draft' : 'published' };
  for (const k of Object.keys(LIMITS)) {
    const [lo, hi] = LIMITS[k];
    if (out[k].length < lo) return { error: k + '_short', message: ({ title: 'Give the post a headline of at least 8 characters.', summary: 'Add a one or two sentence summary (at least 20 characters).', body: 'Write the post (at least 100 characters).' })[k] };
    if (out[k].length > hi) return { error: k + '_long', message: 'The ' + k + ' is too long (the limit is ' + hi + ' characters).' };
  }
  if (out.source_url) {
    let u; try { u = new URL(out.source_url); } catch (e) { return { error: 'source_url', message: 'The source link is not a web address.' }; }
    if (u.protocol !== 'https:') return { error: 'source_url', message: 'The source link must start with https://' };
    out.source_url = u.toString().slice(0, 500);
  }
  return { ok: out };
}

/* ───────── Admin ───────── */
async function list() {
  await db.ensure();
  const rows = await db.query('select id, slug, title, summary, body, source_name, source_url, status, published_at, updated_at from news_posts order by published_at desc limit 200');
  return { posts: rows.map((r) => ({ ...r, published_at: Number(r.published_at), updated_at: Number(r.updated_at) })) };
}
async function notifyPublished(post) {
  try {
    const rows = await db.query(
      "insert into notifications (id,user_id,dedupe_key,type,title,body,url,created_at) " +
      "select 'news-' || $1 || '-' || user_id, user_id, 'news:' || $1, 'news', $2, $3, $4, $5 from accounts " +
      "on conflict (user_id,dedupe_key) do nothing returning user_id",
      [post.id, post.title, post.summary, '/news/' + post.slug, Date.now()]
    );
    return rows.length;
  } catch (e) {
    // Publishing the article must still succeed if the notification fan-out has a temporary issue.
    console.error('[news] notification fan-out failed', e && e.message);
    return 0;
  }
}

async function save(me, b) {
  await db.ensure();
  const v = validate(b || {}); if (!v.ok) return { status: 400, body: v };
  const p = v.ok, now = Date.now();
  const id = String((b && b.id) || '').replace(/[^a-f0-9]/g, '').slice(0, 16);
  if (id) {
    const cur = await db.query('select published_at, status from news_posts where id = $1', [id]);
    if (!cur.length) return { status: 404, body: { error: 'unknown', message: 'That post no longer exists.' } };
    const firstLive = cur[0].status === 'draft' && p.status === 'published';
    await db.query('update news_posts set title = $2, summary = $3, body = $4, source_name = $5, source_url = $6, status = $7, updated_at = $8, published_at = case when $9 then $8 else published_at end where id = $1', [id, p.title, p.summary, p.body, p.source_name, p.source_url, p.status, now, firstLive]);
    const row = (await db.query('select slug from news_posts where id = $1', [id]))[0];
    const notified = firstLive ? await notifyPublished({ id, slug: row.slug, title: p.title, summary: p.summary }) : 0;
    return { status: 200, body: { ok: true, id, slug: row.slug, status: p.status, notified } };
  }
  const nid = crypto.randomBytes(6).toString('hex');
  const slug = (slugify(p.title) || 'post') + '-' + nid.slice(0, 5);
  await db.query('insert into news_posts (id, slug, title, summary, body, source_name, source_url, status, published_at, updated_at, author) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10)', [nid, slug, p.title, p.summary, p.body, p.source_name, p.source_url, p.status, now, String((me && me.email) || '').slice(0, 200)]);
  const notified = p.status === 'published' ? await notifyPublished({ id: nid, slug, title: p.title, summary: p.summary }) : 0;
  return { status: 201, body: { ok: true, id: nid, slug, status: p.status, notified } };
}
async function remove(id) {
  await db.ensure();
  const done = await db.query('delete from news_posts where id = $1 returning slug', [String(id || '').replace(/[^a-f0-9]/g, '').slice(0, 16)]);
  return done.length ? { status: 200, body: { ok: true, slug: done[0].slug } } : { status: 404, body: { error: 'unknown', message: 'That post no longer exists.' } };
}

/* ───────── Public pages ───────── */
const shell = (title, desc, url, ld, inner, opts) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#1B45A8"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/icons/icon-192.png" sizes="192x192" type="image/png"><link rel="stylesheet" href="/legal.css"><script src="/legal-theme.js"></script>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${(opts && opts.noindex) ? '<meta name="robots" content="noindex">' : '<link rel="canonical" href="' + esc(url) + '">'}
<meta property="og:type" content="${(opts && opts.og) || 'website'}"><meta property="og:site_name" content="GuidEd"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
${ld ? '<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, '\\u003c') + '</script>' : ''}
  <link rel="stylesheet" href="/cookie-consent.css">
  <script src="/cookie-consent.js" defer></script>
</head>
<body><main class="lg"><div class="lg-top"><a class="lg-back" href="/news">← All news</a><span class="lg-brand">Guid<em>Ed</em></span><a class="lg-back" href="/">Open GuidEd</a></div>
${inner}
<div class="lg-foot"><a href="/news">News</a><a href="/guides">Guides</a><a href="/lesson-plans">Lesson plans</a><a href="/about">About</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/">Open the app</a></div>
</main></body></html>
`;
const NOTE = '<p class="upd">GuidEd shares short updates for Ghana teachers and parents and links to the official source where there is one. GuidEd is independent and is not an official GES, NaCCA or WAEC service. Check important dates with your school or the official notice.</p>';

function articleHtml(p) {
  const url = SITE + '/news/' + p.slug;
  const ld = { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: p.title, description: p.summary, datePublished: isoDate(p.published_at), dateModified: isoDate(p.updated_at), inLanguage: 'en-GH', mainEntityOfPage: url, author: { '@type': 'Organization', name: 'GuidEd' }, publisher: { '@type': 'Organization', name: 'GuidEd', url: SITE + '/' } };
  let inner = '<p class="upd">' + esc(longDate(p.published_at)) + (Number(p.updated_at) - Number(p.published_at) > 86400000 ? ' · Updated ' + esc(longDate(p.updated_at)) : '') + '</p>\n<h1>' + esc(p.title) + '</h1>\n<p class="lede">' + esc(p.summary) + '</p>\n' + renderBody(p.body) + '\n';
  if (p.source_url) inner += '<p class="upd">Source: <a href="' + esc(p.source_url) + '" rel="noopener">' + esc(p.source_name || new URL(p.source_url).hostname) + '</a></p>\n';
  return shell(p.title + ' · GuidEd News', p.summary, url, ld, inner + NOTE, { og: 'article' });
}
function indexHtml(posts) {
  const url = SITE + '/news';
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'GuidEd News', url, description: 'Updates for Ghana teachers and parents.', inLanguage: 'en-GH' };
  let inner = '<h1>News for teachers and parents</h1>\n<p class="lede">Short updates on exams, the school calendar and the curriculum, with a link to the official source where there is one.</p>\n';
  inner += posts.length ? '<ul class="guide-list">\n' + posts.map((p) => '<li><a href="/news/' + esc(p.slug) + '"><strong>' + esc(p.title) + '</strong></a><br><span class="upd">' + esc(longDate(p.published_at)) + ' · ' + esc(p.summary) + '</span></li>').join('\n') + '\n</ul>\n' : '<p>No news yet. Check back soon, or read our <a href="/guides">guides</a>.</p>\n';
  return shell('News for Ghana Teachers and Parents · GuidEd', 'Short updates for Ghana teachers and parents on exams, the school calendar and the curriculum.', url, ld, inner + NOTE);
}

async function page(req, res) {
  const u = new URL(req.url, 'http://x'), slug = String(u.searchParams.get('slug') || '').toLowerCase();
  const send = (status, html, cache) => { res.statusCode = status; res.setHeader('content-type', 'text/html; charset=utf-8'); res.setHeader('cache-control', cache || 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'); res.end(html); };
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('allow', 'GET, HEAD'); return send(405, '', 'no-store'); }
  try {
    if (!db.configured()) return send(503, shell('News · GuidEd', 'News', SITE + '/news', null, '<h1>News</h1><p>News is not available right now.</p>', { noindex: true }), 'no-store');
    await db.ensure();
    if (slug) {
      if (!/^[a-z0-9-]{3,80}$/.test(slug)) throw Object.assign(new Error('nf'), { nf: true });
      const rows = await db.query("select slug, title, summary, body, source_name, source_url, published_at, updated_at from news_posts where slug = $1 and status = 'published'", [slug]);
      if (!rows.length) throw Object.assign(new Error('nf'), { nf: true });
      return send(200, articleHtml(rows[0]));
    }
    const rows = await db.query("select slug, title, summary, published_at from news_posts where status = 'published' order by published_at desc limit 60");
    return send(200, indexHtml(rows));
  } catch (e) {
    if (e && e.nf) return send(404, shell('News post not found · GuidEd', 'This news post could not be found.', SITE + '/news', null, '<h1>We could not find that post</h1>\n<p>It may have been removed. See the <a href="/news">latest news</a>.</p>', { noindex: true }), 'public, max-age=0, s-maxage=30');
    console.error('[news]', e && e.message);
    return send(500, shell('News · GuidEd', 'News', SITE + '/news', null, '<h1>News</h1><p>Something went wrong. Please try again in a moment.</p>', { noindex: true }), 'no-store');
  }
}

async function sitemap(req, res) {
  res.setHeader('content-type', 'application/xml; charset=utf-8'); res.setHeader('cache-control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
  let rows = [];
  try { if (db.configured()) { await db.ensure(); rows = await db.query("select slug, updated_at from news_posts where status = 'published' order by published_at desc limit 1000"); } } catch (e) { console.error('[news-sitemap]', e && e.message); }
  res.statusCode = 200;
  res.end('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>' + SITE + '/news</loc>' + (rows[0] ? '<lastmod>' + isoDate(rows[0].updated_at).slice(0, 10) + '</lastmod>' : '') + '<priority>0.7</priority></url>\n' + rows.map((r) => '  <url><loc>' + SITE + '/news/' + esc(r.slug) + '</loc><lastmod>' + isoDate(r.updated_at).slice(0, 10) + '</lastmod><priority>0.6</priority></url>').join('\n') + '\n</urlset>\n');
}

module.exports = { list, save, remove, page, sitemap, _test: { renderBody, validate, slugify, articleHtml, indexHtml } };
