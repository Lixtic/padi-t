/* Padi-T · sync.js
   Managed Neon Auth email/password sign-in and plan sync.
   Plans stay on the device first; signing in copies them to the teacher's own private rows. */
(function () {
  'use strict';
  var AUTH_KEY = 'schoolpadi.auth';
  var enabled = false, syncEnabled = false, realtime = false, session = null, live = null, authClient = null;

  function load() { try { session = JSON.parse(localStorage.getItem(AUTH_KEY)); } catch (e) { session = null; } }
  function store() { try { if (session) localStorage.setItem(AUTH_KEY, JSON.stringify(session)); else localStorage.removeItem(AUTH_KEY); } catch (e) { /* storage blocked */ } }

  async function call(path, opts) {
    opts = opts || {};
    var headers = { 'content-type': 'application/json' };
    if (opts.auth) {
      if (!authClient) { var gone = new Error('Please sign in again.'); gone.status = 401; throw gone; }
      var tokenResult = await authClient.token();
      if (tokenResult.error || !tokenResult.data || !tokenResult.data.token) { session = null; store(); throw new Error('Please sign in again.'); }
      headers.authorization = 'Bearer ' + tokenResult.data.token;
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
    init: async function (c) {
      enabled = !!(c && c.enabled && c.authUrl && window.NeonAuth);
      syncEnabled = !!(c && c.syncEnabled);
      realtime = !!(c && c.realtime);
      if (enabled) {
        authClient = window.NeonAuth.createAuthClient(c.authUrl);
        var current = await authClient.getSession();
        session = current.data && current.data.user ? { user: current.data.user } : null;
      }
      return enabled;
    },
    syncAvailable: function () { return syncEnabled; },
    user: function () { return enabled && session && session.user ? session.user : null; },
    signUp: async function (email, password) {
      var result = await authClient.signUp.email({ email: email, password: password, name: email.split('@')[0] });
      if (result.error) throw new Error(result.error.message || 'Could not create the account.');
      session = { user: result.data.user }; return session.user;
    },
    signIn: async function (email, password) {
      var result = await authClient.signIn.email({ email: email, password: password });
      if (result.error) throw new Error(result.error.message || 'Could not sign in.');
      session = { user: result.data.user }; return session.user;
    },
    signOut: async function () { if (authClient) await authClient.signOut(); session = null; store(); },
    watch: async function (onChange) {
      if (!realtime || !window.NeonRealtime || !session) return function () {};
      if (live) { live.unsubscribe(); live = null; }
      var j = await call('/api/realtime', { auth: true });
      var client = window.NeonRealtime.createRealtimeClient({ url: j.url });
      live = client.subscribe(j.query);
      var off = live.onChange(function () { if (typeof onChange === 'function') onChange(); });
      return function () {
        off();
        live.unsubscribe();
        live = null;
        client.close();
      };
    },
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
