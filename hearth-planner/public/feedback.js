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
  /* ───────── Admin usage and payments ───────── */
  var usageDays = 30;
  function cur(c) { return c === 'GHS' ? 'GH₵' : (c || '') + ' '; }
  function el2(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function tile(label, value, sub) { var d = el2('div', 'us-tile'); d.append(el2('strong', '', String(value)), el2('span', '', label)); if (sub) d.append(el2('small', '', sub)); return d; }
  function section(title) { var s = el2('section', 'us-sec'); s.append(el2('h3', 'ps-h', title)); return s; }
  function pct(a, b) { return b ? Math.round(1000 * a / b) / 10 + '%' : '–'; }
  function renderUsage(s) {
    var body = $('#usBody'); body.replaceChildren();
    var ev = s.events || {}, c = s.currency;
    $('#usSub').textContent = 'Last ' + s.days + ' days. ' + s.trackingNote;
    var tiles = el2('div', 'us-tiles');
    tiles.append(tile('New accounts', s.accounts.new, s.accounts.total + ' in total'), tile('Guest previews', ev.guest_preview || 0, (ev.guest_limit || 0) + ' hit the daily limit'),
      tile('Plans written', (ev.plan_free || 0) + (ev.plan_pro || 0), (ev.plan_free || 0) + ' free · ' + (ev.plan_pro || 0) + ' Pro'), tile('Payments', ev.paid || 0, (ev.refund || 0) + ' refunded'));
    body.append(tiles);

    var f = section('From visitor to payer');
    var rows = [
      ['Guest previews shown', ev.guest_preview || 0],
      ['Guests who hit the daily limit', ev.guest_limit || 0],
      ['New accounts', s.accounts.new],
      ['Free teachers stopped at the weekly limit', (ev.free_limit_plans || 0) + (ev.free_limit_classes || 0), (ev.free_limit_plans || 0) + ' on plans · ' + (ev.free_limit_classes || 0) + ' on classes'],
      ['Checkouts started', ev.checkout_started || 0],
      ['Payments completed', ev.paid || 0, 'of started: ' + pct(ev.paid || 0, ev.checkout_started || 0)],
    ];
    var ul = el2('ul', 'us-rows');
    rows.forEach(function (r) { var li = el2('li'); li.append(el2('span', '', r[0]), el2('b', '', String(r[1]))); if (r[2]) li.append(el2('small', '', r[2])); ul.append(li); });
    f.append(ul); body.append(f);

    var w = s.freeWeek, lim = section('Is the free limit right?');
    lim.append(el2('p', 'us-note', w.active + ' free teachers wrote plans this week, averaging ' + w.average + ' each. ' + w.atLimit + ' of them (' + pct(w.atLimit, w.active) + ') used all ' + (w.limit || 'their') + ' plans.'
      + ' If most teachers reach the limit, it may be too tight to build trust. If almost none do, it gives little reason to upgrade.'));
    body.append(lim);

    var pro = section('Pro');
    var pr = el2('ul', 'us-rows');
    [['Active now', s.pro.active], ['Ending within 7 days', s.pro.endingSoon], ['Accounts that have paid', s.pro.payers, s.pro.conversion + '% of all accounts']].forEach(function (r) { var li = el2('li'); li.append(el2('span', '', r[0]), el2('b', '', String(r[1]))); if (r[2]) li.append(el2('small', '', r[2])); pr.append(li); });
    pro.append(pr);
    var m = s.money, parts = m.period.map(function (x) { return x.count + ' × ' + x.plan + ' = ' + cur(x.currency) + x.amount; });
    var tot = m.period.reduce(function (n, x) { return n + x.amount; }, 0);
    pro.append(el2('p', 'us-note', m.period.length ? 'Paid in this period: ' + cur(c) + tot + ' (' + parts.join(', ') + ').' : 'No payments in this period yet.'));
    if (m.allTime.length) pro.append(el2('p', 'us-note', 'All time: ' + m.allTime.map(function (x) { return cur(x.currency) + x.amount + ' from ' + x.count + ' payments'; }).join(', ') + (m.refunded.length ? '. Refunded: ' + m.refunded.map(function (x) { return cur(x.currency) + x.amount + ' (' + x.count + ')'; }).join(', ') : '') + '.'));
    body.append(pro);

    if (s.ai) {
      var ai = section('AI use');
      var tk = s.ai.tokens >= 1e6 ? Math.round(s.ai.tokens / 1e5) / 10 + 'M' : s.ai.tokens >= 1e3 ? Math.round(s.ai.tokens / 1e3) + 'K' : String(s.ai.tokens);
      var at = el2('div', 'us-tiles'); at.append(tile('AI requests', s.ai.requests, 'last ' + s.ai.days + ' days'), tile('Tokens used', tk, 'estimated'));
      ai.append(at);
      var mx = Math.max.apply(null, s.ai.daily.map(function (d) { return d.tokens; }).concat([1]));
      var bars = el2('div', 'us-bars'); bars.setAttribute('role', 'img'); bars.setAttribute('aria-label', 'Tokens used each day');
      s.ai.daily.forEach(function (d) { var b = document.createElement('i'); b.style.height = Math.max(3, Math.round(100 * d.tokens / mx)) + '%'; b.title = d.day + ': ' + d.tokens + ' tokens, ' + d.requests + ' requests'; bars.append(b); });
      if (s.ai.daily.length) ai.append(bars);
      if (s.ai.top.length) {
        var tl = el2('ul', 'us-rows');
        s.ai.top.forEach(function (x) { var li = el2('li'); li.append(el2('span', '', x.email), el2('b', '', x.tokens >= 1e3 ? Math.round(x.tokens / 1e3) + 'K' : String(x.tokens)), el2('small', '', x.requests + ' requests')); tl.append(li); });
        ai.append(el2('p', 'us-note', 'Heaviest teachers'), tl);
      }
      ai.append(el2('p', 'us-note', s.ai.note));
      body.append(ai);
    }

    var pay = section('Recent payments');
    if (!s.payments.length) pay.append(el2('p', 'us-note', 'None yet.'));
    s.payments.forEach(function (p) {
      var li = el2('div', 'us-pay' + (p.status === 'refunded' ? ' refunded' : ''));
      var top = el2('div', 'us-pay-top'); top.append(el2('b', '', cur(p.currency) + p.amount), el2('span', '', p.plan), el2('small', '', when(p.at)));
      var who = el2('small', 'us-pay-who', (p.email || 'no email') + ' · ' + p.status + ' · ' + p.reference);
      li.append(top, who);
      if (p.status === 'success') {
        var b = el2('button', 'danger', 'Refund'); b.type = 'button';
        b.addEventListener('click', function () {
          if (!window.confirm('Refund ' + cur(p.currency) + p.amount + ' to ' + (p.email || 'this customer') + '? Their Pro time from this payment is removed.')) return;
          b.disabled = true; b.textContent = 'Refunding…';
          headers().then(function (h) {
            return fetch('/api/admin?action=refund', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, h), body: JSON.stringify({ reference: p.reference }) }).then(function (r) { return r.json().catch(function () { return {}; }); });
          }).then(function (j) { if (!j.ok) window.alert(j.message || 'The refund did not go through.'); return loadUsage(); },
            function () { window.alert('You seem to be offline.'); b.disabled = false; b.textContent = 'Refund'; });
        });
        li.append(b);
      }
      pay.append(li);
    });
    body.append(pay);
  }
  function loadUsage() {
    return headers().then(function (h) {
      return fetch('/api/admin?action=stats&days=' + usageDays, { headers: h }).then(function (r) { return r.json().catch(function () { return {}; }); });
    }).then(function (j) { if (j.accounts) renderUsage(j); else { $('#usSub').textContent = j.message || 'Could not load usage.'; $('#usBody').replaceChildren(); } },
      function () { $('#usSub').textContent = 'You seem to be offline.'; });
  }
  function setupUsage() {
    var dlg = $('#usageSheet'), btn = $('#usageBtn'); if (!dlg || !btn) return;
    backdropClose(dlg);
    $('#usClose').addEventListener('click', function () { close(dlg); });
    btn.addEventListener('click', function () { open(dlg); loadUsage(); });
    $('#usRange').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-d]'); if (!b) return;
      usageDays = parseInt(b.dataset.d, 10); $('#usRange').querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      loadUsage();
    });
  }

  /* ───────── Admin: find a teacher, give or take Pro days, pause an account, announcement ───────── */
  function post(action, payload) {
    return headers().then(function (h) {
      return fetch('/api/admin?action=' + action, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, h), body: JSON.stringify(payload) }).then(function (r) { return r.json().catch(function () { return {}; }); });
    });
  }
  function getA(q) { return headers().then(function (h) { return fetch('/api/admin?action=' + q, { headers: h }).then(function (r) { return r.json().catch(function () { return {}; }); }); }); }
  function day(ms) { try { return new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } }
  function renderTeachers(list) {
    var box = $('#adResults'); box.replaceChildren();
    if (!list.length) { box.append(el2('p', 'us-note', 'No teacher found with that email.')); return; }
    list.forEach(function (t) {
      var c = el2('div', 'ad-t'), name = el2('b', '', t.email);
      var tag = el2('span', 'tag' + (t.tier === 'pro' ? ' pro' : ''), t.tier === 'pro' ? 'Pro' : 'Free'); name.append(tag);
      if (t.blocked) name.append(el2('span', 'tag bad', 'Paused'));
      c.append(name);
      c.append(el2('small', '', t.tier === 'pro' ? (t.proUntil ? 'Pro until ' + day(t.proUntil) : 'Pro (always, listed in PRO_EMAILS)') : 'Free plan'));
      c.append(el2('small', '', 'Plans this week: ' + t.plansThisWeek + ' · AI: ' + t.aiRequests + ' requests, ' + Math.round(t.aiTokens / 1000) + 'K tokens · joined ' + (t.firstSeen ? day(t.firstSeen) : 'before tracking')));
      if (t.blocked) c.append(el2('small', '', 'Paused' + (t.blocked.reason ? ': ' + t.blocked.reason : '') + ' · ' + day(t.blocked.at)));
      t.payments.forEach(function (p) { c.append(el2('small', '', cur(p.currency) + p.amount + ' ' + p.plan + ' · ' + p.status + ' · ' + day(p.at))); });
      var acts = el2('div', 'ad-acts');
      function btn(label, cls, fn) { var b = el2('button', cls || '', label); b.type = 'button'; b.addEventListener('click', fn); acts.append(b); }
      function after(j, okMsg) { if (j && j.ok) return findTeacher(true); window.alert((j && j.message) || 'That did not work.'); }
      btn('Give Pro days', '', function () {
        var d = window.prompt('How many Pro days to give ' + t.email + '? (1 to 730)', '30'); if (d === null) return;
        var note = window.prompt('A short note for the record (optional):', '') || '';
        post('grant', { user_id: t.user_id, days: parseInt(d, 10), note: note }).then(after);
      });
      if (t.proUntil) btn('Take days off', '', function () {
        var d = window.prompt('How many Pro days to take off ' + t.email + '?', '7'); if (d === null) return;
        post('grant', { user_id: t.user_id, days: -Math.abs(parseInt(d, 10)), note: window.prompt('A short note for the record (optional):', '') || '' }).then(after);
      });
      if (t.blocked) btn('Restore account', '', function () { post('block', { user_id: t.user_id, blocked: false }).then(after); });
      else btn('Pause account', 'danger', function () {
        var why = window.prompt('Pause ' + t.email + '? They will not be able to write plans or pay. Reason (for your record):', ''); if (why === null) return;
        post('block', { user_id: t.user_id, blocked: true, reason: why }).then(after);
      });
      c.append(acts); box.append(c);
    });
  }
  function findTeacher(keep) {
    var q = $('#adQ').value.trim(); if (q.length < 3) { $('#adResults').replaceChildren(el2('p', 'us-note', 'Type at least 3 letters of the email.')); return Promise.resolve(); }
    return getA('find&q=' + encodeURIComponent(q)).then(function (j) { if (j.results) renderTeachers(j.results); else $('#adResults').replaceChildren(el2('p', 'us-note', j.message || 'Could not search.')); loadLog(); });
  }
  var ACTIONS = { knowledge_approved: 'Approved a document', knowledge_rejected: 'Rejected a document', grant: 'Gave Pro days', remove: 'Took Pro days off', block: 'Paused', unblock: 'Restored', notice_on: 'Posted announcement', notice_off: 'Turned off announcement' };
  function loadLog() {
    return getA('log').then(function (j) {
      var ul = $('#adLog'); ul.replaceChildren();
      (j.log || []).slice(0, 15).forEach(function (x) { var li = el2('li'); li.append(el2('span', '', (ACTIONS[x.action] || x.action) + (x.target ? ' · ' + x.target : '')), el2('small', '', when(x.at) + (x.detail ? ' · ' + x.detail : ''))); ul.append(li); });
      if (!ul.children.length) ul.append(el2('li', '', 'Nothing yet.'));
    });
  }
  function loadNotice() {
    return getA('notice').then(function (n) {
      $('#adText').value = n.text || ''; $('#adKind').value = n.kind || 'info';
      $('#adNoticeState').textContent = n.on ? 'Showing now' + (n.until ? ', until ' + day(n.until) : ', until you turn it off') + '.' : 'Not showing.';
    });
  }

  /* ───────── Admin: knowledge base (add a document, approve or reject it) ───────── */
  var KB_STATUS = { pending_review: 'Waiting for review', approved: 'Approved', rejected: 'Rejected' };
  var KB_TRUST = { official: 'Official', approved_material: 'Approved material', reviewed_resource: 'Reviewed resource' };
  function loadKnowledge() {
    return getA('knowledge').then(function (j) {
      var ul = $('#kbList'); ul.replaceChildren();
      (j.sources || []).forEach(function (s) {
        var li = el2('li', 'kb-item'), top = el2('span', '');
        top.append(el2('b', '', s.title), el2('span', 'tag' + (s.status === 'approved' ? ' pro' : s.status === 'rejected' ? ' bad' : ''), KB_STATUS[s.status] || s.status));
        li.append(top, el2('small', '', [s.publisher, s.subject, (s.classes || []).join(', '), s.chunks + ' passages', s.status === 'approved' ? (KB_TRUST[s.trust_level] || s.trust_level) : '', s.source_url].filter(Boolean).join(' · ')));
        var acts = el2('div', 'ad-acts');
        function review(label, decision, cls) {
          var b = el2('button', cls || '', label); b.type = 'button';
          b.addEventListener('click', function () {
            if (decision === 'reject' && !window.confirm('Stop GuidEd using "' + s.title + '"?')) return;
            b.disabled = true;
            post('knowledge-review', { sourceId: s.id, decision: decision }).then(function (r) { if (!r || !r.ok) window.alert((r && r.message) || 'That did not work.'); loadKnowledge(); loadLog(); });
          });
          acts.append(b);
        }
        if (s.status !== 'approved') review('Approve', 'approve');
        if (s.status !== 'rejected') review(s.status === 'approved' ? 'Withdraw' : 'Reject', 'reject', 'danger');
        li.append(acts); ul.append(li);
      });
      if (!ul.children.length) ul.append(el2('li', '', 'No documents yet.'));
    });
  }
  // A plain text file becomes page-sized segments (form feeds mark pages when the text came from a PDF).
  function textSegments(text) {
    var pages = text.indexOf('\f') >= 0 ? text.split('\f') : text.match(/[\s\S]{1,6000}(?:\n|$)/g) || [];
    return pages.map(function (p, i) { return { page: i + 1, heading: '', text: p.trim() }; }).filter(function (s) { return s.text.length > 80; });
  }
  function readKnowledgeFile(file) {
    return file.text().then(function (text) {
      if (/\.json$/i.test(file.name)) { var j; try { j = JSON.parse(text); } catch (e) { throw new Error('That file is not valid JSON.'); } if (!j || !Array.isArray(j.segments)) throw new Error('This JSON has no "segments". Use a file made by prepare-knowledge.py.'); return j; }
      return { segments: textSegments(text) };
    });
  }
  function setupKnowledge() {
    var form = $('#kbForm'); if (!form) return;
    var fileEl = $('#kbFile'), state = $('#kbState');
    function updateApprovalReference() {
      var required = $('#kbType').value === 'approved_textbook' || $('#kbType').value === 'approved_supplementary';
      var row = $('#kbApprovalRow'), input = $('#kbApprovalReference');
      row.hidden = !required; input.required = required; input.disabled = !required;
    }
    $('#kbType').addEventListener('change', updateApprovalReference);
    updateApprovalReference();
    function fill(id, v) { var e = $(id); if (e && !e.value && v) e.value = v; }
    fileEl.addEventListener('change', function () {
      var f = fileEl.files[0]; if (!f || !/\.json$/i.test(f.name)) return;
      readKnowledgeFile(f).then(function (j) {
        fill('#kbTitle', j.title); fill('#kbPublisher', j.publisher); fill('#kbUrl', j.sourceUrl); fill('#kbSubject', j.subject);
        fill('#kbClasses', (j.classes || []).join(', ')); fill('#kbLicense', j.license); fill('#kbApprovalReference', j.approvalReference);
        if (j.documentType && $('#kbType').querySelector('option[value="' + j.documentType + '"]')) $('#kbType').value = j.documentType;
        updateApprovalReference();
        state.textContent = 'Read ' + j.segments.length + ' pages. Check the details, then add it.';
      }, function (e) { state.textContent = e.message; });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = fileEl.files[0]; if (!f) return;
      var btn = $('#kbAdd'); btn.disabled = true; state.textContent = 'Reading the file…';
      readKnowledgeFile(f).then(function (doc) {
        var body = Object.assign({}, doc, {
          title: $('#kbTitle').value.trim() || doc.title, publisher: $('#kbPublisher').value.trim() || doc.publisher,
          sourceUrl: $('#kbUrl').value.trim() || doc.sourceUrl, subject: $('#kbSubject').value.trim() || doc.subject,
          classes: $('#kbClasses').value.trim() ? $('#kbClasses').value.split(',').map(function (x) { return x.trim(); }).filter(Boolean) : (doc.classes || []),
          documentType: $('#kbType').value, license: $('#kbLicense').value.trim() || doc.license || '',
          approvalReference: $('#kbApprovalReference').value.trim() || doc.approvalReference || ''
        });
        state.textContent = 'Adding ' + body.segments.length + ' pages…';
        return post('knowledge', body);
      }).then(function (r) {
        if (r && r.ok) {
          state.textContent = r.duplicate ? 'That document is already here (' + (KB_STATUS[r.status] || r.status) + ').' : 'Added ' + r.chunks + ' passages. Approve it in the list above to start using it.';
          form.reset(); updateApprovalReference(); loadKnowledge(); loadLog();
        } else state.textContent = (r && r.message) || 'Could not add the document.';
      }).catch(function (err) { state.textContent = err.message || 'Could not add the document.'; }).then(function () { btn.disabled = false; });
    });
  }
  function setupAdmin() {
    var dlg = $('#adminSheet'), btn = $('#adminBtn'); if (!dlg || !btn) return;
    backdropClose(dlg);
    $('#adClose').addEventListener('click', function () { close(dlg); });
    btn.addEventListener('click', function () { open(dlg); loadNotice(); loadLog(); loadKnowledge(); });
    setupKnowledge();
    $('#adFind').addEventListener('submit', function (e) { e.preventDefault(); findTeacher(); });
    $('#adNotice').addEventListener('submit', function (e) {
      e.preventDefault();
      post('notice', { text: $('#adText').value, kind: $('#adKind').value, days: $('#adDays').value, on: true }).then(function () { loadNotice(); loadLog(); });
    });
    $('#adOff').addEventListener('click', function () { post('notice', { text: $('#adText').value, kind: $('#adKind').value, on: false }).then(function () { loadNotice(); loadLog(); }); });
  }

  // Only admins (ADMIN_EMAILS) get the inbox entry. Checked again whenever the sign-in state changes.
  function checkAdmin() {
    headers().then(function (h) {
      if (!h || !h.authorization && !h.Authorization) { isAdmin = false; $('#inboxBtn').hidden = true; $('#usageBtn').hidden = true; $('#adminBtn').hidden = true; return; }
      api('?action=me').then(function (j) { isAdmin = !!j.admin; $('#inboxBtn').hidden = !isAdmin; $('#usageBtn').hidden = !isAdmin; $('#adminBtn').hidden = !isAdmin; }, function () {});
    });
  }

  function init() {
    setupForm(); setupInbox(); setupUsage(); setupAdmin(); checkAdmin();
    if (window.GuidedPlans && window.GuidedPlans.onChange) window.GuidedPlans.onChange(checkAdmin);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
