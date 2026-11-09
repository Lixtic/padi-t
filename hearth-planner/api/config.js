'use strict';
const { sendJson, accessRequired } = require('./_lib');
const { syncConfigured } = require('./_auth');
const { activeProvider } = require('./_providers');

// Tells the browser whether a model is connected. Never returns keys.
module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'method', message: 'Use GET.' });
  }
  const provider = activeProvider();
  // Accounts and sync are on when DATABASE_URL (Neon), AUTH_SECRET and SMTP_URL are all set.
  const sync = syncConfigured() ? { enabled: true, realtime: require('./_auth').realtimeConfigured() } : null;
  // Sign-in goes through this site's own /api/neon-auth proxy so phones keep the session cookie (set NEON_AUTH_DIRECT=1 to bypass).
  const auth = process.env.NEON_AUTH_BASE_URL
    ? { enabled: true, url: process.env.NEON_AUTH_DIRECT === '1' ? process.env.NEON_AUTH_BASE_URL : '/api/neon-auth', proxied: process.env.NEON_AUTH_DIRECT !== '1' }
    : null;
  // Ads on the Free plan: only when both ids are set and well formed. Personalised ads are off unless ADS_PERSONALIZED=1.
  const client = String(process.env.ADSENSE_CLIENT || '').trim(), slot = String(process.env.ADSENSE_SLOT || '').trim();
  const ads = /^ca-pub-[0-9]{10,20}$/.test(client) && /^[0-9]{6,15}$/.test(slot) ? { client, slot, personalized: process.env.ADS_PERSONALIZED === '1' } : null;
  let notice = null;
  try { notice = await require('./_entitle').notice(); } catch (e) { notice = null; }
  sendJson(res, 200, { demo: !provider, ads, notice, provider: provider || null, accessRequired: accessRequired(), sync, auth });
};
