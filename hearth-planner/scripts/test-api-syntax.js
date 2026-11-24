'use strict';
// Every serverless file must load: a syntax error in one file takes down every route that requires it.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const dir = path.join(__dirname, '..', 'api');
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
  try { execFileSync(process.execPath, ['--check', path.join(dir, f)], { stdio: 'pipe' }); }
  catch (e) { process.stderr.write('Syntax error in api/' + f + '\n' + String(e.stderr || e.message) + '\n'); process.exit(1); }
}
process.stdout.write('API syntax tests passed.\n');
