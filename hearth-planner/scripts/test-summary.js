'use strict';
// Weekly summaries: parents see what each child finished; teachers see their plans and next week's topic. Once a week, opt-out, signed links.
const assert = require('node:assert/strict');
const squash = (t) => t.replace(/\s+/g, ' ').trim();
const NOW = Date.UTC(2026, 10, 15, 17);   // a Sunday
const logged = new Set(), optout = new Set();
const emails = { p1: 'parent@x.test', t1: 'teacher@x.test', t2: 'quiet@x.test', t3: 'off@x.test' };
const profiles = [{ user_id: 'p1', data: { roles: ['parent'], children: [{ id: 'c1', name: 'Ama', class: 'Basic 4', minutes: 30, subjects: ['Mathematics', 'Science'] }, { id: 'c2', name: 'Kofi', class: 'KG 2', minutes: 20, subjects: ['Integrated Learning'] }] } }];
const plan = (cls, subject, term, week) => ({ params: { cls, subject, term, week } });
const plans = [
  { user_id: 't1', data: plan('Basic 5', 'Mathematics', 1, 3) }, { user_id: 't1', data: plan('Basic 5', 'Mathematics', 1, 4) },
  { user_id: 't1', data: plan('Basic 6', 'Science', 1, 2) },
  { user_id: 't3', data: plan('Basic 7', 'Mathematics', 1, 5) },
];
global.__PADI_SQL__ = { query: async (text, p) => {
  const t = squash(text);
  if (/from account_profiles p where/.test(t)) return profiles.map((x) => ({ user_id: x.user_id, data: x.data, email: emails[x.user_id] }));
  if (/^insert into reminder_log/.test(t)) { const k = p[0] + '|' + p[1] + '|' + p[2]; if (logged.has(k)) return []; logged.add(k); return [{ user_id: p[0] }]; }
  if (/^delete from reminder_log/.test(t)) { logged.delete(p[0] + '|' + (/'teacher'/.test(t) ? 'teacher' : 'family') + '|' + p[1]); return []; }
  if (/^select data from parent_learning/.test(t)) return [
    { data: { childId: 'c1', subject: 'Mathematics', topic: 'Fractions' } }, { data: { childId: 'c1', subject: 'Science', topic: 'Plants' } },
    { data: { childId: 'zz', subject: 'Other', topic: 'Not my child' } }];
  if (/^select user_id, data from plans/.test(t)) return plans;
  if (/^select user_id from mail_optout/.test(t)) return [...optout].map((u) => ({ user_id: u }));
  if (/^select 1 as x from mail_optout/.test(t)) return optout.has(p[0]) ? [{ x: 1 }] : [];
  if (/^insert into mail_optout/.test(t)) { optout.add(p[0]); return []; }
  if (/^delete from mail_optout/.test(t)) { optout.delete(p[0]); return []; }
  if (/^select email from accounts/.test(t)) return emails[p[0]] ? [{ email: emails[p[0]] }] : [];
  return [];
} };
Object.assign(process.env, { DATABASE_URL: 'test', SMTP_URL: 'json', AUTH_SECRET: 'test-secret-test-secret-test-secret', CRON_SECRET: 'cron-secret' });
const F = require('../api/_family');
const A = require('../api/_auth');

(async () => {
  const sent = [];
  A.sendNotice = async (to, subject, text, html) => { sent.push({ to, subject, text, html }); return true; };

  // Parents: each child's finished activities this week appear, other families' records do not.
  let r = await F.remindFamilies(NOW);
  assert.equal(r.sent, 1);
  assert.match(sent[0].text, /Ama: Finished Fractions \(Mathematics\) and Plants \(Science\)\./);
  assert.match(sent[0].text, /Kofi: Nothing finished yet\. Next: Integrated Learning \(KG 2/);
  assert.doesNotMatch(sent[0].text, /Not my child/);
  assert.match(sent[0].text, /finished 3 home activities|finished 3 home/i);

  // Teachers: one email each, with this week's plans and the next scheme week; opted-out teachers are skipped.
  sent.length = 0; optout.add('t3');
  r = await F.summariseTeachers(NOW);
  assert.equal(r.sent, 1, 'only t1: t2 has no plans, t3 opted out'); assert.equal(sent[0].to, 'teacher@x.test');
  assert.match(sent[0].subject, /teaching week/i);
  assert.match(sent[0].text, /3 lesson plans/); assert.match(sent[0].text, /Basic 5 · Mathematics, Week 3/); assert.match(sent[0].text, /Basic 6 · Science, Week 2/);
  assert.match(sent[0].text, /Next week: Basic 5 Mathematics, Week 5: /, 'next week follows the class planned most');
  assert.match(sent[0].html, /k=teacher/); assert.match(sent[0].text, /Stop these emails/);

  // Once a week; a failed send releases the week; the next week sends again.
  assert.equal((await F.summariseTeachers(NOW + 3600000)).sent, 0);
  assert.equal((await F.summariseTeachers(NOW + 7 * 86400000)).sent, 1);
  logged.clear(); A.sendNotice = async () => false;
  assert.equal((await F.summariseTeachers(NOW)).sent, 0); assert.equal([...logged].filter((k) => k.includes('teacher')).length, 0);

  // Signed links: teacher and family tokens are separate, and a forged link does nothing.
  const url = new URL(F.unsubUrl('t3', 'teacher')); const u = url.searchParams.get('u'), t = url.searchParams.get('t');
  assert.equal(url.searchParams.get('k'), 'teacher');
  assert.equal(F.validUnsub(u, t, 'teacher'), true); assert.equal(F.validUnsub(u, t, 'family'), false, 'a teacher link cannot switch off the family email');
  assert.equal(F.validUnsub('t1', t, 'teacher'), false);
  optout.clear();
  assert.equal(await F.unsubscribe('t1', 'bad', 'teacher'), false); assert.equal(optout.has('t1'), false);
  const good = new URL(F.unsubUrl('t1', 'teacher'));
  assert.equal(await F.unsubscribe('t1', good.searchParams.get('t'), 'teacher'), true); assert.equal(optout.has('t1'), true);
  assert.equal(await F.teacherSummaryOn('t1'), false);
  await F.setTeacherSummary('t1', true); assert.equal(await F.teacherSummaryOn('t1'), true);

  // The cron endpoint runs both and needs the bearer secret.
  const billing = require('../api/billing');
  const call = async (auth) => { const out = {}; await billing({ method: 'GET', url: '/api/billing?action=family-reminders', headers: auth ? { authorization: auth, host: 'x' } : { host: 'x' } }, { setHeader() {}, end(b) { out.body = b; }, statusCode: 200 }); return out; };
  A.sendNotice = async () => true; logged.clear();
  const bad = await call('Bearer nope'); assert.match(String(bad.body), /unauthorized/);
  const ok = await call('Bearer cron-secret'); const j = JSON.parse(ok.body); assert.ok('families' in j && 'teachers' in j);
  process.stdout.write('Weekly summary tests passed.\n');
})().catch((e) => { console.error(e); process.exit(1); });
