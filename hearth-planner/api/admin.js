'use strict';
// Owner-only usage numbers and refunds (anyone listed in ADMIN_EMAILS).
//   GET  /api/admin?action=stats&days=30   Sign-ups, previews, plans, limits hit, Pro, money.
//   POST /api/admin?action=refund          { reference }  Refunds one payment through Paystack and takes its days off.
const { sendJson, readJson } = require('./_lib');
const A = require('./_auth');
const db = require('./_db');
const E = require('./_entitle');
const billing = require('./billing');

const DAY = 86400000;
const money = (pesewas) => Math.round(Number(pesewas || 0)) / 100;

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
    return sendJson(res, 400, { error: 'bad_request' });
  } catch (e) {
    console.error('[admin]', action, e && e.message);
    return sendJson(res, 500, { error: 'server', message: 'Something went wrong.' });
  }
};
