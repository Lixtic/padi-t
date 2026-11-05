const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const entry = path.join(root, 'scripts', 'realtime-entry.js');
const out = path.join(root, 'public', 'vendor', 'neon-realtime.js');

esbuild.buildSync({
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  outfile: out,
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  legalComments: 'none',
});
console.log('Wrote', path.relative(process.cwd(), out));
