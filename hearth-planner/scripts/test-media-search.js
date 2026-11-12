'use strict';
const assert = require('node:assert/strict');
const Search = require('../api/media-search')._test;

assert.deepEqual(Search.keywords('Input Devices Computing Basic 7 educational diagram'), 'input device comput');
assert.equal(Search.relevant({ title: 'Computer keyboard', description: 'A keyboard used to enter data' }, 'input devices computing'), false);
assert.equal(Search.relevant({ title: 'Input devices', description: 'Keyboard and mouse' }, 'input devices computing'), true);
assert.equal(Search.relevant({ title: 'Computer input device', description: 'Keyboard and mouse' }, 'Input Devices'), true);

assert.equal(Search.relevant({ title: 'A keyboard', description: 'A musical instrument' }, 'input devices'), false);
assert.equal(Search.relevant({ title: 'Parts of a computer system', description: 'Main components' }, 'parts computer system'), true);
const ranked = Search.rankAndFilter([
  { title: 'Keyboard instrument', description: 'Music', thumbnail: 'https://img.example/a.jpg', url: 'https://site.example/a' },
  { title: 'Input devices', description: 'Computer keyboard and mouse', thumbnail: 'https://img.example/b.jpg', url: 'https://site.example/b' }
], 'input devices computer');
assert.equal(ranked.length, 1);
assert.equal(ranked[0].title, 'Input devices');
assert.deepEqual(['devices', 'computing', 'batteries', 'classes', 'process', 'analysis', 'string'].map(Search.stem), ['device', 'comput', 'battery', 'class', 'process', 'analysis', 'string']);
process.stdout.write('Educational image relevance tests passed.');
// Every host an illustration can be loaded from must be allowed by the page's Content-Security-Policy,
// otherwise the notes show an empty box and only the source link works.
const csp = JSON.stringify(require('../vercel.json'));
['upload.wikimedia.org', 'cdn.pixabay.com', 'images.pexels.com', 'live.staticflickr.com', 'api.openverse.org'].forEach((host) => assert.ok(csp.includes(host), 'CSP img-src is missing ' + host));
process.stdout.write('\nIllustration host tests passed.\n');
