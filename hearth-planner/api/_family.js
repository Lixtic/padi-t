'use strict';
// Sunday family reminders: one short email per parent per week, with a one-click unsubscribe.
const crypto = require('crypto');
const db = require('./_db');

const secret = () => process.env.AUTH_SECRET || process.env.CRON_SECRET || '';
const unsubToken = (uid) => crypto.createHmac('sha256', secret()).update('family-unsub:' + uid).digest('hex');
function unsubUrl(uid) {
  const site = require('./_mail').SITE();
  return site + '/api/billing?action=unsubscribe&u=' + encodeURIComponent(uid) + '&t=' + unsubToken(uid);
}
function validUnsub(uid, t) {
  if (!secret() || !uid || !t) return false;
  const want = Buffer.from(unsubToken(uid)), got = Buffer.from(String(t));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
async function unsubscribe(uid, t) {
  if (!validUnsub(uid, t)) return false;
  await db.ensure();
  await db.query("update account_profiles set data = jsonb_set(data, '{familyReminders}', 'false'::jsonb), updated_at = $2 where user_id = $1", [uid, Date.now()]);
  return true;
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
    let email = r.email;
    if (!email) {
      try { const [u] = await db.query('select email from neon_auth."user" where id = $1', [r.user_id]); email = u && u.email; } catch (e) { /* no Neon Auth schema */ }
    }
    if (!email) continue;
    // Claim this week first so a retry or a second cron run never sends twice.
    const claim = await db.query("insert into reminder_log (user_id, kind, sent_on) values ($1, 'family', $2) on conflict do nothing returning user_id", [r.user_id, wk]);
    if (!claim.length) continue;
    try {
      const done = (await db.query("select count(*)::int as n from parent_learning where user_id = $1 and deleted = false and (data->>'completedAt') is not null and (data->>'completedAt')::bigint >= $2", [r.user_id, now - 7 * 86400000]))[0];
      const children = (r.data.children || []).map((c) => ({ name: c.name, class: c.class, minutes: c.minutes, subject: suggest(c, now) }));
      const m = mail.familyWeekly({ children, done: done ? done.n : 0, unsubscribeUrl: unsubUrl(r.user_id) });
      if (await A.sendNotice(email, m.subject, m.text, m.html)) sent++;
      else await db.query("delete from reminder_log where user_id = $1 and kind = 'family' and sent_on = $2", [r.user_id, wk]);
    } catch (e) {
      console.error('[family] reminder failed', e && e.message);
      await db.query("delete from reminder_log where user_id = $1 and kind = 'family' and sent_on = $2", [r.user_id, wk]).catch(() => {});
    }
  }
  return { sent, due: rows.length };
}

module.exports = { remindFamilies, unsubscribe, unsubUrl, validUnsub, suggest, weekId };
