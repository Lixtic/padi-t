'use strict';
const crypto = require('crypto');
const { sendJson, clientIp } = require('./_lib');
const A = require('./_auth');
const E = require('./_entitle');

// Issues a short-lived, signed claim for the Python Word-export fallback.
// The browser cannot choose its own tier or watermark state.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return sendJson(res, 405, { error: 'method' }); }
  if (!E.enabled()) return sendJson(res, 503, { error: 'not_configured', message: 'Account plans are not available.' });
  const secret = process.env.EXPORT_TOKEN_SECRET || process.env.AUTH_SECRET || '';
  if (secret.length < 24) return sendJson(res, 503, { error: 'not_configured', message: 'Secure Word export is not configured.' });
  const me = await A.authed(req).catch(() => null);
  if (!me || !me.uid) return sendJson(res, 401, { error: 'session', message: 'Please sign in before exporting.' });
  if (await require('./_quota').limited(res, 'export-token:' + me.uid, 30, 10 * 60 * 1000)) return;
  try {
    const ent = await E.resolve(me, clientIp(req));
    if (ent.blocked) return sendJson(res, 403, { error: 'blocked', message: 'This account has been paused.' });
    const payload = Buffer.from(JSON.stringify({
      uid: me.uid,
      tier: ent.tier === 'pro' ? 'pro' : 'free',
      exp: Math.floor(Date.now() / 1000) + 300
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return sendJson(res, 200, { token: payload + '.' + signature, expiresIn: 300 });
  } catch (e) {
    console.error('[export-token] claim failed', e && e.message);
    return sendJson(res, 503, { error: 'unavailable', message: 'Could not verify your export access. Please try again.' });
  }
};
