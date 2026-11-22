const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const context = { window: {} };
vm.runInNewContext(read('public/career-data.js'), context);
const careers = context.window.GuidEdCareers;
if (!Array.isArray(careers) || careers.length < 8) throw new Error('Expected at least eight starter careers');
const ids = careers.map(c => c.id);
if (new Set(ids).size !== ids.length) throw new Error('Career IDs must be unique');
for (const c of careers) {
  for (const key of ['id','title','category','summary','interests','strengths','subjects','routes','skills','next','caution']) {
    if (!c[key]) throw new Error(c.id + ' is missing ' + key);
  }
  if (!Array.isArray(c.routes) || c.routes.length < 4) throw new Error(c.id + ' needs a meaningful step-by-step route');
}
const html = read('public/career-roadmaps.html');
const js = read('public/career-roadmaps.js');
const app = read('public/index.html');
for (const id of ['career-grid','career-search','career-category','start-discovery','show-matches','career-dialog']) {
  if (!html.includes('id="' + id + '"')) throw new Error('Missing Career Roadmaps UI element: ' + id);
}
for (const feature of ['Saved careers','show-matches','data-open','data-save']) if (!js.includes(feature)) throw new Error('Missing interaction: ' + feature);
if (!app.includes('href="/career-roadmaps"')) throw new Error('Career Roadmaps navigation link missing');
new Function(js.replace(/^\(\(\) => \{/, '(function(){').replace(/\}\)\(\);\s*$/, '})();'));
console.log('Career Roadmaps checks passed: ' + careers.length + ' starter careers.');
