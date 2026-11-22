const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const context = { window: {} };
vm.runInNewContext(read('public/career-sources.js'), context);
vm.runInNewContext(read('public/career-data.js'), context);
const careers = context.window.GuidEdCareers;
if (!Array.isArray(careers) || careers.length < 58) throw new Error('Expected at least 30 career profiles in the third catalogue batch');
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
  for (const ref of c.sourceRefs) {
    const source = context.window.GuidEdCareerSources[ref];
    if (!source) throw new Error(c.id + ' has an unknown source reference: ' + ref);
    for (const key of ['sourceOwner','sourceType','evidenceScope','limitations','checkedAt']) if (!source[key]) throw new Error(ref + ' is missing governance metadata: ' + key);
    if (!Array.isArray(source.evidenceScope) || !source.evidenceScope.length) throw new Error(ref + ' needs explicit evidence scope');
  }
}
const html = read('public/career-roadmaps.html');
const js = read('public/career-roadmaps.js');
const app = read('public/index.html');
const api = read('api/_career-roadmaps.js');
const schema = read('api/_db.js');
const syncApi = read('public/sync.js');
for (const id of ['career-grid','career-search','career-category','start-discovery','show-matches','career-dialog','roadmap-list','roadmap-count']) {
  if (!html.includes('id="' + id + '"')) throw new Error('Missing Career Roadmaps UI element: ' + id);
}
for (const feature of ['Saved careers','show-matches','data-open','data-save','Start my roadmap','data-stage','renderRoadmaps','saveCareerRoadmap']) if (!js.includes(feature)) throw new Error('Missing interaction: ' + feature);
if (!js.includes('data-due') || !js.includes('data-note') || !js.includes('Overdue by')) throw new Error('Milestone target dates and notes are missing');
if (!api.includes('stage.due') || !api.includes('stage.note')) throw new Error('Roadmap API does not keep milestone dates and notes');
if (!html.includes('sync.js') || !html.includes('vendor/neon-auth.js')) throw new Error('Authenticated account sync is not loaded');
if (!html.includes('career-sources.js')) throw new Error('Career source registry is not loaded');
if (!js.includes('Official Ghana reference points')) throw new Error('Career source links are not rendered');
if (!app.includes('href="/career-roadmaps"')) throw new Error('Career Roadmaps navigation link missing');
new Function(js.replace(/^\(\(\) => \{/, '(function(){').replace(/\}\)\(\);\s*$/, '})();'));
for (const rule of ['career_roadmaps','user_id = $1','not-started','in-progress','completed']) if (!api.includes(rule) && !schema.includes(rule)) throw new Error('Missing private roadmap API rule: ' + rule);
if (!syncApi.includes('listCareerRoadmaps') || !syncApi.includes('saveCareerRoadmap') || !syncApi.includes('deleteCareerRoadmap')) throw new Error('PadiSync roadmap methods are missing');
if (!js.includes('listCareerRoadmaps') || !js.includes('deleteCareerRoadmap')) throw new Error('Account-backed roadmap sync actions are missing');
console.log('Career Roadmaps checks passed: ' + careers.length + ' career profiles and personal roadmap controls.');
