'use strict';
const assert = require('node:assert/strict');
const Curriculum = require('../api/_curriculum');

assert.equal(Curriculum.codeFrom('B7.1.1.1.2 Demonstrate input devices'), 'B7.1.1.1.2');
assert.equal(Curriculum.classifyCode('B7.1.1.1'), 'content_standard');
assert.equal(Curriculum.classifyCode('B7.1.1.1.2'), 'indicator');
assert.equal(Curriculum.classifyCode('not-a-code'), 'unknown');

const scheme = {
  type: 'teach', term: 'Term 1', strand: 'Introduction to Computing',
  substrand: 'Components of Computers', standard: 'B7.1.1.1 Examine the parts of a computer',
  indicators: ['B7.1.1.1.1 Discuss fourth-generation computers', 'B7.1.1.1.2 Demonstrate use of input devices'],
  part: [1, 2]
};
const items = Curriculum.indicatorsFor(scheme);
assert.equal(items.length, 2);
assert.equal(items[0].codeType, 'indicator');
const prompt = Curriculum.buildInstruction(scheme, { cls: 'Basic 7', subject: 'Computing', week: 2, mode: 'resources', resourceType: 'Study notes' });
assert.match(prompt, /content standard describes the broader expected learning/);
assert.match(prompt, /3–5 measurable learning objectives/);
assert.match(prompt, /not the complete official curriculum document/);
assert.match(prompt, /part 1 of 2/);
assert.match(Curriculum.buildInstruction(null, {}), /Do not invent a curriculum indicator/);
const revision = Curriculum.buildInstruction({ type: 'revision', topics: ['Computer hardware', 'Input devices'] }, {});
assert.match(revision, /revision week/);
assert.match(revision, /Computer hardware/);
assert.match(revision, /Do not introduce new curriculum content/);

process.stdout.write('Curriculum Intelligence Engine tests passed.\n');

// Official NaCCA exemplars (exported from the SchoolPadi database) reach the prompt.
{
  const assert2 = require('node:assert/strict');
  const C = require('../api/_curriculum');
  const rec = C.officialFor('Integrated Science', 'B8.2.1.1.1');
  assert2.ok(rec && rec.exemplars.length, 'Integrated Science resolves through the Science alias');
  assert2.equal(C.officialFor('Mathematics', 'B0.0.0.0.0'), null, 'unknown codes resolve to nothing');
  const scheme = { type: 'teach', term: 1, strand: 'S', substrand: 'SS', standard: 'B8.1.1.1', indicators: ['Round numbers [B8.1.1.1.2]'] };
  const text = C.buildInstruction(scheme, { cls: 'Basic 8', subject: 'Mathematics', week: 3 });
  assert2.ok(/Official NaCCA exemplars for B8\.1\.1\.1\.2/.test(text), 'exemplars are listed for a matched indicator');
  const none = C.buildInstruction({ type: 'teach', term: 1, indicators: ['Something [B8.9.9.9.9]'] }, { cls: 'Basic 8', subject: 'Mathematics', week: 3 });
  assert2.ok(!/Official NaCCA exemplars/.test(none), 'no exemplar block when the code is not loaded');
  process.stdout.write('Official exemplar tests passed.\n');
}

{
  // JHS Terms 1-3 are all scheduled for the eight subjects that have NaCCA data.
  const S = require('../api/_schemes');
  const subjects = ['Computing', 'Creative Arts and Design', 'English Language', 'Integrated Science', 'Social Studies', 'Career Technology', 'Mathematics', 'Religious and Moral Education'];
  for (const s of subjects) for (const c of ['Basic 7', 'Basic 8', 'Basic 9']) for (const t of [1, 2, 3]) {
    let teach = 0, coded = 0;
    for (let w = 1; w <= 15; w++) { const r = S.lookup(s, c, t, w); if (r && r.type === 'teach') { teach++; if ((r.indicators || []).some((i) => /B[7-9]\.\d/.test(i))) coded++; } }
    require('node:assert/strict').ok(teach >= 5 && coded >= 5, s + ' ' + c + ' Term ' + t + ' has teaching weeks with indicator codes');
  }
  process.stdout.write('JHS term coverage tests passed.\n');
}
