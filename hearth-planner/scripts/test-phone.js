'use strict';
// Saved mobile money numbers: validation, per-user storage, and paying by prompt to the saved phone, against a fake database and Paystack.
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Readable } = require('stream');

const payments = new Map();            // reference -> row
const subs = new Map();                // user_id -> { expires_at, plan }
const blocked = new Set();
const phones = new Map();            // user_id -> { phone, provider }
const squash = (t) => t.replace(/\s+/g, ' ').trim();
global.__PADI_SQL__ = { query: async (text, p) => {
  const t = squash(text);
  if (/^select 1 from users where id/.test(t)) return [{ ok: 1 }];
  if (/^select 1 from blocked where user_id/.test(t)) return blocked.has(p[0]) ? [{ ok: 1 }] : [];
  if (/^insert into payments/.test(t)) { payments.set(p[0], { reference: p[0], user_id: p[1], email: p[2], plan: p[3], amount: p[4], currency: p[5], status: 'pending', created_at: p[6] }); return []; }
  if (/^select user_id, amount, currency, status from payments where reference/.test(t)) { const r = payments.get(p[0]); return r ? [r] : []; }
  if (/^update payments set status = 'success'/.test(t)) {
    const r = payments.get(p[0]); if (!r || r.status === 'success' || r.user_id === 'deleted') return [];
    r.status = 'success'; r.paid_at = p[1]; return [{ user_id: r.user_id, plan: r.plan }];
  }
  if (/^select expires_at from subscriptions where user_id/.test(t)) return subs.has(p[0]) ? [{ expires_at: subs.get(p[0]).expires_at }] : [];
  if (/^insert into subscriptions/.test(t)) { subs.set(p[0], { expires_at: p[1], plan: p[2] }); return []; }
  if (/^select phone, provider from account_phones/.test(t)) return phones.has(p[0]) ? [phones.get(p[0])] : [];
  if (/^insert into account_phones/.test(t)) { phones.set(p[0], { phone: p[1], provider: p[2] }); return []; }
  if (/^delete from account_phones/.test(t)) { phones.delete(p[0]); return []; }
  if (/^select 1 from payments where reference = \$1 and user_id/.test(t)) { const r = payments.get(p[0]); return r && r.user_id === p[1] ? [{ ok: 1 }] : []; }
  return [];
} };
Object.assign(process.env, { DATABASE_URL: 'test', SMTP_URL: 'json', AUTH_SECRET: 'test-secret-test-secret-test-secret',
  PAYSTACK_SECRET_KEY: 'sk_test_x', CRON_SECRET: 'cron-secret', PRO_PRICE_MONTHLY: '23', PRO_DAYS_MONTHLY: '30', PRO_PRICE_TERM: '50', PRO_DAYS_TERM: '120' });
const A = require('../api/_auth');
const billing = require('../api/billing');

// A fake Paystack: initialize remembers the amount; verify answers whatever the test sets.
const paystack = { verify: {}, initialized: [], charges: [], otps: [], verifyCalls: 0, chargeStatus: 'pay_offline' };
global.fetch = async (url, init) => {
  const json = (data, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => ({ status: ok, data }) });
  if (/\/transaction\/initialize$/.test(url)) { const b = JSON.parse(init.body); paystack.initialized.push(b); return json({ authorization_url: 'https://checkout.paystack.test/' + b.reference }); }
  if (/\/charge$/.test(url)) { const b = JSON.parse(init.body); paystack.charges.push(b); return json({ status: paystack.chargeStatus, display_text: 'Approve the prompt on your phone' }); }
  if (/\/charge\/submit_otp$/.test(url)) { paystack.otps.push(JSON.parse(init.body)); return json({ status: 'pay_offline', display_text: 'Code accepted' }); }
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
  // Saving: needs a sign-in, accepts every common way of writing a Ghana number, refuses the rest.
  let r = await call({ action: 'phone' });
  assert.equal(r.code, 401);
  r = await call({ action: 'phone', user: ada, body: { phone: '12345' } });
  assert.equal(r.code, 400); assert.equal(r.json.error, 'bad_phone'); assert.equal(phones.size, 0);
  r = await call({ action: 'phone', user: ada, body: { phone: '+233 55 123 4987' } });
  assert.equal(r.code, 200); assert.deepEqual([r.json.phone, r.json.provider], ['0551234987', 'mtn']);
  assert.equal(r.json.masked, '055 *** 987');
  r = await call({ action: 'phone', user: ada, body: { phone: '020 123 4567', provider: 'atl' } });
  assert.deepEqual([r.json.phone, r.json.provider], ['0201234567', 'atl'], 'a ported number keeps the provider the user chose');
  r = await call({ action: 'phone', user: ada, body: { phone: '0201234567', provider: 'nonsense' } });
  assert.equal(r.json.provider, 'vod', 'an unknown provider falls back to the prefix');
  // Each user sees only their own number.
  r = await call({ action: 'phone', user: bob });
  assert.equal(r.json.phone, '', 'Bob has none, and does not see Ada\'s');
  r = await call({ action: 'phone', user: ada });
  assert.equal(r.json.phone, '0201234567');

  // Paying by prompt: refused without a saved number; with one, Paystack's charge API gets the phone and the pending payment is recorded.
  r = await call({ action: 'checkout', user: bob, body: { plan: 'monthly', mobile: true } });
  assert.equal(r.code, 400); assert.equal(r.json.error, 'no_phone'); assert.equal(paystack.charges.length, 0);
  r = await call({ action: 'checkout', user: ada, body: { plan: 'monthly', mobile: true } });
  assert.equal(r.code, 200); assert.equal(r.json.mode, 'mobile'); assert.equal(r.json.status, 'pay_offline');
  assert.deepEqual(paystack.charges[0].mobile_money, { phone: '0201234567', provider: 'vod' });
  assert.equal(paystack.charges[0].amount, 2300); assert.equal(paystack.initialized.length, 0, 'no hosted page for a prompt payment');
  const ref = r.json.reference;
  assert.equal(payments.get(ref).user_id, 'ada');
  // A client-supplied phone is ignored: the saved number is the only one charged.
  r = await call({ action: 'checkout', user: ada, body: { plan: 'monthly', mobile: true, phone: '0551110000', mobile_money: { phone: '0551110000' } } });
  assert.equal(paystack.charges[1].mobile_money.phone, '0201234567');

  // The OTP step: only for the owner of that payment.
  r = await call({ action: 'otp', user: bob, body: { reference: ref, otp: '123456' } });
  assert.equal(r.code, 403); assert.equal(paystack.otps.length, 0);
  r = await call({ action: 'otp', user: ada, body: { reference: ref, otp: '12' } });
  assert.equal(r.code, 400);
  r = await call({ action: 'otp', user: ada, body: { reference: ref, otp: '123 456' } });
  assert.equal(r.code, 200); assert.deepEqual(paystack.otps[0], { otp: '123456', reference: ref });

  // Pro is only granted once Paystack confirms the payment, exactly as with the hosted page.
  paystack.verify[ref] = { status: 'success', amount: 2300, currency: 'GHS' };
  r = await call({ action: 'verify', user: ada, body: { reference: ref } });
  assert.equal(r.json.verified, true); assert.ok(subs.has('ada'));

  // Clearing removes the number.
  r = await call({ action: 'phone', user: ada, body: { phone: '' } });
  assert.equal(phones.size, 0);
  console.log('phone tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
