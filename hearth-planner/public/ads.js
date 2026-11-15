/* GuidEd · ads.js
   One Google AdSense banner on the start screen, only for Guest and Free teachers, and one on the parent dashboard home for Guest and Free parents. Pro never sees it, and it never appears
   while a plan is being written, inside a plan, in a Word file or in a share. Nothing loads unless the site has ADSENSE_CLIENT and
   ADSENSE_SLOT set (see /api/config). Ads are non-personalised unless ADS_PERSONALIZED=1. */
(function () {
  'use strict';
  var cfg = null, failed = false;
  var started = {};                                           // per slot: an ad is only requested once for each box
  var el = function () { return document.getElementById('adSlot'); };
  var parentEl = function () { return document.getElementById('adSlotParent'); };
  var isParent = function () { return document.body.classList.contains('role-parent'); };

  function eligible() {
    var GP = window.GuidedPlans, t = GP && GP.tier && GP.tier();
    return !!cfg && !failed && (t === 'free' || t === 'guest');          // Pro, and installs with no plans, see nothing
  }
  function start(slot) {
    if (!slot || started[slot.id]) return; started[slot.id] = true;
    var ins = slot.querySelector('ins');
    ins.setAttribute('data-ad-client', cfg.client);
    ins.setAttribute('data-ad-slot', cfg.slot);
    var q = window.adsbygoogle = window.adsbygoogle || [];
    if (!cfg.personalized) q.requestNonPersonalizedAds = 1;
    var present = document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]');
    var push = function () { try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* no ad this time */ } };
    if (present) {                                            // the page already loads it in <head> (AdSense site check); just queue the ad
      present.addEventListener('error', function () { failed = true; slot.hidden = true; });
      push();
      setTimeout(function () { if (!ins.getAttribute('data-adsbygoogle-status')) { failed = true; slot.hidden = true; } }, 5000);   // blocked before we looked: no empty box
      return;
    }
    var s = document.createElement('script');
    s.async = true; s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(cfg.client);
    s.onload = push;
    s.onerror = function () { failed = true; slot.hidden = true; };           // blocked by an ad blocker or the network: no empty box
    document.head.appendChild(s);
  }

  // Google's ad code can rewrite the style of the page and of every element around the ad (height, overflow, width, padding),
  // which stops the app scrolling. Undo those edits on the ad's ancestors, the stage included, and on <html> and <body>.
  var guarding = false, BAD = ['height', 'min-height', 'max-height', 'overflow', 'overflow-x', 'overflow-y', 'position', 'width', 'max-width',
    'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'top', 'left', 'z-index'];
  function guard() {
    if (guarding || !window.MutationObserver) return; guarding = true;
    function chain() {
      var out = [document.documentElement, document.body];
      [el(), parentEl()].forEach(function (n) { while (n && n !== document.body) { if (out.indexOf(n) < 0) out.push(n); n = n.parentElement; } });
      return out;
    }
    function fix() {
      chain().forEach(function (e) { BAD.forEach(function (k) { if (e.style.getPropertyValue(k)) e.style.removeProperty(k); }); });
    }
    var mo = new MutationObserver(function () { mo.disconnect(); fix(); watch(); });
    function watch() { chain().forEach(function (e) { mo.observe(e, { attributes: true, attributeFilter: ['style'] }); }); }
    fix(); watch();
    window.addEventListener('resize', function () { fix(); });
  }
  // show: whether the start screen is showing and nothing is being written.
  function sync(show) {
    var slot = el(); if (!slot) return;
    var on = !!show && eligible() && !isParent();               // a parent never sees the teacher start screen
    slot.hidden = !on;
    if (on) start(slot);
  }
  // The parent dashboard's one banner: its home tab only. show is false inside a lesson, a result, My Children or Progress.
  function syncParent(show) {
    var slot = parentEl(); if (!slot) return;
    var on = !!show && eligible() && isParent();
    slot.hidden = !on;
    if (on) start(slot);
  }
  window.GuidedAds = {
    init: function (c) { cfg = c && c.client && c.slot ? c : null; if (window.GuidedParentDashboard && window.GuidedParentDashboard.syncAds) setTimeout(window.GuidedParentDashboard.syncAds, 0); ['adUpgrade', 'adUpgradeParent'].forEach(function (id) { var up = document.getElementById(id); if (up) up.addEventListener('click', function () { if (window.GuidedPlans) window.GuidedPlans.openUpgrade('', 'GuidEd Pro has no ads.'); }); }); },
    sync: sync,
    syncParent: syncParent,
    enabled: function () { return !!cfg; },
  };
  guard();   // the AdSense snippet sits in <head> for site verification, so watch from the start
})();
