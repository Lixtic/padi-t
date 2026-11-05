'use strict';
const crypto = require('crypto');
const db = require('./_db');

const TOKEN_DAYS = 90;
const secret = () => process.env.AUTH_SECRET || '';

// Old email-code sign-in needs a database, a signing secret and a way to send email.
const legacyConfigured = () => !!(db.configured() && secret().length >= 24 && process.env.SMTP_URL);
// Neon Managed Auth only needs a database and the JWKS URL used to verify its tokens.
const managedConfigured = () => !!(db.configured() && process.env.NEON_AUTH_JWKS_URL);
const syncConfigured = () => legacyConfigured() || managedConfigured();

// The token issuer may be the full auth URL or just its origin, so accept both.
function issuers() {
  const base = String(process.env.NEON_AUTH_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!base) return null;
  const list = [base, base + '/'];
  try { list.push(new URL(base).origin, new URL(base).origin + '/'); } catch (e) { /* keep what we have */ }
  return Array.from(new Set(list));
}
const realtimeConfigured = () => !!(db.configured() && process.env.NEON_REALTIME_URL && process.env.NEON_REALTIME_SECRET);

const b64 = (b) => Buffer.from(b).toString('base64url');
const mac = (s) => crypto.createHmac('sha256', secret()).update(s).digest('base64url');

function issue(user) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_DAYS * 86400;
  const body = b64(JSON.stringify({ uid: user.id, email: user.email, exp }));
  return { token: body + '.' + mac(body), expires_at: exp };
}

// Returns { uid, email } for a valid, unexpired bearer token, otherwise null.
function legacyAuthed(req) {
  const m = /^Bearer\s+([\w-]+\.[\w-]+)$/.exec(String(req.headers.authorization || ''));
  if (!m || !secret()) return null;
  const [body, sig] = m[1].split('.');
  const want = Buffer.from(mac(body)), got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p && p.uid && p.exp > Date.now() / 1000 ? { uid: String(p.uid), email: String(p.email || '') } : null;
  } catch (e) { return null; }
}

let jwks;
async function authed(req) {
  const m = /^Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)$/.exec(String(req.headers.authorization || ''));
  if (m && process.env.NEON_AUTH_JWKS_URL) {
    try {
      const { jwtVerify, createRemoteJWKSet } = require('jose');
      jwks = jwks || createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL));
      const iss = issuers();
      const result = await jwtVerify(m[1], jwks, iss ? { issuer: iss } : {});
      const p = result.payload;
      if (p.sub) return { uid: String(p.sub), email: String(p.email || '') };
    } catch (e) {
      return null;
    }
  }
  return legacyAuthed(req);
}

const hashCode = (email, code) => crypto.createHash('sha256').update(email + ':' + code + ':' + secret()).digest('hex');
const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

async function sendMail(to, code) {
  const nodemailer = require('nodemailer');
  const json = process.env.SMTP_URL === 'json';                         // tests: capture instead of sending
  const transport = nodemailer.createTransport(json ? { jsonTransport: true } : process.env.SMTP_URL);
  const info = await transport.sendMail({
    from: process.env.MAIL_FROM || 'Padi-T <no-reply@localhost>',
    to,
    subject: 'Your Padi-T code: ' + code,
    text: 'Your Padi-T sign-in code is ' + code + '.\n\nIt works for 10 minutes. If you did not ask for it, you can ignore this email.',
  });
  if (json) global.__lastMail = { to, code, info };
}

module.exports = { syncConfigured, legacyConfigured, realtimeConfigured, issue, authed, hashCode, newCode, sendMail };
