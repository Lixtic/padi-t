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
// Context only ranks: a good image is not dropped for lacking the subject word, but the on-subject one comes first.
const withCtx = Search.rankAndFilter([
  { title: 'Cell (prison)', description: 'A jail cell', thumbnail: 'https://img.example/p.jpg', url: 'https://site.example/p' },
  { title: 'Animal cell diagram', description: 'Labelled biology diagram', thumbnail: 'https://img.example/c.jpg', url: 'https://site.example/c' },
], 'cell', 'biology integrated science');
assert.equal(withCtx[0].title, 'Animal cell diagram');
// Topic context disambiguates short concepts and also participates in provider search.
assert.equal(Search.relevant({ title: 'Prison cell', description: 'A jail cell' }, 'cell', 'Basic 7 Biology'), false);
assert.equal(Search.relevant({ title: 'Animal cell diagram', description: 'A labelled biology cell structure' }, 'cell', 'Basic 7 Biology'), true);
assert.equal(Search.relevant({ title: 'Computer keyboard', description: 'Input hardware for a computer' }, 'keyboard', 'Introduction to Computer Systems'), true);
assert.equal(Search.relevant({ title: 'Keyboard instrument', description: 'A musical instrument' }, 'keyboard', 'Introduction to Computer Systems'), false);

// YouTube candidates must match the requested concept and lesson context.
const videos = Search.rankVideos([
  { title: 'Animal cell structure explained', description: 'Biology lesson on organelles', channel: 'Science Classroom', thumbnail: 'https://img.example/v1.jpg', url: 'https://youtube.com/watch?v=1' },
  { title: 'Prison cell tour', description: 'Inside a jail', channel: 'Travel Channel', thumbnail: 'https://img.example/v2.jpg', url: 'https://youtube.com/watch?v=2' },
  { title: 'Cell phone review', description: 'Latest smartphone features', channel: 'Tech Reviews', thumbnail: 'https://img.example/v3.jpg', url: 'https://youtube.com/watch?v=3' },
], 'cell', 'Basic 7 Biology');
assert.equal(videos.length, 1);
assert.equal(videos[0].title, 'Animal cell structure explained');
assert.equal(Search.rankVideos([
  { title: 'How to build a computer network', description: 'Networking basics', channel: 'Computing Lessons', thumbnail: 'https://img.example/v4.jpg', url: 'https://youtube.com/watch?v=4' },
  { title: 'Network marketing tips', description: 'Business sales', channel: 'Business Channel', thumbnail: 'https://img.example/v5.jpg', url: 'https://youtube.com/watch?v=5' },
], 'computer network', 'Basic 8 Computing').length, 1);

// The same picture from two providers appears once.
assert.equal(Search.dedupe([
  { title: 'Map of Africa.png', author: 'A', thumbnail: 'https://img.example/m.png?w=800' },
  { title: 'Map of Africa', author: 'A', thumbnail: 'https://other.example/m2.png' },
  { title: 'Other', thumbnail: 'https://img.example/o.png' },
]).length, 2);
// Flickr is searched only for licences that allow commercial use, and shows the licence name, not its number.
assert.ok(!('1' in Search.FLICKR_LICENSES) && !('2' in Search.FLICKR_LICENSES) && !('3' in Search.FLICKR_LICENSES), 'no NonCommercial licences');
assert.equal(Search.FLICKR_LICENSES[4], 'CC BY 2.0');
process.stdout.write('Educational image relevance tests passed.');
// Every host an illustration can be loaded from must be allowed by the page's Content-Security-Policy,
// otherwise the notes show an empty box and only the source link works.
const csp = JSON.stringify(require('../vercel.json'));
['upload.wikimedia.org', 'cdn.pixabay.com', 'images.pexels.com', 'live.staticflickr.com', 'api.openverse.org'].forEach((host) => assert.ok(csp.includes(host), 'CSP img-src is missing ' + host));
process.stdout.write('\nIllustration host tests passed.\n');
