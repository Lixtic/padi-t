'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'auth-refresh.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
for (const id of ['acctSheet', 'asGoogle', 'asPhone', 'asEmailBtn', 'asEmail', 'asPassword', 'asTabs', 'asTabIn', 'asTabUp']) {
  assert.match(html, new RegExp('id="' + id + '"'), 'missing auth control: ' + id);
}
assert.doesNotMatch(html, /id="asCreateAccount"|id="asGuest"/, 'the two extra bottom actions are removed');
assert.match(html, /auth-book[\s\S]*?viewBox="0 0 360 150"/, 'compact decorative book illustration is present');
assert.match(css, /max-width: 560px[\s\S]*?height: 100dvh/, 'mobile auth view fills the viewport');
assert.match(css, /max-height: 760px[\s\S]*?auth-book/, 'short screens get a reduced illustration');
assert.match(app, /sheet\.tabs\.hidden = special \|\| folded/, 'account tabs appear after choosing email and stay out of the social-first view');
assert.match(app, /sheet\.tabUp\.addEventListener\('click', \(\) => setMode\('signup'\)\)/, 'email sign-up remains available through the account tab');
assert.doesNotMatch(app, /asCreateAccount|asGuest/, 'removed buttons have no leftover event handlers');
console.log('Auth screen tests passed.');
