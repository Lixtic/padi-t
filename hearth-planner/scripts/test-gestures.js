// Touch gestures: script is loaded before app.js, cached by the service worker, hooked up in app.js, and cards cannot be selected.
const fs = require('fs'), assert = require('assert');
const html = fs.readFileSync('public/index.html', 'utf8'), sw = fs.readFileSync('public/sw.js', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8'), css = fs.readFileSync('public/v2.css', 'utf8'), g = fs.readFileSync('public/gestures.js', 'utf8');
assert(html.indexOf('src="gestures.js"') > -1 && html.indexOf('src="gestures.js"') < html.indexOf('src="app.js"'), 'gestures.js loads before app.js');
assert(/'gestures\.js'/.test(sw), 'service worker caches gestures.js');
assert(/GuidedGestures\.configure\(\{[\s\S]*refresh:[\s\S]*back:/.test(app), 'app.js supplies refresh and back');
assert(/guided:swipe-left/.test(app) && /guided:swipe-left/.test(g), 'swipe-left opens the card actions');
assert(/\.lib-card[^{]*\{[^}]*user-select:\s*none/.test(css), 'library cards are not text-selectable');
assert(!/<script(?![^>]*src)/.test(g), 'no inline script');
console.log('PASS gestures');
