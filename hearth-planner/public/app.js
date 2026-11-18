/* GuidEd · GES lesson planner · app.js
   Vanilla JS, no dependencies, no build step.
   Talks to /api/config, /api/generate (streaming) and /api/export-docx. */
(() => {
  'use strict';

  /* ───────── Config ───────── */
  const KEY = 'schoolpadi.planner.v1';
  const THEME_KEY = 'schoolpadi.theme';
  const ACCESS_KEY = 'schoolpadi.access';
  // One-time move of data saved under the earlier app name, so nobody loses their plans.
  try {
    [['hearth.planner.v1', KEY], ['hearth.theme', THEME_KEY], ['hearth.access', ACCESS_KEY], ['hearth.rate.v1', 'schoolpadi.rate.v1']].forEach(([o, n]) => {
      const v = localStorage.getItem(o);
      if (v !== null && localStorage.getItem(n) === null) localStorage.setItem(n, v);
    });
  } catch (e) { /* storage blocked */ }
  const MAX_SESSIONS = 20;
  const ONLINE_WINDOW = 10 * 60 * 1000;
  const ERR_MARK = '<<SCHOOLPADI_ERROR>>';
  const PROFILE_KEY = 'schoolpadi.profile';
  const SIZES = ['Up to 30', '31–45', '46–60', 'Over 60'];
  const GL = window.GuidedLevels;   // levels.js, loaded before this file
  // Canned requests behind the "Create from this plan" buttons. The server prompt knows these exact lines.
  const ASKS = {
    worksheet: "Create the learner worksheet for this week's lessons.",
    homework: 'Create the homework pack for this week.',
    bece: "Write 10 more BECE-style questions on this week's topics.",
  };
  const KIND_TITLE = { plan: '', worksheet: ' – Learner Worksheet', homework: ' – Homework Pack', bece: ' – BECE Practice' };
  const EXAM_ASKS = GL.LEVELS.map((l) => l.exam.ask);
  const askText = (kind, cls) => (kind === 'bece' ? examOf(cls || 'Basic 8').ask : ASKS[kind]);
  const kindTitle = (kind, cls) => (kind === 'bece' ? examOf(cls || 'Basic 8').title : KIND_TITLE[kind]);
  const kindOfAsk = (text) => (EXAM_ASKS.includes(text) ? 'bece' : Object.keys(ASKS).find((k) => ASKS[k] === text) || 'plan');
  const NS = 'http://www.w3.org/2000/svg';

  // Levels, classes and subjects come from levels.js (generated from api/_levels.js, so the server agrees).
  const CLASSES = GL.ALL_CLASSES;
  const levelOf = (cls) => GL.levelOfClass(cls) || GL.LEVELS.find((l) => l.id === GL.DEFAULT_LEVEL);
  const subjectsOf = (cls) => levelOf(cls).subjects;
  const examOf = (cls) => levelOf(cls).exam;
  // The stored resource key stays 'BECE practice'; what the teacher reads follows the level (WASSCE practice for SHS, Class exercise for primary).
  const resourceLabel = (type, cls) => type === 'BECE practice' ? examOf(cls).toggle : type;
  const notesOf = (cls) => levelOf(cls).notes;
  const SUBJECTS = levelOf('Basic 8').subjects;
  /* Basic schools run three terms of 14 weeks; senior high schools run two semesters of 17 weeks. */
  const isShsCls = (cls) => /^SHS/i.test(String(cls || ''));
  const weeksFor = (cls) => Array.from({ length: isShsCls(cls) ? 17 : 14 }, (_, i) => i + 1);
  const termWord = (cls) => (isShsCls(cls) ? 'Semester' : 'Term');
  const termsFor = (cls) => (isShsCls(cls) ? [1, 2] : [1, 2, 3]);
  const WEEKS = weeksFor('Basic 8');   // only for code that has no class yet; use weeksFor(cls) otherwise

  /* ───────── Helpers ───────── */
  const $ = (s, r = document) => r.querySelector(s);
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const byId = (list, id) => list.find((x) => x.id === id);
  const sleep = (ms, signal) => new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return el;
  }

  /* Full-screen reader: the plan as it is on screen, with the whole display to read it. Text size can be raised for a classroom. */
  function openReader(title, source, onShare) {
    const dlg = document.createElement('dialog'); dlg.className = 'reader-full'; dlg.setAttribute('aria-label', title || 'Reading view');
    const bar = h('div', { class: 'reader-bar' });
    const heading = h('strong', { class: 'reader-title', text: title || '' });
    let size = 1;
    const bigger = h('button', { type: 'button', class: 'reader-btn', 'aria-label': 'Larger text', text: 'A+' });
    const smaller = h('button', { type: 'button', class: 'reader-btn', 'aria-label': 'Smaller text', text: 'A\u2212' });
    const share = onShare ? h('button', { type: 'button', class: 'reader-btn reader-share', 'aria-label': 'Share lesson plan', title: 'Share lesson plan' }, icon('share'), h('span', { text: 'Share' })) : null;
    if (share) share.addEventListener('click', onShare);
    const close = h('button', { type: 'button', class: 'reader-btn reader-close', text: 'Close' });
    const body = h('div', { class: 'reader-body md', tabindex: '-1' });
    body.append(...Array.from(source.childNodes).map((n) => n.cloneNode(true)));
    const apply = () => { body.style.fontSize = size + 'em'; };
    bigger.addEventListener('click', () => { size = Math.min(size + 0.15, 2); apply(); });
    smaller.addEventListener('click', () => { size = Math.max(size - 0.15, 0.8); apply(); });
    const returnFocus = document.activeElement;
    close.addEventListener('click', () => dlg.close());
    bar.append(heading, smaller, bigger, ...(share ? [share] : []), close);
    dlg.append(bar, body);
    body.scrollTop = 0;
    // Back (browser, Android or swipe) closes the reader and lands on the page it was opened from.
    let viaBack = false, pushed = false;
    const onPop = () => { viaBack = true; if (dlg.open) dlg.close(); };
    try { history.pushState({ guidedReader: true }, ''); pushed = true; window.addEventListener('popstate', onPop); } catch (e) { /* history unavailable */ }
    dlg.addEventListener('close', () => {
      window.removeEventListener('popstate', onPop);
      if (pushed && !viaBack && history.state && history.state.guidedReader) { try { history.back(); } catch (e) { /* ignore */ } }
      if (document.fullscreenElement === dlg && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      dlg.remove();
      if (returnFocus && returnFocus.isConnected && returnFocus.focus) returnFocus.focus({ preventScroll: true });
    });
    document.body.appendChild(dlg);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    const fs = dlg.requestFullscreen || dlg.webkitRequestFullscreen;
    if (fs) { try { const r = fs.call(dlg); if (r && r.catch) r.catch(() => {}); } catch (e) { /* dialog already fills the viewport */ } }
    body.scrollTop = 0;   // every lesson opens at its beginning, never at an old scroll position
    requestAnimationFrame(() => { body.scrollTop = 0; });
    body.focus({ preventScroll: true });
  }

  function icon(name, cls = '') {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', (name === 'logo' ? '' : 'ico ') + cls);
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(NS, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }

  function rel(ts) {
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return 'now';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    return Math.floor(s / 86400) + 'd';
  }

  const planTitle = (p) => p.subject + ' – ' + p.cls + ' – Week ' + p.week;
  const wordCount = (t) => (t.match(/\S+/g) || []).length;

  /* Markdown renderer: see markdown.js (loaded before this file). */
  const { esc, renderMd } = window.GuidedMarkdown;

  // Separates the closing <ElicitationsGroup> from the document body.
  function splitElic(raw) {
    const chips = [];
    const m = raw.match(/<ElicitationsGroup>([\s\S]*?)(?:<\/ElicitationsGroup>|$)/i);
    if (m) {
      const re = /<Elicitation>([\s\S]*?)<\/Elicitation>/gi;
      let x;
      while ((x = re.exec(m[1]))) chips.push(x[1].trim());
    }
    let body = raw.replace(/<ElicitationsGroup>[\s\S]*$/i, '');
    const at = body.indexOf(ERR_MARK);
    if (at !== -1) body = body.slice(0, at);
    body = body.replace(/<[A-Za-z/]*$/, '');          // a half-written tag at the end of a stream
    return { body: body.trim(), chips };
  }

  /* ───────── State ───────── */
  const state = {
    sessions: [],
    currentId: null,
    params: { subject: SUBJECTS[0], cls: 'Basic 8', week: 1, hook: true, size: '31–45', light: false, mode: 'full', resourceType: 'Study notes', indicatorCodes: [], indicatorContextKey: '' },
    streaming: null,
    stick: true,
    bots: [],
    config: { loaded: false, demo: false, provider: null, accessRequired: false },
    access: '',
  };

  const store = {
    load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } },
    save(quiet) {
      const keep = state.sessions.filter((s) => s.messages.length).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SESSIONS);
      for (let n = keep.length; n >= 0; n--) {
        try {
          localStorage.setItem(KEY, JSON.stringify({ sessions: keep.slice(0, n), params: state.params }));
          if (!quiet && typeof scheduleSync === 'function') scheduleSync();
          return;
        } catch (e) { /* quota: drop the oldest and retry */ }
      }
    },
  };

  /* ───────── Elements ───────── */
  const app = $('#app'), sidebar = $('#sidebar'), main = $('#main');
  const menuBtn = $('#menuBtn'), sbClose = $('#sbClose'), scrim = $('#scrim');
  const newBtn = $('#newSession'), brand = $('#brand');
  const searchToggle = $('#searchToggle'), searchWrap = $('#searchWrap'), searchInput = $('#searchInput');
  const listEl = $('#sessionList'), emptyEl = $('#sbEmpty');
  const themeToggle = $('#themeToggle');
  const topTitle = $('#topTitle'), statusDot = $('#statusDot'), statusText = $('#statusText');
  const messagesWrap = $('#messagesWrap'), messagesEl = $('#messages');
  const composer = $('#composer'), promptEl = $('#prompt'), sendBtn = $('#sendBtn');
  const fineprint = $('#fineprint'), demoBanner = $('#demoBanner');
  const accessRow = $('#accessRow'), accessInput = $('#accessInput');
  const teacherInput = $('#teacherInput'), schoolInput = $('#schoolInput'), alsoRow = $('#alsoRow');
  let planQueue = [];                                  // other classes still to be written, one after another

  /* Teacher details: saved once on this device, printed under the title of every Word file. */
  const profile = () => { try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}; } catch (e) { return {}; } };
  function saveProfile() {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(Object.assign(profile(), { teacher: teacherInput.value.trim(), school: schoolInput.value.trim(), updatedAt: Date.now() }))); } catch (e) { /* storage blocked */ }
    if (typeof scheduleSync === 'function') scheduleSync();
  }
  [teacherInput, schoolInput].forEach((el) => el.addEventListener('input', saveProfile));
  { const p = profile(); teacherInput.value = p.teacher || ''; schoolInput.value = p.school || ''; }
  const toastEl = $('#toast');

  const mq = window.matchMedia('(max-width: 820px)');
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const isMobile = () => mq.matches;

  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3800);
  }

  /* ───────── Sessions ───────── */
  const current = () => byId(state.sessions, state.currentId);
  const STATUS = { online: 'Online', running: 'Writing', idle: 'Idle', demo: 'Demo mode' };

  function statusOf(s) {
    if (state.streaming && state.streaming.sessionId === s.id) return 'running';
    if (s.id === state.currentId) return 'online';
    return Date.now() - s.updatedAt < ONLINE_WINDOW ? 'online' : 'idle';
  }

  const makeSession = () => ({ id: uid(), title: 'New plan', updatedAt: Date.now(), params: null, messages: [] });
  const isFresh = (s) => s && s.messages.length === 0;

  /* Plans are grouped into one folder per class (Basic 1 to SHS 3). The folder view is the default; "Recent" is a flat list. */
  const VIEW_KEY = 'guided.sb.view', CLOSED_KEY = 'guided.sb.closed';
  const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  const SB_VIEWS = ['type', 'class', 'recent'];
  let sbView = SB_VIEWS.includes(lsGet(VIEW_KEY, 'type')) ? lsGet(VIEW_KEY, 'type') : 'type';
  let closedFolders = new Set(lsGet(CLOSED_KEY, []));
  let startPlanFor = () => {};                          // set once the menus exist: opens a new plan for a class

  /* One group per kind of document: full plans, lesson plans only, then each resource type. */
  const TYPE_ORDER = ['plan', 'Study notes', 'Learner worksheet', 'Homework pack', 'BECE practice', 'Teaching slides'];
  const TYPE_LABEL = { plan: 'Lesson plans', 'Study notes': 'Study notes', 'Learner worksheet': 'Worksheets', 'Homework pack': 'Homework packs', 'BECE practice': 'Exam practice', 'Teaching slides': 'Teaching slides' };
  const typeOf = (s) => (s.params && s.params.mode === 'resources' && TYPE_ORDER.includes(s.params.resourceType)) ? s.params.resourceType : 'plan';

  function sessionRow(s, inFolder) {
    const st = statusOf(s);
    const sub = s.params ? (inFolder ? [s.params.term ? termWord(s.params.cls) + ' ' + s.params.term : '', 'Week ' + s.params.week].filter(Boolean).join(' · ') : s.params.cls + ' · Week ' + s.params.week) + (s.copy ? ' · copy' : '') : '';
    return h('li', { class: 's-row' },
      h('button', { type: 'button', class: 's-item', 'data-id': s.id, 'aria-current': String(s.id === state.currentId) },
        h('span', { class: 'dot dot-' + st, role: 'img', 'aria-label': STATUS[st], title: STATUS[st] }),
        h('span', { class: 's-text' },
          h('span', { class: 's-title', text: s.params ? s.params.subject : s.title }),
          s.params ? h('span', { class: 's-sub', text: sub }) : null),
        h('span', { class: 's-time', text: rel(s.updatedAt) })),
      s.messages.length ? h('button', { type: 'button', class: 's-del', 'data-del': s.id, 'aria-label': 'Delete plan ' + s.title }, icon('trash')) : null);
  }

  function renderSessions() {
    const q = searchInput.value.trim().toLowerCase();
    const items = state.sessions
      .filter((s) => s.messages.length || s.id === state.currentId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((s) => !q || s.title.toLowerCase().includes(q) || (s.params && (s.params.cls + ' ' + s.params.subject).toLowerCase().includes(q)));
    document.getElementById('viewType').setAttribute('aria-pressed', String(sbView === 'type'));
    document.getElementById('viewClass').setAttribute('aria-pressed', String(sbView === 'class'));
    document.getElementById('viewRecent').setAttribute('aria-pressed', String(sbView === 'recent'));
    if (sbView === 'recent') {
      listEl.replaceChildren(...items.map((s) => sessionRow(s, false)));
    } else if (sbView === 'type') {
      const by = new Map(TYPE_ORDER.map((t) => [t, []]));
      const loose = items.filter((s) => !s.params);
      items.filter((s) => s.params).forEach((s) => by.get(typeOf(s)).push(s));
      const nodes = loose.map((s) => sessionRow(s, false));
      TYPE_ORDER.filter((t) => by.get(t).length).forEach((t) => {
        const list = by.get(t), key = 'type:' + t;
        const open = !!q || list.some((s) => s.id === state.currentId) || !closedFolders.has(key);
        const body = h('ul', { class: 'f-body', id: 'fold-' + t.replace(/\W+/g, '-') }, ...list.map((s) => sessionRow(s, false)));
        body.hidden = !open;
        nodes.push(h('li', { class: 'f-item' },
          h('div', { class: 'f-row' },
            h('button', { type: 'button', class: 'f-head', 'data-folder': key, 'aria-expanded': String(open), 'aria-controls': body.id },
              icon('chevron'), h('span', { class: 'f-name', text: TYPE_LABEL[t] }), h('span', { class: 'f-count', text: String(list.length) }))),
          body));
      });
      listEl.replaceChildren(...nodes);
    } else {
      const loose = items.filter((s) => !s.params || !s.params.cls);
      const by = new Map();
      items.filter((s) => s.params && s.params.cls).forEach((s) => { if (!by.has(s.params.cls)) by.set(s.params.cls, []); by.get(s.params.cls).push(s); });
      const order = CLASSES.filter((c) => by.has(c)).concat([...by.keys()].filter((c) => !CLASSES.includes(c)));
      const nodes = loose.map((s) => sessionRow(s, false));
      order.forEach((cls) => {
        const list = by.get(cls);
        const hasCurrent = list.some((s) => s.id === state.currentId);
        const open = !!q || hasCurrent || !closedFolders.has(cls);
        const body = h('ul', { class: 'f-body', id: 'fold-' + cls.replace(/\W+/g, '-') }, ...list.map((s) => sessionRow(s, true)));
        body.hidden = !open;
        nodes.push(h('li', { class: 'f-item' },
          h('div', { class: 'f-row' },
            h('button', { type: 'button', class: 'f-head', 'data-folder': cls, 'aria-expanded': String(open), 'aria-controls': body.id },
              icon('chevron'), h('span', { class: 'f-name', text: cls }), h('span', { class: 'f-count', text: String(list.length) })),
            h('button', { type: 'button', class: 'f-add', 'data-newfor': cls, 'aria-label': 'New plan for ' + cls, title: 'New plan for ' + cls }, icon('plus'))),
          body));
      });
      listEl.replaceChildren(...nodes);
    }
    emptyEl.hidden = items.length > 0 || !q;
  }

  function updateTopbar() {
    const s = current();
    if (!s) return;
    { const pg = pageOpen(); if (pg) { topTitle.textContent = pg[0] === 'dashboard' && window.GuidedAccountRole === 'parent' ? 'Parent Dashboard' : pg[1]; return; } }
    topTitle.textContent = s.messages.length ? s.title : 'New plan';
    document.title = (s.messages.length ? s.title + ' · ' : '') + 'GuidEd';
    let st = statusOf(s);
    if (st !== 'running' && state.config.demo) st = 'demo';
    // The top-bar status indicator is optional in compact layouts and newer shells.
    // Keep session status updates safe when those elements are not present in the DOM.
    if (statusDot) statusDot.className = 'dot dot-' + (st === 'demo' ? 'idle' : st);
    if (statusText) statusText.textContent = STATUS[st];
    document.body.dataset.status = st;
  }

  let lastChatView = null;
  function updateView() {
    const s = current();
    const chat = !!(s && s.messages.length);
    main.dataset.view = chat ? 'chat' : 'landing';
    if (chat !== lastChatView) {   // the Studio is the landing screen; beside a plan it folds to a header the reader can reopen
      lastChatView = chat;
      const st = document.querySelector('.teaching-studio'), tg = document.querySelector('#studioCollapseToggle');
      if (st && tg) { st.classList.toggle('is-collapsed', chat); tg.setAttribute('aria-expanded', String(!chat)); }
    }
    if (window.GuidedAds) window.GuidedAds.sync(!chat && !state.streaming && !termRun);
    demoBanner.hidden = !state.config.demo;
    promptEl.placeholder = chat ? 'Ask for a change…' : 'Optional: topic or strand, class size, week-ending date…';
    if (!promptEl.value) autoGrow();                // the placeholder is shorter in chat, so the box can shrink
    fineprint.textContent = chat ? 'Always review generated plans against the NaCCA curriculum before teaching.' : 'Always review a generated plan against the NaCCA curriculum before teaching.';
  }

  function showSession(id) {
    stopStreaming();
    setComposer(false, true);
    state.sessions = state.sessions.filter((s) => s.messages.length || s.id === id);
    state.currentId = id;
    const s = current();
    state.bots = [];
    messagesEl.replaceChildren();
    s.messages.forEach((m, i) => {
      if (m.role === 'user') messagesEl.append(userBubble(m, s, i));
      else {
        const bot = makeBot(s);
        bot.setKind(m.kind);
        bot.set(m.content, true, m);
        messagesEl.append(bot.root);
        state.bots.push(bot);
      }
    });
    state.bots.forEach((b, i) => { if (i < state.bots.length - 1) b.demote(); });
    if (s.params) { state.params = Object.assign({ size: '31–45', light: false, hook: true, studyNotes: true, bece: true, indicatorCodes: [], indicatorContextKey: '' }, s.params); syncPills(); }
    updateView(); updateTopbar(); renderSessions(); updateSend(); scrollBottom(true);
  }

  // Open a saved item directly in the planner's editor from Dashboard or Library actions.
  function editSavedSession(id) {
    const session = state.sessions.find((s) => s.id === id);
    if (!session || !session.messages.length) return;
    showPage(null);
    showSession(id);
    const bot = state.bots[state.bots.length - 1];
    const edit = bot && bot.root.querySelector('[data-act="edit"]');
    if (edit && !edit.disabled && !edit.hidden) edit.click();
    else toast('This saved item is not ready to edit yet.');
  }

  // Saved lessons open in the dedicated reader while the originating page stays underneath.
  // Closing the reader therefore returns to the dashboard or Library, never to the Studio.
  function openSavedSession(id) {
    showSession(id);
    const bot = state.bots[state.bots.length - 1];
    if (bot && typeof bot.openFullScreen === 'function') bot.openFullScreen();
  }

  // Resolve teaching notifications to the matching saved lesson instead of reloading the home page.
  window.GuidedOpenNotification = function (item) {
    if (!item) return false;
    if (item.type === 'teaching') {
      const bits = String(item.body || '').split(' · ');
      const subject = (bits[0] || '').trim(), cls = (bits[1] || '').trim();
      const weekMatch = String(item.body || '').match(/Week\s+(\d+)/i);
      const match = state.sessions.filter((s) => s.messages.length && typeOf(s) === 'plan' && s.params &&
        s.params.subject === subject && s.params.cls === cls && (!weekMatch || Number(s.params.week) === Number(weekMatch[1])))
        .sort((x, y) => y.updatedAt - x.updatedAt)[0];
      if (match) { openSavedSession(match.id); return true; }
      showPage('library');
      toast('The lesson is not synced on this device yet. Check My Library after syncing.');
      return true;
    }
    const target = item.url;
    if (target && target !== '/' && target !== location.pathname + location.search) { location.href = target; return true; }
    toast('This notification has been marked as read.');
    return true;
  };

  function newSession() {
    setComposer(false, true);
    state.params.mode = 'full';
    state.params.resourceType = 'Study notes';
    const cur = current();
    if (isFresh(cur) && !state.streaming) {
      promptEl.value = ''; autoGrow(); updateView();
      if (isMobile()) setNav(false);
      if (!coarse) promptEl.focus();
      return;
    }
    const s = makeSession();
    state.sessions.unshift(s);
    promptEl.value = ''; autoGrow();
    showSession(s.id);
    if (isMobile()) setNav(false);
    if (!coarse) promptEl.focus();
  }

  // Chat and the Teaching Studio are separate views. A plan on screen gets a clean chat (just the plan and "Ask for a change");
  // tapping any Studio tab then starts a fresh, empty Studio instead of opening the tools underneath the chat.
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('.v2-tabbar button');
    if (!tab || tab.dataset.tab === 'library') return;
    const cur = current();
    if (!(cur && cur.messages.length)) return;
    if (state.streaming) { toast('Wait for the current generation to finish.'); e.stopPropagation(); return; }
    newSession();
    document.querySelectorAll('.v2-tabbar [aria-current]').forEach((b) => b.removeAttribute('aria-current'));   // so this tap opens the fresh Studio rather than folding it
  }, true);

  function deleteSession(id) {
    const wasCurrent = id === state.currentId;
    if (wasCurrent) stopStreaming();
    state.sessions = state.sessions.filter((s) => s.id !== id);
    { const t = tomb(); t[id] = Date.now(); saveTomb(t); }
    store.save();
    if (wasCurrent) { const s = makeSession(); state.sessions.unshift(s); showSession(s.id); }
    else renderSessions();
  }

  /* ───────── Message DOM ───────── */
  function userBubble(m, session, index) {
    if (index === 0 && session.params) {
      const p = session.params;
      return h('div', { class: 'msg user' },
        h('div', { class: 'req' },
          h('div', { class: 'req-tags' },
            h('span', { class: 'tag', text: p.subject }), h('span', { class: 'tag', text: p.cls }), h('span', { class: 'tag', text: 'Week ' + p.week }),
            p.size ? h('span', { class: 'tag', text: p.size + ' learners' }) : null,
            p.light ? h('span', { class: 'tag', text: 'Low-resource' }) : null,
            p.mode === 'resources' ? h('span', { class: 'tag', text: resourceLabel(p.resourceType, p.cls) }) : p.mode === 'plan' ? h('span', { class: 'tag', text: 'Lesson plan only' }) : null,
            p.studyNotes === false ? h('span', { class: 'tag', text: notesOf(p.cls).tag }) : null,
            p.bece === false ? h('span', { class: 'tag', text: examOf(p.cls).tag }) : null),
          m.content ? h('div', { class: 'req-notes', text: m.content }) : null));
    }
    return h('div', { class: 'msg user' }, h('div', { class: 'bubble', text: m.content }));
  }

  function metaText(m) {
    const bits = [wordCount(m.content) + ' words'];
    if (m.seconds) bits.push(m.seconds.toFixed(0) + 's');
    if (m.demo) bits.push('demo sample');
    if (m.stopped) bits.push('stopped');
    if (m.edited) bits.push('edited');
    return bits.join(' · ');
  }

  function makeBot(session) {
    const baseTitle = planTitle(session.params || state.params) + (session.params && session.params.mode === 'resources' ? ' – ' + resourceLabel(session.params.resourceType, session.params.cls) : session.params && session.params.mode === 'plan' ? ' – Lesson plan' : '');
    let kind = 'plan', demoted = false, editBox = null, ta = null;
    let slideState = null;   // which slide the person is on, kept while a deck is repainted
    const titleEl = h('span', { class: 'doc-title', text: baseTitle });
    const bodyEl = h('div', { class: 'doc-body md' });
    const noteEl = h('div', { class: 'doc-note', hidden: true });
    const chipsEl = h('div', { class: 'chips' });
    const extrasEl = h('div', { class: 'extras' });
    const metaEl = h('div', { class: 'meta' });
    const btnEdit = h('button', { type: 'button', class: 'tool', disabled: true, 'data-act': 'edit' }, icon('pencil'), h('span', { text: 'Edit' }));
    const btnReuse = h('button', { type: 'button', class: 'tool', disabled: true, 'data-act': 'reuse', title: 'Copy this plan into a new plan you can change freely' }, icon('layers'), h('span', { text: 'Reuse' }));
    const btnRegen = h('button', { type: 'button', class: 'tool', disabled: true }, icon('refresh'), h('span', { text: 'Regenerate' }));
    const btnFull = h('button', { type: 'button', class: 'tool', disabled: true, 'data-act': 'full', title: 'Read in full screen', 'aria-label': 'Full screen' }, icon('expand'), h('span', { text: 'Full screen' }));
    const btnShare = h('button', { type: 'button', class: 'tool', disabled: true, 'data-act': 'share', title: 'Share only the lesson plan tables, with a signature and stamp area' }, icon('share'), h('span', { text: 'Share' }));
    const btnDocx = h('button', { type: 'button', class: 'tool tool-main', disabled: true }, icon('download'), h('span', { text: 'Word (.docx)' }));
    const btnPdf = h('button', { type: 'button', class: 'tool', disabled: true, title: 'Download as a PDF' }, icon('download'), h('span', { text: 'PDF' }));
    if (window.SchoolPadiArtifact) btnPdf.hidden = true;
    const progress = h('span', { class: 'doc-progress', text: 'Writing…' });
    const root = h('div', { class: 'msg bot' },
      h('div', { class: 'avatar' }, icon('logo', 'logo')),
      h('div', { class: 'body' },
        h('div', { class: 'doc' },
          h('div', { class: 'doc-bar' },
            h('div', { class: 'doc-id' }, titleEl, progress),
            h('div', { class: 'doc-tools' }, btnEdit, btnReuse, btnRegen, btnShare, btnFull,
              h('div', { class: 'tool-group', role: 'group', 'aria-label': 'Download' }, h('span', { class: 'tool-group-label', text: 'Download' }), h('div', { class: 'tool-pair' }, btnDocx, btnPdf)))),
          noteEl, bodyEl),
        chipsEl, extrasEl, metaEl));

    const tools = [btnEdit, btnReuse, btnRegen, btnShare, btnFull, btnDocx, btnPdf];

    function fillExtras() {
      if (demoted || (session.params && session.params.mode === 'resources')) { extrasEl.replaceChildren(); return; }
      const planCls = () => (session.params && session.params.cls) || state.params.cls;
      const mk = (k, label, ic) => h('button', { type: 'button', class: 'extra-btn', 'data-ask': k, onclick: () => askFor(k, planCls()) }, icon(ic), h('span', { text: label }));
      extrasEl.replaceChildren(
        h('span', { class: 'extras-label', text: 'Create from this plan' }),
        mk('worksheet', 'Learner worksheet', 'book'),
        mk('homework', 'Homework pack', 'calendar'),
        mk('bece', examOf(planCls()).more, 'cap'));
    }

    let editor = null;
    const DRAFT = 'schoolpadi.draft';
    const draftKey = () => (api.msg && api.msg.id) || session.id || baseTitle;
    function readDrafts() { try { return JSON.parse(localStorage.getItem(DRAFT) || '{}'); } catch (e) { return {}; } }
    function writeDraft(md) { try { const d = readDrafts(); if (md === null) delete d[draftKey()]; else d[draftKey()] = md; localStorage.setItem(DRAFT, JSON.stringify(d)); } catch (e) { /* storage unavailable */ } }

    function closeEdit() {
      if (editBox) { editBox.remove(); editBox = null; ta = null; }
      editor = null;
      bodyEl.hidden = false;
      if (autoCollapsed) setComposer(false, true);
      $('span', btnEdit).textContent = 'Edit';
    }

    function commit(text) {
      const tail = (api.text.match(/<ElicitationsGroup>[\s\S]*$/i) || [''])[0];
      const raw = text.trim() + (tail ? '\n\n' + tail : '');
      if (api.msg) { api.msg.content = raw; api.msg.edited = true; api.msg.demo = false; }
      writeDraft(null);
      closeEdit();
      api.set(raw, true, api.msg);
      store.save();
      toast('Changes saved. Word export now uses your version.');
    }

    function startRawEdit(initial) {
      if (state.streaming || editBox) return;
      ta = h('textarea', { class: 'doc-edit', spellcheck: 'false', 'aria-label': 'Edit plan text' });
      ta.value = (initial != null ? initial : splitElic(api.text).body).trim();
      const save = h('button', { type: 'button', class: 'tool tool-main', 'data-act': 'save' }, icon('check'), h('span', { text: 'Save changes' }));
      const cancel = h('button', { type: 'button', class: 'tool', 'data-act': 'cancel' }, icon('x'), h('span', { text: 'Cancel' }));
      save.addEventListener('click', () => { if (!ta.value.trim()) { toast('The plan cannot be empty.'); return; } commit(ta.value); });
      cancel.addEventListener('click', () => { closeEdit(); api.set(api.text, true, api.msg); });
      editBox = h('div', { class: 'edit-box' },
        h('p', { class: 'edit-hint', text: 'Text mode. In a table, separate cells with | and start a new line inside a cell with <br>.' }),
        ta, h('div', { class: 'edit-actions' }, save, cancel));
      bodyEl.hidden = true;
      if (!zone.classList.contains('is-collapsed')) setComposer(true, true);
      bodyEl.after(editBox);
      $('span', btnEdit).textContent = 'Editing';
      ta.focus();
    }

    function startEdit() {
      if (state.streaming || editor || editBox) return;
      if (!window.PadiEditor || (window.SchoolPadiSlides && window.SchoolPadiSlides.isDeck(session.params))) { startRawEdit(); return; }   // slides are edited as text
      if (!zone.classList.contains('is-collapsed')) setComposer(true, true);
      const draft = readDrafts()[draftKey()];
      if (draft) { bodyEl.innerHTML = renderMd(draft); toast('Restored your unsaved edits.'); }
      editor = window.PadiEditor.begin({
        body: bodyEl, toast,
        onDraft: writeDraft,
        onSave: (md) => commit(md),
        onCancel: () => { writeDraft(null); closeEdit(); api.set(api.text, true, api.msg); },
        onRaw: (md) => { editor = null; startRawEdit(md); },
      });
      bodyEl.parentNode.insertBefore(editor.bar, bodyEl);
      $('span', btnEdit).textContent = 'Editing';
      const first = bodyEl.querySelector('p:not(.q), td .ln, h2');
      if (first && window.matchMedia('(hover: hover)').matches) first.focus();
    }

    const api = {
      root, text: '', msg: null,
      get title() { return baseTitle + (kindTitle(kind, session.params && session.params.cls) || ''); },
      get kind() { return kind; },
      openFullScreen() {
        const SL = window.SchoolPadiSlides;
        if (SL && SL.isDeck(session.params) && SL.parse(api.text).length) { slideState = slideState || { i: 0 }; SL.present(api.text, slideState, () => {}); return; }
        const canSharePlan = kind === 'plan' && !(session.params && session.params.mode === 'resources');
        openReader(titleEl.textContent, bodyEl, canSharePlan ? () => {
          if (api.msg && api.msg.preview) {
            if (signedIn()) toast('This is a preview of Lesson 1. Write the full plan to share it.');
            else openSignupSheet('Create a free account to unlock the full plan and share it.');
            return;
          }
          sharePlan(api.text, baseTitle, btnShare);
        } : null);
      },
      setKind(k) { kind = KIND_TITLE[k] !== undefined ? k : 'plan'; titleEl.textContent = api.title; bodyEl.classList.toggle('worksheet', kind === 'worksheet' || !!(session.params && session.params.resourceType === 'Learner worksheet')); btnShare.hidden = kind !== 'plan' || !!(session.params && session.params.mode === 'resources'); },
      set(raw, final, msg) {
        api.text = raw;
        const pv = !!(msg && msg.preview);
        const { body, chips } = splitElic(raw);
        const SL = window.SchoolPadiSlides;
        if (SL && SL.isDeck(session.params) && SL.parse(body).length) { slideState = slideState || { i: 0 }; bodyEl.replaceChildren(SL.deck(body, slideState)); }
        else bodyEl.innerHTML = renderMd(body);
        progress.textContent = final ? '' : 'Writing… ' + wordCount(body) + ' words';
        if (final) {
          api.msg = msg || null;
          tools.forEach((b) => { b.disabled = false; });
          metaEl.textContent = msg ? metaText(msg) : '';
          if (pv) {                                       // a taster: no editing or regenerating, and a card that leads to the full plan
            [btnRegen, btnEdit, btnReuse].forEach((b) => { b.hidden = true; });
            chipsEl.replaceChildren(paywallCard(session)); extrasEl.replaceChildren();
          } else if (!demoted) {
            chipsEl.replaceChildren(...chips.map((c) => h('button', { type: 'button', class: 'chip-btn', text: c, onclick: () => onChip(c) })));
            fillExtras();
          }
          if (msg && msg.warning) api.note(msg.warning);
        }
      },
      note(text) { noteEl.textContent = text; noteEl.hidden = !text; },
      error(text, retry) {
        progress.textContent = '';
        bodyEl.replaceChildren(h('div', { class: 'doc-error' }, h('p', { text }), retry ? h('button', { type: 'button', class: 'tool tool-main', onclick: retry }, icon('refresh'), h('span', { text: 'Try again' })) : null));
      },
      demote() { demoted = true; btnRegen.hidden = true; chipsEl.replaceChildren(); extrasEl.replaceChildren(); },
    };
    btnEdit.addEventListener('click', () => {
      if (editor) editor.cancel();
      else if (editBox) { closeEdit(); api.set(api.text, true, api.msg); }
      else startEdit();
    });
    btnReuse.addEventListener('click', () => reuseSession());
    btnFull.addEventListener('click', () => api.openFullScreen());
    btnShare.addEventListener('click', () => {
      if (api.msg && api.msg.preview) {
        if (signedIn()) toast('This is a preview of Lesson 1. Write the full plan to share it.');
        else openSignupSheet('Create a free account to unlock the full plan and share it.');
        return;
      }
      sharePlan(api.text, baseTitle, btnShare);
    });
    btnRegen.addEventListener('click', () => regenerate());
    btnDocx.addEventListener('click', () => {
      if (api.msg && api.msg.preview) {
        if (signedIn()) toast('This is a preview of Lesson 1. Write the full plan to download it.');
        else openSignupSheet('Create a free account to unlock the full plan and download it.');
        return;
      }
      exportDocx(api.text, api.title, btnDocx, kind);
    });
    btnPdf.addEventListener('click', () => {
      if (api.msg && api.msg.preview) {
        if (signedIn()) toast('This is a preview of Lesson 1. Write the full plan to download it.');
        else openSignupSheet('Create a free account to unlock the full plan and download it.');
        return;
      }
      exportPdf(api.text, api.title, btnPdf, kind);
    });
    return api;
  }

  /* ───────── Free preview, Free and Pro ───────── */
  // The card under a guest's taster. Guests create an account; signed-in teachers write the full plan.
  function paywallCard(session) {
    const btn = h('button', { type: 'button', class: 'pw-main', 'data-pw': '1' });
    const sub = h('span', { class: 'pw-sub', 'data-pw-sub': '1' });
    const paint = () => { const guest = !signedIn(), resource = session.params && session.params.mode === 'resources'; btn.textContent = guest ? 'Create free account' : resource ? 'Generate full resource' : 'Write the full plan'; sub.textContent = guest ? 'Free. Takes about a minute.' : 'Uses one of your generations.'; };
    paint();
    btn.addEventListener('click', () => { if (signedIn()) unlockFull(session); else openSignupSheet(session.params && session.params.mode === 'resources' ? 'Create a free account to generate the full resource.' : 'Create a free account to unlock the full plan.'); });
    return h('div', { class: 'paywall' },
      h('h3', { text: session.params && session.params.mode === 'resources' ? 'This is a preview of your resource' : 'This is a preview of Lesson 1' }),
      h('p', { text: session.params && session.params.mode === 'resources' ? 'Create an account to generate the complete resource and download it.' : 'The full plan is ready when you are:' }),
      h('ul', null, ...(session.params && session.params.mode === 'resources' ? ['Complete learner-ready content', 'Examples and answer guide where relevant', 'Word download, ready to print'] : ['Lesson 2 and the complete weekly package', 'Study notes for every sub-topic', examOf(state.params.cls).section + ' questions with a marking guide', 'Word download, ready to print']).map((x) => h('li', { text: x }))),
      h('div', { class: 'pw-actions' }, btn, sub));
  }
  /* First visit: ask once whether GuidEd is for a parent or a teacher. The answer is remembered on this device; /parents and
     /teachers (or ?for=parent|teacher) answer it from a link. A parent goes straight to the sign-up form with Parent selected. */
  const AUD_KEY = 'guided.audience';
  const getAudience = () => { try { const a = localStorage.getItem(AUD_KEY); return a === 'parent' || a === 'teacher' ? a : ''; } catch (e) { return ''; } };
  function setAudience(a) { try { localStorage.setItem(AUD_KEY, a); } catch (e) { /* storage blocked */ } }
  function chooseAudience(a, fromLink) {
    setAudience(a);
    const dlg = $('#audSheet'); if (dlg && dlg.open) dlg.close();
    if (signedIn()) return;
    if (a === 'parent') { openSignupSheet(); window.dispatchEvent(new CustomEvent('guided:preselect-role', { detail: 'parent' })); }
    else if (a === 'teacher' && fromLink) { /* the planner is already on screen */ }
  }
  function readAudienceLink() {
    let a = '';
    try {
      const q = new URLSearchParams(location.search).get('for');
      a = q === 'parent' || q === 'teacher' ? q : /^\/parents\/?$/.test(location.pathname) ? 'parent' : /^\/teachers\/?$/.test(location.pathname) ? 'teacher' : '';
      if (a && (q || /^\/(parents|teachers)\/?$/.test(location.pathname))) { const u = new URL(location.href); u.searchParams.delete('for'); history.replaceState(null, '', '/' + (u.search || '') + u.hash); }
    } catch (e) { /* ignore */ }
    return a;
  }
  function maybeAskAudience() {
    const P = window.PadiSync;
    if (!P || !P.authConfigured() || signedIn()) return;
    const fromLink = readAudienceLink();
    if (fromLink) { chooseAudience(fromLink, true); return; }
    let skipped = false; try { skipped = sessionStorage.getItem('guided.audienceSkip') === '1'; } catch (e) { /* ignore */ }
    if (getAudience() || skipped) return;
    if (document.querySelector('dialog[open]') || /[?&](reference|trxref)=/.test(location.search)) return;
    const dlg = $('#audSheet'); if (dlg && !dlg.open) dlg.showModal();
  }
  document.addEventListener('click', (e) => {
    const card = e.target.closest && e.target.closest('[data-aud]'); if (card) { chooseAudience(card.dataset.aud, false); return; }
    if (e.target.closest && (e.target.closest('#audSkip') || e.target.closest('#audClose'))) {
      try { sessionStorage.setItem('guided.audienceSkip', '1'); } catch (err) { /* ignore */ }
      const dlg = $('#audSheet'); if (dlg && dlg.open) dlg.close();
    }
  });
  function openSignupSheet(msg) {
    if (!window.PadiSync || !window.PadiSync.authConfigured()) { toast(msg || 'Sign-in is not available here.'); return; }
    openSheet('signup');
    if (msg) showBanner(msg, { ok: true });
  }
  // Writes the full version of a plan that was only previewed.
  function unlockFull(s) {
    if (state.streaming || !s || !s.params) return;
    state.params = Object.assign({}, state.params, { subject: s.params.subject, cls: s.params.cls, week: s.params.week, size: s.params.size || state.params.size, hook: s.params.hook !== false, light: s.params.light === true, studyNotes: true, bece: true, inc: s.params.inc, also: [] });
    syncPills(); syncAlso();
    const fresh = makeSession();
    state.sessions.unshift(fresh);
    promptEl.value = '';
    showSession(fresh.id);
    setStudioCollapsed(true);
    submit();
  }
  if (window.GuidedPlans) {
    window.GuidedPlans.configure({
      toast: (t) => toast(t), signedIn: () => signedIn(), authHeader: () => (window.PadiSync ? window.PadiSync.authHeader() : Promise.resolve({})),
      openSignup: openSignupSheet,
    });
    window.GuidedPlans.captureReturn();
    window.GuidedPlans.onChange(() => {
      syncAlso(); updateView();
      document.querySelectorAll('.pw-main').forEach((b) => { const guest = !signedIn(); b.textContent = guest ? 'Create free account' : 'Write the full plan'; });
    });
  }
  const refreshPlans = () => { const G = window.GuidedPlans; if (G && !state.config.demo) G.load().then(() => G.resume()); };

  function askFor(kind, cls) {
    if (state.streaming) return;
    promptEl.value = askText(kind, cls || state.params.cls);
    submit();
  }

  // Copy the whole plan (every document in it) into a new plan the teacher can change freely.
  function reuseSession() {
    const s = current();
    if (!s || state.streaming || !s.messages.length) return;
    const c = makeSession();
    c.params = Object.assign({}, s.params);
    c.title = s.title;
    c.copy = true;
    c.messages = s.messages.map((m) => Object.assign({}, m));
    state.sessions.unshift(c);
    showSession(c.id);
    store.save();
    toast('Copied to a new plan. Change anything you like.');
  }

  /* Auto-follow while a plan is writing, but never fight the reader: the moment they scroll up (wheel, touch, keys or the
     scroll bar) following stops, their place is held while new text arrives, and a "Jump to latest" button appears. */
  let touching = false;
  const jumpBtn = $('#jumpLatest');
  function nearBottom() { return messagesWrap.scrollHeight - messagesWrap.scrollTop - messagesWrap.clientHeight < 140; }
  function scrollBottom(force, behavior) {
    if (!force && (!state.stick || touching)) return;
    const top = messagesWrap.scrollHeight;
    // Smoothly follow new content without taking control away from a reader
    // who has deliberately scrolled up through the transcript.
    if (typeof messagesWrap.scrollTo === 'function') {
      messagesWrap.scrollTo({ top, behavior: behavior || 'smooth' });
    } else {
      messagesWrap.scrollTop = top;
    }
  }
  function syncJump() { if (jumpBtn) jumpBtn.hidden = !(state.streaming && !state.stick); }
  const letGo = () => { state.stick = false; syncJump(); };
  messagesWrap.addEventListener('wheel', (e) => { if (e.deltaY < 0) letGo(); }, { passive: true });
  messagesWrap.addEventListener('touchstart', () => { touching = true; }, { passive: true });
  messagesWrap.addEventListener('touchmove', () => { if (!nearBottom()) letGo(); }, { passive: true });
  messagesWrap.addEventListener('touchend', () => { touching = false; state.stick = nearBottom(); syncJump(); }, { passive: true });
  messagesWrap.addEventListener('touchcancel', () => { touching = false; }, { passive: true });
  messagesWrap.addEventListener('keydown', (e) => { if (['ArrowUp', 'PageUp', 'Home'].includes(e.key)) letGo(); });
  messagesWrap.addEventListener('scroll', () => { if (nearBottom()) state.stick = true; else if (touching) state.stick = false; syncJump(); }, { passive: true });
  if (jumpBtn) jumpBtn.addEventListener('click', () => { state.stick = true; scrollBottom(true, 'smooth'); syncJump(); });

  /* ───────── Export ───────── */
  const hintProfile = () => { const p = profile(); return p.teacher || p.school ? '' : '. Tip: add your name and school in the menu to print them on every file.'; };
  let docxLoading = null;
  function loadDocxLib() {
    if (window.docx && window.SchoolPadiDocx) return Promise.resolve();
    if (!docxLoading) docxLoading = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = 'vendor/docx.iife.js';
      s.onload = () => (window.docx && window.SchoolPadiDocx ? ok() : no(new Error('docx missing')));
      s.onerror = () => { docxLoading = null; no(new Error('docx failed to load')); };
      document.head.append(s);
    });
    return docxLoading;
  }
  let pdfLoading = null;
  function loadScript(src) {
    return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Could not load ' + src)); document.head.append(s); });
  }
  function loadPdfLib() {                                  // about 1 MB, fetched the first time a PDF is made, then kept by the browser
    if (window.pdfMake && window.pdfMake.vfs && window.SchoolPadiPdf) return Promise.resolve();
    if (!pdfLoading) pdfLoading = loadScript('vendor/pdfmake.min.js').then(() => loadScript('vendor/pdfmake-fonts.js')).then(() => {
      if (!(window.pdfMake && window.SchoolPadiPdf)) throw new Error('pdf missing');
      if (!window.pdfMake.vfs && typeof vfs !== 'undefined') window.pdfMake.vfs = vfs;
    }).catch((e) => { pdfLoading = null; throw e; });
    return pdfLoading;
  }
  const fileStem = (title) => title.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  async function makePdf(title, body, layout) {
    await loadPdfLib();
    const who = profile(), GP = window.GuidedPlans;
    return window.SchoolPadiPdf.toBlob(window.pdfMake, title, body, { portrait: layout === 'portrait', teacher: who.teacher, school: who.school, footer: GP ? GP.footerText() : '' });
  }
  function saveBlob(blob, title, ext) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: fileStem(title) + '.' + (ext || 'docx') });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  /* Share: only the lesson plan tables, then a signature and stamp area. The objectives lines, study or teacher's notes, exam practice and follow-up chips stay out. */
  function planTables(md) {
    const out = []; let keep = false, inTable = false;
    String(md || '').replace(/\r/g, '').split('\n').forEach((line) => {
      const hd = /^(#{1,2})\s+(.*)$/.exec(line);
      if (hd) {
        const t = hd[2].trim().toLowerCase();
        keep = /^lesson metadata/.test(t) || /^lesson\s*\d/.test(t);
        inTable = false;
        if (keep) { if (out.length) out.push(''); out.push(line.trim()); out.push(''); }
        return;
      }
      if (!keep) return;
      if (/^\s*\|/.test(line)) { out.push(line.trim()); inTable = true; }
      else if (inTable) { out.push(''); inTable = false; }
    });
    const body = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return body ? body + '\n\n' + SIGN_OFF : '';
  }
  /* Shared and term-pack documents end with a sign-off area (the assessment rubric stays in the app and the full download). */
  const SIGN_OFF = ['## Approval', '',
    '| Class Teacher | Head Teacher / Supervisor | School Stamp |', '|---|---|---|',
    '| Name: ______________________<br>Signature: ________________<br>Date: ____________________ | Name: ______________________<br>Signature: ________________<br>Date: ____________________ | <br><br><br><br><br> |'].join('\n');
  function sharePlan(text, baseTitle, btn) { return shareBody(planTables(splitElic(text).body), baseTitle + ' – lesson plan', btn); }
  /* Ask how to share: PDF opens anywhere (WhatsApp, email, print); Word can be edited. Resolves to 'pdf', 'docx' or '' when closed. */
  function askShareFormat() {
    const dlg = $('#shareSheet');
    if (!dlg || !dlg.showModal) return Promise.resolve('docx');
    return new Promise((done) => {
      let pick = '';
      const fin = () => { dlg.removeEventListener('close', fin); done(pick); };
      dlg.addEventListener('close', fin);
      dlg.querySelectorAll('[data-fmt]').forEach((b) => { b.onclick = () => { pick = b.dataset.fmt; dlg.close(); }; });
      $('#shClose').onclick = () => dlg.close();
      dlg.showModal();
    });
  }
  async function makeFile(fmt, title, body) {
    if (fmt === 'pdf') return makePdf(title, body, 'landscape');
    await loadDocxLib();
    const who = profile(), GP = window.GuidedPlans;
    return window.SchoolPadiDocx.toFile(window.docx, title, body, { portrait: false, teacher: who.teacher, school: who.school, footer: GP ? GP.footerText() : '' });
  }
  async function downloadBody(body, title, fmt) {
    if (!/\|/.test(body)) { toast('There are no lesson plan tables to download yet.'); return; }
    toast('Preparing ' + (fmt === 'pdf' ? 'PDF' : 'Word file') + '…');
    try { saveBlob(await makeFile(fmt, title, body), title, fmt === 'pdf' ? 'pdf' : 'docx'); toast('Downloaded ' + fileStem(title) + '.' + (fmt === 'pdf' ? 'pdf' : 'docx')); }
    catch (e) { toast(navigator.onLine === false ? 'The PDF tools need a connection the first time. Try again when you are online.' : 'Could not make the file. Please try again.'); }
  }
  async function shareBody(body, title, btn, fmt) {
    if (!/\|/.test(body)) { toast('There is no lesson plan table to share yet.'); return; }
    if (!window.SchoolPadiArtifact && !fmt) { fmt = await askShareFormat(); if (!fmt) return; }
    const label = btn ? $('span', btn) : null, before = label ? label.textContent : '';
    if (btn) { btn.disabled = true; label.textContent = 'Preparing…'; }
    try {
      if (window.SchoolPadiArtifact) { const name = await window.SchoolPadiArtifact.save(title, body, 'landscape', profile()); toast('Saved ' + name); return; }
      const isPdf = fmt === 'pdf';
      const blob = await makeFile(fmt, title, body);
      const ext = isPdf ? 'pdf' : 'docx', name = fileStem(title) + '.' + ext;
      const file = new File([blob], name, { type: isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title, text: title + ' (made with GuidEd)' }); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }          // closed the share sheet: nothing more to do; any other error falls through to a download
      }
      saveBlob(blob, title, ext);
      toast('Saved ' + name + '. Attach it to a message to share it.');
    } catch (e) {
      toast(e.message || 'Could not prepare the file.');
    } finally {
      if (btn) { btn.disabled = false; label.textContent = before; }
    }
  }
  async function exportPdf(text, title, btn, kind) {
    const layout = kind === 'worksheet' || kind === 'homework' ? 'portrait' : 'landscape';
    const GP = window.GuidedPlans;
    if (GP && GP.tier() === 'guest') { openSignupSheet('Create a free account to download PDF files.'); return; }
    const label = $('span', btn), before = label.textContent;
    btn.disabled = true; label.textContent = 'Preparing…';
    try {
      const blob = await makePdf(title, splitElic(text).body, layout);
      saveBlob(blob, title, 'pdf');
      toast('Downloaded ' + title + '.pdf' + hintProfile());
    } catch (e) {
      toast(navigator.onLine === false ? 'The PDF tools need a connection the first time. Try again when you are online.' : 'Could not make the PDF. Please try again.');
    } finally {
      btn.disabled = false; label.textContent = before;
    }
  }
  async function exportDocx(text, title, btn, kind) {
    const layout = kind === 'worksheet' || kind === 'homework' ? 'portrait' : 'landscape';
    const GP = window.GuidedPlans;
    if (GP && GP.tier() === 'guest') { openSignupSheet('Create a free account to download Word files.'); return; }
    const label = $('span', btn);
    const before = label.textContent;
    btn.disabled = true; label.textContent = 'Preparing…';
    try {
      if (window.SchoolPadiArtifact) {                    // hosted as an artifact: build the file in the browser
        const name = await window.SchoolPadiArtifact.save(title, splitElic(text).body, layout, profile());
        toast('Saved ' + name + hintProfile());
        return;
      }
      // Build the Word file right here in the browser (no server round trip, works offline once loaded).
      try {
        await loadDocxLib();
        const who = profile();
        const blob = await window.SchoolPadiDocx.toFile(window.docx, title, splitElic(text).body, { portrait: layout === 'portrait', teacher: who.teacher, school: who.school, footer: GP ? GP.footerText() : '' });
        saveBlob(blob, title);
        toast('Downloaded ' + title + '.docx' + hintProfile());
        return;
      } catch (e) { /* fall back to the server below */ }
      const res = await fetch('/api/export-docx', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, layout, content: splitElic(text).body, teacher: profile().teacher || '', school: profile().school || '' }),
      });
      if (!res.ok) {
        let msg = 'Word export is not available here.';
        try { const j = await res.json(); if (j.message) msg = j.message; } catch (e) { /* not JSON */ }
        throw new Error(res.status === 404 ? 'Word export needs the deployed server. It is not available in this preview.' : msg);
      }
      saveBlob(await res.blob(), title);
      toast('Downloaded ' + title + '.docx' + hintProfile());
    } catch (e) {
      toast(e.message || 'Could not export.');
    } finally {
      btn.disabled = false; label.textContent = before;
    }
  }

  /* ───────── Generating ───────── */
  function threadOf(session) {
    return session.messages.slice(1).map((m) => ({ role: m.role, content: m.content }));
  }

  async function* apiStream(session, signal) {
    if (window.SchoolPadiArtifact) { yield* window.SchoolPadiArtifact.stream(session, signal); return; }
    const p = session.params;
    const fresh = state.fresh === true; state.fresh = false;        // Regenerate asks for a new answer, not the saved one
    const who = window.PadiSync && window.PadiSync.authHeader ? await window.PadiSync.authHeader() : {};
    const res = await fetch('/api/generate', {
      method: 'POST', signal,
      headers: Object.assign({ 'content-type': 'application/json', 'x-access-code': state.access || '' }, who),
      body: JSON.stringify({ params: { subject: p.subject, cls: p.cls, week: p.week, term: p.term || termNow(), hook: p.hook !== false, light: p.light === true, studyNotes: p.studyNotes !== false, bece: p.bece !== false, size: p.size || '', inc: incOf(p), mode: p.mode || 'full', resourceType: p.resourceType || 'Study notes', indicatorCodes: p.mode === 'resources' && p.resourceType === 'Study notes' ? (p.indicatorCodes || []) : undefined, notes: session.messages[0].content || '' }, thread: threadOf(session), fresh }),
    });
    if (!res.ok) {
      let j = {};
      try { j = await res.json(); } catch (e) { /* not JSON */ }
      const err = new Error(j.message || 'The request failed (' + res.status + ').');
      err.code = j.error || (res.status === 404 ? 'not_configured' : 'http_' + res.status);
      err.reason = j.reason;
      throw err;
    }
    state.lastPreview = res.headers.get('x-guided-preview') === '1';     // a guest's taster: Lesson 1 only
    if (!res.body || !res.body.getReader) { yield await res.text(); return; }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      yield dec.decode(value, { stream: true });
    }
  }

  async function* demoStream(session, signal) {
    const S = window.SchoolPadiSample;
    const isFollow = session.messages.length > 1;
    const text = isFollow ? S.followup(session.messages[session.messages.length - 1].content, session.params) : S.sample(session.params);
    await sleep(500, signal);
    for (let i = 0; i < text.length; i += 70) {
      yield text.slice(i, i + 70);
      await sleep(14, signal);
    }
  }

  function stopStreaming() { if (state.streaming) state.streaming.ctrl.abort(); }

  function updateSend() {
    const streaming = !!state.streaming;
    const s = current();
    const chat = !!(s && s.messages.length);
    sendBtn.disabled = !streaming && chat && !promptEl.value.trim();
    sendBtn.setAttribute('aria-label', streaming ? 'Stop writing' : chat ? 'Send request' : 'Generate lesson plan');
    $('use', sendBtn).setAttribute('href', streaming ? '#i-stop' : '#i-arrow-up');
  }

  /* Rate limit: at most RATE_MAX requests per RATE_WINDOW for this browser. Demo mode is not limited. */
  const RATE_WINDOW = 10 * 60 * 1000, RATE_KEY = 'schoolpadi.rate.v1';
  const rateMax = () => Math.max(1, Number(window.SCHOOLPADI_RATE_MAX) || 6);   // 6 per 10 minutes unless a page sets it
  let rateMem = [];
  function rateDelay() {                              // minutes until a request is allowed (0 when one is allowed now)
    if (state.config.demo) return 0;
    let hits = rateMem;
    try { hits = JSON.parse(localStorage.getItem(RATE_KEY)) || rateMem; } catch (e) { /* use memory */ }
    hits = hits.filter((t) => Date.now() - t < RATE_WINDOW);
    return hits.length >= rateMax() ? Math.max(1, Math.ceil((RATE_WINDOW - (Date.now() - hits[0])) / 60000)) : 0;
  }
  function rateOk() {
    if (state.config.demo) return true;
    const now = Date.now();
    let hits = rateMem;
    try { hits = JSON.parse(localStorage.getItem(RATE_KEY)) || rateMem; } catch (e) { /* storage blocked: use memory */ }
    hits = hits.filter((t) => now - t < RATE_WINDOW);
    if (hits.length >= rateMax()) {
      const wait = Math.max(1, Math.ceil((RATE_WINDOW - (now - hits[0])) / 60000));
      toast('You can make ' + rateMax() + ' requests every 10 minutes. Try again in ' + wait + ' minute' + (wait === 1 ? '' : 's') + '.');
      return false;
    }
    hits.push(now); rateMem = hits;
    try { localStorage.setItem(RATE_KEY, JSON.stringify(hits)); } catch (e) { /* ignore */ }
    return true;
  }

  function submit(fromQueue) {
    if (state.streaming) { if (termRun) termEnd(true); else { planQueue = []; stopStreaming(); } return; }
    const s = current();
    const text = promptEl.value.trim();
    if (!s) return;
    if (s.messages.length && !text) return;
    if (!s.messages.length) {                       // examination weeks have no plan
      const sc = schemeFor(state.params);
      if (sc && sc.type === 'exam') { toast('Week ' + sc.weeks.join(' and ') + ' is an examination week. Choose another week.'); return; }
    }
    if (!rateOk()) { if (termRun) termPaused('The request limit was reached.'); else planQueue = []; return; }

    if (!s.messages.length) {                       // new plan
      const p = Object.assign({}, state.params);
      delete p.also;
      p.term = p.term || termNow();
      p.mode = p.mode || 'full';
      p.resourceType = p.resourceType || 'Study notes';
      if (fromQueue !== true) {                     // "Also plan for": the other classes follow, one after another
        planQueue = [];
        const skipped = [];
        (state.params.also || []).filter((c) => CLASSES.includes(c) && c !== p.cls).forEach((c) => {
          const sc = schemeFor(Object.assign({}, p, { cls: c }));
          if (sc && sc.type === 'exam') skipped.push(c); else planQueue.push(Object.assign({}, p, { cls: c }));
        });
        state.params.also = []; syncAlso(); store.save();
        if (planQueue.length) toast('Writing ' + (planQueue.length + 1) + ' plans, one after another: ' + [p.cls].concat(planQueue.map((q) => q.cls)).join(', ') + '.');
        if (skipped.length) toast('Skipped ' + skipped.join(', ') + ': that week is an examination week.');
      }
      s.params = p;
      s.title = planTitle(p) + (p.mode === 'resources' ? ' – ' + resourceLabel(p.resourceType, p.cls) : p.mode === 'plan' ? ' – Lesson plan' : '');
      s.messages.push({ role: 'user', content: text });
    } else {                                        // follow-up
      if (!text) return;
      if (s.messages.some((m) => m.preview)) {       // a taster cannot be refined: it has to become a full plan first
        if (signedIn()) unlockFull(s); else openSignupSheet('Create a free account to unlock the full plan and ask for changes.');
        return;
      }
      s.messages.push({ role: 'user', content: text });
    }
    s.updatedAt = Date.now();
    promptEl.value = ''; autoGrow();
    messagesEl.append(userBubble(s.messages[s.messages.length - 1], s, s.messages.length - 1));
    state.stick = true;
    updateView(); updateTopbar(); renderSessions(); scrollBottom(true);
    store.save();
    runGenerate(s);
  }

  function regenerate() {
    const s = current();
    if (!s || state.streaming || !s.messages.length) return;
    if (s.messages[s.messages.length - 1].role !== 'assistant') return;
    if (!rateOk()) return;
    s.messages.pop();
    const last = state.bots.pop();
    if (last) last.root.remove();
    state.fresh = true;
    runGenerate(s);
  }

  // A chip is either "make another week" (starts a new plan) or a follow-up request in this plan.
  function onChip(text) {
    if (state.streaming) return;
    const s = current();
    const wk = text.match(/\bweek\s*(\d{1,2})\b/i);
    if (wk && /^(generate|create|plan|write)/i.test(text) && s && s.params) {
      const n = Math.min(Math.max(parseInt(wk[1], 10), 1), weeksFor(s.params.cls).length);
      state.params = { subject: s.params.subject, cls: s.params.cls, week: n, hook: s.params.hook !== false, size: s.params.size || state.params.size, light: s.params.light === true, studyNotes: s.params.studyNotes !== false, bece: s.params.bece !== false, inc: s.params.inc };
      syncPills();
      const fresh = makeSession();
      state.sessions.unshift(fresh);
      promptEl.value = '';
      showSession(fresh.id);
      submit();
      return;
    }
    promptEl.value = text;
    submit();
  }

  async function addStudyIllustrations(session, msg, bot) {
    const p = session && session.params || {};
    if (p.mode !== 'resources' || !/^study notes$/i.test(p.resourceType || '') || state.config.demo || msg.preview || msg.stopped) return;
    if (!signedIn()) { bot.note('Notes are ready. Sign in to search for classroom illustrations.'); return; }

    const body = String(msg.content || '');
    const finder = window.GuidEdIllustrationTargets;
    const targets = finder && typeof finder.extract === 'function' ? finder.extract(body, 8) : [];
    if (!targets.length) {
      bot.note('Notes are ready. No individually named examples were found to illustrate. Keep physical examples on separate, clearly labelled bullets for image matching.');
      return;
    }

    bot.note('Finding images for ' + targets.map((target) => target.concept).join(', ') + '…');
    let timeout;
    try {
      const who = window.PadiSync && window.PadiSync.authHeader ? await window.PadiSync.authHeader() : {};
      if (!who || !(who.authorization || who.Authorization)) { bot.note('Notes are ready. Sign in to search for classroom illustrations.'); return; }
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 18000);
      const context = [p.subject, p.cls].filter(Boolean).join(' ').slice(0, 80);
      const sch = p.scheme || {};
      const topic = [sch.substrand, sch.strand].concat(Array.isArray(sch.indicators) ? sch.indicators : [])
        .filter(Boolean).join('. ').replace(/\b(?:B[1-9]|SHS[1-3])(?:\.\d+){2,5}\b/gi, '').replace(/\s+/g, ' ').trim().slice(0, 300);
      const results = await Promise.all(targets.map(async (target) => {
        const query = target.concept.slice(0, 100);
        try {
          const response = await fetch('/api/media-search?q=' + encodeURIComponent(query) + '&context=' + encodeURIComponent(context)
            + (topic ? '&topic=' + encodeURIComponent(topic) : '') + '&type=image',
            { headers: Object.assign({ Accept: 'application/json' }, who), signal: controller.signal });
          if (!response.ok) return { target, unreachable: true };
          const data = await response.json();
          const item = (data.results || []).find((entry) => entry && /^https:\/\//i.test(entry.thumbnail || '') && /^https:\/\//i.test(entry.url || ''));
          return item ? { target, item } : { target, unreachable: !!data.unreachable };
        } catch (error) { return { target, unreachable: true }; }
      }));
      clearTimeout(timeout); timeout = null;
      const found = results.filter((result) => result && result.item);
      if (!found.length) {
        bot.note(results.length && results.every((result) => result && result.unreachable)
          ? 'Notes are ready. The image sources could not be reached just now. Try again in a few minutes.'
          : 'Notes are ready. No sufficiently relevant images were found for the named examples, so no unrelated pictures were added.');
        return;
      }

      const insertions = new Map();
      found.forEach(({ target, item }) => {
        const alt = String(target.concept || item.title || 'Classroom example').replace(/[\[\]]/g, '').slice(0, 100);
        const imageUrl = String(item.thumbnail).replace(/\)/g, '%29');
        const sourceUrl = String(item.url || '');
        const licence = String(item.license || 'See source page').replace(/[\r\n*_]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
        const author = String(item.author || '').replace(/[\r\n*_]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
        const caption = '*Image source: [View original image](' + sourceUrl + ') · Licence: '
          + licence + (author ? ' · Author: ' + author : '') + '.*';
        const block = ['![' + alt + '](' + imageUrl + ')', caption];
        if (!insertions.has(target.lineIndex)) insertions.set(target.lineIndex, []);
        insertions.get(target.lineIndex).push.apply(insertions.get(target.lineIndex), block);
      });
      const lines = body.split('\n');
      const enrichedLines = [];
      lines.forEach((line, index) => {
        enrichedLines.push(line);
        const blocks = insertions.get(index);
        if (blocks && blocks.length) enrichedLines.push('', ...blocks, '');
      });
      const enriched = enrichedLines.join('\n').replace(/\n{3,}/g, '\n\n');
      if (enriched === body) { bot.note('Notes are ready. Illustrations could not be placed beside their matching examples.'); return; }
      msg.content = enriched;
      bot.set(enriched, true, msg);
      bot.note('Added ' + found.length + ' relevant illustration' + (found.length === 1 ? '' : 's') + ' beside the named examples. Check each source and licence.');
      session.updatedAt = Date.now(); store.save();
    } catch (error) {
      if (timeout) clearTimeout(timeout);
      bot.note('Notes are ready. Illustration search was unavailable, so no images were added.');
    }
  }
  async function runGenerate(session) {
    const ctrl = new AbortController();
    const bot = makeBot(session);
    const lastUser = session.messages[session.messages.length - 1];
    const kind = session.messages.length > 1 && lastUser && lastUser.role === 'user' ? kindOfAsk(lastUser.content) : 'plan';
    bot.setKind(kind);
    messagesEl.append(bot.root);
    state.bots.forEach((b) => b.demote());
    state.bots.push(bot);
    state.streaming = { sessionId: session.id, ctrl };
    state.stick = true; syncJump();
    updateSend(); renderSessions(); updateTopbar(); scrollBottom(true);

    const t0 = performance.now();
    let text = '';
    let err = null;
    let raf = 0, paintTimer = 0, lastPaint = 0;
    const paint = () => {
      raf = 0;
      lastPaint = performance.now();
      const keep = messagesWrap.scrollTop, hold = !state.stick;
      bot.set(text, false);
      if (hold) messagesWrap.scrollTop = keep; else scrollBottom(false, 'smooth'); // smoothly follow generated content
    };
    // Rendering the entire growing lesson on every animation frame becomes expensive
    // for long two-lesson plans. Cap intermediate DOM paints at roughly 8 per second;
    // the completed response is still rendered immediately below.
    const schedulePaint = () => {
      if (raf || paintTimer) return;
      const wait = Math.max(0, 120 - (performance.now() - lastPaint));
      if (wait) paintTimer = setTimeout(() => { paintTimer = 0; raf = requestAnimationFrame(paint); }, wait);
      else raf = requestAnimationFrame(paint);
    };

    try {
      const source = state.config.demo ? demoStream(session, ctrl.signal) : apiStream(session, ctrl.signal);
      for await (const piece of source) {
        text += piece;
        schedulePaint();
      }
    } catch (e) {
      if (e.name !== 'AbortError') err = e;
    }
    if (paintTimer) clearTimeout(paintTimer);
    if (raf) cancelAnimationFrame(raf);
    state.streaming = null; syncJump();
    const previewFlag = state.lastPreview === true; state.lastPreview = false;

    // The server is not set up with a key: fall back to the sample and carry on.
    if (err && err.code === 'not_configured' && !text) {
      state.config.demo = true;
      bot.root.remove(); state.bots.pop();
      updateView();
      return runGenerate(session);
    }

    const aborted = ctrl.signal.aborted;
    let warning = '';
    const at = text.indexOf(ERR_MARK);
    if (at !== -1) { warning = text.slice(at + ERR_MARK.length).trim(); text = text.slice(0, at).trimEnd(); }

    if (err && !text.trim()) {
      const isFirst = session.messages.length === 1;
      const GP = window.GuidedPlans;
      if (GP && err.code === 'limit') GP.openUpgrade(err.reason, err.message);
      else if (err.code === 'guest_limit' || err.code === 'account') openSignupSheet(err.message);
      if (err.code === 'access') {
        state.config.accessRequired = true; showAccess(true); accessInput.focus();
      }
      if (!isFirst) {                                 // give the follow-up text back to the composer
        const last = session.messages.pop();
        const bubbles = messagesEl.querySelectorAll('.msg.user');
        if (bubbles.length) bubbles[bubbles.length - 1].remove();
        promptEl.value = last.content; autoGrow(); setComposer(false, true);
      }
      bot.error(err.message, isFirst ? () => { bot.root.remove(); state.bots.pop(); runGenerate(session); } : null);
      session.updatedAt = Date.now();
      updateSend(); renderSessions(); updateTopbar(); store.save();
      if (termRun && isFirst) { deleteSession(session.id); termPaused(err.message); }   // the failed week goes back in the queue; Resume tries it again
      return;
    }

    if (!text.trim() && !warning) {                   // stopped before anything arrived
      bot.root.remove(); state.bots.pop();
      if (session.messages.length > 1) {
        const last = session.messages.pop();
        const bubbles = messagesEl.querySelectorAll('.msg.user');
        if (bubbles.length) bubbles[bubbles.length - 1].remove();
        promptEl.value = last.content; autoGrow(); setComposer(false, true);
      }
      updateSend(); renderSessions(); updateTopbar(); updateView(); store.save();
      return;
    }

    if (kind === 'plan') text = fillWeekEnding(text, session.params);
    const msg = { role: 'assistant', kind, content: text, seconds: (performance.now() - t0) / 1000, stopped: aborted, demo: state.config.demo, warning };
    if (previewFlag) msg.preview = true;
    if (!text.trim()) { bot.error(warning || 'The model returned nothing. Please try again.', () => { bot.root.remove(); state.bots.pop(); runGenerate(session); }); updateSend(); renderSessions(); updateTopbar(); return; }
    session.messages.push(msg);
    session.updatedAt = Date.now();
    if (window.GuidedProfile && session.messages.length === 2 && session.params && !aborted) {
      const sp = session.params, same = sp.cls === state.params.cls && sp.subject === state.params.subject;
      window.GuidedProfile.planned({ cls: sp.cls, subject: sp.subject, term: sp.term || termNow(), week: sp.week });
      if (same && state.params.week === sp.week && !planQueue.length) { continueWeek(true); syncPills(); }   // the week pill moves on to the next one
    }
    bot.set(text, true, msg);
    if (!aborted && !warning) addStudyIllustrations(session, msg, bot);
    updateSend(); renderSessions(); updateTopbar(); updateView(); store.save();
    scrollBottom();
    if (window.GuidedPlans && !state.config.demo) window.GuidedPlans.load();       // refresh "plans left"
    if (termRun && session.messages.length === 2 && !aborted) {
      termRun.done++; termRun.ids.push(session.id); termRun.current = null;
      if (planQueue.length) { termProgress(); setTimeout(nextInQueue, 700); } else termEnd(false);
    } else if (aborted) planQueue = []; else if (planQueue.length && session.messages.length === 2) setTimeout(nextInQueue, 700);
  }

  /* ───────── Plan the whole term ───────── */
  let termRun = null;                                  // { cls, subject, term, total, done, ids, current, paused, timer }
  const termBar = $('#termBar');
  function termWeeks() {                               // the weeks still to write, from the chosen week to week 13; examination weeks and weeks already planned are skipped
    const p = state.params, term = termNow(), S = window.SchoolPadiSchemes;
    const have = new Set(state.sessions.filter((x) => x.params && x.params.cls === p.cls && x.params.subject === p.subject && (x.params.term || term) === term && x.messages.length >= 2 && !(x.messages[1] && x.messages[1].preview)).map((x) => x.params.week));
    const out = [];
    for (let w = Math.max(1, p.week); w <= 13; w++) {
      const e = S && S.lookup(p.subject, p.cls, term, w);
      if (e && e.type !== 'exam' && !have.has(w)) out.push(w);
    }
    return out;
  }
  function termBarShow(text, buttons) {
    termBar.replaceChildren(h('span', { text }), ...(buttons || []).map(([label, fn, main]) => h('button', { type: 'button', class: main ? 'pa-yes' : 'pa-no', text: label, onclick: fn })));
    termBar.hidden = !text;
  }
  function termProgress() {
    const r = termRun; if (!r) { termBarShow(''); return; }
    if (r.paused) { termBarShow('Term plan paused: ' + r.done + ' of ' + r.total + ' written. ' + r.paused, [['Resume', termResume, true], ['Stop', () => termEnd(true)]]); return; }
    termBarShow('Writing the term plan: ' + r.done + ' of ' + r.total + ' ready. Keep this page open.', [['Stop', () => termEnd(true)]]);
  }
  function termEnd(stopped) {
    const r = termRun; termRun = null; planQueue = [];
    if (r && r.timer) clearTimeout(r.timer);
    if (stopped && state.streaming) stopStreaming();
    if (r && !stopped && r.done) {
      termBarShow('All ' + r.done + ' plans are ready: ' + r.subject + ', ' + r.cls + ', ' + termWord(r.cls) + ' ' + r.term + '.', termPackButtons(r));
    } else if (r && stopped && r.done) {
      termBarShow(r.done + ' of ' + r.total + ' plans were written before you stopped.', termPackButtons(r));
    } else termBarShow('');
  }
  function termPaused(reason) {
    if (!termRun) return;
    if (termRun.current) planQueue.unshift(termRun.current);
    termRun.current = null; termRun.paused = reason || 'Something went wrong.';
    termProgress();
  }
  function termResume() { if (!termRun) return; termRun.paused = ''; termProgress(); nextInQueue(); }
  /* One file with every written week of a term: the lesson tables of each plan with its signature and stamp area, in week order. Works from the saved plans, so it also serves a term planned earlier. */
  function termPackBody(r) {
    const term = r.term;
    return state.sessions.filter((x) => x.params && x.params.cls === r.cls && x.params.subject === r.subject && x.params.mode !== 'resources' && (x.params.term || term) === term && x.messages.length >= 2 && x.messages[1] && !x.messages[1].preview)
      .sort((a, b) => a.params.week - b.params.week).map((x) => planTables(splitElic(x.messages[1].content).body)).filter(Boolean).join('\n\n');
  }
  const termPackTitle = (r) => r.subject + ' – ' + r.cls + ' – ' + termWord(r.cls) + ' ' + r.term + ' lesson plans';
  function termPackButtons(r) {
    return [['Download PDF', () => downloadBody(termPackBody(r), termPackTitle(r), 'pdf'), true], ['Word', () => downloadBody(termPackBody(r), termPackTitle(r), 'docx')], ['Share', () => shareBody(termPackBody(r), termPackTitle(r), null)], ['Close', () => termBarShow('')]];
  }
  function startTermRun() {
    const GP = window.GuidedPlans, tier = GP && GP.tier();
    if (state.streaming || termRun) { toast('Wait for the current plan to finish.'); return; }
    if (tier === 'guest') { openSignupSheet('Create an account to plan a whole term.'); return; }
    if (tier === 'free') { GP.openUpgrade('', 'Planning a whole term in one go is part of GuidEd Pro.'); return; }
    const p = state.params, term = termNow();
    if (!(window.SchoolPadiSchemes && window.SchoolPadiSchemes.has(p.subject, p.cls, term))) { toast('Term planning needs a scheme of learning for ' + p.subject + ', ' + p.cls + ', ' + termWord(p.cls) + ' ' + term + ', and none is loaded yet.'); return; }
    const weeks = termWeeks();
    if (!weeks.length) {
      const r = { cls: p.cls, subject: p.subject, term };
      if (termPackBody(r)) { termBarShow('Every week from Week ' + p.week + ' is already planned. Get the whole term as one file:', termPackButtons(r)); setNav(false); return; }
      toast('Every week from Week ' + p.week + ' is already planned. Pick an earlier week to fill gaps.'); return;
    }
    const dlg = $('#termSheet');
    $('#tsText').textContent = p.subject + ' · ' + p.cls + ' · ' + termWord(p.cls) + ' ' + term + '. GuidEd will write ' + (weeks.length === 1 ? 'Week ' + weeks[0] : 'Weeks ' + weeks[0] + ' to ' + weeks[weeks.length - 1] + ' (' + weeks.length + ' plans)') + ', one after another. Weeks you have already planned are skipped.';
    $('#tsTime').textContent = 'This takes about ' + Math.max(2, Math.round(weeks.length * 1.5)) + ' minutes. Keep this page open; GuidEd pauses by itself if it needs to wait and lets you resume.';
    $('#tsGo').onclick = () => {
      dlg.close();
      termRun = { cls: p.cls, subject: p.subject, term, total: weeks.length, done: 0, ids: [], current: null, paused: '' };
      planQueue = weeks.map((w) => ({ cls: p.cls, subject: p.subject, week: w, term }));
      termProgress(); nextInQueue();
    };
    dlg.showModal();
  }
  $('#termBtn').addEventListener('click', startTermRun);
  $('#tsCancel').addEventListener('click', () => $('#termSheet').close());
  $('#tsClose').addEventListener('click', () => $('#termSheet').close());

  function nextInQueue() {
    if (state.streaming || !planQueue.length) return;
    if (termRun) {                                     // stay inside the request limit by waiting, not failing
      const wait = rateDelay();
      if (wait) { termRun.paused = ''; termBarShow('Waiting ' + wait + ' minute' + (wait === 1 ? '' : 's') + ' to stay within the limit. ' + termRun.done + ' of ' + termRun.total + ' ready.', [['Stop', () => termEnd(true)]]); clearTimeout(termRun.timer); termRun.timer = setTimeout(() => { if (termRun) { termProgress(); nextInQueue(); } }, wait * 60000 + 500); return; }
    }
    const p = planQueue.shift();
    if (termRun) termRun.current = p;
    state.params = Object.assign({}, state.params, p, { also: [] });
    syncPills(); syncAlso();
    const fresh = makeSession();
    state.sessions.unshift(fresh);
    promptEl.value = '';
    showSession(fresh.id);
    toast(termRun ? 'Now writing Week ' + p.week + ' (' + (termRun.done + 1) + ' of ' + termRun.total + ')' : 'Now writing ' + p.cls + (planQueue.length ? ' (' + planQueue.length + ' more after this)' : ''));
    submit(true);
  }

  /* ───────── Composer ───────── */
  /* Collapse the composer so a plan can be read and edited with the whole screen. */
  const zone = $('.composer-zone'), composerToggle = $('#composerToggle');
  let autoCollapsed = false;
  function setComposer(collapsed, auto) {
    zone.classList.toggle('is-collapsed', collapsed);
    composerToggle.setAttribute('aria-expanded', String(!collapsed));
    $('span', composerToggle).textContent = collapsed ? 'Ask for a change' : 'Collapse';
    autoCollapsed = !!(collapsed && auto);
    if (collapsed && auto) {   // once a plan is on screen, fold the Studio too so the plan keeps the room
      const st = document.querySelector('.teaching-studio'), tg = document.querySelector('#studioCollapseToggle');
      if (st && tg) { st.classList.add('is-collapsed'); tg.setAttribute('aria-expanded', 'false'); }
    }
    if (!collapsed && !auto && !coarse) promptEl.focus();
  }
  composerToggle.addEventListener('click', () => setComposer(!zone.classList.contains('is-collapsed'), false));

  function autoGrow() {
    promptEl.style.height = 'auto';
    promptEl.style.height = Math.min(promptEl.scrollHeight, 200) + 'px';
  }

  promptEl.addEventListener('input', () => { autoGrow(); updateSend(); });
  promptEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !coarse) {
      e.preventDefault();
      if (!state.streaming && !sendBtn.disabled) submit();
    }
  });
  composer.addEventListener('submit', (e) => { e.preventDefault(); if (!sendBtn.disabled || state.streaming) submit(); });

  // Teaching Studio keeps all three tools in one workspace and reuses the selected curriculum context.
  const studioRoot = $('.teaching-studio'), studioCollapseToggle = $('#studioCollapseToggle');
  function setStudioCollapsed(collapsed) {
    if (!studioRoot || !studioCollapseToggle) return;
    studioRoot.classList.toggle('is-collapsed', !!collapsed);
    studioCollapseToggle.setAttribute('aria-expanded', String(!collapsed));
  }
  if (studioCollapseToggle) studioCollapseToggle.addEventListener('click', () => {
    setStudioCollapsed(!studioRoot.classList.contains('is-collapsed'));
  });
  const planAction = $('#planAction'), resourceAction = $('#resourceAction'), resourceTypeEl = $('#resourceType');
  const studyNotesCurriculum = $('#studyNotesCurriculum'), studyIndicatorMeta = $('#studyIndicatorMeta');
  const studyIndicatorOptions = $('#studyIndicatorOptions'), studyCurriculumSource = $('#studyCurriculumSource');
  const studyIndicatorToolbar = $('#studyIndicatorToolbar'), studyIndicatorCount = $('#studyIndicatorCount'), studyIndicatorReset = $('#studyIndicatorReset');
  let studyCurriculumRequest = 0, studyCurriculumKey = '', studyCurriculumPendingKey = '', studyCurriculumLoading = false;
  const mediaForm = $('#mediaSearchForm'), mediaQuery = $('#mediaQuery');
  const mediaStatus = $('#mediaStatus'), mediaResults = $('#mediaResults');
  const mediaIndicatorText = $('#mediaIndicatorText'), mediaIndicatorPicker = $('#mediaIndicatorPicker');
  const mediaIndicatorPickerWrap = $('#mediaIndicatorPickerWrap'), mediaCurriculumMeta = $('#mediaCurriculumMeta');
  let mediaType = 'image', mediaIndicator = '', mediaContext = null;
  function updateStudyIndicatorCount() {
    if (!studyIndicatorOptions || !studyIndicatorToolbar || !studyIndicatorCount) return;
    const checkboxes = studyIndicatorOptions.querySelectorAll('input[type="checkbox"]');
    const selected = studyIndicatorOptions.querySelectorAll('input[type="checkbox"]:checked').length;
    studyIndicatorToolbar.hidden = !checkboxes.length;
    studyIndicatorCount.textContent = selected + ' selected · maximum 10';
  }
  if (studyIndicatorReset) studyIndicatorReset.addEventListener('click', () => {
    const checkboxes = [...studyIndicatorOptions.querySelectorAll('input[type="checkbox"]')];
    checkboxes.forEach((input, index) => { input.checked = index < 10; });
    state.params.indicatorCodes = checkboxes.filter((input) => input.checked).map((input) => input.value);
    state.params.indicatorContextKey = studyCurriculumKey;
    updateStudyIndicatorCount();
    store.save(true);
  });
  function startIndependentTool(mode, resourceType) {
    if (state.streaming) { toast('Wait for the current generation to finish.'); return; }
    const active = current();
    const topic = promptEl.value.trim() || (active && active.messages[0] && active.messages[0].content) || '';
    state.params.mode = mode;
    state.params.resourceType = resourceType || 'Study notes';
    if (mode === 'resources' && state.params.resourceType === 'Study notes') {
      const checkboxes = [...studyIndicatorOptions.querySelectorAll('input[type="checkbox"]')];
      const checked = checkboxes.filter((input) => input.checked).map((input) => input.value).filter(Boolean);
      if (checked.length > 10) { toast('Choose no more than 10 curriculum indicators for the study notes.'); state.params.mode = 'full'; return; }
      if (checkboxes.length && !checked.length) { toast('Select at least one curriculum indicator for the study notes.'); state.params.mode = 'full'; return; }
      // While indicators are loading, or when no coded indicators exist, use no stale selection.
      state.params.indicatorCodes = checked;
    }
    const fresh = makeSession();
    state.sessions.unshift(fresh);
    promptEl.value = topic;
    showSession(fresh.id);
    try { submit(); } finally { state.params.mode = 'full'; state.params.resourceType = 'Study notes'; }   // the tool choice belongs to this run only; Send goes back to full plans
  }
  if (planAction) planAction.addEventListener('click', () => startIndependentTool('plan'));
  if (resourceAction) resourceAction.addEventListener('click', () => startIndependentTool('resources', resourceTypeEl.value));
  function renderStudyIndicators(data, key) {
    const indicators = Array.isArray(data.indicators) ? data.indicators : [];
    const selectable = indicators.filter((item) => item && item.code);
    const unselectable = indicators.filter((item) => item && !item.code);
    const previous = Array.isArray(state.params.indicatorCodes) ? state.params.indicatorCodes : [];
    const sameContext = state.params.indicatorContextKey === key;
    const validPrevious = sameContext ? previous.filter((code) => selectable.some((item) => item.code === code)).slice(0, 10) : [];
    const selected = validPrevious.length ? validPrevious : selectable.slice(0, 10).map((item) => item.code);
    studyCurriculumKey = key;
    state.params.indicatorContextKey = key;
    state.params.indicatorCodes = selected;
    studyIndicatorMeta.textContent = [data.strand, data.substrand, data.contentStandard].filter(Boolean).join(' · ');
    const options = selectable.map((item) => {
      const input = h('input', { type: 'checkbox', value: item.code, checked: selected.includes(item.code) });
      input.addEventListener('change', () => {
        const checked = [...studyIndicatorOptions.querySelectorAll('input[type="checkbox"]:checked')].map((x) => x.value).filter(Boolean);
        if (checked.length > 10) {
          input.checked = false;
          toast('Choose no more than 10 curriculum indicators at a time.');
          return;
        }
        state.params.indicatorCodes = checked;
        state.params.indicatorContextKey = key;
        updateStudyIndicatorCount();
        store.save(true);
      });
      return h('label', { class: 'study-indicator-option' }, input,
        h('span', null, h('strong', { text: item.code }), h('span', { text: item.text || '' })));
    });
    const unscoped = unselectable.map((item) => h('div', { class: 'study-indicator-unscoped' },
      h('strong', { text: 'Indicator text without a code' }),
      h('span', { text: item.text || '' })));
    studyIndicatorOptions.replaceChildren(...options, ...unscoped);
    updateStudyIndicatorCount();
    const sourceNote = data.sourceStatus === 'scheme_metadata_only'
      ? 'Loaded from GuidEd scheme metadata. This is not a full NaCCA document retrieval.'
      : 'Curriculum details loaded.';
    if (!selectable.length) {
      studyCurriculumSource.textContent = indicators.length
        ? 'The scheme contains indicator text without usable codes. Exact indicator selection is unavailable; you can still generate general study notes.'
        : 'No coded indicators are loaded for this week. You can still generate general study notes from the scheme topic.';
    } else {
      studyCurriculumSource.textContent = sourceNote
        + (unselectable.length ? ' Some indicator text has no code and cannot be selected individually.' : '')
        + (selectable.length > 10 ? ' Choose up to 10 indicators per request.' : '');
    }
    studyNotesCurriculum.hidden = resourceTypeEl.value !== 'Study notes';
  }
  async function refreshStudyCurriculum() {
    if (!studyNotesCurriculum || resourceTypeEl.value !== 'Study notes') {
      studyCurriculumRequest++;
      studyCurriculumPendingKey = '';
      studyCurriculumLoading = false;
      if (studyNotesCurriculum) studyNotesCurriculum.hidden = true;
      return;
    }
    const p = state.params, selectedTerm = Number(p.term), term = termsFor(p.cls).includes(selectedTerm) ? selectedTerm : termNow();
    const key = [p.subject, p.cls, term, p.week].join('|');
    const savedContextKey = state.params.indicatorContextKey || studyCurriculumKey;
    if (savedContextKey !== key) {
      studyIndicatorOptions.replaceChildren();
      updateStudyIndicatorCount();
      state.params.indicatorCodes = [];
      state.params.indicatorContextKey = key;
      store.save(true);
    }
    if (studyCurriculumLoading && studyCurriculumPendingKey === key) return;
    const requestId = ++studyCurriculumRequest;
    const controller = new AbortController();
    studyCurriculumPendingKey = key;
    studyCurriculumLoading = true;
    studyNotesCurriculum.hidden = false;
    studyCurriculumSource.textContent = 'Loading curriculum indicators…';
    studyIndicatorMeta.textContent = '';
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const query = new URLSearchParams({ subject: p.subject, cls: p.cls, term: String(term), week: String(p.week) });
      const response = await fetch('/api/curriculum?' + query.toString(), {
        headers: { accept: 'application/json' }, signal: controller.signal
      });
      const data = await response.json();
      if (requestId !== studyCurriculumRequest) return;
      if (!response.ok) throw new Error(data.message || 'No curriculum indicators are available for this selection.');
      if (data.type !== 'teach') {
        studyIndicatorOptions.replaceChildren();
        updateStudyIndicatorCount();
        studyIndicatorMeta.textContent = data.type === 'revision' ? 'Revision week — no new indicators are assigned.' : 'Examination week — no new indicators are assigned.';
        studyCurriculumSource.textContent = 'Choose a teaching week to select specific indicators.';
        state.params.indicatorCodes = [];
        state.params.indicatorContextKey = key;
        studyCurriculumKey = key;
        store.save(true);
        return;
      }
      renderStudyIndicators(data, key);
      if (!data.indicators || !data.indicators.length) studyCurriculumSource.textContent = 'No coded indicators are loaded for this week. You can still generate general study notes from the scheme topic.';
    } catch (error) {
      if (requestId !== studyCurriculumRequest) return;
      studyIndicatorOptions.replaceChildren();
      updateStudyIndicatorCount();
      state.params.indicatorCodes = [];
      state.params.indicatorContextKey = key;
      studyCurriculumKey = key;
      store.save(true);
      studyIndicatorMeta.textContent = '';
      studyCurriculumSource.textContent = error.name === 'AbortError'
        ? 'Curriculum loading took too long. You can still generate general study notes; try changing the week to reload indicators.'
        : (error.message || 'Could not load curriculum indicators. You can still generate general study notes.');
    } finally {
      clearTimeout(timeout);
      if (requestId === studyCurriculumRequest) {
        studyCurriculumLoading = false;
        studyCurriculumPendingKey = '';
      }
    }
  }
  if (resourceTypeEl) resourceTypeEl.addEventListener('change', refreshStudyCurriculum);

  function setMediaType(type) {
    mediaType = type === 'video' ? 'video' : 'image';
    document.querySelectorAll('[data-media-type]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mediaType === type)));
    mediaResults.replaceChildren();
    mediaQuery.placeholder = type === 'video' ? 'Optional focus, e.g. keyboard input devices…' : 'Optional focus, e.g. labelled computer parts…';
    mediaStatus.textContent = 'Search using the selected curriculum indicator' + (type === 'video' ? ' to find educational videos.' : ' to find classroom images.');
  }
  async function searchMedia() {
    const refinement = mediaQuery.value.trim();
    const indicator = mediaIndicator.trim();
    const indicatorFocus = indicator.replace(/\b(?:B[1-9]|SHS[1-3])(?:\.\d+){2,5}\b/gi, '').trim();
    const focus = [refinement, indicatorFocus].filter(Boolean).join(' ');
    if (focus.length < 2) { mediaStatus.textContent = 'No curriculum indicator is loaded. Enter a specific teaching concept to search.'; mediaQuery.focus(); return; }
    const query = [focus, mediaContext && mediaContext.subject, mediaContext && mediaContext.cls, mediaType === 'video' ? 'educational tutorial demonstration' : 'educational labelled diagram illustration'].filter(Boolean).join(' ');
    mediaResults.replaceChildren();
    mediaStatus.textContent = 'Searching…';
    $('#mediaSearchBtn').disabled = true;
    try {
      const who = window.PadiSync && window.PadiSync.authHeader ? await window.PadiSync.authHeader() : {};
      if (!who || !who.authorization && !who.Authorization) { mediaStatus.textContent = 'Create a free account or sign in to search for images and videos.'; openSignupSheet('Create a free account to search for images and videos.'); return; }
      const response = await fetch('/api/media-search?q=' + encodeURIComponent(query) + (indicatorFocus ? '&topic=' + encodeURIComponent(indicatorFocus.slice(0, 300)) : '') + '&type=' + mediaType, { headers: Object.assign({ Accept: 'application/json' }, who) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Search failed.');
      if (mediaType === 'video' && data.searchUrl && !data.results.length) {
        mediaResults.append(h('a', { class: 'media-search-link', href: data.searchUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Open educational video results on YouTube'));
        mediaStatus.textContent = 'No video API key is configured, so you can browse the live YouTube results directly.';
        return;
      }
      if (!data.results.length) {
        mediaStatus.textContent = 'No results found. Try a shorter or different topic.';
        return;
      }
      data.results.forEach((item) => {
        const link = h('a', { class: 'media-result', href: item.url, target: '_blank', rel: 'noopener noreferrer' });
        if (item.thumbnail && /^https:\/\//.test(item.thumbnail)) link.append(h('img', { src: item.thumbnail, alt: '', loading: 'lazy' }));
        const info = h('span', { class: 'media-result-info' },
          h('strong', { text: item.title }),
          item.channel ? h('small', { text: item.channel }) : null,
          item.author ? h('small', { text: 'By ' + item.author }) : null,
          item.license ? h('small', { text: 'Licence: ' + item.license }) : null,
          item.description ? h('small', { text: item.description.slice(0, 180) }) : null);
        link.append(info);
        mediaResults.append(link);
      });
      if (mediaType === 'video' && data.searchUrl) mediaResults.append(h('a', { class: 'media-search-link', href: data.searchUrl, target: '_blank', rel: 'noopener noreferrer' }, 'See more results on YouTube'));
      mediaStatus.textContent = data.results.length + ' result' + (data.results.length === 1 ? '' : 's') + ' found. Check each source and licence before using it in class.';
    } catch (error) {
      mediaStatus.textContent = error.message || 'Could not search right now.';
    } finally { $('#mediaSearchBtn').disabled = false; }
  }
  function loadMediaContext() {
    const p = state.params, scheme = schemeFor(p);
    mediaContext = { subject: p.subject, cls: p.cls, strand: scheme && scheme.strand || '', substrand: scheme && scheme.substrand || '', standard: scheme && scheme.standard || '' };
    const indicators = scheme && Array.isArray(scheme.indicators) ? scheme.indicators.filter(Boolean) : [];
    mediaIndicator = indicators[0] || '';
    mediaIndicatorText.textContent = mediaIndicator || (scheme && scheme.focus) || 'No indicator is loaded for this selection.';
    mediaIndicatorPicker.replaceChildren(...indicators.map((item, index) => h('option', { value: String(index), text: item })));
    mediaIndicatorPickerWrap.hidden = indicators.length < 2;
    mediaCurriculumMeta.textContent = [p.subject, p.cls, termWord(p.cls) + ' ' + (p.term || termNow()), 'Week ' + p.week, mediaContext.strand, mediaContext.substrand].filter(Boolean).join(' · ');
    mediaQuery.value = '';
    mediaQuery.placeholder = mediaIndicator ? 'Add a detail to refine the search…' : 'Enter a topic or indicator to search…';
    mediaResults.replaceChildren();
    setMediaType('image');
  }
  function setStudioTab(tab, focus) {
    const allowed = ['plan', 'resources', 'media'];
    if (!allowed.includes(tab)) tab = 'plan';
    document.querySelectorAll('[data-studio-tab]').forEach((button) => {
      const active = button.dataset.studioTab === tab;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('[data-studio-panel]').forEach((panel) => { panel.hidden = panel.dataset.studioPanel !== tab; });
    document.body.dataset.studioTab = tab;   // lets the CSS drop the scheme strip where a tab already lists the indicators
    // Keep the media search, chosen indicator, and results intact when switching tabs.
    if (focus) $('#studioTab' + (tab === 'plan' ? 'Plan' : tab === 'resources' ? 'Resources' : 'Media')).focus();
  }
  document.querySelectorAll('[data-studio-tab]').forEach((button) => {
    button.addEventListener('click', () => setStudioTab(button.dataset.studioTab));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...document.querySelectorAll('[data-studio-tab]')];
      const i = tabs.indexOf(button);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      setStudioTab(tabs[next].dataset.studioTab, true);
    });
  });
  if (mediaForm) mediaForm.addEventListener('submit', (event) => { event.preventDefault(); searchMedia(); });
  if (mediaIndicatorPicker) mediaIndicatorPicker.addEventListener('change', () => {
    const scheme = schemeFor(state.params), indicators = scheme && Array.isArray(scheme.indicators) ? scheme.indicators : [];
    mediaIndicator = indicators[Number(mediaIndicatorPicker.value)] || '';
    mediaIndicatorText.textContent = mediaIndicator || 'No indicator selected.';
    mediaResults.replaceChildren();
    mediaStatus.textContent = 'Indicator updated. Search to find matching classroom media.';
  });
  document.querySelectorAll('[data-media-type]').forEach((button) => button.addEventListener('click', () => setMediaType(button.dataset.mediaType)));

  /* ───────── Dropdowns ───────── */
  const dropdowns = [];
  function closeMenus(except) { dropdowns.forEach((d) => { if (d !== except) d.close(); }); }

  function makeDropdown(root, cfg) {
    const btn = $('.pill', root), menu = $('.menu', root), label = $('.dd-label', root);
    const items = () => [...menu.querySelectorAll('.menu-item')];

    function build() {
      const cur = cfg.get();
      label.textContent = cfg.label(cur);
      btn.setAttribute('aria-label', cfg.name + ': ' + cfg.label(cur));
      const list = typeof cfg.items === 'function' ? cfg.items() : cfg.items;
      menu.replaceChildren(...list.map((it) => it.header ? h('div', { class: 'menu-group', role: 'presentation', text: it.header }) : h('button', {
        type: 'button', role: 'menuitemradio', class: 'menu-item', 'aria-checked': String(it.id === cur), 'data-sub': it.sub || undefined,
        onclick: () => { cfg.set(it.id); build(); close(); btn.focus(); },
      },
      h('span', { class: 'mi-text' }, h('span', { class: 'mi-label', text: it.label })),
      icon('check', 'mi-check'))));
    }
    function open() {
      closeMenus(api);
      const mobileSheet = window.matchMedia('(max-width: 560px)').matches;
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      if (mobileSheet) {
        // Move outside clipping and stacking contexts in the mobile workspace.
        menu.classList.add('is-mobile-sheet');
        document.body.appendChild(menu);
      } else {
        menu.classList.remove('is-mobile-sheet');
        const r = btn.getBoundingClientRect();
        const below = window.innerHeight - r.bottom, above = r.top;
        root.dataset.dir = below < menu.offsetHeight + 16 && above > below ? 'up' : 'down';
      }
      const sel = menu.querySelector('[aria-checked="true"]') || items()[0];
      if (sel) { sel.focus({ preventScroll: true }); sel.scrollIntoView({ block: 'nearest' }); }
    }
    function close() {
      menu.hidden = true;
      menu.classList.remove('is-mobile-sheet');
      if (menu.parentElement !== root) root.appendChild(menu);
      btn.setAttribute('aria-expanded', 'false');
    }

    btn.addEventListener('click', () => (menu.hidden ? open() : close()));
    btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' && menu.hidden) { e.preventDefault(); open(); } });
    menu.addEventListener('keydown', (e) => {
      const list = items(), i = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); list[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); btn.focus(); }
      else if (e.key === 'Tab') close();
    });
    const api = { close, build };
    dropdowns.push(api);
    build();
    return api;
  }
  document.addEventListener('click', (e) => { if (!e.target.closest('.dd')) closeMenus(); });

  // One line under "Options" that says what is switched on, so the panel can stay closed.
  function syncSummary() {
    const p = state.params, parts = [(p.size || '') + ' learners'];
    if (p.light === true) parts.push('Low-resource');
    if (p.studyNotes !== false) parts.push('Notes');
    if (p.bece !== false) parts.push(examOf(p.cls).id === 'bece' ? 'BECE' : examOf(p.cls).id === 'wassce' ? 'WASSCE' : 'Exercise');
    if (p.hook !== false) parts.push('Hook');
    const ic = incOf(p), nInc = (ic.support ? 1 : 0) + (ic.gender ? 1 : 0) + (ic.ict ? 1 : 0) + ic.acts.length; if (nInc) parts.push('Inclusive');
    const n = (p.also || []).length; if (n) parts.push('+' + n + (n === 1 ? ' class' : ' classes'));
    $('#optSummary').textContent = parts.join(' · ');
  }
  const hookBtn = $('#hookToggle');
  function syncHook() {
    const on = state.params.hook !== false;
    hookBtn.setAttribute('aria-checked', String(on));
    syncSummary();
  }
  hookBtn.addEventListener('click', () => { state.params.hook = state.params.hook === false; syncHook(); store.save(); });
  /* Inclusive teaching: learner support, gender-responsive grouping, a simple ICT step and the activities the teacher wants.
     Lower primary starts with support and grouping on; the teacher's own choice is kept with the plan. */
  const ACTS = [['group', 'Group discussion'], ['roleplay', 'Role play'], ['song', 'Song or rhyme'], ['game', 'Learning game'], ['make', 'Drawing or making'], ['talk', 'Resource person talk'], ['call', 'Voice call to a resource person']];
  const incDefault = (cls) => { const lower = ['lower', 'kg'].includes(levelOf(cls).id); return { support: lower, gender: lower, ict: false, acts: [] }; };
  const incOf = (p) => { const d = incDefault(p.cls), i = p.inc && typeof p.inc === 'object' ? p.inc : {}; return { support: i.support === undefined ? d.support : i.support === true, gender: i.gender === undefined ? d.gender : i.gender === true, ict: i.ict === undefined ? d.ict : i.ict === true, acts: Array.isArray(i.acts) ? i.acts.filter((a) => ACTS.some((x) => x[0] === a)) : d.acts }; };
  const incRows = { support: $('#incSupport'), gender: $('#incGender'), ict: $('#incIct') };
  const actsBox = $('#incActs');
  if (actsBox) actsBox.replaceChildren(...ACTS.map(([id, label]) => h('button', { type: 'button', class: 'act-chip', 'data-act': id, 'aria-pressed': 'false', text: label })));
  function syncInc() {
    const i = incOf(state.params);
    Object.keys(incRows).forEach((k) => { if (incRows[k]) incRows[k].setAttribute('aria-checked', String(i[k])); });
    if (actsBox) actsBox.querySelectorAll('.act-chip').forEach((b) => b.setAttribute('aria-pressed', String(i.acts.includes(b.dataset.act))));
    syncSummary();
  }
  const setInc = (patch) => { state.params.inc = Object.assign(incOf(state.params), patch); syncInc(); store.save(); };
  Object.keys(incRows).forEach((k) => { if (incRows[k]) incRows[k].addEventListener('click', () => setInc({ [k]: !incOf(state.params)[k] })); });
  if (actsBox) actsBox.addEventListener('click', (e) => {
    const b = e.target.closest('.act-chip'); if (!b) return;
    const cur = incOf(state.params).acts, id = b.dataset.act;
    setInc({ acts: cur.includes(id) ? cur.filter((x) => x !== id) : cur.concat(id) });
  });
  const lightBtn = $('#lightToggle');
  function syncLight() {
    const on = state.params.light === true;
    lightBtn.setAttribute('aria-checked', String(on));
    syncSummary();
  }
  lightBtn.addEventListener('click', () => { state.params.light = state.params.light !== true; syncLight(); store.save(); });
  const notesBtn = $('#notesToggle'), beceBtn = $('#beceToggle');
  function syncContent() {
    const n = state.params.studyNotes !== false, b = state.params.bece !== false;
    notesBtn.setAttribute('aria-checked', String(n));
    beceBtn.setAttribute('aria-checked', String(b));
    // The wording follows the level: BECE practice (JHS), class exercise (primary), WASSCE practice (SHS).
    const lv = levelOf(state.params.cls), ex = lv.exam;
    $('.dd-label', notesBtn).textContent = lv.notes.toggle;
    $('small', notesBtn).textContent = ['lower', 'kg'].includes(lv.id) ? 'Key ideas for you and a take-home activity' : 'Board copy and take-home notes';
    $('.dd-label', beceBtn).textContent = ex.toggle + (['kg', 'lower', 'upper'].includes(lv.id) ? '' : ' questions');
    $('small', beceBtn).textContent = lv.id === 'kg' ? 'Spoken tasks and a tick-list' : lv.id === 'lower' ? 'Oral and written, with answers' : 'With a marking guide';
    const beceOpt = $('#resourceType option[value="BECE practice"]'); if (beceOpt) beceOpt.textContent = ex.toggle;
    syncSummary();
  }
  notesBtn.addEventListener('click', () => { state.params.studyNotes = state.params.studyNotes === false; syncContent(); store.save(); });
  beceBtn.addEventListener('click', () => { state.params.bece = state.params.bece === false; syncContent(); store.save(); });
  /* The school's NaCCA scheme for the chosen subject, class and week (when one is loaded). */
  /* The school term. It follows the calendar by itself (Term 1 from September, Term 2 from January, Term 3 from late April), so a teacher
     who comes back after the break lands in the new term. A teacher can pick another term; that choice is kept per account on this device
     and is dropped when the calendar moves on to the next term. */
  /* The teacher profile (profile.js): classes and subjects shown first, and the week after the last one planned. */
  const mySubjectsOf = (cls) => (window.GuidedProfile ? window.GuidedProfile.mySubjects(cls) : []);
  // The teaching week today falls in, from the calendar and the school's opening date. A weekend counts as the coming week, and a holiday as week 1.
  // It is null when the teacher has picked a term other than the current one.
  function calendarWeek() {
    const S = window.SchoolPadiSchemes, term = termNow(), cls = state.params.cls;
    if (!S || term !== S.currentTerm(undefined, cls)) return null;
    const d = new Date(), day = d.getDay();
    d.setDate(d.getDate() + (day === 6 ? 2 : day === 0 ? 1 : 0));            // Saturday and Sunday look ahead to Monday
    const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const n = weeksFor(cls).length;
    for (let w = 1; w <= n; w++) { const we = weekEnd(term, w, cls); if (we && we.iso >= today) return w; }
    return n;
  }
  // After a plan is written the pill moves to the next week; otherwise it sits on this week, or on the week after the last one planned when there is no calendar.
  function continueWeek(afterPlan) {
    const selectedTerm = Number(state.params.term);
    if (!termsFor(state.params.cls).includes(selectedTerm)) state.params.term = termNow();
    const GP = window.GuidedProfile;
    const next = GP ? GP.nextWeek(state.params.cls, state.params.subject, termNow()) : null;
    const now = calendarWeek();
    if (afterPlan) { if (next) state.params.week = next; return; }
    if (now) state.params.week = now; else if (next) state.params.week = next;
  }
  function applyProfile() {                           // the profile changed: make the menus and the choice fit it
    const GP = window.GuidedProfile; if (!GP) return;
    const mine = GP.myClasses();
    if (mine.length && !mine.includes(state.params.cls)) state.params.cls = mine[0];
    const subs = GP.mySubjects(state.params.cls);
    if (subs.length && !subs.includes(state.params.subject)) state.params.subject = subs[0];
    if (!subjectsOf(state.params.cls).includes(state.params.subject)) state.params.subject = subjectsOf(state.params.cls)[0];
    continueWeek();
    syncPills(); store.save();
  }
  /* Week-ending dates: the Friday that closes each week, from the GES calendar or the school's own opening date (set in the profile). */
  const ayNow = () => (window.SchoolPadiSchemes ? window.SchoolPadiSchemes.academicYear() : new Date().getFullYear());
  const openKey = (term, cls) => ayNow() + (isShsCls(cls || state.params.cls) ? '-sem' : '-') + term;
  function weekEnd(term, week, cls) {
    const S = window.SchoolPadiSchemes; if (!S) return null;
    cls = cls || state.params.cls;
    const o = window.GuidedProfile && window.GuidedProfile.get().termOpen;
    return S.weekEnding(term, week, { open: o && o[openKey(term, cls)], cls });
  }
  // The plan leaves the Week Ending cell as a blank to fill in; put the Friday there unless the teacher gave a date.
  function fillWeekEnding(text, params) {
    if (!params || !params.week) return text;
    const we = weekEnd(params.term || termNow(), params.week, params.cls);
    if (!we) return text;
    const when = we.afterClose ? 'To be confirmed' : we.label;   // the term calendar ends before this week: say so instead of printing a date after the break
    return String(text).split('\n').map((line) => (/week[\s-]*ending/i.test(line) && line.indexOf('|') !== -1 ? line.split('|').map((cell) => {
      const m = /^(\s*(?:\*\*)?\s*week[\s-]*ending\s*:?\s*(?:\*\*)?\s*:?)\s*(?:_{2,}|\.{3,}|…|\[[^\]]*\]|\(\s*\))?\s*$/i.exec(cell);
      return m ? m[1].replace(/\s+$/, '') + ' ' + when + ' ' : cell;
    }).join('|') : line)).join('\n');
  }
  /* The announcement an admin has switched on: a dismissible bar on the start screen. Dismissing hides that message only. */
  function showNotice(n) {
    const bar = $('#noticeBar'); if (!bar) return;
    let gone = ''; try { gone = localStorage.getItem('guided.notice.gone') || ''; } catch (e) { /* shown again next time */ }
    if (!n || !n.text || gone === n.id) { bar.hidden = true; return; }
    bar.className = 'notice-bar' + (n.kind === 'warn' ? ' warn' : '');
    $('#noticeText').textContent = n.text; bar.hidden = false;
    $('#noticeX').onclick = () => { bar.hidden = true; try { localStorage.setItem('guided.notice.gone', n.id); } catch (e) { /* fine */ } };
  }
  const termAuto = () => (window.SchoolPadiSchemes ? window.SchoolPadiSchemes.currentTerm(undefined, state.params.cls) : 1);
  const termKey = () => { const u = window.PadiSync && window.PadiSync.user && window.PadiSync.user(); return 'guided.term.' + ((u && (u.id || u.email)) || 'guest'); };
  function termNow() {
    try { const t = JSON.parse(localStorage.getItem(termKey())); if (t && t.auto === termAuto() && termsFor(state.params.cls).includes(t.v)) return t.v; } catch (e) { /* use the calendar */ }
    return termAuto();
  }
  function termSet(v) {
    try { localStorage.setItem(termKey(), JSON.stringify({ v, auto: termAuto() })); } catch (e) { /* the calendar term still works */ }
    state.params.term = v;
    store.save(true);
  }
  const schemeStrip = $('#schemeStrip');
  const schemeFor = (p) => (window.SchoolPadiSchemes ? window.SchoolPadiSchemes.lookup(p.subject, p.cls, p.term || termNow(), p.week) : null);
  // Initialize media context only after termNow and schemeFor are initialized.
  loadMediaContext();
  function syncScheme() {
    refreshStudyCurriculum();
    const S = window.SchoolPadiSchemes;
    if (!S) { schemeStrip.hidden = true; return; }
    const p = state.params;
    const e = schemeFor(p);
    schemeStrip.classList.toggle('is-exam', !!e && e.type === 'exam');
    const tag = (w) => h('span', { class: 'scheme-tag', text: e.term + ' · Week ' + w });
    if (!e) {
      const last = S.span(p.subject, p.cls, p.term || termNow());
      schemeStrip.replaceChildren(h('p', { class: 'scheme-note', text: last
        ? 'Your ' + termWord(p.cls) + ' ' + (p.term || termNow()) + ' scheme covers Weeks 1 to ' + last + '. GuidEd will choose the topic for Week ' + p.week + '.'
        : 'No scheme is loaded for this subject and class yet. GuidEd will choose the strand and topic.' }));
    } else if (e.type === 'exam') {
      schemeStrip.replaceChildren(h('div', { class: 'scheme-top' }, h('span', { class: 'scheme-tag', text: e.term }), h('span', { class: 'scheme-line', text: 'Week ' + e.weeks.join(' and ') + ': examinations' })),
        h('p', { class: 'scheme-note', text: 'There is no lesson plan for examination weeks. Choose another week.' }));
    } else if (e.type === 'revision') {
      const names = e.topics.map((t) => t.split(' > ').pop());
      const what = e.weeks[0] === 1
        ? 'Two revision lessons on the previous term\'s key ideas.'
        : 'Two revision lessons on this term\'s ' + (names.length <= 5 ? 'topics: ' + names.join('; ') + '.' : names.length + ' topics.');
      schemeStrip.replaceChildren(h('div', { class: 'scheme-top' }, tag(p.week), h('span', { class: 'scheme-line', text: e.focus || 'Revision' })),
        h('p', { class: 'scheme-note', text: what }));
    } else if (!e.strand && !e.standard) {            // the school gave only the indicator
      schemeStrip.replaceChildren(h('div', { class: 'scheme-top' }, tag(p.week)),
        h('p', { class: 'scheme-line', text: e.indicators.join(' ') }),
        h('p', { class: 'scheme-note', text: 'Your scheme gives the indicator only. GuidEd will match the NaCCA strand and content standard to its code.' }));
    } else {
      const n = e.indicators.length;
      schemeStrip.replaceChildren(
        h('div', { class: 'scheme-top' }, tag(p.week), h('span', { class: 'scheme-line', text: e.strand + (e.substrand ? ' › ' + e.substrand : '') })),
        h('details', null, h('summary', { text: 'Content standard and ' + n + ' indicator' + (n === 1 ? '' : 's') }),
          e.standard ? h('p', { class: 'scheme-std', text: e.standard }) : null,
          h('ul', null, ...e.indicators.map((x) => h('li', { text: x })))));
    }
    schemeStrip.hidden = false;
    if ($('#studioTabMedia') && $('#studioTabMedia').getAttribute('aria-selected') === 'true') loadMediaContext();
  }
  function syncAlso() {
    const others = levelOf(state.params.cls).classes.filter((c) => c !== state.params.cls);
    state.params.also = (state.params.also || []).filter((c) => others.includes(c));
    alsoRow.replaceChildren(h('span', { class: 'also-label', title: 'Uses the same subject, week and class size' }, 'Also plan for'),
      ...others.map((c) => {
        const on = state.params.also.includes(c);
        const locked = !!(window.GuidedPlans && window.GuidedPlans.alsoLocked());
        const b = h('button', { type: 'button', class: 'pill pill-toggle', role: 'switch', 'aria-checked': String(on && !locked) }, (on && !locked ? '✓ ' : '+ ') + c + (locked ? '  🔒 Pro' : ''));
        b.addEventListener('click', () => {
          if (locked) { window.GuidedPlans.openUpgrade('classes', 'Planning for several classes at once is part of GuidEd Pro.'); return; }
          const set = new Set(state.params.also || []);
          if (set.has(c)) set.delete(c); else set.add(c);
          state.params.also = levelOf(state.params.cls).classes.filter((x) => set.has(x));
          syncAlso(); store.save();
        });
        return b;
      }));
    syncSummary();
    const n = 1 + state.params.also.length;
    sendBtn.title = n > 1 ? 'Write ' + n + ' plans' : '';
  }
  function syncPills() { dropdowns.forEach((d) => d.build()); syncHook(); syncLight(); syncInc(); syncContent(); syncScheme(); syncAlso(); }

  /* ───────── Sidebar behaviour ───────── */
  const navOpen = () => (isMobile() ? app.classList.contains('nav-open') : !app.classList.contains('sb-collapsed'));
  function syncNav() {
    const open = navOpen();
    menuBtn.setAttribute('aria-expanded', String(open));
    sidebar.toggleAttribute('inert', !open);
  }
  function setNav(open) {
    if (isMobile()) app.classList.toggle('nav-open', open);
    else app.classList.toggle('sb-collapsed', !open);
    syncNav();
  }
  menuBtn.addEventListener('click', () => { const open = !navOpen(); setNav(open); if (open && isMobile()) newBtn.focus(); });
  sbClose.addEventListener('click', () => { setNav(false); menuBtn.focus(); });
  scrim.addEventListener('click', () => setNav(false));
  mq.addEventListener('change', () => { app.classList.remove('nav-open'); syncNav(); });

  newBtn.addEventListener('click', newSession);
  brand.addEventListener('click', (e) => { e.preventDefault(); newSession(); });

  listEl.addEventListener('click', (e) => {
    const add = e.target.closest('[data-newfor]');
    if (add) { startPlanFor(add.dataset.newfor); return; }
    const fold = e.target.closest('[data-folder]');
    if (fold) {
      const cls = fold.dataset.folder;
      if (closedFolders.has(cls)) closedFolders.delete(cls); else closedFolders.add(cls);
      lsSet(CLOSED_KEY, [...closedFolders]); renderSessions(); return;
    }
    const del = e.target.closest('[data-del]');
    if (del) { deleteSession(del.dataset.del); return; }
    const item = e.target.closest('.s-item');
    if (!item) return;
    if (item.dataset.id !== state.currentId) showSession(item.dataset.id);
    if (isMobile()) setNav(false);
  });

  [['viewType', 'type'], ['viewClass', 'class'], ['viewRecent', 'recent']].forEach(([id, v]) => document.getElementById(id).addEventListener('click', () => { sbView = v; lsSet(VIEW_KEY, v); renderSessions(); }));

  searchToggle.addEventListener('click', () => {
    const show = searchWrap.hidden;
    searchWrap.hidden = !show;
    searchToggle.setAttribute('aria-expanded', String(show));
    if (show) searchInput.focus(); else { searchInput.value = ''; renderSessions(); }
  });
  searchInput.addEventListener('input', renderSessions);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { searchInput.value = ''; searchWrap.hidden = true; searchToggle.setAttribute('aria-expanded', 'false'); renderSessions(); searchToggle.focus(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMobile() && app.classList.contains('nav-open')) { setNav(false); menuBtn.focus(); }
  });

  /* ───────── Access code ───────── */
  function showAccess(show) { accessRow.hidden = !show; }
  accessInput.addEventListener('input', () => {
    state.access = accessInput.value.trim();
    try { localStorage.setItem(ACCESS_KEY, state.access); } catch (e) { /* ignore */ }
  });

  /* ───────── Theme ───────── */
  function applyTheme(theme, persist) {
    const root = document.documentElement;
    if (persist) {
      root.classList.add('theme-switching');
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
    }
    root.setAttribute('data-theme', theme);
    themeToggle.setAttribute('aria-checked', String(theme === 'dark'));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#000000' : '#EFE8DB');
    if (persist) { try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignore */ } }
  }
  themeToggle.addEventListener('click', () => applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true));

  /* ───────── Init ───────── */
  async function loadConfig() {
    if (window.SchoolPadiArtifact) {
      const ok = await window.SchoolPadiArtifact.ready();
      state.config = { loaded: true, demo: !ok, provider: ok ? 'claude' : null, accessRequired: false };
      showAccess(false); updateView(); updateTopbar();
      return;
    }
    try {
      const res = await fetch('/api/config', { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('no api');
      const j = await res.json();
      state.config = { loaded: true, demo: !!j.demo, provider: j.provider || null, accessRequired: !!j.accessRequired };
      if (window.GuidedAds) { window.GuidedAds.init(j.ads); showNotice(j.notice); updateView(); }
      await initAccount(Object.assign({}, j.sync || {}, { enabled: !!(j.auth && j.auth.enabled), syncEnabled: !!j.sync, authUrl: j.auth && j.auth.url, authDirectUrl: j.auth && j.auth.direct }));
    } catch (e) {
      state.config = { loaded: true, demo: true, provider: null, accessRequired: false };   // static preview, no server
    }
    showAccess(state.config.accessRequired && !state.config.demo);
    if (window.GuidedPlans) window.GuidedPlans.setDemo(state.config.demo);
    updateView(); updateTopbar();
  }


  /* ───────── Accounts and sync ───────── */
  /* Plans live on the device first. When a teacher signs in, they are also copied to that teacher's own
     private rows (Neon) and merged across devices: the newest edit of each plan wins. */
  const TOMB_KEY = 'schoolpadi.deleted';
  const tomb = () => { try { return JSON.parse(localStorage.getItem(TOMB_KEY)) || {}; } catch (e) { return {}; } };
  const saveTomb = (t) => { try { localStorage.setItem(TOMB_KEY, JSON.stringify(t)); } catch (e) { /* ignore */ } };
  const acct = {
    root: $('#accountRow'), out: $('#acctOut'), inn: $('#acctIn'), open: $('#acctOpen'), top: $('#acctTop'), manage: $('#acctManage'),
    who: $('#acctWho'), avatar: $('#acctAvatar'), status: $('#acctStatus'), now: $('#acctSyncNow'), msg: $('#acctMsg'),
  };
  const sheet = {
    social: $('#asSocial'), google: $('#asGoogle'), dlg: $('#acctSheet'), form: $('#asForm'), acct: $('#asAccount'), panel: $('#asPanel'), close: $('#asClose'),
    tabIn: $('#asTabIn'), tabUp: $('#asTabUp'), title: $('#asTitle'), sub: $('#asSub'),
    email: $('#asEmail'), emailErr: $('#asEmailErr'), pw: $('#asPassword'), pwErr: $('#asPwErr'), pwHint: $('#asPwHint'), show: $('#asShow'),
    banner: $('#asBanner'), bannerText: $('#asBannerText'), bannerAct: $('#asBannerAct'), help: $('#asHelp'), helpList: $('#asHelpList'),
    submit: $('#asSubmit'), submitText: $('#asSubmitText'),
    forgot: $('#asForgot'), detail: $('#asDetail'), tabs: $('#asTabs'), emailField: $('#asEmailField'), pwLabel: $('#asPwLabel'), pwField: $('#asPwField'), foot: $('#asFoot'),
    badge: $('#asBadge'), acctTitle: $('#asAcctTitle'), who: $('#asWho'), result: $('#asResult'), view: $('#asView'), syncNow: $('#asSyncNow'), signOut: $('#asSignOut'),
  };
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let resetToken = '', mode = 'signin', busy = false, problemKind = '', bannerRun = null;
  const signedIn = () => !!(window.PadiSync && window.PadiSync.available() && window.PadiSync.user());
  let syncing = false, syncAgain = false, syncTimer = 0, lastSync = 0;

  const acctMsg = (t, bad) => { acct.msg.textContent = t || ''; acct.msg.classList.toggle('err', !!bad); };
  const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 20 ? 'just now' : s < 90 ? 'a minute ago' : s < 3600 ? Math.round(s / 60) + ' minutes ago' : Math.round(s / 3600) + ' hours ago'; };
  function acctStatus(t) { acct.status.textContent = t; }
  function refreshAcct() {
    const P = window.PadiSync, ok = !!(P && P.authConfigured());      // no account screen at all if sign-in is not set up on this site
    acct.root.hidden = !ok; acct.top.hidden = !ok;
    if (!ok) { window.dispatchEvent(new Event('guided:account')); return; }
    const u = P.user();
    acct.out.hidden = !!u; acct.inn.hidden = !u;
    window.dispatchEvent(new Event('guided:account'));
    acct.top.dataset.state = u ? (problemKind ? 'warn' : 'in') : 'out';
    acct.top.setAttribute('aria-label', u ? 'Account: ' + (u.email || 'signed in') : 'Sign in or create account');
    const ini = acct.top.querySelector('.acct-initial'); if (ini) ini.textContent = u ? String((u.name && u.name.trim()) || u.email || 'G').trim().charAt(0).toUpperCase() : '';
    if (u) { acct.who.textContent = u.email || 'Signed in'; acct.avatar.textContent = String(u.email || 'G').charAt(0); if (lastSync) acctStatus('Synced ' + ago(lastSync)); }
  }
  function scheduleSync() { if (!signedIn() || !window.PadiSync.syncAvailable()) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), 3000); }

  const cleanRemote = (r) => {
    const d = r && r.data;
    if (!d || typeof d !== 'object' || !Array.isArray(d.messages) || !d.messages.length) return null;
    return Object.assign({}, d, { id: String(r.id), updatedAt: Number(r.updated_at) || 0, title: typeof d.title === 'string' ? d.title : 'Plan', params: d.params && typeof d.params === 'object' ? d.params : null,
      messages: d.messages.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') });
  };

  // The server refuses a plan with no usable time stamp, so make sure every plan sent has one.
  const stamp = (n) => (Number.isFinite(n) && n > 0 ? n : Date.now());

  // Returns what happened: { pulled, pushed, removed, remoteTotal, failed } when it ran, { error } when it failed,
  // and null when it did not run (signed out, already syncing, or a plan is being written).
  async function syncNow(manual) {
    if (!signedIn() || !window.PadiSync.syncAvailable()) return null;
    if (syncing) { syncAgain = true; return null; }
    if (state.streaming) { scheduleSync(); return null; }            // never change plans while one is being written
    syncing = true; acct.now.classList.add('spin'); acctStatus('Syncing…'); if (manual) acctMsg('');
    try {
      const P = window.PadiSync;
      const remote = await P.list(60);
      const t = tomb(), local = new Map(state.sessions.filter((s) => s.messages.length).map((s) => [s.id, s]));
      const push = [], take = new Map(), drop = new Set(), seen = new Set();
      for (const r of remote) {
        seen.add(r.id);
        const l = local.get(r.id), ts = Number(r.updated_at) || 0;
        if (r.deleted) {
          if (t[r.id] && t[r.id] <= ts) delete t[r.id];
          if (l && l.updatedAt <= ts) drop.add(r.id); else if (l) push.push({ id: l.id, data: l, updated_at: l.updatedAt });
        } else if (t[r.id]) {                                         // deleted on this device
          if (t[r.id] >= ts) push.push({ id: r.id, data: {}, updated_at: t[r.id], deleted: true });
          else { delete t[r.id]; const c = cleanRemote(r); if (c) take.set(r.id, c); }
        } else if (!l) { const c = cleanRemote(r); if (c) take.set(r.id, c); }
        else if (ts > l.updatedAt) { const c = cleanRemote(r); if (c) take.set(r.id, c); }
        else if (l.updatedAt > ts) push.push({ id: l.id, data: l, updated_at: l.updatedAt });
      }
      local.forEach((l, id) => { if (!seen.has(id) && !t[id]) push.push({ id, data: l, updated_at: l.updatedAt }); });
      Object.keys(t).forEach((id) => { if (!seen.has(id)) push.push({ id, data: {}, updated_at: t[id], deleted: true }); });
      Object.keys(t).forEach((id) => { if (Date.now() - t[id] > 30 * 864e5) delete t[id]; });
      push.forEach((r) => { r.updated_at = stamp(r.updated_at); });
      const sent = await P.push(push);
      saveTomb(t);
      const summary = {
        pulled: take.size, removed: drop.size, pushed: push.filter((r) => !r.deleted).length - (sent.failed || 0),
        failed: sent.failed || 0, remoteTotal: remote.filter((r) => !r.deleted).length, localTotal: local.size,
      };

      // teacher details
      try {
        const rp = await P.getProfile(), lp = profile(), lts = lp.updatedAt || 0;
        const empty = !lp.teacher && !lp.school && !(lp.classes || []).length && !(lp.subjects || []).length && !lp.setupDone;
        if (rp && (empty || rp.updated_at > lts)) {
          const d = rp.data || {};
          teacherInput.value = String(d.teacher || '').slice(0, 80); schoolInput.value = String(d.school || '').slice(0, 100);
          try { localStorage.setItem(PROFILE_KEY, JSON.stringify(Object.assign({}, d, { teacher: teacherInput.value, school: schoolInput.value, updatedAt: rp.updated_at }))); } catch (e) { /* ignore */ }
          applyProfile();
        } else if (!empty && (!rp || lts > rp.updated_at)) {
          const out = Object.assign({}, lp); delete out.updatedAt;
          await P.setProfile(out, lts || Date.now());
        }
        if (window.GuidedProfile && !state.streaming) window.GuidedProfile.afterSync();
      } catch (e) { if (e.offline) throw e; }

      if ((take.size || drop.size) && !state.streaming) {
        const keepCur = state.currentId;
        let list = state.sessions.filter((s) => !drop.has(s.id)).map((s) => take.get(s.id) || s);
        const have = new Set(list.map((s) => s.id));
        take.forEach((c, id) => { if (!have.has(id)) list.push(c); });
        state.sessions = list;
        const cur = current();
        if (!cur) { const f = makeSession(); state.sessions.unshift(f); showSession(f.id); }
        else if (take.has(keepCur)) showSession(keepCur);
        renderSessions(); updateTopbar(); store.save(true);
      } else if (take.size || drop.size) syncAgain = true;
      lastSync = Date.now();
      problemKind = '';
      acctStatus(summary.failed ? 'Synced. ' + summary.failed + (summary.failed === 1 ? ' plan' : ' plans') + ' could not be saved (too large).' : 'Synced just now');
      refreshAcct();
      return summary;
    } catch (e) {
      if (e.offline) acctStatus('Offline. Will sync when you are back online.');
      else if (e.code === 'session' || e.status === 401 || !signedIn()) {
        refreshAcct(); acctStatus('');
        acctMsg('Your sign-in has ended on this device. Please sign in again.', true);
        toast('Your sign-in has ended on this device. Please sign in again.');
      } else acctStatus('Could not sync: ' + e.message);
      return { error: e };
    } finally {
      syncing = false; acct.now.classList.remove('spin');
      if (syncAgain) { syncAgain = false; scheduleSync(); }
    }
  }

  let stopLive = null;
  async function watchLive() {
    if (stopLive) { stopLive(); stopLive = null; }
    if (!signedIn() || !window.PadiSync.syncAvailable() || !window.PadiSync.watch) return;
    try { stopLive = await window.PadiSync.watch(() => { if (!syncing && !state.streaming) syncNow(); }); }
    catch (e) { /* polling remains available when Realtime is unavailable */ }
  }
  // The password reset email links back here with ?token=... (or ?error=... when the link is no good).
  function openResetFromLink() {
    let token = '', bad = false;
    try {
      const q = new URLSearchParams(location.search);
      token = q.get('token') || ''; bad = !!q.get('error') && /token/i.test(q.get('error'));
      if (token || q.get('error')) { q.delete('token'); q.delete('error'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); }
    } catch (e) { return; }
    if (!token && !bad) return;
    if (!window.PadiSync.authConfigured()) return;
    showFormView(); sheet.dlg.showModal ? (sheet.dlg.open || sheet.dlg.showModal()) : 0;
    if (token) { resetToken = token; setMode('reset'); }
    else { setMode('forgot'); showBanner('This reset link has expired or was already used. Enter your email to get a new one.'); }
  }
  function initAccount(cfg) {
    if (!window.PadiSync || !cfg) return Promise.resolve();
    return window.PadiSync.init(cfg).then(() => {
      refreshAcct();
      if (signedIn() && window.PadiSync.syncAvailable()) { syncNow(); watchLive(); }
      openResetFromLink();
      setMode(mode);   // the Google button shows once sign-in is known to be available
      try {
        if (sessionStorage.getItem('guided.googleBack') === '1') {
          sessionStorage.removeItem('guided.googleBack');
          if (!signedIn()) { openSheet(); showBanner('Google sign-in did not finish. Try again, or use your email and password. ' + (window.PadiSync.lastDetail() || '')); }
        }
      } catch (e) { /* storage blocked */ }
      refreshPlans();
      setTimeout(maybeAskAudience, 400);   // only once the saved sign-in has been restored, so returning users are never asked
    }).catch((e) => { acctMsg(e.message, true); });
  }

  /* ── Sign in / create account sheet ── */
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  // Steps that fit the browser in use, for when the browser blocks the sign-in cookie.
  function browserSteps() {
    const ua = navigator.userAgent || '';
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const steps = [];
    if (ios) steps.push('iPhone or iPad: open Settings, then Safari (on newer versions: Settings, Apps, Safari), and turn off "Prevent Cross-Site Tracking". Then come back and sign in again.');
    else if (/Firefox/.test(ua)) steps.push('Firefox: tap the shield in the address bar and turn off Enhanced Tracking Protection for this site. Then sign in again.');
    else if (navigator.brave) steps.push('Brave: tap the lion icon and turn Shields off for this site. Then sign in again.');
    else steps.push('Chrome or Edge: open Settings, then Privacy, then Third-party cookies, and allow them for this site. Then sign in again.');
    steps.push('Do not use a private or Incognito window. They block this kind of sign-in.');
    steps.push('Or open GuidEd in a different browser, where it may work without changing any setting.');
    return steps;
  }

  function hideBanner() { sheet.banner.hidden = true; sheet.help.hidden = true; sheet.bannerAct.hidden = true; bannerRun = null; }
  function showBanner(text, opts) {
    opts = opts || {};
    sheet.banner.classList.toggle('ok', !!opts.ok);
    sheet.bannerText.textContent = text;
    sheet.bannerAct.hidden = !opts.action;
    if (opts.action) { sheet.bannerAct.textContent = opts.action.label; bannerRun = opts.action.run; }
    sheet.help.hidden = !opts.help;
    if (opts.help) { sheet.helpList.replaceChildren(...opts.help.map((t) => h('li', { text: t }))); sheet.help.open = true; }
    sheet.detail.textContent = opts.detail || ''; sheet.detail.hidden = !opts.detail;
    sheet.banner.hidden = false;
  }
  function fieldError(input, errEl, text) {
    input.setAttribute('aria-invalid', 'true'); errEl.textContent = text; errEl.hidden = false;
    if (input === sheet.pw) sheet.pwHint.hidden = true;                  // the error already says what the hint would
  }
  function clearErrors() {
    [[sheet.email, sheet.emailErr], [sheet.pw, sheet.pwErr]].forEach(([i, e]) => { i.removeAttribute('aria-invalid'); e.hidden = true; e.textContent = ''; });
    sheet.pwHint.hidden = !(mode === 'signup' || mode === 'reset');
    hideBanner();
  }
  function setBusy(on, text) {
    busy = on; sheet.submit.disabled = on; sheet.submit.classList.toggle('busy', on);
    sheet.submitText.textContent = on ? text : submitLabel();
  }
  const submitLabel = () => (mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : mode === 'reset' ? 'Set new password' : 'Sign in');
  function setMode(m) {
    mode = m; const up = m === 'signup', forgot = m === 'forgot', reset = m === 'reset', special = forgot || reset;
    if (sheet.social) sheet.social.hidden = special || !(window.PadiSync && window.PadiSync.googleAvailable && window.PadiSync.googleAvailable());
    sheet.tabs.hidden = special; sheet.emailField.hidden = reset; sheet.forgot.hidden = reset || up;
    sheet.pwField.hidden = forgot; sheet.foot.hidden = special;
    sheet.forgot.textContent = forgot ? 'Back to sign in' : 'Forgot password?';
    sheet.pwLabel.textContent = reset ? 'New password' : 'Password';
    sheet.tabIn.setAttribute('aria-selected', String(!up)); sheet.tabUp.setAttribute('aria-selected', String(up));
    sheet.tabIn.tabIndex = up ? -1 : 0; sheet.tabUp.tabIndex = up ? 0 : -1;
    sheet.panel.setAttribute('aria-labelledby', up ? 'asTabUp' : 'asTabIn');
    sheet.title.textContent = forgot ? 'Reset your password' : reset ? 'Choose a new password' : up ? 'Create your GuidEd account' : 'Sign in to GuidEd';
    sheet.sub.textContent = forgot ? 'Enter your email and we will send you a link to set a new password.' : reset ? 'Pick a password you have not used here before.' : up ? 'Keep your plans safe and open them on any phone or computer.' : 'Your plans follow you to any phone or computer.';
    sheet.pw.autocomplete = (up || reset) ? 'new-password' : 'current-password';
    sheet.pw.placeholder = (up || reset) ? 'At least 8 characters' : 'Your password';
    sheet.pwHint.hidden = !(up || reset);
    sheet.submitText.textContent = submitLabel();
    clearErrors();
  }

  function showFormView() { sheet.acct.hidden = true; sheet.form.hidden = false; const v = $('#asVerify'); if (v) v.hidden = true; }
  function showAccountView(heading, resultText) {
    const u = window.PadiSync.user();
    sheet.form.hidden = true; sheet.acct.hidden = false;
    sheet.acctTitle.textContent = heading || 'Your account';
    sheet.who.textContent = u ? u.email : '';
    sheet.badge.classList.remove('warn');
    sheet.result.textContent = resultText != null ? resultText : (lastSync ? 'Last synced ' + ago(lastSync) + '.' : '');
    sheet.view.hidden = !state.sessions.some((s) => s.messages.length);
  }

  // What to tell the teacher after a sync: how many plans arrived, how many were saved, and anything that went wrong.
  function describeSync(r, signup) {
    if (!window.PadiSync.syncAvailable()) return 'You are signed in. Saving plans to your account is not turned on for this site yet, so your plans stay on this device.';
    if (!r) return 'Your plans will sync in a moment.';
    if (r.error) return 'You are signed in, but your plans could not be synced: ' + r.error.message;
    const parts = [];
    if (signup) parts.push('Your account is ready.');
    if (r.pulled) parts.push('Brought ' + plural(r.pulled, 'plan', 'plans') + ' from your account to this device.');
    if (r.pushed) parts.push('Saved ' + plural(r.pushed, 'plan', 'plans') + ' from this device to your account.');
    if (r.failed) parts.push(plural(r.failed, 'plan', 'plans') + ' could not be saved because ' + (r.failed === 1 ? 'it is' : 'they are') + ' too large.');
    if (!r.pulled && !r.pushed && !r.failed) {
      parts.push(r.remoteTotal ? 'Your ' + plural(r.remoteTotal, 'saved plan', 'saved plans') + (r.remoteTotal === 1 ? ' is' : ' are') + ' already on this device.'
        : 'No plans are saved on this account yet. Plans you make will appear on your other devices.');
    }
    return parts.join(' ');
  }

  // Runs a sync and shows the outcome in the sheet. Waits for any sync already under way so the result is never lost.
  async function syncAndReport(signup) {
    sheet.result.textContent = 'Checking your plans…';
    for (let i = 0; i < 40 && syncing; i++) await new Promise((r) => setTimeout(r, 250));
    const r = await syncNow(true);
    if (r && r.error && !signedIn()) {                                  // the session did not hold
      showFormView(); setMode('signin');
      showBanner('Your sign-in has ended. Please sign in again.');
      return r;
    }
    if (sheet.dlg.open && !sheet.acct.hidden) {
      sheet.result.textContent = describeSync(r, signup);
      sheet.badge.classList.toggle('warn', !!(r && r.error));
      sheet.view.hidden = !state.sessions.some((s) => s.messages.length);
    }
    return r;
  }

  function openSheet(m) {
    const P = window.PadiSync;
    if (!P || !P.authConfigured()) return;
    if (isMobile()) setNav(false);
    if (P.user()) showAccountView(); else { showFormView(); setMode(m || mode); }
    if (!sheet.dlg.open) sheet.dlg.showModal();
    if (!P.user() && !isMobile()) sheet.email.focus();                   // on a phone the keyboard would hide the form
  }
  const closeSheet = () => { if (sheet.dlg.open) sheet.dlg.close(); };

  // Email confirmation by one-time code (new accounts, and existing accounts that were never confirmed).
  let verifyEmail = '', verifyPassword = '', resendAt = 0, resendTimer = 0;
  const vf = { sec: $('#asVerify'), sub: $('#asVerifySub'), form: $('#asVerifyForm'), code: $('#asCode'), err: $('#asCodeErr'), note: $('#asVerifyNote'), submit: $('#asVerifySubmit'), resend: $('#asResend'), back: $('#asVerifyBack') };
  function resendTick() {
    const left = Math.ceil((resendAt - Date.now()) / 1000);
    vf.resend.disabled = left > 0; vf.resend.textContent = left > 0 ? 'Send a new code (' + left + 's)' : 'Send a new code';
    if (left > 0) resendTimer = setTimeout(resendTick, 1000);
  }
  function showVerifyView(email, note) {
    verifyEmail = email; verifyPassword = sheet.pw.value || verifyPassword; sheet.pw.value = '';
    sheet.form.hidden = true; sheet.acct.hidden = true; vf.sec.hidden = false;
    vf.sub.textContent = 'We sent a 6-digit code to ' + email + '. It can take a minute; check your spam folder too.';
    vf.note.textContent = note || ''; vf.err.hidden = true; vf.code.value = '';
    clearTimeout(resendTimer); resendAt = Date.now() + 30000; resendTick();
    if (!isMobile()) vf.code.focus();
  }
  vf.code.addEventListener('input', () => { vf.code.value = vf.code.value.replace(/\D/g, '').slice(0, 6); vf.err.hidden = true; });
  vf.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (vf.code.value.length !== 6) { vf.err.textContent = 'Enter the 6-digit code.'; vf.err.hidden = false; vf.code.focus(); return; }
    vf.submit.disabled = true; vf.note.textContent = 'Checking…';
    try {
      await window.PadiSync.verifyEmail(verifyEmail, vf.code.value, verifyPassword);
      verifyPassword = ''; vf.sec.hidden = true; problemKind = ''; refreshAcct(); watchLive(); refreshPlans();
      showAccountView('Email confirmed', 'Checking your plans…');
      await syncAndReport(true);
    } catch (err) {
      vf.note.textContent = '';
      if (err && err.code === 'verified') { verifyPassword = ''; vf.sec.hidden = true; showFormView(); setMode('signin'); sheet.email.value = verifyEmail; showBanner(err.message, { ok: true }); }
      else { vf.err.textContent = (err && err.message) || 'That code is not right.'; vf.err.hidden = false; vf.code.select(); }
    } finally { vf.submit.disabled = false; }
  });
  vf.resend.addEventListener('click', async () => {
    vf.resend.disabled = true; vf.err.hidden = true;
    try { await window.PadiSync.sendVerifyCode(verifyEmail); vf.note.textContent = 'A new code is on its way.'; resendAt = Date.now() + 30000; }
    catch (err) { vf.note.textContent = ''; vf.err.textContent = (err && err.message) || 'Could not send the code.'; vf.err.hidden = false; resendAt = 0; }
    resendTick();
  });
  vf.back.addEventListener('click', () => { verifyPassword = ''; vf.sec.hidden = true; showFormView(); setMode('signup'); sheet.email.focus(); });

  function handleAuthError(err) {
    refreshAcct();
    const code = err && err.code;
    if (code === 'cookies') {
      problemKind = 'cookies'; refreshAcct();
      showBanner((err.created ? 'Your account was created. ' : '') + err.message, { help: browserSteps(), detail: err.detail, action: { label: 'Continue without syncing', run: closeSheet } });
    } else if (code === 'verify' && err.email) showVerifyView(err.email, err.created ? 'Your account was created. Enter the code we emailed you.' : 'Your email is not confirmed yet. Enter the code we emailed you.');
    else if (code === 'exists') showBanner(err.message, { action: { label: 'Sign in instead', run: () => setMode('signin') } });
    else if (code === 'badlogin') showBanner(err.message, { action: { label: 'New here? Create an account', run: () => setMode('signup') } });
    else if (code === 'password') fieldError(sheet.pw, sheet.pwErr, err.message);
    else if (code === 'email') fieldError(sheet.email, sheet.emailErr, err.message);
    else showBanner((err && err.message) || 'Something went wrong. Please try again.');
  }

  acct.open.addEventListener('click', () => openSheet('signin'));
  acct.top.addEventListener('click', () => openSheet('signin'));
  acct.manage.addEventListener('click', () => openSheet());
  acct.now.addEventListener('click', () => syncNow(true));
  $('#settingsSyncNow').addEventListener('click', async () => {
    const button = $('#settingsSyncNow');
    button.disabled = true;
    acctMsg('Syncing…');
    try {
      const result = await syncAndReport(false);
      acctMsg(result && result.error ? 'Sync could not be completed. Please try again.' : 'Your account is up to date.');
    } catch (err) {
      acctMsg((err && err.message) || 'Sync could not be completed. Please try again.', true);
    } finally { button.disabled = false; }
  });
  $('#settingsSignOut').addEventListener('click', () => sheet.signOut.click());

  // Shared profile editor for Parent and Teacher accounts. Role-specific teaching
  // and child details remain in their existing profile areas.
  const ep = {
    dlg: $('#accountProfileSheet'), form: $('#epForm'), close: $('#epClose'),
    name: $('#epName'), email: $('#epEmail'), phone: $('#epPhone'), role: $('#epRole'),
    school: $('#epSchool'), schoolWrap: $('#epSchoolWrap'),
    status: $('#epStatus'), save: $('#epSave'),
  };
  let epAccount = null;
  function epMessage(message, bad) {
    ep.status.textContent = message || '';
    ep.status.classList.toggle('is-error', !!bad);
  }
  async function openAccountProfile() {
    if (!signedIn()) return;
    epMessage('');
    ep.save.disabled = false;
    try {
      const P = window.PadiSync, user = P.user() || {};
      epAccount = await P.getAccountProfile() || {};
      const roles = Array.isArray(epAccount.roles) ? epAccount.roles : [];
      const role = epAccount.primaryRole || roles[0] || 'teacher';
      ep.name.value = epAccount.displayName || user.name || '';
      ep.email.value = user.email || '';
      ep.phone.value = epAccount.phoneNumber || '';
      ep.role.value = roles.length > 1 ? roles.map((x) => x === 'parent' ? 'Parent' : 'Teacher').join(' + ') : (role === 'parent' ? 'Parent' : 'Teacher');
      ep.schoolWrap.hidden = !roles.includes('teacher') && role !== 'teacher';
      ep.school.value = profile().school || '';
      if (!ep.dlg.open) ep.dlg.showModal();
      setTimeout(() => ep.name.focus(), 60);
    } catch (err) {
      toast((err && err.message) || 'Could not load your profile. Please try again.');
    }
  }
  $('#asEditProfile').addEventListener('click', openAccountProfile);
  $('#settingsEditProfile').addEventListener('click', openAccountProfile);
  async function sendPasswordReset(button, report) {
    const P = window.PadiSync, user = P && P.user();
    if (!user || !user.email) { report('We could not find the email address for this account.', true); return; }
    button.disabled = true;
    try {
      await P.requestReset(user.email);
      report('Password reset instructions have been sent to ' + user.email + '. Check your inbox.');
    } catch (err) {
      report((err && err.message) || 'Could not send the password reset email.', true);
    } finally { button.disabled = false; }
  }
  $('#asResetPassword').addEventListener('click', () => sendPasswordReset($('#asResetPassword'), (message) => { sheet.result.textContent = message; }));
  $('#settingsResetPassword').addEventListener('click', () => sendPasswordReset($('#settingsResetPassword'), acctMsg));
  ep.close.addEventListener('click', () => ep.dlg.close());
  ep.dlg.addEventListener('click', (event) => {
    const rect = ep.dlg.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) ep.dlg.close();
  });
  ep.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (ep.save.disabled) return;
    const name = ep.name.value.trim();
    if (!name) { epMessage('Enter your full name before saving.', true); ep.name.focus(); return; }
    const phoneNumber = ep.phone.value.trim();
    const phoneDigits = phoneNumber.replace(/\D/g, '');
    if (phoneNumber && (!/^\+?[0-9\s().-]{7,25}$/.test(phoneNumber) || phoneDigits.length < 7 || phoneDigits.length > 15)) {
      epMessage('Enter a valid phone number, including the country code where possible.', true);
      ep.phone.focus();
      return;
    }
    const P = window.PadiSync;
    const roles = Array.isArray(epAccount && epAccount.roles) && epAccount.roles.length
      ? epAccount.roles.filter((x) => x === 'parent' || x === 'teacher') : ['teacher'];
    const primaryRole = roles.includes(epAccount && epAccount.primaryRole) ? epAccount.primaryRole : roles[0];
    ep.save.disabled = true;
    epMessage('Saving your profile…');
    try {
      const next = Object.assign({}, epAccount || {}, { roles, primaryRole, displayName: name, phoneNumber });
      if (roles.includes('parent')) next.children = Array.isArray(next.children) ? next.children : [];
      await P.setAccountProfile(next);
      if (roles.includes('teacher')) {
        teacherInput.value = name;
        schoolInput.value = ep.school.value.trim();
        saveProfile();
      }
      epAccount = next;
      epMessage('Your profile has been updated.');
      setTimeout(() => { if (ep.dlg.open) ep.dlg.close(); }, 700);
      sheet.result.textContent = 'Profile updated successfully.';
      refreshAcct();
    } catch (err) {
      epMessage((err && err.message) || 'Could not save your profile. Please try again.', true);
    } finally { ep.save.disabled = false; }
  });
  sheet.close.addEventListener('click', closeSheet);
  sheet.dlg.addEventListener('click', (e) => {                           // a tap on the dimmed area outside the sheet closes it
    const r = sheet.dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeSheet();
  });
  sheet.dlg.addEventListener('close', () => { sheet.pw.value = ''; sheet.pw.type = 'password'; sheet.show.textContent = 'Show'; sheet.show.setAttribute('aria-pressed', 'false'); setBusy(false); });
  sheet.tabIn.addEventListener('click', () => setMode('signin'));
  sheet.tabUp.addEventListener('click', () => setMode('signup'));
  [sheet.tabIn, sheet.tabUp].forEach((tab) => tab.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault(); const next = mode === 'signin' ? sheet.tabUp : sheet.tabIn; setMode(mode === 'signin' ? 'signup' : 'signin'); next.focus();
  }));
  sheet.show.addEventListener('click', () => {
    const on = sheet.pw.type === 'password';
    sheet.pw.type = on ? 'text' : 'password'; sheet.show.textContent = on ? 'Hide' : 'Show';
    sheet.show.setAttribute('aria-pressed', String(on)); sheet.show.setAttribute('aria-label', on ? 'Hide password' : 'Show password');
  });
  sheet.forgot.addEventListener('click', () => { const keep = sheet.email.value; setMode(mode === 'forgot' ? 'signin' : 'forgot'); sheet.email.value = keep; (mode === 'forgot' ? sheet.email : sheet.pw).focus(); });
  sheet.bannerAct.addEventListener('click', () => { const run = bannerRun; if (run) { run(); (sheet.pw.value ? sheet.submit : sheet.pw).focus(); } });
  [[sheet.email, sheet.emailErr], [sheet.pw, sheet.pwErr]].forEach(([i, e]) => i.addEventListener('input', () => { i.removeAttribute('aria-invalid'); e.hidden = true; if (i === sheet.pw) sheet.pwHint.hidden = !(mode === 'signup' || mode === 'reset'); if (!sheet.banner.hidden && !sheet.help.open) hideBanner(); }));

  sheet.panel.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const email = sheet.email.value.trim().toLowerCase(), password = sheet.pw.value, signup = mode === 'signup';
    clearErrors();
    if (mode === 'forgot') {
      if (!EMAIL_RE.test(email)) { fieldError(sheet.email, sheet.emailErr, email ? 'That email address does not look right.' : 'Enter your email address.'); sheet.email.focus(); return; }
      setBusy(true, 'Sending…');
      try {
        await window.PadiSync.requestReset(email); setBusy(false);
        showBanner('If an account exists for ' + email + ', a reset link is on its way. Open it on this device, then choose a new password. Check your spam folder if it does not arrive.', { ok: true });
      } catch (err) { setBusy(false); handleAuthError(err); }
      return;
    }
    if (mode === 'reset') {
      if (password.length < 8) { fieldError(sheet.pw, sheet.pwErr, password ? 'Use at least 8 characters.' : 'Choose a new password.'); sheet.pw.focus(); return; }
      setBusy(true, 'Saving…');
      try {
        await window.PadiSync.resetPassword(resetToken, password); resetToken = ''; setBusy(false);
        setMode('signin'); sheet.pw.value = ''; sheet.email.focus();
        showBanner('Your password has been changed. Sign in with your new password.', { ok: true });
      } catch (err) {
        setBusy(false);
        if (err && err.code === 'token') showBanner(err.message, { action: { label: 'Send me a new link', run: () => setMode('forgot') } });
        else handleAuthError(err);
      }
      return;
    }
    let bad = null;
    if (!EMAIL_RE.test(email)) { fieldError(sheet.email, sheet.emailErr, email ? 'That email address does not look right.' : 'Enter your email address.'); bad = sheet.email; }
    if (!password) { fieldError(sheet.pw, sheet.pwErr, signup ? 'Choose a password.' : 'Enter your password.'); bad = bad || sheet.pw; }
    else if (signup && password.length < 8) { fieldError(sheet.pw, sheet.pwErr, 'Use at least 8 characters.'); bad = bad || sheet.pw; }
    if (bad) { bad.focus(); return; }
    setBusy(true, signup ? 'Creating your account…' : 'Signing in…');
    try {
      if (signup) await window.PadiSync.signUp(email, password); else await window.PadiSync.signIn(email, password);
      sheet.pw.value = ''; problemKind = ''; refreshAcct(); watchLive(); refreshPlans();
      showAccountView(signup ? 'Account created' : 'Welcome back', 'Checking your plans…');
      setBusy(false);
      await syncAndReport(signup);
    } catch (err) { setBusy(false); handleAuthError(err); }
  });

  if (sheet.google) sheet.google.addEventListener('click', async () => {
    sheet.google.disabled = true; $('#asGoogleText').textContent = 'Opening Google…';
    try { await window.PadiSync.signInWithGoogle(); }
    catch (err) { sheet.google.disabled = false; $('#asGoogleText').textContent = 'Continue with Google'; handleAuthError(err); }
  });
  sheet.view.addEventListener('click', () => { closeSheet(); setNav(true); if (isMobile()) newBtn.focus(); });
  sheet.syncNow.addEventListener('click', async () => {
    sheet.syncNow.disabled = true; sheet.result.textContent = 'Syncing…';
    try { await syncAndReport(false); } finally { sheet.syncNow.disabled = false; }
  });
  /* Delete account: a confirm sheet that needs the word DELETE, then the server erases the account and this device signs out. */
  const del = { sheet: $('#delSheet'), input: $('#dlConfirm'), go: $('#dlGo'), err: $('#dlErr'), local: $('#dlLocal') };
  const delClose = () => { if (del.sheet.open) del.sheet.close(); };
  $('#asDelete').addEventListener('click', () => {
    del.input.value = ''; del.go.disabled = true; del.err.hidden = true; del.local.checked = true;
    closeSheet(); if (!del.sheet.open) del.sheet.showModal(); del.input.focus();
  });
  $('#dlClose').addEventListener('click', delClose);
  $('#dlCancel').addEventListener('click', delClose);
  del.input.addEventListener('input', () => { del.go.disabled = del.input.value.trim() !== 'DELETE'; });
  del.go.addEventListener('click', async () => {
    if (del.input.value.trim() !== 'DELETE') return;
    del.go.disabled = true; del.err.hidden = true; del.go.firstElementChild.textContent = 'Deleting…';
    try {
      const r = await window.PadiSync.deleteAccount('DELETE');
      if (del.local.checked) { try { Object.keys(localStorage).filter((k) => /^(schoolpadi|guided)[.]/.test(k)).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* the server copy is already gone */ } }
      if (stopLive) { stopLive(); stopLive = null; }
      lastSync = 0; problemKind = ''; acctStatus(''); refreshAcct(); acctMsg(''); delClose();
      toast(r && r.identityRemoved === false ? 'Your data is deleted. Your sign-in record could not be removed automatically, so please contact us to finish.' : 'Your account has been deleted.');
      if (del.local.checked) setTimeout(() => location.reload(), 1200); else refreshPlans();
    } catch (e) {
      del.err.textContent = e && e.offline ? 'You appear to be offline. Try again when you are connected.' : ((e && e.message) || 'Could not delete the account. Please try again.');
      del.err.hidden = false; del.go.disabled = false;
    } finally { del.go.firstElementChild.textContent = 'Delete my account'; }
  });
  sheet.signOut.addEventListener('click', async () => {
    await window.PadiSync.signOut();
    if (stopLive) { stopLive(); stopLive = null; }
    lastSync = 0; problemKind = ''; acctStatus(''); refreshAcct(); acctMsg(''); refreshPlans();
    closeSheet(); toast('Signed out. Your plans stay on this device.');
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(); });
  window.addEventListener('online', () => scheduleSync());
  setInterval(() => { if (signedIn() && document.visibilityState === 'visible' && !syncing) { if (lastSync) acctStatus('Synced ' + ago(lastSync)); if (Date.now() - lastSync > 5 * 60000) syncNow(); } }, 30000);

  function init() {
    const saved = store.load();
    state.sessions = saved && Array.isArray(saved.sessions) ? saved.sessions.filter((s) => s && Array.isArray(s.messages)) : [];
    if (saved && saved.params && CLASSES.includes(saved.params.cls) && subjectsOf(saved.params.cls).includes(saved.params.subject) && weeksFor(saved.params.cls).includes(saved.params.week)) {
      state.params = { subject: saved.params.subject, cls: saved.params.cls, week: saved.params.week, hook: saved.params.hook !== false, size: SIZES.includes(saved.params.size) ? saved.params.size : state.params.size, light: saved.params.light === true, studyNotes: saved.params.studyNotes !== false, bece: saved.params.bece !== false, inc: saved.params.inc, mode: ['plan', 'resources', 'full'].includes(saved.params.mode) ? saved.params.mode : 'full', resourceType: ['Study notes', 'Learner worksheet', 'Homework pack', 'BECE practice', 'Teaching slides'].includes(saved.params.resourceType) ? saved.params.resourceType : 'Study notes' };
    }
    try { state.access = localStorage.getItem(ACCESS_KEY) || ''; accessInput.value = state.access; } catch (e) { /* ignore */ }
    if (window.GuidedProfile) {
      window.GuidedProfile.init({ toast, signedIn, changed: () => scheduleSync(), apply: applyProfile, termInfo: () => { const cls = state.params.cls, t = termNow(), o = window.SchoolPadiSchemes.termOpening(t, { cls }), mine = (window.GuidedProfile.get().termOpen || {})[openKey(t, cls)]; return { term: t, name: termWord(cls), key: openKey(t, cls), calendar: o.open, mine: mine || '', estimated: o.estimated }; } });
      const d = !saved || !saved.params ? window.GuidedProfile.defaults() : null;
      if (d) { state.params.cls = d.cls; state.params.subject = d.subject; }
      continueWeek();
    }

    // Public lesson-plan catalogue links can preselect a validated JHS plan.
    // The catalogue flag additionally starts the standard shared weekly package automatically.
    let catalogueAuto = false, catalogueSelectionValid = false;
    try {
      const q = new URLSearchParams(location.search);
      catalogueAuto = q.get('catalogue') === '1';
      const linkedClass = q.get('class');
      const linkedSubject = q.get('subject');
      const linkedTerm = Number(q.get('term'));
      const linkedWeek = Number(q.get('week'));
      if (['Basic 7', 'Basic 8', 'Basic 9'].includes(linkedClass) &&
          subjectsOf(linkedClass).includes(linkedSubject) &&
          termsFor(linkedClass).includes(linkedTerm) &&
          weeksFor(linkedClass).includes(linkedWeek)) {
        catalogueSelectionValid = true;
        state.params.cls = linkedClass;
        state.params.subject = linkedSubject;
        state.params.term = linkedTerm;
        state.params.week = linkedWeek;
        // Use the normal shared lesson-plan package, not the lesson-plan-only output override.
        state.params.mode = 'full';
        state.params.studyNotes = true;
        state.params.bece = true;
        termSet(linkedTerm);
        store.save(true);
      }
    } catch (e) { /* ignore invalid or unavailable catalogue links */ }

    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light', false);

    const ddSubject = makeDropdown($('#ddSubject'), { name: 'Subject', items: () => {
      const all = subjectsOf(state.params.cls), mine = mySubjectsOf(state.params.cls);
      if (!mine.length) return all.map((x) => ({ id: x, label: x }));
      const shown = mine.includes(state.params.subject) || !all.includes(state.params.subject) ? mine : [state.params.subject, ...mine];   // the subject in use never vanishes from its own menu
      return shown.map((x) => ({ id: x, label: x }));   // a teacher with a profile sees only the subjects they teach (change them in Settings)
    }, get: () => state.params.subject, set: (v) => { state.params.subject = v; continueWeek(); store.save(); syncPills(); }, label: (x) => x });
    const chooseClass = (v) => {
      if (levelOf(v).id !== levelOf(state.params.cls).id) delete state.params.inc;   // the inclusive choices follow the level: a new level starts from its own defaults
      state.params.cls = v;
      if (!subjectsOf(v).includes(state.params.subject)) state.params.subject = mySubjectsOf(v)[0] || subjectsOf(v)[0];   // a subject that is not taught at this level falls back to the teacher's first one
      if (state.params.week > weeksFor(v).length) state.params.week = 1;
      continueWeek(); ddSubject.build(); ddTerm.build(); syncPills(); store.save();
    };
    makeDropdown($('#ddClass'), { name: 'Class', items: () => {
      const mine = window.GuidedProfile ? window.GuidedProfile.myClasses() : [];
      const rest = (l) => l.classes.filter((x) => !mine.includes(x));
      return (mine.length ? [{ header: 'My classes' }, ...mine.map((x) => ({ id: x, label: x }))] : [])
        .concat(GL.LEVELS.flatMap((l) => rest(l).length ? [{ header: mine.length ? 'Other ' + l.name : l.name }, ...rest(l).map((x) => ({ id: x, label: x }))] : []));
    }, get: () => state.params.cls, set: chooseClass, label: (x) => x });
    startPlanFor = (cls) => {                           // the + on a class folder: a fresh plan with that class already chosen
      newSession();
      if (state.streaming) return;
      chooseClass(cls);
      if (!coarse) promptEl.focus();
    };
    const ddTerm = makeDropdown($('#ddTerm'), { name: 'Term', items: () => termsFor(state.params.cls).map((x) => ({ id: x, label: termWord(state.params.cls) + ' ' + x + (x === termAuto() ? ' (now)' : '') })), get: () => termsFor(state.params.cls).includes(Number(state.params.term)) ? Number(state.params.term) : termNow(), set: (v) => { termSet(v); continueWeek(); syncPills(); }, label: (x) => termWord(state.params.cls) + ' ' + x });
    window.addEventListener('guided:account', () => { ddTerm.build(); syncScheme(); syncSummaryToggle(); });
    makeDropdown($('#ddWeek'), { name: 'Week', items: () => weeksFor(state.params.cls).map((x) => { const we = weekEnd(termNow(), x, state.params.cls); return { id: x, label: 'Week ' + x, sub: we ? (we.afterClose ? 'date to be confirmed' : we.short + (x === calendarWeek() ? ' · this week' : '')) : '' }; }), get: () => state.params.week, set: (v) => { state.params.week = v; store.save(); syncScheme(); }, label: (x) => 'Week ' + x });

    makeDropdown($('#ddSize'), { name: 'Class size', items: SIZES.map((x) => ({ id: x, label: x + ' learners' })), get: () => state.params.size, set: (v) => { state.params.size = v; syncSummary(); store.save(); }, label: (x) => x + ' learners' });
    syncHook(); syncLight(); syncInc(); syncContent(); syncScheme(); syncAlso();
    syncNav();
    const s = makeSession();
    state.sessions.unshift(s);
    showSession(s.id);
    if (!coarse && !isMobile()) promptEl.focus();
    loadConfig().then(() => {
      if (!catalogueAuto) return;
      // Remove the one-shot flag before starting so refreshes never generate duplicates.
      try { const u = new URL(location.href); u.searchParams.delete('catalogue'); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (e) { /* ignore */ }
      if (!catalogueSelectionValid) {
        toast('That lesson-plan selection is not valid. Please return to the catalogue and choose it again.');
        return;
      }
      state.params.mode = 'full';
      state.params.studyNotes = true;
      state.params.bece = true;
      promptEl.value = 'Create the complete weekly lesson plan package using GuidEd’s standard shared lesson-plan output format for the selected class, subject, term and week. Follow the selected week’s curriculum scheme. Include the lesson metadata, both lessons, study notes, BECE practice and assessment rubric required by the standard JHS format.';
      autoGrow();
      submit();
    }).catch(() => {
      if (catalogueAuto) toast('GuidEd could not start the lesson plan. Please try again.');
    });
    setInterval(() => { renderSessions(); updateTopbar(); }, 30000);
  }

  // Collapsible sections in the sidebar (Settings, Teacher details). The Settings choice is remembered on this device.
  document.querySelectorAll('[data-disc]').forEach((btn) => {
    const panel = document.getElementById(btn.dataset.disc);
    if (!panel) return;
    const key = 'schoolpadi.open.' + btn.dataset.disc;
    const set = (open, save) => {
      btn.setAttribute('aria-expanded', String(open)); panel.hidden = !open;
      if (save) { try { localStorage.setItem(key, open ? '1' : '0'); } catch (e) { /* ignore */ } }
    };
    btn.addEventListener('click', () => set(panel.hidden, true));
    try { if (localStorage.getItem(key) === '1') set(true, false); } catch (e) { /* ignore */ }
  });

  /* Account role controls which dashboard is shown. Resolve it from the signed-in account. */
  let accountRole = (() => { try { const pin = localStorage.getItem('guided.startIn'); if (pin === 'parent' || pin === 'teacher') return pin === 'parent' ? 'parent' : ''; return localStorage.getItem('guided.role') === 'parent' ? 'parent' : ''; } catch (e) { return ''; } })();   // cached, so a parent never sees the studio flash up
  const SIGNED_KEY = 'guided.signedIn';
  const signedBefore = (() => { try { return localStorage.getItem(SIGNED_KEY) === '1' || !!localStorage.getItem('schoolpadi.auth'); } catch (e) { return false; } })();
  let earlyDash = false;
  let accountProfile = null;
  let accountProfileRequest = null;
  let accountProfileLoaded = false;
  let accountProfileError = false;
  /* A parent account never sees the Teaching Studio: its home is the Parent Dashboard. The role is cached so the right
     screen shows on the first paint, before the profile has been fetched. */
  function applyRoleUi() {
    const parent = accountRole === 'parent';
    document.body.classList.toggle('role-parent', parent);
    updateRoleButton();
    if (window.GuidedPlans && window.GuidedPlans.rerender) window.GuidedPlans.rerender();
    const t = $('#roleCardTitle'); if (t) t.textContent = parent ? 'Family' : 'Teacher';
    const keep = $('#clearCacheKeep'); if (keep) keep.textContent = parent ? 'Your saved lessons are kept.' : 'Your saved plans are kept.';
    const fb = $('#familyBtn'), rr = $('#reminderRow'); if (fb) fb.hidden = !parent; if (rr) rr.hidden = !parent;
    const rt = $('#reminderToggle'); if (rt) rt.setAttribute('aria-checked', accountProfile && accountProfile.familyReminders === false ? 'false' : 'true');
    syncSummaryToggle();
    const label = $('#newSession span');
    if (label) label.textContent = parent ? 'New Home Lesson' : 'New Plan';
    try { if (accountRole) localStorage.setItem('guided.role', accountRole); else localStorage.removeItem('guided.role'); } catch (e) { /* storage blocked */ }
  }
  // Switching between teacher and parent views, or adding the other role to this account.
  let launchRoleApplied = false;
  function updateRoleButton() {
    const b = $('#asRole'); if (!b) return;
    const roles = accountProfile && Array.isArray(accountProfile.roles) ? accountProfile.roles : [];
    const both = roles.includes('teacher') && roles.includes('parent');
    const chip = $('#roleChip'), chipText = $('#roleChipText');
    if (chip) { chip.hidden = !both || !accountRole; if (both) { const cur = accountRole === 'parent' ? 'Parent' : 'Teacher'; chipText.textContent = cur; chip.title = 'Viewing as ' + cur + '. Tap to switch.'; chip.dataset.role = accountRole === 'parent' ? 'teacher' : 'parent'; } }
    const sr = $('#startInRow'), ss = $('#startInSelect');
    if (sr) { sr.hidden = !both; if (ss && both) ss.value = ['teacher', 'parent'].includes(accountProfile && accountProfile.startIn) ? accountProfile.startIn : 'last'; }
    if (!roles.length || !accountRole) { b.hidden = true; return; }
    const other = accountRole === 'parent' ? 'teacher' : 'parent';
    b.hidden = false;
    b.dataset.role = other;
    b.dataset.add = roles.includes(other) ? '' : '1';
    b.textContent = roles.includes(other) ? 'Switch to ' + (other === 'parent' ? 'Parent' : 'Teacher') + ' view' : 'I am also a ' + other + ': add ' + (other === 'parent' ? 'Parent' : 'Teacher') + ' view';
  }
  async function switchRole(role, add) {
    if (!accountProfile || !window.PadiSync || !window.PadiSync.setAccountProfile) return;
    const roles = [...new Set([...(accountProfile.roles || []), role])];
    const next = Object.assign({}, accountProfile, { roles, primaryRole: role });
    delete next.updatedAt;
    if (role === 'parent' && !Array.isArray(next.children)) next.children = [];
    try {
      const res = await window.PadiSync.setAccountProfile(next);
      const saved = res && res.profile ? res.profile : next;
      window.dispatchEvent(new CustomEvent('guided:account-profile-saved', { detail: saved }));
      if (add) toast('Added. Use the switch in the top bar to change views, and pick where GuidEd opens in Settings.');
      if (role === 'teacher') showPage(null); else showPage('dashboard');
      try { const d = $('#acctSheet'); if (d && d.close) d.close(); } catch (e) { /* ignore */ }
    } catch (e) { toast(e && e.message || 'Could not switch view. Please try again.'); }
  }
  /* Teachers: the Sunday week-summary email switch. It lives on the server (the email link can switch it off too). */
  function syncSummaryToggle() {
    const row = $('#summaryRow'), t = $('#summaryToggle');
    if (!row || !t) return;
    const teacher = accountRole !== 'parent' && !!(window.PadiSync && window.PadiSync.user && window.PadiSync.user());
    row.hidden = !teacher;
    if (!teacher || !window.GuidedPlans || !window.GuidedPlans.billingPost) return;
    window.GuidedPlans.billingPost('summary-pref', {}).then((r) => { if (r && r.ok && r.j) t.setAttribute('aria-checked', r.j.on === false ? 'false' : 'true'); }).catch(() => {});
  }
  { const t = $('#summaryToggle');
    if (t) t.addEventListener('click', async () => {
      if (!window.GuidedPlans || !window.GuidedPlans.billingPost) return;
      const on = t.getAttribute('aria-checked') !== 'true';
      t.setAttribute('aria-checked', on ? 'true' : 'false');
      try { const r = await window.GuidedPlans.billingPost('summary-pref', { on }); if (!r.ok) throw new Error('save'); }
      catch (e) { t.setAttribute('aria-checked', on ? 'false' : 'true'); toast('Could not save that. Please try again.'); }
    }); }
  { const fb = $('#familyBtn'); if (fb) fb.addEventListener('click', () => { showPage('dashboard'); if (window.GuidedParentDashboard) window.GuidedParentDashboard.open('children'); }); }
  { const rt = $('#reminderToggle');
    if (rt) rt.addEventListener('click', async () => {
      if (!accountProfile || !window.PadiSync || !window.PadiSync.setAccountProfile) return;
      const on = rt.getAttribute('aria-checked') !== 'true';
      rt.setAttribute('aria-checked', on ? 'true' : 'false');
      const next = Object.assign({}, accountProfile, { familyReminders: on }); delete next.updatedAt;
      try {
        const res = await window.PadiSync.setAccountProfile(next);
        window.dispatchEvent(new CustomEvent('guided:account-profile-saved', { detail: res && res.profile ? res.profile : next }));
      } catch (e) { rt.setAttribute('aria-checked', on ? 'false' : 'true'); toast('Could not save that. Please try again.'); }
    }); }
  { const chip = $('#roleChip'); if (chip) chip.addEventListener('click', () => switchRole(chip.dataset.role, false)); }
  { const ss = $('#startInSelect');
    if (ss) ss.addEventListener('change', async () => {
      if (!accountProfile || !window.PadiSync || !window.PadiSync.setAccountProfile) return;
      const next = Object.assign({}, accountProfile, { startIn: ss.value }); delete next.updatedAt;
      try {
        const res = await window.PadiSync.setAccountProfile(next);
        const saved = res && res.profile ? res.profile : next;
        try { localStorage.setItem('guided.startIn', saved.startIn && saved.startIn !== 'last' ? saved.startIn : ''); } catch (e) { /* storage blocked */ }
        window.dispatchEvent(new CustomEvent('guided:account-profile-saved', { detail: saved }));
        toast(saved.startIn === 'last' ? 'GuidEd will open in the view you used last.' : 'GuidEd will open in ' + (saved.startIn === 'parent' ? 'Parent' : 'Teacher') + ' view.');
      } catch (e) { toast('Could not save that. Please try again.'); updateRoleButton(); }
    }); }
  { const b = $('#asRole'); if (b) b.addEventListener('click', () => switchRole(b.dataset.role, !!b.dataset.add)); }
  async function refreshAccountProfile() {
    if (!window.PadiSync || !window.PadiSync.user || !window.PadiSync.user() || !window.PadiSync.getAccountProfile) {
      accountRole = ''; accountProfile = null;
      if (earlyDash) { earlyDash = false; try { localStorage.removeItem(SIGNED_KEY); } catch (e) { /* ignore */ } if (pageOpen() && pageOpen()[0] === 'dashboard') showPage(null); }   // the remembered sign-in is gone
      return null;
    }
    if (accountProfileRequest) return accountProfileRequest;
    accountProfileRequest = window.PadiSync.getAccountProfile().then((profile) => {
      accountProfile = profile || null;
      accountRole = profile && (profile.primaryRole || (Array.isArray(profile.roles) ? profile.roles[0] : '')) || '';
      // A pinned "Open GuidEd in" applies once per launch, so switching view later in the session sticks.
      const isInitialLaunch = !launchRoleApplied;
      if (isInitialLaunch && profile && Array.isArray(profile.roles) && profile.roles.length > 1 && profile.roles.includes(profile.startIn)) accountRole = profile.startIn;
      launchRoleApplied = true;
      earlyDash = false; try { localStorage.setItem(SIGNED_KEY, '1'); } catch (e) { /* storage blocked */ }
      try { localStorage.setItem('guided.startIn', profile && profile.roles && profile.roles.length > 1 && profile.startIn && profile.startIn !== 'last' ? profile.startIn : ''); } catch (e) { /* storage blocked */ }
      window.GuidedAccountRole = accountRole;
      accountProfileLoaded = true;
      accountProfileError = false;
      applyRoleUi();
      // On a fresh signed-in launch, open the correct role dashboard directly.
      // Do not override navigation after the user has started using the app.
      if (isInitialLaunch && !pageOpen()) showPage('dashboard');
      else if (accountRole === 'parent' && !pageOpen()) showPage(null);
      const link = $('#dashboardLink');
      if (link) {
        const label = link.querySelector('span');
        if (label) label.textContent = accountRole === 'parent' ? 'Parent Dashboard' : 'Teacher Dashboard';
        link.setAttribute('aria-label', accountRole === 'parent' ? 'Parent Dashboard' : 'Teacher Dashboard');
      }
      if (pageOpen() && pageOpen()[0] === 'dashboard') {
        topTitle.textContent = accountRole === 'parent' ? 'Parent Dashboard' : 'Teacher Dashboard';
        if (accountRole === 'parent') renderParentDashboard();
        else renderDashboard();
      }
      return accountProfile;
    }).catch((error) => {
      console.warn('[GuidEd account profile] could not resolve dashboard role:', error && error.message);
      accountProfileError = true;
      if (pageOpen() && pageOpen()[0] === 'dashboard') renderDashboard();
      return null;
    }).finally(() => { accountProfileRequest = null; });
    return accountProfileRequest;
  }
  window.addEventListener('guided:account-profile-saved', (event) => {
    if (event && event.detail) { accountProfile = event.detail; accountRole = event.detail.primaryRole || (event.detail.roles || [])[0] || accountRole; window.GuidedAccountRole = accountRole; applyRoleUi(); if (accountRole === 'parent' && !pageOpen()) showPage(null); accountProfileLoaded = true; }
    if (pageOpen() && pageOpen()[0] === 'dashboard' && accountRole === 'parent') renderParentDashboard();
  });
  document.addEventListener('guided:parent-back', () => showPage(null));
  window.addEventListener('guided:account', () => {
    if (window.PadiSync && window.PadiSync.user && window.PadiSync.user()) refreshAccountProfile();
    else {
      const wasParent = accountRole === 'parent';
      try { localStorage.removeItem(SIGNED_KEY); } catch (e) { /* ignore */ }
      accountRole = ''; accountProfile = null; window.GuidedAccountRole = ''; accountProfileLoaded = false; accountProfileError = false;
      applyRoleUi();
      if ((wasParent || earlyDash) && pageOpen() && pageOpen()[0] === 'dashboard') showPage(null);   // signed out (or an old cached role): back to the normal studio
      const link = $('#dashboardLink');
      if (link) { const label = link.querySelector('span'); if (label) label.textContent = 'Teacher Dashboard'; }
    }
  });

  /* Settings and My Library are pages inside the main area; the sidebar keeps one link to each. */
  const studioLink = $('#studioLink');
  const PAGES = [['settings', 'Settings', $('#settingsPage'), $('#settingsLink')], ['dashboard', 'Teacher Dashboard', $('#dashboardPage'), $('#dashboardLink')], ['library', 'My Library', $('#libraryPage'), $('#libraryLink')]];
  const pageOpen = () => PAGES.find((x) => x[2] && !x[2].hidden);
  // Settings can be opened from the dashboard, Library or Studio. Remember its origin
  // so the Settings back button returns to the screen the user came from.
  let settingsReturnPage = null;
  function showPage(name) {
    if (name === 'settings') {
      const current = pageOpen();
      settingsReturnPage = current && current[0] !== 'settings' ? current[0] : null;
    }
    if (!name && accountRole === 'parent') name = 'dashboard';   // "back to planning" means the parent's home
    PAGES.forEach(([key, title, el, link]) => {
      if (!el) return;
      const on = key === name;
      el.hidden = !on;
      if (link) link.setAttribute('aria-current', on ? 'page' : 'false');
      document.body.classList.toggle('on-' + key, on);
      if (on) { const pageTitle = key === 'dashboard' && accountRole === 'parent' ? 'Parent Dashboard' : title; if (isMobile()) setNav(false); el.scrollTop = 0; topTitle.textContent = pageTitle; document.title = pageTitle + ' · GuidEd'; }
    });
    document.body.classList.toggle('on-page', !!name);
    if (studioLink) studioLink.setAttribute('aria-current', !name && accountRole !== 'parent' ? 'page' : 'false');
    if (!name) updateTopbar();
    if (name === 'library') renderLibrary();
    if (name === 'dashboard') renderDashboard();
  }
  const showSettings = (on) => showPage(on ? 'settings' : null);
  if (studioLink) studioLink.addEventListener('click', () => { showPage(null); if (isMobile()) setNav(false); });
  PAGES.forEach(([key, , el, link]) => { if (el && link) link.addEventListener('click', () => showPage(key)); });
  const settingsBack = $('#settingsBack');
  if (settingsBack) settingsBack.addEventListener('click', () => {
    const destination = settingsReturnPage;
    settingsReturnPage = null;
    showPage(destination || null);
  });
  [['#dashboardBack'], ['#libraryBack']].forEach(([sel]) => { const b = $(sel); if (b) b.addEventListener('click', () => showPage(null)); });
  // Anything that goes back to planning leaves the page first.
  document.addEventListener('click', (e) => {
    if (!pageOpen()) return;
    if (e.target.closest('#newSession, #brand, .sb-list, .f-add') || (e.target.closest('.v2-tabbar') && !e.target.closest('[data-tab="library"]'))) {
      showPage(null);
      if (accountRole === 'parent' && e.target.closest('#newSession') && window.GuidedParentDashboard) window.GuidedParentDashboard.open('lesson');
    }
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pageOpen() && !document.querySelector('dialog[open]')) showPage(null); });
  // A signed-in teacher opens straight on the dashboard too: remember it, so the Studio never flashes before the profile loads.
  if (signedBefore && accountRole !== 'parent' && !pageOpen()) { earlyDash = true; showPage('dashboard'); }
  if (accountRole === 'parent') { applyRoleUi(); showPage(null); }   // returning parent: straight to the dashboard (refreshAcct undoes this if they are not signed in)

  /* Parent Dashboard: account-backed child profile, separate from teacher planning. */
  function renderParentDashboard() {
    const page = $('#dashboardPage');
    if (!page) return;
    const teacherContent = page.querySelector('.dash-inner');
    if (teacherContent) teacherContent.hidden = true;
    let panel = $('#parentDashboardContent');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'parentDashboardContent';
      panel.className = 'sp-inner dash-inner parent-dashboard-content';
      page.appendChild(panel);
    }
    const adBox = $('#adSlotParent'); if (adBox && adBox.previousElementSibling !== panel) page.appendChild(adBox);   // the parent's banner sits under the dashboard
    panel.hidden = false;
    if (window.GuidedParentDashboard) { window.GuidedParentDashboard.mount(panel, accountProfile); return; }
    const profile = accountProfile || {};
    const children = Array.isArray(profile.children) ? profile.children : [];
    const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const childCards = children.map((child) => {
      const subjects = Array.isArray(child.subjects) ? child.subjects : [];
      return '<section class="dash-week parent-child-card"><div class="dash-section-head"><div><span class="dash-eyebrow">MY CHILD</span><h2>' + esc(child.name || 'Child') + '</h2></div><span class="dash-week-tag">' + esc(child.class || '') + '</span></div><p>Daily home-learning goal: <strong>' + esc(child.minutes || 30) + ' minutes</strong></p><div class="parent-subject-list">' + subjects.map((subject) => '<span class="lib-chip">' + esc(subject) + '</span>').join('') + '</div></section>';
    }).join('');
    panel.innerHTML = '<div class="sp-head"><button type="button" class="sp-back" id="parentDashboardBack"><svg class="ico"><use href="#i-chevron"/></svg><span>Back</span></button><h1>Parent Dashboard</h1></div><p class="dash-intro">A simple place to follow and support your child’s learning at home.</p>' +
      (childCards || '<section class="dash-week"><h2>No child profile found</h2><p>Please sign out and sign in again, or contact support if your child’s details are missing.</p></section>') +
      '<section class="dash-week"><span class="dash-eyebrow">YOUR NEXT STEP</span><h2>Home learning</h2><p>Your child’s class, subjects and daily learning time are saved to this account. Parent-specific home lessons, practice activities and progress tracking still need to be connected here.</p></section>';
    const back = $('#parentDashboardBack');
    if (back) back.addEventListener('click', () => showPage(null));
  }

  /* Teacher Dashboard: an overview derived from the teacher's saved sessions. */
  function renderDashboard() {
    if (accountRole === 'parent') { renderParentDashboard(); return; }
    if (window.PadiSync && window.PadiSync.user && window.PadiSync.user() && !accountProfileLoaded) {
      const page = $('#dashboardPage');
      const teacherContent = page && page.querySelector('.dash-inner');
      if (teacherContent) teacherContent.hidden = true;
      let panel = $('#parentDashboardContent');
      if (!panel && page) {
        panel = document.createElement('div'); panel.id = 'parentDashboardContent';
        panel.className = 'sp-inner dash-inner parent-dashboard-content'; page.appendChild(panel);
      }
      if (panel) {
        panel.hidden = false;
        panel.innerHTML = accountProfileError
          ? '<div class="sp-head"><h1>Dashboard unavailable</h1></div><p class="dash-intro">GuidEd could not verify your account type. Please check your connection and try again.</p><button type="button" class="as-second" id="retryAccountRole">Try again</button>'
          : '<div class="sp-head"><h1>Loading your dashboard</h1></div><p class="dash-intro">Checking your account type…</p>';
        const retry = $('#retryAccountRole');
        if (retry) retry.addEventListener('click', () => { accountProfileError = false; refreshAccountProfile(); });
      }
      if (!accountProfileRequest && !accountProfileError) refreshAccountProfile();
      return;
    }
    const parentPanel = $('#parentDashboardContent');
    const teacherContent = $('#dashboardPage .dash-inner');
    if (parentPanel) parentPanel.hidden = true;
    if (teacherContent) teacherContent.hidden = false;
    const teacherName = String((accountProfile && accountProfile.displayName) || profile().teacher || '').trim();
    const greeting = $('#dashTitle'); if (greeting) greeting.textContent = 'Good to see you, ' + (teacherName || 'Teacher');
    const all = state.sessions.filter((s) => s.messages.length).sort((a, b) => b.updatedAt - a.updatedAt);
    const plans = all.filter((s) => typeOf(s) === 'plan');
    const resources = all.length - plans.length;
    const classes = new Set(plans.map((s) => s.params && s.params.cls).filter(Boolean));
    const subjects = new Set(plans.map((s) => s.params && s.params.subject).filter(Boolean));
    const stats = $('#dashStats');
    if (stats) {
      if (!plans.length) {
        stats.replaceChildren(h('section', { class: 'dash-first-plan' },
          h('span', { class: 'dash-first-plan-icon' }, icon('spark')),
          h('div', { class: 'dash-first-plan-copy' },
            h('strong', { text: 'Let’s create your first lesson plan' }),
            h('span', { text: 'Your teaching workspace is ready. Start with a class and subject, and your plans and resources will appear here.' })
          ),
          h('button', { type: 'button', class: 'dash-first-plan-cta', 'data-dash-action': 'plan' }, icon('plus'), h('span', { text: 'Make my first plan' }))
        ));
      } else {
        const stat = (name, label, foot, tone) => h('article', { class: 'dash-stat' },
          h('span', { class: 'dash-stat-icon dash-stat-icon-' + tone }, icon(name)),
          h('div', { class: 'dash-stat-copy' },
            h('strong', { class: 'dash-stat-value', text: String(label === 'Lesson plans' ? plans.length : label === 'Subjects' ? subjects.size : label === 'Classes' ? classes.size : resources) }),
            h('span', { class: 'dash-stat-label', text: label }),
            h('span', { class: 'dash-stat-foot', text: foot })
          )
        );
        stats.replaceChildren(
          stat('clipboard', 'Lesson plans', 'Saved in your workspace', 'plans'),
          stat('layers', 'Subjects', 'With learning plans', 'subjects'),
          stat('users', 'Classes', 'Across your workspace', 'classes'),
          stat('library', 'Resources', 'Saved teaching resources', 'resources')
        );
      }
    }
    const term = Number(termNow()) || 1;
    const week = Number(state.params.week) || 1;
    const weekPlans = plans.filter((s) => s.params && Number(s.params.week) === week && Number(s.params.term || term) === term);
    const tag = $('#dashWeekTag'); if (tag) tag.textContent = termWord(state.params.cls) + ' ' + term + ' · Week ' + week;
    const weekList = $('#dashWeekList');
    if (weekList) {
      if (!weekPlans.length) weekList.replaceChildren(h('div', { class: 'dash-week-empty' }, h('strong', { text: 'Your week is ready to plan' }), h('span', { text: 'Saved plans for the selected term and week will appear here.' }), h('button', { type: 'button', class: 'dash-empty-action', 'data-dash-action': 'plan', text: 'Create a lesson plan' })));
      else {
        const grouped = new Map();
        weekPlans.forEach((s) => { const cls = (s.params && s.params.cls) || 'Class not specified'; if (!grouped.has(cls)) grouped.set(cls, []); grouped.get(cls).push(s); });
        const maxClassPlans = Math.max(1, ...Array.from(grouped.values()).map((rows) => rows.length));
        weekList.replaceChildren(...Array.from(grouped.entries()).map(([cls, rows]) => h('button', { type: 'button', class: 'dash-class-tile', 'data-dash-class': cls, 'aria-label': 'Open the latest ' + cls + ' lesson plan for week ' + week + ', ' + rows.length + ' saved ' + (rows.length === 1 ? 'plan' : 'plans') },
          h('span', { class: 'dash-class-symbol' }, icon('users')), h('strong', { text: cls }), h('span', { class: 'dash-class-count', text: rows.length + (rows.length === 1 ? ' plan' : ' plans') }),
          h('span', { class: 'dash-class-progress-track', 'aria-hidden': 'true' }, h('span', { class: 'dash-class-progress-fill', style: 'width:' + Math.round(rows.length / maxClassPlans * 100) + '%' })),
          h('span', { class: 'dash-class-open', text: 'Open latest plan' })
        )));
      }
    }
    const next = weekPlans[0] || plans[0], nextHost = $('#dashNextPlan');
    if (nextHost) {
      if (!next) nextHost.replaceChildren(h('div', { class: 'dash-next-empty' }, h('span', { class: 'dash-next-icon' }, icon('spark')), h('div', {}, h('strong', { text: 'Your next lesson starts here' }), h('span', { text: 'Create a plan and it will be ready to open from this space.' })), h('button', { type: 'button', class: 'dash-next-cta', 'data-dash-action': 'plan', text: 'Create plan' })));
      else nextHost.replaceChildren(h('button', { type: 'button', class: 'dash-next-card', 'data-dash-plan': next.id, 'aria-label': 'Open saved lesson plan: ' + ((next.params && next.params.cls) || 'Class') + ', ' + ((next.params && next.params.subject) || next.title || 'Lesson') + ', week ' + ((next.params && next.params.week) || week) },
        h('span', { class: 'dash-next-subject-icon' }, icon('book')),
        h('span', { class: 'dash-next-content' }, h('strong', { text: ((next.params && next.params.cls) || 'Class') + ' – ' + ((next.params && next.params.subject) || next.title) }), h('span', { text: next.title && next.params && next.params.subject ? next.title : 'Your saved lesson plan' }), h('span', { class: 'dash-next-meta', text: 'Week ' + ((next.params && next.params.week) || week) + ' · ' + rel(next.updatedAt) })),
        h('span', { class: 'dash-next-arrow', text: '›' })
      ));
    }
    const search = $('#dashSearch'), q = search ? search.value.trim().toLowerCase() : '';
    const visible = plans.filter((s) => { const p = s.params || {}; return !q || [s.title, p.subject, p.cls, p.week].join(' ').toLowerCase().includes(q); }).slice(0, 4);
    const recent = $('#dashRecentList');
    if (recent) recent.replaceChildren(...visible.map((s) => h('div', { class: 'dash-recent-item' },
      h('button', { type: 'button', class: 'dash-recent-card-main', 'data-dash-plan': s.id, 'aria-label': 'Open lesson plan: ' + ((s.params && s.params.cls) || 'Class') + ', ' + ((s.params && s.params.subject) || s.title || 'Lesson') + ', week ' + ((s.params && s.params.week) || 'unspecified') },
        h('span', { class: 'dash-recent-icon' }, icon('clipboard')),
        h('span', { class: 'dash-recent-content' }, h('strong', { text: ((s.params && s.params.cls) || 'Class') + ' – ' + ((s.params && s.params.subject) || s.title) }), h('span', { text: s.title || 'Saved lesson plan' })),
        h('span', { class: 'dash-recent-time', text: rel(s.updatedAt) })
      ),
      h('button', { type: 'button', class: 'dash-recent-more', 'data-dash-more': s.id, 'aria-label': 'More options for ' + (s.title || 'lesson plan'), 'aria-expanded': 'false', text: '···' }),
      h('div', { class: 'dash-plan-menu', hidden: true },
        h('button', { type: 'button', 'data-dash-menu-action': 'open', 'data-plan-id': s.id, text: 'Open lesson plan' }),
        h('button', { type: 'button', 'data-dash-menu-action': 'edit', 'data-plan-id': s.id, text: 'Edit plan' }),
        h('button', { type: 'button', 'data-dash-menu-action': 'delete', 'data-plan-id': s.id, text: 'Delete plan' })
      )
    )));
    const empty = $('#dashEmpty');
    if (empty) {
      empty.hidden = visible.length > 0;
      const emptyText = $('#dashEmptyText'), clearSearch = $('#dashClearSearch');
      if (emptyText) emptyText.textContent = q
        ? 'No lesson plans match “' + search.value.trim() + '”. Try another search.'
        : plans.length ? 'No recent lesson plans to show.' : 'No saved lesson plans yet. Create your first plan and it will appear here.';
      if (clearSearch) clearSearch.hidden = !q;
    }
  }
  if ($('#dashboardPage')) {
    $('#dashSearch').addEventListener('input', renderDashboard);
    $('#dashboardPage').addEventListener('click', (e) => {
      const more = e.target.closest('[data-dash-more]');
      if (more) {
        const item = more.closest('.dash-recent-item'), menu = item && item.querySelector('.dash-plan-menu');
        const open = menu && menu.hidden;
        document.querySelectorAll('.dash-plan-menu').forEach((m) => { m.hidden = true; });
        document.querySelectorAll('[data-dash-more]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
        if (menu && open) { menu.hidden = false; more.setAttribute('aria-expanded', 'true'); }
        return;
      }
      const menuAction = e.target.closest('[data-dash-menu-action]');
      if (menuAction) {
        const id = menuAction.dataset.planId, session = state.sessions.find((s) => s.id === id);
        if (menuAction.dataset.dashMenuAction === 'open' && session) { openSavedSession(id); return; }
        if (menuAction.dataset.dashMenuAction === 'edit' && session) { editSavedSession(id); return; }
        if (menuAction.dataset.dashMenuAction === 'delete' && session && window.confirm('Delete this saved lesson plan? This cannot be undone.')) { deleteSession(id); renderDashboard(); }
        return;
      }
      const classTile = e.target.closest('[data-dash-class]');
      if (classTile) {
        const cls = classTile.dataset.dashClass;
        const match = state.sessions.filter((s) => s.messages.length && typeOf(s) === 'plan' && s.params && s.params.cls === cls && Number(s.params.week) === week && Number(s.params.term || term) === term).sort((a, b) => b.updatedAt - a.updatedAt)[0];
        if (match) { openSavedSession(match.id); }
        return;
      }
      const plan = e.target.closest('[data-dash-plan]');
      if (plan) { openSavedSession(plan.dataset.dashPlan); return; }
      const action = e.target.closest('[data-dash-action]');
      if (action) {
        const routes = {
          plan: { tab: 'plan' },
          notes: { tab: 'resources', mode: 'resources', resourceType: 'Study notes' },
          media: { tab: 'media' },
          worksheet: { tab: 'resources', mode: 'resources', resourceType: 'Learner worksheet' }
        };
        const route = routes[action.dataset.dashAction];
        if (!route) return;
        showPage(null);
        newSession();
        if (route.mode) state.params.mode = route.mode;
        if (route.resourceType) {
          state.params.resourceType = route.resourceType;
          const type = $('#resourceType');
          if (type) { type.value = route.resourceType; type.dispatchEvent(new Event('change', { bubbles: true })); }
        }
        setStudioTab(route.tab);
        if (route.tab === 'media') loadMediaContext();
        return;
      }
      if (e.target.closest('#dashClearSearch')) { const search = $('#dashSearch'); if (search) { search.value = ''; renderDashboard(); search.focus(); } return; }
      if (e.target.closest('#dashViewAll')) { libType = 'plan'; showPage('library'); return; }
      if (e.target.closest('#dashViewWeek')) { const week = $('#dashWeekList'); if (week) week.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  }

  /* My Library: a curated, searchable collection of saved teaching materials. */
  let libType = 'all';
  function renderLibrary() {
    const grid = $('#libGrid'); if (!grid) return;
    const search = $('#libSearch');
    const q = (search && search.value || '').trim().toLowerCase();
    const all = state.sessions.filter((s) => s.messages.length).sort((a, b) => b.updatedAt - a.updatedAt);
    const counts = {}; all.forEach((s) => { const t = typeOf(s); counts[t] = (counts[t] || 0) + 1; });
    const count = $('#libraryCount'); if (count) count.textContent = String(all.length);
    const chips = $('#libChips');
    if (chips) chips.replaceChildren(...[['all', 'Everything', all.length]].concat(TYPE_ORDER.filter((t) => counts[t] || (libType === t && t === 'plan')).map((t) => [t, TYPE_LABEL[t], counts[t] || 0]))
      .map(([id, label, n]) => h('button', { type: 'button', class: 'lib-chip', 'data-type': id, 'aria-pressed': String(libType === id) }, h('span', { text: label }), h('small', { text: String(n) }))));
    const list = all.filter((s) => (libType === 'all' || typeOf(s) === libType) &&
      (!q || [s.title, s.params && s.params.cls, s.params && s.params.subject, s.params && s.params.week, s.params && s.params.resourceType].join(' ').toLowerCase().includes(q)));
    const resultCount = $('#libraryResultsCount'); if (resultCount) resultCount.textContent = list.length + (list.length === 1 ? ' item' : ' items');
    const resultsTitle = $('#libraryResultsTitle'); if (resultsTitle) resultsTitle.textContent = q ? 'Search results' : libType === 'all' ? 'Your saved work' : TYPE_LABEL[libType] || 'Your saved work';
    const kindClass = (type) => ({ plan: 'plan', 'Study notes': 'notes', 'Learner worksheet': 'worksheet', 'Homework pack': 'homework', 'BECE practice': 'exam', 'Teaching slides': 'slides' }[type] || 'resource');
    const previewLine = (width, extra = '') => h('span', { class: 'lib-preview-line ' + extra, style: 'width:' + width });
    const libraryPreview = (kind) => {
      const page = h('span', { class: 'lib-preview-page' });
      if (kind === 'notes') {
        page.append(h('span', { class: 'lib-preview-heading' }), previewLine('88%'), previewLine('76%'), h('span', { class: 'lib-preview-subheading' }), previewLine('91%'), previewLine('66%'));
      } else if (kind === 'worksheet') {
        [1, 2, 3].forEach((n) => page.append(h('span', { class: 'lib-preview-question' }, h('b', { text: n + '.' }), previewLine('76%')), previewLine('88%', 'answer')));
      } else if (kind === 'plan') {
        [1, 2, 3].forEach((n) => page.append(h('span', { class: 'lib-preview-stage' }, h('b', { text: ['INTRO', 'ACTIVITY', 'REVIEW'][n - 1] }), previewLine('54%'))));
      } else if (kind === 'slides') {
        page.append(h('span', { class: 'lib-preview-slide-title' }), h('span', { class: 'lib-preview-slide-art' }, h('i'), h('i')), previewLine('78%'));
      } else if (kind === 'homework') {
        [1, 2, 3].forEach(() => page.append(h('span', { class: 'lib-preview-check-row' }, h('i'), previewLine('78%'))));
        page.append(previewLine('62%'));
      } else if (kind === 'exam') {
        [1, 2, 3].forEach((n) => page.append(h('span', { class: 'lib-preview-question' }, h('b', { text: n + '.' }), previewLine('78%')), h('span', { class: 'lib-preview-options' }, h('i'), h('i'), h('i'), h('i'))));
      } else {
        page.append(h('span', { class: 'lib-preview-heading' }), previewLine('86%'), previewLine('68%'));
      }
      return h('span', { class: 'lib-preview lib-preview-' + kind, 'aria-hidden': 'true' }, page);
    };
    grid.replaceChildren(...list.map((s) => {
      const type = typeOf(s), p = s.params || {}, kind = kindClass(type);
      const heading = p.subject || s.title || TYPE_LABEL[type];
      const meta = p.cls ? [p.cls, p.term ? termWord(p.cls) + ' ' + p.term : '', p.week ? 'Week ' + p.week : ''].filter(Boolean).join(' · ') : (s.title || 'Saved teaching resource');
      return h('article', { class: 'lib-item lib-kind-' + kind },
        h('button', { type: 'button', class: 'lib-card', 'data-id': s.id, 'aria-label': 'Open ' + (TYPE_LABEL[type] || type) + ': ' + heading },
          h('span', { class: 'lib-card-top' }, libraryPreview(kind), h('span', { class: 'lib-card-type', text: TYPE_LABEL[type] || type })),
          h('span', { class: 'lib-name', text: heading }),
          h('span', { class: 'lib-description', text: s.title && s.title !== heading ? s.title : type === 'plan' ? 'Lesson plan and teaching sequence' : 'Saved teaching resource' }),
          h('span', { class: 'lib-meta', text: meta }),
          h('span', { class: 'lib-card-footer' }, h('span', { class: 'lib-time' }, icon('calendar'), h('span', { text: rel(s.updatedAt) })), h('span', { class: 'lib-open-label' }, 'Open', icon('chevron')))
        ),
        h('div', { class: 'lib-item-menu', hidden: true, role: 'group', 'aria-label': 'Plan actions' },
          h('button', { type: 'button', 'data-lib-action': 'open', 'data-plan-id': s.id, text: 'Open' }),
          h('button', { type: 'button', 'data-lib-action': 'edit', 'data-plan-id': s.id, text: 'Edit' }),
          h('button', { type: 'button', class: 'lib-menu-delete', 'data-lib-action': 'delete', 'data-plan-id': s.id, text: 'Delete' })
        )
      );
    }));
    const empty = $('#libEmpty');
    if (empty) {
      empty.hidden = !!list.length;
      if (!all.length) {
        $('#libraryEmptyTitle').textContent = 'Your library is ready for its first resource';
        $('#libraryEmptyText').textContent = 'Create a lesson plan, study note or worksheet. Your teaching materials will be kept here for easy access.';
        $('#libraryEmptyCreate span').textContent = 'Create your first lesson plan';
      } else {
        $('#libraryEmptyTitle').textContent = q ? 'No matching materials found' : 'Nothing in this collection yet';
        $('#libraryEmptyText').textContent = q ? 'Try another topic, subject or class name.' : 'Choose another collection or create a new teaching resource.';
        $('#libraryEmptyCreate span').textContent = 'Create a lesson plan';
      }
    }
  }
  if ($('#libraryPage')) {
    $('#libSearch').addEventListener('input', renderLibrary);
    $('#libraryCreate').addEventListener('click', () => { showPage(null); const b = $('#newSession'); if (b) b.click(); });
    $('#libraryEmptyCreate').addEventListener('click', () => { showPage(null); const b = $('#newSession'); if (b) b.click(); });
    $('#libChips').addEventListener('click', (e) => { const b = e.target.closest('.lib-chip'); if (b) { libType = b.dataset.type; renderLibrary(); } });
    const libGrid = $('#libGrid');
    let pressTimer = null, pressedItem = null, suppressCardClick = false;
    const closeLibraryMenus = (except) => libGrid.querySelectorAll('.lib-item-menu').forEach((menu) => { if (!except || menu !== except) menu.hidden = true; });
    const revealLibraryMenu = (card) => {
      const item = card && card.closest('.lib-item'); if (!item) return;
      const menu = item.querySelector('.lib-item-menu');
      closeLibraryMenus(menu); if (menu) menu.hidden = false;
      suppressCardClick = true;
    };
    libGrid.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('.lib-card'); if (!card || e.target.closest('.lib-item-menu')) return;
      pressedItem = card;
      if (e.pointerType === 'touch' || e.pointerType === 'pen') pressTimer = setTimeout(() => { revealLibraryMenu(pressedItem); pressTimer = null; }, 520);
    });
    ['pointerup','pointercancel','pointerleave'].forEach((name) => libGrid.addEventListener(name, () => { if (pressTimer) clearTimeout(pressTimer); pressTimer = null; pressedItem = null; }));
    libGrid.addEventListener('contextmenu', (e) => { const card = e.target.closest('.lib-card'); if (card) { e.preventDefault(); revealLibraryMenu(card); } });
    libGrid.addEventListener('click', (e) => {
      const action = e.target.closest('[data-lib-action]');
      if (action) {
        const id = action.dataset.planId, session = state.sessions.find((x) => x.id === id);
        closeLibraryMenus();
        if (!session) return;
        if (action.dataset.libAction === 'open') openSavedSession(id);
        else if (action.dataset.libAction === 'edit') editSavedSession(id);
        else if (action.dataset.libAction === 'delete' && window.confirm('Delete "' + (session.params ? session.params.subject + ' · ' + session.params.cls + ' · Week ' + session.params.week : session.title) + '"? This cannot be undone.')) { deleteSession(id); renderLibrary(); }
        return;
      }
      const card = e.target.closest('.lib-card');
      if (card) { if (suppressCardClick) { suppressCardClick = false; return; } closeLibraryMenus(); openSavedSession(card.dataset.id); return; }
      if (!e.target.closest('.lib-item-menu')) closeLibraryMenus();
    });
  }

  // Clears the app's cached files (not the saved plans) and reloads, so a stuck or outdated copy is replaced.
  const clearBtn = $('#clearCacheBtn');
  if (clearBtn) clearBtn.addEventListener('click', async () => {
    clearBtn.disabled = true; clearBtn.querySelector('span').textContent = 'Clearing…';
    try {
      if ('serviceWorker' in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((r) => r.unregister())); }
      if (window.caches) { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); }
    } catch (e) { /* reload anyway */ }
    toast('Cache cleared. Reloading…');
    setTimeout(() => location.reload(), 600);
  });

  init();
  { const sp = document.getElementById('splash');            // the installed app's splash: shown a moment, then fades
    if (sp) setTimeout(() => { sp.classList.add('is-out'); setTimeout(() => sp.remove(), 450); }, document.documentElement.classList.contains('splash-on') ? 900 : 0); }
})();
