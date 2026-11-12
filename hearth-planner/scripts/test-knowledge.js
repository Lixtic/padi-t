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
assert.equal(source.trust, 'reviewed_resource');
assert.throws(() => K.validateSource({ title: 'Textbook', publisher: 'Publisher', sourceUrl: 'https://publisher.example/book.pdf', documentType: 'approved_textbook', subject: 'Computing' }), /approval-register/);
const approved = K.validateSource({ title: 'Approved text', publisher: 'Publisher', sourceUrl: 'https://publisher.example/book.pdf', documentType: 'approved_textbook', subject: 'Computing', approvalReference: 'NaCCA register entry 2026-01' });
assert.equal(approved.trust, 'reviewed_resource');
assert.equal(K.trustAfterReview({ source_host: 'publisher.example', document_type: 'approved_textbook', approval_reference: 'NaCCA register entry 2026-01' }), 'approved_material');
assert.equal(K.trustAfterReview({ source_host: 'nacca.gov.gh', document_type: 'curriculum', approval_reference: '' }), 'official');
assert.equal(K.trustAfterReview({ source_host: 'publisher.example', document_type: 'teacher_resource', approval_reference: '' }), 'reviewed_resource');
const externalCurriculum = K.validateSource({ title: 'Unverified curriculum', publisher: 'Unknown', sourceUrl: 'https://example.org/curriculum.pdf', documentType: 'curriculum', subject: 'Computing' });
assert.equal(externalCurriculum.trust, 'reviewed_resource');
assert.deepEqual(source.curriculumCodes, ['B7.1.1.1.2']);
assert.throws(() => K.validateSource({ title: 'Bad', publisher: 'X', sourceUrl: 'http://example.com/file.pdf', subject: 'Computing' }), /HTTPS/);
const chunks = K.splitText(('A useful curriculum passage about learning outcomes and classroom practice. ').repeat(60), 17);
assert.ok(chunks.length > 1);
assert.ok(chunks.every(x => x.pageStart === 17 && x.content.length <= 1400));

const mapped = K.prepareChunks({
  segments: [{ page: 4, heading: 'Input devices', text: ('Input devices capture data. ').repeat(20), curriculumCodes: ['B7.1.1.1.2'] }]
}, source);
assert.deepEqual(mapped[0].curriculumCodes, ['B7.1.1.1.2']);
assert.equal(mapped[0].heading, 'Input devices');

assert.match(K.requestQuery({ subject: 'Computing', cls: 'Basic 7', scheme: { indicators: ['B7.1.1.1.2 Use input devices'] } }), /input devices/);
assert.doesNotMatch(K.requestQuery({ scheme: { indicators: ['B7.1.1.1.2 Use input devices'] } }), /B7\.1/);
// Retrieval helpers: OR query with stemming-ready terms, subject aliases, host suffixes, overlap gate.
assert.deepEqual(K.queryTerms('Demonstrate understanding of input devices on the keyboard'), ['understanding', 'input', 'devices', 'keyboard']);
assert.equal(K.toTsQuery(['input', 'devices']), 'input | devices');
assert.deepEqual(K.subjectsFor('Integrated Science'), ['Integrated Science', 'Science']);
assert.deepEqual(K.subjectsFor('Mathematics'), ['Mathematics']);
assert.equal(K.isTrustedHost('www.nacca.gov.gh'), true);
assert.equal(K.isTrustedHost('standard.nacca.gov.gh'), true);
assert.equal(K.isTrustedHost('evilnacca.gov.gh'), false);
assert.equal(K.trustAfterReview({ source_host: 'standard.nacca.gov.gh', document_type: 'curriculum', approval_reference: '' }), 'official');
const terms = K.queryTerms('input devices keyboard scanner computer');
assert.equal(K.enoughOverlap('Input devices capture data such as a keyboard and a scanner', terms, false), true);
assert.equal(K.enoughOverlap('Weather in Accra today and a keyboard', terms, false), false);
assert.equal(K.enoughOverlap('Unrelated text', terms, true), true);

// A failed chunk insert must remove the half-loaded source.
(async () => {
  const calls = [];
  global.__PADI_SQL__ = { query: async (text) => {
    calls.push(text);
    if (/^create|^alter|^select 1/i.test(text)) return [];
    if (/select id from knowledge_sources where checksum/.test(text)) return [];
    if (/insert into knowledge_chunks/.test(text)) throw new Error('boom');
    return [];
  } };
  process.env.DATABASE_URL = 'postgres://test';
  await assert.rejects(K.ingest({ title: 'T', publisher: 'P', sourceUrl: 'https://nacca.gov.gh/a.pdf', subject: 'Computing', segments: [{ page: 1, text: 'Input devices capture data. '.repeat(20) }] }, 'admin'), /boom/);
  assert.ok(calls.some((c) => /^delete from knowledge_sources/.test(c)), 'the source is removed when chunk insert fails');
  delete global.__PADI_SQL__;
  process.stdout.write('Knowledge retrieval tests passed.\n');
})();
