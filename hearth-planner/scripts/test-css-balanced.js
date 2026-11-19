'use strict';
// A missing closing brace swallows every rule after it (it once hid the auth, tour, phone and home styles inside a reduced-motion block).
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '../public');
let failed = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.css'))) {
  const css = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');
  let depth = 0, bad = 0;
  for (const ch of css) { if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth < 0) { bad = 1; depth = 0; } } }
  const ok = depth === 0 && !bad;
  console.log((ok ? 'PASS ' : 'FAIL ') + f + ' braces are balanced'); if (!ok) failed++;
}
if (failed) process.exit(1);
console.log('CSS balance tests passed.');
