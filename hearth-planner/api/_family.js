'use strict';
// Sunday family reminders: one short email per parent per week, with a one-click unsubscribe.
const crypto = require('crypto');
const db = require('./_db');

const secret = () => process.env.AUTH_SECRET || process.env.CRON_SECRET || '';
// kind 'family' is the parent reminder (the original link format, still valid); 'teacher' is the teacher's weekly summary.
const unsubToken = (uid, kind) => crypto.createHmac('sha256', secret()).update((kind === 'teacher' ? 'summary-unsub:' : 'family-unsub:') + uid).digest('hex');
function unsubUrl(uid, kind) {
  const site = require('./_mail').SITE();
  return site + '/api/billing?action=unsubscribe&u=' + encodeURIComponent(uid) + '&t=' + unsubToken(uid, kind) + (kind === 'teacher' ? '&k=teacher' : '');
}
function validUnsub(uid, t, kind) {
  if (!secret() || !uid || !t) return false;
  const want = Buffer.from(unsubToken(uid, kind)), got = Buffer.from(String(t));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
async function unsubscribe(uid, t, kind) {
  if (!validUnsub(uid, t, kind)) return false;
  await db.ensure();
  if (kind === 'teacher') await setTeacherSummary(uid, false);
  else await db.query("update account_profiles set data = jsonb_set(data, '{familyReminders}', 'false'::jsonb), updated_at = $2 where user_id = $1", [uid, Date.now()]);
  return true;
}

// The teacher's weekly summary is on by default; an opt-out row switches it off.
async function teacherSummaryOn(uid) {
  await db.ensure();
  const rows = await db.query("select 1 as x from mail_optout where user_id = $1 and kind = 'teacher'", [uid]);
  return !rows.length;
}
async function setTeacherSummary(uid, on) {
  await db.ensure();
  if (on) await db.query("delete from mail_optout where user_id = $1 and kind = 'teacher'", [uid]);
  else await db.query("insert into mail_optout (user_id, kind, at) values ($1, 'teacher', $2) on conflict (user_id, kind) do nothing", [uid, Date.now()]);
}

// ISO-ish week id (Monday based, UTC) used to send at most once a week per parent.
function weekId(now) {
  const d = new Date(now); d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const weekNumber = (now) => Math.floor(now / (7 * 86400000));

// Rotates through a child's subjects so the suggestion changes every week.
function suggest(child, now) {
  const subs = child.subjects || [];
  return subs[weekNumber(now) % subs.length];
}

async function emailOf(userId, known) {
  if (known) return known;
  try { const [a] = await db.query('select email from accounts where user_id = $1', [userId]); if (a && a.email) return a.email; } catch (e) { /* ignore */ }
  try { const [u] = await db.query('select email from neon_auth."user" where id = $1', [userId]); return u && u.email; } catch (e) { return ''; }   // no Neon Auth schema
}

async function remindFamilies(now) {
  now = now || Date.now();
  if (!process.env.SMTP_URL) return { sent: 0, skipped: 'no mail server (SMTP_URL) is set up' };
  await db.ensure();
  const A = require('./_auth');
  const mail = require('./_mail');
  const wk = weekId(now);
  const rows = await db.query(
    "select p.user_id, p.data, (select a.email from accounts a where a.user_id = p.user_id) as email from account_profiles p where p.data->'roles' ? 'parent' and jsonb_array_length(coalesce(p.data->'children','[]'::jsonb)) > 0 and coalesce(p.data->>'familyReminders','true') <> 'false'", []);
  let sent = 0;
  for (const r of rows) {
    const email = await emailOf(r.user_id, r.email);
    if (!email) continue;
    // Claim this week first so a retry or a second cron run never sends twice.
    const claim = await db.query("insert into reminder_log (user_id, kind, sent_on) values ($1, 'family', $2) on conflict do nothing returning user_id", [r.user_id, wk]);
    if (!claim.length) continue;
    try {
      const doneRows = await db.query("select data from parent_learning where user_id = $1 and deleted = false and (data->>'completedAt') is not null and (data->>'completedAt')::bigint >= $2", [r.user_id, now - 7 * 86400000]);
      const byChild = {};
      for (const d of doneRows) { const x = d && d.data; if (x && x.childId) (byChild[x.childId] = byChild[x.childId] || []).push({ subject: x.subject || '', topic: x.topic || '' }); }
      const children = (r.data.children || []).map((c) => ({ name: c.name, class: c.class, minutes: c.minutes, subject: suggest(c, now), done: byChild[c.id] || [] }));
      const m = mail.familyWeekly({ children, done: doneRows.length, unsubscribeUrl: unsubUrl(r.user_id) });
      if (await A.sendNotice(email, m.subject, m.text, m.html)) sent++;
      else await db.query("delete from reminder_log where user_id = $1 and kind = 'family' and sent_on = $2", [r.user_id, wk]);
    } catch (e) {
      console.error('[family] reminder failed', e && e.message);
      await db.query("delete from reminder_log where user_id = $1 and kind = 'family' and sent_on = $2", [r.user_id, wk]).catch(() => {});
    }
  }
  return { sent, due: rows.length };
}

// Sunday summary for teachers: the plans made in the last 7 days and the next week's topic for the class they plan most.
async function summariseTeachers(now) {
  now = now || Date.now();
  if (!process.env.SMTP_URL) return { sent: 0, skipped: 'no mail server (SMTP_URL) is set up' };
  await db.ensure();
  const A = require('./_auth'), mail = require('./_mail'), Schemes = require('./_schemes');
  const wk = weekId(now);
  const rows = await db.query('select user_id, data from plans where deleted = false and updated_at >= $1 limit 20000', [now - 7 * 86400000]);
  const off = new Set((await db.query("select user_id from mail_optout where kind = 'teacher'", [])).map((x) => x.user_id));
  const byUser = new Map();
  for (const r of rows) { if (off.has(r.user_id)) continue; if (!byUser.has(r.user_id)) byUser.set(r.user_id, []); byUser.get(r.user_id).push(r.data || {}); }
  let sent = 0;
  for (const [uid, plans] of byUser) {
    const email = await emailOf(uid);
    if (!email) continue;
    const claim = await db.query("insert into reminder_log (user_id, kind, sent_on) values ($1, 'teacher', $2) on conflict do nothing returning user_id", [uid, wk]);
    if (!claim.length) continue;
    try {
      const seen = new Map();   // one line per class, subject and week
      for (const d of plans) {
        const q = d.params || {}; if (!q.cls || !q.subject) continue;
        const k = [q.cls, q.subject, q.term || '', q.week || ''].join('|');
        if (!seen.has(k)) seen.set(k, q);
      }
      const list = [...seen.values()];
      if (!list.length) { await db.query("delete from reminder_log where user_id = $1 and kind = 'teacher' and sent_on = $2", [uid, wk]); continue; }
      const items = list.slice(0, 6).map((q) => q.cls + ' · ' + q.subject + (q.week ? ', Week ' + q.week : '')).concat(list.length > 6 ? ['and ' + (list.length - 6) + ' more'] : []);
      // The class and subject planned most often: suggest its next scheme week.
      const tally = new Map();
      for (const q of list) { const k = q.cls + '|' + q.subject; const t = tally.get(k) || { q, n: 0, top: 0 }; t.n++; t.top = Math.max(t.top, Number(q.week) || 0); if ((Number(q.week) || 0) >= (Number(t.q.week) || 0)) t.q = q; tally.set(k, t); }
      const best = [...tally.values()].sort((x, y) => y.n - x.n)[0];
      let next = '';
      if (best && best.top) {
        const weeks = Schemes.weeksIn(best.q.cls), nw = Math.min(best.top + 1, weeks), term = Number(best.q.term) || 1;
        const row = nw > best.top ? Schemes.lookup(best.q.subject, best.q.cls, term, nw) : null;
        if (row) next = best.q.cls + ' ' + best.q.subject + ', Week ' + nw + ': ' + (row.type === 'teach' ? (row.substrand || row.strand || 'the next topic') : row.type === 'exam' ? 'examination week' : 'revision week');
      }
      const m = mail.teacherWeekly({ plans: plans.length, items, next, unsubscribeUrl: unsubUrl(uid, 'teacher') });
      if (await A.sendNotice(email, m.subject, m.text, m.html)) sent++;
      else await db.query("delete from reminder_log where user_id = $1 and kind = 'teacher' and sent_on = $2", [uid, wk]);
    } catch (e) {
      console.error('[summary] teacher summary failed', e && e.message);
      await db.query("delete from reminder_log where user_id = $1 and kind = 'teacher' and sent_on = $2", [uid, wk]).catch(() => {});
    }
  }
  return { sent, due: byUser.size };
}

module.exports = { summariseTeachers, teacherSummaryOn, setTeacherSummary, remindFamilies, unsubscribe, unsubUrl, validUnsub, suggest, weekId };
