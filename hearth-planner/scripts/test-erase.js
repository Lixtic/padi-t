'use strict';
const assert = require('node:assert/strict');
const sync = require('../api/sync');

// A recording stand-in for the database: tests can see which statements ran, with which values.
const log = [];
let failAuthDelete = null;
global.__PADI_SQL__ = { query: async (text, params) => {
  if (/neon_auth/.test(text) && failAuthDelete) throw new Error(failAuthDelete);
  log.push({ text: text.replace(/\s+/g, ' ').trim(), params });
  if (/^select 1 from users where id/i.test(text.trim())) return [{ ok: 1 }];   // the signed-in token's account still exists
  return [];
} };
process.env.DATABASE_URL = 'test';
process.env.SMTP_URL = 'smtp://test';
process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret';
const A = require('../api/_auth');

const res = () => { const r = { code: 0, body: null, headers: {}, setHeader(k, v) { r.headers[k] = v; }, status(c) { r.code = c; return r; }, end(b) { try { r.body = JSON.parse(b); } catch (e) { r.body = b; } } };
  Object.defineProperty(r, 'statusCode', { set(c) { r.code = c; }, get() { return r.code; } }); return r; };
const post = async (body, user) => {
  const token = user ? A.issue(user).token : '';
  const req = { method: 'POST', url: '/api/sync', headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}), body };
  const r = res(); await sync(req, r); return r;
};
const ran = (re) => log.filter((l) => re.test(l.text));

(async () => {
  const me = { id: 'user-123', email: 'Ada@Example.com' };

  // Signed out: refused, nothing touched.
  let r = await post({ what: 'delete-account', confirm: 'DELETE' });
  assert.equal(r.code, 401);
  assert.equal(ran(/^delete from plans/).length, 0);

  // Signed in but did not type DELETE: refused.
  log.length = 0;
  r = await post({ what: 'delete-account', confirm: 'delete me' }, me);
  assert.equal(r.code, 400);
  assert.equal(ran(/^delete from plans/).length, 0, 'nothing is deleted without the word DELETE');

  // Confirmed: every table with the teacher's data is cleared, using their own id.
  log.length = 0;
  r = await post({ what: 'delete-account', confirm: 'DELETE' }, me);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true);
  assert.equal(r.body.identityRemoved, true);
  const purge = ran(/^with/i);
  assert.equal(purge.length, 1, 'all application-owned deletion runs in one atomic SQL statement');
  for (const t of ['plans', 'career_roadmaps', 'plan_log', 'free_plan_reservations', 'profiles', 'account_profiles', 'parent_learning', 'notifications', 'subscriptions', 'bonus', 'reward_tokens', 'feedback', 'accounts', 'users', 'otp_codes', 'usage', 'quota_reservations', 'reminder_log', 'mail_optout', 'account_phones', 'payments']) {
    assert.ok(purge[0].text.toLowerCase().includes('delete from ' + t) || purge[0].text.toLowerCase().includes('update ' + t), t + ' cleanup is included in the atomic purge');
  }
  assert.ok(purge[0].text.includes('lower(email)'), 'email-owned records are removed case-insensitively');
  assert.ok(purge[0].text.includes("THEN 'deleted' ELSE user_id END"), 'payment rows are anonymised');
  assert.ok(purge[0].text.includes('delete from career_roadmaps'), 'personal roadmaps are removed');
  assert.ok(purge[0].text.includes('delete from plan_log'), 'pseudonymous weekly usage is removed');
  assert.ok(purge[0].text.includes('delete from free_plan_reservations'), 'active free-plan reservations are removed');

  // Payments are anonymised, never deleted. Blocked accounts are never removed.
  assert.equal(ran(/^delete from payments/).length, 0);
  assert.ok(purge[0].text.includes('UPDATE payments SET'), 'payment rows are anonymised in the same atomic statement');
  assert.equal(ran(/blocked/).length, 0);

  // Another teacher's id is never used.
  assert.ok(log.every((l) => !JSON.stringify(l.params).includes('user-999')));

  // If the Neon Auth row cannot be removed (permissions), the data is still gone and the answer says so.
  log.length = 0; failAuthDelete = 'permission denied for table user';
  r = await post({ what: 'delete-account', confirm: 'DELETE' }, me);
  assert.equal(r.code, 503); assert.equal(r.body.identityRemoved, false); assert.equal(r.body.retryable, true);

  // A database without the neon_auth schema is fine.
  failAuthDelete = 'relation "neon_auth.user" does not exist';
  r = await post({ what: 'delete-account', confirm: 'DELETE' }, me);
  assert.equal(r.body.identityRemoved, true);

  process.stdout.write('Account deletion tests passed.\n');
})().catch((e) => { console.error(e); process.exit(1); });
