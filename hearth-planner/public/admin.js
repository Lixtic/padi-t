/* GuidEd back office (/admin). Same admin actions as before, now on their own page. Only people listed in ADMIN_EMAILS get in. */
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

  /* ───────── Admin inbox ───────── */
  var filter = 'new';
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
  var ACTIONS = { news_published: 'Published news', news_draft: 'Saved a news draft', news_delete: 'Deleted news', knowledge_approved: 'Approved a document', knowledge_rejected: 'Rejected a document', grant: 'Gave Pro days', remove: 'Took Pro days off', block: 'Paused', unblock: 'Restored', notice_on: 'Posted announcement', notice_off: 'Turned off announcement' };
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
    var fileEl = $('#kbFile'), state = $('#kbState'), unsupportedPreparedType = false;
    function updateApprovalReference() {
      var required = $('#kbType').value === 'approved_textbook' || $('#kbType').value === 'approved_supplementary';
      var row = $('#kbApprovalRow'), input = $('#kbApprovalReference');
      row.hidden = !required; input.required = required; input.disabled = !required;
    }
    $('#kbType').addEventListener('change', function () { unsupportedPreparedType = false; updateApprovalReference(); });
    updateApprovalReference();
    function fill(id, v) { var e = $(id); if (e && !e.value && v) e.value = v; }
    fileEl.addEventListener('change', function () {
      unsupportedPreparedType = false;
      var f = fileEl.files[0]; if (!f || !/\.json$/i.test(f.name)) return;
      readKnowledgeFile(f).then(function (j) {
        fill('#kbTitle', j.title); fill('#kbPublisher', j.publisher); fill('#kbUrl', j.sourceUrl); fill('#kbSubject', j.subject);
        fill('#kbClasses', (j.classes || []).join(', ')); fill('#kbLicense', j.license); fill('#kbApprovalReference', j.approvalReference);
        if (j.documentType) {
          if ($('#kbType').querySelector('option[value="' + j.documentType + '"]')) $('#kbType').value = j.documentType;
          else unsupportedPreparedType = true;
        }
        updateApprovalReference();
        state.textContent = unsupportedPreparedType
          ? 'Read ' + j.segments.length + ' pages. This file uses unsupported document type “' + j.documentType + '”. Choose the correct supported kind before adding it.'
          : 'Read ' + j.segments.length + ' pages. Check the details, then add it.';
      }, function (e) { state.textContent = e.message; });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (unsupportedPreparedType) { state.textContent = 'Choose a supported document kind before adding this file.'; return; }
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

  /* ───────── Admin: news (write, publish, edit, delete) ───────── */
  var newsPosts = [];
  function newsReset() {
    ['newsId', 'newsTitle', 'newsSummary', 'newsBody', 'newsSourceName', 'newsSourceUrl'].forEach(function (i) { $('#' + i).value = ''; });
    $('#newsNew').hidden = true; $('#newsPublish').textContent = 'Publish';
  }
  function newsEdit(p) {
    $('#newsId').value = p.id; $('#newsTitle').value = p.title; $('#newsSummary').value = p.summary; $('#newsBody').value = p.body;
    $('#newsSourceName').value = p.source_name || ''; $('#newsSourceUrl').value = p.source_url || '';
    $('#newsNew').hidden = false; $('#newsPublish').textContent = p.status === 'published' ? 'Update' : 'Publish';
    $('#newsState').textContent = 'Editing "' + p.title + '".'; $('#newsTitle').focus();
  }
  function loadNews() {
    return getA('news-list').then(function (j) {
      newsPosts = j.posts || [];
      var ul = $('#newsList'); ul.replaceChildren();
      newsPosts.forEach(function (p) {
        var li = el2('li', 'kb-item'), top = el2('span', '');
        top.append(el2('b', '', p.title), el2('span', 'tag' + (p.status === 'published' ? ' pro' : ''), p.status === 'published' ? 'Live' : 'Draft'));
        li.append(top, el2('small', '', day(p.published_at) + (p.status === 'published' ? ' · /news/' + p.slug : '')));
        var acts = el2('div', 'ad-acts');
        function btn(label, cls, fn) { var b = el2('button', cls || '', label); b.type = 'button'; b.addEventListener('click', fn); acts.append(b); }
        btn('Edit', '', function () { newsEdit(p); });
        if (p.status === 'published') { var a = el2('a', '', 'View'); a.href = '/news/' + p.slug; a.target = '_blank'; a.rel = 'noopener'; acts.append(a); }
        btn('Delete', 'danger', function () {
          if (!window.confirm('Delete "' + p.title + '"? This cannot be undone.')) return;
          post('news-delete', { id: p.id }).then(function (r) { if (!r || !r.ok) window.alert((r && r.message) || 'That did not work.'); if ($('#newsId').value === p.id) newsReset(); loadNews(); loadLog(); });
        });
        li.append(acts); ul.append(li);
      });
      if (!newsPosts.length) ul.append(el2('li', '', 'No posts yet.'));
    });
  }
  function setupNews() {
    var form = $('#newsForm'); if (!form) return;
    function save(status) {
      if (!form.reportValidity()) return;
      var state = $('#newsState'), btns = [$('#newsPublish'), $('#newsDraft')]; btns.forEach(function (b) { b.disabled = true; });
      post('news-save', { id: $('#newsId').value, title: $('#newsTitle').value, summary: $('#newsSummary').value, body: $('#newsBody').value, source_name: $('#newsSourceName').value, source_url: $('#newsSourceUrl').value, status: status })
        .then(function (r) {
          if (r && r.ok) { state.textContent = status === 'published' ? 'Published. It is live at /news/' + r.slug + (r.notified ? '. In-app notifications sent to ' + r.notified + ' accounts.' : '.') : 'Saved as a draft. It is not public yet.'; newsReset(); loadNews(); loadLog(); }
          else state.textContent = (r && r.message) || 'Could not save the post.';
        }).catch(function (e) { state.textContent = e.message || 'Could not save the post.'; })
        .then(function () { btns.forEach(function (b) { b.disabled = false; }); });
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); save('published'); });
    $('#newsDraft').addEventListener('click', function () { save('draft'); });
    $('#newsNew').addEventListener('click', function () { newsReset(); $('#newsState').textContent = ''; });
  }

  /* ───────── Page: sign-in check, sidebar, panels ───────── */
  var loaded = {};
  var LOADERS = {
    overview: function () { return loadUsage(); },
    teachers: function () { return $('#adQ').value.trim().length >= 3 ? findTeacher() : null; },
    feedback: function () { return loadInbox(); },
    announcement: function () { return loadNotice(); },
    news: function () { return loadNews(); },
    knowledge: function () { return loadKnowledge(); },
    activity: function () { return loadLog(); }
  };
  function show(name, push) {
    if (!LOADERS[name]) name = 'overview';
    document.querySelectorAll('.bo-panel').forEach(function (p) { p.hidden = p.dataset.panel !== name; });
    document.querySelectorAll('.bo-nav').forEach(function (b) { b.setAttribute('aria-current', b.dataset.panel === name ? 'page' : 'false'); });
    placeLens(true);
    document.title = (name.charAt(0).toUpperCase() + name.slice(1)) + ' · GuidEd back office';
    if (push !== false) { try { history.replaceState(null, '', '#' + name); } catch (e) { /* ignore */ } }
    LOADERS[name](); window.scrollTo(0, 0);
  }
  // The glass lens glides to the active tab, and the active tab is kept in view when the bar scrolls (phones).
  function placeLens(animate) {
    var pill = $('#boDock'), on = pill && pill.querySelector('[aria-current="page"]'), lens = pill && pill.querySelector('.bo-lens');
    if (!on || !pill) return;
    if (!lens) { lens = document.createElement('span'); lens.className = 'bo-lens'; lens.setAttribute('aria-hidden', 'true'); pill.insertBefore(lens, pill.firstChild); }
    if (!on.offsetWidth) return;
    lens.style.width = on.offsetWidth + 'px'; lens.style.transform = 'translateX(' + on.offsetLeft + 'px)'; lens.style.opacity = '1';
    lens.classList.toggle('glide', !!animate);
    try { on.scrollIntoView({ inline: 'center', block: 'nearest', behavior: animate ? 'smooth' : 'auto' }); } catch (e) { /* older browsers */ }
  }
  window.addEventListener('resize', function () { placeLens(false); });
  function gate(msg, link) { $('#boShell').hidden = true; $('#boGate').hidden = false; $('#boGateMsg').textContent = msg; $('#boGateLink').hidden = !link; }
  function start(user) {
    $('#boGate').hidden = true; $('#boShell').hidden = false; $('#boUser').textContent = user && user.email ? user.email : '';
    document.querySelector('#boDock').addEventListener('click', function (e) { var b = e.target.closest('button[data-panel]'); if (b) show(b.dataset.panel); });
    var themeButton = $('#boThemeToggle');
    function syncThemeButton() {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      themeButton.setAttribute('aria-pressed', String(dark));
      themeButton.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      themeButton.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
      themeButton.querySelector('.bo-theme-icon').textContent = dark ? '☀' : '☾';
      themeButton.querySelector('.bo-theme-label').textContent = dark ? 'Light mode' : 'Dark mode';
    }
    themeButton.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('schoolpadi.theme', next); } catch (e) { /* theme still applies for this session */ }
      syncThemeButton();
    });
    syncThemeButton();
    $('#usRange').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-d]'); if (!b) return;
      usageDays = parseInt(b.dataset.d, 10); $('#usRange').querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      loadUsage();
    });
    $('#ibFilter').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-f]'); if (!b) return;
      filter = b.dataset.f; $('#ibFilter').querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      loadInbox();
    });
    setupKnowledge(); setupNews();
    $('#adFind').addEventListener('submit', function (e) { e.preventDefault(); findTeacher(); });
    $('#adNotice').addEventListener('submit', function (e) {
      e.preventDefault();
      post('notice', { text: $('#adText').value, kind: $('#adKind').value, days: $('#adDays').value, on: true }).then(function () { loadNotice(); loadLog(); });
    });
    $('#adOff').addEventListener('click', function () { post('notice', { text: $('#adText').value, kind: $('#adKind').value, on: false }).then(function () { loadNotice(); loadLog(); }); });
    window.addEventListener('hashchange', function () { show(location.hash.slice(1), false); });
    show(location.hash.slice(1), false);
  }
  function init() {
    gate('Checking your sign-in…');
    fetch('/api/config', { headers: { accept: 'application/json' } }).then(function (r) { return r.json(); })
      .then(function (j) { return window.PadiSync.init(Object.assign({}, j.sync || {}, { enabled: !!(j.auth && j.auth.enabled), syncEnabled: !!j.sync, authUrl: j.auth && j.auth.url, authDirectUrl: j.auth && j.auth.direct })); })   // same settings the app builds from /api/config
      .then(function () {
        var u = window.PadiSync.user && window.PadiSync.user();
        if (!u) { gate('Sign in to GuidEd with your admin account first, then come back here.', true); return; }
        return api('?action=me').then(function (j) { if (j.admin) start(u); else gate('This account (' + (u.email || '') + ') is not an admin.', false); });
      }).catch(function () { gate('Could not load. Check your connection and refresh.', false); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
