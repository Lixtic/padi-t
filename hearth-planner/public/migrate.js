// Runs on www.guidedgh.site inside a hidden frame opened by app.guidedgh.site. When the app asks, it hands over the saved data
// (plans, schemes, settings) that this browser holds for www, so people do not lose it when the app moves to its own address.
// It answers only app.guidedgh.site, and never sends sign-in or payment details.
(function () {
  var PARENT = 'https://app.guidedgh.site';
  var KEEP = /^(schoolpadi\.|guided\.|gd\.)/;
  var SKIP = /^(schoolpadi\.(auth|access)|guided\.(signedIn|payref|pending-account-profile|googleBack|tourPending|migrated\.v1))$/;
  function snapshot(storage) {
    var out = {};
    try { for (var i = 0; i < storage.length; i++) { var k = storage.key(i); if (KEEP.test(k) && !SKIP.test(k)) out[k] = storage.getItem(k); } } catch (e) { /* storage blocked: nothing to hand over */ }
    return out;
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { snapshot: snapshot, KEEP: KEEP, SKIP: SKIP }; return; }
  window.addEventListener('message', function (e) {
    if (e.origin !== PARENT || !e.data || e.data.type !== 'guided:migrate-request') return;
    e.source.postMessage({ type: 'guided:migrate-data', data: snapshot(window.localStorage) }, PARENT);
  });
  if (window.parent !== window) window.parent.postMessage({ type: 'guided:migrate-ready' }, PARENT);
})();
