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

  function notificationCenter() {
    var trigger = $('#notificationBell'); if (!trigger || $('#notificationPanel')) return;
    var items = [], busy = false;
    var panel = document.createElement('section'); panel.className = 'notification-panel'; panel.id = 'notificationPanel';
    panel.hidden = true; panel.setAttribute('role','dialog'); panel.setAttribute('aria-label','Notifications');
    panel.innerHTML = '<div class="notification-head"><div><strong>Notifications</strong><span class="notification-subtitle">Updates and activity alerts</span></div><button type="button" class="notification-mark-read" id="notificationMarkRead">Mark all read</button></div><div class="notification-list" id="notificationList"></div>';
    trigger.insertAdjacentElement('afterend',panel);
    function render() {
      var unread=items.filter(function(x){return !x.read;}).length, count=$('#notificationCount');
      count.textContent=unread>9?'9+':String(unread); count.hidden=!unread;
      trigger.setAttribute('aria-label',unread?('Notifications, '+unread+' unread'):'Notifications');
      var list=$('#notificationList'); list.replaceChildren();
      if(busy && !items.length) { var loading=document.createElement('div'); loading.className='notification-empty'; loading.textContent='Loading notifications…'; list.appendChild(loading); return; }
      if(!items.length) {
        var empty=document.createElement('div'); empty.className='notification-empty';
        empty.innerHTML='<span class="notification-empty-icon">'+svg('i-bell')+'</span><strong>You’re all caught up</strong><span>Important updates and family learning activity alerts will appear here.</span>';
        list.appendChild(empty); return;
      }
      items.forEach(function(item){
        var row=document.createElement('button'); row.type='button'; row.className='notification-item'+(item.read?' is-read':'');
        var dot=document.createElement('span'); dot.className='notification-item-dot';
        var copy=document.createElement('span'); copy.className='notification-item-copy';
        var title=document.createElement('strong'); title.textContent=item.title||'GuidEd update';
        var body=document.createElement('span'); body.textContent=item.body||'';
        var time=document.createElement('small'); time.textContent=new Date(item.createdAt||Date.now()).toLocaleString();
        copy.append(title,body,time); row.append(dot,copy); list.appendChild(row);
        row.addEventListener('click',function(){
          if(item.read) { if(item.url && item.url.charAt(0)==='/') location.href=item.url; return; }
          var S=window.PadiSync;
          if(S && S.markNotificationsRead) S.markNotificationsRead([item.id]).then(refresh).catch(function(){});
          item.read=true; render();
          if(item.url && item.url.charAt(0)==='/') location.href=item.url;
        });
      });
    }
    function refresh() {
      var S=window.PadiSync;
      if(!S || !S.available || !S.available() || !S.user || !S.user()) { items=[]; render(); return Promise.resolve(); }
      busy=true; render();
      return S.listNotifications().then(function(data){items=Array.isArray(data.items)?data.items:[];}).catch(function(e){console.warn('[GuidEd notifications]',e && e.message);})
        .finally(function(){busy=false;render();});
    }
    function close() { panel.hidden=true; trigger.setAttribute('aria-expanded','false'); }
    trigger.addEventListener('click',function(){ panel.hidden=!panel.hidden; trigger.setAttribute('aria-expanded',String(!panel.hidden)); if(!panel.hidden) refresh(); });
    $('#notificationMarkRead').addEventListener('click',function(){
      var S=window.PadiSync; if(!S || !S.markAllNotificationsRead) return;
      S.markAllNotificationsRead().then(refresh).catch(function(e){console.warn('[GuidEd notifications]',e && e.message);});
    });
    document.addEventListener('click',function(e){if(!panel.contains(e.target)&&!trigger.contains(e.target))close();});
    document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
    document.addEventListener('guided:notification-refresh',refresh);
    window.addEventListener('focus',refresh);
    document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh();});
    window.addEventListener('guided:auth-changed',refresh);
    window.GuidedNotifications={refresh:refresh,list:function(){return items.slice();},markAllRead:function(){var S=window.PadiSync;return S&&S.markAllNotificationsRead?S.markAllNotificationsRead().then(refresh):Promise.resolve();}};
    refresh();
  }

  function tabBar() {
    var studio = $('.teaching-studio'); if (!studio) return;
    var nav = $('.v2-tabbar'), sheet = $('.family-create-sheet'), currentRole = '';
    function parentMode() { return document.body.classList.contains('role-parent'); }
    function mark(key) {
      if (!nav) return;
      nav.querySelectorAll('[data-family-nav]').forEach(function (b) {
        if (b.dataset.familyNav === key) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
      });
    }
    function openFamilyTab(key) {
      if (window.GuidedParentDashboard && window.GuidedParentDashboard.open) window.GuidedParentDashboard.open(key);
      mark(key === 'children' ? 'family' : key);
    }
    function closeSheet() {
      if (!sheet) return;
      sheet.hidden = true;
      document.body.classList.remove('family-create-open');
    }
    function build() {
      var isParent = parentMode(), role = isParent ? 'parent' : 'teacher';
      if (nav && currentRole === role) return;
      if (nav) nav.remove();
      if (sheet) { sheet.remove(); sheet = null; }
      nav = document.createElement('nav'); nav.className = 'v2-tabbar' + (isParent ? ' v2-tabbar-family' : '');
      nav.setAttribute('aria-label', isParent ? 'Family navigation' : 'Primary navigation');
      var pill = document.createElement('div'); pill.className = 'v2-tabbar-pill'; nav.appendChild(pill);
      var items = isParent
        ? [['home','Home','i-home','overview'],['library','Library','i-library','library'],['progress','Progress','i-chart','progress'],['family','Family','i-users','children'],['settings','Settings','i-sliders','#settingsLink']]
        : [['home','Home','i-home','#dashboardLink'],['studio','Office','i-mobile-office','#studioLink'],['library','Library','i-library','#libraryLink'],['more','More','i-menu','#settingsLink']];
      items.forEach(function (item) {
        var b = document.createElement('button'); b.type = 'button'; b.dataset.familyNav = item[0];
        b.innerHTML = svg(item[2]) + '<span></span>'; b.querySelector('span').textContent = item[1];
        if (isParent) b.addEventListener('click', function () { if (item[0] === 'settings') { var settings = $(item[3]); if (settings) settings.click(); mark('settings'); } else openFamilyTab(item[3]); });
        else b.addEventListener('click', function () {
          var target = $(item[3]); if (target) target.click();
          mark(item[0]);
        });
        pill.appendChild(b);
      });
      if (isParent) {
        var create = document.createElement('button'); create.type = 'button'; create.className = 'v2-tabbar-create';
        create.setAttribute('aria-label','Start a learning activity'); create.innerHTML = svg('i-plus');
        create.addEventListener('click', function () {
          if (!sheet) return;
          sheet.hidden = false; document.body.classList.add('family-create-open');
        });
        nav.appendChild(create);
        sheet = document.createElement('section'); sheet.className = 'family-create-sheet'; sheet.hidden = true;
        sheet.setAttribute('aria-label','Start a learning activity');
        sheet.innerHTML = '<button type="button" class="family-create-backdrop" data-family-create-close aria-label="Close"></button><div class="family-create-panel"><div class="family-create-grabber"></div><div class="family-create-heading"><div><span>LET’S LEARN TOGETHER</span><strong>What would you like to do?</strong></div><button type="button" data-family-create-close aria-label="Close">×</button></div><button type="button" data-family-create="lesson"><span class="family-create-icon">'+svg('i-book')+'</span><span><strong>Start a home lesson</strong><small>Follow a guided learning activity</small></span>'+svg('i-chevron')+'</button><button type="button" data-family-create="explanation"><span class="family-create-icon">'+svg('i-spark')+'</span><span><strong>Explain a difficult topic</strong><small>Help your child understand</small></span>'+svg('i-chevron')+'</button><button type="button" data-family-create="practice"><span class="family-create-icon">'+svg('i-pencil')+'</span><span><strong>Create practice exercises</strong><small>Build confidence with questions</small></span>'+svg('i-chevron')+'</button>';
        document.body.appendChild(sheet);
        sheet.addEventListener('click', function (event) {
          var action = event.target.closest('[data-family-create]');
          if (action) { closeSheet(); openFamilyTab(action.dataset.familyCreate); return; }
          if (event.target.closest('[data-family-create-close]')) closeSheet();
        });
      } else {
        var create = document.createElement('button'); create.type = 'button'; create.className = 'v2-tabbar-create';
        create.setAttribute('aria-label','Create a new lesson plan'); create.innerHTML = svg('i-plus');
        create.addEventListener('click', function () { var fresh = $('#newSession'); if (fresh) fresh.click(); });
        nav.appendChild(create);
      }
      document.body.appendChild(nav);
      document.body.classList.add('has-tabbar');
      currentRole = role;
      if (!isParent) {
        function syncPage() {
          if (document.body.classList.contains('on-dashboard')) mark('home');
          else if (document.body.classList.contains('on-library')) mark('library');
          else if (document.body.classList.contains('on-settings')) mark('more');
          else mark('studio');
        }
        new MutationObserver(syncPage).observe(document.body,{attributes:true,attributeFilter:['class']});
        syncPage();
      } else {
        function syncParentPage() { if (document.body.classList.contains('on-settings')) mark('settings'); else if (document.body.classList.contains('on-dashboard')) { var active = document.querySelector('#parentDashboardContent [data-parent-tab].is-active'); mark(active ? (active.dataset.parentTab === 'children' ? 'family' : active.dataset.parentTab) : 'home'); } }
        new MutationObserver(syncParentPage).observe(document.body,{attributes:true,attributeFilter:['class']});
        syncParentPage();
      }
    }
    build();
    new MutationObserver(build).observe(document.body,{attributes:true,attributeFilter:['class']});
    document.addEventListener('click',function(event){
      var tab=event.target.closest('#parentDashboardContent [data-parent-tab]');
      if(tab) {
        var key=tab.dataset.parentTab;
        mark(key==='children'?'family':key);
      }
    });
    document.addEventListener('guided:parent-tab-change',function(event){
      var key=event.detail && event.detail.tab;
      if(key) mark(key==='children'?'family':key);
    });
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

  function init() { resourceCards(); notificationCenter(); tabBar(); foldPills(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
