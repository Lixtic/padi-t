'use strict';
const assert = require('node:assert/strict');
const L = require('../api/_lib.js');
const base = { subject: 'Computing', cls: 'Basic 7', week: 10, term: 1, studyNotes: false, bece: false };
const flag = (p, k) => (L.firstMessage(Object.assign({}, base, p)).match(new RegExp(k + ': (on|off)')) || [])[1];
// A resource-only run for Study notes / BECE practice must not be told that section is off.
assert.equal(flag({ mode: 'resources', resourceType: 'Study notes' }, 'Study notes'), 'on');
assert.equal(flag({ mode: 'resources', resourceType: 'Study notes' }, 'BECE practice'), 'off');
assert.equal(flag({ mode: 'resources', resourceType: 'BECE practice' }, 'BECE practice'), 'on');
assert.equal(flag({ mode: 'resources', resourceType: 'Learner worksheet' }, 'Study notes'), 'off');
assert.equal(flag({ mode: 'plan' }, 'Study notes'), 'off');
assert.equal(flag({ mode: 'full', studyNotes: true, bece: true }, 'Study notes'), 'on');
assert.equal(flag({ mode: 'full' }, 'Study notes'), 'off');
process.stdout.write('Prompt switch tests passed.\n');

// SHS exam practice is WASSCE, in the request line and in the resource-only task line.
{
  const { firstMessage } = require('../api/_lib');
  const base = { subject: 'Social Studies', term: 1, week: 3, mode: 'resources', resourceType: 'BECE practice', bece: true, studyNotes: true };
  const shs = firstMessage(Object.assign({ cls: 'SHS 2' }, base));
  assert.match(shs, /WASSCE practice/);
  assert.match(shs, /Exam practice: WASSCE/);
  assert.doesNotMatch(shs.split('\n')[0], /BECE/);
  const jhs = firstMessage(Object.assign({ cls: 'Basic 8' }, base));
  assert.match(jhs.split('\n')[0], /BECE practice/);
  assert.doesNotMatch(jhs, /WASSCE/);
}
