'use strict';
// Daily token budgets with atomic reservations. Abandoned reservations remain held until shortly after UTC day reset.
const crypto = require('crypto');
const db = require('./_db');
const num = (name, dflt) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return dflt;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
};
const perSubject = () => num('TOKEN_QUOTA_DAILY', 200000);
const siteCap = () => num('TOKEN_CAP_DAILY_GLOBAL', 0);
const GLOBAL = 'global';
const estimateTokens = (chars) => Math.ceil(Math.max(0, chars) / 4);
const today = (now) => new Date(now || Date.now()).toISOString().slice(0, 10);
const secondsToReset = (now) => {
  const d = new Date(now || Date.now());
  return Math.max(1, Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - d.getTime()) / 1000));
};
function subjectFor(me, ip) {
  if (me && me.uid) return 'u:' + crypto.createHash('sha256').update(String(me.uid)).digest('hex').slice(0, 24);
  return 'ip:' + crypto.createHash('sha256').update(String(ip || 'unknown')).digest('hex').slice(0, 24);
}
const mem = new Map();
const reservations = new Map();
const localRate = new Map();

function message(r) {
  const mins = Math.ceil(r.retryAfter / 60);
  const wait = mins >= 90 ? 'about ' + Math.round(mins / 60) + ' hours' : mins + ' minute(s)';
  return r.scope === 'site'
    ? 'GuidEd has reached its limit for today. It resets in ' + wait + '. Please try again then.'
    : 'You have used today\'s plan-writing allowance. It resets in ' + wait + '. Plans you have already made are still saved, and repeats of a plan you made before still work.';
}

// One SQL statement + transaction-scoped advisory locks makes the check and reservation atomic.
async function reserve(subject, tokens, opts) {
  const day = today();
  const limit = opts && opts.limit !== undefined ? opts.limit : perSubject();
  const cap = siteCap();
  const amount = Math.max(0, Math.ceil(Number(tokens) || 0));
  if (!limit && !cap) return { ok: true, reservation: null, remaining: Infinity, limit: 0 };
  const id = crypto.randomUUID();
  const now = Date.now();
  const d = new Date(now);
  const expires = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) + 10 * 60 * 1000;

  if (!db.configured()) {
    for (const [rid, held] of reservations) {
      if (held.expires <= now) {
        for (const scope of [held.subject, GLOBAL]) {
          const row = mem.get(scope + '|' + held.day);
          if (row) row.reserved = Math.max(0, (row.reserved || 0) - held.amount);
        }
        reservations.delete(rid);
      }
    }
    if (mem.size > 5000) for (const k of mem.keys()) if (!k.endsWith('|' + day)) mem.delete(k);
    const user = mem.get(subject + '|' + day) || { tokens: 0, reserved: 0 };
    const global = mem.get(GLOBAL + '|' + day) || { tokens: 0, reserved: 0 };
    if (cap && global.tokens + (global.reserved || 0) + amount > cap) return { ok: false, scope: 'site', limit: cap, remaining: 0, retryAfter: secondsToReset() };
    if (limit && user.tokens + (user.reserved || 0) + amount > limit) return { ok: false, scope: 'user', limit, remaining: Math.max(0, limit - user.tokens - (user.reserved || 0)), retryAfter: secondsToReset() };
    user.reserved = (user.reserved || 0) + amount;
    global.reserved = (global.reserved || 0) + amount;
    mem.set(subject + '|' + day, user);
    mem.set(GLOBAL + '|' + day, global);
    reservations.set(id, { subject, day, amount, expires });
    return { ok: true, reservation: id, remaining: limit ? Math.max(0, limit - user.tokens - user.reserved) : Infinity, limit };
  }

  await db.ensure();
  const rows = await db.query(
    `WITH locks AS MATERIALIZED (
       SELECT pg_advisory_xact_lock(hashtextextended('padi-quota:' || $1 || ':' || $2, 0)),
              pg_advisory_xact_lock(hashtextextended('padi-quota:global:' || $2, 0))
     ),
     totals AS MATERIALIZED (
       SELECT
         COALESCE((SELECT tokens FROM usage WHERE subject = $1 AND day = $2), 0)::bigint AS user_used,
         COALESCE((SELECT tokens FROM usage WHERE subject = 'global' AND day = $2), 0)::bigint AS global_used,
         COALESCE((SELECT SUM(tokens) FROM quota_reservations WHERE subject = $1 AND day = $2 AND status = 'active' AND expires_at > $5), 0)::bigint AS user_reserved,
         COALESCE((SELECT SUM(tokens) FROM quota_reservations WHERE subject = 'global' AND day = $2 AND status = 'active' AND expires_at > $5), 0)::bigint AS global_reserved
       FROM locks
     ),
     inserted AS (
       INSERT INTO quota_reservations (id, subject, day, tokens, expires_at, status)
       SELECT $3 || ':u', $1, $2, $4::bigint, $6::bigint, 'active' FROM totals
       WHERE ($7::bigint = 0 OR user_used + user_reserved + $4 <= $7)
         AND ($8::bigint = 0 OR global_used + global_reserved + $4 <= $8)
       UNION ALL
       SELECT $3 || ':g', 'global', $2, $4::bigint, $6::bigint, 'active' FROM totals
       WHERE ($7::bigint = 0 OR user_used + user_reserved + $4 <= $7)
         AND ($8::bigint = 0 OR global_used + global_reserved + $4 <= $8)
       RETURNING id
     )
     SELECT (SELECT COUNT(*) FROM inserted) AS inserted,
       user_used, global_used, user_reserved, global_reserved FROM totals`,
    [subject, day, id, amount, Date.now(), expires, limit, cap]
  );
  if (Math.random() < 0.02) {
    db.query('DELETE FROM quota_reservations WHERE expires_at < $1', [Date.now()]).catch(() => {});
  }
  const row = rows[0] || {};
  if (Number(row.inserted) !== 2) {
    const siteBlocked = !!cap && Number(row.global_used || 0) + Number(row.global_reserved || 0) + amount > cap;
    return { ok: false, scope: siteBlocked ? 'site' : 'user', limit: siteBlocked ? cap : limit,
      remaining: siteBlocked ? 0 : Math.max(0, limit - Number(row.user_used || 0) - Number(row.user_reserved || 0)),
      retryAfter: secondsToReset() };
  }
  return { ok: true, reservation: id,
    remaining: limit ? Math.max(0, limit - Number(row.user_used || 0) - Number(row.user_reserved || 0) - amount) : Infinity, limit };
}

