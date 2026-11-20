/* Bug reports and suggestions. Admin tools live on the /admin page. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  

  function headers() {
    var S = window.PadiSync;
    return (S && S.authHeader ? S.authHeader() : Promise.resolve({})).then(function (h) { return h || {}; }, function () { return {}; });
  }
  function api(path, opts) {
    return headers().then(function (h) {
      var init = { method: (opts && opts.method) || 'GET', headers: Object.assign({ 'content-type': 'application/json' }, h) };
      if (opts && opts.body) init.body = JSON.stringify(opts.body);
      return fetch('/api/feedback' + path, init).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.__status = r.status; return j; }); });
    });
  }
  function context() {
    var GP = window.GuidedPlans, S = window.PadiSync, ctx = {};
    ctx.app = 'GuidEd ' + (document.documentElement.getAttribute('data-version') || 'web');
    ctx.tier = GP && GP.tier ? GP.tier() || '' : '';
    ctx.page = location.pathname;
    ctx.device = navigator.userAgent;
    ctx.screen = window.innerWidth + 'x' + window.innerHeight + ' @' + (window.devicePixelRatio || 1);
    ctx.online = navigator.onLine ? 'online' : 'offline';
    ctx.theme = document.documentElement.getAttribute('data-theme') || 'system';
    if (S && S.lastDetail && S.lastDetail()) ctx.signIn = S.lastDetail();
    return ctx;
  }
  function open(dlg) { if (dlg && !dlg.open) dlg.showModal(); }
  function close(dlg) { if (dlg && dlg.open) dlg.close(); }
  function backdropClose(dlg) {
    dlg.addEventListener('click', function (e) { var r = dlg.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close(); });
  }

  /* ───────── Send feedback ───────── */
  function setupForm() {
    var dlg = $('#fbSheet'); if (!dlg) return;
    var form = $('#fbForm'), msg = $('#fbMsg'), email = $('#fbEmail'), err = $('#fbErr'), send = $('#fbSend');
    var showErr = function (t) { err.textContent = t || ''; err.hidden = !t; };
    backdropClose(dlg);
    $('#fbClose').addEventListener('click', function () { close(dlg); });
    $('#fbDoneBtn').addEventListener('click', function () { close(dlg); });
    msg.addEventListener('input', function () { $('#fbCount').textContent = msg.value.length + ' / 2000'; showErr(''); });
    function openForm(pre) {
      $('#fbFormWrap').hidden = false; $('#fbDone').hidden = true; showErr('');
      if (pre) {
        var radio = form.querySelector('input[name="fbKind"][value="' + (pre.kind || 'other') + '"]'); if (radio) radio.checked = true;
        if (pre.text && !msg.value) { msg.value = pre.text; $('#fbCount').textContent = msg.value.length + ' / 2000'; }
      }
      var u = window.PadiSync && window.PadiSync.user && window.PadiSync.user();
      if (!email.value && u && u.email) email.value = u.email;
      open(dlg); setTimeout(function () { msg.focus(); try { msg.setSelectionRange(msg.value.length, msg.value.length); } catch (e) { /* ignore */ } }, 60);
    }
    window.GuidedFeedback = { open: openForm };
    $('#feedbackBtn').addEventListener('click', function () { openForm(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = msg.value.trim();
      if (text.length < 5) { showErr('Please write a little more so we can understand.'); msg.focus(); return; }
      var kind = (form.querySelector('input[name="fbKind"]:checked') || {}).value || 'other';
      send.disabled = true; send.firstElementChild.textContent = 'Sending…';
      api('', { method: 'POST', body: { kind: kind, message: text, email: email.value.trim(), context: context() } }).then(function (j) {
        if (j.ok) { msg.value = ''; $('#fbCount').textContent = '0 / 2000'; $('#fbFormWrap').hidden = true; $('#fbDone').hidden = false; return; }
        showErr(j.message || 'We could not send that. Please try again.');
      }, function () { showErr('You seem to be offline. Please try again when you have a connection.'); })
        .then(function () { send.disabled = false; send.firstElementChild.textContent = 'Send'; });
    });
  }

  // Only admins (ADMIN_EMAILS) get the inbox entry. Checked again whenever the sign-in state changes.
  function checkAdmin() {
    headers().then(function (h) {
      if (!h || !h.authorization && !h.Authorization) { $('#adminBtn').hidden = true; $('#settingsAdmin').hidden = true; return; }
      api('?action=me').then(function (j) { $('#adminBtn').hidden = !j.admin; $('#settingsAdmin').hidden = !j.admin; }, function () {});
    });
  }

  function init() {
    setupForm(); checkAdmin();
    if (window.GuidedPlans && window.GuidedPlans.onChange) window.GuidedPlans.onChange(checkAdmin);
    window.addEventListener('guided:auth-changed', checkAdmin);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
