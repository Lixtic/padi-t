/* GuidEd · profile.js
   The teacher's profile: name and school, the classes and subjects they teach, and where they stopped last time.
   It lives on the device first (schoolpadi.profile) and app.js syncs it to the account, so it follows the teacher to a new phone. */
(function () {
  'use strict';
  var KEY = 'schoolpadi.profile';
  var GL = window.GuidedLevels;
  var $ = function (s) { return document.querySelector(s); };
  var hooks = {}, welcomed = false;

  function read() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function write(o) {
    o.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* storage blocked: the menus still work this visit */ }
    if (hooks.changed) hooks.changed();
  }
  function patch(fn) { var o = read(); fn(o); write(o); return o; }
  function arr(o, k) { return Array.isArray(o[k]) ? o[k] : []; }
  function toggle(list, v, on) { var i = list.indexOf(v); if (on && i === -1) list.push(v); if (!on && i !== -1) list.splice(i, 1); return list; }
  function signedIn() { return hooks.signedIn ? hooks.signedIn() : false; }

  var P = {
    init: function (h) { hooks = h || {}; wire(); },
    get: read,
    myClasses: function () { var all = GL.ALL_CLASSES, mine = arr(read(), 'classes'); return all.filter(function (c) { return mine.indexOf(c) !== -1; }); },
    // The subjects the teacher handles that exist at this class's level, in the level's order.
    mySubjects: function (cls) {
      var mine = arr(read(), 'subjects'), l = GL.levelOfClass(cls);
      return l ? l.subjects.filter(function (s) { return mine.indexOf(s) !== -1; }) : [];
    },
    // The class and subject to start on when nothing else is remembered.
    defaults: function () {
      var cs = P.myClasses(); if (!cs.length) return null;
      var subs = P.mySubjects(cs[0]);
      return { cls: cs[0], subject: subs[0] || GL.levelOfClass(cs[0]).subjects[0] };
    },
    // The week after the one the teacher last planned for this class and subject, when it is still the same term.
    nextWeek: function (cls, subject, term) {
      var v = (read().last || {})[cls + '|' + subject];
      var S = window.SchoolPadiSchemes, last = (S && S.weeksIn ? S.weeksIn(cls) : 14) - 1;
      return v && v[0] === term && v[1] < last ? v[1] + 1 : null;
    },
    // Called when a first plan has been written: remembers the week, and asks once about the profile when it helps.
    planned: function (p) {
      var key = p.cls + '|' + p.subject;
      var o = patch(function (x) {
        x.last = x.last || {};
        x.last[key] = [p.term, p.week];
        var keys = Object.keys(x.last);
        if (keys.length > 60) delete x.last[keys[0]];
      });
      if (!signedIn()) return;
      var asked = arr(o, 'asked'), subs = arr(o, 'subjects'), cls = arr(o, 'classes');
      if (!subs.length) {
        if (asked.indexOf('only') !== -1) return;
        ask('Do you teach only ' + p.subject + '?', [
          ['Yes, only ' + p.subject, function () { patch(function (x) { x.subjects = [p.subject]; x.classes = toggle(arr(x, 'classes'), p.cls, true); x.asked = toggle(arr(x, 'asked'), 'only', true); x.setupDone = true; }); say('Saved. Your menus now start with ' + p.subject + '.'); }],
          ['I teach several', function () { markAsked('only'); P.openSheet(); }],
          ['Not now', function () { markAsked('only'); }],
        ]);
        return;
      }
      var missSub = subs.indexOf(p.subject) === -1, missCls = cls.length && cls.indexOf(p.cls) === -1;
      var tag = 'add:' + key;
      if ((missSub || missCls) && asked.indexOf(tag) === -1) {
        ask('Add ' + (missSub && missCls ? p.subject + ' for ' + p.cls : missSub ? p.subject : p.cls) + ' to your profile?', [
          ['Add', function () { patch(function (x) { if (missSub) toggle(x.subjects = arr(x, 'subjects'), p.subject, true); if (missCls) toggle(x.classes = arr(x, 'classes'), p.cls, true); x.asked = toggle(arr(x, 'asked'), tag, true); }); say('Added to your profile.'); }],
          ['Not now', function () { markAsked(tag); }],
        ]);
      }
    },
    // After the account has synced: a teacher with no profile yet is welcomed once and asked what they teach.
    afterSync: function () {
      if (welcomed || !signedIn() || read().setupDone) return;
      welcomed = true;
      var acct = $('#acctSheet');                                   // let the sign-in confirmation finish first
      if (acct && acct.open) acct.addEventListener('close', function () { setTimeout(function () { if (!read().setupDone) P.openSheet({ welcome: true }); }, 250); }, { once: true });
      else P.openSheet({ welcome: true });
    },
    openSheet: function (opts) {
      var dlg = $('#profileSheet'); if (!dlg) return;
      render(opts && opts.welcome);
      if (!dlg.open) dlg.showModal();
    },
  };

  function say(t) { if (hooks.toast) hooks.toast(t); }
  function markAsked(tag) { patch(function (x) { x.asked = toggle(arr(x, 'asked'), tag, true); }); }

  /* ───────── The one-line question above the composer ───────── */
  function ask(text, buttons) {
    var box = $('#profileAsk'); if (!box) return;
    box.replaceChildren();
    var span = document.createElement('span'); span.textContent = text; box.appendChild(span);
    buttons.forEach(function (b, i) {
      var btn = document.createElement('button'); btn.type = 'button'; btn.textContent = b[0]; btn.className = i === 0 ? 'pa-yes' : 'pa-no';
      btn.addEventListener('click', function () { box.hidden = true; b[1](); });
      box.appendChild(btn);
    });
    box.hidden = false;
  }

  /* ───────── The profile sheet ───────── */
  function chip(name, value, checked, onChange) {
    var l = document.createElement('label'), i = document.createElement('input'), s = document.createElement('span');
    i.type = 'checkbox'; i.name = name; i.value = value; i.checked = checked; s.textContent = value;
    i.addEventListener('change', function () { onChange(i.checked); });
    l.append(i, s); return l;
  }
  function render(welcome) {
    var o = read();
    $('#pfTitle').textContent = welcome ? 'Welcome! What do you teach?' : 'Your teacher profile';
    $('#pfSub').textContent = welcome
      ? 'Tell GuidEd your classes and subjects once. Your menus then show them first, and the next week is ready when you come back. You can change this any time.'
      : 'Your classes and subjects show first in the menus, and GuidEd remembers which week you reached.';
    var cw = $('#pfClasses'); cw.replaceChildren();
    GL.LEVELS.forEach(function (l) {
      var h = document.createElement('p'); h.className = 'pf-level'; h.textContent = l.name; cw.appendChild(h);
      var row = document.createElement('div'); row.className = 'fb-kinds pf-chips'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', l.name + ' classes');
      l.classes.forEach(function (c) {
        row.appendChild(chip('pfClass', c, arr(o, 'classes').indexOf(c) !== -1, function (on) { patch(function (x) { toggle(x.classes = arr(x, 'classes'), c, on); }); renderSubjects(); }));
      });
      cw.appendChild(row);
    });
    renderSubjects();
    renderDates();
  }
  function renderDates() {
    var info = hooks.termInfo && hooks.termInfo(); if (!info) return;
    var nice = function (iso) { var d = new Date(iso + 'T00:00:00Z'); return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); };
    $('#pfOpenLabel').textContent = (info.name || 'Term') + ' ' + info.term + ' opened on';
    $('#pfOpen').value = info.mine || info.calendar;
    $('#pfTermText').textContent = 'Week-ending dates are the Fridays counted from the day the ' + (info.name === 'Semester' ? 'semester' : 'term') + ' opens. The GES calendar says ' + nice(info.calendar) + (info.estimated ? ' (an estimate: the official dates are not published yet)' : '') + '. If your school opened on another day, change it here.';
    $('#pfOpenReset').hidden = !info.mine;
  }
  function setOpen(iso) {
    var info = hooks.termInfo && hooks.termInfo(); if (!info) return;
    patch(function (x) { x.termOpen = x.termOpen || {}; if (!iso || iso === info.calendar) delete x.termOpen[info.key]; else x.termOpen[info.key] = iso; });
    renderDates(); if (hooks.apply) hooks.apply();
  }
  function renderSubjects() {
    var o = read(), sw = $('#pfSubjects'); sw.replaceChildren();
    var chosen = arr(o, 'classes'), seen = [];
    GL.LEVELS.forEach(function (l) {
      if (chosen.length && !l.classes.some(function (c) { return chosen.indexOf(c) !== -1; })) return;
      l.subjects.forEach(function (s) { if (seen.indexOf(s) === -1) seen.push(s); });
    });
    arr(o, 'subjects').forEach(function (s) { if (seen.indexOf(s) === -1) seen.push(s); });   // a subject already picked never disappears
    seen.forEach(function (s) {
      sw.appendChild(chip('pfSubject', s, arr(o, 'subjects').indexOf(s) !== -1, function (on) { patch(function (x) { toggle(x.subjects = arr(x, 'subjects'), s, on); }); }));
    });
  }
  function finish() {
    var dlg = $('#profileSheet'); if (dlg.open) dlg.close();
  }
  function wire() {
    var dlg = $('#profileSheet'); if (!dlg || dlg.dataset.wired) return; dlg.dataset.wired = '1';
    $('#pfClose').addEventListener('click', finish);
    $('#pfDone').addEventListener('click', finish);
    dlg.addEventListener('close', function () {
      patch(function (x) { x.setupDone = true; });                                        // closing it once ends the welcome, however it was closed
      if (hooks.apply) hooks.apply();
    });
    dlg.addEventListener('click', function (e) { var r = dlg.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) finish(); });
    $('#pfOpen').addEventListener('change', function (e) { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setOpen(e.target.value); });
    $('#pfOpenReset').addEventListener('click', function () { setOpen(''); });
    var b = $('#profileBtn'); if (b) b.addEventListener('click', function () { P.openSheet(); });
  }

  window.GuidedProfile = P;
})();
