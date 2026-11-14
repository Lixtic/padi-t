'use strict';
// The shared rate limits on sign-in, sync, billing and feedback: they block, they are per caller, and a broken limiter lets people through.
const assert = require('node:assert/strict');
const { Readable } = require('stream');

const buckets = new Map(); let limiterDown = false;
global.__PADI_SQL__ = { query: async (text, p) => {
  const t = text.replace(/\s+/g, ' ').trim();
  if (/INSERT INTO rate_limits/i.test(t)) {
    if (limiterDown) throw new Error('rate_limits unavailable');
    const [key, now, win, cap] = p; let b = buckets.get(key);
    if (!b || b.window_start <= now - win) b = { window_start: now, hits: 0 };
    b.hits = Math.min(b.hits + 1, cap); buckets.set(key, b); return [{ hits: b.hits, window_start: b.window_start }];
  }
  if (/^select 1 from users where id/.test(t)) return [{ ok: 1 }];
  if (/^select code_hash|^select sent_at/.test(t)) return [];
  return [];
} };
Object.assign(process.env, { DATABASE_URL: 'test', SMTP_URL: 'json', AUTH_SECRET: 'test-secret-test-secret-test-secret', PAYSTACK_SECRET_KEY: 'sk_test_x' });
const A = require('../api/_auth');

const run = async (handler, { method = 'POST', url, body, user, ip = '1.1.1.1' }) => {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body || {}))]), { method, url,
    headers: Object.assign({ 'content-type': 'application/json', 'x-forwarded-for': ip, host: 'x.test' }, user ? { authorization: 'Bearer ' + A.issue(user).token } : {}) });
  const res = { code: 0, body: '', headers: {}, setHeader(k, v) { res.headers[k] = v; }, end(b) { res.body = b; } };
  Object.defineProperty(res, 'statusCode', { set(c) { res.code = c; }, get() { return res.code; } });
  await handler(req, res); return res;
};
const hammer = async (n, fn) => { let last; for (let i = 0; i < n; i++) last = await fn(); return last; };

(async () => {
  const auth = require('../api/auth'), billing = require('../api/billing'), sync = require('../api/sync'), feedback = require('../api/feedback');
  const signIn = (ip) => run(auth, { url: '/api/auth', body: { action: 'request', email: 'a@b.co' }, ip });

  // Sign-in: 20 requests per address per 10 minutes, then 429 with Retry-After. Another address is unaffected.
  let r = await hammer(20, () => signIn('9.9.9.9'));
  assert.notEqual(r.code, 429, 'the 20th request is allowed');
  r = await signIn('9.9.9.9');
  assert.equal(r.code, 429); assert.ok(Number(r.headers['Retry-After']) > 0, 'tells the browser when to retry');
  r = await signIn('8.8.8.8');
  assert.notEqual(r.code, 429, 'a different address has its own allowance');

  // Billing: per signed-in user, not per address.
  const ada = { id: 'ada', email: 'a@x.co' }, bob = { id: 'bob', email: 'b@x.co' };
  const pay = (user, ip) => run(billing, { url: '/api/billing?action=verify', body: { reference: 'gd_none' }, user, ip });
  r = await hammer(40, () => pay(ada, '2.2.2.2'));
  assert.notEqual(r.code, 429);
  r = await pay(ada, '3.3.3.3');
  assert.equal(r.code, 429, 'changing address does not reset a user');
  r = await pay(bob, '2.2.2.2');
  assert.notEqual(r.code, 429, 'another user on the same address is fine');

  // Sync: a very generous cap per user (1200 / 10 min).
  const pull = (user) => run(sync, { method: 'GET', url: '/api/sync?what=plans', user });
  r = await hammer(1200, () => pull(ada));
  assert.equal(r.code, 200, 'normal heavy use is never blocked');
  r = await pull(ada);
  assert.equal(r.code, 429);

  // Feedback: 5 an hour per sender.
  const send = (ip) => run(feedback, { url: '/api/feedback', body: { kind: 'idea', message: 'Please add more colours to the planner' }, ip });
  r = await hammer(5, () => send('4.4.4.4'));
  assert.notEqual(r.code, 429);
  r = await send('4.4.4.4');
  assert.equal(r.code, 429);

  // If the limiter itself breaks, people are let through (these endpoints need the database anyway).
  limiterDown = true;
  r = await pay(ada, '5.5.5.5');
  assert.notEqual(r.code, 429, 'a broken limiter does not block teachers');
  console.log('Rate limit tests passed.');
})().catch((e) => { console.error(e); process.exit(1); });
