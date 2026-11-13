'use strict';
const assert = require('node:assert/strict');
const Inclusive = require('../api/_inclusive');
const { validate, firstMessage } = require('../api/_lib');

const build = (cls, inc, mode = 'plan') => { const v = validate({ params: { subject: 'Mathematics', cls, week: 3, term: 1, mode, inc } }); assert.ifError(v.error && new Error(v.error)); return v.params; };
const text = (p) => firstMessage(p);

// Lower primary starts with support and grouping on; other levels start with everything off.
assert.deepEqual(Inclusive.defaultFor('Basic 2'), { support: true, gender: true, ict: false, acts: [] });
assert.deepEqual(Inclusive.defaultFor('Basic 8'), { support: false, gender: false, ict: false, acts: [] });
assert.match(text(build('Basic 2')), /Learner support/);
assert.match(text(build('Basic 2')), /Gender-responsive/);
assert.doesNotMatch(text(build('Basic 8')), /Learner support|Gender-responsive|Activity variety/);

// The teacher's choice wins over the default, in both directions.
assert.doesNotMatch(text(build('Basic 2', { support: false, gender: false })), /Learner support|Gender-responsive/);
assert.match(text(build('SHS 1', { support: true })), /Learner support/);

// Activities: only known ids pass, and the voice call carries its own instructions.
const p = build('Basic 2', { acts: ['call', 'group', 'sql;drop', 'group', 42] });
assert.deepEqual(p.inc.acts, ['call', 'group']);
const t = text(p);
assert.match(t, /Required activities.*Voice call to a resource person; Group discussion/);
assert.match(t, /3 or 4 short child-friendly questions/);
assert.match(t, /back-up if the person cannot be reached/);
assert.doesNotMatch(t, /sql;drop/);

// ICT is its own switch; resource-only requests are not changed.
assert.match(text(build('Basic 5', { ict: true })), /low-bandwidth ICT step/);
assert.doesNotMatch(text(build('Basic 2', { acts: ['call'] }, 'resources')), /Learner support|Voice call/);

// Odd input never throws and falls back to the level default.
assert.deepEqual(build('Basic 2', 'nonsense').inc, Inclusive.defaultFor('Basic 2'));
assert.deepEqual(build('Basic 2', { acts: 'group' }).inc.acts, []);
process.stdout.write('Inclusive teaching tests passed.\n');
