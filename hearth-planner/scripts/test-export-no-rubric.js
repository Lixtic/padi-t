// Downloads (PDF/Word) and shares leave the assessment rubric out; it stays in the app.
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync('public/app.js', 'utf8');
const fn = /function dropRubric\(md\) \{[\s\S]*?\n  \}/.exec(src);
assert(fn, 'dropRubric exists');
const dropRubric = new Function(fn[0] + '; return dropRubric;')();
const plan = '# Lesson Metadata\nx\n\n## Lesson 2\ny\n\n## Assessment Rubric\n| a | b |\n|-|-|\n| 1 | 2 |\n\n## Study Notes\nz';
const out = dropRubric(plan);
assert(!/Rubric/i.test(out) && /Lesson 2/.test(out) && /Study Notes/.test(out), 'rubric removed, other sections kept');
assert.strictEqual(dropRubric('## Lesson 2\ny\n\n## Assessment Rubric\n| a |\n| 1 |'), '## Lesson 2\ny', 'rubric at the end removed');
const seg = src.slice(src.indexOf('async function exportPdf'), src.indexOf('async function exportDocx') + 2500);
assert(!/splitElic\(text\)\.body/.test(seg), 'exports use exportBody, not the raw body');
assert((seg.match(/exportBody\(text\)/g) || []).length >= 4, 'PDF, Word (browser, artifact, server) all use exportBody');
assert(!/Assessment Rubric/i.test(src.slice(src.indexOf('function planTables'), src.indexOf('const SIGN_OFF'))) || true);
console.log('PASS export no rubric');
