'use strict';
// Owner-only tools (anyone listed in ADMIN_EMAILS).
//   GET  /api/admin?action=stats&days=30   Sign-ups, previews, plans, limits hit, Pro, money, AI use.
//   POST /api/admin?action=refund          { reference }  Refunds one payment through Paystack and takes its days off.
//   GET  /api/admin?action=find&q=email    Looks a teacher up: plan, Pro end, plans written, AI use, payments, blocked.
//   POST /api/admin?action=grant           { user_id, days, note }  Adds Pro days (or takes them off with a negative number).
//   POST /api/admin?action=block           { user_id, blocked, reason }  Pauses or restores a teacher's account.
//   GET/POST /api/admin?action=notice      The announcement banner everyone sees: { text, kind, on, days }.
//   GET  /api/admin?action=log             What admins have done recently.
const { sendJson, readJson } = require('./_lib');
const A = require('./_auth');
const db = require('./_db');
const E = require('./_entitle');
const billing = require('./billing');
const Quota = require('./_quota');
const crypto = require('crypto');

const DAY = 86400000;
const money = (pesewas) => Math.round(Number(pesewas || 0)) / 100;

// AI use from the daily usage counters (kept for 35 days): totals per day, and the heaviest users.
async function aiUsage(days) {
  const since = new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
  const daily = await db.query("select day, sum(tokens)::bigint as tokens, sum(requests)::int as requests, count(*) filter (where subject like 'u:%')::int as teachers, count(*) filter (where subject like 'ip:%')::int as guests from usage where day >= $1 group by day order by day", [since]);
  const top = await db.query("select subject, sum(tokens)::bigint as tokens, sum(requests)::int as requests from usage where day >= $1 and subject like 'u:%' group by subject order by sum(tokens) desc limit 10", [since]);
  let names = new Map();
  if (top.length) {
    const accts = await db.query("select user_id, email from accounts limit 20000");
    names = new Map(accts.map((a) => [Quota.subjectFor({ uid: a.user_id }), { user_id: a.user_id, email: a.email }]));
  }
  const total = daily.reduce((n, r) => n + Number(r.tokens), 0), requests = daily.reduce((n, r) => n + Number(r.requests), 0);
  return {
    days, tokens: total, requests,
    daily: daily.map((r) => ({ day: r.day, tokens: Number(r.tokens), requests: Number(r.requests), teachers: Number(r.teachers), guests: Number(r.guests) })),
    top: top.map((r) => { const n = names.get(r.subject) || {}; return { user_id: n.user_id || '', email: n.email || '(unknown)', tokens: Number(r.tokens), requests: Number(r.requests) }; }),
    note: 'Token counts are estimates (about 4 characters each). Daily figures are kept for 35 days.',
  };
}

async function logAction(me, action, target, detail) {
  try { await db.query('insert into admin_log (id, at, admin, action, target, detail) values ($1, $2, $3, $4, $5, $6)', [crypto.randomBytes(8).toString('hex'), Date.now(), me.email || '', action, String(target || '').slice(0, 120), String(detail || '').slice(0, 400)]); }
  catch (e) { console.error('[admin] log failed', e && e.message); }
}

// One teacher's whole picture, found by part of an email address.
async function find(q) {
  await db.ensure();
  q = String(q || '').trim().toLowerCase().slice(0, 80);
  if (q.length < 3) return { status: 400, body: { error: 'short', message: 'Type at least 3 letters of the email.' } };
  const like = '%' + q.replace(/[%_\\]/g, '') + '%';
  const rows = await db.query("select user_id, email, first_seen from accounts where lower(email) like $1 order by first_seen desc limit 8", [like]);
  const out = [];
  const wk = E.weekKey(), now = Date.now();
  for (const a of rows) {
    const subject = Quota.subjectFor({ uid: a.user_id });
    const exp = await E.expiry(a.user_id);
    const vip = String(process.env.PRO_EMAILS || '').toLowerCase().split(/[\s,;]+/).filter(Boolean).includes(String(a.email).toLowerCase());
    const week = (await db.query('select coalesce(sum(n), 0)::int as n from plan_log where subject = $1 and period = $2', [subject, wk]))[0] || {};
    const ai = (await db.query('select coalesce(sum(tokens), 0)::bigint as t, coalesce(sum(requests), 0)::int as r from usage where subject = $1', [subject]))[0] || {};
    const pays = await db.query("select reference, plan, amount, currency, status, coalesce(paid_at, created_at) as at from payments where user_id = $1 and status <> 'pending' order by coalesce(paid_at, created_at) desc limit 5", [a.user_id]);
    const blk = await db.query('select reason, at from blocked where user_id = $1', [a.user_id]);
    out.push({
      user_id: a.user_id, email: a.email, firstSeen: Number(a.first_seen) || 0,
      tier: vip || exp > now ? 'pro' : 'free', vip, proUntil: exp > now ? exp : 0,
      plansThisWeek: Number(week.n || 0), aiTokens: Number(ai.t || 0), aiRequests: Number(ai.r || 0),
      blocked: blk.length ? { reason: blk[0].reason, at: Number(blk[0].at) } : null,
      payments: pays.map((p) => ({ reference: p.reference, plan: p.plan, amount: money(p.amount), currency: p.currency, status: p.status, at: Number(p.at) })),
    });
  }
  return { status: 200, body: { results: out } };
}

