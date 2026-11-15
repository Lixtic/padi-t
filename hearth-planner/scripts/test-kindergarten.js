'use strict';
// Kindergarten: KG 1 and KG 2 are a level of their own, with a thematic scheme for every term.
const assert = require('node:assert/strict');
const Levels = require('../api/_levels');
const Schemes = require('../api/_schemes');
const { validate, firstMessage } = require('../api/_lib');
const PROFILES = require('../api/_prompt_levels');
const Inclusive = require('../api/_inclusive');

const kg = Levels.LEVELS[0];
assert.equal(kg.id, 'kg'); assert.deepEqual(kg.classes, ['KG 1', 'KG 2']); assert.deepEqual(kg.subjects, ['Integrated Learning']);
assert.equal(Levels.levelOfClass('KG 2').id, 'kg'); assert.ok(Levels.isClass('KG 1'));
assert.equal(Levels.levelOfClass('Basic 1').id, 'lower', 'Basic 1 is unchanged');

// Every KG term has 14 weeks: revision, 11 teaching weeks with real indicators, revision, exam.
for (const cls of ['KG 1', 'KG 2']) for (const term of [1, 2, 3]) {
  assert.ok(Schemes.has('Integrated Learning', cls, term), cls + ' term ' + term);
  const rows = [];
  for (let w = 1; w <= 14; w++) rows.push(Schemes.lookup('Integrated Learning', cls, term, w));
  assert.ok(rows.every(Boolean), cls + ' term ' + term + ' has all 14 weeks');
  const teach = rows.filter((r) => r.type === 'teach');
  assert.equal(teach.length, 11, cls + ' term ' + term + ' teaching weeks');
  for (const r of teach) {
    assert.ok(r.strand && r.substrand && r.standard, 'theme, sub-strand and content standard are set');
    assert.ok(r.indicators.length >= 2 && r.indicators.every((i) => new RegExp('^K' + cls.slice(3) + '\\.\\d+\\.\\d+\\.\\d+\\.\\d+ ').test(i)), 'indicator codes belong to the class');
  }
}
const first = Schemes.lookup('Integrated Learning', 'KG 1', 1, 2);
assert.equal(first.strand, 'All About Me'); assert.match(first.substrand, /unique creation/);
assert.equal(Schemes.lookup('Integrated Learning', 'KG 2', 3, 12).strand.length > 0, true);

// A KG request is accepted and carries the KG profile and Level line; the profile is the play-based one.
const v = validate({ params: { subject: 'Integrated Learning', cls: 'KG 1', week: 2, term: 1, mode: 'plan' } });
assert.ifError(v.error && new Error(v.error));
assert.match(firstMessage(v.params), /Level: Kindergarten \(kg\)/);
assert.match(firstMessage(v.params), /Learner support/, 'support and gender-responsive grouping start on, as in lower primary');
assert.match(PROFILES.kg, /Kindergarten \(KG 1 and KG 2\)/); assert.match(PROFILES.kg, /## Oral Check/);
assert.deepEqual(Inclusive.defaultFor('KG 2'), { support: true, gender: true, ict: false, acts: [] });
assert.ok(validate({ params: { subject: 'Integrated Learning', cls: 'KG 3', week: 2, term: 1 } }).error, 'there is no KG 3');
process.stdout.write('Kindergarten tests passed.\n');
