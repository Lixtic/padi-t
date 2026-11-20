// Installed app / home-screen launches go straight to the app host; everyone else sees the landing page.
(function () {
  var APP = 'https://app.guidedgh.site';
  if (location.hostname === 'app.guidedgh.site') return;
  var standalone = false;
  try { standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch (e) {}
  if (standalone || /[?&]source=pwa\b/.test(location.search)) location.replace(APP + '/?source=pwa');
})();