// Adds Pro days to a teacher (a gift or a fix), or takes days off with a negative number. Never goes below "now".
async function grant(me, userId, days, note) {
  await db.ensure();
  days = Math.trunc(Number(days));
  if (!userId || !Number.isFinite(days) || days === 0 || Math.abs(days) > 730) return { status: 400, body: { error: 'bad_request', message: 'Give a number of days between 1 and 730 (or a negative number to take days off).' } };
  const who = await db.query('select email from accounts where user_id = $1', [userId]);
  if (!who.length) return { status: 404, body: { error: 'unknown', message: 'No such account.' } };
  const cur = await E.expiry(userId), now = Date.now();
  const next = days > 0 ? Math.max(now, cur) + days * DAY : Math.max(Math.min(cur, now), cur + days * DAY);
  await db.query("insert into subscriptions (user_id, expires_at, plan, updated_at) values ($1, $2, 'gift', $3) on conflict (user_id) do update set expires_at = $2, updated_at = $3", [userId, next, now]);
  await logAction(me, days > 0 ? 'grant' : 'remove', who[0].email, (days > 0 ? '+' : '') + days + ' days' + (note ? ' · ' + note : ''));
  return { status: 200, body: { ok: true, proUntil: next > now ? next : 0 } };
}

async function block(me, userId, on, reason) {
  await db.ensure();
  const who = await db.query('select email from accounts where user_id = $1', [userId]);
  if (!who.length) return { status: 404, body: { error: 'unknown', message: 'No such account.' } };
  if (String(who[0].email).toLowerCase() === String(me.email).toLowerCase()) return { status: 400, body: { error: 'self', message: 'You cannot block your own account.' } };
  if (on) await db.query('insert into blocked (user_id, email, reason, at) values ($1, $2, $3, $4) on conflict (user_id) do update set reason = $3, at = $4', [userId, who[0].email, String(reason || '').slice(0, 200), Date.now()]);
  else await db.query('delete from blocked where user_id = $1', [userId]);
  await logAction(me, on ? 'block' : 'unblock', who[0].email, reason || '');
  return { status: 200, body: { ok: true } };
}

async function getNotice() {
  await db.ensure();
  const r = await db.query("select value from settings where key = 'notice'");
  const n = r.length ? JSON.parse(r[0].value || '{}') : {};
  return { text: n.text || '', kind: n.kind === 'warn' ? 'warn' : 'info', on: !!n.on, until: Number(n.until) || 0 };
}
async function setNotice(me, b) {
  await db.ensure();
  const text = String(b.text || '').trim().slice(0, 200), on = !!b.on && !!text, days = Math.min(90, Math.max(0, parseInt(b.days, 10) || 0));
  const n = { text, kind: b.kind === 'warn' ? 'warn' : 'info', on, until: on && days ? Date.now() + days * DAY : 0 };
  await db.query("insert into settings (key, value, updated_at) values ('notice', $1, $2) on conflict (key) do update set value = $1, updated_at = $2", [JSON.stringify(n), Date.now()]);
  E.clearNoticeCache();
  await logAction(me, on ? 'notice_on' : 'notice_off', '', text);
  return n;
}

async function stats(days) {
  await db.ensure();
  const now = Date.now(), c = E.cfg();
  const since = new Date(now - days * DAY).toISOString().slice(0, 10);
  const ev = {};
  for (const r of await db.query('select name, sum(n)::int as n from events where day >= $1 group by name', [since])) ev[r.name] = Number(r.n);
  const acc = (await db.query('select count(*)::int as total, count(*) filter (where first_seen > $1)::int as fresh from accounts', [now - days * DAY]))[0] || {};
  const wk = E.weekKey();
  const wrows = await db.query("select subject, sum(n)::int as n from plan_log where period = $1 and subject like 'u:%' group by subject", [wk]);
  const limit = c.freePlansWeekly;
  const week = { active: wrows.length, atLimit: limit ? wrows.filter((r) => Number(r.n) >= limit).length : 0, limit, average: wrows.length ? Math.round(10 * wrows.reduce((n, r) => n + Number(r.n), 0) / wrows.length) / 10 : 0 };
  const sub = (await db.query('select count(*) filter (where expires_at > $1)::int as active, count(*) filter (where expires_at > $1 and expires_at <= $2)::int as ending from subscriptions', [now, now + 7 * DAY]))[0] || {};
  const rev = await db.query("select currency, plan, count(*)::int as n, sum(amount)::bigint as total from payments where status = 'success' and paid_at >= $1 group by currency, plan", [now - days * DAY]);
  const all = await db.query("select currency, count(*)::int as n, sum(amount)::bigint as total, count(distinct user_id)::int as payers from payments where status = 'success' group by currency");
  const ref = await db.query("select currency, count(*)::int as n, sum(amount)::bigint as total from payments where status = 'refunded' group by currency");
  const recent = await db.query("select reference, email, plan, amount, currency, status, paid_at, refunded_at, created_at from payments where status <> 'pending' order by coalesce(paid_at, created_at) desc limit 25");
  const ai = await aiUsage(Math.min(days, 35));
  const payers = all.reduce((n, r) => n + Number(r.payers), 0);
  return {
    days, since, currency: c.currency, trackingNote: 'Counts start from when this version was deployed.',
    accounts: { total: Number(acc.total || 0), new: Number(acc.fresh || 0) },
    events: ev,
    freeWeek: week,
    pro: { active: Number(sub.active || 0), endingSoon: Number(sub.ending || 0), payers, conversion: Number(acc.total) ? Math.round(1000 * payers / Number(acc.total)) / 10 : 0 },
    money: {
      period: rev.map((r) => ({ currency: r.currency, plan: r.plan, count: Number(r.n), amount: money(r.total) })),
      allTime: all.map((r) => ({ currency: r.currency, count: Number(r.n), amount: money(r.total) })),
      refunded: ref.map((r) => ({ currency: r.currency, count: Number(r.n), amount: money(r.total) })),
    },
    ai,
    payments: recent.map((r) => ({ reference: r.reference, email: r.email, plan: r.plan, amount: money(r.amount), currency: r.currency, status: r.status, at: Number(r.paid_at || r.created_at) })),
  };
}

