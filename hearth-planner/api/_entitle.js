'use strict';
// What each kind of visitor may do. Tiers are described by teacher outcomes, not by tokens:
//   guest  Not signed in. A short taster of Lesson 1 only. Repeats of a taster that anyone has already seen cost nothing.
//   free   Signed in. A few full plans a week for one class. Word files carry a small GuidEd footer.
//   pro    Paid. No weekly plan limit, every class, clean Word files.
// A daily token budget still sits underneath every tier as a spending guard (see _quota.js).
const db = require('./_db');
const A = require('./_auth');
const Quota = require('./_quota');

const num = (name, dflt) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return dflt;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
};
const cfg = () => ({
  freePlansWeekly: num('FREE_PLANS_WEEKLY', 3),          // 0 = unlimited
  freeClasses: num('FREE_CLASSES', 1),                    // 0 = every class
  guestPreviewsDaily: num('GUEST_PREVIEWS_DAILY', 2),     // 0 = unlimited
  proTokenDaily: num('PRO_TOKEN_QUOTA_DAILY', 600000),
  previewMaxTokens: Math.max(500, num('PREVIEW_MAX_TOKENS', 2200)),
  currency: process.env.PRO_CURRENCY || 'GHS',
  plans: {
    monthly: { label: 'Monthly', amount: num('PRO_PRICE_MONTHLY', 40), days: num('PRO_DAYS_MONTHLY', 30) },
    term: { label: 'Full term', amount: num('PRO_PRICE_TERM', 100), days: num('PRO_DAYS_TERM', 120) },
  },
});

// Tiers need accounts, and accounts need the database. Without them everyone keeps full access, as before.
const enabled = () => process.env.TIERS !== 'off' && A.syncConfigured();
const proEmails = () => String(process.env.PRO_EMAILS || '').toLowerCase().split(/[\s,;]+/).filter(Boolean);

const DAY = 86400000;
function weekStart(now) {                                  // Monday 00:00 UTC
  const d = new Date(now || Date.now());
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back));
}
const weekKey = (now) => weekStart(now).toISOString().slice(0, 10);
const nextWeek = (now) => weekStart(now).getTime() + 7 * DAY;
const dayKey = (now) => new Date(now || Date.now()).toISOString().slice(0, 10);
const nextDay = (now) => { const d = new Date(now || Date.now()); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); };

async function expiry(uid) {
  await db.ensure();
  const rows = await db.query('select expires_at from subscriptions where user_id = $1', [uid]);
  return rows.length ? Number(rows[0].expires_at) : 0;
}

// Works out who is asking and which tier applies.
async function resolve(me, ip) {
  const subject = Quota.subjectFor(me, ip);
  if (!me || !me.uid) return { tier: 'guest', subject };
  let expiresAt = 0;
  try { expiresAt = await expiry(me.uid); } catch (e) { console.error('[entitle] expiry lookup failed', e && e.message); }
  const vip = !!me.email && proEmails().includes(me.email.toLowerCase());
  return { tier: vip || expiresAt > Date.now() ? 'pro' : 'free', subject, uid: me.uid, email: me.email || '', expiresAt, vip };
}

async function log(subject, period) {
  await db.ensure();
  const rows = await db.query('select cls, n from plan_log where subject = $1 and period = $2', [subject, period]);
  return rows.map((r) => ({ cls: r.cls, n: Number(r.n) }));
}
async function bump(subject, period, cls) {
  await db.ensure();
  await db.query('insert into plan_log (subject, period, cls, n) values ($1, $2, $3, 1) on conflict (subject, period, cls) do update set n = plan_log.n + 1', [subject, period, cls]);
  if (Math.random() < 0.02) db.query("delete from plan_log where period < to_char((now() at time zone 'utc') - interval '60 days', 'YYYY-MM-DD')").catch(() => {});
}

// Signed-in teachers on the free tier: may this request start a new plan?
async function checkFree(ent, cls) {
  const c = cfg();
  const rows = await log(ent.subject, weekKey());
  const used = rows.reduce((n, r) => n + r.n, 0);
  const classes = rows.map((r) => r.cls);
  if (c.freePlansWeekly && used >= c.freePlansWeekly) return { ok: false, reason: 'plans', used, limit: c.freePlansWeekly, resetsAt: nextWeek() };
  if (c.freeClasses && !classes.includes(cls) && classes.length >= c.freeClasses) return { ok: false, reason: 'classes', classes, limit: c.freeClasses, resetsAt: nextWeek() };
  return { ok: true, used, limit: c.freePlansWeekly };
}
const countFree = (ent, cls) => bump(ent.subject, weekKey(), cls);

// Guests: previews that cost tokens today (previews served from the shared cache are free and not counted).
async function guestUsed(ent) {
  const rows = await log(ent.subject, dayKey());
  return rows.reduce((n, r) => n + r.n, 0);
}
async function checkGuest(ent) {
  const limit = cfg().guestPreviewsDaily;
  const used = await guestUsed(ent);
  return limit && used >= limit ? { ok: false, used, limit, resetsAt: nextDay() } : { ok: true, used, limit };
}
const countGuest = (ent) => bump(ent.subject, dayKey(), '*');

function message(kind, r) {
  const c = cfg();
  if (kind === 'guest') return 'You have used your ' + r.limit + ' free previews for today. Create a free account to write full plans, or come back tomorrow.';
  if (r.reason === 'classes') return 'The free plan covers ' + (c.freeClasses === 1 ? 'one class' : c.freeClasses + ' classes') + ' a week (' + r.classes.join(', ') + '). Upgrade to Pro to plan for every class.';
  return 'You have written your ' + r.limit + ' free plans for this week. They come back on Monday, or upgrade to Pro for unlimited plans.';
}

// Everything the screens need to show the tier, what is left, and the prices.
async function status(me, ip) {
  const c = cfg();
  const ent = await resolve(me, ip);
  const out = {
    tier: ent.tier, email: ent.email || '',
    limits: { freePlansWeekly: c.freePlansWeekly, freeClasses: c.freeClasses, guestPreviewsDaily: c.guestPreviewsDaily },
    pricing: { currency: c.currency, monthly: c.plans.monthly, term: c.plans.term, checkout: !!process.env.PAYSTACK_SECRET_KEY },
  };
  try {
    if (ent.tier === 'guest') { const g = await checkGuest(ent); out.guest = { used: g.used, limit: g.limit, resetsAt: nextDay() }; }
    else if (ent.tier === 'free') {
      const rows = await log(ent.subject, weekKey());
      out.free = { used: rows.reduce((n, r) => n + r.n, 0), limit: c.freePlansWeekly, classes: rows.map((r) => r.cls), classLimit: c.freeClasses, resetsAt: nextWeek() };
    } else out.pro = { expiresAt: ent.vip && !ent.expiresAt ? 0 : ent.expiresAt, vip: ent.vip };
  } catch (e) { console.error('[entitle] status failed', e && e.message); }
  return out;
}

module.exports = { cfg, enabled, resolve, checkFree, countFree, checkGuest, countGuest, message, status, weekKey, expiry };
