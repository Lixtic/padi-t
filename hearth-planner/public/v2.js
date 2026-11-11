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
    var items = [['studio', 'Studio', 'i-home', null], ['plan', 'Lesson plan', 'i-book', '#studioTabPlan'], ['resources', 'Resources', 'i-layers', '#studioTabResources'], ['media', 'Find media', 'i-search', '#studioTabMedia']];
    var nav = document.createElement('nav'); nav.className = 'v2-tabbar'; nav.setAttribute('aria-label', 'Teaching Studio');
    var btns = {};
    items.forEach(function (it) {
      var b = document.createElement('button'); b.type = 'button'; b.innerHTML = svg(it[2]) + '<span></span>'; b.querySelector('span').textContent = it[1];
      b.addEventListener('click', function () {
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
    document.body.appendChild(nav); document.body.classList.add('has-tabbar');
  }

  function init() { resourceCards(); tabBar(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
