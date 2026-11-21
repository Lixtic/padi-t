'use strict';
// News: admin-written posts become safe, readable pages; drafts stay private; only admins can write.
const rows = [];
const notificationRows = [];
const recipients = [{ user_id: 'teacher-1' }, { user_id: 'parent-1' }];
const squash = (s) => String(s).replace(/\s+/g, ' ').trim();
global.__PADI_SQL__ = { query: async (text, p) => {
  const t = squash(text);
  if (/^(create|alter|insert into accounts|insert into users)/.test(t) && !/^insert into news_posts/.test(t)) return [];
  if (/^insert into notifications/.test(t)) {
    if (/from accounts/.test(t)) {
      recipients.forEach((r) => notificationRows.push({ user_id: r.user_id, id: 'news-' + p[0] + '-' + r.user_id, title: p[1], body: p[2], url: p[3] }));
      return recipients;
    }
    return [];
  }
  if (/^insert into news_posts/.test(t)) { rows.push({ id: p[0], slug: p[1], title: p[2], summary: p[3], body: p[4], source_name: p[5], source_url: p[6], status: p[7], published_at: p[8], updated_at: p[8], author: p[9] }); return []; }
  if (/^select published_at, status from news_posts where id/.test(t)) return rows.filter((r) => r.id === p[0]);
  if (/^update news_posts set title/.test(t)) { const r = rows.find((x) => x.id === p[0]); Object.assign(r, { title: p[1], summary: p[2], body: p[3], source_name: p[4], source_url: p[5], status: p[6], updated_at: p[7] }); if (p[8]) r.published_at = p[7]; return []; }
  if (/^select slug from news_posts where id/.test(t)) return rows.filter((r) => r.id === p[0]).map((r) => ({ slug: r.slug }));
  if (/^delete from news_posts/.test(t)) { const i = rows.findIndex((r) => r.id === p[0]); if (i < 0) return []; return rows.splice(i, 1).map((r) => ({ slug: r.slug })); }
  if (/^select id, slug, title, summary, body/.test(t)) return rows.slice().sort((a, b) => b.published_at - a.published_at);
  if (/from news_posts where slug = \$1 and status = 'published'/.test(t)) return rows.filter((r) => r.slug === p[0] && r.status === 'published');
  if (/^select slug, title, summary, published_at from news_posts where status = 'published'/.test(t)) return rows.filter((r) => r.status === 'published').sort((a, b) => b.published_at - a.published_at);
  if (/^select slug, updated_at from news_posts where status = 'published'/.test(t)) return rows.filter((r) => r.status === 'published');
  return [];
} };
Object.assign(process.env, { DATABASE_URL: 'test', ADMIN_EMAILS: 'boss@x.test' });
const News = require('../api/_news'), T = News._test;
const results = []; const check = (n, ok) => results.push([n, !!ok]);
const run = async (fn, url) => { const res = { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b || ''; } }; await fn({ method: 'GET', url, headers: {} }, res); return res; };
const good = { title: 'WAEC releases the BECE timetable', summary: 'The timetable for the coming BECE is out, with dates for each paper.', body: 'Paragraph one with [WAEC](https://waecgh.org/notice) link.\n\n## Key dates\n\n- Paper one\n- Paper two\n\nMore detail here to pass the length check easily.', source_name: 'WAEC', source_url: 'https://waecgh.org/notice' };

