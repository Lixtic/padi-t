'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'api/generate.js'), 'utf8');
const reserveAt = source.indexOf("if (ent && ent.tier === 'free' && (planTurn || parentTurn))");
const cacheAt = source.indexOf('// 1. A repeat of a recent request', reserveAt);
const freshAt = source.indexOf('const fresh = body.fresh === true && !guest');
assert.ok(freshAt >= 0, 'regeneration flag is recognised for signed-in accounts');
assert.ok(reserveAt >= 0 && cacheAt > reserveAt, 'weekly reservation happens before cache lookup');
const reserveBlock = source.slice(reserveAt, cacheAt);
assert.ok(!/!fresh|fresh\s*&&/.test(reserveBlock), 'fresh regeneration cannot bypass the free weekly reservation');
assert.match(reserveBlock, /reserveFreeParent\(ent\)/, 'parent activities reserve their own weekly allowance');
assert.match(reserveBlock, /reserveFree\(ent, v\.params\.cls\)/, 'teacher plans reserve against the selected class');
assert.match(source, /if \(freeReservation\) \{\s*try \{ await Entitle\.commitFree\(freeReservation\);/,
  'a cached free response consumes its reserved weekly slot');
assert.match(source, /if \(freeReservation\) await Entitle\.releaseFree\(freeReservation\)\.catch\(\(\) => \{\}\);\s*return sendJson\(res, e\.status/,
  'provider startup failure releases the weekly reservation');
assert.match(source, /tasks\.push\(complete \? Entitle\.commitFree\(freeReservation\) : Entitle\.releaseFree\(freeReservation\)\)/,
  'completed streams commit while interrupted or empty streams release the reservation');
console.log('Generation entitlement bypass regression tests passed.');
