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
  }

  function tabBar() {
    var studio = $('.teaching-studio'); if (!studio || $('.v2-tabbar')) return;
    var items = [['studio', 'Studio', 'i-home', null], ['plan', 'Lesson plan', 'i-book', '#studioTabPlan'], ['resources', 'Resources', 'i-layers', '#studioTabResources'], ['media', 'Find media', 'i-search', '#studioTabMedia'], ['library', 'Library', 'i-library', null]];
    var nav = document.createElement('nav'); nav.className = 'v2-tabbar'; nav.setAttribute('aria-label', 'Teaching Studio');
    var btns = {};
    items.forEach(function (it) {
      var b = document.createElement('button'); b.type = 'button'; b.innerHTML = svg(it[2]) + '<span></span>'; b.querySelector('span').textContent = it[1];
      b.dataset.tab = it[0];
      b.addEventListener('click', function () {
        if (it[0] === 'library') { var lk = $('#libraryLink'); if (lk) { lk.click(); mark('library'); } return; }
        // Tapping the tab you are already on folds the Studio away again, for a wider reading area.
        if (b.getAttribute('aria-current') === 'page' && !studio.classList.contains('is-collapsed')) {
          studio.classList.add('is-collapsed');
          var tg = $('#studioCollapseToggle'); if (tg) tg.setAttribute('aria-expanded', 'false');
          mark(null); return;
        }
        studio.classList.remove('is-collapsed');
        var t = $('#studioContent'), tog = $('#studioCollapseToggle'); if (tog) tog.setAttribute('aria-expanded', 'true'); if (t) t.hidden = false;
        if (it[3]) { var tab = $(it[3]); if (tab) tab.click(); }
        mark(it[0]);
        studio.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      btns[it[0]] = b; nav.appendChild(b);
    });
    function mark(k) { Object.keys(btns).forEach(function (n) { if (n === k) btns[n].setAttribute('aria-current', 'page'); else btns[n].removeAttribute('aria-current'); }); }
    ['Plan', 'Resources', 'Media'].forEach(function (n) {
      var tab = $('#studioTab' + n); if (tab) tab.addEventListener('click', function () { mark(n.toLowerCase()); });
    });
    mark('studio');
    // Keep the Library tab in step with the page: lit while My Library is open, cleared when it closes.
    new MutationObserver(function () {
      if (document.body.classList.contains('on-library')) mark('library');
      else if (btns.library.getAttribute('aria-current') === 'page') mark(null);
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
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
