'use strict';
// Daily token quotas. Each teacher (signed in) or network address (not signed in) has a daily token budget,
// and an optional site-wide daily cap acts as a spending brake. The day runs from 00:00 to 24:00 UTC.
//
// Token counts are estimates (about 4 characters per token) because the streaming providers report usage in
// different ways. They are good enough for a budget guard, and they err on the side of counting a little high.
//
// Stored in Neon when DATABASE_URL is set, so the count is shared by every serverless instance. Without a
// database it is kept in this instance's memory, which slows heavy use but is not a hard limit.
const crypto = require('crypto');
const db = require('./_db');

const num = (name, dflt) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return dflt;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
};
// 0 switches a limit off.
const perSubject = () => num('TOKEN_QUOTA_DAILY', 200000);
const siteCap = () => num('TOKEN_CAP_DAILY_GLOBAL', 0);

const GLOBAL = 'global';
const estimateTokens = (chars) => Math.ceil(Math.max(0, chars) / 4);
const today = (now) => new Date(now || Date.now()).toISOString().slice(0, 10);
const secondsToReset = (now) => {
  const d = new Date(now || Date.now());
  return Math.max(1, Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - d.getTime()) / 1000));
};

// Who the budget belongs to. Network addresses are hashed so the table never holds a raw address.
function subjectFor(me, ip) {
  if (me && me.uid) return 'u:' + crypto.createHash('sha256').update(String(me.uid)).digest('hex').slice(0, 24);
  return 'ip:' + crypto.createHash('sha256').update(String(ip || 'unknown')).digest('hex').slice(0, 24);
}

const mem = new Map();   // "subject|day" -> { tokens, requests }
async function read(subject, day) {
  if (!db.configured()) return (mem.get(subject + '|' + day) || { tokens: 0 }).tokens;
  await db.ensure();
  const rows = await db.query('select tokens from usage where subject = $1 and day = $2', [subject, day]);
  return rows.length ? Number(rows[0].tokens) : 0;
}

// Checks the budget before a generation. estimate is the expected input size in tokens.
// Returns { ok, remaining, limit, retryAfter, scope } and never throws (a failure to check lets the request through).
async function check(subject, estimate) {
  const day = today();
  const limit = perSubject(), cap = siteCap();
  if (!limit && !cap) return { ok: true, remaining: Infinity, limit: 0 };
  try {
    if (cap) {
      const all = await read(GLOBAL, day);
      if (all + estimate > cap) return { ok: false, scope: 'site', limit: cap, remaining: 0, retryAfter: secondsToReset() };
    }
    if (limit) {
      const used = await read(subject, day);
      if (used + estimate > limit) return { ok: false, scope: 'user', limit, remaining: Math.max(0, limit - used), retryAfter: secondsToReset() };
      return { ok: true, limit, remaining: limit - used };
    }
    return { ok: true, remaining: Infinity, limit: 0 };
  } catch (e) {
    console.error('[quota] check failed', e && e.message);
    return { ok: true, remaining: Infinity, limit: 0 };
  }
}

// Adds what a generation used. Called once the answer has finished, or stopped part way.
async function record(subject, tokens) {
  if (!tokens || tokens < 1 || (!perSubject() && !siteCap())) return;
  const day = today();
  try {
    if (!db.configured()) {
      for (const s of [subject, GLOBAL]) {
        const k = s + '|' + day, row = mem.get(k) || { tokens: 0, requests: 0 };
        row.tokens += tokens; row.requests += 1; mem.set(k, row);
      }
      if (mem.size > 5000) for (const k of mem.keys()) if (!k.endsWith('|' + day)) mem.delete(k);
      return;
    }
    await db.ensure();
    const sql = 'insert into usage (subject, day, tokens, requests) values ($1, $2, $3, 1) on conflict (subject, day) do update set tokens = usage.tokens + excluded.tokens, requests = usage.requests + 1';
    await db.query(sql, [subject, day, tokens]);
    await db.query(sql, [GLOBAL, day, tokens]);
    if (Math.random() < 0.02) db.query("delete from usage where day < to_char((now() at time zone 'utc') - interval '35 days', 'YYYY-MM-DD')").catch(() => {});
  } catch (e) {
    console.error('[quota] record failed', e && e.message);
  }
}

function clearMemory() { mem.clear(); }

function message(r) {
  const mins = Math.ceil(r.retryAfter / 60);
  const wait = mins >= 90 ? 'about ' + Math.round(mins / 60) + ' hours' : mins + ' minute(s)';
  return r.scope === 'site'
    ? 'Padi-T has reached its limit for today. It resets in ' + wait + '. Please try again then.'
    : 'You have used today\'s plan-writing allowance. It resets in ' + wait + '. Plans you have already made are still saved, and repeats of a plan you made before still work.';
}

module.exports = { estimateTokens, subjectFor, check, record, message, clearMemory, perSubject, siteCap, today };
