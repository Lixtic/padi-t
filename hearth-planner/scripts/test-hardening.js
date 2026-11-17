'use strict';
// Security hardening: link markup, signed-in tokens of erased accounts, and payments of erased accounts.
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');

const log = [];
let users = new Set(['live-user']);
let payment = null;
global.__PADI_SQL__ = { query: async (text, params) => {
  const t = text.replace(/\s+/g, ' ').trim(); log.push(t);
  if (/^select 1 from users where id/.test(t)) return users.has(params[0]) ? [{ '?column?': 1 }] : [];
  if (/from payments where reference/.test(t)) return payment ? [payment] : [];
  return [];
} };
process.env.DATABASE_URL = 'test';
process.env.SMTP_URL = 'smtp://test';
process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret';
process.env.PAYSTACK_SECRET_KEY = 'sk_test_x';
const A = require('../api/_auth');

(async () => {
  // 1. Markdown links cannot carry extra attributes. Run the real inline() from app.js.
  const src = fs.readFileSync(__dirname + '/../public/markdown.js', 'utf8');
  const start = src.indexOf('const esc = (s) => s.replace'), end = src.indexOf('function cellHtml');
  const inline = new Function(src.slice(start, end) + '; return inline;')();
  const html = inline('[x](https://a.com/"onfocus="alert(1)"autofocus=")');
  assert.equal((html.match(/<a /g) || []).length, 1);
  assert.ok(!/"onfocus=/.test(html), 'a quote in a link address must not close the href: ' + html);
  assert.match(html, /^<a href="https:\/\/a\.com\/%22onfocus=%22alert\(1/);
  assert.match(inline('[ok](https://example.com/a?b=1&c=2)'), /href="https:\/\/example\.com\/a\?b=1&amp;c=2"/);
  assert.equal(inline('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');

  // 2. Old email-code tokens stop working once the account is erased.
  const req = (u) => ({ headers: { authorization: 'Bearer ' + A.issue(u).token } });
  assert.deepEqual(await A.authed(req({ id: 'live-user', email: 'a@b.c' })), { uid: 'live-user', email: 'a@b.c' });
  assert.equal(await A.authed(req({ id: 'erased-user', email: 'x@y.z' })), null);
  const broken = global.__PADI_SQL__.query; global.__PADI_SQL__.query = async () => { throw new Error('db down'); };
  assert.equal(await A.authed(req({ id: 'live-user', email: 'a@b.c' })), null, 'fails closed when the check cannot run');
  global.__PADI_SQL__.query = broken;

  // 3. A late Paystack webhook for an erased account's payment does not unlock anything or call Paystack.
  const billing = require('../api/billing');
  let fetched = 0; global.fetch = async () => { fetched++; return { ok: true, json: async () => ({}) }; };
  const raw = JSON.stringify({ event: 'charge.success', data: { reference: 'gd_old' } });
  payment = { user_id: 'deleted', amount: 5000, currency: 'GHS', status: 'pending' };
  log.length = 0;
  const hook = Object.assign(require('stream').Readable.from([Buffer.from(raw)]), {
    method: 'POST', url: '/api/billing?action=webhook',
    headers: { 'x-paystack-signature': crypto.createHmac('sha512', 'sk_test_x').update(raw).digest('hex') } });
  const out = { code: 0, body: '', headers: {}, setHeader(k, v) { out.headers[k] = v; }, end(b) { out.body = b; } };
  Object.defineProperty(out, 'statusCode', { set(c) { out.code = c; }, get() { return out.code; } });
  await billing(hook, out);
  assert.equal(out.code, 200, out.body);
  assert.equal(fetched, 0, 'no call to Paystack for an erased account');
  assert.ok(!log.some((l) => /^update payments set status/.test(l) || /insert into subscriptions/.test(l)), 'nothing granted');
  console.log('Hardening tests passed.');
})().catch((e) => { console.error(e); process.exit(1); });
