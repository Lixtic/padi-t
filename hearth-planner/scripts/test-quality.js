'use strict';
const assert = require('node:assert/strict');
const Quality = require('../api/_quality');

const notes = [
  '# Study Notes',
  '## Learning Objectives',
  'By the end of the lesson, learners will identify input devices.',
  '## Input devices',
  'A keyboard is used to enter data into a computer.',
  '## Summary',
  'Input devices send data into a computer.',
  '## Review Questions',
  '1. What is an input device?',
  '2. Give two examples of input devices.'
].join('\n');

const clean = Quality.inspect(notes, { mode: 'resources', resourceType: 'Study notes', scheme: { indicators: ['B7.1.1.1.2 Demonstrate use of input devices'] } });
assert.equal(clean.status, 'structural_checks_passed');
assert.equal(clean.blockingCount, 0);

const missingNotes = Quality.inspect('# Study Notes\nA short note.', { mode: 'resources', resourceType: 'Study notes' });
assert.equal(missingNotes.status, 'needs_revision');
assert.ok(missingNotes.issues.some((x) => x.code === 'summary'));

const worksheet = Quality.inspect('# Worksheet\nAnswer all questions.\n1. What is a keyboard?', { mode: 'resources', resourceType: 'Learner worksheet' });
assert.ok(worksheet.issues.some((x) => x.code === 'answer_key' && x.severity === 'blocking'));

const slides = Quality.inspect(Array.from({ length: 6 }, (_, i) => '## Slide ' + (i + 1) + ': Topic').join('\n'), { mode: 'resources', resourceType: 'Teaching slides' });
assert.ok(slides.issues.some((x) => x.code === 'slide_count'));

const fabricated = Quality.inspect('# Study Notes\nOfficial NaCCA exemplar says so.\n## Summary\n## Review Questions\nWhat is this?', { mode: 'resources', resourceType: 'Study notes' }, {});
assert.ok(fabricated.issues.some((x) => x.code === 'official_claims' && x.severity === 'blocking'));

const cited = Quality.inspect('# Study Notes\n## Summary\n## Review Questions\nWhat is this?\n## Sources\n- Book, page 4', { mode: 'resources', resourceType: 'Study notes' }, { retrievedSourceCount: 1 });
assert.equal(cited.issues.some((x) => x.code === 'retrieved_source_citations'), false);

const wrongCode = Quality.inspect(notes + '\nCurriculum indicator B8.2.1.1.1', { mode: 'resources', resourceType: 'Study notes', scheme: { indicators: ['B7.1.1.1.2 Demonstrate use of input devices'] } });
assert.ok(wrongCode.issues.some((x) => x.code === 'curriculum_code_scope'));

process.stdout.write('Teaching content quality checks passed.\n');