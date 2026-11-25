'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'auth-refresh.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
for (const id of ['acctSheet', 'asGoogle', 'asPhone', 'asEmailBtn', 'asEmail', 'asPassword', 'asCreateAccount', 'asGuest']) {
  assert.match(html, new RegExp('id="' + id + '"'), 'missing auth control: ' + id);
}
assert.match(html, /auth-book[\s\S]*?viewBox="0 0 360 150"/, 'compact decorative book illustration is present');
assert.match(css, /max-width: 560px[\s\S]*?height: 100dvh/, 'mobile auth view fills the viewport');
assert.match(css, /max-height: 760px[\s\S]*?auth-book/, 'short screens get a reduced illustration');
assert.match(app, /createAccountAction\.addEventListener\('click'/, 'create-account CTA opens the existing signup flow');
assert.match(app, /guestAction\.addEventListener\('click', closeSheet\)/, 'guest CTA closes auth without requiring an account');
console.log('Auth screen tests passed.');
