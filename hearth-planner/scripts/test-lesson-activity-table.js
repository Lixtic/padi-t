'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/markdown.js'), 'utf8');
const window = {};
vm.runInNewContext(source, { window });
const renderMd = window.GuidedMarkdown.renderMd;

const joined = [
  '| | | |',
  '|---|---|---|',
  '| **School:** Daboya | **Subject:** Integrated Science | **Week:** 1 |',
  '| **Lesson 1: Parts of a computer** | | |',
  '| **PHASE / DURATION** | **LEARNING ACTIVITIES** | **RESOURCES** |',
  '| **Phase 1: Starter (10 mins)** | **Teacher:** Shows a monitor. **Learners:** Name it. | Monitor |',
  '| **Phase 2: Main Instruction (40 mins)** | **Teacher:** Explains input devices. **Learners:** Sort examples. | Keyboard, mouse |',
].join('\n');
const html = renderMd(joined);
assert.match(html, /<tr class="ph">/);
assert.match(html, /<th>[\s\S]*PHASE \/ DURATION[\s\S]*<\/th>/);
assert.match(html, /<td[^>]*>[\s\S]*Phase 1: Starter/);
assert.match(html, /<td[^>]*>[\s\S]*Teacher:[\s\S]*Learners:/);
assert.doesNotMatch((html.match(/<th\b[^>]*>[\s\S]*?<\/th>/g) || []).join(''), /Phase 1: Starter/);

const normal = renderMd([
  '| PHASE / DURATION | LEARNING ACTIVITIES | RESOURCES |',
  '|---|---|---|',
  '| Phase 1: Starter (10 mins) | Teacher: asks a question. Learners: respond. | Chalkboard |',
].join('\n'));
assert.match(normal, /<thead>/);
assert.match(normal, /<td>[\s\S]*Phase 1: Starter/);
console.log('Lesson activity table rendering checks passed.');
