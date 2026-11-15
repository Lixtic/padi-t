'use strict';
// "Open GuidEd in": the saved launch choice for people with both roles survives other profile saves and rejects junk.
const assert = require('node:assert/strict');
const { Readable } = require('stream');
let stored = null;
global.__PADI_SQL__ = { query: async (text, p) => {
  const t = text.replace(/\s+/g, ' ').trim();
  if (/^select 1 from users/.test(t)) return [{ ok: 1 }];
  if (/^select data from account_profiles/.test(t)) return stored ? [{ data: stored }] : [];
  if (/^insert into account_profiles/.test(t)) { stored = JSON.parse(p[1]); return []; }
  return [];
} };
Object.assign(process.env, { DATABASE_URL: 'test', SMTP_URL: 'smtp://t', AUTH_SECRET: 'test-secret-test-secret-test-secret' });
const A = require('../api/_auth');
const handler = require('../api/_account-profile');
const call = async (body) => {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify({ data: body }))]), { method: 'POST', url: '/api/account-profile',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + A.issue({ id: 'u1', email: 'a@b.co' }).token } });
  const res = { code: 0, body: '', setHeader() {}, end(b) { res.body = b; } };
  Object.defineProperty(res, 'statusCode', { set(c) { res.code = c; }, get() { return res.code; } });
  await handler(req, res); return { code: res.code, json: JSON.parse(res.body) };
};
const base = { roles: ['teacher', 'parent'], primaryRole: 'teacher', displayName: 'Ray', children: [{ id: 'c1', name: 'Kofi', class: 'Basic 4', subjects: ['Mathematics'], minutes: 30 }] };
(async () => {
  let r = await call(base);
  assert.equal(r.code, 200, JSON.stringify(r.json)); assert.equal(stored.startIn, undefined, 'nothing is stored until a choice is made');
  r = await call({ ...base, startIn: 'parent' });
  assert.equal(stored.startIn, 'parent');
  r = await call({ ...base, primaryRole: 'parent' });
  assert.equal(stored.startIn, 'parent', 'switching view (which saves the profile without startIn) keeps the pinned choice');
  r = await call({ ...base, startIn: 'last' });
  assert.equal(stored.startIn, 'last');
  r = await call({ ...base, startIn: 'admin' });
  assert.equal(stored.startIn, 'last', 'an unknown value is ignored, not stored');
  console.log('start-in tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
