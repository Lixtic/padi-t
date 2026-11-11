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

process.stdout.write('Curriculum Intelligence Engine tests passed.\n');
