/* GuidEd · motion.js
   Sheets and dialogs slide away instead of vanishing. A dialog's close() waits for a short exit animation (styles.css, .is-closing),
   and opening a dialog that is still leaving simply keeps it. Skipped for people who ask their device to reduce motion. */
(function () {
  'use strict';
  if (!window.HTMLDialogElement) return;
  var proto = HTMLDialogElement.prototype, nativeClose = proto.close, nativeShow = proto.showModal, pending = new WeakMap(), LEAVE_MS = 230;
  function reduced() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }

  proto.close = function () {
    var d = this, args = arguments;
    if (!d.open || d.classList.contains('is-closing') || d.hasAttribute('data-no-motion') || reduced()) return nativeClose.apply(d, args);
    d.classList.add('is-closing');
    pending.set(d, setTimeout(function () { pending.delete(d); d.classList.remove('is-closing'); nativeClose.apply(d, args); }, LEAVE_MS));
  };
  proto.showModal = function () {
    var d = this, timer = pending.get(d);
    if (timer) { clearTimeout(timer); pending.delete(d); d.classList.remove('is-closing'); if (d.open) return undefined; }   // reopened while leaving: keep it
    return nativeShow.apply(d, arguments);
  };
})();
