'use strict';
const assert = require('node:assert/strict');
const { audit } = require('./audit-curriculum-index');

const report = audit({
  source: 'fixture',
  exportedAt: '2026-11-12',
  count: 2,
  indicators: {
    'Computing|B7.1.1.1.1': [
      'Discuss computers Exemplar(s): unrelated text',
      'B7.1.1.1',
      'Examine computer systems',
      'Computer systems',
      'Introduction to Computing',
      ['Identify parts', 'CC7.4: Critical Thinking']
    ],
    'Mathematics|B7.1.1.1.2': [
      'Solve number problems',
      'B7.1.1.1',
      'Number operations',
      'Number',
      'Mathematics',
      []
    ]
  }
});

assert.equal(report.actualCount, 2);
assert.equal(report.countMatches, true);
assert.equal(report.subjects.Computing.records, 1);
assert.equal(report.subjects.Mathematics.missingExemplars, 1);
const computing = report.issues.find(x => x.key.startsWith('Computing|'));
assert.ok(computing.issues.includes('embedded_exemplar_label'));
assert.ok(computing.issues.includes('competency_code_in_content'));
assert.ok(computing.issues.includes('document_control_text'));
process.stdout.write('Curriculum index audit tests passed.\\n');
