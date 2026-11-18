try { var t = localStorage.getItem('schoolpadi.theme'); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (e) { /* keep system theme */ }

/* Load the shared privacy controls on every public page using the legal theme. */
(function () {
  'use strict';
  function installConsentAssets() {
    if (!document.querySelector('link[data-guided-consent-style]')) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/cookie-consent.css';
      css.setAttribute('data-guided-consent-style', '');
      document.head.appendChild(css);
    }
    if (!document.querySelector('script[data-guided-consent-script]')) {
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
