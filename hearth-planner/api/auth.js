'use strict';
const crypto = require('crypto');
const { sendJson, clientIp, rateLimit, readJson } = require('./_lib');
const db = require('./_db');
const A = require('./_auth');

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const MAX_ATTEMPTS = 5;

// POST /api/auth  { action: 'request', email }  -> emails a 6-digit code
//                 { action: 'verify', email, code } -> { token, expires_at, user }
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return sendJson(res, 405, { error: 'method', message: 'Use POST.' }); }
  if (!A.legacyConfigured()) return sendJson(res, 503, { error: 'not_configured', message: 'Sign-in is not set up on this server.' });
  let body;
  try { body = await readJson(req, 4000); } catch (e) { return sendJson(res, e.status || 400, { error: 'bad_request', message: e.message }); }
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 120) return sendJson(res, 400, { error: 'bad_request', message: 'Enter a valid email address.' });

  const ip = rateLimit('auth:' + clientIp(req), 20, 10 * 60 * 1000);
  if (!ip.ok) return sendJson(res, 429, { error: 'rate', message: 'Too many attempts. Please wait a few minutes.' });

  try {
    await db.ensure();
    const now = Date.now();

    if (body.action === 'request') {
      const [row] = await db.query('select sent_at, sent_count, window_start from otp_codes where email = $1', [email]);
      let count = 1, start = now;
      if (row) {
        if (now - Number(row.sent_at) < 60000) return sendJson(res, 429, { error: 'rate', message: 'Please wait a minute before asking for another code.' });
        if (now - Number(row.window_start) < 3600000) {
          if (Number(row.sent_count) >= 5) return sendJson(res, 429, { error: 'rate', message: 'Too many codes requested. Try again in an hour.' });
          count = Number(row.sent_count) + 1; start = Number(row.window_start);
        }
      }
      const code = A.newCode();
      await db.query(
        'insert into otp_codes (email, code_hash, expires_at, attempts, sent_at, sent_count, window_start) values ($1,$2,$3,0,$4,$5,$6) ' +
        'on conflict (email) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at, sent_count = excluded.sent_count, window_start = excluded.window_start',
        [email, A.hashCode(email, code), now + 10 * 60000, now, count, start]);
      try { await A.sendMail(email, code); }
      catch (e) { console.error('mail failed:', e && e.message); return sendJson(res, 502, { error: 'mail', message: 'Could not send the email. Please try again.' }); }
      return sendJson(res, 200, { ok: true });
    }

    if (body.action === 'verify') {
      const code = String(body.code || '').replace(/\s+/g, '');
      const bad = () => sendJson(res, 400, { error: 'invalid_code', message: 'That code is not right or has expired. Ask for a new one.' });
      if (!/^\d{6}$/.test(code)) return bad();
      const [row] = await db.query('select code_hash, expires_at, attempts from otp_codes where email = $1', [email]);
      if (!row || Number(row.expires_at) < now || Number(row.attempts) >= MAX_ATTEMPTS) return bad();
      const want = Buffer.from(row.code_hash), got = Buffer.from(A.hashCode(email, code));
      if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
        await db.query('update otp_codes set attempts = attempts + 1 where email = $1', [email]);
        return bad();
      }
      await db.query('delete from otp_codes where email = $1', [email]);
      await db.query('insert into users (id, email) values ($1, $2) on conflict (email) do nothing', [crypto.randomUUID(), email]);
      const [user] = await db.query('select id, email from users where email = $1', [email]);
      const t = A.issue(user);
      return sendJson(res, 200, { token: t.token, expires_at: t.expires_at, user: { id: user.id, email: user.email } });
    }
    return sendJson(res, 400, { error: 'bad_request', message: 'Unknown request.' });
  } catch (e) {
    console.error('auth failed:', e && e.message);
    return sendJson(res, 500, { error: 'server', message: 'Something went wrong. Please try again.' });
  }
};
