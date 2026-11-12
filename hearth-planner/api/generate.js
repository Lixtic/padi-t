'use strict';
const BASE_PROMPT = require('./_prompt');
const LEVEL_PROMPTS = require('./_prompt_levels');
const Levels = require('./_levels');
const Curriculum = require('./_curriculum');
const Knowledge = require('./_knowledge');
// JHS uses the main prompt as it is. Other levels add their own profile at the end.
const systemFor = (cls, mode, resourceType, scheme, request, knowledgeContext) => {
  const l = Levels.levelOfClass(cls);
  let system = l && LEVEL_PROMPTS[l.id] ? BASE_PROMPT + '\n\n' + LEVEL_PROMPTS[l.id] : BASE_PROMPT;
  if (mode === 'plan') system += '\n\n## Task mode override: lesson plan only\nReturn ONLY Lesson Metadata, Lesson 1, Lesson 2 and the Assessment Rubric. Do not include Study Notes, BECE Practice, worksheets, homework, slides or any other teaching resources. Keep the full lesson plan structure, curriculum alignment, learning objectives, lesson activities, assessment and resources column.';
  if (mode === 'resources') system += '\n\n## Task mode override: teaching resource only\nReturn ONLY the requested teaching resource. Do not include lesson metadata, lesson-plan tables, lesson phases or an assessment rubric. Use the supplied class, subject, term, week and scheme information to keep the resource aligned to the topic. For worksheets and homework, include learner instructions and an answer key. For exam practice, include questions and a marking guide, written in the exam the request names: BECE at JHS, WASSCE at SHS (Section A objective questions with options A to D, Section B structured or essay questions with parts (a), (b), (c)), or a class exercise at primary. For teaching slides, provide a slide-by-slide outline with concise learner-facing content and teacher notes. For study notes, write clear, complete student notes with examples and key terms.';
  if (mode === 'resources' && resourceType === 'Teaching slides') system += '\n\n## Teaching slides format (follow exactly)\nWrite 8 to 12 slides for a Ghanaian classroom, readable from the back of a room. Start every slide with a heading in this exact form: `## Slide 1: Short title` (numbered in order). No text before Slide 1 and no title page heading. Under each heading write: 2 to 4 bullets starting with `- `, each 12 words or fewer, in learner-friendly language (the words learners will see on the board); then, only when it helps, one line starting `**Activity:**` or `**Ask the class:**` with a single task or question; then one line starting `**Teacher notes:**` with 1 to 3 sentences on what to say, local examples and likely misconceptions. Order: Slide 1 is the title slide (topic, class, one-line goal as the bullet). Then the learning objectives, a hook linked to daily life, the concept slides, a worked example, a group activity, a quick check for understanding, and a summary with an exit ticket as the last slide. Plain text only: no tables, no emojis, no images, no LaTeX; describe any diagram in words in the notes.';
  system += '\n\n' + Curriculum.buildInstruction(scheme, Object.assign({ mode, resourceType }, request || {}));
  if (knowledgeContext) system += '\n\n' + knowledgeContext;
  return system;
};
const { sendJson, clientIp, accessOk, readJson, validate, firstMessage } = require('./_lib');
const Providers = require('./_providers');
const { activeProvider, ADAPTERS } = Providers;
const Cache = require('./_cache');
const Quota = require('./_quota');
const A = require('./_auth');
const Entitle = require('./_entitle');

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
  let rl;
  try { rl = await Quota.rateLimitShared('gen:' + clientIp(req), limit, 10 * 60 * 1000); }
  catch (e) {
    console.error('[generate] shared rate limiter failed', e && e.message);
    return sendJson(res, 503, { error: 'protection_unavailable', message: 'Generation protection is temporarily unavailable. Please try again shortly.' });
  }
  if (!rl.ok) {
    return sendJson(res, 429, { error: 'rate', message: 'Too many requests. Try again in ' + Math.ceil(rl.retryAfter / 60) + ' minute(s).' }, { 'Retry-After': String(rl.retryAfter) });
  }

  let body;
  try { body = await readJson(req); } catch (e) { return sendJson(res, e.status || 400, { error: 'bad_request', message: e.message }); }
  const v = validate(body);
  if (v.error) return sendJson(res, 400, { error: 'bad_request', message: v.error });

  // Who is asking: a signed-in teacher if a valid token came with the request, otherwise the network address.
  const me = req.headers.authorization ? await A.authed(req).catch(() => null) : null;
  const subject = Quota.subjectFor(me, clientIp(req));

  // Tiers (see _entitle.js). Visitors who are not signed in get a short taster of Lesson 1, never the full plan.
  let ent = null;
  try { ent = Entitle.enabled() ? await Entitle.resolve(me, clientIp(req)) : null; } catch (e) { console.error('[generate] tier lookup failed', e && e.message); }
  if (ent && ent.blocked) return sendJson(res, 403, { error: 'blocked', message: 'This account has been paused. Please contact us if you think this is a mistake.' });
  const guest = !!ent && ent.tier === 'guest';
  const firstTurn = v.thread.length === 0;
  const planTurn = firstTurn && v.params.mode !== 'resources';   // a resource-only run (worksheet, notes...) is not a weekly plan: it never uses the free plan or class allowance
  if (guest && !firstTurn) {
    return sendJson(res, 402, { error: 'account', message: 'Create a free account to refine a plan, or to add study notes and BECE questions.' });
  }
  const makeFirst = (p) => (guest ? firstMessage(Object.assign({}, p, { studyNotes: false, bece: false })) + '\nMode: preview' : firstMessage(p));
  const messages = [{ role: 'user', content: makeFirst(v.params) }].concat(v.thread);
  // Retrieve approved source passages before cache lookup so cached answers are tied to the evidence version.
  let knowledge = { context: '', status: 'unavailable', sourceCount: 0 };
  try { knowledge = await Knowledge.retrieve(v.params); }
  catch (e) { console.error('[generate] knowledge retrieval failed', e && e.message); }
  const fresh = body.fresh === true && !guest;          // a taster is never regenerated: it would spend tokens for nothing
  const sendHeaders = (cache) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-transform');
    res.setHeader('X-Padi-Cache', cache);
    if (ent) res.setHeader('X-Guided-Tier', ent.tier);
    if (guest) res.setHeader('X-Guided-Preview', '1');
  };

  // Signed-in teachers on the free tier: stop here when this week's plans (or classes) are used up.
  if (ent && ent.tier === 'free' && planTurn) {
    let g = { ok: true };
    try { g = await Entitle.checkFree(ent, v.params.cls); } catch (e) { console.error('[generate] free check failed', e && e.message); }
    if (!g.ok) Entitle.event('free_limit_' + g.reason);
    if (!g.ok) return sendJson(res, 402, { error: 'limit', reason: g.reason, resetsAt: g.resetsAt, message: Entitle.message('free', g) });
  }

  // 1. A repeat of a recent request is served from the cache, at no token cost and with no quota used.
  //    "fresh" (the Regenerate button) skips the lookup and replaces the stored answer.
  const ck = Cache.keyFor({
    ver: Cache.version(systemFor(v.params.cls, v.params.mode, v.params.resourceType, v.params.scheme, v.params, knowledge.context), provider),
    settingsText: makeFirst(Object.assign({}, v.params, { notes: '' })),
    notes: v.params.notes, thread: v.thread, subject,
  });
  if (!fresh) {
    const hit = await Cache.lookup(ck);
    if (hit) {
      res.statusCode = 200;
      sendHeaders(hit.how);
      res.end(hit.text);
      if (ent && ent.tier === 'free' && planTurn) await Entitle.countFree(ent, v.params.cls).catch(() => {});
      else if (ent && ent.tier === 'pro' && firstTurn) Entitle.event('plan_pro');
      else if (guest) Entitle.event('guest_preview');
      return;
    }
  }

  // A taster that was not cached will cost tokens, so each visitor gets only a few a day.
  if (guest) {
    let g = { ok: true };
    try { g = await Entitle.checkGuest(ent); } catch (e) { console.error('[generate] guest check failed', e && e.message); }
    if (!g.ok) Entitle.event('guest_limit');
    if (!g.ok) return sendJson(res, 402, { error: 'guest_limit', resetsAt: g.resetsAt, message: Entitle.message('guest', g) });
  }

  // 2. Not cached, so it will cost tokens. Stop here if today's allowance is used up.
  const system = systemFor(v.params.cls, v.params.mode, v.params.resourceType, v.params.scheme, v.params, knowledge.context);
  const inputTokens = Quota.estimateTokens(system.length + messages.reduce((n, m) => n + m.content.length, 0));
  const outputCap = guest ? (Number(Entitle.cfg().previewMaxTokens) || 2200) : Providers.maxOutputTokens();
  let q;
  try {
    q = await Quota.reserve(subject, inputTokens + outputCap,
      ent && ent.tier === 'pro' && Entitle.cfg().proTokenDaily ? { limit: Entitle.cfg().proTokenDaily } : undefined);
  } catch (e) {
    console.error('[generate] quota reservation failed', e && e.message);
    return sendJson(res, 503, { error: 'protection_unavailable', message: 'The usage protection service is temporarily unavailable. Please try again shortly.' });
  }
  if (!q.ok) {
    return sendJson(res, 429, { error: 'quota', message: Quota.message(q) }, { 'Retry-After': String(q.retryAfter) });
  }

  const ctrl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ctrl.abort(); });

  const stream = ADAPTERS[provider]({ system, messages, signal: ctrl.signal, maxTokens: guest ? outputCap : undefined });
  const it = stream[Symbol.asyncIterator]();
  let first;
  try {
    first = await it.next();
  } catch (e) {
    // The provider call has started; conservatively count the prompt in case it was billed
    // before the connection failed or the client stopped waiting for the first chunk.
    await Quota.settle(q.reservation, inputTokens).catch((settleError) => console.error('[generate] quota settlement failed', settleError && settleError.message));
    return sendJson(res, e.status || 502, { error: e.code || 'upstream', message: e.message || 'The AI provider failed.' });
  }

  res.statusCode = 200;
  sendHeaders('miss');
  res.setHeader('X-Accel-Buffering', 'no');

  let wroteText = false;
  let finish = 'stop';
  let failed = false;
  let outChars = 0;
  let full = '';
  const take = (item) => {
    if (item.text) { res.write(item.text); wroteText = true; outChars += item.text.length; full += item.text; }
    if (item.finish) finish = item.finish;
  };

  try {
    if (!first.done) take(first.value);
    for (let n = await it.next(); !n.done; n = await it.next()) take(n.value);
    if (!wroteText) { failed = true; res.write(ERR_MARK + 'The model returned an empty answer. Please try again.'); }
    else if (finish === 'length' && !guest) { failed = true; res.write('\n' + ERR_MARK + 'The answer reached the length limit and was cut short. Use Regenerate, or raise MAX_OUTPUT_TOKENS.'); }
  } catch (e) {
    failed = true;
    if (!ctrl.signal.aborted) {
      console.error('[generate] stream failed', e && e.message);
      res.write('\n' + ERR_MARK + ((e && e.message) || 'The connection to the AI provider was interrupted.'));
    }
  }
  res.end();

  // 3. Count the tokens used (even if the teacher pressed Stop, they were spent) and keep a complete answer for next time.
  const used = inputTokens + Quota.estimateTokens(outChars);
  const tasks = [Quota.settle(q.reservation, used)];
  const complete = !failed && !ctrl.signal.aborted && (finish === 'stop' || (guest && wroteText));
  if (complete) tasks.push(Cache.store(ck, full, v.thread.length, used));
  if (guest && wroteText) { Entitle.event('guest_preview'); tasks.push(Entitle.countGuest(ent)); }                     // a taster that spent tokens
  else if (ent && ent.tier === 'free' && planTurn && !fresh && complete) tasks.push(Entitle.countFree(ent, v.params.cls));
  else if (ent && ent.tier === 'pro' && firstTurn && !fresh && complete) Entitle.event('plan_pro');
  await Promise.all(tasks).catch(() => {});
};

