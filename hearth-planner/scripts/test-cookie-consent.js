const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'public');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const index = read('index.html');
const consent = read('cookie-consent.js');
const ads = read('ads.js');
const rewarded = read('rewarded.js');
const privacy = read('privacy.html');
const checks = [
  ['Consent manager is loaded on the app', index.includes('cookie-consent.js')],
  ['Consent styles are loaded on the app', index.includes('cookie-consent.css')],
  ['AdSense is not loaded directly in the document head', !index.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=')],
  ['Consent offers accept and reject separately', consent.includes('data-gc="accept"') && consent.includes('data-gc="reject"')],
  ['Optional analytics remain off', consent.includes('analytics: false')],
  ['Consent records include a version and timestamp', consent.includes('version: VERSION') && consent.includes('updatedAt: new Date().toISOString()')],
  ['AdSense requires explicit marketing consent', ads.includes("window.GuidedConsent.allowed('marketing')")],
  ['Rewarded video requires explicit marketing consent', rewarded.includes("!window.GuidedConsent.allowed('marketing')")],
  ['Privacy notice explains consent withdrawal', privacy.includes('withdraw it at any time') || privacy.includes('withdrawal')]
];
let failed = 0;
for (const [name, ok] of checks) { console.log((ok ? 'PASS' : 'FAIL') + ' ' + name); if (!ok) failed++; }
if (failed) process.exit(1);
