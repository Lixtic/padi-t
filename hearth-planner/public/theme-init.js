(function () {
  try {
    var t = localStorage.getItem('schoolpadi.theme');
    if (t !== 'light' && t !== 'dark') {
      t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: keep the default light theme */ }
})();
(function () {
  // The installed app opens on the GuidEd splash for a moment, once per launch; app.js removes it when the page is ready.
  try {
    var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    if (standalone && !sessionStorage.getItem('guided.splash')) { sessionStorage.setItem('guided.splash', '1'); document.documentElement.classList.add('splash-on'); }
  } catch (e) { /* no splash */ }
})();
(function () {
  // Keep the app aligned to the visual viewport. On phones, opening the keyboard can
  // pan the visual viewport as well as shrink it; treating offsetTop as extra height
  // makes the app's flex layout use the wrong coordinate system and jumps the composer.
  var root = document.documentElement, raf = 0;
  function size() {
    raf = 0;
    var vv = window.visualViewport;
    var top = vv ? Math.max(0, vv.offsetTop || 0) : 0;
    var height = vv && vv.height ? vv.height : (window.innerHeight || 0);
    if (height > 200) {
      root.style.setProperty('--app-top', Math.round(top) + 'px');
      root.style.setProperty('--app-h', Math.round(height) + 'px');
    }
  }
  function queue() { if (!raf) raf = requestAnimationFrame(size); }
  size();
  window.addEventListener('resize', queue);
  window.addEventListener('orientationchange', function () { setTimeout(size, 250); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', queue);
    window.visualViewport.addEventListener('scroll', queue);
  }
})();
