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
    /* Update progress: a slim bar fills while the new version downloads, then it is applied automatically
       when the app is being launched or brought back to the front. Updates found while someone is mid-task keep the prompt. */
    var autoApply = false, autoTimer = 0, prog = null;
    var progress = function (done, total) {
      if (!prog) {
        prog = document.createElement('div'); prog.className = 'update-progress'; prog.setAttribute('role', 'progressbar');
        prog.setAttribute('aria-label', 'Updating GuidEd'); prog.setAttribute('aria-valuemin', '0'); prog.setAttribute('aria-valuemax', '100');
        prog.innerHTML = '<span class="update-progress-fill"></span><b class="update-progress-label">Updating GuidEd\u2026</b>';
        document.body.appendChild(prog);
      }
      var pct = Math.round(100 * done / Math.max(1, total));
      prog.setAttribute('aria-valuenow', String(pct)); prog.firstChild.style.width = pct + '%';
    };
    var applyNow = function () {
      var last = 0; try { last = +sessionStorage.getItem('guided.autoUpdate') || 0; } catch (e) {}
      if (Date.now() - last < 30000) { showUpdate(); return; }            // never loop
      try { sessionStorage.setItem('guided.autoUpdate', String(Date.now())); } catch (e) {}
      if (prog) prog.firstChild.style.width = '100%';
      location.reload();
    };
    navigator.serviceWorker.addEventListener('message', function (e) {
      var d = e.data; if (!hadController || !d || d.type !== 'update-progress') return;
      progress(d.done, d.total);
    });
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) return;
      if (autoApply) applyNow(); else { if (prog) prog.remove(); showUpdate(); }
    });
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        /* Launch and return-to-front both look for a new version and apply it; hourly checks only prompt. */
        var check = function (auto) {
          if (auto) { autoApply = true; clearTimeout(autoTimer); autoTimer = setTimeout(function () { autoApply = false; }, 60000); }
          try { reg.update(); } catch (e) {}
        };
        check(true);
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') check(true); });
        setInterval(function () { check(false); }, 60 * 60 * 1000);
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
