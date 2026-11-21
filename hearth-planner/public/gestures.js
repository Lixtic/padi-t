/* GuidEd · gestures.js
   Familiar touch gestures for phones and tablets:
   - pull down at the top of a page to refresh
   - swipe in from the left edge to go back (installed app only; browsers already have their own)
   - swipe a bottom sheet down to close it
   - swipe a library card left to open its actions
   - tap the top bar to scroll back to the top
   app.js supplies what "refresh" and "back" mean through GuidedGestures.configure({ refresh, back }). */
(function () {
  'use strict';
  var hooks = {};
  window.GuidedGestures = { configure: function (h) { hooks = h || {}; } };

  var touchScreen = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  if (!touchScreen) return;
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  var narrow = function () { return window.matchMedia && matchMedia('(max-width: 760px)').matches; };
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var PULL_AT = 64, PULL_MAX = 110, EDGE = 20, EDGE_GO = 70, SHEET_GO = 110, SWIPE_GO = 60;

  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* not supported */ } }
  function typing(t) { return !!(t && t.closest && t.closest('input, textarea, select, [contenteditable="true"], .no-gesture')); }

  /* Every scrolling ancestor of the touch must already be at its top, or the user is just scrolling. */
  function atTop(t, stopAt) {
    for (var n = t; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (n === stopAt) { if (n.scrollTop > 0) return false; break; }
      var oy = getComputedStyle(n).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1 && n.scrollTop > 0) return false;
    }
    return true;
  }

  /* ---- pull to refresh ---- */
  var ind = null;
  function indicator() {
    if (ind) return ind;
    ind = document.createElement('div');
    ind.className = 'ptr'; ind.setAttribute('aria-hidden', 'true');
    ind.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>';
    document.body.appendChild(ind);
    return ind;
  }
  function showPull(px, ready) {
    var el = indicator();
    el.classList.remove('ptr-busy'); el.classList.toggle('ptr-ready', !!ready);
    el.style.opacity = String(Math.min(1, px / 40));
    el.style.transform = 'translate(-50%, ' + (px - 44) + 'px) rotate(' + Math.round(px * 3.2) + 'deg)';
  }
  function hidePull() {
    if (!ind) return;
    ind.classList.remove('ptr-busy', 'ptr-ready');
    ind.style.transition = reduced ? 'none' : 'transform .22s ease, opacity .22s ease';
    ind.style.opacity = '0'; ind.style.transform = 'translate(-50%, -44px)';
    setTimeout(function () { if (ind) ind.style.transition = ''; }, 260);
  }
  var refreshing = false;
  function runRefresh() {
    if (refreshing) return; refreshing = true;
    buzz(10);
    var el = indicator();
    el.classList.add('ptr-busy'); el.style.opacity = '1'; el.style.transform = 'translate(-50%, 18px)';
    var minimum = new Promise(function (r) { setTimeout(r, 700); });
    var work = Promise.resolve().then(function () { return hooks.refresh ? hooks.refresh() : null; }).catch(function () { /* the app reports its own errors */ });
    Promise.all([work, minimum]).then(function () { refreshing = false; hidePull(); });
  }

  /* ---- one touch at a time ---- */
  var t0 = null;
  function start(e) {
    if (e.touches.length !== 1) { t0 = null; return; }
    var t = e.touches[0], target = e.target;
    t0 = { x: t.clientX, y: t.clientY, dx: 0, dy: 0, target: target, mode: '', sheet: null, card: null };
    if (typing(target)) { t0.mode = 'none'; return; }
    var dlg = target.closest && target.closest('dialog[open]');
    if (dlg) {
      if (dlg.classList.contains('acct-sheet') && narrow() && atTop(target, dlg)) t0.sheet = dlg; else t0.mode = 'none';
      return;
    }
    if (standalone && t.clientX <= EDGE) { t0.mode = 'edge'; return; }
    t0.card = target.closest && target.closest('.lib-card');
    t0.pullOk = !refreshing && !!target.closest('#main, #stage') && atTop(target, null);
  }

  function move(e) {
    if (!t0 || t0.mode === 'none' || e.touches.length !== 1) return;
    var t = e.touches[0]; t0.dx = t.clientX - t0.x; t0.dy = t.clientY - t0.y;
    var ax = Math.abs(t0.dx), ay = Math.abs(t0.dy);

    if (t0.mode === 'edge') { if (t0.dx > 10 && ax > ay) e.cancelable && e.preventDefault(); return; }

    if (!t0.mode) {                                            // decide what this drag is
      if (ax < 10 && ay < 10) return;
      if (t0.sheet && t0.dy > 0 && ay > ax * 1.3) t0.mode = 'sheet';
      else if (t0.pullOk && t0.dy > 0 && ay > ax * 1.4) t0.mode = 'pull';
      else if (t0.card && t0.dx < 0 && ax > ay * 1.4) t0.mode = 'swipe';
      else if (ay > 14 || ax > 14) t0.mode = 'none';
      return;
    }
    if (t0.mode === 'pull') {
      if (e.cancelable) e.preventDefault();
      var px = Math.min(PULL_MAX, t0.dy * 0.5);
      showPull(px, t0.dy * 0.5 >= PULL_AT);
    } else if (t0.mode === 'sheet') {
      if (e.cancelable) e.preventDefault();
      t0.sheet.style.transition = 'none';
      t0.sheet.style.transform = 'translateY(' + Math.max(0, t0.dy) + 'px)';
    } else if (t0.mode === 'swipe' && e.cancelable) e.preventDefault();
  }

  function end() {
    if (!t0) return;
    var m = t0.mode, s = t0;
    t0 = null;
    if (m === 'edge' && s.dx > EDGE_GO && Math.abs(s.dy) < 60) { buzz(8); if (hooks.back) hooks.back(); }
    else if (m === 'pull') { if (s.dy * 0.5 >= PULL_AT) runRefresh(); else hidePull(); }
    else if (m === 'sheet') {
      var dlg = s.sheet;
      if (s.dy > SHEET_GO) { dlg.style.transform = ''; dlg.style.transition = ''; dlg.close(); }
      else { dlg.style.transition = reduced ? 'none' : 'transform .2s ease'; dlg.style.transform = ''; setTimeout(function () { dlg.style.transition = ''; }, 220); }
    } else if (m === 'swipe' && s.dx < -SWIPE_GO && Math.abs(s.dy) < 40 && s.card) {
      buzz(10);
      s.card.dispatchEvent(new CustomEvent('guided:swipe-left', { bubbles: true }));
    }
  }
  function cancel() { if (t0 && t0.mode === 'pull') hidePull(); if (t0 && t0.mode === 'sheet') { t0.sheet.style.transform = ''; t0.sheet.style.transition = ''; } t0 = null; }

  document.addEventListener('touchstart', start, { passive: true });
  document.addEventListener('touchmove', move, { passive: false });
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', cancel, { passive: true });

  /* ---- tap the top bar to go back to the top ---- */
  document.addEventListener('click', function (e) {
    var bar = e.target.closest && e.target.closest('.topbar');
    if (!bar || e.target.closest('button, a, input, select, textarea, [role="button"]')) return;
    var targets = Array.prototype.slice.call(document.querySelectorAll('#stage, #stage > section, .page:not([hidden])'));
    targets.forEach(function (el) { if (el.scrollTop > 0) el.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); });
    var msgs = document.getElementById('messages');
    if (msgs && msgs.scrollTop > 0) msgs.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  });
})();
