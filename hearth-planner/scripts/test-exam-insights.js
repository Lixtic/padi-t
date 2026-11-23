'use strict';
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { firstMessage } = require('../api/_lib.js');
const EI = require('../api/_exam_insights.js');
const base = { term: 1, week: 4, studyNotes: false };

// Insights reach the request only for JHS, with BECE practice on.
const maths = firstMessage(Object.assign({ subject: 'Mathematics', cls: 'Basic 9', bece: true, mode: 'full' }, base));
assert.match(maths, /Examiner insights/);
assert.match(maths, /simplifying algebraic expressions/);
assert.match(maths, /GH¢/);
assert.doesNotMatch(firstMessage(Object.assign({ subject: 'Mathematics', cls: 'Basic 9', bece: false, mode: 'full' }, base)), /Examiner insights/);
assert.doesNotMatch(firstMessage(Object.assign({ subject: 'Mathematics', cls: 'Basic 9', bece: true, mode: 'plan' }, base)), /Examiner insights/);
assert.deepEqual(EI.lines('Mathematics', 'Basic 4'), []);
assert.deepEqual(EI.lines('Mathematics', 'SHS 2'), []);
assert.deepEqual(EI.lines('Physical Education and Health', 'Basic 8'), []);
assert.match(firstMessage(Object.assign({ subject: 'Integrated Science', cls: 'Basic 8', bece: true, mode: 'resources', resourceType: 'BECE practice' }, base)), /explaining processes/);

// Every JHS subject we have insights for names a format, weak areas and a marking tip.
for (const [name, s] of Object.entries(EI.DATA.subjects)) {
  assert.ok(s.format && s.weak.length >= 3 && s.strong.length >= 1 && s.tip, name + ' insights are incomplete');
  assert.ok(!/question\s*\d/i.test(JSON.stringify(s)), name + ' insights must not copy numbered WAEC questions');
}

// The prompt asks for the larger practice set.
const prompt = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'ges-lesson-plans.md'), 'utf8');
assert.match(prompt, /exactly 10 questions the way a BECE paper prints them/);
assert.match(prompt, /exactly 3 structured questions/);
assert.match(prompt, /Common mistakes to avoid/);
assert.match(require('../api/_prompt.js'), /exactly 3 structured questions/);
process.stdout.write('Exam insights tests passed.\n');
