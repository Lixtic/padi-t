'use strict';
const { sendJson, readJson } = require('./_lib');
const db = require('./_db');
const A = require('./_auth');
const Levels = require('./_levels');

const MAX_ROWS = 20, MAX_ROW_BYTES = 400000;

// GET  /api/sync?what=plans&limit=60   -> [{ id, data, updated_at, deleted }]
// GET  /api/sync?what=profile          -> { profile: { data, updated_at } | null }
// POST /api/sync { what: 'plans', rows: [...] } | { what: 'profile', data, updated_at }
// /api/account-profile is rewritten here and delegated to the same authenticated sync service.
module.exports = async (req, res) => {
  const route = new URL(req.url, 'http://x');
  if (route.searchParams.get('what') === 'account-profile') {
    return require('./_account-profile')(req, res);
  }
  if (req.method !== 'GET' && req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return sendJson(res, 405, { error: 'method', message: 'Use GET or POST.' }); }
  if (!A.syncConfigured()) return sendJson(res, 503, { error: 'not_configured', message: 'Sync is not set up on this server.' });
  const me = await A.authed(req);
  if (!me) return sendJson(res, 401, { error: 'auth', message: 'Please sign in again.', reason: req.authFail || 'unknown' });
  try {
    await db.ensure();
    if (req.method === 'GET') {
      const what = route.searchParams.get('what');
      if (what === 'plans') {
        const limit = Math.min(Math.max(parseInt(route.searchParams.get('limit'), 10) || 60, 1), 100);
        const rows = await db.query('select id, data, updated_at, deleted from plans where user_id = $1 order by updated_at desc limit ' + limit, [me.uid]);
        return sendJson(res, 200, rows.map((r) => ({ id: r.id, data: r.data, updated_at: Number(r.updated_at), deleted: !!r.deleted })));
      }
      if (what === 'profile') {
        const [r] = await db.query('select data, updated_at from profiles where user_id = $1', [me.uid]);
        return sendJson(res, 200, { profile: r ? { data: r.data, updated_at: Number(r.updated_at) } : null });
      }
      return sendJson(res, 400, { error: 'bad_request', message: 'Unknown request.' });
    }

    let body;
    try { body = await readJson(req, 3000000); } catch (e) { return sendJson(res, e.status || 400, { error: 'bad_request', message: e.message }); }
    const maxTs = Date.now() + 864e5;
    if (body.what === 'plans') {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return sendJson(res, 200, { ok: true });
      if (rows.length > MAX_ROWS) return sendJson(res, 400, { error: 'bad_request', message: 'Too many plans in one request.' });
      const vals = [], marks = [];
      for (const r of rows) {
        const ts = Number(r && r.updated_at);
        const json = JSON.stringify(r && r.data && typeof r.data === 'object' ? r.data : {});
        if (!r || typeof r.id !== 'string' || !/^[\\w-]{1,64}$/.test(r.id) || !Number.isFinite(ts) || ts <= 0 || ts > maxTs || json.length > MAX_ROW_BYTES) {
          return sendJson(res, 400, { error: 'bad_request', message: 'A plan could not be saved.' });
        }
        const i = vals.length;
        marks.push('($' + (i + 1) + ',$' + (i + 2) + ',$' + (i + 3) + '::jsonb,$' + (i + 4) + ',$' + (i + 5) + ')');
        vals.push(me.uid, r.id, json, Math.round(ts), !!r.deleted);
      }
      await db.query('insert into plans (user_id, id, data, updated_at, deleted) values ' + marks.join(',') +
        ' on conflict (user_id, id) do update set data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted where plans.updated_at <= excluded.updated_at', vals);
      return sendJson(res, 200, { ok: true });
    }
    if (body.what === 'profile') {
      const d = body.data && typeof body.data === 'object' ? body.data : {};
      const ts = Number(body.updated_at);
      if (!Number.isFinite(ts) || ts <= 0 || ts > maxTs) return sendJson(res, 400, { error: 'bad_request', message: 'Invalid details.' });
      const known = new Set(Levels.LEVELS.flatMap((l) => l.subjects));
      const list = (a, ok, max) => (Array.isArray(a) ? a : []).filter((x, i, all) => typeof x === 'string' && ok(x) && all.indexOf(x) === i).slice(0, max);
      const last = {};
      Object.keys(d.last && typeof d.last === 'object' ? d.last : {}).slice(0, 80).forEach((k) => {
        const v = d.last[k], [c, sub] = k.split('|');
        if (Levels.isClass(c) && known.has(sub) && Array.isArray(v) && [1, 2, 3].includes(v[0]) && Number.isInteger(v[1]) && v[1] >= 1 && v[1] <= 14) last[k] = [v[0], v[1]];
      });
      const termOpen = {};
      Object.keys(d.termOpen && typeof d.termOpen === 'object' ? d.termOpen : {}).slice(0, 12).forEach((k) => {
        const v = d.termOpen[k];
        if (/^\\d{4}-[123]$/.test(k) && typeof v === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(v) && !isNaN(Date.parse(v))) termOpen[k] = v;
      });
      const clean = {
        teacher: String(d.teacher || '').slice(0, 80), school: String(d.school || '').slice(0, 100),
        classes: list(d.classes, (x) => Levels.isClass(x), 12), subjects: list(d.subjects, (x) => known.has(x), 20),
        asked: list(d.asked, (x) => x.length <= 80, 40), last, termOpen, setupDone: d.setupDone === true,
      };
      await db.query('insert into profiles (user_id, data, updated_at) values ($1, $2::jsonb, $3) on conflict (user_id) do update set data = excluded.data, updated_at = excluded.updated_at where profiles.updated_at <= excluded.updated_at',
        [me.uid, JSON.stringify(clean), Math.round(ts)]);
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 400, { error: 'bad_request', message: 'Unknown request.' });
  } catch (e) {
    console.error('sync failed:', e && e.message);
    return sendJson(res, 500, { error: 'server', message: 'Could not reach the database. Try again.' });
  }
};
