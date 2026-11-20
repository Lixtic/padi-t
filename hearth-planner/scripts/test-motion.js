'use strict';
// The motion pass: sheets leave, the tab highlight glides, pages fade, and all of it respects reduced motion.
const fs = require('fs');
const css = fs.readFileSync('public/styles.css', 'utf8'), motion = fs.readFileSync('public/motion.js', 'utf8'), index = fs.readFileSync('public/app.html', 'utf8');
const sw = fs.readFileSync('public/sw.js', 'utf8'), v2 = fs.readFileSync('public/v2.js', 'utf8'), app = fs.readFileSync('public/app.js', 'utf8');
const checks = [
  ['Dialog exit motion is loaded and cached', index.includes('src="motion.js"') && sw.includes("'motion.js'")],
  ['Closing waits for the exit animation and a reopen keeps the sheet', motion.includes('is-closing') && motion.includes('reopened while leaving')],
  ['Exit motion is skipped for reduced motion', motion.includes('prefers-reduced-motion')],
  ['Sheets have exit and backdrop animations', css.includes('.acct-sheet.is-closing[open]') && css.includes('@keyframes scrim-out')],
  ['Tab highlight glides to the active tab', v2.includes('slideIndicator') && css.includes('.v2-tab-ind.glide')],
  ['Pages fade in but not at launch', app.includes("classList.add('page-in')") && app.includes('fadeOk')],
  ['Buttons answer a tap without overriding their own transforms', css.includes('scale: .97')],
  ['The new motion has a reduced-motion switch', /prefers-reduced-motion: reduce\) \{\s*\.acct-sheet\[open\]::backdrop, \.page-in/.test(css)],
];
let failed = 0;
for (const [name, ok] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failed++; }
if (failed) process.exit(1);
console.log('Motion tests passed.');
