// Checks the www -> app data bridge: what is copied, what is skipped, and that nothing is overwritten.
const assert = require('assert');
const { snapshot } = require('../public/migrate.js');
const { importData } = require('../public/migrate-in.js');
const mk = (o) => { const s = Object.assign({}, o); return { get length() { return Object.keys(s).length; }, key: (i) => Object.keys(s)[i], getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, _s: s }; };
const www = mk({ 'schoolpadi.planner.v1': 'P', 'guided.myschemes.v1': 'S', 'gd.pillsOpen': '1', 'schoolpadi.auth': 'SECRET', 'schoolpadi.access': 'T', 'guided.signedIn': '1', 'guided.payref': 'x', 'guided.migrated.v1': '1', 'other.key': 'z' });
const snap = snapshot(www);
assert.deepStrictEqual(Object.keys(snap).sort(), ['gd.pillsOpen', 'guided.myschemes.v1', 'schoolpadi.planner.v1']);
const app = mk({ 'guided.myschemes.v1': 'MINE' });
assert.strictEqual(importData(app, snap), 2);
assert.strictEqual(app._s['guided.myschemes.v1'], 'MINE');
assert.strictEqual(app._s['schoolpadi.planner.v1'], 'P');
assert.strictEqual(importData(app, snap), 0);
console.log('PASS migrate bridge');
