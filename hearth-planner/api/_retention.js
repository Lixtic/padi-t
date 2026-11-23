'use strict';
// Scheduled cleanup for records whose expiry is already defined by application behaviour.
// Protected by Vercel's CRON_SECRET. This deliberately does not delete learner history,
// notifications, feedback, payments, admin logs, knowledge sources, or backups: those need
// an approved product/legal retention decision first.
const db = require('./_db');

const DAY = 24 * 60 * 60 * 1000;
const cacheTtlMs = () => {
  const days = Number.parseFloat(process.env.CACHE_TTL_DAYS || '');
  return (Number.isFinite(days) && days > 0 ? days : 30) * DAY;
};

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'method_not_allowed' }));
  }
  const secret = process.env.CRON_SECRET || '';
  if (!secret || req.headers.authorization !== 'Bearer ' + secret) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'unauthorized' }));
  }

  try {
    await db.ensure();
    const now = Date.now();
    const results = await Promise.all([
      db.query('delete from otp_codes where expires_at <= $1 returning email', [now]),
      db.query('delete from quota_reservations where expires_at <= $1 returning id', [now]),
      db.query('delete from free_plan_reservations where expires_at <= $1 returning id', [now]),
      db.query('delete from response_cache where created_at <= $1 returning key', [now - cacheTtlMs()]),
      db.query('delete from rate_limits where window_start <= $1 returning key', [now - DAY])
    ]);
    const counts = results.map((rows) => Array.isArray(rows) ? rows.length : 0);
    const summary = {
      ok: true,
      deleted: {
        expiredOtpCodes: counts[0],
        expiredQuotaReservations: counts[1],
        expiredFreePlanReservations: counts[2],
        expiredResponseCacheEntries: counts[3],
        staleRateLimitBuckets: counts[4]
      }
    };
    console.log('[retention] cleanup complete', summary.deleted);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 200;
    return res.end(JSON.stringify(summary));
  } catch (error) {
    console.error('[retention] cleanup failed', error && error.message);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: 'retention_cleanup_failed' }));
  }
}

module.exports = handler;
