'use strict';
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const Audit = require('../scripts/audit-curriculum-index');

const root = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/curriculum-index.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/curriculum-verification.json'), 'utf8'));
const register = JSON.parse(fs.readFileSync(path.join(root, 'data/curriculum-source-register.json'), 'utf8'));

assert.equal(data.count, 966);
assert.equal(Object.keys(data.indicators).length, data.count);
assert.equal(manifest.status, 'unverified_database_export');
assert.deepEqual(manifest.verifiedIndicators, [], 'no record is promoted without page-level human verification');
assert.equal(register.sources.length, 8);
assert.ok(register.sources.every((s) => s.listedOnOfficialIndex && s.sourceUrl.startsWith('https://nacca.gov.gh/')));
assert.ok(register.sources.some((s) => s.subject === 'Social Studies' && s.sourceUrl.includes('2024/04/Social-Studies_CCP_JHS-1-3_Revised-1.pdf')));

const indexedSubjects = [...new Set(Object.keys(data.indicators).map((key) => key.split('|')[0]))].sort();
const registeredSubjects = register.sources.map((s) => s.subject).sort();
assert.deepEqual(registeredSubjects, indexedSubjects, 'every subject in the structured index has an official source-register entry');

const fixture = {
  source: 'test export',
  exportedAt: 'test',
  count: 1,
  indicators: {
    'Computing|B7.1.1.1.1': ['word word word', 'B7.1.1.1', 'standard', 'sub-strand', 'strand', ['example']]
  }
};
const fixtureReport = Audit.audit(fixture, { schemaVersion: 1, verifiedIndicators: [] });
assert.ok(fixtureReport.issues[0].issues.includes('repeated_whitespace_or_punctuation'));
assert.equal(fixtureReport.issueCounts.repeated_whitespace_or_punctuation, 1);

const jsonOutput = execFileSync(process.execPath, [path.join(__dirname, 'audit-curriculum-index.js'), '--json'], { encoding: 'utf8' });
const parsed = JSON.parse(jsonOutput);
assert.equal(parsed.actualCount, 966);
assert.equal(parsed.sourceRegister.sources.length, 8);
assert.deepEqual(parsed.structuralErrors, []);
process.stdout.write('Curriculum reconciliation register and JSON audit tests passed.\\n');
