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
  // Size the app to the part of the screen you can actually see. Some phone browsers (in-app browsers opened from WhatsApp or
  // Facebook, bars that slide away) report a height taller than the visible area, so the bottom was cut off and the page
  // would not scroll until the keyboard shrank it. --app-h feeds .app in styles.css; without script the 100dvh fallback stays.
  var root = document.documentElement, raf = 0;
  function size() {
    raf = 0;
    var vv = window.visualViewport, h = Math.min(window.innerHeight || 0, vv && vv.height ? vv.height + (vv.offsetTop || 0) : Infinity);
    if (h > 200) root.style.setProperty('--app-h', Math.round(h) + 'px');
  }
  function queue() { if (!raf) raf = requestAnimationFrame(size); }
  size();
  window.addEventListener('resize', queue);
  window.addEventListener('orientationchange', function () { setTimeout(size, 250); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', queue);
})();
