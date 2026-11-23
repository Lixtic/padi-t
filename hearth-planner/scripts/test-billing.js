'use strict';
// Billing: checkout, verify, the Paystack webhook, idempotence and the daily reminder auth, against a fake database and a fake Paystack.
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Readable } = require('stream');

const payments = new Map();            // reference -> row
const subs = new Map();                // user_id -> { expires_at, plan }
const blocked = new Set();
let failGrant = false;
const squash = (t) => t.replace(/\s+/g, ' ').trim();
global.__PADI_SQL__ = { query: async (text, p) => {
  const t = squash(text);
  if (/^select 1 from users where id/.test(t)) return [{ ok: 1 }];
  if (/^select 1 from blocked where user_id/.test(t)) return blocked.has(p[0]) ? [{ ok: 1 }] : [];
  if (/^insert into payments/.test(t)) { payments.set(p[0], { reference: p[0], user_id: p[1], email: p[2], plan: p[3], amount: p[4], currency: p[5], status: 'pending', created_at: p[6] }); return []; }
  if (/^select user_id, amount, currency, status from payments where reference/.test(t)) { const r = payments.get(p[0]); return r ? [r] : []; }
  if (/^with paid as \(/i.test(t)) {
    if (failGrant) throw new Error('simulated subscription write failure');
    const r = payments.get(p[0]); if (!r || r.status === 'success' || r.user_id === 'deleted') return [];
    const days = r.plan === 'term' ? p[3] : p[2];
    const base = Math.max(Number(subs.get(r.user_id)?.expires_at || 0), Number(p[1]));
    const until = base + Number(days) * DAY;
    r.status = 'success'; r.paid_at = p[1];
    subs.set(r.user_id, { expires_at: until, plan: r.plan });
    return [{ user_id: r.user_id, expires_at: until }];
  }
  return [];
} };
Object.assign(process.env, { DATABASE_URL: 'test', SMTP_URL: 'json', AUTH_SECRET: 'test-secret-test-secret-test-secret',
  PAYSTACK_SECRET_KEY: 'sk_test_x', CRON_SECRET: 'cron-secret', PRO_PRICE_MONTHLY: '23', PRO_DAYS_MONTHLY: '30', PRO_PRICE_TERM: '50', PRO_DAYS_TERM: '120' });
const A = require('../api/_auth');
const billing = require('../api/billing');

// A fake Paystack: initialize remembers the amount; verify answers whatever the test sets.
const paystack = { verify: {}, initialized: [], verifyCalls: 0 };
global.fetch = async (url, init) => {
  const json = (data, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => ({ status: ok, data }) });
  if (/\/transaction\/initialize$/.test(url)) { const b = JSON.parse(init.body); paystack.initialized.push(b); return json({ authorization_url: 'https://checkout.paystack.test/' + b.reference }); }
  const m = /\/transaction\/verify\/(.+)$/.exec(url);
  if (m) { paystack.verifyCalls++; return json(paystack.verify[decodeURIComponent(m[1])] || { status: 'abandoned' }); }
  throw new Error('unexpected fetch ' + url);
};

const call = async ({ method = 'POST', action, body, user, headers = {}, raw }) => {
  const payload = raw !== undefined ? raw : JSON.stringify(body || {});
  const req = Object.assign(Readable.from([Buffer.from(payload)]), { method, url: '/api/billing?action=' + action,
    headers: Object.assign({ 'content-type': 'application/json', host: 'guidedgh.test' }, user ? { authorization: 'Bearer ' + A.issue(user).token } : {}, headers) });
  const res = { code: 0, body: '', setHeader() {}, end(b) { res.body = b; } };
  Object.defineProperty(res, 'statusCode', { set(c) { res.code = c; }, get() { return res.code; } });
  await billing(req, res);
  let json = null; try { json = JSON.parse(res.body); } catch (e) { /* empty */ }
  return { code: res.code, json };
};
const sign = (raw) => crypto.createHmac('sha512', 'sk_test_x').update(raw).digest('hex');
const ada = { id: 'ada', email: 'ada@example.com' }, bob = { id: 'bob', email: 'bob@example.com' };
const DAY = 86400000;

