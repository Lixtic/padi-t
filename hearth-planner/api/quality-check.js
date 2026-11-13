'use strict';
const { sendJson, accessOk, readJson, validate, rateLimit, clientIp } = require('./_lib');
const Knowledge = require('./_knowledge');
const Quality = require('./_quality');

// POST /api/quality-check { params, content }
// Re-resolves curriculum context and retrieved-source count on the server.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'method', message: 'Use POST.' });
  }
  if (!accessOk(req)) return sendJson(res, 401, { error: 'access', message: 'Enter the access code to continue.' });

  const limit = rateLimit('quality:' + clientIp(req), 30, 10 * 60 * 1000);
  if (!limit.ok) return sendJson(res, 429, { error: 'rate', message: 'Too many quality checks. Try again shortly.' });

  let body;
  try { body = await readJson(req, 160000); }
  catch (e) { return sendJson(res, e.status || 400, { error: 'bad_request', message: e.message }); }

  const content = typeof body.content === 'string' ? body.content : '';
  if (!content.trim() || content.length > 120000) {
    return sendJson(res, 400, { error: 'bad_content', message: 'Provide generated content up to 120,000 characters.' });
  }

  const validated = validate({ params: body.params || {}, thread: [] });
  if (validated.error) return sendJson(res, 400, { error: 'bad_request', message: validated.error });

  let retrievedSourceCount = 0;
  try {
    const knowledge = await Knowledge.retrieve(validated.params);
    retrievedSourceCount = Number(knowledge && knowledge.sourceCount) || 0;
  } catch (e) {
    console.error('[quality-check] knowledge retrieval failed', e && e.message);
  }

  const report = Quality.inspect(content, validated.params, {
    retrievedSourceCount,
    curriculumVerified: false
  });
  return sendJson(res, 200, { report });
};
