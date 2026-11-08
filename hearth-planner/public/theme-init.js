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
