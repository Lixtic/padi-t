'use strict';
// Neon Auth calls this address to deliver one-time codes. Subscribing to "send.otp" turns off Neon's own emails, so this sends both kinds:
//   • codes for a phone number (sign in with a phone, adding a phone): a text message through Arkesel
//   • codes for an email address (confirming an email): an email through the same mail server as the Sunday emails
// Every call is checked against Neon's signature first (Ed25519, key published at the auth JWKS address).
const crypto = require('crypto');

const DEDUPE_MS = 10 * 60 * 1000, TOLERANCE_MS = 5 * 60 * 1000;
const seen = new Map();            // event id → time. Neon retries a call it thinks failed, so a repeat is not sent twice.
let keyCache = { at: 0, keys: [] };

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 100000) throw Object.assign(new Error('Too large'), { status: 413 }); chunks.push(Buffer.from(c)); }
  return Buffer.concat(chunks);
}

function jwksUrl() {
  if (process.env.NEON_AUTH_JWKS_URL) return process.env.NEON_AUTH_JWKS_URL;
  const base = String(process.env.NEON_AUTH_BASE_URL || '').trim().replace(/\/+$/, '');
  return base ? base + '/.well-known/jwks.json' : '';
}
async function keyFor(kid, fetchJwks) {
  const find = () => keyCache.keys.find((k) => k.kid === kid);
  if (!find() || Date.now() - keyCache.at > 10 * 60 * 1000) {
    if (!find() && Date.now() - keyCache.at < 10000 && keyCache.keys.length) return null;   // do not hammer the key server on bad kids
    keyCache = { at: Date.now(), keys: (await fetchJwks()).keys || [] };
  }
  return find() || null;
}

// raw: Buffer of the body as received. headers: lower-case header map. Throws when the call is not genuinely from Neon.
async function verifySignature(raw, headers, fetchJwks, now) {
  const sig = String(headers['x-neon-signature'] || ''), ts = String(headers['x-neon-timestamp'] || ''), kid = String(headers['x-neon-signature-kid'] || '');
  const [hdr, empty, sigB64] = sig.split('.');
  if (!hdr || empty !== '' || !sigB64 || !ts || !kid) throw new Error('Missing or malformed signature');
  const jwk = await keyFor(kid, fetchJwks);
  if (!jwk) throw new Error('Unknown signing key');
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const signingInput = hdr + '.' + Buffer.from(ts + '.' + raw.toString('base64url')).toString('base64url');
  if (!crypto.verify(null, Buffer.from(signingInput), key, Buffer.from(sigB64, 'base64url'))) throw new Error('Invalid signature');
  if (Math.abs((now || Date.now()) - Number(ts)) > TOLERANCE_MS) throw new Error('Stale webhook');
}

// Ghana numbers are the common case, so "0241234567" and "241234567" are read as +233. Returns +E.164 or ''.
function toE164(input) {
  let s = String(input || '').replace(/[\s().-]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+')) s = /^0\d{9}$/.test(s) ? '+233' + s.slice(1) : /^\d{9}$/.test(s) ? '+233' + s : s.startsWith('233') ? '+' + s : s;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : '';
}

function smsText(code, expiresAt) {
  let mins = Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000);
  if (!(mins >= 1 && mins <= 15)) mins = 5;
  return 'GuidEd: your code is ' + code + '. It works for ' + mins + ' minutes. Never share it with anyone.';
}

async function sendSms(phone, text, fetchImpl) {
  const key = process.env.ARKESEL_API_KEY;
  if (!key) throw Object.assign(new Error('ARKESEL_API_KEY is not set'), { status: 500 });
  const sender = String(process.env.ARKESEL_SENDER || 'GuidEd').replace(/[^A-Za-z0-9 ]/g, '').slice(0, 11) || 'GuidEd';
  const r = await (fetchImpl || fetch)('https://sms.arkesel.com/api/v2/sms/send', {
    method: 'POST', headers: { 'content-type': 'application/json', 'api-key': key },
    body: JSON.stringify({ sender, message: text, recipients: [phone.replace(/^\+/, '')] }),
  });
  let j = null; try { j = await r.json(); } catch (e) { /* not JSON */ }
  const failed = !r.ok || (j && typeof j.status === 'string' && /error|fail/i.test(j.status));
  if (failed) throw Object.assign(new Error('Arkesel ' + r.status + ' ' + String((j && (j.message || j.status)) || '').slice(0, 120)), { status: r.status >= 500 || r.status === 429 ? 502 : 422 });
}

