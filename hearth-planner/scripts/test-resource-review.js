'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const api = read('api/_resource-review.js');
const syncApi = read('api/sync.js');
const db = read('api/_db.js');
const schema = read('db/schema.sql');
const client = read('public/sync.js');
const app = read('public/app.js');
const css = read('public/styles.css');

for (const rule of [
  "profile.primaryRole !== 'teacher'",
  "!roles.includes('teacher')",
  "p.user_id = $1",
  "p.id = $2",
  "p.deleted = false",
  "status in ('draft','reviewed','approved')",
  "excluded.status = 'approved' and resource_reviews.status = 'reviewed'",
  "prior.status = 'reviewed'",
  "prior.content_updated_at = p.updated_at",
  "Number(row.content_updated_at) === Number(row.plan_updated_at)"
]) assert.ok(api.includes(rule), 'Missing review API safeguard: ' + rule);
assert.ok(syncApi.includes("what') === 'resource-review'"), 'Review route is not registered');
assert.ok(db.includes('create table if not exists resource_reviews'), 'Runtime schema is missing review state');
assert.ok(schema.includes('create table if not exists resource_reviews'), 'Reference schema is missing review state');
assert.ok(client.includes('listResourceReviews'), 'Client cannot load review state');
assert.ok(client.includes('setResourceReview'), 'Client cannot update review state');
assert.ok(app.includes('refreshResourceReviews'), 'Library does not refresh review state');
assert.ok(app.includes('Draft · needs review'), 'Draft state is not visible');
assert.ok(app.includes('Reviewed · awaiting approval'), 'Reviewed state is not visible');
assert.ok(app.includes('Approved for teaching'), 'Approved state is not visible');
assert.ok(app.includes('Approve for teaching'), 'Teacher approval action is missing');
assert.ok(app.includes("setResourceReviewStatus(id, action.dataset.reviewStatus)"), 'Review actions are not connected');
assert.ok(css.includes('.lib-review-status.is-approved'), 'Approved status styling is missing');

console.log('Teacher resource review workflow checks passed.');
