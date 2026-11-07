'use strict';
// Bug reports and suggestions from inside the app.
//   POST /api/feedback                       { kind: 'bug'|'idea'|'other', message, email?, context? }  Anyone, signed in or not.
//   GET  /api/feedback?action=me             { admin }  Is the caller an admin? (ADMIN_EMAILS)
//   GET  /api/feedback?action=list           Admin only. { items, counts }. Add &status=new|done to filter.
//   POST /api/feedback?action=status         Admin only. { id, status: 'new' | 'done' }
//   POST /api/feedback?action=delete         Admin only. { id }
const crypto = require('crypto');
const { sendJson, clientIp, readJson, rateLimit } = require('./_lib');
const A = require('./_auth');
const db = require('./_db');

const KINDS = ['bug', 'idea', 'other'];
const { isAdmin } = require('./_entitle');
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

// Keeps only a few short, known fields of the technical details the app attaches.
function cleanContext(c) {
  const out = {};
  if (c && typeof c === 'object') {
    for (const k of ['app', 'tier', 'page', 'device', 'screen', 'online', 'signIn', 'theme']) if (c[k] != null && c[k] !== '') out[k] = clip(c[k], k === 'signIn' ? 600 : 160);
  }
  return JSON.stringify(out);
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const action = url.searchParams.get('action') || '';
  try {
    if (!db.configured()) return sendJson(res, 503, { error: 'not_configured', message: 'Feedback is not set up on this server yet.' });
    const me = req.headers.authorization ? await A.authed(req).catch(() => null) : null;

    if (req.method === 'GET') {
      if (action === 'me') return sendJson(res, 200, { admin: isAdmin(me) });
      if (action !== 'list') return sendJson(res, 400, { error: 'bad_request' });
      if (!isAdmin(me)) return sendJson(res, 403, { error: 'forbidden', message: 'Not allowed.' });
      await db.ensure();
      const st = url.searchParams.get('status');
      const rows = st === 'new' || st === 'done'
        ? await db.query('select * from feedback where status = $1 order by created_at desc limit 200', [st])
        : await db.query('select * from feedback order by created_at desc limit 200');
      const counts = await db.query('select status, count(*)::int as n from feedback group by status');
      const items = rows.map((r) => { let ctx = {}; try { ctx = JSON.parse(r.context || '{}'); } catch (e) { /* ignore */ } return { id: r.id, kind: r.kind, message: r.message, email: r.email, signedIn: !!r.user_id, tier: r.tier, status: r.status, createdAt: Number(r.created_at), context: ctx }; });
      return sendJson(res, 200, { items, counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) });
    }

    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method' });
    const body = await readJson(req);

    if (action === 'status' || action === 'delete') {
      if (!isAdmin(me)) return sendJson(res, 403, { error: 'forbidden', message: 'Not allowed.' });
      await db.ensure();
      const id = clip(body.id, 60);
      if (action === 'delete') await db.query('delete from feedback where id = $1', [id]);
      else await db.query('update feedback set status = $2 where id = $1', [id, body.status === 'done' ? 'done' : 'new']);
      return sendJson(res, 200, { ok: true });
    }

    // Sending feedback: open to everyone, but limited so the form cannot be used to flood the inbox.
    const who = (me && me.uid) || clientIp(req);
    const rl = rateLimit('feedback:' + who, 5, 60 * 60 * 1000);
    if (!rl.ok) return sendJson(res, 429, { error: 'rate_limited', message: 'You have sent a few messages already. Please try again later.' }, { 'Retry-After': String(rl.retryAfter) });
    const kind = KINDS.includes(body.kind) ? body.kind : 'other';
    const message = clip(body.message, 2000);
    if (message.length < 5) return sendJson(res, 400, { error: 'bad_request', message: 'Please write a little more so we can understand.' });
    let email = clip(body.email, 120);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { error: 'bad_request', message: 'That email address does not look right. You can also leave it empty.' });
    if (!email && me && me.email) email = clip(me.email, 120);
    const ctx = cleanContext(body.context);
    await db.ensure();
    const id = 'fb_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
    let tier = ''; try { tier = clip(JSON.parse(ctx).tier, 12); } catch (e) { /* ignore */ }
    await db.query('insert into feedback (id, kind, message, email, user_id, tier, context, status, created_at) values ($1, $2, $3, $4, $5, $6, $7, \'new\', $8)', [id, kind, message, email, (me && me.uid) || '', tier, ctx, Date.now()]);
    return sendJson(res, 200, { ok: true });
  } catch (e) {
    console.error('[feedback]', e && e.message);
    return sendJson(res, e && e.status ? e.status : 500, { error: 'server', message: 'Something went wrong. Please try again.' });
  }
};
