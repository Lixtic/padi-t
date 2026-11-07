/* Bug reports, suggestions and (for admins) the feedback inbox. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var isAdmin = false, filter = 'new';

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
    $('#feedbackBtn').addEventListener('click', function () {
      $('#fbFormWrap').hidden = false; $('#fbDone').hidden = true; showErr('');
      var u = window.PadiSync && window.PadiSync.user && window.PadiSync.user();
      if (!email.value && u && u.email) email.value = u.email;
      open(dlg); setTimeout(function () { msg.focus(); }, 60);
    });
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

  /* ───────── Admin inbox ───────── */
  var KIND = { bug: 'Bug', idea: 'Idea', other: 'Other' };
  function when(ms) { try { return new Date(ms).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function renderList(res) {
    var list = $('#ibList'); list.replaceChildren();
    var c = res.counts || {};
    $('#ibSub').textContent = (c.new || 0) + ' new · ' + (c.done || 0) + ' done';
    $('#ibEmpty').hidden = res.items.length > 0;
    res.items.forEach(function (it) {
      var li = document.createElement('li'); li.className = 'fb-item' + (it.status === 'done' ? ' done' : '');
      var top = document.createElement('div'); top.className = 'fb-top';
      var k = document.createElement('span'); k.className = 'fb-kind'; k.dataset.kind = it.kind; k.textContent = KIND[it.kind] || 'Other';
      var m = document.createElement('small'); m.textContent = when(it.createdAt) + (it.tier ? ' · ' + it.tier : '') + (it.email ? ' · ' + it.email : '');
      top.append(k, m);
      var p = document.createElement('p'); p.textContent = it.message;
      li.append(top, p);
      var d = it.context || {};
      var bits = ['app', 'device', 'screen', 'online', 'signIn'].filter(function (x) { return d[x]; });
      if (bits.length) {
        var det = document.createElement('details'); var sm = document.createElement('summary'); sm.textContent = 'Technical details'; det.append(sm);
        var pre = document.createElement('p'); pre.className = 'fb-tech'; pre.textContent = bits.map(function (x) { return x + ': ' + d[x]; }).join('\n'); det.append(pre); li.append(det);
      }
      var row = document.createElement('div'); row.className = 'fb-actions';
      if (it.email) { var a = document.createElement('a'); a.href = 'mailto:' + it.email + '?subject=' + encodeURIComponent('Your GuidEd feedback'); a.textContent = 'Reply'; row.append(a); }
      var done = document.createElement('button'); done.type = 'button'; done.textContent = it.status === 'done' ? 'Reopen' : 'Mark done';
      done.addEventListener('click', function () { api('?action=status', { method: 'POST', body: { id: it.id, status: it.status === 'done' ? 'new' : 'done' } }).then(loadInbox); });
      var del = document.createElement('button'); del.type = 'button'; del.className = 'danger'; del.textContent = 'Delete';
      del.addEventListener('click', function () { if (window.confirm('Delete this message?')) api('?action=delete', { method: 'POST', body: { id: it.id } }).then(loadInbox); });
      row.append(done, del); li.append(row); list.append(li);
    });
  }
  function loadInbox() {
    return api('?action=list' + (filter ? '&status=' + filter : '')).then(function (j) {
      if (j.items) renderList(j); else { $('#ibSub').textContent = j.message || 'Could not load the inbox.'; $('#ibList').replaceChildren(); }
    });
  }
  function setupInbox() {
    var dlg = $('#inboxSheet'), btn = $('#inboxBtn'); if (!dlg || !btn) return;
    backdropClose(dlg);
    $('#ibClose').addEventListener('click', function () { close(dlg); });
    btn.addEventListener('click', function () { open(dlg); loadInbox(); });
    $('#ibFilter').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-f]'); if (!b) return;
      filter = b.dataset.f; $('#ibFilter').querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      loadInbox();
    });
  }
  // Only admins (ADMIN_EMAILS) get the inbox entry. Checked again whenever the sign-in state changes.
  function checkAdmin() {
    headers().then(function (h) {
      if (!h || !h.authorization && !h.Authorization) { isAdmin = false; $('#inboxBtn').hidden = true; return; }
      api('?action=me').then(function (j) { isAdmin = !!j.admin; $('#inboxBtn').hidden = !isAdmin; }, function () {});
    });
  }

  function init() {
    setupForm(); setupInbox(); checkAdmin();
    if (window.GuidedPlans && window.GuidedPlans.onChange) window.GuidedPlans.onChange(checkAdmin);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
