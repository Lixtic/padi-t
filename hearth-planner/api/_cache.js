'use strict';
// Response cache for generated plans. A repeat of a recent request is served from here at zero token cost.
//
// How a request is matched:
//   1. Exact: the same settings (subject, class, week, options, scheme) and the same wording, ignoring case,
//      punctuation, spacing, filler words and word order, give the same key.
//   2. Close: the same settings with teacher's notes that share at least CACHE_SIMILARITY (default 0.8) of their
//      meaningful words, for example "forces and motion" and "motion and forces".
// This is word-overlap matching, not embeddings: it needs no extra model call, so a cache check costs no tokens.
//
// Who can see a cached answer: a request with no teacher's notes is shared by everyone (it only holds the
// subject, class, week and options). A request with notes is kept per user or per network address, so one
// teacher's notes never shape another teacher's answer.
//
// Stored in Neon when DATABASE_URL is set (shared by every serverless instance), otherwise in this instance's memory.
const crypto = require('crypto');
const db = require('./_db');

const STOP = new Set('a an and are as at be by for from in is it of on or the to with this that these those please can you me my our i we need want make create write give generate about some any also then than into onto over under'.split(' '));
const MAX_CHARS = 250000;       // never cache more than this per answer
const MIN_CHARS = 500;          // an answer shorter than this is an error or a stub, not worth keeping
const MEMORY_MAX = 200;

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const enabled = () => process.env.CACHE_DISABLED !== '1' && process.env.CACHE_DISABLED !== 'true';
const ttlMs = () => (parseFloat(process.env.CACHE_TTL_DAYS || '') || 30) * 86400000;
const threshold = () => {
  const n = parseFloat(process.env.CACHE_SIMILARITY || '');
  return n > 0 && n <= 1 ? n : 0.8;
};

// The meaningful words of a piece of text: lower case, no punctuation or filler words, plural endings removed, sorted.
function tokens(text) {
  const words = String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/);
  const set = new Set();
  for (const w of words) {
    if (!w || STOP.has(w)) continue;
    set.add(w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
  }
  return Array.from(set).sort();
}

function jaccard(a, b) {
  if (!a.length && !b.length) return 1;
  const sb = new Set(b);
  let inter = 0;
  for (const t of a) if (sb.has(t)) inter++;
  return inter / (a.length + b.length - inter);
}

// A short label for the model and prompt in use, so a changed prompt or model never serves an old answer.
function version(systemPrompt, provider) {
  return sha([provider, process.env.ANTHROPIC_MODEL, process.env.OPENAI_MODEL, process.env.GEMINI_MODEL, systemPrompt].join('|')).slice(0, 12);
}

// Builds the lookup for one request. paramsKey covers everything except the teacher's notes and the follow-up thread.
// settingsText is the first message built from the settings with the notes left out.
function keyFor({ ver, settingsText, notes, thread, subject }) {
  const noteTokens = tokens(notes);
  const hasNotes = noteTokens.length > 0;
  const paramsKey = sha(ver + '|' + settingsText);
  // Follow-up messages are matched by their meaningful words, earlier answers word for word.
  const threadSig = (thread || []).map((t) => (t.role === 'user' ? 'u:' + tokens(t.content).join(' ') : 'a:' + sha(t.content))).join('|');
  return {
    scope: hasNotes ? 'p:' + subject : 'global',
    paramsKey,
    notesNorm: noteTokens.join(' '),
    noteTokens,
    key: sha(paramsKey + '|' + noteTokens.join(' ') + '|' + threadSig),
    fuzzyOk: !(thread && thread.length) && hasNotes,   // close matching is for a first request that has notes
  };
}

// ── memory fallback ──
const mem = new Map();     // key -> row
function memGet(k) { return mem.get(k.scope + '/' + k.key) || null; }
function memRows(k) { return Array.from(mem.values()).filter((r) => r.scope === k.scope && r.params_key === k.paramsKey); }
function memPut(row) {
  mem.set(row.scope + '/' + row.key, row);
  if (mem.size > MEMORY_MAX) mem.delete(mem.keys().next().value);
}

// Returns { text, how: 'exact'|'close', similarity } or null.
async function lookup(k) {
  if (!enabled()) return null;
  const now = Date.now();
  const fresh = (r) => r && Number(r.created_at) > now - ttlMs();
  try {
    if (!db.configured()) {
      const hit = memGet(k);
      if (fresh(hit)) return { text: hit.response, how: 'exact', similarity: 1 };
      if (k.fuzzyOk) return pickClose(memRows(k).filter(fresh), k);
      return null;
    }
    await db.ensure();
    const exact = await db.query('select response, created_at from response_cache where scope = $1 and key = $2', [k.scope, k.key]);
    if (exact.length && fresh(exact[0])) {
      db.query('update response_cache set hits = hits + 1 where scope = $1 and key = $2', [k.scope, k.key]).catch(() => {});
      return { text: exact[0].response, how: 'exact', similarity: 1 };
    }
    if (!k.fuzzyOk) return null;
    const rows = await db.query('select key, notes_norm, response, created_at from response_cache where scope = $1 and params_key = $2 and created_at > $3 and thread_len = 0 order by created_at desc limit 25', [k.scope, k.paramsKey, now - ttlMs()]);
    const close = pickClose(rows, k);
    if (close) db.query('update response_cache set hits = hits + 1 where scope = $1 and key = $2', [k.scope, close.key]).catch(() => {});
    return close;
  } catch (e) {
    console.error('[cache] lookup failed', e && e.message);
    return null;                                   // a cache problem must never block a generation
  }
}

function pickClose(rows, k) {
  let best = null;
  for (const r of rows) {
    const sim = jaccard(k.noteTokens, String(r.notes_norm || '').split(' ').filter(Boolean));
    if (sim >= threshold() && (!best || sim > best.similarity)) best = { text: r.response, how: 'close', similarity: sim, key: r.key };
  }
  return best;
}

// Keeps a finished answer. Only complete answers are stored, never one that was cut short or ended in an error.
async function store(k, text, threadLen, tokensUsed) {
  if (!enabled() || !text || text.length < MIN_CHARS || text.length > MAX_CHARS) return false;
  const row = { scope: k.scope, key: k.key, params_key: k.paramsKey, notes_norm: k.notesNorm, response: text, thread_len: threadLen, tokens: tokensUsed || 0, created_at: Date.now(), hits: 0 };
  try {
    if (!db.configured()) { memPut(row); return true; }
    await db.ensure();
    await db.query(
      'insert into response_cache (scope, key, params_key, notes_norm, response, thread_len, tokens, created_at, hits) values ($1,$2,$3,$4,$5,$6,$7,$8,0) ' +
      'on conflict (scope, key) do update set response = excluded.response, notes_norm = excluded.notes_norm, tokens = excluded.tokens, created_at = excluded.created_at',
      [row.scope, row.key, row.params_key, row.notes_norm, row.response, row.thread_len, row.tokens, row.created_at]);
    // Tidy up expired rows now and then so the table does not grow without limit.
    if (Math.random() < 0.05) db.query('delete from response_cache where created_at < $1', [Date.now() - ttlMs()]).catch(() => {});
    return true;
  } catch (e) {
    console.error('[cache] store failed', e && e.message);
    return false;
  }
}

function clearMemory() { mem.clear(); }

module.exports = { tokens, jaccard, version, keyFor, lookup, store, enabled, clearMemory, MIN_CHARS };
