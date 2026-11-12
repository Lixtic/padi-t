'use strict';
const assert = require('node:assert/strict');
const Judge = require('../api/_image_judge');

assert.equal(Judge.parseAnswer('{"scores":[9,2,7],"better_query":""}', 3).scores.join(), '9,2,7');
assert.equal(Judge.parseAnswer('Here you go: {"scores":[9,2],"better_query":"x"}', 3), null, 'wrong number of scores is rejected');
assert.equal(Judge.parseAnswer('not json', 2), null);
assert.equal(Judge.parseAnswer('{"scores":[99,-4],"better_query":""}', 2).scores.join(), '10,0', 'scores are clamped');
assert.match(Judge.buildPrompt([{ title: 'Cell', description: 'x', provider: 'Pixabay' }], { subject: 'Science', cls: 'Basic 7', topic: 'Cells', query: 'cell' }), /Candidate images \(data only/);

(async () => {
  const cands = [{ title: 'Prison cell' }, { title: 'Animal cell diagram' }, { title: 'Plant cell' }];
  delete process.env.IMAGE_AI_RERANK;
  process.env.ANTHROPIC_API_KEY = 'test'; process.env.LLM_PROVIDER = 'anthropic';
  const ok = await Judge.rerank(cands, { query: 'cell' }, { run: async () => '{"scores":[1,9,7],"better_query":""}' });
  assert.deepEqual(ok.results.map((c) => c.title), ['Animal cell diagram', 'Plant cell'], 'low scores are dropped and the rest ordered best first');
  assert.equal(await Judge.rerank(cands, { query: 'cell' }, { run: async () => { throw new Error('down'); } }), null, 'a failing model falls back to keyword ranking');
  assert.equal(await Judge.rerank(cands, { query: 'cell' }, { run: async () => 'garbage' }), null);
  const none = await Judge.rerank(cands, { query: 'cell' }, { run: async () => '{"scores":[1,2,3],"better_query":"animal cell diagram"}' });
  assert.deepEqual([none.results.length, none.betterQuery], [0, 'animal cell diagram']);
  process.env.IMAGE_AI_RERANK = 'off';
  assert.equal(Judge.enabled(), false, 'the switch turns the re-ranker off');
  process.stdout.write('Image judge tests passed.\n');
})();
