'use strict';
const assert = require('node:assert/strict');
const K = require('../api/_knowledge');

assert.equal(K.TRUSTED_HOSTS.has('nacca.gov.gh'), true);
const source = K.validateSource({
  title: 'NaCCA Computing CCP Curriculum', publisher: 'NaCCA, Ministry of Education',
  sourceUrl: 'https://nacca.gov.gh/wp-content/uploads/2023/06/COMPUTING.pdf',
  documentType: 'curriculum', subject: 'Computing', classes: ['Basic 7', 'Basic 8', 'Basic 9'],
  curriculumCodes: ['B7.1.1.1.2', 'invalid'], license: '© NaCCA'
});
assert.equal(source.trust, 'official');
assert.throws(() => K.validateSource({ title: 'Textbook', publisher: 'Publisher', sourceUrl: 'https://publisher.example/book.pdf', documentType: 'approved_textbook', subject: 'Computing' }), /approval-register/);
const approved = K.validateSource({ title: 'Approved text', publisher: 'Publisher', sourceUrl: 'https://publisher.example/book.pdf', documentType: 'approved_textbook', subject: 'Computing', approvalReference: 'NaCCA register entry 2026-01' });
assert.equal(approved.trust, 'approved_material');
assert.deepEqual(source.curriculumCodes, ['B7.1.1.1.2']);
assert.throws(() => K.validateSource({ title: 'Bad', publisher: 'X', sourceUrl: 'http://example.com/file.pdf', subject: 'Computing' }), /HTTPS/);
const chunks = K.splitText(('A useful curriculum passage about learning outcomes and classroom practice. ').repeat(60), 17);
assert.ok(chunks.length > 1);
assert.ok(chunks.every(x => x.pageStart === 17 && x.content.length <= 1400));
assert.match(K.requestQuery({ subject: 'Computing', cls: 'Basic 7', scheme: { indicators: ['B7.1.1.1.2 Use input devices'] } }), /input devices/);
assert.doesNotMatch(K.requestQuery({ scheme: { indicators: ['B7.1.1.1.2 Use input devices'] } }), /B7\\.1/);
process.stdout.write('Knowledge retrieval tests passed.\n');
