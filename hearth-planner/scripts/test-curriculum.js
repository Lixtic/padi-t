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

// Database-exported exemplars are not called official until a source and page are verified.
{
  const assert2 = require('node:assert/strict');
  const C = require('../api/_curriculum');
  assert2.equal(C.verificationStatus, 'unverified_database_export');
  assert2.equal(C.verificationManifest.verifiedIndicators.length, 0);
  assert2.equal(C.officialFor('Integrated Science', 'B8.2.1.1.1'), null,
    'unverified database-exported exemplars are withheld from official curriculum claims');
  const scheme = { type: 'teach', term: 1, indicators: ['Round numbers [B8.1.1.1.2]'] };
  const text = C.buildInstruction(scheme, { cls: 'Basic 8', subject: 'Mathematics', week: 3 });
  assert2.ok(!/Official NaCCA exemplars/.test(text), 'unverified exemplars are not sent as official');
  process.stdout.write('Curriculum provenance tests passed.\n');
}

{
  // JHS Terms 1-3 are all scheduled for the eight subjects that have NaCCA data.
  const S = require('../api/_schemes');
  const subjects = ['Computing', 'Creative Arts and Design', 'English Language', 'Integrated Science', 'Social Studies', 'Career Technology', 'Mathematics', 'Religious and Moral Education'];
  for (const s of subjects) for (const c of ['Basic 7', 'Basic 8', 'Basic 9']) for (const t of [1, 2, 3]) {
    let teach = 0, coded = 0;
    for (let w = 1; w <= 15; w++) { const r = S.lookup(s, c, t, w); if (r && r.type === 'teach') { teach++; if ((r.indicators || []).some((i) => /B[7-9]\.\d/.test(i))) coded++; } }
    require('node:assert/strict').ok(teach >= 5 && (t === 1 || coded >= 5), s + ' ' + c + ' Term ' + t + ' has teaching weeks with indicator codes');
  }
  process.stdout.write('JHS term coverage tests passed.\n');
}

{
  // SHS 2 Social Studies follows the 2025 NaCCA Teacher Manual: 12 teaching weeks per semester, Terms 1 and 2.
  const S = require('../api/_schemes');
  for (const t of [1, 2]) {
    let teach = 0;
    for (let w = 1; w <= 12; w++) { const r = S.lookup('Social Studies', 'SHS 2', t, w); if (r && r.type === 'teach' && r.indicators.length && r.focus) teach++; }
    require('node:assert/strict').equal(teach, 12, 'SHS 2 Social Studies Term ' + t + ' has 12 teaching weeks from the manual');
  }
  require('node:assert/strict').match(S.lookup('Social Studies', 'SHS 2', 2, 1).substrand, /Leisure and Tourism/);
  process.stdout.write('SHS 2 Social Studies manual tests passed.\n');
}

{
  // SHS: two semesters of 17 weeks. Semester 1 of 2026/27 follows the school's own week-ending list (the Christmas break is skipped).
  const S = require('../api/_schemes');
  const eq = require('node:assert/strict').equal;
  const d = new Date(2026, 10, 13);
  eq(S.isShs('SHS 2'), true); eq(S.isShs('Basic 8'), false);
  eq(S.weeksIn('SHS 1'), 17); eq(S.weeksIn('Basic 7'), 14);
  eq(S.termName('SHS 3'), 'Semester'); eq(S.termName('Basic 9'), 'Term');
  const we = (w) => S.weekEnding(1, w, { today: d, cls: 'SHS 2' }).iso;
  eq(we(1), '2026-09-25'); eq(we(8), '2026-11-13'); eq(we(13), '2026-12-18'); eq(we(14), '2027-01-08'); eq(we(17), '2027-01-29');
  eq(S.weekEnding(1, 8, { today: d, cls: 'Basic 8' }).iso !== '2026-11-13', true, 'basic schools keep the GES term calendar');
  eq(S.currentTerm(d, 'SHS 2'), 1);
  eq(S.currentTerm(new Date(2027, 1, 1), 'SHS 2'), 2, 'after semester 1 closes the next semester is current');
  eq(S.currentTerm(new Date(2027, 6, 1), 'SHS 2') <= 2, true);
  eq(S.weekEnding(1, 18, { today: d, cls: 'SHS 2' }).afterClose, true);
  process.stdout.write('SHS semester calendar tests passed.\n');
}

