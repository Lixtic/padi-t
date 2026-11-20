'use strict';
// Email confirmation by code: the sheet has the code screen, and the client wires it to Neon Auth's email-otp routes.
const fs = require('fs');
const index = fs.readFileSync('public/index.html', 'utf8'), sync = fs.readFileSync('public/sync.js', 'utf8'), app = fs.readFileSync('public/app.js', 'utf8');
const checks = [
  ['Sheet has a code screen', index.includes('id="asVerify"') && index.includes('id="asCode"') && index.includes('autocomplete="one-time-code"')],
  ['Client sends and verifies codes', sync.includes('/email-otp/send-verification-otp') && sync.includes('/email-otp/verify-email') && sync.includes("type: 'email-verification'")],
  ['Unconfirmed sign-in is recognised', /verification required/.test(sync) && sync.includes("e.code === 'verify'")],
  ['App opens the code screen for unconfirmed accounts', app.includes("code === 'verify' && err.email") && app.includes('showVerifyView')],
  ['Resend is rate limited on the page', app.includes('resendAt') && app.includes('Send a new code')],
];
let failed = 0;
for (const [name, ok] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failed++; }
if (failed) process.exit(1);
console.log('Email confirmation tests passed.');
