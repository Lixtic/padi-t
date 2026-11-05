'use strict';
const { sendJson, accessRequired } = require('./_lib');
const { syncConfigured } = require('./_auth');
const { activeProvider } = require('./_providers');

// Tells the browser whether a model is connected. Never returns keys.
module.exports = (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'method', message: 'Use GET.' });
  }
  const provider = activeProvider();
  // Accounts and sync are on when DATABASE_URL (Neon), AUTH_SECRET and SMTP_URL are all set.
  const sync = syncConfigured() ? { enabled: true, realtime: require('./_auth').realtimeConfigured() } : null;
  sendJson(res, 200, { demo: !provider, provider: provider || null, accessRequired: accessRequired(), sync });
};