(async () => {
  // Checkout: signed in, valid plan, user's email, amount in pesewas, a pending payment is recorded.
  let r = await call({ action: 'checkout', body: { plan: 'monthly' } });
  assert.equal(r.code, 401, 'checkout needs a sign-in');
  r = await call({ action: 'checkout', user: ada, body: { plan: 'lifetime' } });
  assert.equal(r.code, 400, 'unknown plan refused');
  r = await call({ action: 'checkout', user: { id: 'noemail', email: '' }, body: { plan: 'monthly' } });
  assert.equal(r.json.error, 'no_email');
  blocked.add('bob');
  r = await call({ action: 'checkout', user: bob, body: { plan: 'monthly' } });
  assert.equal(r.code, 403, 'blocked accounts cannot pay');
  assert.equal(paystack.initialized.length, 0, 'Paystack not called for refused checkouts');
  r = await call({ action: 'checkout', user: ada, body: { plan: 'monthly' } });
  assert.equal(r.code, 200);
  const ref = r.json.reference;
  assert.match(ref, /^gd_/);
  assert.equal(paystack.initialized[0].amount, 2300, '23 cedis is 2300 pesewas');
  assert.equal(paystack.initialized[0].email, 'ada@example.com');
  assert.deepEqual([payments.get(ref).status, payments.get(ref).user_id, payments.get(ref).amount], ['pending', 'ada', 2300]);

  // Verify: another account cannot claim it; an unpaid or short payment grants nothing.
  paystack.verify[ref] = { status: 'success', amount: 2300, currency: 'GHS' };   // really paid, by Ada
  r = await call({ action: 'verify', user: bob, body: { reference: ref } });
  assert.equal(r.code, 402, "Bob cannot claim Ada's payment"); assert.equal(subs.size, 0); assert.equal(paystack.verifyCalls, 0, 'refused before asking Paystack');
  delete paystack.verify[ref];
  r = await call({ action: 'verify', user: ada, body: { reference: ref } });
  assert.equal(r.code, 402, 'abandoned payment is not granted'); assert.equal(subs.size, 0);
  paystack.verify[ref] = { status: 'success', amount: 100, currency: 'GHS' };
  r = await call({ action: 'verify', user: ada, body: { reference: ref } });
  assert.equal(r.code, 402, 'underpaid is refused'); assert.equal(subs.size, 0);
  paystack.verify[ref] = { status: 'success', amount: 2300, currency: 'USD' };
  r = await call({ action: 'verify', user: ada, body: { reference: ref } });
  assert.equal(r.code, 402, 'wrong currency is refused'); assert.equal(subs.size, 0);

  // Paid in full: Pro for 30 days; asking again does not add more.
  paystack.verify[ref] = { status: 'success', amount: 2300, currency: 'GHS' };
  failGrant = true;
  r = await call({ action: 'verify', user: ada, body: { reference: ref } });
  assert.equal(r.code, 502, 'a failed entitlement write is reported as retryable');
  assert.equal(payments.get(ref).status, 'pending', 'payment status rolls back when the subscription write fails');
  assert.equal(subs.size, 0, 'no partial Pro entitlement is recorded');
  failGrant = false;
  const before = Date.now();
  r = await call({ action: 'verify', user: ada, body: { reference: ref } });
  assert.equal(r.code, 200); assert.equal(r.json.verified, true);
  const until = subs.get('ada').expires_at;
  assert.ok(until >= before + 30 * DAY && until <= Date.now() + 30 * DAY, 'about 30 days of Pro');
  await call({ action: 'verify', user: ada, body: { reference: ref } });
  assert.equal(subs.get('ada').expires_at, until, 'a second verify adds nothing');

  // A second payment stacks on the unexpired period.
  r = await call({ action: 'checkout', user: ada, body: { plan: 'term' } });
  const ref2 = r.json.reference; paystack.verify[ref2] = { status: 'success', amount: 5000, currency: 'GHS' };
  await call({ action: 'verify', user: ada, body: { reference: ref2 } });
  assert.equal(subs.get('ada').expires_at, until + 120 * DAY, 'term adds 120 days after the current end');

  // Two separate payments settling concurrently must both extend the latest expiry.
  const startConcurrent = subs.get('ada').expires_at;
  const monthly = await call({ action: 'checkout', user: ada, body: { plan: 'monthly' } });
  const term = await call({ action: 'checkout', user: ada, body: { plan: 'term' } });
  const concurrentMonthly = monthly.json.reference, concurrentTerm = term.json.reference;
  paystack.verify[concurrentMonthly] = { status: 'success', amount: 2300, currency: 'GHS' };
  paystack.verify[concurrentTerm] = { status: 'success', amount: 5000, currency: 'GHS' };
  const settled = await Promise.all([
    call({ action: 'verify', user: ada, body: { reference: concurrentMonthly } }),
    call({ action: 'verify', user: ada, body: { reference: concurrentTerm } })
  ]);
  assert.deepEqual(settled.map(x => x.code), [200, 200], 'both concurrent payments settle');
  assert.equal(payments.get(concurrentMonthly).status, 'success');
  assert.equal(payments.get(concurrentTerm).status, 'success');
  assert.equal(subs.get('ada').expires_at, startConcurrent + 150 * DAY,
    'concurrent monthly and term payments both stack on the latest expiry');

  // Webhook: signature required; valid event is idempotent with verify; pending asks Paystack to retry.
  const ev = (reference) => JSON.stringify({ event: 'charge.success', data: { reference } });
  let raw = ev('x');
  r = await call({ action: 'webhook', raw, headers: { 'x-paystack-signature': 'bad' } });
  assert.equal(r.code, 401);
  r = await call({ action: 'webhook', raw, headers: { 'x-paystack-signature': sign(raw).replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')) } });
  assert.equal(r.code, 401, 'a one-character difference is rejected');
  r = await call({ action: 'checkout', user: bob.id === 'bob' ? { id: 'carol', email: 'carol@example.com' } : bob, body: { plan: 'monthly' } });
  const ref3 = r.json.reference;
  paystack.verify[ref3] = { status: 'pending' };
  raw = ev(ref3);
  r = await call({ action: 'webhook', raw, headers: { 'x-paystack-signature': sign(raw) } });
  assert.equal(r.code, 500, 'still pending: Paystack should retry'); assert.ok(!subs.has('carol'));
  paystack.verify[ref3] = { status: 'success', amount: 2300, currency: 'GHS' };
  r = await call({ action: 'webhook', raw, headers: { 'x-paystack-signature': sign(raw) } });
  assert.equal(r.code, 200); assert.ok(subs.has('carol'), 'paid: Pro unlocked without the teacher returning');
  const carol = subs.get('carol').expires_at;
  await call({ action: 'webhook', raw, headers: { 'x-paystack-signature': sign(raw) } });
  assert.equal(subs.get('carol').expires_at, carol, 'a repeated webhook adds nothing');
  const calls = paystack.verifyCalls;
  raw = ev('gd_unknown');
  r = await call({ action: 'webhook', raw, headers: { 'x-paystack-signature': sign(raw) } });
  assert.equal(r.code, 200); assert.equal(paystack.verifyCalls, calls, 'unknown references never reach Paystack');
  raw = JSON.stringify({ event: 'charge.failed', data: { reference: ref3 } });
  r = await call({ action: 'webhook', raw, headers: { 'x-paystack-signature': sign(raw) } });
  assert.equal(r.code, 200, 'other events are acknowledged and ignored');

  // Daily reminders: only Vercel Cron, with the secret.
  r = await call({ action: 'reminders', method: 'GET' });
  assert.equal(r.code, 401);
  r = await call({ action: 'reminders', method: 'GET', headers: { authorization: 'Bearer wrong' } });
  assert.equal(r.code, 401);
  r = await call({ action: 'reminders', method: 'GET', headers: { authorization: 'Bearer cron-secret' } });
  assert.equal(r.code, 200);

  // Status works signed out and never needs Paystack.
  r = await call({ action: 'status', method: 'GET' });
  assert.equal(r.code, 200); assert.equal(r.json.tiers, true);
  console.log('Billing tests passed.');
})().catch((e) => { console.error(e); process.exit(1); });
