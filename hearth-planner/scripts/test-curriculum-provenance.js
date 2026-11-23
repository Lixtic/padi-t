'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const register = readJson('data/curriculum-source-register.json');
const reconciliation = readJson('data/curriculum-reconciliation.json');
const index = readJson('data/curriculum-index.json');
const manifest = readJson('data/curriculum-verification.json');

assert.equal(register.schemaVersion, 1);
assert.ok(register.sourcePortal.url.startsWith('https://nacca.gov.gh/'));
assert.equal(register.documents.length, 6, 'six NaCCA subject-source documents are registered');
const sourceIds = new Set();
for (const doc of register.documents) {
  assert.ok(doc.id && !sourceIds.has(doc.id), 'source IDs are present and unique');
  sourceIds.add(doc.id);
  assert.ok(doc.subject && doc.title && doc.publisher && doc.url, 'source identity fields are present');
  const host = new URL(doc.url).hostname.toLowerCase();
  assert.ok(host === 'nacca.gov.gh' || host === 'www.nacca.gov.gh', 'curriculum PDFs must be hosted on the official NaCCA domain');
  assert.deepEqual(doc.levels, ['Basic 7', 'Basic 8', 'Basic 9']);
  assert.equal(doc.checksumAlgorithm, 'SHA-256');
  if (!doc.checksum) assert.equal(doc.checksumStatus, 'not_captured', 'missing source hashes must be explicit');
  assert.notEqual(doc.reconciliationStatus, 'verified', 'document discovery alone never verifies curriculum records');
}
const computing = register.documents.find(d => d.id === reconciliation.sourceId);
assert.ok(computing, 'reconciliation points to a registered source');
assert.equal(computing.subject, 'Computing');
assert.equal(computing.comparison.sourceComparedRecords, 28);
assert.equal(computing.comparison.remainingRecords, 22);
assert.deepEqual(computing.comparison.batchIds, reconciliation.batches.map(b => b.id));

const reviewed = reconciliation.batches.flatMap(batch => {
  assert.ok(batch.id && batch.status.includes('pending_human_review'));
  assert.equal(batch.verified, undefined, 'no batch can self-promote to verified');
  for (const code of batch.codes) {
    assert.ok(index.indicators['Computing|' + code], 'reviewed code exists in export: ' + code);
  }
  for (const code of batch.sourceOnlyCodes || []) {
    assert.ok(!index.indicators['Computing|' + code], 'source-only code remains visibly absent from export: ' + code);
  }
  return batch.codes;
});
assert.equal(new Set(reviewed).size, reviewed.length, 'no exported indicator is counted twice');
assert.equal(reviewed.length, reconciliation.reviewedExportedIndicatorCount);
assert.equal(Object.keys(index.indicators).filter(k => k.startsWith('Computing|B7.')).length, reconciliation.totalExportedIndicatorCount);
const additional = reconciliation.additionalBatches.flatMap(batch => {
  assert.ok(batch.id && batch.status.includes('pending_human_review'));
  for (const code of batch.codes) assert.ok(index.indicators['Computing|' + code], 'additional source-compared code exists: ' + code);
  for (const anomaly of batch.sourceCodeAnomalies || []) {
    assert.equal(anomaly.normalizationAllowed, false, 'malformed source codes are never normalized automatically');
    assert.ok(!index.indicators['Computing|' + anomaly.likelyNormalizedCode], 'unconfirmed normalized source code remains absent');
  }
  return batch.codes;
});
assert.equal(additional.length, 11, 'first Basic 8 and Basic 9 batches compare 11 more exported records');
assert.equal(reconciliation.overallComparedExportedIndicatorCount, reviewed.length + additional.length);
assert.equal(reconciliation.overallRemainingComputingIndicators, 83);
assert.deepEqual(reconciliation.classComparisonCounts, {
  'Basic 7': { totalExported: 50, sourceCompared: 28, remaining: 22 },
  'Basic 8': { totalExported: 37, sourceCompared: 4, remaining: 33 },
  'Basic 9': { totalExported: 35, sourceCompared: 7, remaining: 28 }
});
assert.equal(reconciliation.totalExportedIndicatorCount - reviewed.length, reconciliation.remainingExportedIndicatorCount);
assert.equal(reconciliation.approval.verified, false);
assert.equal(reconciliation.approval.approvedManifestEntries, 0);
assert.equal(reconciliation.approval.correctionAppliedToCanonicalIndex, false);
assert.equal(manifest.status, 'unverified_database_export');
assert.equal(manifest.verifiedIndicators.length, 0, 'source comparison does not auto-approve records');

const C = require('../api/_curriculum');
for (const [subject, code] of [
  ['Computing', 'B7.1.1.1.1'],
  ['Computing', 'B8.1.1.1.1'],
  ['Computing', 'B9.1.1.1.2']
]) {
  assert.equal(C.officialFor(subject, code), null, subject + ' ' + code + ' stays blocked until per-indicator evidence is approved');
}
console.log('Curriculum provenance register and reconciliation tests passed.');
