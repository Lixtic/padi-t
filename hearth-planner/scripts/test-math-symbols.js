'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const prompt = fs.readFileSync(path.join(root, 'prompts/ges-lesson-plans.md'), 'utf8');
const generatedPrompt = fs.readFileSync(path.join(root, 'api/_prompt.js'), 'utf8');
const source = fs.readFileSync(path.join(root, 'public/markdown.js'), 'utf8');
const window = {};
vm.runInNewContext(source, { window });

const symbols = '× ÷ ± ≠ ≈ ≤ ≥ √ ∑ π θ ° ∞ ∠ ∈ ∉ ∩ ∪ ∅ − ½ ⅓ ⅔ ¼ ¾ x² x³ a₁ x₂';
const rendered = window.GuidedMarkdown.renderMd('Worked example: 3 × 4 ÷ 2 = 6; x² + 2x + 1 = 0; √49 = 7; ½ + ¼ = ¾. ' + symbols);
for (const symbol of symbols.split(' ')) {
  assert.ok(rendered.includes(symbol), 'Markdown rendering must preserve ' + symbol);
}
assert.match(prompt, /Mathematical notation must be complete and visible/);
assert.match(prompt, /multiplication × \(not the letter x\)/);
assert.match(prompt, /Use proper powers and indices/);
assert.match(generatedPrompt, /Mathematical notation must be complete and visible/);
assert.match(generatedPrompt, /multiplication ×/);
assert.doesNotMatch(prompt, /No LaTeX/);

process.stdout.write('Mathematical notation preservation tests passed.\n');
