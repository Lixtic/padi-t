'use strict';
const { sendJson, readJson } = require('./_lib');
const db = require('./_db');
const A = require('./_auth');

const clean = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'method', message: 'Use GET or POST.' });
  }
  if (!A.syncConfigured()) return sendJson(res, 503, { error: 'not_configured', message: 'Resource review is not configured.' });
  const me = await A.authed(req);
  if (!me) return sendJson(res, 401, { error: 'auth', message: 'Please sign in again.' });
  if (await require('./_quota').limited(res, 'resource-review:' + me.uid, 300, 10 * 60 * 1000)) return;

  try {
    await db.ensure();
    const [account] = await db.query('select data from account_profiles where user_id = $1', [me.uid]);
    const profile = account && account.data || {};
    const roles = Array.isArray(profile.roles) ? profile.roles : [];
    if (profile.primaryRole !== 'teacher' && !roles.includes('teacher')) {
      return sendJson(res, 403, { error: 'teacher_only', message: 'Only teacher accounts can review teaching resources.' });
    }

    if (req.method === 'GET') {
      const rows = await db.query(
        'select r.id, r.status, r.content_updated_at, r.reviewed_at, r.approved_at, p.updated_at as plan_updated_at from resource_reviews r join plans p on p.user_id = r.user_id and p.id = r.id where r.user_id = $1 and p.deleted = false order by p.updated_at desc limit 100',
        [me.uid]
      );
      return sendJson(res, 200, rows.map((row) => {
        const current = Number(row.content_updated_at) === Number(row.plan_updated_at);
        return {
          id: row.id,
          status: current ? row.status : 'draft',
          reviewedAt: current && row.reviewed_at != null ? Number(row.reviewed_at) : null,
          approvedAt: current && row.approved_at != null ? Number(row.approved_at) : null,
          contentUpdatedAt: Number(row.plan_updated_at)
        };
      }));
    }

    let body;
    try { body = await readJson(req, 12000); }
    catch (e) { return sendJson(res, e.status || 400, { error: 'bad_request', message: e.message }); }
    const id = clean(body && body.id, 64);
    const status = clean(body && body.status, 16);
    if (!/^[\w-]{1,64}$/.test(id) || !['draft', 'reviewed', 'approved'].includes(status)) {
      return sendJson(res, 400, { error: 'bad_request', message: 'Choose a valid resource and review status.' });
    }

    const now = Date.now();
    const [row] = await db.query(
      `insert into resource_reviews (user_id, id, status, content_updated_at, reviewed_at, approved_at)
       select $1, p.id, $3, p.updated_at,
         case when $3 in ('reviewed','approved') then $4 else null end,
         case when $3 = 'approved' then $4 else null end
       from plans p where p.user_id = $1 and p.id = $2 and p.deleted = false
         and ($3 <> 'approved' or exists (select 1 from resource_reviews prior where prior.user_id = p.user_id and prior.id = p.id and prior.status = 'reviewed' and prior.content_updated_at = p.updated_at))
       on conflict (user_id, id) do update set
         status = excluded.status,
         content_updated_at = excluded.content_updated_at,
         reviewed_at = case when excluded.status = 'reviewed' then excluded.reviewed_at when excluded.status = 'approved' then resource_reviews.reviewed_at else null end,
         approved_at = excluded.approved_at
       where
         (excluded.status = 'draft')
         or (excluded.status = 'reviewed' and (resource_reviews.status in ('draft','reviewed') or resource_reviews.content_updated_at <> excluded.content_updated_at))
         or (excluded.status = 'approved' and resource_reviews.status = 'reviewed' and resource_reviews.content_updated_at = excluded.content_updated_at)
       returning id, status, content_updated_at, reviewed_at, approved_at`,
      [me.uid, id, status, now]
    );
    if (!row) {
      const [plan] = await db.query('select id from plans where user_id = $1 and id = $2 and deleted = false', [me.uid, id]);
      if (!plan) return sendJson(res, 404, { error: 'not_found', message: 'This saved teaching resource could not be found.' });
      return sendJson(res, 409, { error: 'invalid_transition', message: status === 'approved' ? 'Review this resource before approving it.' : 'This resource has changed. Refresh it and review the latest version.' });
    }
    return sendJson(res, 200, {
      ok: true,
      review: {
        id: row.id, status: row.status,
        reviewedAt: row.reviewed_at == null ? null : Number(row.reviewed_at),
        approvedAt: row.approved_at == null ? null : Number(row.approved_at),
        contentUpdatedAt: Number(row.content_updated_at)
      }
    });
  } catch (e) {
    console.error('resource review failed:', e && e.message);
    return sendJson(res, 500, { error: 'server', message: 'Could not update this resource review. Please try again.' });
  }
};
