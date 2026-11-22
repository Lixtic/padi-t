try { var t = localStorage.getItem('schoolpadi.theme'); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (e) { /* keep system theme */ }

/* Load the shared privacy controls on every public page using the legal theme. */
(function () {
  'use strict';
  function installConsentAssets() {
    if (!document.querySelector('link[data-guided-consent-style], link[href="/cookie-consent.css"]')) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/cookie-consent.css';
      css.setAttribute('data-guided-consent-style', '');
      document.head.appendChild(css);
    }
    if (!document.querySelector('script[data-guided-consent-script], script[src="/cookie-consent.js"]')) {
      var script = document.createElement('script');
      script.src = '/cookie-consent.js';
      script.defer = true;
      script.setAttribute('data-guided-consent-script', '');
      document.head.appendChild(script);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installConsentAssets, { once: true });
  } else {
    installConsentAssets();
  }
})();

/* Back links: <a data-back="any"> goes back one page in history when there is a page to go back to, and follows its href otherwise
   (opened in a new tab, for example). <a data-back="same"> only goes back when the page we came from is the page the link points to,
   so "All guides" on an article returns to the list exactly as it was (page, search, scroll) and otherwise opens the list. */
document.addEventListener('click', function (e) {
  var a = e.target && e.target.closest && e.target.closest('a[data-back]');
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  var mode = a.getAttribute('data-back'), can = history.length > 1;
  if (mode === 'same') {
    try { var from = new URL(document.referrer); can = can && from.origin === location.origin && from.pathname.replace(/\.html$/, '') === new URL(a.href, location.href).pathname.replace(/\.html$/, ''); } catch (err) { can = false; }
  }
  if (can) { e.preventDefault(); history.back(); }
});
