// Builds dist/schoolpadi-artifact.html: one self-contained page for claude.ai artifacts.
// Claude writes the plans (sample capability); Word files are built in the browser (downloads capability).
//   node scripts/build-artifact.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');

const prompt = read('prompts/ges-lesson-plans.md').replace(/^---\n[\s\S]*?\n---\n/, '').trim();

let html = read('public/index.html');
let body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
body = body.replace(/<script\b[^>]*>\s*<\/script>/g, '');
body = body.replace(/<strong>Demo mode\.<\/strong>[\s\S]*?<\/div>/,
  "<strong>Demo mode.</strong> Claude is not available in this view, so Padi-T shows a sample plan on a fixed topic.\n        </div>");

const demoHint = 'Ask the site owner to add an API key in the Vercel environment variables, and Padi-T will write this for you.';
const sampleSrc = read('public/sample.js').split(demoHint).join('Claude is not available in this view.');

// Theme tokens: light values on bare :root; dark values for the system setting and the explicit toggle.
let css = read('public/styles.css');
const dark = css.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/);
if (!dark) throw new Error('dark theme block not found');
css = css.replace(':root[data-theme="light"] {', ':root, :root[data-theme="light"] {');
css += '\n@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {' + dark[1] + '\n  }\n}\n';

const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
const adapter = read('public/artifact-adapter.js').replace("'__GES_PROMPT__'", () => JSON.stringify(prompt));

const out = [
  '<title>Padi-T Lesson Planner</title>',
  '<style>', css, '</style>',
  body.trim(),
  '<script src="https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js"></script>',
  '<script>', safe(read('public/theme-init.js')), '</script>',
  '<script>', safe(read('public/plan-join.js')), '</script>',
  '<script>', safe(read('public/schemes.js')), '</script>',
  '<script>', safe(sampleSrc), '</script>',
  '<script>', safe(read('public/docx-export.js')), '</script>',
  '<script>', safe(adapter), '</script>',
  '<script>', safe(read('public/app.js')), '</script>',
  ''
].join('\n');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const dest = path.join(root, 'dist', 'schoolpadi-artifact.html');
fs.writeFileSync(dest, out);
console.log('Wrote', path.relative(process.cwd(), dest), (out.length / 1024).toFixed(0) + ' KB');