(async () => {
  const html = T.renderBody('<script>alert(1)</script>\n\n[bad](javascript:alert(1)) [http](http://x.test) [ok](https://ok.test/a?b=1&c=2)\n\n"quoted" & <b>x</b>');
  check('Body: markup is escaped, not run', !/<script|<b>/.test(html) && html.includes('&lt;script&gt;'));
  check('Body: only https links become links', !/href="javascript|href="http:/.test(html) && html.includes('href="https://ok.test/a?b=1&amp;c=2"'));
  check('Body: headings, bullets and paragraphs', /<h2>Key dates<\/h2>/.test(T.renderBody('## Key dates')) && /<ul>\n<li>a<\/li>\n<li>b<\/li>\n<\/ul>/.test(T.renderBody('- a\n- b')) && /<p>one<\/p>\n<p>two<\/p>/.test(T.renderBody('one\n\ntwo')));
  check('Validate: short headline, summary and body are refused', ['title', 'summary', 'body'].every((k) => T.validate({ ...good, [k]: 'x' }).error === k + '_short'));
  check('Validate: a non-https source link is refused', T.validate({ ...good, source_url: 'http://x.test' }).error === 'source_url' && T.validate({ ...good, source_url: 'javascript:alert(1)' }).error === 'source_url' && !T.validate({ ...good, source_url: '' }).error);
  check('Slug: plain words', T.slugify('WAEC: BECE 2027 – Timetable & Dates!') === 'waec-bece-2027-timetable-and-dates');

  const created = await News.save({ email: 'boss@x.test' }, good);
  check('Save: a new post is created with a readable slug', created.status === 201 && /^waec-releases-the-bece-timetable-[a-f0-9]{5}$/.test(created.body.slug));
  check('Publish: sends one in-app news notification to each registered account', created.body.notified === 2 && notificationRows.length === 2 && notificationRows.every((n) => n.title === good.title && n.url === '/news/' + created.body.slug));
  const draft = await News.save({ email: 'boss@x.test' }, { ...good, title: 'A draft that nobody should see yet', status: 'draft' });
  check('Draft: does not notify users', draft.body.notified === 0 && notificationRows.length === 2);
  const idx = await run(News.page, '/api/sync?what=news');
  check('Index: lists live posts only', idx.statusCode === 200 && idx.body.includes(created.body.slug) && !idx.body.includes(draft.body.slug) && /s-maxage=60/.test(idx.headers['cache-control']));
  const art = await run(News.page, '/api/sync?what=news&slug=' + created.body.slug);
  check('Post page: title, canonical, NewsArticle data, source link', art.statusCode === 200 && art.body.includes('<title>WAEC releases the BECE timetable · GuidEd News</title>') && art.body.includes('rel="canonical" href="https://www.guidedgh.site/news/' + created.body.slug) && art.body.includes('"@type":"NewsArticle"') && art.body.includes('Source: <a href="https://waecgh.org/notice"'));
  check('Post page: no inline scripts besides data', !/<script(?![^>]*(src=|application\/ld\+json))/.test(art.body));
  check('Draft and unknown posts are 404 and not indexed', (await run(News.page, '/x?what=news&slug=' + draft.body.slug)).statusCode === 404 && (await run(News.page, '/x?what=news&slug=nothing-here-00000')).statusCode === 404 && /noindex/.test((await run(News.page, '/x?what=news&slug=nothing-here-00000')).body) && (await run(News.page, '/x?what=news&slug=../etc')).statusCode === 404);
  const evil = await News.save({ email: 'boss@x.test' }, { ...good, title: 'Title with <img src=x onerror=alert(1)> inside', summary: 'Summary with "quotes" and <b>tags</b> that must be escaped ok.' });
  const evilPage = await run(News.page, '/x?what=news&slug=' + evil.body.slug);
  check('A hostile headline cannot inject markup', !/<img src=x/.test(evilPage.body) && evilPage.body.includes('&lt;img src=x'));

  const before = rows.find((r) => r.id === draft.body.id).published_at;
  await new Promise((r) => setTimeout(r, 5));
  const edited = await News.save({ email: 'boss@x.test' }, { ...good, id: draft.body.id, title: 'A draft that is now ready to publish', status: 'published' });
  const row = rows.find((r) => r.id === draft.body.id);
  check('Edit: the address stays the same; publishing a draft sets the date', edited.body.slug === draft.body.slug && row.published_at > before && (await run(News.page, '/x?what=news&slug=' + draft.body.slug)).statusCode === 200);
  check('Draft publish: sends notifications once when it first goes live', edited.body.notified === 2 && notificationRows.length === 4);
  const republished = await News.save({ email: 'boss@x.test' }, { ...good, id: draft.body.id, title: 'An updated headline for a live post' });
  check('Edit live post: does not send duplicate news notifications', republished.body.notified === 0 && notificationRows.length === 4);
  check('Edit: an unknown post is refused', (await News.save({}, { ...good, id: 'abcdef123456' })).status === 404);
  const hidden = await News.save({}, { ...good, title: 'Hidden unpublished post', status: 'draft' });
  const sm = await run(News.sitemap, '/news-sitemap.xml');
  check('Sitemap: live posts only, XML', /xml/.test(sm.headers['content-type']) && sm.body.includes(created.body.slug) && !sm.body.includes(hidden.body.slug));
  check('Delete: removes the post', (await News.remove(created.body.id)).status === 200 && (await News.remove(created.body.id)).status === 404 && (await run(News.page, '/x?what=news&slug=' + created.body.slug)).statusCode === 404);

  // In-app news bar: newest live post only, small cached JSON
  const latestRes = await run(News.latest, '/api/sync?what=news-latest');
  const lp = JSON.parse(latestRes.body).post;
  check('News bar: returns the newest live post only, as short cached JSON', latestRes.statusCode === 200 && /json/.test(latestRes.headers['content-type']) && /s-maxage=60/.test(latestRes.headers['cache-control']) && !!lp && lp.slug && lp.title && !('body' in lp) && rows.filter((r) => r.status === 'published').every((r) => Number(r.published_at) <= lp.published_at));
  const sy = require('fs').readFileSync(require('path').join(__dirname, '../api/sync.js'), 'utf8'), appJs = require('fs').readFileSync(require('path').join(__dirname, '../public/app.js'), 'utf8'), idxHtml = require('fs').readFileSync(require('path').join(__dirname, '../public/index.html'), 'utf8');
  check('News bar: routed, drawn from the app, dismissible per post, expires after two weeks', /news-latest/.test(sy) && /showNewsBar\(\);/.test(appJs) && /guided\.news\.gone/.test(appJs) && /14 \* 86400000/.test(appJs) && /id="newsBar"[^>]*hidden/.test(idxHtml) && /id="newsBarX"/.test(idxHtml));

  // Only admins reach the write actions
  const admin = require('../api/admin');
  const call = async (method, action, headers) => { const res = { headers: {}, setHeader() {}, end(b) { this.body = b; } }; const req = { method, url: '/api/admin?action=' + action, headers: headers || {}, on() {} }; await admin(req, res); return res.statusCode; };
  check('Admin: news actions refuse anyone who is not an admin', (await call('GET', 'news-list')) === 403 && (await call('POST', 'news-save')) === 403 && (await call('POST', 'news-delete')) === 403);
  const v = require('fs').readFileSync(require('path').join(__dirname, '../vercel.json'), 'utf8');
  check('Routes: /news, /news/<slug> and the sitemap are rewritten', /"source": "\/news"/.test(v) && /\/news\/:slug/.test(v) && /news-sitemap\.xml/.test(v) && /news-sitemap\.xml/.test(require('fs').readFileSync(require('path').join(__dirname, '../public/robots.txt'), 'utf8')));
  check('Vercel stays within 12 functions', require('fs').readdirSync(require('path').join(__dirname, '../api')).filter((f) => !f.startsWith('_')).length <= 12);

  let failed = 0;
  for (const [n, ok] of results) { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) failed++; }
  if (failed) process.exit(1);
  console.log('News tests passed.');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
