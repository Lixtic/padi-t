'use strict';
const { sendJson, readJson } = require('./_lib');
const db = require('./_db');
const A = require('./_auth');

const KINDS = new Set(['lesson', 'explanation', 'practice', 'progress']);
const clean = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'method', message: 'Use GET or POST.' });
  }
  if (!A.syncConfigured()) return sendJson(res, 503, { error: 'not_configured', message: 'Parent learning storage is not configured.' });
  const me = await A.authed(req);
  if (!me) return sendJson(res, 401, { error: 'auth', message: 'Please sign in again.' });

  try {
    await db.ensure();
    const [account] = await db.query('select data from account_profiles where user_id = $1', [me.uid]);
    const profile = account && account.data;
    if (!profile || profile.primaryRole !== 'parent') {
      return sendJson(res, 403, { error: 'parent_only', message: 'This feature is available to parent accounts.' });
    }
    const children = Array.isArray(profile.children) ? profile.children : [];
    const childIds = new Set(children.map((child) => String(child.id || '')));
    const route = new URL(req.url, 'http://x');

    if (req.method === 'GET') {
      const childId = clean(route.searchParams.get('childId'), 64);
      if (childId && !childIds.has(childId)) return sendJson(res, 403, { error: 'child_access', message: 'That child is not linked to this account.' });
      const rows = await db.query(
        'select id, kind, data, updated_at, deleted from parent_learning where user_id = $1 and deleted = false order by updated_at desc limit 250',
        [me.uid]
      );
      return sendJson(res, 200, rows
        .filter((row) => childIds.has(String(row.data && row.data.childId || '')) && (!childId || String(row.data.childId) === childId))
        .map((row) => ({ id: row.id, kind: row.kind, data: row.data, updatedAt: Number(row.updated_at) })));
    }

    let body;
    try { body = await readJson(req, 180000); }
    catch (e) { return sendJson(res, e.status || 400, { error: 'bad_request', message: e.message }); }
    const id = clean(body && body.id, 64);
    if (!/^[\w-]{1,64}$/.test(id)) return sendJson(res, 400, { error: 'bad_request', message: 'A valid learning record ID is required.' });
    const kind = clean(body && body.kind, 24);
    if (!KINDS.has(kind)) return sendJson(res, 400, { error: 'bad_request', message: 'Choose a valid learning record type.' });
    const data = body && body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : {};
    const childId = clean(data.childId, 64);
    if (!childIds.has(childId)) return sendJson(res, 403, { error: 'child_access', message: 'Choose a child linked to this account.' });
    const child = children.find((item) => String(item.id) === childId);
    const subject = clean(data.subject, 100);
    if (subject && Array.isArray(child.subjects) && !child.subjects.includes(subject)) {
      return sendJson(res, 400, { error: 'subject', message: 'Choose one of this child’s registered subjects.' });
    }
    const json = JSON.stringify({
      childId,
      childName: clean(child.name, 80),
      class: clean(child.class, 20),
      subject,
      topic: clean(data.topic, 240),
      week: Math.max(1, Math.min(20, Number(data.week) || 1)),
      term: Math.max(1, Math.min(3, Number(data.term) || 1)),
      title: clean(data.title, 240),
      content: clean(data.content, 120000),
      status: data.status === 'completed' ? 'completed' : 'saved',
      score: data.score == null || data.score === '' ? null : Math.max(0, Math.min(100, Number(data.score) || 0)),
      notes: clean(data.notes, 2000),
      createdAt: Number(data.createdAt) > 0 ? Number(data.createdAt) : Date.now(),
      completedAt: data.status === 'completed' ? (Number(data.completedAt) > 0 ? Number(data.completedAt) : Date.now()) : null
    });
    if (json.length > 140000) return sendJson(res, 413, { error: 'too_large', message: 'This learning resource is too large to save.' });
    const updatedAt = Date.now();
    await db.query(
      'insert into parent_learning (user_id, id, kind, data, updated_at, deleted) values ($1, $2, $3, $4::jsonb, $5, false) on conflict (user_id, id) do update set kind = excluded.kind, data = excluded.data, updated_at = excluded.updated_at, deleted = false',
      [me.uid, id, kind, json, updatedAt]
    );
    return sendJson(res, 200, { ok: true, record: { id, kind, data: JSON.parse(json), updatedAt } });
  } catch (e) {
    console.error('parent learning sync failed:', e && e.message);
    return sendJson(res, 500, { error: 'server', message: 'Could not save parent learning activity. Please try again.' });
  }
};
