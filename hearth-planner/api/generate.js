'use strict';
const SYSTEM_PROMPT = require('./_prompt');
const { sendJson, clientIp, rateLimit, accessOk, readJson, validate, firstMessage } = require('./_lib');
const { activeProvider, ADAPTERS } = require('./_providers');

const ERR_MARK = '<<SCHOOLPADI_ERROR>>';   // the browser looks for this at the end of the stream

// POST /api/generate  { params: {subject, cls, week, notes}, thread: [...] }
// Streams plain text. Errors before any text return JSON with a status code.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'method', message: 'Use POST.' });
  }

  const provider = activeProvider();
  if (!provider) return sendJson(res, 503, { error: 'not_configured', message: 'No AI key is set on the server.' });
  if (!accessOk(req)) return sendJson(res, 401, { error: 'access', message: 'Enter the access code to continue.' });

  const limit = parseInt(process.env.RATE_LIMIT || '', 10) || 8;
  const rl = rateLimit('gen:' + clientIp(req), limit, 10 * 60 * 1000);
  if (!rl.ok) {
    return sendJson(res, 429, { error: 'rate', message: 'Too many requests. Try again in ' + Math.ceil(rl.retryAfter / 60) + ' minute(s).' }, { 'Retry-After': String(rl.retryAfter) });
  }

  let body;
  try { body = await readJson(req); } catch (e) { return sendJson(res, e.status || 400, { error: 'bad_request', message: e.message }); }
  const v = validate(body);
  if (v.error) return sendJson(res, 400, { error: 'bad_request', message: v.error });

  const messages = [{ role: 'user', content: firstMessage(v.params) }].concat(v.thread);
  const ctrl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ctrl.abort(); });

  const stream = ADAPTERS[provider]({ system: SYSTEM_PROMPT, messages, signal: ctrl.signal });
  const it = stream[Symbol.asyncIterator]();
  let first;
  try {
    first = await it.next();
  } catch (e) {
    return sendJson(res, e.status || 502, { error: e.code || 'upstream', message: e.message || 'The AI provider failed.' });
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');

  let wroteText = false;
  let finish = 'stop';
  const take = (item) => {
    if (item.text) { res.write(item.text); wroteText = true; }
    if (item.finish) finish = item.finish;
  };

  try {
    if (!first.done) take(first.value);
    for (let n = await it.next(); !n.done; n = await it.next()) take(n.value);
    if (!wroteText) res.write(ERR_MARK + 'The model returned an empty answer. Please try again.');
    else if (finish === 'length') res.write('\n' + ERR_MARK + 'The answer reached the length limit and was cut short. Use Regenerate, or raise MAX_OUTPUT_TOKENS.');
  } catch (e) {
    if (!ctrl.signal.aborted) {
      console.error('[generate] stream failed', e && e.message);
      res.write('\n' + ERR_MARK + ((e && e.message) || 'The connection to the AI provider was interrupted.'));
    }
  }
  res.end();
};

