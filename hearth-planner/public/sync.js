/* GuidEd · sync.js
   Managed Neon Auth email/password sign-in and plan sync.
   Plans stay on the device first; signing in copies them to the teacher's own private rows. */
(function () {
  'use strict';
  var AUTH_KEY = 'schoolpadi.auth';
  var authBase = '', trace = [], lastDetail = '';
  var enabled = false, syncEnabled = false, realtime = false, session = null, live = null, authClient = null;

  function load() { try { session = JSON.parse(localStorage.getItem(AUTH_KEY)); } catch (e) { session = null; } }
  function store() { try { if (session) localStorage.setItem(AUTH_KEY, JSON.stringify(session)); else localStorage.removeItem(AUTH_KEY); } catch (e) { /* storage blocked */ } }

  // An Error that carries a short machine-readable code the screen can act on.
  function problem(message, code, extra) { var e = new Error(message); e.code = code; if (extra) for (var k in extra) e[k] = extra[k]; return e; }

  var COOKIE_MSG = 'Your email and password were accepted, but this browser did not keep your sign-in, so your plans cannot sync here. '
    + 'This usually means the browser is blocking cookies from the sign-in service (for example Safari\'s "Prevent Cross-Site Tracking", a private window, or a tracking blocker).';

  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var note = function (step, what) { trace.push(step + ': ' + what); };

  // Gets a short-lived access token for our own API. The sign-in library's token() is tried first. If it fails, two other routes to the
  // same token are tried (a direct request, then the token header on a session check), because browsers can be slow to store the new
  // cookie and the library's cached state can be stale. Every step is noted so a failure can say exactly where it stopped.
  async function fetchJwt() {
    trace = [];
    for (var attempt = 0; attempt < 3; attempt++) {
      if (attempt) await wait(attempt === 1 ? 350 : 900);
      try {
        var t = await authClient.token();
        if (t && t.data && t.data.token) return t.data.token;
        note('token()', t && t.error ? (t.error.status || '') + ' ' + (t.error.message || t.error.code || 'error') : 'no token');
      } catch (e) { note('token()', 'threw ' + (e && (e.message || e.status))); }
      try {
        var r = await fetch(authBase + '/token', { credentials: 'include', headers: { accept: 'application/json' } });
        var b = null; try { b = await r.json(); } catch (e) { /* not JSON */ }
        if (r.ok && b && b.token) return b.token;
        note('GET /token', r.status + (b && (b.message || b.code) ? ' ' + (b.message || b.code) : ''));
      } catch (e) { note('GET /token', 'failed ' + (e && e.message)); }
      try {
        var hdr = '';
        var g = await authClient.getSession({ fetchOptions: { onSuccess: function (ctx) { hdr = (ctx && ctx.response && ctx.response.headers && ctx.response.headers.get('set-auth-jwt')) || ''; } } });
        if (hdr) return hdr;
        note('getSession()', g && g.data && g.data.user ? 'signed in, but no token header' : 'no session (cookie not sent)');
      } catch (e) { note('getSession()', 'threw ' + (e && e.message)); }
    }
    return '';
  }

  async function call(path, opts) {
    opts = opts || {};
    var headers = { 'content-type': 'application/json' };
    if (opts.auth) {
      if (!authClient) throw problem('Please sign in again.', 'session', { status: 401 });
      var jwt = await fetchJwt();
      if (!jwt) {
        // The sign-in service did not recognise this browser. Say so plainly instead of silently signing the teacher out.
        session = null; store();
        throw problem('Your sign-in has ended on this device. Please sign in again.', 'session', { status: 401 });
      }
      headers.authorization = 'Bearer ' + jwt;
    }
    var res;
    try { res = await fetch(path, { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined }); }
    catch (e) { var off = new Error('You appear to be offline.'); off.offline = true; throw off; }
    var body = null;
    try { body = await res.json(); } catch (e) { /* empty or not JSON */ }
    if (!res.ok) {
      console.warn('[GuidEd sync] ' + path + ' ->', res.status, body);
      var err = new Error((body && body.message) || 'Something went wrong. Try again.');
      err.status = res.status;
      if (res.status === 401 && opts.auth) { session = null; store(); err.code = 'session'; }
      throw err;
    }
    return body;
  }

  // Turns whatever the sign-in library reports (a thrown error or an error object) into a short message a teacher
  // can act on. Network failures and server refusals are told apart, because they need different fixes.
  function explain(e, action) {
    var status = e && e.status, code = String((e && (e.code || (e.body && e.body.code))) || ''), msg = String((e && (e.message || e.statusText)) || '');
    var out = function (text, kind, hint) { return { text: text, kind: kind, hint: hint || null }; };
    if (!status && /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(msg)) return out('Cannot reach the sign-in service. Check your internet connection and try again.', 'network');
    if (/INVALID_TOKEN|invalid token|token.*(expired|invalid)|expired/i.test(code + ' ' + msg) && action === 'reset') return out('This reset link has expired or was already used. Ask for a new one.', 'token');
    if (/RESET_PASSWORD_DISABLED|not enabled|disabled/i.test(code + ' ' + msg) && action === 'reset') return out('Resetting a password by email is not turned on for this site yet.', 'other');
    if (/invalid origin/i.test(msg)) return out('This website address is not approved for sign-in yet. If you run GuidEd, add ' + location.origin + ' as a trusted origin in Neon Auth.', 'origin');
    if (code === 'INVALID_EMAIL_OR_PASSWORD' || /invalid email or password|invalid password|incorrect/i.test(msg) || (status === 401 && action === 'signin')) return out('That email and password do not match. Check them, or create an account if you are new.', 'badlogin', 'signup');
    if (/USER_ALREADY_EXISTS|already exists|already registered|already in use/i.test(code + ' ' + msg)) return out('An account with this email already exists. Sign in instead.', 'exists', 'signin');
    if (/PASSWORD_TOO_SHORT|too short/i.test(code + ' ' + msg)) return out('Use at least 8 characters for your password.', 'password');
    if (/PASSWORD_TOO_LONG|too long/i.test(code + ' ' + msg)) return out('That password is too long. Use fewer characters.', 'password');
    if (/INVALID_EMAIL|invalid email/i.test(code + ' ' + msg)) return out('That email address does not look right.', 'email');
    if (/EMAIL_NOT_VERIFIED|not verified|verify your email/i.test(code + ' ' + msg)) return out('Please confirm your email address first. Check your inbox for the link, then sign in.', 'verify');
    if (status === 429 || /too many|rate limit/i.test(msg)) return out('Too many attempts. Wait a minute and try again.', 'rate');
    if (status >= 500) return out('The sign-in service had a problem. Try again in a moment.', 'server');
    return out(msg && msg.length < 140 ? msg : (action === 'signup' ? 'Could not create the account. Please try again.' : 'Could not sign in. Please try again.'), 'other');
  }

  // Runs a sign-in or sign-up request. Every failure becomes an Error with a readable message and a code.
  async function authCall(fn, action) {
    var result;
    try { result = await fn(); }
    catch (e) { console.error('[GuidEd sign-in] request threw:', e); var x = explain(e, action); throw problem(x.text, x.kind, { hint: x.hint }); }
    if (!result) { var f = explain(null, action); throw problem(f.text, f.kind); }
    if (result.error) { console.error('[GuidEd sign-in] error:', result.error); var y = explain(result.error, action); throw problem(y.text, y.kind, { hint: y.hint }); }
    return result;
  }

  // After a successful sign-in, confirm the session can really be used. If it cannot (usually blocked cookies), say so now
  // instead of letting the teacher find out later that nothing syncs.
  async function confirmSession() {
    var jwt = await fetchJwt();
    if (!jwt) {
      session = null; store();
      var detail = 'Technical details: ' + location.host + ' via ' + (authBase.charAt(0) === '/' || authBase.indexOf(location.origin) === 0 ? 'this site' : authBase) + ' · ' + trace.slice(0, 6).join(' · ');
      lastDetail = detail;
      console.error('[GuidEd sign-in] no token after sign-in', trace);
      throw problem(COOKIE_MSG, 'cookies', { detail: detail });
    }
  }

  window.PadiSync = {
    available: function () { return enabled; },
    lastDetail: function () { return lastDetail; },
    authConfigured: function () { return !!authClient; },
    init: async function (c) {
      enabled = !!(c && c.enabled && c.authUrl && window.NeonAuth);
      syncEnabled = !!(c && c.syncEnabled);
      realtime = !!(c && c.realtime);
      if (enabled) {
        authBase = c.authUrl.charAt(0) === '/' ? location.origin + c.authUrl : c.authUrl;
        authClient = window.NeonAuth.createAuthClient(authBase);
        try {
          var current = await authClient.getSession();
          session = current && current.data && current.data.user ? { user: current.data.user } : null;
        } catch (e) { session = null; }                                // a failed check just means "not signed in"
      }
      return enabled;
    },
    syncAvailable: function () { return syncEnabled; },
    user: function () { return enabled && session && session.user ? session.user : null; },
    // A bearer header for other API calls (such as plan generation), or nothing when signed out. Never throws.
    authHeader: async function () {
      if (!enabled || !authClient || !session) return {};
      try {
        var jwt = await fetchJwt();
        return jwt ? { authorization: 'Bearer ' + jwt } : {};
      } catch (e) { return {}; }
    },
    signUp: async function (email, password, displayName) {
      var result = await authCall(function () { return authClient.signUp.email({ email: email, password: password, name: String(displayName || '').trim() || email.split('@')[0] }); }, 'signup');
      var user = result.data && result.data.user;
      if (!user || !(result.data.token || result.data.session)) {      // no session yet (e.g. email check on): sign in right away
        try { user = (await authCall(function () { return authClient.signIn.email({ email: email, password: password }); }, 'signin')).data.user; }
        catch (e) { if (!user) throw e; throw problem('Account created. Check your email to confirm it, then sign in.', 'verify'); }
      }
      session = { user: user };
      try { await confirmSession(); } catch (e) { e.created = true; throw e; }
      return user;
    },
    signIn: async function (email, password) {
      var result = await authCall(function () { return authClient.signIn.email({ email: email, password: password }); }, 'signin');
      if (!result.data || !result.data.user) throw problem('Could not sign in. Please try again.', 'other');
      session = { user: result.data.user };
      await confirmSession();
      return session.user;
    },
    // Sends the password reset email. The link in it returns to this site with ?token=... (see app.js).
    requestReset: async function (email) {
      // Called straight off the client: it builds the request from the property path, so it must not be detached or wrapped in .call().
      await authCall(function () { return authClient.requestPasswordReset({ email: email, redirectTo: location.origin + '/' }); }, 'reset');
    },
    resetPassword: async function (token, newPassword) {
      await authCall(function () { return authClient.resetPassword({ newPassword: newPassword, token: token }); }, 'reset');
    },
    signOut: async function () { try { if (authClient) await authClient.signOut(); } catch (e) { /* signing out locally is enough */ } session = null; store(); },
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
    // Uploads in small batches. If the server refuses a batch (one plan too large or malformed), the plans are sent one by one so a
    // single bad plan cannot stop the rest from syncing. Returns how many plans could not be saved.
    push: async function (rows) {
      var failed = 0;
      var send = function (part) { return call('/api/sync', { method: 'POST', auth: true, body: { what: 'plans', rows: part } }); };
      for (var i = 0; i < rows.length; i += 5) {
        var batch = rows.slice(i, i + 5);
        try { await send(batch); }
        catch (e) {
          if (e.status !== 400) throw e;
          for (var j = 0; j < batch.length; j++) {
            try { await send([batch[j]]); }
            catch (e2) { if (e2.status === 400) failed++; else throw e2; }
          }
        }
      }
      return { failed: failed };
    },
    getProfile: async function () { var j = await call('/api/sync?what=profile', { auth: true }); return j && j.profile ? j.profile : null; },
    setProfile: function (data, updatedAt) { return call('/api/sync', { method: 'POST', auth: true, body: { what: 'profile', data: data, updated_at: updatedAt } }); },
    getAccountProfile: async function () { var j = await call('/api/account-profile', { auth: true }); return j && j.profile ? j.profile : null; },
    setAccountProfile: function (data) { return call('/api/account-profile', { method: 'POST', auth: true, body: { data: data } }); }
  };
})();