const SUBJECTS = { 'email-verification': 'Confirm your GuidEd email', 'sign-in': 'Your GuidEd sign-in code', 'forget-password': 'Reset your GuidEd password' };
async function sendEmailCode(to, code, type, transportFactory) {
  if (!process.env.SMTP_URL) throw Object.assign(new Error('SMTP_URL is not set'), { status: 500 });
  const json = process.env.SMTP_URL === 'json';
  const transport = transportFactory ? transportFactory() : require('nodemailer').createTransport(json ? { jsonTransport: true } : process.env.SMTP_URL);
  const intro = type === 'email-verification' ? 'Enter this code in GuidEd to confirm your email address.' : type === 'forget-password' ? 'Enter this code in GuidEd to choose a new password.' : 'Enter this code in GuidEd to sign in.';
  const info = await transport.sendMail({
    from: process.env.MAIL_FROM || 'GuidEd <no-reply@localhost>', to, subject: (SUBJECTS[type] || 'Your GuidEd code') + ': ' + code,
    text: intro + '\n\nYour code: ' + code + '\n\nIt works for a few minutes. If you did not ask for it, you can ignore this email.',
    html: '<p>' + intro + '</p><p style="font-size:28px;letter-spacing:6px;font-weight:700">' + code + '</p><p style="color:#666">It works for a few minutes. If you did not ask for it, you can ignore this email.</p>',
  });
  if (json) global.__lastMail = { to, code, type, info };
}

// Sends one code. Returns nothing; throws an error with .status when delivery failed.
async function deliver(event, deps) {
  const d = event.event_data || {}, u = event.user || {}, code = String(d.otp_code || '');
  if (!/^\d{4,8}$/.test(code)) throw Object.assign(new Error('No code in event'), { status: 400 });
  if (d.delivery_preference === 'sms') {
    const phone = toE164(u.phone_number || d.phone_number || '');
    if (!phone) throw Object.assign(new Error('No phone number in event'), { status: 422 });
    await sendSms(phone, smsText(code, d.expires_at), deps && deps.fetch);
    return 'sms';
  }
  if (!u.email) throw Object.assign(new Error('No email in event'), { status: 422 });
  await sendEmailCode(u.email, code, d.otp_type, deps && deps.transport);
  return 'email';
}

async function handler(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; res.setHeader('allow', 'POST'); return res.end(); }
  const send = (status, body) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
  let raw;
  try { raw = await rawBody(req); } catch (e) { return send(e.status || 400, { error: 'bad body' }); }
  try {
    await verifySignature(raw, req.headers, async () => { const r = await fetch(jwksUrl()); if (!r.ok) throw new Error('JWKS ' + r.status); return r.json(); });
  } catch (e) { console.error('[neon-webhook] rejected:', e.message); return send(401, { error: 'invalid signature' }); }
  let event; try { event = JSON.parse(raw.toString('utf8')); } catch (e) { return send(400, { error: 'bad json' }); }
  if (event.event_type !== 'send.otp') return send(200, { ok: true, ignored: event.event_type });
  const id = String(event.event_id || ''); const now = Date.now();
  for (const [k, t] of seen) if (now - t > DEDUPE_MS) seen.delete(k);
  if (id && seen.has(id)) return send(200, { ok: true, duplicate: true });
  try {
    const t0 = Date.now(), how = await deliver(event);
    if (id) seen.set(id, now);
    // Timing only (never the code): how long Neon took to reach us, and how long the sender took. Tells us where a slow text lost its time.
    const sent = Number(req.headers['x-neon-timestamp']) || 0, sentMs = sent && sent < 1e12 ? sent * 1000 : sent;
    console.log('[neon-webhook] send.otp ' + (event.event_data && event.event_data.otp_type) + ' via ' + how + ' neonToUs=' + (sentMs ? Math.max(0, t0 - sentMs) + 'ms' : 'n/a') + ' sendTook=' + (Date.now() - t0) + 'ms');
    return send(200, { ok: true });
  } catch (e) {
    console.error('[neon-webhook] delivery failed:', e.message, '(' + ((event.event_data || {}).delivery_preference || 'email') + ')');
    return send(e.status || 500, { error: 'delivery failed' });
  }
}

module.exports = handler;
module.exports._test = { verifySignature, toE164, deliver, smsText, sendSms, resetKeys() { keyCache = { at: 0, keys: [] }; seen.clear(); } };
