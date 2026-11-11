'use strict';
const assert = require('node:assert/strict');
const Search = require('../api/media-search')._test;

assert.deepEqual(Search.keywords('Input Devices Computing Basic 7 educational diagram'), 'input devices computing');
assert.equal(Search.relevant({ title: 'Computer keyboard', description: 'A keyboard used to enter data' }, 'input devices computing'), false);
assert.equal(Search.relevant({ title: 'Input devices', description: 'Keyboard and mouse' }, 'input devices computing'), true);
assert.equal(Search.relevant({ title: 'A keyboard', description: 'A musical instrument' }, 'input devices'), false);
assert.equal(Search.relevant({ title: 'Parts of a computer system', description: 'Main components' }, 'parts computer system'), true);
const ranked = Search.rankAndFilter([
  { title: 'Keyboard instrument', description: 'Music', thumbnail: 'https://img.example/a.jpg', url: 'https://site.example/a' },
  { title: 'Input devices', description: 'Computer keyboard and mouse', thumbnail: 'https://img.example/b.jpg', url: 'https://site.example/b' }
], 'input devices computer');
assert.equal(ranked.length, 1);
assert.equal(ranked[0].title, 'Input devices');
const rank = (arr) => Search.rankAndFilter(arr, 'input devices computer', true);
const wiki = rank([{ title: 'Input devices', description: 'Computer devices', thumbnail: 'https://i.example/w.jpg', url: 'https://w.example/1' }]);
const open = rank([{ title: 'Input devices computer', description: 'Computer input devices', thumbnail: 'https://i.example/o.jpg', url: 'https://o.example/1' },
  { title: 'Input devices', description: 'Computer devices', thumbnail: 'https://i.example/w.jpg', url: 'https://w.example/1' }]);
const names = ['Wiki', 'Open', 'Pixabay'];
const merged = Search.mergeProviders([{ status: 'fulfilled', value: wiki }, { status: 'fulfilled', value: open }, { status: 'rejected', reason: new Error('HTTP 429') }], names);
assert.equal(merged.results.length, 2, 'duplicates removed');
assert.equal(merged.results[0].url, 'https://o.example/1', 'best match wins across providers');
assert.ok(!('_score' in merged.results[0]), 'score is not sent to the browser');
assert.deepEqual(merged.errors, ['Pixabay: HTTP 429']);
assert.equal(merged.allFailed, false);
const dead = Search.mergeProviders(names.map(() => ({ status: 'rejected', reason: new Error('timeout') })), names);
assert.equal(dead.allFailed, true);
assert.equal(dead.results.length, 0);
process.stdout.write('Educational image relevance tests passed.\n');
