'use strict';
// First-party proxy for Neon Auth. Browsers (iOS Safari, Firefox strict mode, Brave, private windows) block cookies set by a
// different site, so signing in directly against the Neon domain "works" but the session is dropped. Sending the sign-in calls
// through this site's own address makes the session cookie first-party, which every browser keeps.
// Reached as /api/neon-auth/<path> (see the rewrite in vercel.json).

const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'content-encoding', 'content-length', 'set-cookie', 'host', 'strict-transport-security']);

function base() { return String(process.env.NEON_AUTH_BASE_URL || '').trim().replace(/\/+$/, ''); }

// Make an upstream cookie valid for this site: no Domain (host-only), Lax, not partitioned.
function localCookie(c) {
  const parts = c.split(';').map((s) => s.trim()).filter(Boolean);
  const out = [parts[0]];
  let secure = false;
  for (const p of parts.slice(1)) {
    const k = p.split('=')[0].toLowerCase();
    if (k === 'domain' || k === 'partitioned' || k === 'samesite') continue;
    if (k === 'secure') secure = true;
    out.push(p);
  }
  out.push('SameSite=Lax');
  if (!secure && /^__(secure|host)-/i.test(parts[0])) out.push('Secure');
  return out.join('; ');
}

function bodyOf(req) {
  const b = req.body;
  if (b === undefined || b === null || b === '') return undefined;
  if (Buffer.isBuffer(b) || typeof b === 'string') return b;
  return JSON.stringify(b);
}

module.exports = async (req, res) => {
  const upstream = base();
  if (!upstream) { res.statusCode = 404; res.setHeader('content-type', 'application/json'); return res.end('{"error":"not_configured"}'); }
  const url = new URL(req.url, 'http://x');
  const path = String(url.searchParams.get('path') || '').replace(/^\/+/, '');
  url.searchParams.delete('path');
  if (/(^|\/)\.\.(\/|$)/.test(path)) { res.statusCode = 400; return res.end(); }
  const target = upstream + '/' + path + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '');

  const headers = {};
  for (const k of ['content-type', 'cookie', 'authorization', 'user-agent', 'accept', 'accept-language', 'origin', 'referer']) {
    if (req.headers[k]) headers[k] = req.headers[k];
  }
  if (!headers.origin) { const h = req.headers['x-forwarded-host'] || req.headers.host; if (h) headers.origin = 'https://' + h; }
  const fwd = req.headers['x-forwarded-for']; if (fwd) headers['x-forwarded-for'] = fwd;

  let r;
  try {
    r = await fetch(target, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : bodyOf(req), redirect: 'manual' });
  } catch (e) {
    res.statusCode = 502; res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ code: 'UPSTREAM', message: 'The sign-in service could not be reached.' }));
  }
  res.statusCode = r.status;
  r.headers.forEach((v, k) => { if (!HOP.has(k.toLowerCase())) res.setHeader(k, v); });
  const cookies = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  if (cookies.length) res.setHeader('set-cookie', cookies.map(localCookie));
  res.setHeader('cache-control', 'no-store');
  res.end(Buffer.from(await r.arrayBuffer()));
};
