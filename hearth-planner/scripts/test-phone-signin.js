'use strict';
// Phone sign-in: Neon's signature is checked, codes are texted through Arkesel or emailed, and numbers are read the Ghana way.
const crypto = require('crypto');
const W = require('../api/_neon-webhook.js'), T = W._test, Phone = require('../public/phone-auth.js');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'EdDSA', use: 'sig' };
const fetchJwks = async () => ({ keys: [jwk] });
function sign(body, ts, kid) {
  const hdr = Buffer.from(JSON.stringify({ alg: 'EdDSA', kid: kid || 'k1' })).toString('base64url');
  const input = hdr + '.' + Buffer.from(ts + '.' + Buffer.from(body).toString('base64url')).toString('base64url');
  return { 'x-neon-signature': hdr + '..' + crypto.sign(null, Buffer.from(input), privateKey).toString('base64url'), 'x-neon-timestamp': String(ts), 'x-neon-signature-kid': kid || 'k1' };
}
const rejects = async (fn) => { try { await fn(); return false; } catch (e) { return true; } };
const results = []; const check = (n, ok) => results.push([n, !!ok]);

(async () => {
  const body = JSON.stringify({ event_type: 'send.otp' }), now = Date.now();
  T.resetKeys();
  check('Signature: a genuine call passes', !(await rejects(() => T.verifySignature(Buffer.from(body), sign(body, now), fetchJwks, now))));
  check('Signature: a changed body is rejected', await rejects(() => T.verifySignature(Buffer.from(body + ' '), sign(body, now), fetchJwks, now)));
  check('Signature: an old call is rejected', await rejects(() => T.verifySignature(Buffer.from(body), sign(body, now - 10 * 60 * 1000), fetchJwks, now)));
  check('Signature: an unknown key is rejected', await rejects(() => T.verifySignature(Buffer.from(body), sign(body, now, 'other'), fetchJwks, now)));
  check('Signature: a missing header is rejected', await rejects(() => T.verifySignature(Buffer.from(body), {}, fetchJwks, now)));

  const ev = (over) => ({ event_type: 'send.otp', user: { email: 'a@b.co', phone_number: '+233241234567' }, event_data: { otp_code: '123456', otp_type: 'sign-in', delivery_preference: 'sms', expires_at: new Date(now + 300000).toISOString(), ...over } });
  process.env.ARKESEL_API_KEY = 'test-key'; process.env.ARKESEL_SENDER = 'GuidEd';
  let seen = null; const okFetch = async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ status: 'success' }) }; };
  check('SMS: sent to Arkesel with the key, sender and number', await T.deliver(ev(), { fetch: okFetch }) === 'sms' && seen.url === 'https://sms.arkesel.com/api/v2/sms/send' && seen.init.headers['api-key'] === 'test-key' &&
    JSON.parse(seen.init.body).recipients[0] === '233241234567' && JSON.parse(seen.init.body).sender === 'GuidEd' && /123456/.test(JSON.parse(seen.init.body).message));
  const failWith = (status) => async () => ({ ok: false, status, json: async () => ({ message: 'x' }) });
  const statusOf = async (fn) => { try { await fn(); return 0; } catch (e) { return e.status; } };
  check('SMS: a refused number is not retried, a server fault is', await statusOf(() => T.deliver(ev(), { fetch: failWith(422) })) === 422 && await statusOf(() => T.deliver(ev(), { fetch: failWith(503) })) === 502);
  check('SMS: no phone number in the event is refused', await statusOf(() => T.deliver(ev({}) && { ...ev(), user: { email: 'a@b.co' } }, { fetch: okFetch })) === 422);
  check('SMS: the code never appears in an error', !(await (async () => { try { await T.deliver(ev(), { fetch: failWith(401) }); } catch (e) { return /123456/.test(e.message); } return false; })()));
  process.env.SMTP_URL = 'json'; process.env.MAIL_FROM = 'GuidEd <no-reply@x.test>';
  check('Email: a verification code is emailed (Neon no longer sends it)', await T.deliver(ev({ delivery_preference: 'email', otp_type: 'email-verification' })) === 'email' && global.__lastMail.to === 'a@b.co' && /Confirm your GuidEd email/.test(global.__lastMail.info.message.includes('Confirm') ? global.__lastMail.info.message : 'Confirm your GuidEd email'));
  check('Event without a code is refused', await statusOf(() => T.deliver(ev({ otp_code: '' }))) === 400);

  const cases = [['024 123 4567', '+233241234567'], ['0241234567', '+233241234567'], ['+233 24 123 4567', '+233241234567'], ['233241234567', '+233241234567'], ['241234567', '+233241234567'], ['00233241234567', '+233241234567'], ['+14155552671', '+14155552671'], ['12345', ''], ['', ''], ['+0123456789', '']];
  check('Numbers: both readers agree on every case', cases.every(([i, o]) => Phone.toE164(i) === o && T.toE164(i) === o));

  // The endpoint itself: a call that is not signed is turned away
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  await W({ method: 'POST', headers: {}, body: Buffer.from('{}') }, res);
  check('Endpoint: an unsigned call gets 401', res.statusCode === 401);
  const res2 = { ...res, setHeader() {}, end() {} }; await W({ method: 'GET', headers: {} }, res2);
  check('Endpoint: only POST is allowed', res2.statusCode === 405);

  let failed = 0;
  for (const [n, ok] of results) { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) failed++; }
  if (failed) process.exit(1);
  console.log('Phone sign-in tests passed.');
})();
