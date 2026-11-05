/* Padi-T · sync.js
   Email sign-in (one-time code) and plan sync through the app's own /api/auth and /api/sync routes
   (stored in the Neon database). Only active when the server reports that accounts are set up.
   Plans stay on the device first; signing in copies them to the teacher's own private rows. */
(function () {
  'use strict';
  var AUTH_KEY = 'schoolpadi.auth';
  var enabled = false, session = null;

  function load() { try { session = JSON.parse(localStorage.getItem(AUTH_KEY)); } catch (e) { session = null; } }
  function store() { try { if (session) localStorage.setItem(AUTH_KEY, JSON.stringify(session)); else localStorage.removeItem(AUTH_KEY); } catch (e) { /* storage blocked */ } }

  async function call(path, opts) {
    opts = opts || {};
    var headers = { 'content-type': 'application/json' };
    if (opts.auth) {
      if (!session || session.expires_at < Date.now() / 1000) { session = null; store(); var gone = new Error('Please sign in again.'); gone.status = 401; throw gone; }
      headers.authorization = 'Bearer ' + session.token;
    }
    var res;
    try { res = await fetch(path, { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined }); }
    catch (e) { var off = new Error('You appear to be offline.'); off.offline = true; throw off; }
    var body = null;
    try { body = await res.json(); } catch (e) { /* empty or not JSON */ }
    if (!res.ok) {
      var err = new Error((body && body.message) || 'Something went wrong. Try again.');
      err.status = res.status;
      if (res.status === 401 && opts.auth) { session = null; store(); }
      throw err;
    }
    return body;
  }

  window.PadiSync = {
    available: function () { return enabled; },
    init: function (c) { enabled = !!(c && c.enabled); load(); return enabled; },
    user: function () { return enabled && session && session.user && session.expires_at > Date.now() / 1000 ? session.user : null; },
    sendCode: function (email) { return call('/api/auth', { method: 'POST', body: { action: 'request', email: email } }); },
    verify: async function (email, code) {
      var j = await call('/api/auth', { method: 'POST', body: { action: 'verify', email: email, code: code } });
      session = { token: j.token, expires_at: j.expires_at, user: j.user }; store();
      return session.user;
    },
    signOut: async function () { session = null; store(); },
    list: function (limit) { return call('/api/sync?what=plans&limit=' + (limit || 60), { auth: true }); },
    push: async function (rows) {
      for (var i = 0; i < rows.length; i += 5) {                       // small batches keep each request light
        await call('/api/sync', { method: 'POST', auth: true, body: { what: 'plans', rows: rows.slice(i, i + 5) } });
      }
    },
    getProfile: async function () { var j = await call('/api/sync?what=profile', { auth: true }); return j && j.profile ? j.profile : null; },
    setProfile: function (data, updatedAt) { return call('/api/sync', { method: 'POST', auth: true, body: { what: 'profile', data: data, updated_at: updatedAt } }); }
  };
})();
