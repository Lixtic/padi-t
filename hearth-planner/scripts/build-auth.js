const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
esbuild.buildSync({
  entryPoints: [path.join(root, 'scripts', 'auth-entry.js')],
  bundle: true,
  format: 'iife',
  outfile: path.join(root, 'public', 'vendor', 'neon-auth.js'),
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  legalComments: 'none',
});
console.log('Wrote public/vendor/neon-auth.js');
