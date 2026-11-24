'use strict';
// Acceptance checks for GuidEd's six product principles.
// These verify implementation safeguards; they do not certify factual accuracy.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const Curriculum = require('../api/_curriculum');
const Quality = require('../api/_quality');
const manifest = JSON.parse(read('data/curriculum-verification.json'));

// 1. Curriculum first: unverified exports cannot become official exemplars.
assert.equal(manifest.status, 'unverified_database_export');
assert.equal(manifest.verifiedIndicators.length, 0);
assert.equal(Curriculum.officialFor('Computing', 'B7.1.1.1.1'), null);
const fabricated = Quality.inspect('# Study Notes\\nOfficial NaCCA exemplar says so.\\n## Summary\\n## Review Questions\\nWhat is this?', { mode: 'resources', resourceType: 'Study notes' });
assert.ok(fabricated.issues.some((issue) => issue.code === 'official_claims' && issue.severity === 'blocking'));

// 2. Teacher control: saved work has an explicit edit path.
const app = read('public/app.js');
assert.ok(app.includes('function editSavedSession'));
assert.ok(app.includes('data-act="edit"'));

// 3–4. Parent simplicity and Ghanaian relevance.
const generation = read('api/generate.js');
assert.ok(generation.includes('Ghanaian parent or caregiver'));
assert.ok(generation.includes('never assume a computer, electricity or internet'));
assert.ok(generation.includes('Everyday Ghanaian example'));
const curriculum = read('api/_curriculum.js');
assert.ok(curriculum.includes('familiar to Ghanaian learners'));
const parent = read('public/parent-dashboard.js');
assert.ok(parent.includes('Plan a Home Lesson'));
assert.ok(parent.includes('Help Me Understand'));
assert.ok(!parent.includes('Assessment Rubric'));

// 5. Mobile-first: responsive breakpoints are present in the application styles.
const styles = read('public/styles.css') + read('public/v2.css');
assert.ok(styles.includes('@media'));

// 6. Offline resilience: shell fallback is cached, API calls are never cached.
const worker = read('public/sw.js');
assert.ok(worker.includes("url.pathname.startsWith('/api/')"));
assert.ok(worker.includes("caches.match('index.html')"));
assert.ok(app.includes('localStorage'));
assert.ok(app.includes('store.save'));

console.log('GuidEd product-principles acceptance checks passed.');