{
  const Lib = require('../api/_lib');
  const Schemes = require('../api/_schemes');
  const selectedText = 'B7.1.1.1.2 Demonstrate use of input devices';
  const otherText = 'B7.1.1.1.3 Demonstrate use of output devices';
  const selectedCode = Curriculum.codeFrom(selectedText);
  const originalLookup = Schemes.lookup;
  Schemes.lookup = (subject, cls, term, week) => ({
    type: 'teach',
    term: 'Term ' + term,
    indicators: subject === 'Computing' && cls === 'Basic 7' && term === 1 && week === 2
      ? [selectedText, otherText]
      : [otherText]
  });
  try {
    const base = {
      subject: 'Computing', cls: 'Basic 7', term: 1, week: 2,
      mode: 'resources', resourceType: 'Study notes',
      indicatorCodes: [selectedCode]
    };
    const validate = (overrides) => Lib.validate({
      params: Object.assign({}, base, overrides || {}),
      thread: []
    });

    const scoped = validate();
    assert.equal(scoped.error, undefined, 'a valid Study Notes indicator is accepted');
    assert.deepEqual(scoped.params.scheme.indicators, [selectedText], 'only the selected indicator reaches the generation contract');

    for (const mismatch of [
      { cls: 'Basic 8' },
      { subject: 'Mathematics' },
      { term: 2 },
      { week: 3 }
    ]) {
      const rejected = validate(mismatch);
      assert.match(rejected.error || '', /do not belong to this class, subject, term and week/,
        'an indicator from a different class, subject, term or week is rejected');
    }

    const duplicate = validate({ indicatorCodes: [selectedCode, selectedCode] });
    assert.deepEqual(duplicate.params.indicatorCodes, [selectedCode], 'duplicate indicator codes are de-duplicated');

    const malformed = validate({ indicatorCodes: selectedCode });
    assert.match(malformed.error || '', /sent as a list/, 'malformed indicator payloads fail closed');

    const empty = validate({ indicatorCodes: [] });
    assert.equal(empty.error, undefined, 'general Study Notes remain available when no coded indicators are loaded');
    assert.deepEqual(empty.params.scheme.indicators, [selectedText, otherText]);

    const tooMany = validate({ indicatorCodes: Array.from({ length: 11 }, (_, i) => 'B7.1.1.1.' + (i + 1)) });
    assert.match(tooMany.error || '', /no more than 10/, 'the server enforces the indicator selection limit');

    const plan = validate({ mode: 'plan', indicatorCodes: [selectedCode] });
    assert.equal(plan.error, undefined);
    assert.deepEqual(plan.params.scheme.indicators, [selectedText, otherText], 'Lesson Plan keeps its original full scheme scope');
    assert.deepEqual(plan.params.indicatorCodes, [], 'Lesson Plan does not consume Study Notes indicator selections');

    const worksheet = validate({ resourceType: 'Learner worksheet', indicatorCodes: [selectedCode] });
    assert.equal(worksheet.error, undefined);
    assert.deepEqual(worksheet.params.scheme.indicators, [selectedText, otherText], 'other Resources remain independent of Study Notes selection');

    const invalidShsTerm = Lib.validate({
      params: { subject: 'Computing', cls: 'SHS 1', term: 3, week: 2, mode: 'resources', resourceType: 'Study notes', indicatorCodes: [] },
      thread: []
    });
    assert.match(invalidShsTerm.error || '', /valid term \(1–2\)/, 'SHS accepts only its two semesters');

    const invalidTermText = validate({ term: 'Term 1' });
    assert.match(invalidTermText.error || '', /valid term/, 'invalid term text is not silently replaced with the current term');

    const omittedTerm = validate({ term: undefined, indicatorCodes: [] });
    assert.equal(omittedTerm.error, undefined, 'legacy requests without a term still use the server current term');
    process.stdout.write('Study Notes indicator selection validation tests passed.\n');
  } finally {
    Schemes.lookup = originalLookup;
  }
}

(async () => {
  const curriculumRoute = require('../api/curriculum');
  const res = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body; } };
  await curriculumRoute({
    method: 'GET',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    query: { subject: 'Computing', cls: 'SHS 1', term: '3', week: '2' }
  }, res);
  assert.equal(res.statusCode, 400, 'the curriculum endpoint rejects a third SHS semester');
  process.stdout.write('Curriculum endpoint term validation tests passed.\n');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

