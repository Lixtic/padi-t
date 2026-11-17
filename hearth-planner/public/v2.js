/* GuidEd v2.0 · Studio enhancements: resource cards and the phone tab bar.
   Both sit on top of the existing Studio controls (the tabs, the resource select and its button), so nothing else changes. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var svg = function (id) { return '<svg class="ico" aria-hidden="true"><use href="#' + id + '"/></svg>'; };

  var RES = [
    ['Study notes', 'Study Notes', 'Learner-friendly explanations', 'i-book'],
    ['Learner worksheet', 'Learner Worksheets', 'Class exercises and activities', 'i-pencil'],
    ['Homework pack', 'Homework Pack', 'Practice after lessons', 'i-calendar'],
    ['BECE practice', 'BECE Practice', 'Examination-style questions', 'i-cap'],
    ['Teaching slides', 'Teaching Slides', 'Classroom presentation slides', 'i-present']
  ];

  function resourceCards() {
    var row = $('.studio-resource-row'), select = $('#resourceType'), go = $('#resourceAction');
    if (!row || !select || !go || $('.res-grid')) return;
    var grid = document.createElement('div'); grid.className = 'res-grid';
    RES.forEach(function (r) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'res-card'; b.dataset.res = r[0];
      b.innerHTML = svg(r[3]) + '<strong></strong><small></small><em>Create</em>';
      b.querySelector('strong').textContent = r[1]; b.querySelector('small').textContent = r[2];
      b.addEventListener('click', function () { select.value = r[0]; select.dispatchEvent(new Event('change', { bubbles: true })); go.click(); });
      grid.appendChild(b);
    });
    row.classList.add('is-enhanced'); row.setAttribute('aria-hidden', 'true');
    row.parentNode.insertBefore(grid, row);
    examCard(select, grid);
  }

  // The exam card follows the class: BECE Practice (JHS), WASSCE Practice (SHS), Class Exercise (primary).
  // app.js renames the hidden select's option when the class changes; this keeps the card in step with it.
  function examCard(select, grid) {
    var opt = select.querySelector('option[value="BECE practice"]'), card = grid.querySelector('[data-res="BECE practice"]');
    if (!opt || !card) return;
    function sync() {
      var label = (opt.textContent || 'BECE practice').replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }).replace(/\bBece\b/, 'BECE').replace(/\bWassce\b/, 'WASSCE');
      card.querySelector('strong').textContent = label;
      card.setAttribute('aria-label', 'Create ' + label);
      card.querySelector('small').textContent = /Class/i.test(label) ? 'Questions to check understanding' : 'Examination-style questions';
    }
    sync();
    new MutationObserver(sync).observe(opt, { childList: true, characterData: true, subtree: true });
  }

  function tabBar() {
    var studio = $('.teaching-studio'); if (!studio || $('.v2-tabbar')) return;
    var nav = document.createElement('nav'); nav.className = 'v2-tabbar'; nav.setAttribute('aria-label', 'Primary navigation');
    var pill = document.createElement('div'); pill.className = 'v2-tabbar-pill'; nav.appendChild(pill);
    var btns = {};
    var parent = document.body.classList.contains('role-parent');
    var items = parent
      ? [['home', 'Home', 'i-home', '#dashboardLink'], ['children', 'Children', 'i-users', '#familyBtn'], ['more', 'More', 'i-menu', '#settingsLink']]
      : [['home', 'Home', 'i-home', '#dashboardLink'], ['studio', 'Studio', 'i-home', '#studioLink'], ['library', 'Library', 'i-library', '#libraryLink'], ['more', 'More', 'i-menu', '#settingsLink']];
    function activate(key, selector) {
      var target = selector && $(selector);
      if (target) target.click();
      mark(key);
    }
    items.forEach(function (it) {
      var b = document.createElement('button'); b.type = 'button'; b.innerHTML = svg(it[2]) + '<span></span>'; b.querySelector('span').textContent = it[1];
      b.dataset.tab = it[0];
      b.addEventListener('click', function () {
        if (it[0] === 'studio' && b.getAttribute('aria-current') === 'page' && !studio.classList.contains('is-collapsed')) {
          studio.classList.add('is-collapsed'); var tg = $('#studioCollapseToggle'); if (tg) tg.setAttribute('aria-expanded', 'false'); return;
        }
        activate(it[0], it[3]);
      });
      btns[it[0]] = b; pill.appendChild(b);
    });
    if (!parent) {
      var create = document.createElement('button'); create.type = 'button'; create.className = 'v2-tabbar-create'; create.setAttribute('aria-label', 'Create a new lesson plan'); create.innerHTML = svg('i-plus');
      create.addEventListener('click', function () { var fresh = $('#newSession'); if (fresh) fresh.click(); });
      nav.appendChild(create);
    }
    function mark(k) { Object.keys(btns).forEach(function (n) { if (n === k) btns[n].setAttribute('aria-current', 'page'); else btns[n].removeAttribute('aria-current'); }); }
    function syncPage() {
      if (document.body.classList.contains('on-dashboard')) mark('home');
      else if (document.body.classList.contains('on-library')) mark('library');
      else if (document.body.classList.contains('on-settings')) mark('more');
      else if (parent) mark('home');
      else if (!document.body.classList.contains('on-dashboard')) mark('studio');
    }
    new MutationObserver(syncPage).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    syncPage();
    document.body.appendChild(nav); document.body.classList.add('has-tabbar');
  }

  /* The subject, class, term and week pills fold into one line. They open by themselves for someone who has not set up yet,
     and stay folded for a teacher with a profile or anyone who folded them before. */
  function foldPills() {
    var pills = $('#pills'); if (!pills || $('.pills-summary')) return;
    var KEY = 'gd.pillsOpen', pref = null;
    try { pref = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
    var GP = window.GuidedProfile, hasProfile = false;
    try { var cl = $('#ddClass .dd-label'); hasProfile = !!(GP && ((GP.myClasses && GP.myClasses().length) || (GP.mySubjects && cl && GP.mySubjects(cl.textContent.trim()).length))); } catch (e) { /* ignore */ }
    var open = pref === null ? !hasProfile : pref === '1';
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pills-summary'; btn.setAttribute('aria-controls', 'pills');
    btn.innerHTML = '<span class="ps-text"></span><svg class="ico chev" aria-hidden="true"><use href="#i-chevron"/></svg>';
    var label = function () {
      var t = ['#ddSubject', '#ddClass', '#ddTerm', '#ddWeek'].map(function (s) { var e = $(s + ' .dd-label'); return e ? e.textContent.trim() : ''; }).filter(Boolean).join(' \u00b7 ');
      btn.querySelector('.ps-text').textContent = t || 'Lesson details';
    };
    var set = function (o, save) {
      open = o; pills.classList.toggle('is-folded', !o); btn.setAttribute('aria-expanded', String(o));
      if (save) { try { localStorage.setItem(KEY, o ? '1' : '0'); } catch (e) { /* ignore */ } }
    };
    btn.addEventListener('click', function () { set(!open, true); });
    pills.insertBefore(btn, pills.firstChild);
    var mo = new MutationObserver(label);   // watch the four menus only, never the summary itself
    ['#ddSubject', '#ddClass', '#ddTerm', '#ddWeek'].forEach(function (s) { var e = $(s); if (e) mo.observe(e, { subtree: true, childList: true, characterData: true }); });
    label(); set(open, false);
  }

  function init() { resourceCards(); tabBar(); foldPills(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