async function settle(id, actualTokens) {
  const used = Math.max(0, Math.ceil(Number(actualTokens) || 0));
  if (!id) return;
  if (!db.configured()) {
    const r = reservations.get(id);
    if (!r) return;
    reservations.delete(id);
    for (const s of [r.subject, GLOBAL]) {
      const k = s + '|' + r.day;
      const row = mem.get(k) || { tokens: 0, reserved: 0, requests: 0 };
      row.reserved = Math.max(0, (row.reserved || 0) - r.amount);
      row.tokens = (row.tokens || 0) + used;
      row.requests = (row.requests || 0) + 1;
      mem.set(k, row);
    }
    return;
  }
  await db.ensure();
  await db.query(
    `WITH changed AS (
       UPDATE quota_reservations SET status = 'settled'
       WHERE id IN ($1 || ':u', $1 || ':g') AND status = 'active'
       RETURNING subject, day
     )
     INSERT INTO usage (subject, day, tokens, requests)
     SELECT subject, day, $2, 1 FROM changed GROUP BY subject, day
     ON CONFLICT (subject, day) DO UPDATE
       SET tokens = usage.tokens + EXCLUDED.tokens, requests = usage.requests + EXCLUDED.requests`,
    [id, used]
  );
}

async function release(id) {
  if (!id) return;
  if (!db.configured()) {
    const r = reservations.get(id);
    if (!r) return;
    reservations.delete(id);
    for (const s of [r.subject, GLOBAL]) {
      const row = mem.get(s + '|' + r.day);
      if (row) row.reserved = Math.max(0, (row.reserved || 0) - r.amount);
    }
    return;
  }
  await db.ensure();
  await db.query("UPDATE quota_reservations SET status = 'released' WHERE id IN ($1 || ':u', $1 || ':g') AND status = 'active'", [id]);
}

// Shared fixed-window limiter. A configured database error is intentionally allowed to throw.
async function rateLimitShared(key, limit, windowMs) {
  const now = Date.now();
  if (!db.configured()) {
    const recent = (localRate.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      localRate.set(key, recent);
      return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000)) };
    }
    recent.push(now);
    localRate.set(key, recent);
    if (localRate.size > 5000) for (const [k, v] of localRate) if (!v.some((t) => now - t < windowMs)) localRate.delete(k);
    return { ok: true };
  }
  await db.ensure();
  const hashedKey = 'rl:' + crypto.createHash('sha256').update(String(key)).digest('hex');
  const rows = await db.query(
    `INSERT INTO rate_limits (key, window_start, hits) VALUES ($1, $2, 1)
     ON CONFLICT (key) DO UPDATE SET
       window_start = CASE WHEN rate_limits.window_start <= $2 - $3 THEN $2 ELSE rate_limits.window_start END,
       hits = CASE WHEN rate_limits.window_start <= $2 - $3 THEN 1 ELSE LEAST(rate_limits.hits + 1, $4) END
     RETURNING hits, window_start`,
    [hashedKey, now, windowMs, limit + 1]
  );
  if (Math.random() < 0.02) {
    db.query('DELETE FROM rate_limits WHERE window_start < $1', [now - 24 * 60 * 60 * 1000]).catch(() => {});
  }
  const row = rows[0];
  const retryAfter = Math.max(1, Math.ceil((Number(row.window_start) + windowMs - now) / 1000));
  return { ok: Number(row.hits) <= limit, retryAfter };
}

function clearMemory() { mem.clear(); reservations.clear(); localRate.clear(); }
module.exports = { estimateTokens, subjectFor, reserve, settle, release, rateLimitShared, message, clearMemory, perSubject, siteCap, today };
