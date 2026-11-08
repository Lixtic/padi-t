/* GuidEd · ads.js
   One Google AdSense banner on the start screen, only for Guest and Free teachers. Pro never sees it, and it never appears
   while a plan is being written, inside a plan, in a Word file or in a share. Nothing loads unless the site has ADSENSE_CLIENT and
   ADSENSE_SLOT set (see /api/config). Ads are non-personalised unless ADS_PERSONALIZED=1. */
(function () {
  'use strict';
  var cfg = null, started = false, failed = false;
  var el = function () { return document.getElementById('adSlot'); };

  function eligible() {
    var GP = window.GuidedPlans, t = GP && GP.tier && GP.tier();
    return !!cfg && !failed && (t === 'free' || t === 'guest');          // Pro, and installs with no plans, see nothing
  }
  function start() {
    var slot = el(); if (!slot || started) return; started = true;
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
  // show: whether the start screen is showing and nothing is being written.
  function sync(show) {
    var slot = el(); if (!slot) return;
    var on = !!show && eligible();
    slot.hidden = !on;
    if (on) start();
  }
  window.GuidedAds = {
    init: function (c) { cfg = c && c.client && c.slot ? c : null; var up = document.getElementById('adUpgrade'); if (up) up.addEventListener('click', function () { if (window.GuidedPlans) window.GuidedPlans.openUpgrade('', 'GuidEd Pro has no ads.'); }); },
    sync: sync,
    enabled: function () { return !!cfg; },
  };
})();
