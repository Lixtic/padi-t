'use strict';
const { sendJson, readJson } = require('./_lib');
const db = require('./_db');
const A = require('./_auth');
const Entitle = require('./_entitle');

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'method', message: 'Use GET or POST.' });
  }
  if (!A.syncConfigured()) return sendJson(res, 503, { error: 'not_configured', message: 'Notifications are not configured.' });
  const me = await A.authed(req);
  if (!me) return sendJson(res, 401, { error: 'auth', message: 'Please sign in again.' });
  if (await require('./_quota').limited(res, 'notifications:' + me.uid, 300, 10 * 60 * 1000)) return;
  try {
    await db.ensure();
    if (req.method === 'GET') {
      const notice = await Entitle.notice();
      if (notice) {
        await db.query(
          'insert into notifications (id,user_id,dedupe_key,type,title,body,url,created_at) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (user_id,dedupe_key) do nothing',
          ['notice-' + notice.id + '-' + me.uid, me.uid, 'announcement:' + notice.id, 'announcement', notice.kind === 'warn' ? 'Important GuidEd announcement' : 'GuidEd announcement', notice.text, '/', Date.now()]
        );
      }
      const rows = await db.query(
        'select id,type,title,body,url,created_at,read_at from notifications where user_id = $1 order by created_at desc limit 50',
        [me.uid]
      );
      return sendJson(res, 200, { items: rows.map((r) => ({
        id: r.id, type: r.type, title: r.title, body: r.body, url: r.url,
        createdAt: Number(r.created_at), read: r.read_at != null
      })), unread: rows.filter((r) => r.read_at == null).length });
    }
    let body;
    try { body = await readJson(req, 12000); }
    catch (e) { return sendJson(res, e.status || 400, { error: 'bad_request', message: e.message }); }
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((id) => typeof id === 'string' && id.length <= 100))].slice(0, 50) : [];
    if (body.all === true) {
      await db.query('update notifications set read_at = coalesce(read_at,$2) where user_id = $1', [me.uid, Date.now()]);
    } else if (ids.length) {
      await db.query('update notifications set read_at = coalesce(read_at,$3) where user_id = $1 and id = any($2::text[])', [me.uid, ids, Date.now()]);
    } else return sendJson(res, 400, { error: 'bad_request', message: 'Choose notifications to mark as read.' });
    return sendJson(res, 200, { ok: true });
  } catch (e) {
    console.error('[notifications]', e && e.message);
    return sendJson(res, 500, { error: 'server', message: 'Could not load notifications. Please try again.' });
  }
};
