'use strict';
const { sendJson } = require('./_lib');
const db = require('./_db');
const A = require('./_auth');

function configured() {
  return db.configured() && Boolean(process.env.NEON_REALTIME_URL && process.env.NEON_REALTIME_SECRET);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'method', message: 'Use GET.' });
  }
  if (!configured()) return sendJson(res, 503, { error: 'not_configured', message: 'Realtime is not set up on this server.' });
  const me = A.authed(req);
  if (!me) return sendJson(res, 401, { error: 'auth', message: 'Please sign in again.' });

  try {
    const { createRealtime, rawSql } = require('@neon/realtime/server');
    const realtime = createRealtime({ db: 'neondb', secret: process.env.NEON_REALTIME_SECRET });
    const query = rawSql(
      'select id, data, updated_at, deleted from plans where user_id = $1 order by updated_at desc limit 100',
      [me.uid],
    );
    const sealed = await realtime.seal({ query });
    return sendJson(res, 200, { url: process.env.NEON_REALTIME_URL, query: sealed });
  } catch (e) {
    console.error('realtime failed:', e && e.message);
    return sendJson(res, 503, { error: 'realtime', message: 'Could not start live plan updates.' });
  }
};
