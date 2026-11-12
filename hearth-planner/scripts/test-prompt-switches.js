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
