// While a plan is being edited the phone tab bar folds into one small Home button; tapping it unfolds the bar.
const fs = require('fs'), assert = require('assert');
const js = fs.readFileSync('public/v2.js', 'utf8'), css = fs.readFileSync('public/v2.css', 'utf8');
assert(/doc-body\.editing/.test(js) && /tabbar-mini/.test(js), 'v2.js watches editing and toggles body.tabbar-mini');
assert(/addEventListener\('click'[\s\S]*tabbar-mini[\s\S]*true\)/.test(js), 'a tap on the mini bar unfolds it (capture phase, before the tab handlers)');
assert(/body\.tabbar-mini[^{]*\.v2-tabbar-pill[^{]*\{[^}]*max-width:\s*52px/.test(css), 'mini pill is a small circle');
assert(/body\.tabbar-mini[^{]*button:not\(:first-of-type\)[^{]*\{[^}]*opacity:\s*0/.test(css), 'other tabs fold away');
assert(/prefers-reduced-motion: reduce\)[\s\S]*v2-tabbar-pill/.test(css.slice(css.indexOf('tabbar-mini'))), 'reduced motion is respected');
console.log('PASS tabbar collapse');
