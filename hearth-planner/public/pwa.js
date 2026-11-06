/* GuidEd · install support. Registers the service worker and shows an Install button
   (Android/Chrome) or a short Add to Home Screen hint (iPhone/iPad). Not loaded in the artifact build. */
(function () {
  'use strict';
  var btn = document.getElementById('installBtn'), hint = document.getElementById('installHint');
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
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
