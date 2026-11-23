'use strict';
const assert = require('node:assert/strict');

const calls = [];
let fail = false;
global.__PADI_SQL__ = {
  query: async (sql, params) => {
    if (fail) throw new Error('database unavailable');
    calls.push({ sql: sql.replace(/\\s+/g, ' ').trim(), params });
    if (/^delete from/i.test(sql.trim())) return [{ id: 'x', email: 'redacted@example.test', key: 'k' }];
    return [];
  }
};
process.env.DATABASE_URL = 'test';
process.env.CRON_SECRET = 'cron-test-secret';
const handler = require('../api/_retention');

function response() {
  const r = { statusCode: 0, headers: {}, body: '', setHeader(k, v) { this.headers[k] = v; }, end(v) { this.body = v; } };
  return r;
}
async function request(method, authorization) {
  const req = { method, headers: authorization ? { authorization } : {} };
  const res = response();
  await handler(req, res);
  return res;
}

(async () => {
  let res = await request('GET');
  assert.equal(res.statusCode, 401, 'cron endpoint requires its secret');
  res = await request('POST', 'Bearer cron-test-secret');
  assert.equal(res.statusCode, 405, 'only scheduled GET requests are accepted');
  res = await request('GET', 'Bearer wrong');
  assert.equal(res.statusCode, 401);

  res = await request('GET', 'Bearer cron-test-secret');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body).deleted, {
    expiredOtpCodes: 1,
    expiredQuotaReservations: 1,
    expiredFreePlanReservations: 1,
    expiredResponseCacheEntries: 1,
    staleRateLimitBuckets: 1
  });
  const deletes = calls.filter((c) => /delete from (otp_codes|quota_reservations|free_plan_reservations|response_cache|rate_limits)/i.test(c.sql));
  assert.equal(deletes.length, 5);
  assert.match(deletes[0].sql, /otp_codes where expires_at <=/i);
  assert.match(deletes[1].sql, /quota_reservations where expires_at <=/i);
  assert.match(deletes[2].sql, /free_plan_reservations where expires_at <=/i);
  assert.match(deletes[2].sql, /insert into bonus/i, 'expired bonus reservations are refunded atomically');
  assert.match(deletes[3].sql, /response_cache where created_at <=/i);
  assert.match(deletes[4].sql, /rate_limits where window_start <=/i);
  assert.ok(deletes[3].params[0] < deletes[4].params[0], 'cache cutoff follows its 30-day TTL by default');
  assert.ok(deletes.every((c) => !/parent_learning|notifications|payments|feedback|admin_log|knowledge_sources/i.test(c.sql)), 'no records with unresolved retention policy are deleted');

  calls.length = 0; fail = true;
  res = await request('GET', 'Bearer cron-test-secret');
  assert.equal(res.statusCode, 500, 'database failures are visible to the scheduler');
  assert.equal(JSON.parse(res.body).ok, false);
  console.log('Retention cleanup tests passed.');
})().catch((error) => { console.error(error); process.exit(1); });
