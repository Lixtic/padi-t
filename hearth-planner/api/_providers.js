'use strict';
// Streaming adapters. Each is an async generator yielding { text } pieces and one { finish } at the end.
// finish is 'stop' or 'length' (the model ran out of output tokens).

const DEFAULTS = {
  anthropic: 'claude-sonnet-5-5',
  openai: 'gpt-4.1',
  gemini: 'gemini-2.5-flash',
};

function activeProvider() {
  const want = String(process.env.LLM_PROVIDER || '').toLowerCase();
  const keys = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
  };
  if (want && keys[want]) return want;
  return ['anthropic', 'openai', 'gemini'].find((k) => keys[k]) || null;
}

function maxTokens() {
  const n = parseInt(process.env.MAX_OUTPUT_TOKENS || '', 10);
  return Number.isFinite(n) && n >= 1000 ? Math.min(n, 64000) : 8000;
}

function upstreamError(provider, status, bodyText) {
  console.error('[generate] upstream error', provider, status, String(bodyText || '').slice(0, 500));
  let message = 'The AI provider returned an error. Please try again.';
  let code = 'upstream';
  if (status === 401 || status === 403) { message = 'The server\'s AI key was rejected. Check the key in your Vercel environment variables.'; code = 'upstream_auth'; }
  else if (status === 429) { message = 'The AI provider is busy or the quota is used up. Please try again shortly.'; code = 'upstream_busy'; }
  else if (status === 400 || status === 404) { message = 'The AI provider rejected the request. Check the model name in your environment variables.'; code = 'upstream_request'; }
  return Object.assign(new Error(message), { code, status: 502 });
}

function parseEvent(raw) {
  const data = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  return data.join('\n');
}

async function* sseData(body) {
  const dec = new TextDecoder();
  let buf = '';
  for await (const chunk of body) {
    buf += dec.decode(chunk, { stream: true });
    let m;
    while ((m = /\r?\n\r?\n/.exec(buf))) {
      const raw = buf.slice(0, m.index);
      buf = buf.slice(m.index + m[0].length);
      const d = parseEvent(raw);
      if (d) yield d;
    }
  }
  buf += dec.decode();
  if (buf.trim()) { const d = parseEvent(buf); if (d) yield d; }
}

function safeJson(s) { try { return JSON.parse(s); } catch (e) { return null; } }

async function post(provider, url, headers, payload, signal) {
  const r = await fetch(url, { method: 'POST', signal, headers: Object.assign({ 'content-type': 'application/json' }, headers), body: JSON.stringify(payload) });
  if (!r.ok) throw upstreamError(provider, r.status, await r.text().catch(() => ''));
  return r;
}

async function* anthropic({ system, messages, signal }) {
  const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
  const r = await post('anthropic', base + '/v1/messages',
    { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    { model: process.env.ANTHROPIC_MODEL || DEFAULTS.anthropic, max_tokens: maxTokens(), stream: true, system, messages }, signal);
  for await (const d of sseData(r.body)) {
    const j = safeJson(d);
    if (!j) continue;
    if (j.type === 'content_block_delta' && j.delta && j.delta.type === 'text_delta') yield { text: j.delta.text };
    else if (j.type === 'message_delta' && j.delta && j.delta.stop_reason) yield { finish: j.delta.stop_reason === 'max_tokens' ? 'length' : 'stop' };
    else if (j.type === 'error') throw upstreamError('anthropic', 500, JSON.stringify(j.error || j));
  }
}

async function* openai({ system, messages, signal }) {
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const r = await post('openai', base + '/chat/completions',
    { authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
    { model: process.env.OPENAI_MODEL || DEFAULTS.openai, max_completion_tokens: maxTokens(), stream: true,
      messages: [{ role: 'system', content: system }].concat(messages) }, signal);
  for await (const d of sseData(r.body)) {
    if (d === '[DONE]') break;
    const j = safeJson(d);
    const c = j && j.choices && j.choices[0];
    if (!c) continue;
    if (c.delta && c.delta.content) yield { text: c.delta.content };
    if (c.finish_reason) yield { finish: c.finish_reason === 'length' ? 'length' : 'stop' };
  }
}

async function* gemini({ system, messages, signal }) {
  const base = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  const model = process.env.GEMINI_MODEL || DEFAULTS.gemini;
  const r = await post('gemini', base + '/v1beta/models/' + encodeURIComponent(model) + ':streamGenerateContent?alt=sse',
    { 'x-goog-api-key': process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY },
    { systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: maxTokens() } }, signal);
  for await (const d of sseData(r.body)) {
    const j = safeJson(d);
    const c = j && j.candidates && j.candidates[0];
    if (!c) continue;
    const parts = (c.content && c.content.parts) || [];
    for (const part of parts) if (part.text) yield { text: part.text };
    if (c.finishReason && c.finishReason !== 'FINISH_REASON_UNSPECIFIED') yield { finish: c.finishReason === 'MAX_TOKENS' ? 'length' : 'stop' };
  }
}

const ADAPTERS = { anthropic, openai, gemini };

module.exports = { activeProvider, ADAPTERS };
