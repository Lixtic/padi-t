'use strict';
const assert = require('node:assert/strict');
const sync = require('../api/sync');

// A recording stand-in for the database: tests can see which statements ran, with which values.
const log = [];
let failAuthDelete = null;
global.__PADI_SQL__ = { query: async (text, params) => {
  if (/neon_auth/.test(text) && failAuthDelete) throw new Error(failAuthDelete);
  log.push({ text: text.replace(/\s+/g, ' ').trim(), params }); return [];
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
  for (const t of ['plans', 'profiles', 'account_profiles', 'subscriptions', 'bonus', 'reward_tokens', 'feedback', 'accounts']) {
    const hit = ran(new RegExp('^delete from ' + t + ' where user_id')).filter((l) => l.params[0] === 'user-123');
    assert.equal(hit.length, 1, t + ' is cleared for this user');
  }
  assert.ok(ran(/^delete from usage where subject/).length === 1 && /^u:[0-9a-f]{24}$/.test(ran(/^delete from usage where subject/)[0].params[0]), 'usage counters use the hashed subject');
  assert.ok(ran(/^delete from users where/).length === 1, 'legacy sign-in record');
  assert.equal(ran(/^delete from users where/)[0].params[1], 'ada@example.com', 'email is matched in lower case');
  const auth = ran(/neon_auth/);
  assert.equal(auth.length, 1); assert.equal(auth[0].params[0], 'user-123');

  // Payments are anonymised, never deleted. Blocked accounts are never removed.
  assert.equal(ran(/^delete from payments/).length, 0);
  assert.ok(ran(/^update payments set user_id = 'deleted', email = ''/).length === 1);
  assert.equal(ran(/blocked/).length, 0);

  // Another teacher's id is never used.
  assert.ok(log.every((l) => !JSON.stringify(l.params).includes('user-999')));

  // If the Neon Auth row cannot be removed (permissions), the data is still gone and the answer says so.
  log.length = 0; failAuthDelete = 'permission denied for table user';
  r = await post({ what: 'delete-account', confirm: 'DELETE' }, me);
  assert.equal(r.code, 200); assert.equal(r.body.identityRemoved, false);

  // A database without the neon_auth schema is fine.
  failAuthDelete = 'relation "neon_auth.user" does not exist';
  r = await post({ what: 'delete-account', confirm: 'DELETE' }, me);
  assert.equal(r.body.identityRemoved, true);

  process.stdout.write('Account deletion tests passed.\n');
})().catch((e) => { console.error(e); process.exit(1); });
