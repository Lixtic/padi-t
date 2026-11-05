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

  // Runs a sign-in or sign-up request and turns every failure into a readable message.
  async function authCall(fn, fallback) {
    var result;
    try { result = await fn(); }
    catch (e) { throw new Error('Could not reach the sign-in service. Check your connection and try again.'); }
    if (!result) throw new Error(fallback);
    if (result.error) {
      var m = String(result.error.message || '');
      throw new Error(/failed to fetch|networkerror|load failed/i.test(m) || !m ? 'Could not reach the sign-in service. Check your connection and try again.' : m);
    }
    return result;
  }

  window.PadiSync = {
    available: function () { return enabled; },
    authConfigured: function () { return !!authClient; },
    init: async function (c) {
      enabled = !!(c && c.enabled && c.authUrl && window.NeonAuth);
      syncEnabled = !!(c && c.syncEnabled);
      realtime = !!(c && c.realtime);
      if (enabled) {
        authClient = window.NeonAuth.createAuthClient(c.authUrl);
        try {
          var current = await authClient.getSession();
          session = current && current.data && current.data.user ? { user: current.data.user } : null;
        } catch (e) { session = null; }                                // a failed check just means "not signed in"
      }
      return enabled;
    },
    syncAvailable: function () { return syncEnabled; },
    user: function () { return enabled && session && session.user ? session.user : null; },
    signUp: async function (email, password) {
      var result = await authCall(function () { return authClient.signUp.email({ email: email, password: password, name: email.split('@')[0] }); }, 'Could not create the account.');
      var user = result.data && result.data.user;
      if (!user || !(result.data.token || result.data.session)) {      // no session yet (e.g. email check on): sign in right away
        try { user = (await authCall(function () { return authClient.signIn.email({ email: email, password: password }); }, 'Could not sign in.')).data.user; }
        catch (e) { if (!user) throw e; throw new Error('Account created. Check your email to confirm it, then sign in.'); }
      }
      session = { user: user }; return user;
    },
    signIn: async function (email, password) {
      var result = await authCall(function () { return authClient.signIn.email({ email: email, password: password }); }, 'Could not sign in.');
      if (!result.data || !result.data.user) throw new Error('Could not sign in. Please try again.');
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
