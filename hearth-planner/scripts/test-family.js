'use strict';
// Family features: the free home-activity allowance, the Sunday reminder (once a week, opt-out, signed unsubscribe) and its cron auth.
const assert = require('node:assert/strict');
const squash = (t) => t.replace(/\s+/g, ' ').trim();
const planLog = new Map();
const logged = new Set();
let profiles = [];
const emails = { u1: 'a@x.test', u2: 'b@x.test', u3: 'c@x.test' };
global.__PADI_SQL__ = { query: async (text, p) => {
  const t = squash(text);
  if (/^select cls, n from plan_log/.test(t)) return [...planLog].filter(([k]) => k.startsWith(p[0] + '|' + p[1] + '|')).map(([k, n]) => ({ cls: k.split('|')[2], n }));
  if (/^insert into plan_log/.test(t)) { const k = p.join('|').replace(/\|[^|]*$/, ''); planLog.set(p[0] + '|' + p[1] + '|' + p[2], (planLog.get(p[0] + '|' + p[1] + '|' + p[2]) || 0) + 1); return []; }
  if (/from account_profiles p where/.test(t)) return profiles.filter((x) => x.data.familyReminders !== false).map((x) => ({ user_id: x.user_id, data: x.data, email: emails[x.user_id] }));
  if (/^insert into reminder_log/.test(t)) { const k = p[0] + '|' + p[1]; if (logged.has(k)) return []; logged.add(k); return [{ user_id: p[0] }]; }
  if (/^delete from reminder_log/.test(t)) { logged.delete(p[0] + '|' + p[1]); return []; }
  if (/from parent_learning/.test(t)) return [{ n: 2 }];
  if (/^update account_profiles set data = jsonb_set/.test(t)) { const x = profiles.find((q) => q.user_id === p[0]); if (x) x.data.familyReminders = false; return []; }
  return [];
} };
Object.assign(process.env, { DATABASE_URL: 'test', SMTP_URL: 'json', AUTH_SECRET: 'test-secret-test-secret-test-secret', CRON_SECRET: 'cron-secret', FREE_PARENT_WEEKLY: '5' });
const E = require('../api/_entitle');
const F = require('../api/_family');
const A = require('../api/_auth');

(async () => {
  // Allowance: 5 per family per week, shared across children, counted separately from teacher plans.
  const ent = { subject: 'user:u1' };
  for (let i = 0; i < 5; i++) { assert.equal((await E.checkFreeParent(ent)).ok, true, 'allowed #' + (i + 1)); await E.countFreeParent(ent); }
  const blockedRes = await E.checkFreeParent(ent);
  assert.equal(blockedRes.ok, false); assert.equal(blockedRes.reason, 'parent'); assert.equal(blockedRes.limit, 5);
  assert.match(E.message('free', blockedRes), /free home activities/);
  assert.equal((await E.checkFreeParent({ subject: 'user:u2' })).ok, true, 'another family is unaffected');
  process.env.FREE_PARENT_WEEKLY = '0';
  assert.equal((await E.checkFreeParent(ent)).ok, true, '0 means unlimited');
  process.env.FREE_PARENT_WEEKLY = '5';

  // Reminders: sent once per week per parent, never to opted-out parents.
  const kid = (name) => ({ name, class: 'Basic 5', minutes: 30, subjects: ['Mathematics', 'English Language'] });
  profiles = [
    { user_id: 'u1', data: { roles: ['parent'], children: [kid('Ama')] } },
    { user_id: 'u2', data: { roles: ['parent'], children: [kid('Kofi')], familyReminders: false } },
    { user_id: 'u3', data: { roles: ['parent'], children: [kid('Esi')] } },
  ];
  const sent = [];
  A.sendNotice = async (to, subject, text, html) => { sent.push({ to, subject, text, html }); return true; };
  const now = Date.UTC(2026, 10, 15, 17);   // a Sunday
  let r = await F.remindFamilies(now);
  assert.equal(r.sent, 2); assert.deepEqual(sent.map((s) => s.to).sort(), ['a@x.test', 'c@x.test']);
  assert.match(sent[0].text, /unsubscribe|Stop these emails/i); assert.match(sent[0].html, /action=unsubscribe/);
  r = await F.remindFamilies(now + 3600000);
  assert.equal(r.sent, 0, 'a second run the same week sends nothing');
  r = await F.remindFamilies(now + 7 * 86400000);
  assert.equal(r.sent, 2, 'the next week sends again');
  assert.notEqual(F.suggest(kid('x'), now), F.suggest(kid('x'), now + 7 * 86400000), 'suggestion rotates');
  // A failed send releases the week so the next run can retry.
  logged.clear(); sent.length = 0; A.sendNotice = async () => false;
  assert.equal((await F.remindFamilies(now)).sent, 0); assert.equal(logged.size, 0);

  // Unsubscribe link: signed, one click, and forged links do nothing.
  const url = new URL(F.unsubUrl('u3'));
  const u = url.searchParams.get('u'), t = url.searchParams.get('t');
  assert.equal(F.validUnsub(u, t), true);
  assert.equal(F.validUnsub('u1', t), false, 'token is bound to the user');
  assert.equal(F.validUnsub(u, t.slice(0, -1) + (t.endsWith('a') ? 'b' : 'a')), false);
  assert.equal(F.validUnsub(u, ''), false);
  assert.equal(await F.unsubscribe('u1', 'bad'), false); assert.notEqual(profiles[0].data.familyReminders, false);
  assert.equal(await F.unsubscribe(u, t), true); assert.equal(profiles[2].data.familyReminders, false);

  // Cron endpoint needs the bearer secret; unsubscribe page works without sign-in.
  const billing = require('../api/billing');
  const run = async (action, headers, query = '') => { const res = { code: 0, body: '', setHeader() {}, end(b) { res.body = b; } }; Object.defineProperty(res, 'statusCode', { set(c) { res.code = c; }, get() { return res.code; } }); await billing({ method: 'GET', url: '/api/billing?action=' + action + query, headers: Object.assign({ host: 'x' }, headers) }, res); return res; };
  assert.equal((await run('family-reminders', {})).code, 401);
  assert.equal((await run('family-reminders', { authorization: 'Bearer wrong' })).code, 401);
  assert.equal((await run('family-reminders', { authorization: 'Bearer cron-secret' })).code, 200);
  assert.equal((await run('unsubscribe', {}, '&u=u1&t=bad')).code, 400);
  console.log('family tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