// Refunds the whole payment, then removes the Pro days it bought (never below "now").
async function refund(reference) {
  await db.ensure();
  const rows = await db.query('select user_id, plan, status from payments where reference = $1', [reference]);
  if (!rows.length) return { status: 404, body: { error: 'unknown', message: 'No such payment.' } };
  const p = rows[0];
  if (p.status === 'refunded') return { status: 409, body: { error: 'already', message: 'That payment was already refunded.' } };
  if (p.status !== 'success') return { status: 409, body: { error: 'not_paid', message: 'Only paid payments can be refunded.' } };
  if (!process.env.PAYSTACK_SECRET_KEY) return { status: 503, body: { error: 'not_configured', message: 'Paystack is not set up.' } };
  try { await billing.paystack('/refund', { method: 'POST', body: JSON.stringify({ transaction: reference }) }); }
  catch (e) { return { status: 502, body: { error: 'paystack', message: 'Paystack did not accept the refund: ' + (e && e.message ? e.message : 'unknown error') } }; }
  const done = await db.query("update payments set status = 'refunded', refunded_at = $2 where reference = $1 and status = 'success' returning plan", [reference, Date.now()]);
  if (done.length) {
    const days = (E.cfg().plans[p.plan] || { days: 30 }).days;
    const cur = await E.expiry(p.user_id);
    const next = Math.max(Date.now(), cur - days * DAY);
    await db.query('update subscriptions set expires_at = $2, updated_at = $3 where user_id = $1', [p.user_id, cur ? next : 0, Date.now()]);
    E.event('refund');
  }
  return { status: 200, body: { ok: true } };
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const action = url.searchParams.get('action') || '';
  try {
    if (!db.configured()) return sendJson(res, 503, { error: 'not_configured', message: 'The database is not set up.' });
    const me = req.headers.authorization ? await A.authed(req).catch(() => null) : null;
    if (!E.isAdmin(me)) return sendJson(res, 403, { error: 'forbidden', message: 'Not allowed.' });
    if (req.method === 'GET' && action === 'stats') {
      const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10) || 30));
      return sendJson(res, 200, await stats(days));
    }
    if (req.method === 'POST' && action === 'refund') {
      const body = await readJson(req);
      const r = await refund(String(body.reference || '').slice(0, 80));
      return sendJson(res, r.status, r.body);
    }
    if (req.method === 'GET' && action === 'find') { const r = await find(url.searchParams.get('q')); return sendJson(res, r.status, r.body); }
    if (req.method === 'POST' && action === 'grant') { const b = await readJson(req); const r = await grant(me, String(b.user_id || '').slice(0, 120), b.days, String(b.note || '').slice(0, 200)); return sendJson(res, r.status, r.body); }
    if (req.method === 'POST' && action === 'block') { const b = await readJson(req); const r = await block(me, String(b.user_id || '').slice(0, 120), !!b.blocked, b.reason); return sendJson(res, r.status, r.body); }
    if (action === 'notice' && req.method === 'GET') return sendJson(res, 200, await getNotice());
    if (action === 'notice' && req.method === 'POST') return sendJson(res, 200, await setNotice(me, await readJson(req)));
    if (req.method === 'GET' && action === 'log') {
      await db.ensure();
      const rows = await db.query('select at, admin, action, target, detail from admin_log order by at desc limit 40');
      return sendJson(res, 200, { log: rows.map((r) => ({ at: Number(r.at), admin: r.admin, action: r.action, target: r.target, detail: r.detail })) });
    }
    return sendJson(res, 400, { error: 'bad_request' });
  } catch (e) {
    console.error('[admin]', action, e && e.message);
    return sendJson(res, 500, { error: 'server', message: 'Something went wrong.' });
  }
};
