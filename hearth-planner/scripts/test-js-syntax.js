'use strict';
// Syntax-check application and test JavaScript before the full suite runs.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'vendor' && entry.name !== 'node_modules') walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  }
}
for (const dir of ['api', 'public', 'scripts']) walk(path.join(root, dir));
for (const file of files) {
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
  catch (error) {
    process.stderr.write('Syntax error in ' + path.relative(root, file) + '\n' + String(error.stderr || error.message) + '\n');
    process.exit(1);
  }
}
process.stdout.write('JavaScript syntax checks passed (' + files.length + ' files).\n');
