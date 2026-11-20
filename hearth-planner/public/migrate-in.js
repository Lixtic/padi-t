// Runs on app.guidedgh.site. The first time someone opens the app here, it asks www.guidedgh.site (in a hidden frame) for the data
// that browser saved there, copies in anything not already present, and reloads once so the app starts with it.
(function () {
  var WWW = 'https://www.guidedgh.site', FLAG = 'guided.migrated.v1';
  var KEEP = /^(schoolpadi\.|guided\.|gd\.)/;
  var SKIP = /^(schoolpadi\.(auth|access)|guided\.(signedIn|payref|pending-account-profile|googleBack|tourPending|migrated\.v1))$/;
  // Copies keys that are not already set; returns how many were added.
  function importData(storage, data) {
    var n = 0;
    if (!data || typeof data !== 'object') return 0;
    Object.keys(data).forEach(function (k) {
      if (!KEEP.test(k) || SKIP.test(k) || typeof data[k] !== 'string') return;
      try { if (storage.getItem(k) === null) { storage.setItem(k, data[k]); n++; } } catch (e) { /* full or blocked: skip */ }
    });
    return n;
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { importData: importData }; return; }
  if (location.hostname !== 'app.guidedgh.site') return;
  try { if (localStorage.getItem(FLAG)) return; } catch (e) { return; }
  var frame, timer, done = false;
  function finish(count) {
    if (done) return; done = true; clearTimeout(timer);
    try { if (frame) frame.remove(); } catch (e) { /* already gone */ }
    if (count === null) return;                       // no answer: try again on the next visit
    try { localStorage.setItem(FLAG, '1'); } catch (e) { return; }
    if (count > 0) location.reload();
  }
  window.addEventListener('message', function (e) {
    if (e.origin !== WWW || !e.data) return;
    if (e.data.type === 'guided:migrate-ready') e.source.postMessage({ type: 'guided:migrate-request' }, WWW);
    else if (e.data.type === 'guided:migrate-data') finish(importData(window.localStorage, e.data.data));
  });
  function start() {
    frame = document.createElement('iframe');
    frame.src = WWW + '/migrate.html'; frame.hidden = true; frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1; frame.title = 'Moving your saved data';
    document.body.appendChild(frame);
    timer = setTimeout(function () { finish(null); }, 8000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
