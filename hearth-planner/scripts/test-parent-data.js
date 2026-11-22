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
  if (/^select id, kind, data, updated_at, deleted from parent_learning/.test(t)) return [...rows.values()].filter((r) => !r.deleted);
  if (/^delete from parent_learning where user_id = \$1 and id = \$2/.test(t)) { rows.delete(p[0] + '/' + p[1]); return []; }
  if (/^delete from notifications where user_id = \$1 and \(learning_record_id = \$2 or dedupe_key = \$3\)/.test(t)) return [];
  if (/^select 1 as x from parent_learning/.test(t)) { const r = rows.get(p[0] + '/' + p[1]); return r && !r.deleted ? [{ x: 1 }] : []; }
  if (/^select count\(\*\)::int as n from parent_learning/.test(t)) return [{ n: [...rows.values()].filter((r) => !r.deleted).length }];
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
  // delete one record
  r = await call('POST', parent, { id: 'pl-1', delete: true });
  assert.equal(r.code, 200); assert.equal(r.json.deleted, 'pl-1');
  r = await call('GET', parent);
  assert.equal(r.json.length, 0, 'a deleted record is gone from the list');
  assert.equal(rows.has('parent-1/pl-1'), false, 'deleted learner content is physically removed from storage');
  // the cap: the 151st new record is refused, but updating an existing one is not
  rows.clear();
  for (let i = 0; i < 150; i++) { r = await call('POST', parent, Object.assign(rec(), { id: 'cap-' + i })); assert.equal(r.code, 200, 'record ' + i); }
  r = await call('POST', parent, Object.assign(rec(), { id: 'cap-new' }));
  assert.equal(r.code, 409); assert.equal(r.json.error, 'cap');
  r = await call('POST', parent, Object.assign(rec(), { id: 'cap-5' }));
  assert.equal(r.code, 200, 'editing a saved record still works at the cap');
  await call('POST', parent, { id: 'cap-0', delete: true });
  r = await call('POST', parent, Object.assign(rec(), { id: 'cap-new' }));
  assert.equal(r.code, 200, 'deleting one frees a slot');
  r = await call('POST', null, rec());
  assert.equal(r.code, 401);
  console.log('Parent data tests passed.');
})().catch((e) => { console.error(e); process.exit(1); });
