'use strict';
// Parent data: the lesson stage is kept and other parents' children are off limits.
const assert = require('node:assert/strict');
const { Readable } = require('stream');

const rows = new Map();
const profile = { primaryRole: 'parent', children: [{ id: 'c1', name: 'Kofi', class: 'Basic 7', subjects: ['Mathematics', 'Science'] }] };
global.__PADI_SQL__ = { query: async (text, p) => {
  const t = text.replace(/\s+/g, ' ').trim();
  if (/^select 1 from users/.test(t)) return [{ ok: 1 }];
  if (/from account_profiles where user_id/.test(t)) return p[0] === 'parent-1' ? [{ data: profile }] : [];
  if (/^insert into parent_learning/.test(t)) { rows.set(p[0] + '/' + p[1], { id: p[1], kind: p[2], data: JSON.parse(p[3]), updated_at: p[4] }); return []; }
  if (/^select id, kind, data, updated_at, deleted from parent_learning/.test(t)) return [...rows.values()].filter((r) => true);
  return [];
} };
Object.assign(process.env, { DATABASE_URL: 'test', SMTP_URL: 'smtp://t', AUTH_SECRET: 'test-secret-test-secret-test-secret' });
const A = require('../api/_auth');
const handler = require('../api/_parent-learning');

const call = async (method, user, body) => {
  const req = Object.assign(Readable.from([Buffer.from(body ? JSON.stringify(body) : '')]), { method, url: '/api/sync?what=parent-learning',
    headers: Object.assign({ 'content-type': 'application/json' }, user ? { authorization: 'Bearer ' + A.issue(user).token } : {}) });
  const res = { code: 0, body: '', setHeader() {}, end(b) { res.body = b; } };
  Object.defineProperty(res, 'statusCode', { set(c) { res.code = c; }, get() { return res.code; } });
  await handler(req, res); let json = null; try { json = JSON.parse(res.body); } catch (e) { /* empty */ }
  return { code: res.code, json };
};
const parent = { id: 'parent-1', email: 'p@x.co' };
const rec = (extra) => ({ id: 'pl-1', kind: 'lesson', data: Object.assign({ childId: 'c1', subject: 'Science', topic: 'Plants', content: '# Plan' }, extra) });

(async () => {
  let r = await call('POST', parent, rec({ lessonStage: 3 }));
  assert.equal(r.code, 200, JSON.stringify(r.json));
  assert.equal(r.json.record.data.lessonStage, 3, 'the stage the parent reached is saved and returned');
  r = await call('GET', parent);
  assert.equal(r.json[0].data.lessonStage, 3, 'and is there when the lesson is reopened');
  for (const [given, want] of [[undefined, 0], [-2, 0], [99, 5], ['x', 0], [2.7, 2]]) {
    r = await call('POST', parent, rec({ lessonStage: given }));
    assert.equal(r.json.record.data.lessonStage, want, 'stage ' + given + ' becomes ' + want);
  }
  r = await call('POST', parent, rec({ childId: 'someone-elses-child' }));
  assert.equal(r.code, 403, "cannot save for a child that isn't yours");
  r = await call('POST', { id: 'teacher-1', email: 't@x.co' }, rec());
  assert.equal(r.code, 403, 'teacher accounts have no parent records');
  r = await call('POST', null, rec());
  assert.equal(r.code, 401);
  console.log('Parent data tests passed.');
})().catch((e) => { console.error(e); process.exit(1); });
