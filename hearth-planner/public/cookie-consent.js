/* GuidED privacy-first consent manager.
   Essential app storage remains available. Optional advertising stays blocked until explicit opt-in.
   No analytics provider is currently installed, so analytics remains unavailable/off. */
(function () {
  'use strict';
  var KEY = 'guided.consent.v1';
  var VERSION = 1;
  var state = null;
  var $ = function (s, root) { return (root || document).querySelector(s); };
  var read = function () {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || 'null');
      return v && v.version === VERSION && v.categories ? v : null;
    } catch (e) { return null; }
  };
  state = read();
  function allowed(category) {
    if (category === 'essential') return true;
    return !!(state && state.categories && state.categories[category] === true);
  }
  function save(categories) {
    state = { version: VERSION, categories: { essential: true, analytics: false, marketing: !!categories.marketing }, updatedAt: new Date().toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage may be disabled; do not enable optional scripts */ state = null; }
    document.dispatchEvent(new CustomEvent('guided:consentchange', { detail: state }));
    render();
  }
  function panel() {
    var el = $('#guidedConsent');
    if (el) return el;
    el = document.createElement('section');
    el.id = 'guidedConsent';
    el.className = 'gc-banner';
    el.setAttribute('aria-label', 'Cookie and privacy choices');
    el.innerHTML = '<div class="gc-copy"><span class="gc-eyebrow">YOUR PRIVACY</span><h2 id="gcTitle">Your privacy matters</h2><p>GuidED uses essential storage to keep the site working. With your permission, we also use advertising technologies to support the free service. Advertising stays off unless you choose to allow it.</p><a href="/privacy">Read our privacy notice</a></div><div class="gc-actions"><button type="button" class="gc-btn gc-primary" data-gc="accept">Accept all</button><button type="button" class="gc-btn gc-secondary" data-gc="reject">Reject optional</button><button type="button" class="gc-link" data-gc="manage">Manage preferences</button></div><div class="gc-prefs" hidden><div class="gc-pref"><div><strong>Essential storage</strong><small>Login, security and core app functions. Always active.</small></div><span class="gc-always">Always on</span></div><div class="gc-pref"><div><strong>Analytics</strong><small>No analytics provider is currently enabled on GuidED.</small></div><span class="gc-always">Off</span></div><label class="gc-pref gc-toggle"><span><strong>Advertising</strong><small>Allows Google to load non-personalised ads. Optional.</small></span><input type="checkbox" id="gcMarketing"></label><div class="gc-pref-actions"><button type="button" class="gc-btn gc-secondary" data-gc="back">Back</button><button type="button" class="gc-btn gc-primary" data-gc="save">Save preferences</button></div></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-gc]'); if (!b) return;
      var action = b.getAttribute('data-gc');
      if (action === 'accept') save({ marketing: true });
      if (action === 'reject') save({ marketing: false });
      if (action === 'manage') { $('.gc-prefs', el).hidden = false; $('#gcMarketing', el).checked = allowed('marketing'); $('#gcTitle', el).textContent = 'Manage your choices'; }
      if (action === 'back') { $('.gc-prefs', el).hidden = true; $('#gcTitle', el).textContent = 'Your privacy matters'; }
      if (action === 'save') save({ marketing: $('#gcMarketing', el).checked });
    });
    return el;
  }
  function addSettingsLink() {
    if ($('#guidedCookieSettings')) return;
    var link = document.createElement('button');
    link.type = 'button'; link.id = 'guidedCookieSettings'; link.className = 'gc-settings-link';
    link.textContent = 'Cookie settings';
    link.addEventListener('click', function () { var el = panel(); el.hidden = false; $('.gc-prefs', el).hidden = false; $('#gcMarketing', el).checked = allowed('marketing'); $('#gcTitle', el).textContent = 'Manage your choices'; });
    var foot = $('.lg-foot') || $('.footer-links') || $('footer');
    if (foot) foot.appendChild(link);
    else document.body.appendChild(link);
  }
  function render() {
    var el = panel();
    el.hidden = !!state;
    if (state) { $('.gc-prefs', el).hidden = true; $('#gcTitle', el).textContent = 'Your privacy matters'; }
    addSettingsLink();
  }
  window.GuidedConsent = {
    allowed: allowed,
    get: function () { return state ? JSON.parse(JSON.stringify(state)) : null; },
    open: function () { var el = panel(); el.hidden = false; $('.gc-prefs', el).hidden = false; $('#gcMarketing', el).checked = allowed('marketing'); $('#gcTitle', el).textContent = 'Manage your choices'; },
    hasChoice: function () { return !!state; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();