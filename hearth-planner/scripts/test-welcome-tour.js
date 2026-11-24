'use strict';
// Welcome notification for new accounts and the app tour.
const fs = require('fs');
const sync = fs.readFileSync('api/sync.js', 'utf8'), app = fs.readFileSync('public/app.js', 'utf8'), tour = fs.readFileSync('public/tour.js', 'utf8');
const index = fs.readFileSync('public/index.html', 'utf8'), sw = fs.readFileSync('public/sw.js', 'utf8');
const checks = [
  ['Welcome notification is created once, for accounts under a week old', sync.includes("'welcome'") && sync.includes('7 * 24 * 60 * 60 * 1000') && sync.includes('on conflict (user_id,dedupe_key) do nothing')],
  ['Tour script is loaded and cached for offline', index.includes('src="tour.js"') && sw.includes("'tour.js'")],
  ['Tour has parent and teacher routes', tour.includes('Add your children') && tour.includes('Create a plan')],
  ['Tour covers the newer features', ['BECE practice', 'Use your own scheme', 'Resources and media', 'Library, Share and download', 'Career Roadmaps', 'Guides and careers'].every((t) => tour.includes(t))],
  ['Welcome notification opens the tour', app.includes("item.type === 'welcome'") && app.includes('GuidedTour.start')],
  ['Tour starts after sign-up and from Settings', app.includes('guided.tourPending') && index.includes('id="settingsTour"')],
];
let failed = 0;
for (const [name, ok] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failed++; }
if (failed) process.exit(1);
console.log('Welcome tour tests passed.');
