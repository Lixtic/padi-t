'use strict';
const { sendJson, readJson } = require('./_lib');
const db = require('./_db');
const A = require('./_auth');
const clean = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const STATUSES = new Set(['not-started', 'in-progress', 'completed']);
module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return sendJson(res, 405, { error: 'method', message: 'Use GET or POST.' }); }
  if (!A.syncConfigured()) return sendJson(res, 503, { error: 'not_configured', message: 'Roadmap sync is not configured on this server.' });
  const me = await A.authed(req);
  if (!me) return sendJson(res, 401, { error: 'auth', message: 'Please sign in again.' });
  if (await require('./_quota').limited(res, 'career-roadmaps:' + me.uid, 240, 10 * 60 * 1000)) return;
  try {
    await db.ensure();
    if (req.method === 'GET') {
      const rows = await db.query('select id, career_id, data, updated_at from career_roadmaps where user_id = $1 order by updated_at desc limit 50', [me.uid]);
      return sendJson(res, 200, rows.map(r => ({ id:r.id, careerId:r.career_id, ...r.data, updatedAt:Number(r.updated_at) })));
    }
    let body;
    try { body = await readJson(req, 50000); } catch(e) { return sendJson(res, e.status || 400, { error:'bad_request', message:e.message }); }
    const id = clean(body && body.id, 80);
    if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(id)) return sendJson(res, 400, { error:'bad_request', message:'A valid roadmap ID is required.' });
    if (body && body.delete === true) {
      await db.query('delete from career_roadmaps where user_id = $1 and id = $2', [me.uid, id]);
      return sendJson(res, 200, { ok:true, deleted:id });
    }
    const careerId = clean(body && body.careerId, 80);
    const title = clean(body && body.title, 120);
    const stages = Array.isArray(body && body.stages) ? body.stages.slice(0, 12).map((stage, i) => ({
      id: clean(stage && stage.id, 100) || ('stage-' + (i+1)),
      title: clean(stage && stage.title, 160),
      detail: clean(stage && stage.detail, 600),
      status: STATUSES.has(stage && stage.status) ? stage.status : 'not-started',
      due: /^\d{4}-\d{2}-\d{2}$/.test(clean(stage && stage.due, 10)) ? clean(stage.due, 10) : '',
      note: clean(stage && stage.note, 200)
    })) : [];
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(careerId) || !title || stages.length < 1 || stages.some(s => !s.title || !s.detail)) {
      return sendJson(res, 400, { error:'bad_request', message:'Check the career and roadmap steps.' });
    }
    const data = JSON.stringify({ title, stages, createdAt: Number(body.createdAt) > 0 ? Number(body.createdAt) : Date.now() });
    const updatedAt = Date.now();
    await db.query('insert into career_roadmaps (user_id,id,career_id,data,updated_at) values ($1,$2,$3,$4::jsonb,$5) on conflict (user_id,id) do update set career_id=excluded.career_id,data=excluded.data,updated_at=excluded.updated_at', [me.uid,id,careerId,data,updatedAt]);
    return sendJson(res, 200, { ok:true, roadmap:{ id, careerId, ...JSON.parse(data), updatedAt } });
  } catch(e) {
    console.error('career roadmap sync failed:', e && e.message);
    return sendJson(res, 500, { error:'server', message:'Could not save this roadmap. Please try again.' });
  }
};
