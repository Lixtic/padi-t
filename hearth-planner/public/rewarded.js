/* Optional rewarded video: a free teacher who has used the week's plans may choose to watch one short video for one more plan.
   Flow: ask the server for a token (it times the video and caps the day) → play the video → ask the server to count it.
   Real ads come from Google Ad Manager (REWARDED_ADS=gam). REWARDED_ADS=test shows a plain countdown, for testing only. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var busy = false, cancelled = false, tickTimer = 0, gptReady = null, slot = null;

  function dlg() { return $('rwSheet'); }
  function say(text, count, test) {
    $('rwText').textContent = text;
    var c = $('rwCount'); c.hidden = count == null; if (count != null) c.textContent = count;
    $('rwTest').hidden = !test;
  }
  function show() { var d = dlg(); if (d && !d.open) d.showModal(); }
  function hide() { var d = dlg(); if (d && d.open) d.close(); }
  function finish() { busy = false; clearInterval(tickTimer); tickTimer = 0; cleanupSlot(); }
  function fail(msg) { finish(); say(msg, null, false); $('rwCancel').textContent = 'Close'; show(); }

  function api(action, body) {
    return window.GuidedPlans.headers().then(function (h) {
      return fetch('/api/billing?action=' + action, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, h), body: JSON.stringify(body || {}) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, json: j }; }); });
    });
  }

  function loadGpt() {
    if (gptReady) return gptReady;
    gptReady = new Promise(function (ok, no) {
      window.googletag = window.googletag || { cmd: [] };
      var s = document.createElement('script'); s.async = true; s.crossOrigin = 'anonymous';
      s.src = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
      s.onload = function () { ok(); }; s.onerror = function () { gptReady = null; no(new Error('blocked')); };
      document.head.appendChild(s);
    });
    return gptReady;
  }
  function cleanupSlot() {
    try { if (slot && window.googletag && googletag.destroySlots) googletag.destroySlots([slot]); } catch (e) { /* already gone */ }
    slot = null;
  }

  // Real video through Google Ad Manager. Resolves when Google says the reward was earned; rejects with a message when no video plays.
  function playGam(unit) {
    return loadGpt().then(function () {
      return new Promise(function (ok, no) {
        var granted = false, ready = false, done = false;
        function end(fn, v) { if (done) return; done = true; clearTimeout(wait); fn(v); }
        var wait = setTimeout(function () { if (!ready) end(no, new Error('There is no video available right now. Please try again a little later.')); }, 12000);
        googletag.cmd.push(function () {
          try {
            slot = googletag.defineOutOfPageSlot(unit, googletag.enums.OutOfPageFormat.REWARDED);
            if (!slot) return end(no, new Error('Videos are not available on this device.'));
            slot.addService(googletag.pubads());
            googletag.pubads().setPrivacySettings({ nonPersonalizedAds: true });
            googletag.pubads().addEventListener('rewardedSlotReady', function (e) { if (cancelled) return; ready = true; hide(); e.makeRewardedVisible(); });
            googletag.pubads().addEventListener('rewardedSlotGranted', function () { granted = true; });
            googletag.pubads().addEventListener('rewardedSlotClosed', function () { if (granted) end(ok); else end(no, new Error('The video was closed before the end, so no plan was added.')); });
            googletag.pubads().addEventListener('slotRenderEnded', function (e) { if (e.slot === slot && e.isEmpty && !ready) end(no, new Error('There is no video available right now. Please try again a little later.')); });
            googletag.enableServices(); googletag.display(slot);
          } catch (e) { end(no, new Error('Videos are not available on this device.')); }
        });
      });
    }, function () { throw new Error('The video could not load. An ad blocker or a weak connection may be stopping it.'); });
  }
  // Plain countdown for testing the flow. Never shown unless REWARDED_ADS=test is set on the server.
  function playTest(seconds) {
    return new Promise(function (ok, no) {
      var left = seconds; say('Watch to the end to earn your plan.', left, true);
      tickTimer = setInterval(function () { if (cancelled) { clearInterval(tickTimer); return no(new Error('cancelled')); } left -= 1; $('rwCount').textContent = left; if (left <= 0) { clearInterval(tickTimer); ok(); } }, 1000);
    });
  }

  function watch() {
    var GP = window.GuidedPlans, r = GP && GP.reward();
    if (busy || !r) return;
    busy = true; cancelled = false;
    $('rwCancel').textContent = 'Cancel';
    say('Getting the video ready…', null, false); show(); GP.closeUpgrade();
    api('reward_start').then(function (st) {
      if (!st.ok) throw new Error(st.json.message || 'Could not start the video.');
      var play = st.json.mode === 'test' ? playTest(st.json.seconds) : playGam(r.unit);
      return play.then(function () {
        say('Adding your plan…', null, false); show();
        return api('reward_claim', { token: st.json.token });
      });
    }).then(function (cl) {
      if (!cl.ok) throw new Error(cl.json.message || 'The plan could not be added.');
      finish(); return GP.load().then(function () {
        say('Done. You earned ' + (GP.reward() ? GP.reward().plans : 1) + ' more ' + 'plan. Close this and tap Generate again.', null, false);
        $('rwCancel').textContent = 'Close'; show();
      });
    }).catch(function (e) { if (cancelled || (e && e.message === 'cancelled')) { finish(); hide(); return; } fail((e && e.message) || 'Something went wrong. Please try again.'); });
  }

  function init() {
    var b = $('upWatch'), c = $('rwCancel'); if (!b || !c) return;
    b.addEventListener('click', watch);
    c.addEventListener('click', function () { cancelled = true; finish(); hide(); });
    var d = dlg(); if (d) d.addEventListener('cancel', function () { cancelled = true; finish(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.GuidedReward = { watch: watch };
})();
