'use strict';
const { sendJson, readJson } = require('./_lib');
const A = require('./_auth');
const E = require('./_entitle');
const Knowledge = require('./_knowledge');

module.exports = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'method', message: 'Use GET or POST.' });
  }
  if (!req.headers.authorization) return sendJson(res, 401, { error: 'auth', message: 'Sign in with an administrator account.' });
  const me = await A.authed(req).catch(() => null);
  if (!me || !E.isAdmin(me)) return sendJson(res, 403, { error: 'admin', message: 'Only GuidEd administrators can manage the knowledge library.' });
  if (req.method === 'GET') {
    try {
      const db = require('./_db');
      await db.ensure();
      const rows = await db.query("select id, title, publisher, source_url, document_type, subject, classes, curriculum_codes, trust_level, license, edition, status, created_at, (select count(*)::int from knowledge_chunks c where c.source_id = s.id) as chunks from knowledge_sources s order by created_at desc limit 200");
      return sendJson(res, 200, { sources: rows });
    } catch (e) {
      console.error('[knowledge] list failed', e && e.message);
      return sendJson(res, 503, { error: 'storage', message: 'Knowledge storage is unavailable.' });
    }
  }
  let body;
  try { body = await readJson(req, 2500000); }
  catch (e) { return sendJson(res, e.status || 400, { error: 'bad_request', message: e.message }); }
  try {
    const result = await Knowledge.ingest(body, me.email || me.uid);
    return sendJson(res, 201, { ok: true, ...result });
  } catch (e) {
    const message = e && e.message || 'Could not ingest this document.';
    const status = /required|valid|unsupported|between|usable|too large|HTTPS/i.test(message) ? 400 : 503;
    console.error('[knowledge] ingest failed', message);
    return sendJson(res, status, { error: 'ingest', message });
  }
};
