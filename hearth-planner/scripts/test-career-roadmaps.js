const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const context = { window: {} };
vm.runInNewContext(read('public/career-sources.js'), context);
vm.runInNewContext(read('public/career-data.js'), context);
const careers = context.window.GuidEdCareers;
if (!Array.isArray(careers) || careers.length < 30) throw new Error('Expected at least 30 career profiles in the first catalogue expansion');
const ids = careers.map(c => c.id);
if (new Set(ids).size !== ids.length) throw new Error('Career IDs must be unique');
if (new Set(careers.map(c => c.title)).size !== careers.length) throw new Error('Career titles must be unique');
for (const c of careers) {
  for (const key of ['id','title','category','summary','interests','strengths','subjects','routes','skills','next','caution']) {
    if (!c[key]) throw new Error(c.id + ' is missing ' + key);
  }
  if (!Array.isArray(c.routes) || c.routes.length < 4) throw new Error(c.id + ' needs a meaningful step-by-step route');
  if (!['orientation-only','source-reviewed'].includes(c.reviewStatus)) throw new Error(c.id + ' needs an explicit review status');
  if (!Array.isArray(c.sourceRefs) || !c.sourceRefs.length) throw new Error(c.id + ' needs source references');
  for (const ref of c.sourceRefs) if (!context.window.GuidEdCareerSources[ref]) throw new Error(c.id + ' has an unknown source reference: ' + ref);
}
const html = read('public/career-roadmaps.html');
const js = read('public/career-roadmaps.js');
const app = read('public/index.html');
for (const id of ['career-grid','career-search','career-category','start-discovery','show-matches','career-dialog']) {
  if (!html.includes('id="' + id + '"')) throw new Error('Missing Career Roadmaps UI element: ' + id);
}
for (const feature of ['Saved careers','show-matches','data-open','data-save']) if (!js.includes(feature)) throw new Error('Missing interaction: ' + feature);
if (!html.includes('career-sources.js')) throw new Error('Career source registry is not loaded');
if (!js.includes('Official Ghana reference points')) throw new Error('Career source links are not rendered');
if (!app.includes('href="/career-roadmaps"')) throw new Error('Career Roadmaps navigation link missing');
new Function(js.replace(/^\(\(\) => \{/, '(function(){').replace(/\}\)\(\);\s*$/, '})();'));
console.log('Career Roadmaps checks passed: ' + careers.length + ' career profiles.');
