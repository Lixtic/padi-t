/* Padi-T · GES lesson planner · app.js
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
  // Canned requests behind the "Create from this plan" buttons. The server prompt knows these exact lines.
  const ASKS = {
    worksheet: "Create the learner worksheet for this week's lessons.",
    homework: 'Create the homework pack for this week.',
    bece: "Write 10 more BECE-style questions on this week's topics.",
  };
  const KIND_TITLE = { plan: '', worksheet: ' – Learner Worksheet', homework: ' – Homework Pack', bece: ' – BECE Practice' };
  const kindOfAsk = (text) => Object.keys(ASKS).find((k) => ASKS[k] === text) || 'plan';
  const NS = 'http://www.w3.org/2000/svg';

  const SUBJECTS = [
    'Integrated Science', 'Mathematics', 'English Language', 'Social Studies',
    'Religious and Moral Education', 'Computing', 'Career Technology',
    'Creative Arts and Design', 'Ghanaian Language', 'French', 'Physical Education and Health',
  ];
  const CLASSES = ['Basic 7', 'Basic 8', 'Basic 9'];
  const WEEKS = Array.from({ length: 15 }, (_, i) => i + 1);

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

  /* ───────── Markdown renderer (tables, headings, lists; all text is escaped first) ───────── */
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<em>$2</em>');
  }

  function cellHtml(text) {
    const lines = text.split(/<br\s*\/?>/i).map((l) => l.trim()).filter(Boolean);
    return lines.map((l) => {
      let m = l.match(/^[-•*]\s+(.*)$/);
      if (m) return '<div class="li">' + inline(m[1]) + '</div>';
      m = l.match(/^(\d{1,2}[.)])\s+(.*)$/);
      if (m) return '<div class="li num"><span class="n">' + esc(m[1]) + '</span>' + inline(m[2]) + '</div>';
      return '<div class="ln">' + inline(l) + '</div>';
    }).join('');
  }

  function splitRow(line) {
    let s = line.trim().replace(/\\\|/g, '\u0001');
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    return s.split('|').map((c) => c.replace(/\u0001/g, '|').trim());
  }

  function tableHtml(lines) {
    const rows = [];
    for (const l of lines) {
      const cells = splitRow(l);
      if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
      rows.push(cells);
    }
    if (!rows.length) return '';
    let head = rows[0];
    let body = rows.slice(1);
    const blank = head.every((c) => !c);
    if (blank) { head = null; }
    const cols = Math.max(...rows.map((r) => r.length));
    const label = head && /phase|duration|criteri|aspect|stage/i.test(head[0]);
    const cls = ['tbl'];
    if (!head) cls.push('kv');
    if (label) cls.push('label-col');
    if (label && cols === 3) cls.push('lesson');
    if (head && cols >= 6) cls.push('wide');
    const pad = (r) => r.concat(Array(Math.max(0, cols - r.length)).fill(''));
    const isPhaseRow = (r) => /^\**\s*phase\s*\/\s*duration/i.test(r[0] || '');
    const joined = !head && rows.some(isPhaseRow);               // Metadata + Lesson 1 + Lesson 2 as one table
    if (joined) cls.push('joined');
    let html = '<div class="tbl-wrap"><table class="' + cls.join(' ') + '">';
    if (joined) {
      let inLesson = false;
      html += '<tbody>' + rows.slice(1).map((r) => {
        const only = r[0] && cols > 1 && r.slice(1).every((c) => !c);
        if (only) return '<tr class="' + (/^\**\s*lesson\s*(\d|one|two)\b/i.test(r[0]) ? 'lt' : 'sp') + '"><td colspan="' + cols + '">' + cellHtml(r[0]) + '</td></tr>';
        if (isPhaseRow(r)) { inLesson = true; return '<tr class="ph">' + pad(r).map((c) => '<th>' + cellHtml(c) + '</th>').join('') + '</tr>'; }
        const names = ['', 'Learning activities', 'Resources'];
        return '<tr' + (inLesson ? ' class="phase"' : '') + '>' + pad(r).map((c, ci) => '<td' + (inLesson && names[ci] ? ' data-l="' + names[ci] + '"' : '') + '>' + cellHtml(c) + '</td>').join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
      return html;
    }
    if (head) html += '<thead><tr>' + pad(head).map((c) => '<th>' + cellHtml(c) + '</th>').join('') + '</tr></thead>';
    html += '<tbody>' + (head ? body : rows.slice(1)).map((r) => '<tr>' + pad(r).map((c) => '<td>' + cellHtml(c) + '</td>').join('') + '</tr>').join('') + '</tbody>';
    return html + '</table></div>';
  }

  function renderMd(text) {
    if (window.SchoolPadiJoin) text = window.SchoolPadiJoin.join(text);
    const lines = text.replace(/\r/g, '').split('\n');
    let html = '', list = null, para = [];
    const flushP = () => { if (para.length) { html += '<p>' + para.map(inline).join('<br>') + '</p>'; para = []; } };
    const flushL = () => { if (list) { html += '<' + list.t + (list.start > 1 ? ' start="' + list.start + '"' : '') + '>' + list.items.map((x) => '<li>' + inline(x) + '</li>').join('') + '</' + list.t + '>'; list = null; } };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trimEnd();
      let m;
      if (/^\s*```/.test(line)) continue;
      if (!line.trim()) { flushP(); flushL(); continue; }
      if (/^\s*\|/.test(line) && (line.match(/\|/g) || []).length >= 2) {
        flushP(); flushL();
        const block = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) { block.push(lines[i]); i++; }
        i--;
        html += tableHtml(block);
        continue;
      }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushP(); flushL(); html += '<hr>'; continue; }
      if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*$/))) {
        flushP(); flushL();
        const lvl = Math.min(m[1].length, 3);
        html += '<h' + (lvl + 1) + ' class="h' + lvl + '">' + inline(m[2]) + '</h' + (lvl + 1) + '>';
        continue;
      }
      if ((m = line.match(/^\s*[-•*]\s+(.*)$/))) {
        flushP(); if (!list || list.t !== 'ul') { flushL(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); continue;
      }
      if ((m = line.match(/^\s*(\d{1,2})[.)]\s+(.*)$/))) {
        const opt = /^\s*[A-Da-d][.)]\s+\S/;
        if (opt.test(lines[i + 1] || '')) {              // a multiple-choice question: stem, then options A to D on their own lines
          flushP(); flushL();
          const opts = [];
          while (i + 1 < lines.length && opt.test(lines[i + 1])) { i++; opts.push(lines[i].trim().match(/^([A-Da-d])[.)]\s+(.*)$/)); }
          html += '<div class="mcq"><p class="q"><span class="qn">' + m[1] + '.</span> <span class="qt">' + inline(m[2]) + '</span></p><div class="opts">'
            + opts.map((o) => '<div class="opt"><span class="ol">' + o[1].toUpperCase() + '.</span><span class="ot">' + inline(o[2]) + '</span></div>').join('') + '</div></div>';
          continue;
        }
        flushP(); if (!list || list.t !== 'ol') { flushL(); list = { t: 'ol', start: Number(m[1]), items: [] }; } list.items.push(m[2]); continue;
      }
      if ((m = line.match(/^\*\*([^*]+?)\*\*\s*:?\s*$/)) && line.length < 120) {
        flushP(); flushL(); html += '<h4 class="h3">' + inline(m[1]) + '</h4>'; continue;
      }
      flushL();
      para.push(line.replace(/<br\s*\/?>/gi, ' '));
    }
    flushP(); flushL();
    return html;
  }

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
    params: { subject: SUBJECTS[0], cls: 'Basic 8', week: 1, hook: true, size: '31–45', light: false },
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
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ teacher: teacherInput.value.trim(), school: schoolInput.value.trim(), updatedAt: Date.now() })); } catch (e) { /* storage blocked */ }
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

  function renderSessions() {
    const q = searchInput.value.trim().toLowerCase();
    const items = state.sessions
      .filter((s) => s.messages.length || s.id === state.currentId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((s) => !q || s.title.toLowerCase().includes(q));
    listEl.replaceChildren(...items.map((s) => {
      const st = statusOf(s);
      return h('li', { class: 's-row' },
        h('button', { type: 'button', class: 's-item', 'data-id': s.id, 'aria-current': String(s.id === state.currentId) },
          h('span', { class: 'dot dot-' + st, role: 'img', 'aria-label': STATUS[st], title: STATUS[st] }),
          h('span', { class: 's-text' },
            h('span', { class: 's-title', text: s.params ? s.params.subject : s.title }),
            s.params ? h('span', { class: 's-sub', text: s.params.cls + ' · Week ' + s.params.week + (s.copy ? ' · copy' : '') }) : null),
          h('span', { class: 's-time', text: rel(s.updatedAt) })),
        s.messages.length ? h('button', { type: 'button', class: 's-del', 'data-del': s.id, 'aria-label': 'Delete plan ' + s.title }, icon('trash')) : null);
    }));
    emptyEl.hidden = items.length > 0 || !q;
  }

  function updateTopbar() {
    const s = current();
    if (!s) return;
    topTitle.textContent = s.messages.length ? s.title : 'New plan';
    document.title = (s.messages.length ? s.title + ' · ' : '') + 'Padi-T';
    let st = statusOf(s);
    if (st !== 'running' && state.config.demo) st = 'demo';
    statusDot.className = 'dot dot-' + (st === 'demo' ? 'idle' : st);
    statusText.textContent = STATUS[st];
  }

  function updateView() {
    const s = current();
    const chat = !!(s && s.messages.length);
    main.dataset.view = chat ? 'chat' : 'landing';
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
    if (s.params) { state.params = Object.assign({ size: '31–45', light: false, hook: true }, s.params); syncPills(); }
    updateView(); updateTopbar(); renderSessions(); updateSend(); scrollBottom(true);
  }

  function newSession() {
    setComposer(false, true);
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
            p.light ? h('span', { class: 'tag', text: 'Low-resource' }) : null),
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
    const baseTitle = planTitle(session.params || state.params);
    let kind = 'plan', demoted = false, editBox = null, ta = null;
    const titleEl = h('span', { class: 'doc-title', text: baseTitle });
    const bodyEl = h('div', { class: 'doc-body md' });
    const noteEl = h('div', { class: 'doc-note', hidden: true });
    const chipsEl = h('div', { class: 'chips' });
    const extrasEl = h('div', { class: 'extras' });
    const metaEl = h('div', { class: 'meta' });
    const btnCopy = h('button', { type: 'button', class: 'tool', disabled: true }, icon('copy'), h('span', { text: 'Copy' }));
    const btnEdit = h('button', { type: 'button', class: 'tool', disabled: true, 'data-act': 'edit' }, icon('pencil'), h('span', { text: 'Edit' }));
    const btnReuse = h('button', { type: 'button', class: 'tool', disabled: true, 'data-act': 'reuse', title: 'Copy this plan into a new plan you can change freely' }, icon('layers'), h('span', { text: 'Reuse' }));
    const btnRegen = h('button', { type: 'button', class: 'tool', disabled: true }, icon('refresh'), h('span', { text: 'Regenerate' }));
    const btnDocx = h('button', { type: 'button', class: 'tool tool-main', disabled: true }, icon('download'), h('span', { text: 'Word (.docx)' }));
    const progress = h('span', { class: 'doc-progress', text: 'Writing…' });
    const root = h('div', { class: 'msg bot' },
      h('div', { class: 'avatar' }, icon('logo', 'logo')),
      h('div', { class: 'body' },
        h('div', { class: 'doc' },
          h('div', { class: 'doc-bar' },
            h('div', { class: 'doc-id' }, titleEl, progress),
            h('div', { class: 'doc-tools' }, btnCopy, btnEdit, btnReuse, btnRegen, btnDocx)),
          noteEl, bodyEl),
        chipsEl, extrasEl, metaEl));

    const tools = [btnCopy, btnEdit, btnReuse, btnRegen, btnDocx];

    function fillExtras() {
      if (demoted) { extrasEl.replaceChildren(); return; }
      const mk = (k, label, ic) => h('button', { type: 'button', class: 'extra-btn', 'data-ask': k, onclick: () => askFor(k) }, icon(ic), h('span', { text: label }));
      extrasEl.replaceChildren(
        h('span', { class: 'extras-label', text: 'Create from this plan' }),
        mk('worksheet', 'Learner worksheet', 'book'),
        mk('homework', 'Homework pack', 'calendar'),
        mk('bece', '10 more BECE questions', 'cap'));
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
      if (!window.PadiEditor) { startRawEdit(); return; }
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
      get title() { return baseTitle + (KIND_TITLE[kind] || ''); },
      get kind() { return kind; },
      setKind(k) { kind = KIND_TITLE[k] !== undefined ? k : 'plan'; titleEl.textContent = api.title; },
      set(raw, final, msg) {
        api.text = raw;
        const { body, chips } = splitElic(raw);
        bodyEl.innerHTML = renderMd(body);
        progress.textContent = final ? '' : 'Writing… ' + wordCount(body) + ' words';
        if (final) {
          api.msg = msg || null;
          tools.forEach((b) => { b.disabled = false; });
          metaEl.textContent = msg ? metaText(msg) : '';
          if (!demoted) {
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
    btnCopy.addEventListener('click', () => {
      const t = splitElic(api.text).body;
      const done = () => toast('Copied as text');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => toast('Copy was blocked by the browser'));
      else toast('Copy is not available in this browser');
    });
    btnEdit.addEventListener('click', () => {
      if (editor) editor.cancel();
      else if (editBox) { closeEdit(); api.set(api.text, true, api.msg); }
      else startEdit();
    });
    btnReuse.addEventListener('click', () => reuseSession());
    btnRegen.addEventListener('click', () => regenerate());
    btnDocx.addEventListener('click', () => exportDocx(api.text, api.title, btnDocx, kind));
    return api;
  }

  function askFor(kind) {
    if (state.streaming) return;
    promptEl.value = ASKS[kind];
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

  function nearBottom() { return messagesWrap.scrollHeight - messagesWrap.scrollTop - messagesWrap.clientHeight < 140; }
  function scrollBottom(force) { if (force || state.stick) messagesWrap.scrollTop = messagesWrap.scrollHeight; }
  messagesWrap.addEventListener('scroll', () => { state.stick = nearBottom(); }, { passive: true });

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
  function saveBlob(blob, title) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: title.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') + '.docx' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  async function exportDocx(text, title, btn, kind) {
    const layout = kind === 'worksheet' || kind === 'homework' ? 'portrait' : 'landscape';
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
        const blob = await window.SchoolPadiDocx.toFile(window.docx, title, splitElic(text).body, { portrait: layout === 'portrait', teacher: who.teacher, school: who.school });
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
    const res = await fetch('/api/generate', {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', 'x-access-code': state.access || '' },
      body: JSON.stringify({ params: { subject: p.subject, cls: p.cls, week: p.week, hook: p.hook !== false, light: p.light === true, size: p.size || '', notes: session.messages[0].content || '' }, thread: threadOf(session) }),
    });
    if (!res.ok) {
      let j = {};
      try { j = await res.json(); } catch (e) { /* not JSON */ }
      const err = new Error(j.message || 'The request failed (' + res.status + ').');
      err.code = j.error || (res.status === 404 ? 'not_configured' : 'http_' + res.status);
      throw err;
    }
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
    if (state.streaming) { planQueue = []; stopStreaming(); return; }
    const s = current();
    const text = promptEl.value.trim();
    if (!s) return;
    if (s.messages.length && !text) return;
    if (!s.messages.length) {                       // examination weeks have no plan
      const sc = schemeFor(state.params);
      if (sc && sc.type === 'exam') { toast('Weeks ' + sc.weeks.join(' and ') + ' are examination weeks. Choose another week.'); return; }
    }
    if (!rateOk()) { planQueue = []; return; }

    if (!s.messages.length) {                       // new plan
      const p = Object.assign({}, state.params);
      delete p.also;
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
      s.title = planTitle(p);
      s.messages.push({ role: 'user', content: text });
    } else {                                        // follow-up
      if (!text) return;
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
    runGenerate(s);
  }

  // A chip is either "make another week" (starts a new plan) or a follow-up request in this plan.
  function onChip(text) {
    if (state.streaming) return;
    const s = current();
    const wk = text.match(/\bweek\s*(\d{1,2})\b/i);
    if (wk && /^(generate|create|plan|write)/i.test(text) && s && s.params) {
      const n = Math.min(Math.max(parseInt(wk[1], 10), 1), WEEKS.length);
      state.params = { subject: s.params.subject, cls: s.params.cls, week: n, hook: s.params.hook !== false, size: s.params.size || state.params.size, light: s.params.light === true };
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
    updateSend(); renderSessions(); updateTopbar(); scrollBottom(true);

    const t0 = performance.now();
    let text = '';
    let err = null;
    let raf = 0;
    const paint = () => { raf = 0; bot.set(text, false); scrollBottom(); };

    try {
      const source = state.config.demo ? demoStream(session, ctrl.signal) : apiStream(session, ctrl.signal);
      for await (const piece of source) {
        text += piece;
        if (!raf) raf = requestAnimationFrame(paint);
      }
    } catch (e) {
      if (e.name !== 'AbortError') err = e;
    }
    if (raf) cancelAnimationFrame(raf);
    state.streaming = null;

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

    const msg = { role: 'assistant', kind, content: text, seconds: (performance.now() - t0) / 1000, stopped: aborted, demo: state.config.demo, warning };
    if (!text.trim()) { bot.error(warning || 'The model returned nothing. Please try again.', () => { bot.root.remove(); state.bots.pop(); runGenerate(session); }); updateSend(); renderSessions(); updateTopbar(); return; }
    session.messages.push(msg);
    session.updatedAt = Date.now();
    bot.set(text, true, msg);
    updateSend(); renderSessions(); updateTopbar(); updateView(); store.save();
    scrollBottom();
    if (aborted) planQueue = []; else if (planQueue.length && session.messages.length === 2) setTimeout(nextInQueue, 700);
  }

  function nextInQueue() {
    if (state.streaming || !planQueue.length) return;
    const p = planQueue.shift();
    state.params = Object.assign({}, state.params, p, { also: [] });
    syncPills(); syncAlso();
    const fresh = makeSession();
    state.sessions.unshift(fresh);
    promptEl.value = '';
    showSession(fresh.id);
    toast('Now writing ' + p.cls + (planQueue.length ? ' (' + planQueue.length + ' more after this)' : ''));
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
      menu.replaceChildren(...cfg.items.map((it) => h('button', {
        type: 'button', role: 'menuitemradio', class: 'menu-item', 'aria-checked': String(it.id === cur),
        onclick: () => { cfg.set(it.id); build(); close(); btn.focus(); },
      },
      h('span', { class: 'mi-text' }, h('span', { class: 'mi-label', text: it.label })),
      icon('check', 'mi-check'))));
    }
    function open() {
      closeMenus(api);
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      const r = btn.getBoundingClientRect();
      const below = window.innerHeight - r.bottom, above = r.top;
      root.dataset.dir = below < menu.offsetHeight + 16 && above > below ? 'up' : 'down';
      const sel = menu.querySelector('[aria-checked="true"]') || items()[0];
      if (sel) { sel.focus(); sel.scrollIntoView({ block: 'nearest' }); }
    }
    function close() { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); }

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

  const hookBtn = $('#hookToggle');
  function syncHook() {
    const on = state.params.hook !== false;
    hookBtn.setAttribute('aria-checked', String(on));
    $('.dd-label', hookBtn).textContent = 'Hook: ' + (on ? 'On' : 'Off');
  }
  hookBtn.addEventListener('click', () => { state.params.hook = state.params.hook === false; syncHook(); store.save(); });
  const lightBtn = $('#lightToggle');
  function syncLight() {
    const on = state.params.light === true;
    lightBtn.setAttribute('aria-checked', String(on));
    $('.dd-label', lightBtn).textContent = 'Resources: ' + (on ? 'Light' : 'Standard');
  }
  lightBtn.addEventListener('click', () => { state.params.light = state.params.light !== true; syncLight(); store.save(); });
  /* The school's NaCCA scheme for the chosen subject, class and week (when one is loaded). */
  const schemeStrip = $('#schemeStrip');
  const schemeFor = (p) => (window.SchoolPadiSchemes ? window.SchoolPadiSchemes.lookup(p.subject, p.cls, p.week) : null);
  function syncScheme() {
    const S = window.SchoolPadiSchemes;
    if (!S) { schemeStrip.hidden = true; return; }
    const p = state.params;
    const e = schemeFor(p);
    schemeStrip.classList.toggle('is-exam', !!e && e.type === 'exam');
    const tag = (w) => h('span', { class: 'scheme-tag', text: e.term + ' scheme · Week ' + w });
    if (!e) {
      const last = S.span(p.subject, p.cls);
      schemeStrip.replaceChildren(h('p', { class: 'scheme-note', text: last
        ? 'Your scheme covers Weeks 1 to ' + last + '. Claude will choose the topic for Week ' + p.week + '.'
        : 'No scheme is loaded for this subject and class yet. Claude will choose the strand and topic.' }));
    } else if (e.type === 'exam') {
      schemeStrip.replaceChildren(h('div', { class: 'scheme-top' }, h('span', { class: 'scheme-tag', text: e.term + ' scheme' }), h('span', { class: 'scheme-line', text: 'Weeks ' + e.weeks.join(' and ') + ': examinations' })),
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
        h('p', { class: 'scheme-note', text: 'Your scheme gives the indicator only. Claude will match the NaCCA strand and content standard to its code.' }));
    } else {
      const n = e.indicators.length;
      schemeStrip.replaceChildren(
        h('div', { class: 'scheme-top' }, tag(p.week), h('span', { class: 'scheme-line', text: e.strand + (e.substrand ? ' › ' + e.substrand : '') })),
        h('details', null, h('summary', { text: 'Content standard and ' + n + ' indicator' + (n === 1 ? '' : 's') }),
          e.standard ? h('p', { class: 'scheme-std', text: e.standard }) : null,
          h('ul', null, ...e.indicators.map((x) => h('li', { text: x })))));
    }
    schemeStrip.hidden = false;
  }
  function syncAlso() {
    const others = CLASSES.filter((c) => c !== state.params.cls);
    state.params.also = (state.params.also || []).filter((c) => others.includes(c));
    alsoRow.replaceChildren(h('span', { class: 'also-label', title: 'Uses the same subject, week and class size' }, 'Also plan for'),
      ...others.map((c) => {
        const on = state.params.also.includes(c);
        const b = h('button', { type: 'button', class: 'pill pill-toggle', role: 'switch', 'aria-checked': String(on) }, (on ? '✓ ' : '+ ') + c);
        b.addEventListener('click', () => {
          const set = new Set(state.params.also || []);
          if (set.has(c)) set.delete(c); else set.add(c);
          state.params.also = CLASSES.filter((x) => set.has(x));
          syncAlso(); store.save();
        });
        return b;
      }));
    const n = 1 + state.params.also.length;
    sendBtn.title = n > 1 ? 'Write ' + n + ' plans' : '';
  }
  function syncPills() { dropdowns.forEach((d) => d.build()); syncHook(); syncLight(); syncScheme(); syncAlso(); }

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
    const del = e.target.closest('[data-del]');
    if (del) { deleteSession(del.dataset.del); return; }
    const item = e.target.closest('.s-item');
    if (!item) return;
    if (item.dataset.id !== state.currentId) showSession(item.dataset.id);
    if (isMobile()) setNav(false);
  });

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
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#242120' : '#EFE8DB');
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
      initAccount(j.sync);
    } catch (e) {
      state.config = { loaded: true, demo: true, provider: null, accessRequired: false };   // static preview, no server
    }
    showAccess(state.config.accessRequired && !state.config.demo);
    updateView(); updateTopbar();
  }


  /* ───────── Accounts and sync ───────── */
  /* Plans live on the device first. When a teacher signs in, they are also copied to that teacher's own
     private rows (Neon) and merged across devices: the newest edit of each plan wins. */
  const TOMB_KEY = 'schoolpadi.deleted';
  const tomb = () => { try { return JSON.parse(localStorage.getItem(TOMB_KEY)) || {}; } catch (e) { return {}; } };
  const saveTomb = (t) => { try { localStorage.setItem(TOMB_KEY, JSON.stringify(t)); } catch (e) { /* ignore */ } };
  const acct = {
    root: $('#accountRow'), out: $('#acctOut'), inn: $('#acctIn'), open: $('#acctOpen'), form: $('#acctForm'),
    email: $('#acctEmail'), send: $('#acctSend'), codeWrap: $('#acctCodeWrap'), code: $('#acctCode'), verify: $('#acctVerify'),
    who: $('#acctWho'), status: $('#acctStatus'), now: $('#acctSyncNow'), signOut: $('#acctSignOut'), msg: $('#acctMsg'),
  };
  const signedIn = () => !!(window.PadiSync && window.PadiSync.available() && window.PadiSync.user());
  let syncing = false, syncAgain = false, syncTimer = 0, lastSync = 0;

  const acctMsg = (t, bad) => { acct.msg.textContent = t || ''; acct.msg.classList.toggle('err', !!bad); };
  const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 20 ? 'just now' : s < 90 ? 'a minute ago' : s < 3600 ? Math.round(s / 60) + ' minutes ago' : Math.round(s / 3600) + ' hours ago'; };
  function acctStatus(t) { acct.status.textContent = t; }
  function refreshAcct() {
    if (!window.PadiSync || !window.PadiSync.available()) { acct.root.hidden = true; return; }
    acct.root.hidden = false;
    const u = window.PadiSync.user();
    acct.out.hidden = !!u; acct.inn.hidden = !u;
    if (u) { acct.who.textContent = u.email || 'Signed in'; if (lastSync) acctStatus('Synced ' + ago(lastSync)); }
  }
  function scheduleSync() { if (!signedIn()) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), 3000); }

  const cleanRemote = (r) => {
    const d = r && r.data;
    if (!d || typeof d !== 'object' || !Array.isArray(d.messages) || !d.messages.length) return null;
    return Object.assign({}, d, { id: String(r.id), updatedAt: Number(r.updated_at) || 0, title: typeof d.title === 'string' ? d.title : 'Plan', params: d.params && typeof d.params === 'object' ? d.params : null,
      messages: d.messages.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') });
  };

  async function syncNow(manual) {
    if (!signedIn()) return;
    if (syncing) { syncAgain = true; return; }
    if (state.streaming) { scheduleSync(); return; }                 // never change plans while one is being written
    syncing = true; acctStatus('Syncing…'); if (manual) acctMsg('');
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
      await P.push(push);
      saveTomb(t);

      // teacher details
      try {
        const rp = await P.getProfile(), lp = profile(), lts = lp.updatedAt || 0, empty = !lp.teacher && !lp.school;
        if (rp && (empty || rp.updated_at > lts)) {
          const d = rp.data || {};
          teacherInput.value = String(d.teacher || '').slice(0, 80); schoolInput.value = String(d.school || '').slice(0, 100);
          try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ teacher: teacherInput.value, school: schoolInput.value, updatedAt: rp.updated_at })); } catch (e) { /* ignore */ }
        } else if (!empty && (!rp || lts > rp.updated_at)) {
          await P.setProfile({ teacher: lp.teacher || '', school: lp.school || '' }, lts || Date.now());
        }
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
      acctStatus('Synced just now');
    } catch (e) {
      if (e.offline) acctStatus('Offline. Will sync when you are back online.');
      else if (e.status === 401 || !signedIn()) { refreshAcct(); acctMsg('Please sign in again.', true); }
      else acctStatus('Could not sync: ' + e.message);
    } finally {
      syncing = false;
      if (syncAgain) { syncAgain = false; scheduleSync(); }
    }
  }

  function initAccount(cfg) {
    if (!window.PadiSync || !cfg) return;
    window.PadiSync.init(cfg);
    refreshAcct();
    if (signedIn()) syncNow();
  }

  let cooldown = 0;
  acct.open.addEventListener('click', () => { acct.form.hidden = !acct.form.hidden; if (!acct.form.hidden) acct.email.focus(); });
  acct.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = acct.email.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { acctMsg('Enter a valid email address.', true); return; }
    acct.send.disabled = true; acctMsg('Sending…');
    try {
      await window.PadiSync.sendCode(email);
      acct.codeWrap.hidden = false; acct.code.focus();
      acctMsg('We sent a 6-digit code to ' + email + '. Check your inbox and spam folder.');
      cooldown = 60; const tick = () => { acct.send.firstElementChild.textContent = cooldown > 0 ? 'Send again in ' + cooldown-- + 's' : 'Send me a new code'; if (cooldown >= 0) setTimeout(tick, 1000); else acct.send.disabled = false; };
      tick();
    } catch (err) { acct.send.disabled = false; acctMsg(err.message, true); }
  });
  async function verifyCode() {
    const email = acct.email.value.trim().toLowerCase(), code = acct.code.value.replace(/\s+/g, '');
    if (!/^\d{6,8}$/.test(code)) { acctMsg('Enter the 6-digit code from the email.', true); return; }
    acct.verify.disabled = true; acctMsg('Checking…');
    try {
      await window.PadiSync.verify(email, code);
      acct.code.value = ''; acct.codeWrap.hidden = true; acct.form.hidden = true;
      acctMsg('Signed in. Your plans will now sync.');
      refreshAcct(); syncNow(true);
    } catch (err) { acctMsg(err.message, true); }
    finally { acct.verify.disabled = false; }
  }
  acct.verify.addEventListener('click', verifyCode);
  acct.code.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); verifyCode(); } });
  acct.now.addEventListener('click', () => syncNow(true));
  acct.signOut.addEventListener('click', async () => {
    await window.PadiSync.signOut();
    lastSync = 0; refreshAcct(); acctMsg('Signed out. Your plans stay on this device.');
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(); });
  window.addEventListener('online', () => scheduleSync());
  setInterval(() => { if (signedIn() && document.visibilityState === 'visible' && !syncing) { if (lastSync) acctStatus('Synced ' + ago(lastSync)); if (Date.now() - lastSync > 5 * 60000) syncNow(); } }, 30000);

  function init() {
    const saved = store.load();
    state.sessions = saved && Array.isArray(saved.sessions) ? saved.sessions.filter((s) => s && Array.isArray(s.messages)) : [];
    if (saved && saved.params && SUBJECTS.includes(saved.params.subject) && CLASSES.includes(saved.params.cls) && WEEKS.includes(saved.params.week)) {
      state.params = { subject: saved.params.subject, cls: saved.params.cls, week: saved.params.week, hook: saved.params.hook !== false, size: SIZES.includes(saved.params.size) ? saved.params.size : state.params.size, light: saved.params.light === true };
    }
    try { state.access = localStorage.getItem(ACCESS_KEY) || ''; accessInput.value = state.access; } catch (e) { /* ignore */ }

    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light', false);

    makeDropdown($('#ddSubject'), { name: 'Subject', items: SUBJECTS.map((x) => ({ id: x, label: x })), get: () => state.params.subject, set: (v) => { state.params.subject = v; store.save(); syncScheme(); }, label: (x) => x });
    makeDropdown($('#ddClass'), { name: 'Class', items: CLASSES.map((x) => ({ id: x, label: x })), get: () => state.params.cls, set: (v) => { state.params.cls = v; store.save(); syncScheme(); syncAlso(); }, label: (x) => x });
    makeDropdown($('#ddWeek'), { name: 'Week', items: WEEKS.map((x) => ({ id: x, label: 'Week ' + x })), get: () => state.params.week, set: (v) => { state.params.week = v; store.save(); syncScheme(); }, label: (x) => 'Week ' + x });

    makeDropdown($('#ddSize'), { name: 'Class size', items: SIZES.map((x) => ({ id: x, label: x + ' learners' })), get: () => state.params.size, set: (v) => { state.params.size = v; store.save(); }, label: (x) => x + ' learners' });
    syncHook(); syncLight(); syncScheme(); syncAlso();
    syncNav();
    const s = makeSession();
    state.sessions.unshift(s);
    showSession(s.id);
    if (!coarse && !isMobile()) promptEl.focus();
    loadConfig();
    setInterval(() => { renderSessions(); updateTopbar(); }, 30000);
  }

  init();
})();
