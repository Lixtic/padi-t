/* GuidEd · install support. Registers the service worker and shows an Install button
   (Android/Chrome) or a short Add to Home Screen hint (iPhone/iPad). Not loaded in the artifact build. */
(function () {
  'use strict';
  var btn = document.getElementById('installBtn'), hint = document.getElementById('installHint');
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    var hadController = !!navigator.serviceWorker.controller, shown = false;
    /* A new version has taken over: tell the person and let them reload when it suits them (never mid-plan). */
    var showUpdate = function () {
      if (shown) return; shown = true;
      var bar = document.createElement('div');
      bar.className = 'update-bar'; bar.setAttribute('role', 'status');
      var msg = document.createElement('span'); msg.textContent = 'A new version of GuidEd is ready.';
      var go = document.createElement('button'); go.type = 'button'; go.textContent = 'Update now';
      go.addEventListener('click', function () { location.reload(); });
      var later = document.createElement('button'); later.type = 'button'; later.className = 'update-later'; later.setAttribute('aria-label', 'Dismiss'); later.textContent = '\u00d7';
      later.addEventListener('click', function () { bar.remove(); });
      bar.append(msg, go, later); document.body.appendChild(bar);
    };
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (hadController) showUpdate(); });
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        /* Phones keep the app open for days: look for a new version when it comes back to the front, and hourly. */
        var check = function () { try { reg.update(); } catch (e) {} };
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') check(); });
        setInterval(check, 60 * 60 * 1000);
      }).catch(function () {});
    });
  }
  if (standalone || !btn) return;
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; btn.hidden = false; });
  btn.addEventListener('click', function () {
    if (!deferred) return;
    deferred.prompt();
    deferred.userChoice.then(function () { deferred = null; btn.hidden = true; });
  });
  window.addEventListener('appinstalled', function () { btn.hidden = true; if (hint) hint.hidden = true; });
  var ua = navigator.userAgent || '';
  if (/iphone|ipad|ipod/i.test(ua) && hint) {
    hint.textContent = 'To install: tap the Share button in Safari, then "Add to Home Screen".';
    hint.hidden = false;
  }
})();
