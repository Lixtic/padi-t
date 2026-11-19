/* GuidEd · phone-auth.js
   Sign in with a phone number, and add a phone number to an account so it can be used for that. Both use a 6-digit code sent by SMS.
   Neon Auth only signs in numbers already confirmed on an account, so adding the number (Settings) comes first. */
(function (root) {
  'use strict';
  // "024 123 4567", "0241234567", "+233 24 123 4567" and "233241234567" all become +233241234567.
  function toE164(input) {
    var s = String(input || '').replace(/[\s().-]/g, '');
    if (s.slice(0, 2) === '00') s = '+' + s.slice(2);
    if (s[0] !== '+') s = /^0\d{9}$/.test(s) ? '+233' + s.slice(1) : /^\d{9}$/.test(s) ? '+233' + s : s.slice(0, 3) === '233' ? '+' + s : s;
    return /^\+[1-9]\d{7,14}$/.test(s) ? s : '';
  }
  var api = { toE164: toE164 };
  root.GuidedPhone = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  var dlg = null, mode = 'signin', phone = '', resendAt = 0, timer = 0, hooks = { toast: function () {} };
  function $(s) { return dlg.querySelector(s); }
  function show(step) { $('#phStepNumber').hidden = step !== 'number'; $('#phStepCode').hidden = step !== 'code'; }
  function say(id, text) { var e = $(id); e.textContent = text || ''; e.hidden = !text; }
  function tick() {
    var left = Math.ceil((resendAt - Date.now()) / 1000), b = $('#phResend');
    b.disabled = left > 0; b.textContent = left > 0 ? 'Send a new code (' + left + 's)' : 'Send a new code';
    clearTimeout(timer); if (left > 0) timer = setTimeout(tick, 1000);
  }
  async function send() {
    var n = toE164($('#phNumber').value);
    if (!n) { say('#phNumberErr', 'Enter a valid phone number, for example 024 123 4567.'); return; }
    var b = $('#phSend'); b.disabled = true; say('#phNumberErr', '');
    try {
      await root.PadiSync.phoneSend(n);
      phone = n; show('code'); say('#phCodeErr', ''); $('#phCode').value = ''; $('#phCodeSub').textContent = 'We sent a 6-digit code by SMS to ' + n + '.';
      resendAt = Date.now() + 30000; tick(); $('#phCode').focus();
    } catch (e) { say('#phNumberErr', (e && e.message) || 'We could not send the code.'); }
    finally { b.disabled = false; }
  }
  async function confirm() {
    var code = $('#phCode').value.replace(/\D/g, '');
    if (code.length !== 6) { say('#phCodeErr', 'Enter the 6-digit code.'); return; }
    var b = $('#phConfirm'); b.disabled = true; say('#phCodeErr', '');
    try {
      var user = await root.PadiSync.phoneVerify(phone, code, mode === 'link');
      dlg.close();
      if (mode === 'link') hooks.toast('Phone number confirmed. You can now sign in with it.');
      else window.dispatchEvent(new CustomEvent('guided:phone-signed-in', { detail: { user: user } }));
    } catch (e) { say('#phCodeErr', (e && e.message) || 'That code is not right.'); $('#phCode').select(); }
    finally { b.disabled = false; }
  }
  function build() {
    dlg = document.createElement('dialog'); dlg.className = 'acct-sheet phone-sheet'; dlg.setAttribute('aria-labelledby', 'phTitle');
    dlg.innerHTML = '<section><h2 id="phTitle"></h2><p class="as-sub" id="phSub"></p>' +
      '<div id="phStepNumber"><label class="as-field"><span>Phone number</span><input id="phNumber" type="tel" inputmode="tel" autocomplete="tel" placeholder="024 123 4567" enterkeyhint="send"></label>' +
      '<p class="as-err" id="phNumberErr" role="alert" hidden></p><button type="button" class="as-submit" id="phSend"><span>Text me a code</span></button></div>' +
      '<div id="phStepCode" hidden><p class="as-sub" id="phCodeSub"></p><label class="as-field"><span>Confirmation code</span><input id="phCode" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" enterkeyhint="go"></label>' +
      '<p class="as-err" id="phCodeErr" role="alert" hidden></p><button type="button" class="as-submit" id="phConfirm"><span>Confirm</span></button>' +
      '<button type="button" class="as-link" id="phResend">Send a new code</button><button type="button" class="as-link" id="phChange">Use a different number</button></div>' +
      '<button type="button" class="aud-skip" id="phClose">Close</button></section>';
    document.body.appendChild(dlg);
    $('#phSend').addEventListener('click', send); $('#phConfirm').addEventListener('click', confirm);
    $('#phNumber').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); send(); } });
    $('#phCode').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); confirm(); } });
    $('#phCode').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 6); say('#phCodeErr', ''); });
    $('#phResend').addEventListener('click', send2); $('#phChange').addEventListener('click', function () { show('number'); $('#phNumber').focus(); });
    $('#phClose').addEventListener('click', function () { dlg.close(); });
    function send2() { $('#phNumber').value = phone; send(); }
  }
  // opts: { mode: 'signin' | 'link', phone: prefill }
  api.open = function (opts) {
    opts = opts || {}; mode = opts.mode === 'link' ? 'link' : 'signin';
    if (!dlg) build();
    $('#phTitle').textContent = mode === 'link' ? 'Add your phone for sign-in' : 'Sign in with your phone';
    $('#phSub').textContent = mode === 'link' ? 'We will text you a code to confirm the number. After that you can sign in with just your phone.' : 'We will text you a 6-digit code. This works for phone numbers already added to a GuidEd account.';
    $('#phNumber').value = opts.phone || ''; say('#phNumberErr', ''); show('number');
    document.querySelectorAll('dialog[open]').forEach(function (d) { if (d !== dlg) d.close(); });
    if (!dlg.open) dlg.showModal();
  };
  api.init = function (h) { hooks = Object.assign(hooks, h || {}); };
})(typeof window !== 'undefined' ? window : globalThis);
