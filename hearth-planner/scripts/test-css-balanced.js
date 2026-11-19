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
// A rule that sets display on a dialog without [open] overrides the browser's "closed dialogs are hidden" and shows the sheet's contents in the page.
const all = fs.readdirSync(dir).filter((x) => x.endsWith('.css')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');
const leaks = [];
for (const m of all.matchAll(/(^|[}{;])\s*((?:#\w*Sheet|\.acct-sheet|dialog)[^{},]*)\{([^}]*)\}/g)) {
  const sel = m[2].trim();
  if (/^(#\w*Sheet|\.acct-sheet|dialog)$/.test(sel) && !/\[open\]|:not\(\[open\]\)|::|:is\(|:where\(/.test(sel) && /(^|;|\s)display\s*:\s*(?!none)/.test(m[3])) leaks.push(sel);
}
console.log((leaks.length ? 'FAIL ' : 'PASS ') + 'closed dialogs stay hidden' + (leaks.length ? ': ' + leaks.join(' | ') : ''));
if (leaks.length) failed++;
if (failed) process.exit(1);
console.log('CSS balance tests passed.');
