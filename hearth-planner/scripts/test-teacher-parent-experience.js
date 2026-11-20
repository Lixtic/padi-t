'use strict';
// Regression guards for teacher delivery and parent home-learning experiences.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const app = fs.readFileSync('public/app.js', 'utf8');
const parent = fs.readFileSync('public/parent-dashboard.js', 'utf8');
const parentApi = fs.readFileSync('api/_parent-learning.js', 'utf8');
const css = fs.readFileSync('public/v2.css', 'utf8');

assert.match(app, /function renderDashboard\(\)/);
assert.match(app, /dashRecentList/);
assert.match(app, /function openReader\(title, source, onShare, canTeach\)/);
assert.match(app, /reader-delivery-view/);
assert.match(app, /Next section/);
assert.match(app, /canSharePlan && accountRole !== 'parent'/);
assert.match(css, /\.reader-delivery-content/);

assert.match(parent, /function renderLessonWizard\(\)/);
assert.match(parent, /function renderProgress\(\)/);
assert.match(parent, /worksheetHtml\(part\.body\.join/);
assert.match(parent, /worksheetHtml\(state\.result\.content\)/);
assert.match(parent, /state\.stageSaving = true; state\.error = ''; render\(\);/);
assert.match(parentApi, /profile\.primaryRole !== 'parent'/);
assert.match(parentApi, /childIds\.has\(childId\)/);
assert.match(parentApi, /childIds\.has\(String\(row\.data && row\.data\.childId \|\| ''\)\)/);
console.log('Teacher and parent experience tests passed.');
