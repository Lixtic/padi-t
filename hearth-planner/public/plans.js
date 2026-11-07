/* GuidEd · plans.js
   Guest preview, Free and Pro tiers: what is left, the upgrade sheet, and paying with Paystack.
   The server decides everything (see api/_entitle.js); this file only shows it and starts the payment. */
(function () {
  'use strict';
  var info = null, hooks = {}, listeners = [], demo = false, paying = false;
  var REF_KEY = 'guided.payref';
  var $ = function (s) { return document.querySelector(s); };
  var el = {};

  function toast(t) { if (hooks.toast) hooks.toast(t); }
  function fmtDate(ms) { try { return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } }
  function money(n, cur) { return (cur === 'GHS' ? 'GH₵' : cur + ' ') + (Math.round(n * 100) / 100).toString(); }
  // Days left when a paid Pro period ends within a week (testers on PRO_EMAILS have no end date).
  function endingSoon() {
    if (P.tier() !== 'pro' || !info.pro || info.pro.vip || !info.pro.expiresAt) return 0;
    var d = Math.ceil((info.pro.expiresAt - Date.now()) / 86400000);
    return d >= 1 && d <= 7 ? d : 0;
  }
  function dayStamp() { return new Date().toISOString().slice(0, 10); }
  function renderBanner() {
    var b = document.getElementById('proBanner'); if (!b) return;
    var d = endingSoon(), shown = !!d;
    try { if (shown && localStorage.getItem('guided.proBanner') === info.pro.expiresAt + ':' + dayStamp()) shown = false; } catch (e) { /* show it */ }
    b.hidden = !shown;
    if (shown) document.getElementById('proBannerText').textContent = 'Your Pro ends in ' + d + (d === 1 ? ' day' : ' days') + ' (' + fmtDate(info.pro.expiresAt) + ').';
  }
  function emit() { render(); renderBadge(); renderBanner(); if (el.ps && el.ps.open) renderPlan(); listeners.forEach(function (f) { try { f(info); } catch (e) { /* ignore */ } }); }

  var P = {
    configure: function (h) { hooks = h || {}; },
    onChange: function (f) { listeners.push(f); },
    info: function () { return info; },
    // 'guest' | 'free' | 'pro', or null when plans are not in use (then nothing is limited or locked).
    tier: function () { return !demo && info && info.tiers ? info.tier : null; },
    setDemo: function (d) { demo = !!d; emit(); },
    // Free and guest teachers plan for one class at a time; the other class chips show a Pro lock.
    alsoLocked: function () { var t = P.tier(); return t === 'guest' || (t === 'free' && info.limits && info.limits.freeClasses > 0); },
    footerText: function () { return P.tier() === 'free' ? 'Made with GuidEd' : ''; },

    load: async function () {
      try {
        var h = hooks.authHeader ? await hooks.authHeader() : {};
        var r = await fetch('/api/billing?action=status', { headers: h });
        if (!r.ok) throw new Error('status ' + r.status);
        info = await r.json();
      } catch (e) { info = null; }
      emit();
      return info;
    },

    openUpgrade: function (reason, message) {
      if (!el.dlg || !P.tier()) return;
      el.reason.textContent = message || '';
      el.reason.hidden = !message;
      el.msg.textContent = ''; el.msg.hidden = true;
      renderUpgrade();
      if (!el.dlg.open) el.dlg.showModal();
    },
    closeUpgrade: function () { if (el.dlg && el.dlg.open) el.dlg.close(); },

    // Starts a Paystack payment and sends the browser there.
    pay: async function (plan) {
      if (paying) return;
      if (!hooks.signedIn || !hooks.signedIn()) {
        P.closeUpgrade();
        if (hooks.openSignup) hooks.openSignup('Create a free account first. Then you can upgrade in a few taps.');
        return;
      }
      paying = true; setPayBusy(true);
      try {
        var h = await hooks.authHeader();
        var r = await fetch('/api/billing?action=checkout', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, h), body: JSON.stringify({ plan: plan }) });
        var j = {}; try { j = await r.json(); } catch (e) { /* not JSON */ }
        if (!r.ok || !j.url) throw new Error(j.message || 'Could not start the payment. Please try again.');
        try { sessionStorage.setItem(REF_KEY, j.reference); } catch (e) { /* ignore */ }
        location.href = j.url;
      } catch (e) {
        paying = false; setPayBusy(false);
        showMsg(e.message || 'Could not start the payment. Please try again.');
      }
    },

    // When Paystack sends the teacher back, the address carries ?reference=... Remember it, then confirm once signed in.
    captureReturn: function () {
      try {
        var q = new URLSearchParams(location.search), ref = q.get('reference') || q.get('trxref');
        if (!ref) return;
        sessionStorage.setItem(REF_KEY, ref);
        q.delete('reference'); q.delete('trxref');
        history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
      } catch (e) { /* ignore */ }
    },
    resume: async function () {
      var ref = '';
      try { ref = sessionStorage.getItem(REF_KEY) || ''; } catch (e) { /* ignore */ }
      if (!ref || !hooks.signedIn || !hooks.signedIn()) return;
      toast('Confirming your payment…');
      for (var i = 0; i < 5; i++) {
        try {
          var h = await hooks.authHeader();
          var r = await fetch('/api/billing?action=verify', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, h), body: JSON.stringify({ reference: ref }) });
          var j = {}; try { j = await r.json(); } catch (e) { /* not JSON */ }
          if (j.verified) {
            try { sessionStorage.removeItem(REF_KEY); } catch (e) { /* ignore */ }
            info = j; emit();
            toast('GuidEd Pro is on' + (j.pro && j.pro.expiresAt ? ' until ' + fmtDate(j.pro.expiresAt) : '') + '. Thank you!');
            return;
          }
          if (r.status !== 402 || !/still being confirmed/.test(j.message || '')) {       // not worth waiting for
            try { sessionStorage.removeItem(REF_KEY); } catch (e) { /* ignore */ }
            toast(j.message || 'The payment was not completed.');
            return;
          }
        } catch (e) { /* try again */ }
        await new Promise(function (ok) { setTimeout(ok, 3000); });
      }
      toast('Your payment is still being confirmed. Pro will switch on by itself in a few minutes.');
    },
  };

  /* ───────── Sidebar card ───────── */
  function render() {
    if (!el.row) return;
    var t = P.tier();
    el.row.hidden = !t;
    if (!t) return;
    var title, sub, cta, tone = t;
    if (t === 'guest') {
      var g = info.guest || { used: 0, limit: 0 };
      title = 'Free preview';
      sub = g.limit ? Math.max(0, g.limit - g.used) + ' of ' + g.limit + ' previews left today' : 'Lesson 1 of every plan';
      cta = '';                                     // the sign-in card above already says it
    } else if (t === 'free') {
      var f = info.free || { used: 0, limit: 0 };
      title = 'Free plan';
      sub = f.limit ? Math.max(0, f.limit - f.used) + ' of ' + f.limit + ' full plans left this week' : 'Full plans';
      cta = 'Upgrade';
    } else {
      title = 'GuidEd Pro';
      var dl0 = endingSoon();
      sub = dl0 ? 'Ends in ' + dl0 + (dl0 === 1 ? ' day' : ' days') + ' · ' + fmtDate(info.pro.expiresAt) : info.pro && info.pro.expiresAt ? 'Active until ' + fmtDate(info.pro.expiresAt) : 'Active';
      cta = dl0 ? 'Extend now' : 'Extend';
    }
    el.row.dataset.tier = tone; el.row.dataset.warn = t === 'pro' && endingSoon() ? '1' : '';
    el.rowTitle.textContent = title; el.rowSub.textContent = sub; el.rowCta.textContent = cta; el.rowCta.hidden = !cta;
    document.documentElement.dataset.tier = t;
  }

  /* ───────── Plan badge (top bar) and "Your plan" sheet ───────── */
  var NAMES = { guest: 'Guest', free: 'Free', pro: 'Pro' };
  function renderBadge() {
    if (!el.badge) return;
    var t = P.tier();
    el.badge.hidden = !t;
    if (!t) return;
    el.badge.dataset.tier = t;
    el.badge.textContent = NAMES[t];
    el.badge.setAttribute('aria-label', 'Your plan: ' + NAMES[t] + '. Tap to see what it includes.');
  }
  // [what, guest, free, pro, free-and-guest hint of what Pro adds]. ok=false shows a lock.
  function capabilities(t) {
    var lim = info.limits || {};
    var fp = lim.freePlansWeekly, fc = lim.freeClasses, gp = lim.guestPreviewsDaily;
    var freeClasses = fc === 1 ? '1 class a week' : fc ? fc + ' classes a week' : 'Every class';
    var all = {
      guest: [
        ['Lesson plans', true, 'Lesson 1 preview' + (gp ? ', ' + gp + ' a day' : ''), 'Unlimited full plans'],
        ['Classes', true, '1 class at a time', 'Basic 7, 8 and 9'],
        ['Study notes and BECE questions', false, 'Create a free account to add them'],
        ['Changes and follow-up requests', false, 'Create a free account to ask'],
        ['Word downloads', false, 'Create a free account to download'],
        ['Sync across your devices', false, 'Create a free account to sync'],
      ],
      free: [
        ['Lesson plans', true, fp ? fp + ' full plans a week' : 'Full plans', 'Unlimited full plans'],
        ['Classes', true, freeClasses, 'Basic 7, 8 and 9'],
        ['Study notes and BECE questions', true, 'Included'],
        ['Changes and follow-up requests', true, 'Included'],
        ['Word downloads', true, 'With a "Made with GuidEd" footer', 'Clean, ready to print'],
        ['Sync across your devices', true, 'Included'],
      ],
      pro: [
        ['Lesson plans', true, 'Unlimited full plans'],
        ['Classes', true, 'Basic 7, 8 and 9'],
        ['Study notes and BECE questions', true, 'Included'],
        ['Changes and follow-up requests', true, 'Included'],
        ['Word downloads', true, 'Clean, ready to print'],
        ['Sync across your devices', true, 'Included'],
      ],
    };
    return all[t];
  }
  function daysLeft(ms) { return Math.max(0, Math.ceil((ms - Date.now()) / 86400000)); }
  function renderPlan() {
    var t = P.tier();
    if (!t || !el.ps) return;
    el.psBadge.dataset.tier = t; el.psBadge.textContent = NAMES[t];
    var sub = '', meter = null, cta = '', note = '';
    if (t === 'guest') {
      var g = info.guest || { used: 0, limit: 0 };
      el.psTitle.textContent = 'You are using GuidEd as a guest';
      sub = 'You can try a preview of Lesson 1 without an account.';
      if (g.limit) meter = { used: g.used, limit: g.limit, text: Math.max(0, g.limit - g.used) + ' of ' + g.limit + ' previews left today' };
      cta = 'Create free account';
      note = 'A free account unlocks full plans, Word downloads and sync.';
    } else if (t === 'free') {
      var f = info.free || { used: 0, limit: 0 };
      el.psTitle.textContent = 'You are on the Free plan';
      sub = info.email ? 'Signed in as ' + info.email : 'Signed in';
      if (f.limit) meter = { used: f.used, limit: f.limit, text: Math.max(0, f.limit - f.used) + ' of ' + f.limit + ' full plans left this week' + (f.resetsAt ? ' · renews Monday' : '') };
      cta = 'Upgrade to Pro';
      note = 'Pro is a one-time payment for a set time. It never renews by itself.';
    } else {
      var ex = info.pro && info.pro.expiresAt;
      el.psTitle.textContent = 'You have GuidEd Pro';
      sub = ex ? 'Active until ' + fmtDate(ex) + ' (' + daysLeft(ex) + ' days left)' : 'Active on your account';
      if (endingSoon()) sub = 'Ends soon: ' + sub;
      cta = 'Extend Pro';
      note = 'New time is added on top of what you have left.';
    }
    el.psSub.textContent = sub;
    el.psMeter.hidden = !meter;
    if (meter) { el.psFill.style.width = Math.min(100, meter.limit ? Math.round(100 * meter.used / meter.limit) : 0) + '%'; el.psMeterText.textContent = meter.text; }
    el.psList.replaceChildren();
    capabilities(t).forEach(function (c) {
      var li = document.createElement('li'); li.className = c[1] ? 'ok' : 'locked';
      var mark = document.createElement('span'); mark.className = 'ps-mark'; mark.setAttribute('aria-hidden', 'true'); mark.textContent = c[1] ? '✓' : '🔒';
      var body = document.createElement('span'); body.className = 'ps-body';
      var a = document.createElement('strong'); a.textContent = c[0];
      var b = document.createElement('small'); b.textContent = c[2];
      body.append(a, b);
      if (c[3] && t === 'free') { var u = document.createElement('small'); u.className = 'ps-pro'; u.textContent = 'Pro: ' + c[3]; body.append(u); }
      li.append(mark, body); el.psList.append(li);
    });
    el.psCta.textContent = cta; el.psCta.hidden = !cta; el.psNote.textContent = note;
    if (el.psHelp) el.psHelp.hidden = !(t === 'pro' && info.pro && !info.pro.vip);
  }
  P.openPlan = function () {
    if (!el.ps || !P.tier()) return;
    renderPlan();
    if (!el.ps.open) el.ps.showModal();
  };
  P.closePlan = function () { if (el.ps && el.ps.open) el.ps.close(); };

  /* ───────── Upgrade sheet ───────── */
  function showMsg(t) { el.msg.textContent = t; el.msg.hidden = !t; }
  function setPayBusy(on) { el.buy.forEach(function (b) { b.disabled = on || b.dataset.off === '1'; b.classList.toggle('busy', on); }); }
  function renderUpgrade() {
    if (!info || !info.pricing) return;
    var pr = info.pricing, lim = info.limits || {};
    var free = lim.freePlansWeekly ? lim.freePlansWeekly + ' a week' : 'Unlimited';
    var cls = lim.freeClasses === 1 ? '1 class' : lim.freeClasses ? lim.freeClasses + ' classes' : 'All classes';
    el.table.replaceChildren();
    [['Full lesson plans', free, 'Unlimited'], ['Classes you plan for', cls, 'Basic 7, 8 and 9'], ['Word downloads', 'With a GuidEd footer', 'Clean, ready to print'], ['Study notes and BECE questions', 'Included', 'Included']].forEach(function (r) {
      var row = document.createElement('div'); row.className = 'up-row';
      var a = document.createElement('span'); a.className = 'up-what'; a.textContent = r[0];
      var b = document.createElement('span'); b.className = 'up-free'; b.textContent = r[1];
      var c = document.createElement('span'); c.className = 'up-pro'; c.textContent = r[2];
      row.append(a, b, c); el.table.append(row);
    });
    var m = pr.monthly, t = pr.term;
    var save = m.amount && t.amount && t.days ? Math.round((1 - (t.amount / t.days) / (m.amount / m.days)) * 100) : 0;
    var off = !pr.checkout;
    [[el.buyMonthly, 'monthly', m, ''], [el.buyTerm, 'term', t, save > 4 ? 'Save ' + save + '%' : '']].forEach(function (x) {
      var b = x[0], p = x[2];
      b.querySelector('.up-label').textContent = p.label;
      b.querySelector('.up-days').textContent = p.days + ' days of Pro';
      b.querySelector('.up-amount').textContent = money(p.amount, pr.currency);
      var tag = b.querySelector('.up-tag'); tag.textContent = x[3]; tag.hidden = !x[3];
      b.dataset.off = off ? '1' : ''; b.disabled = off;
    });
    el.note.textContent = off ? 'Payments are not open yet. Please check back soon.' : 'Pay with MTN MoMo, Telecel Cash, AT Money or a bank card. It is a one-time payment with no automatic renewal.';
    var pro = info.tier === 'pro';
    el.title.textContent = pro ? 'Extend GuidEd Pro' : 'Go further with GuidEd Pro';
    el.lead.textContent = pro ? (info.pro && info.pro.expiresAt ? 'Pro is active until ' + fmtDate(info.pro.expiresAt) + '. New time is added on top.' : 'Pro is active on your account.') : 'Plan every class, every week, and download clean Word files.';
  }

  function build() {
    el.row = $('#planRow');
    if (el.row) { el.rowTitle = $('#planRowTitle'); el.rowSub = $('#planRowSub'); el.rowCta = $('#planRowCta'); }
    el.badge = $('#planBadge');
    el.ps = $('#planSheet');
    if (el.ps) {
      el.psBadge = $('#psBadge'); el.psTitle = $('#psTitle'); el.psSub = $('#psSub'); el.psMeter = $('#psMeter'); el.psFill = $('#psFill');
      el.psMeterText = $('#psMeterText'); el.psList = $('#psList'); el.psCta = $('#psCta'); el.psNote = $('#psNote');
      $('#psClose').addEventListener('click', P.closePlan);
      el.psHelp = $('#psHelp');
      el.psHelp.addEventListener('click', function () { P.closePlan(); if (window.GuidedFeedback) window.GuidedFeedback.open({ kind: 'other', text: 'Refund or payment help: ' }); });
      var bGo = $('#proBannerGo'), bX = $('#proBannerX');
      if (bGo) bGo.addEventListener('click', function () { P.openUpgrade('', ''); });
      if (bX) bX.addEventListener('click', function () { try { localStorage.setItem('guided.proBanner', info.pro.expiresAt + ':' + dayStamp()); } catch (e) { /* ignore */ } renderBanner(); });
      el.ps.addEventListener('click', function (e) {
        var r = el.ps.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) P.closePlan();
      });
      el.psCta.addEventListener('click', function () {
        var t = P.tier(); P.closePlan();
        if (t === 'guest') { if (hooks.openSignup) hooks.openSignup(); } else P.openUpgrade('', '');
      });
    }
    if (el.badge) el.badge.addEventListener('click', P.openPlan);
    el.dlg = $('#upSheet');
    if (!el.dlg) return;
    el.title = $('#upTitle'); el.lead = $('#upLead'); el.reason = $('#upReason'); el.table = $('#upTable'); el.note = $('#upNote'); el.msg = $('#upMsg');
    el.buyMonthly = $('#upBuyMonthly'); el.buyTerm = $('#upBuyTerm'); el.buy = [el.buyMonthly, el.buyTerm];
    $('#upClose').addEventListener('click', P.closeUpgrade);
    el.dlg.addEventListener('click', function (e) {
      var r = el.dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) P.closeUpgrade();
    });
    el.buyMonthly.addEventListener('click', function () { P.pay('monthly'); });
    el.buyTerm.addEventListener('click', function () { P.pay('term'); });
    if (el.row) el.row.addEventListener('click', P.openPlan);
  }

  window.GuidedPlans = P;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
