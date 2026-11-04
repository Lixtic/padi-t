'use strict';
const { sendJson, accessRequired } = require('./_lib');
const { activeProvider } = require('./_providers');

// Tells the browser whether a model is connected. Never returns keys.
module.exports = (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'method', message: 'Use GET.' });
  }
  const provider = activeProvider();
  sendJson(res, 200, { demo: !provider, provider: provider || null, accessRequired: accessRequired() });
};
