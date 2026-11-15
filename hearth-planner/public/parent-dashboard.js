/* GuidEd Parent Dashboard: child management, home learning and progress. */
(function () {
  'use strict';
  var CHILD_CLASSES = ['KG 1', 'KG 2'].concat(Array.from({ length: 9 }, function (_, i) { return 'Basic ' + (i + 1); }));   // kindergarten to JHS 3
  var state = { root: null, profile: null, records: [], loaded: false, loading: false, tab: 'overview', task: 'lesson', lessonStep: 0, lessonDraft: {}, lessonRoom: null, stageSaving: false, editingChild: '', addingChild: false, busy: false, error: '', result: null };
  var $ = function (selector, root) { return (root || state.root).querySelector(selector); };
  var esc = function (value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]; }); };
  var uid = function () { return 'pl-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-5); };
  var familyArt = function (name, extra) { return window.GuidEdFamilyArt ? window.GuidEdFamilyArt.render(name, extra || '') : ''; };
  var children = function () { return Array.isArray(state.profile && state.profile.children) ? state.profile.children : []; };
  var selectedChild = function () { return children().find(function (child) { return child.id === state.selectedChild; }) || children()[0] || null; };
  var subjectsFor = function (cls) {
    var level = window.GuidedLevels && window.GuidedLevels.levelOfClass(cls);
    return level && Array.isArray(level.subjects) ? level.subjects : ['Mathematics', 'English Language', 'Science', 'Computing', 'Social Studies'];
  };
  /* Suggested topics: what the school scheme of learning covers for this child's class, around the current week. */
  var plainName = function (text) { return String(text || '').replace(/^\s*\d+(?:\.\d+)*\.?\s+/, '').trim(); };   // "1.3 Fractions" -> "Fractions"
  function currentWeek(cls) {
    var S = window.SchoolPadiSchemes; if (!S) return null;
    var term = S.currentTerm(undefined, cls), d = new Date(), day = d.getDay();
    d.setDate(d.getDate() + (day === 6 ? 2 : day === 0 ? 1 : 0));   // the weekend looks ahead to Monday
    var today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    var n = S.weeksIn(cls);
    for (var w = 1; w <= n; w++) { var we = S.weekEnding(term, w, { cls: cls }); if (we && we.iso >= today) return { term: term, week: w }; }
    return { term: term, week: n };
  }
  function suggestionsFor(child, subject) {
    var S = window.SchoolPadiSchemes; if (!S || !child || !subject) return null;
    var cls = child.class, cw = currentWeek(cls);
    if (!cw || !S.has(subject, cls, cw.term)) return null;
    var picks = [], seen = {};
    function add(group, w) {
      if (w < 1) return;
      var r = S.lookup(subject, cls, cw.term, w); if (!r) return;
      var names = r.type === 'teach' ? [plainName(r.substrand || r.strand)] : r.type === 'revision' ? (r.topics || []).slice(0, 3).map(function (t) { return plainName(String(t).split('>').pop()); }) : [];
      names.forEach(function (name) {
        if (!name || seen[name]) return; seen[name] = 1;
        picks.push({ group: r.type === 'revision' ? 'Revise' : group, name: name, standard: r.standard || '', term: cw.term, week: w });
      });
    }
    add('This week', cw.week); add('Coming up', cw.week + 1); add('Coming up', cw.week + 2); add('Catch up', cw.week - 1); add('Catch up', cw.week - 2);
    var areas = [], aseen = {};
    for (var w = 1, max = S.span(subject, cls, cw.term); w <= max; w++) {
      var row = S.lookup(subject, cls, cw.term, w), a = row && row.type === 'teach' ? plainName(row.strand) : '';
      if (a && !aseen[a]) { aseen[a] = 1; areas.push(a); }
    }
    return { picks: picks, areas: areas.slice(0, 8), term: cw.term, week: cw.week };
  }
  function suggestHtml(child, subject) {
    var sg = suggestionsFor(child, subject); if (!sg || !(sg.picks.length || sg.areas.length)) return '';
    var html = '<div class="pd-suggest"><strong class="pd-suggest-title">' + icon('spark') + ' Suggested from ' + esc(child.name) + '’s school work</strong>';
    ['This week', 'Coming up', 'Catch up', 'Revise'].forEach(function (group) {
      var items = sg.picks.filter(function (x) { return x.group === group; }); if (!items.length) return;
      html += '<div class="pd-suggest-group"><span>' + esc(group) + '</span>' + items.map(function (x) {
        return '<button type="button" data-topic-example="' + esc(x.name) + '" data-term="' + x.term + '" data-week="' + x.week + '"' + (x.standard ? ' title="' + esc(x.standard) + '"' : '') + '>' + esc(x.name) + '</button>';
      }).join('') + '</div>';
    });
    if (sg.areas.length) html += '<div class="pd-suggest-group"><span>Areas to learn this term</span>' + sg.areas.map(function (a) { return '<button type="button" data-topic-example="' + esc(a) + '" data-term="' + sg.term + '">' + esc(a) + '</button>'; }).join('') + '</div>';
    return html + '</div>';
  }
  var labels = { lesson: 'Plan a Home Lesson', explanation: 'Help Me Understand', practice: 'Practice Exercises' };
  var icon = function (name, extra) { return '<svg class="ico pd-icon ' + (extra || '') + '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"></use></svg>'; };

  function auth() {
    if (!window.PadiSync || !window.PadiSync.authHeader) return Promise.reject(new Error('Please sign in to use Parent Dashboard.'));
    return window.PadiSync.authHeader().then(function (headers) {
      if (!headers || !(headers.authorization || headers.Authorization)) throw new Error('Your sign-in has expired. Please sign in again.');
      return headers;
    });
  }
  function loadRecords() {
    if (state.loading) return;
    state.loading = true;
    window.PadiSync.listParentLearning().then(function (data) {
      state.records = Array.isArray(data) ? data : [];
      state.loaded = true; state.error = ''; render();
    }).catch(function (error) {
      state.error = error.message || 'Could not load your learning activities.';
    }).finally(function () { state.loading = false; render(); });
  }
  function saveProfile(next) {
    return window.PadiSync.setAccountProfile(next).then(function (result) {
      state.profile = result && result.profile ? result.profile : next;
      state.error = ''; state.editingChild = ''; state.addingChild = false;
      window.dispatchEvent(new CustomEvent('guided:account-profile-saved', { detail: state.profile }));
      render();
      return state.profile;
    });
  }
  function saveRecord(record) {
    return window.PadiSync.saveParentLearning(record).then(function (result) {
      if (result && result.record) {
        var index = state.records.findIndex(function (item) { return item.id === result.record.id; });
        if (index < 0) state.records.unshift(result.record); else state.records[index] = result.record;
      }
      return result;
    });
  }

  function renderChildren() {
    var list = children();
    var cards = list.map(function (child) {
      return '<article class="pd-child-card"><span class="pd-child-avatar pd-child-avatar-art">' + familyArt('curious-child', 'pd-child-mini-art') + '</span><div><span class="pd-kicker">' + esc(child.class) + '</span><h3>' + esc(child.name) + '</h3><p>' + esc((child.subjects || []).join(' · ')) + '</p><small>' + esc(child.minutes || 30) + ' minutes daily</small></div><div class="pd-child-actions"><button type="button" data-edit-child="' + esc(child.id) + '">Edit</button><button type="button" class="pd-muted-action" data-remove-child="' + esc(child.id) + '">Remove</button></div></article>';
    }).join('');
    var child = list.find(function (item) { return item.id === state.editingChild; });
    var cls = child ? child.class : 'Basic 7';
    var selected = child && Array.isArray(child.subjects) ? child.subjects : subjectsFor(cls).slice(0, 3);
    var subjectOptions = subjectsFor(cls).map(function (subject) {
      return '<label class="pd-check"><input type="checkbox" name="childSubjects" value="' + esc(subject) + '"' + (selected.includes(subject) ? ' checked' : '') + '><span>' + esc(subject) + '</span></label>';
    }).join('');
    return '<div class="pd-section-head"><div><span class="pd-kicker">FAMILY LEARNING</span><h2>My Children</h2><p>Manage the children whose learning you support.</p></div><span class="pd-count">' + list.length + ' / 10</span></div>' +
      '<div class="pd-child-list">' + (cards || '<div class="pd-empty pd-empty-illustrated">' + familyArt('family-reading', 'pd-empty-art') + '<strong>Your family starts here.</strong><span>Add a child to start planning learning activities.</span></div>') + '</div>' +
      '<label class="pd-check pd-reminder"><input type="checkbox" id="pdReminders"' + (state.profile && state.profile.familyReminders === false ? '' : ' checked') + '><span>Email me a short learning idea every Sunday evening</span></label>' +
      (list.length >= 10 && !child ? '<p class="pd-note">You can add up to 10 children to one parent account.</p>' :
      !child && !state.addingChild ? '<button type="button" class="pd-primary pd-add-child" data-add-child>' + icon('plus') + ' Add a child</button>' :
      '<form class="pd-form pd-child-form" id="pdChildForm"><h3>' + (child ? 'Update child details' : 'Add a child') + '</h3><label>Child’s name<input name="name" maxlength="80" required value="' + esc(child && child.name || '') + '" placeholder="Child’s name"></label><div class="pd-form-grid"><label>Class<select name="class">' + CHILD_CLASSES.map(function (value) { return '<option' + (value === cls ? ' selected' : '') + '>' + value + '</option>'; }).join('') + '</select></label><label>Daily learning time<select name="minutes">' + [15, 30, 45, 60].map(function (n) { return '<option value="' + n + '"' + (Number(child && child.minutes || 30) === n ? ' selected' : '') + '>' + n + ' minutes</option>'; }).join('') + '</select></label></div><fieldset><legend>Subjects</legend><div class="pd-subject-grid">' + subjectOptions + '</div></fieldset><div class="pd-form-actions"><button class="pd-primary" type="submit">' + (child ? 'Save changes' : 'Add child') + '</button>' + '<button type="button" class="pd-secondary" data-cancel-edit>Cancel</button>' + '</div></form>');
  }

  function renderTaskForm() {
    if (state.task === 'lesson') return renderLessonWizard();
    var list = children(), child = selectedChild();
    var subjects = child && child.subjects && child.subjects.length ? child.subjects : subjectsFor(child && child.class || 'Basic 7');
    var weeks = Array.from({ length: 14 }, function (_, i) { return '<option value="' + (i + 1) + '">' + (i + 1) + '</option>'; }).join('');
    return '<form class="pd-form pd-task-form pd-task-form-illustrated" id="pdTaskForm"><div class="pd-task-art-head">' + familyArt(state.task === 'practice' ? 'practice-pencil' : 'curious-child', 'pd-task-art') + '<p>' + (state.task === 'practice' ? 'A little practice builds confidence. Let’s get your child ready to try.' : 'Every question is a chance to understand something new.') + '</p></div><div class="pd-form-grid"><label>Choose your child<select name="childId" required>' + list.map(function (item) { return '<option value="' + esc(item.id) + '"' + (child && item.id === child.id ? ' selected' : '') + '>' + esc(item.name) + ' · ' + esc(item.class) + '</option>'; }).join('') + '</select></label><label>Subject<select name="subject">' + subjects.map(function (subject) { return '<option>' + esc(subject) + '</option>'; }).join('') + '</select></label></div><label>Topic or area to learn<input name="topic" maxlength="180" placeholder="e.g. Parts of a computer" required></label><div id="pdSuggestBox">' + suggestHtml(child, subjects[0]) + '</div><div class="pd-form-grid"><label>Term<select name="term"><option value="1">Term 1</option><option value="2">Term 2</option><option value="3">Term 3</option></select></label><label>Week<select name="week">' + weeks + '</select></label></div><label>Anything you want the AI to focus on (optional)<textarea name="notes" rows="2" maxlength="160"></textarea></label><button class="pd-primary" type="submit"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? 'Preparing…' : 'Create ' + esc(labels[state.task]).toLowerCase()) + '</button></form>';
  }

  function renderLessonWizard() {
    var d = state.lessonDraft || {}, child = children().find(function (c) { return c.id === d.childId; }) || selectedChild();
    var subjects = child && child.subjects && child.subjects.length ? child.subjects : subjectsFor(child && child.class || 'Basic 7');
    var step = Math.max(0, Math.min(3, state.lessonStep || 0));
    var titles = ['Choose your child', 'Choose a topic', 'Set up the lesson', 'Review your lesson'];
    var hints = ['Who will be learning today?', 'What would you like to learn together?', 'A few details help us prepare the right activity.', 'Check the details before creating the lesson.'];
    var icons = ['users', 'book', 'sliders', 'check'];
    var scenes = ['family-reading', 'curious-child', 'learning-together', 'celebration'];
    var dots = titles.map(function (_, i) { return '<span class="pd-step-dot ' + (i < step ? 'is-done' : i === step ? 'is-current' : '') + '">' + (i < step ? icon('check') : i + 1) + '</span>'; }).join('');
    var content = '';
    if (step === 0) {
      content = '<div class="pd-wizard-field"><label>Choose your child</label><select name="childId" required>' + children().map(function (c) { return '<option value="' + esc(c.id) + '"' + (child && c.id === child.id ? ' selected' : '') + '>' + esc(c.name) + ' · ' + esc(c.class) + '</option>'; }).join('') + '</select><small>We’ll use their class and learning level to shape the lesson.</small></div><div class="pd-wizard-field"><label>Subject</label><select name="subject">' + subjects.map(function (s) { return '<option' + (s === (d.subject || subjects[0]) ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></div>';
    } else if (step === 1) {
      content = '<div class="pd-wizard-context">' + icon('user') + '<span>Learning with <strong>' + esc(child && child.name || 'your child') + '</strong> · ' + esc(child && child.class || '') + '</span></div><div class="pd-wizard-field"><label>What topic should your child learn?</label><input name="topic" maxlength="180" required value="' + esc(d.topic || '') + '" placeholder="e.g. Parts of a computer"><small>Choose a school topic or something your child finds difficult.</small></div>' + (suggestHtml(child, d.subject || (child && child.subjects && child.subjects[0])) || '') + '<div class="pd-topic-examples"><span>Examples</span><button type="button" data-topic-example="Parts of a computer">Parts of a computer</button><button type="button" data-topic-example="Fractions">Fractions</button><button type="button" data-topic-example="The water cycle">The water cycle</button></div>';
    } else if (step === 2) {
      content = '<div class="pd-wizard-field"><label>School term</label><select name="term">' + [1,2,3].map(function(n){return '<option value="'+n+'"'+(Number(d.term||(currentWeek(child && child.class) || {}).term||1)===n?' selected':'')+'>Term '+n+'</option>';}).join('') + '</select></div><div class="pd-wizard-field"><label>Curriculum week</label><select name="week">' + Array.from({length:14},function(_,i){var n=i+1;return '<option value="'+n+'"'+(Number(d.week||(currentWeek(child && child.class) || {}).week||1)===n?' selected':'')+'>Week '+n+'</option>';}).join('') + '</select></div><div class="pd-wizard-field"><label>Anything we should focus on? <span>(optional)</span></label><textarea name="notes" rows="3" maxlength="160" placeholder="For example: Use examples from our home or community.">' + esc(d.notes || '') + '</textarea></div><p class="pd-wizard-tip">' + icon('spark') + ' Designed for ' + esc(child && child.minutes || 30) + ' minutes of daily learning.</p>';
    } else {
      content = '<div class="pd-review-list"><div><span>Child</span><strong>' + esc(child && child.name || '—') + ' · ' + esc(child && child.class || '') + '</strong></div><div><span>Subject</span><strong>' + esc(d.subject || subjects[0] || '—') + '</strong></div><div><span>Topic</span><strong>' + esc(d.topic || '—') + '</strong></div><div><span>Schedule</span><strong>Term ' + esc(d.term || 1) + ' · Week ' + esc(d.week || 1) + '</strong></div></div><input type="hidden" name="childId" value="' + esc(d.childId || child && child.id || '') + '"><input type="hidden" name="subject" value="' + esc(d.subject || subjects[0] || '') + '"><input type="hidden" name="topic" value="' + esc(d.topic || '') + '"><input type="hidden" name="term" value="' + esc(d.term || 1) + '"><input type="hidden" name="week" value="' + esc(d.week || 1) + '"><input type="hidden" name="notes" value="' + esc(d.notes || '') + '"><p class="pd-wizard-tip">' + icon('book') + ' GuidEd will prepare the parent guide, child-friendly explanation, practical activity and questions.</p>';
    }
    return '<form class="pd-form pd-task-form pd-lesson-wizard" id="pdTaskForm" data-step="' + step + '"><div class="pd-wizard-progress"><div><span>STEP ' + (step+1) + ' OF 4</span><strong>' + titles[step] + '</strong></div><div class="pd-wizard-progress-track">' + dots + '</div></div><section class="pd-wizard-card"><div class="pd-wizard-art-wrap">' + familyArt(scenes[step], 'pd-wizard-art') + '</div><span class="pd-wizard-icon">' + icon(icons[step]) + '</span><h3>' + titles[step] + '</h3><p class="pd-wizard-hint">' + hints[step] + '</p>' + content + '</section><div class="pd-wizard-actions">' + (step ? '<button type="button" class="pd-secondary" data-lesson-back>Back</button>' : '<span></span>') + (step < 3 ? '<button type="button" class="pd-primary" data-lesson-next>Continue ' + icon('chevron') + '</button>' : '<button type="submit" class="pd-primary"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? 'Preparing lesson…' : 'Create home lesson ' + icon('chevron')) + '</button>') + '</div></form>';
  }

  function lessonSections(content) {
    var lines = String(content || '').split(/\r?\n/), sections = [], current = { title: 'Lesson guide', body: [] };
    lines.forEach(function (line) { var heading = line.match(/^\s{0,3}#{1,4}\s+(.+?)\s*#*\s*$/) || line.match(/^\s*\*\*(.+?)\*\*\s*$/); if (heading) { if (current.body.length) sections.push(current); current = { title: heading[1].replace(/\*\*/g, '').trim(), body: [] }; } else current.body.push(line); });
    if (current.body.length) sections.push(current); return sections.filter(function (section) { return section.body.join('').trim(); });
  }
  function lessonStageIndex(title) { var t = title.toLowerCase(); if (/learn|goal|objective|material|prepare|parent/.test(t)) return 0; if (/explain|everyday|example|concept|meaning|key term/.test(t)) return 1; if (/try|together|activity|demonstrat|explor|step/.test(t)) return 2; if (/ask|question|check|understand/.test(t)) return 3; if (/answer|practice|worksheet|exercise|quiz/.test(t)) return 4; if (/encourage|review|summary|reflect|record|celebrat/.test(t)) return 5; return 1; }
  function lessonTextHtml(text) { return String(text || '').split(/\n{2,}/).map(function (paragraph) { var clean = paragraph.trim(); if (!clean) return ''; var lines = clean.split('\n'); if (lines.every(function (line) { return /^\s*[-*•]\s+/.test(line); })) return '<ul>' + lines.map(function (line) { return '<li>' + esc(line.replace(/^\s*[-*•]\s+/, '')) + '</li>'; }).join('') + '</ul>'; return '<p>' + lines.map(function (line) { return esc(line).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); }).join('<br>') + '</p>'; }).join(''); }
  function worksheetInline(text) {
    return esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  }
  function worksheetHtml(markdown) {
    var lines = String(markdown || '').replace(/\r/g, '').split('\n'), out = [], i = 0;
    while (i < lines.length) {
      var line = lines[i], trimmed = line.trim();
      if (!trimmed) { i++; continue; }
      var h = trimmed.match(/^#{1,3}\s+(.+)$/);
      if (h) {
        var title = h[1].replace(/\s*#*$/, '');
        if (/^Part\s+[A-C]\s*:/i.test(title)) out.push('<h3 class="pd-worksheet-part">' + worksheetInline(title) + '</h3>');
        else if (/learner worksheet/i.test(title)) out.push('<h2 class="pd-worksheet-title">' + worksheetInline(title) + '</h2>');
        else out.push('<h4 class="pd-worksheet-heading">' + worksheetInline(title) + '</h4>');
        i++; continue;
      }
      if (/^\*\*(Instructions|Word bank):\*\*/i.test(trimmed)) {
        out.push('<div class="pd-worksheet-callout">' + worksheetInline(trimmed) + '</div>'); i++; continue;
      }
      if (/^\|.*\|$/.test(trimmed)) {
        var rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
          var cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map(function(x){return x.trim();});
          if (!cells.every(function(x){return /^:?-{3,}:?$/.test(x);})) rows.push(cells);
          i++;
        }
        if (rows.length) out.push('<div class="pd-worksheet-table-wrap"><table class="pd-worksheet-table"><tbody>' + rows.map(function(row,ri){return '<tr>' + row.map(function(cell){return ri===0?'<th>'+worksheetInline(cell)+'</th>':'<td>'+worksheetInline(cell)+'</td>';}).join('') + '</tr>';}).join('') + '</tbody></table></div>');
        continue;
      }
      var ordered = trimmed.match(/^\d+[.)]\s+(.+)$/), unordered = trimmed.match(/^[-*•]\s+(.+)$/);
      if (ordered || unordered) {
        var isOrdered = !!ordered, tag = isOrdered ? 'ol' : 'ul', items = [];
        while (i < lines.length) {
          var m = lines[i].trim().match(isOrdered ? /^\d+[.)]\s+(.+)$/ : /^[-*•]\s+(.+)$/);
          if (!m) break; items.push('<li>' + worksheetInline(m[1]) + '</li>'); i++;
        }
        out.push('<' + tag + ' class="pd-worksheet-list">' + items.join('') + '</' + tag + '>'); continue;
      }
      if (/^_{8,}$/.test(trimmed)) { out.push('<div class="pd-worksheet-answer-line"></div>'); i++; continue; }
      var para = [trimmed]; i++;
      while (i < lines.length && lines[i].trim() && !/^#{1,3}\s|^\*\*(Instructions|Word bank):\*\*|^\|.*\|$|^\d+[.)]\s|^[-*•]\s/.test(lines[i].trim())) { para.push(lines[i].trim()); i++; }
      out.push('<p>' + para.map(worksheetInline).join('<br>') + '</p>');
    }
    return '<div class="pd-worksheet">' + out.join('') + '</div>';
  }
  function renderLessonRoom(record) {
    var data = record.data || {}, stages = [['Get ready','Know what your child will learn and gather what you need','book'],['Learn together','Explain the idea using simple, familiar examples','spark'],['Explore and try','Do a practical activity together','users'],['Check understanding','Ask questions and listen to your child','message'],['Practice','Let your child try, then reveal the answers','clipboard'],['Review and celebrate','Reflect on the learning and record progress','check']];
    var buckets = [[],[],[],[],[],[]]; lessonSections(data.content).forEach(function (section) { buckets[lessonStageIndex(section.title)].push(section); });
    var stage = Math.max(0, Math.min(5, Number(data.lessonStage) || 0)), parts = buckets[stage];
    var body = parts.length ? parts.map(function (part) { var isAnswer = /answer|marking guide/i.test(part.title); return '<section class="pd-room-section"><h4>' + esc(part.title) + '</h4>' + (isAnswer ? '<div class="pd-answer-content" hidden>' + lessonTextHtml(part.body.join('\n')) + '</div><button type="button" class="pd-secondary pd-small" data-reveal-answer>Show answers</button>' : lessonTextHtml(part.body.join('\n'))) + '</section>'; }).join('') : '<p class="pd-room-empty">Use this stage to talk through the activity together.</p>';
    var stageArt = ['book-sprout', 'family-reading', 'learning-together', 'curious-child', 'practice-pencil', 'celebration'][stage];
    return '<section class="pd-lesson-room" aria-live="polite"><div class="pd-room-top"><button type="button" class="pd-text-button" data-exit-lesson>← Back</button><button type="button" class="pd-text-button pd-room-delete" data-delete-record="' + esc(state.lessonRoom) + '">Delete</button><h2>' + esc(data.topic || data.title || 'Home lesson') + '</h2><p>' + esc(data.childName || 'Your child') + ' · ' + esc(data.class || '') + ' · ' + esc(data.subject || '') + '</p></div><div class="pd-room-progress"><div><span>STAGE ' + (stage + 1) + ' OF 6</span><strong>' + esc(stages[stage][0]) + '</strong></div><div class="pd-room-track"><span style="width:' + (((stage + 1) / 6) * 100) + '%"></span></div></div><article class="pd-room-card"><span class="pd-room-icon">' + icon(stages[stage][2]) + '</span><h3>' + esc(stages[stage][0]) + '</h3><p class="pd-room-hint">' + esc(stages[stage][1]) + '</p>' + familyArt(stageArt, 'pd-stage-art') + body + '</article><div class="pd-room-actions">' + (stage ? '<button type="button" class="pd-secondary" data-lesson-stage="' + (stage - 1) + '"' + (state.stageSaving ? ' disabled' : '') + '>Previous</button>' : '<span></span>') + (stage < 5 ? '<button type="button" class="pd-primary" data-lesson-stage="' + (stage + 1) + '"' + (state.stageSaving ? ' disabled' : '') + '>' + (state.stageSaving ? 'Saving…' : 'Next stage ' + icon('chevron')) + '</button>' : '<button type="button" class="pd-primary" data-finish-lesson' + (state.stageSaving ? ' disabled' : '') + '>Finish lesson ' + icon('check') + '</button>') + '</div><p class="pd-room-save">' + (state.stageSaving ? 'Saving your place…' : 'Your place is saved automatically. You can return to this lesson later.') + '</p></section>';
  }
  function renderActivity(record) {
    var data = record.data || {};
    var child = children().find(function (item) { return item.id === data.childId; });
    var childName = data.childName || (child && child.name) || 'Child';
    var childClass = data.class || (child && child.class) || '';
    var meta = [childName, data.subject, childClass].filter(Boolean).join(' · ');
    var status = data.status === 'completed'
      ? '<span class="pd-done">Completed' + (data.score == null ? '' : ' · ' + esc(data.score) + '%') + '</span>'
      : '<div class="pd-complete-wrap"><label class="pd-score">Score (optional)<input type="number" min="0" max="100" step="1" inputmode="numeric" data-score-input aria-label="Optional score out of 100"></label><button type="button" class="pd-primary pd-small" data-complete="' + esc(record.id) + '">Mark complete</button></div>';
    return '<article class="pd-activity" data-record="' + esc(record.id) + '"><span class="pd-activity-icon pd-activity-art">' + familyArt(record.kind === 'practice' ? 'practice-pencil' : record.kind === 'explanation' ? 'curious-child' : 'book-sprout', 'pd-activity-mini-art') + '</span><div class="pd-activity-copy"><span class="pd-kicker">' + esc(labels[record.kind] || 'Learning activity') + '</span><h3>' + esc(data.title || data.topic || 'Learning activity') + '</h3><p>' + esc(meta) + '</p><small>' + (data.status === 'completed' ? 'Completed' : 'Saved for learning') + '</small></div><div class="pd-activity-actions"><button type="button" class="pd-secondary pd-small" data-view-record="' + esc(record.id) + '">Open activity</button>' + status + '<button type="button" class="pd-delete-record" data-delete-record="' + esc(record.id) + '" aria-label="Delete this activity">Delete</button></div></article>';
  }

  function renderProgress() {
    var chosen = state.progressChildId || 'all';
    var scoped = state.records.filter(function (record) { return chosen === 'all' || (record.data && record.data.childId === chosen); });
    var completed = scoped.filter(function (record) { return record.data && record.data.status === 'completed'; });
    var saved = scoped.length - completed.length;
    var practice = completed.filter(function (record) { return record.kind === 'practice'; }).length;
    var child = children().find(function (item) { return item.id === chosen; });
    var milestones = [{at:1,title:'First steps',note:'Your first activity completed',art:'book-sprout'},{at:3,title:'Growing confidence',note:'Three activities completed',art:'curious-child'},{at:5,title:'Learning star',note:'Five activities completed',art:'celebration'}];
    var earned = milestones.filter(function (item) { return completed.length >= item.at; });
    var options = '<option value="all"' + (chosen === 'all' ? ' selected' : '') + '>All children</option>' + children().map(function (item) { return '<option value="' + esc(item.id) + '"' + (chosen === item.id ? ' selected' : '') + '>' + esc(item.name) + '</option>'; }).join('');
    var milestoneHtml = milestones.map(function (item) { var unlocked = completed.length >= item.at; return '<article class="pd-milestone' + (unlocked ? ' is-earned' : ' is-locked') + '"><span class="pd-milestone-art">' + familyArt(item.art, 'pd-milestone-illustration') + '</span><div><strong>' + esc(item.title) + '</strong><span>' + esc(item.note) + '</span></div><span class="pd-milestone-state">' + (unlocked ? 'Earned' : completed.length + ' / ' + item.at) + '</span></article>'; }).join('');
    var activityHtml = scoped.length ? scoped.map(renderActivity).join('') : '<div class="pd-empty pd-empty-illustrated">' + familyArt('book-sprout', 'pd-empty-art') + '<strong>' + (child ? esc(child.name) + '’s learning story starts here.' : 'Your family learning story starts here.') + '</strong><span>Plan a home lesson or create a practice activity to begin.</span></div>';
    return '<section class="pd-progress-hero"><div class="pd-progress-hero-copy"><span class="pd-kicker">EVERY LITTLE STEP COUNTS</span><h2>' + (child ? esc(child.name) + '’s progress' : 'Look how far you’ve come') + '</h2><p>Celebrate effort, curiosity and every activity completed together.</p></div>' + familyArt('celebration', 'pd-progress-hero-art') + '</section>' +
      '<div class="pd-progress-filter"><label for="pdProgressChild">Learning profile</label><select id="pdProgressChild">' + options + '</select></div>' +
      '<div class="pd-progress-stats"><article><strong>' + scoped.length + '</strong><span>Activities started</span></article><article><strong>' + completed.length + '</strong><span>Completed</span></article><article><strong>' + saved + '</strong><span>Still to explore</span></article></div>' +
      '<section class="pd-milestone-section"><div class="pd-section-head"><div><span class="pd-kicker">LITTLE WINS</span><h3>Milestones</h3><p>' + (earned.length ? earned.length + ' of ' + milestones.length + ' milestones earned. Keep going!' : 'Every completed activity brings a new milestone closer.') + '</p></div></div><div class="pd-milestone-grid">' + milestoneHtml + '</div></section>' +
      '<div class="pd-section-head pd-progress-activity-head"><div><span class="pd-kicker">THE LEARNING STORY</span><h3>Learning activities</h3><p>' + (practice ? practice + ' practice ' + (practice === 1 ? 'activity' : 'activities') + ' completed' : 'Saved and completed activities appear here.') + '</p></div></div>' +
      '<div class="pd-activity-list">' + activityHtml + '</div>';
  }
  // "3 of 5 free home activities left this week", shown only to free accounts when plans are switched on.
  function allowanceHtml() {
    var P = window.GuidedPlans, info = P && P.info && P.info();
    if (!P || P.tier() !== 'free' || !info || !info.free || !info.free.parent || !info.free.parent.limit) return '';
    var a = info.free.parent, left = Math.max(0, a.limit - a.used);
    return '<p class="pd-allowance' + (left ? '' : ' pd-allowance-out') + '" role="status"><span>' + (left ? left + ' of ' + a.limit + ' free activities left this week' : 'Free activities used up. They return Monday') + '</span><button type="button" class="pd-allowance-link" data-upgrade>Go Pro</button></p>';
  }
  function render() {
    if (!state.root) return;
    var profile = state.profile || {}, list = children(), recent = state.records.slice(0, 4);
    var tabs = [['overview', 'home', 'Overview'], ['children', 'users', 'My Children'], ['lesson', 'book', 'Home Lesson'], ['explanation', 'spark', 'Understand'], ['practice', 'clipboard', 'Exercises'], ['progress', 'chart', 'Progress']];
    var nav = tabs.map(function (item) { return '<button type="button" role="tab" aria-selected="' + (state.tab === item[0] ? 'true' : 'false') + '" data-parent-tab="' + item[0] + '" class="' + (state.tab === item[0] ? 'is-active' : '') + '"' + (state.tab === item[0] ? ' aria-current="page"' : '') + '>' + icon(item[1]) + '<span>' + item[2] + '</span></button>'; }).join('');
    var body = '';
    if (state.tab === 'overview') {
      body = '<section class="pd-welcome"><div class="pd-welcome-copy"><span class="pd-kicker">YOUR FAMILY LEARNING SPACE</span><h2>Welcome, ' + esc(profile.displayName || 'Parent') + '.</h2><p>Every small learning moment counts. Choose a child, explore a topic and learn together at home.</p></div><div class="pd-welcome-art">' + familyArt('family-reading', 'pd-family-hero-art') + '</div><button type="button" class="pd-primary pd-welcome-action" data-parent-tab="' + (list.length ? 'lesson' : 'children') + '">' + (list.length ? 'Plan a home lesson' : 'Add your child') + '</button></section><div class="pd-stats"><article><span class="pd-stat-icon">' + icon('users') + '</span><strong>' + list.length + '</strong><span>Children</span></article><article><span class="pd-stat-icon">' + icon('book') + '</span><strong>' + state.records.length + '</strong><span>Saved activities</span></article><article><span class="pd-stat-icon">' + icon('check') + '</span><strong>' + state.records.filter(function (r) { return r.data && r.data.status === 'completed'; }).length + '</strong><span>Completed</span></article></div><div class="pd-quick-grid"><button type="button" data-open-task="lesson"><span class="pd-quick-art-wrap">' + familyArt('book-sprout', 'pd-quick-art') + '</span><strong>Plan a Home Lesson</strong><span>Create a guided activity to learn together.</span></button><button type="button" data-open-task="explanation"><span class="pd-quick-art-wrap">' + familyArt('curious-child', 'pd-quick-art') + '</span><strong>Help Me Understand</strong><span>Get a simple explanation of a difficult topic.</span></button><button type="button" data-open-task="practice"><span class="pd-quick-art-wrap">' + familyArt('practice-pencil', 'pd-quick-art') + '</span><strong>Practice Exercises</strong><span>Give your child questions with answers.</span></button><button type="button" data-parent-tab="progress"><span class="pd-quick-art-wrap">' + familyArt('celebration', 'pd-quick-art') + '</span><strong>Learning Progress</strong><span>See saved and completed activities.</span></button></div><div class="pd-section-head"><div><h2>My Children</h2><p>Learning profiles linked to your account.</p></div><button type="button" class="pd-text-button" data-parent-tab="children">Manage children</button></div><div class="pd-child-list">' + (list.length ? list.map(function (child) { return '<article class="pd-child-card"><span class="pd-child-avatar pd-child-avatar-art">' + familyArt('curious-child', 'pd-child-mini-art') + '</span><div><span class="pd-kicker">' + esc(child.class) + '</span><h3>' + esc(child.name) + '</h3><p>' + esc((child.subjects || []).join(' · ')) + '</p></div><button type="button" data-edit-child="' + esc(child.id) + '">Edit</button></article>'; }).join('') : '<div class="pd-empty pd-empty-illustrated">' + familyArt('empty-books', 'pd-empty-art') + '<strong>Your family learning story starts here.</strong><span>Add a child to begin.</span></div>') + '</div><div class="pd-section-head"><div><h2>Recent learning</h2><p>Your latest saved activities.</p></div><button type="button" class="pd-text-button" data-parent-tab="progress">View all</button></div><div class="pd-activity-list">' + (recent.length ? recent.map(renderActivity).join('') : '<div class="pd-empty pd-empty-illustrated">' + familyArt('book-sprout', 'pd-empty-art') + '<strong>A little learning goes a long way.</strong><span>Your saved lessons and activities will appear here.</span></div>') + '</div>';
    } else if (state.tab === 'children') body = renderChildren();
    else if (['lesson', 'explanation', 'practice'].includes(state.tab)) {
      state.task = state.tab;
      var activeLesson = state.task === 'lesson' && state.lessonRoom && state.records.find(function (item) { return item.id === state.lessonRoom; });
      body = activeLesson ? renderLessonRoom(activeLesson) : '<div class="pd-section-head"><div><span class="pd-kicker">CURRICULUM-GUIDED HOME LEARNING</span><h2>' + esc(labels[state.task]) + '</h2><p>' + (state.task === 'lesson' ? 'A complete activity for you and your child to work through together.' : state.task === 'explanation' ? 'A clear explanation you can use when your child gets stuck.' : 'Age-appropriate questions with an answer key and explanations.') + '</p></div></div>' + (list.length ? renderTaskForm() : '<div class="pd-empty pd-empty-illustrated">' + familyArt('family-reading', 'pd-empty-art') + '<strong>Let’s set up your learning team.</strong><span>Add a child profile before creating a home-learning activity.</span></div><button type="button" class="pd-primary" data-parent-tab="children">Add a child</button>') + (state.result ? '<section class="pd-result" aria-live="polite"><div class="pd-section-head"><div><span class="pd-kicker">READY FOR YOU AND YOUR CHILD</span><h3>' + esc(state.result.title) + '</h3></div><button type="button" class="pd-text-button" data-clear-result>Close</button></div>' + (state.result.kind === 'practice' ? worksheetHtml(state.result.content) : '<pre>' + esc(state.result.content) + '</pre>') + '</section>' : '');
    } else {
      body = renderProgress();
    }
    if (['overview', 'lesson', 'explanation', 'practice'].indexOf(state.tab) >= 0 && body.indexOf('pd-lesson-room') < 0) body = allowanceHtml() + body;   // not while a lesson is open
    state.root.innerHTML = '<div class="pd-header"><div><span class="pd-brand">GuidEd <i>Family</i></span><span class="pd-account">' + icon('users') + ' Parent account</span></div></div><nav class="pd-tabs" aria-label="Parent dashboard">' + nav + '</nav><div class="pd-main">' + (state.error ? '<p class="pd-error" role="alert">' + esc(state.error) + '</p>' : '') + (state.loading ? '<p class="pd-note">Loading your saved learning activities…</p>' : '') + body + '</div>';
    if (state.root.dataset.parentWired !== '1') wire();
    if (window.GuidedAds && window.GuidedAds.syncParent) window.GuidedAds.syncParent(state.tab === 'overview' && !state.busy && !state.result);
  }

  function wire() {
    state.root.dataset.parentWired = '1';
    state.root.addEventListener('click', function (event) {
      var tab = event.target.closest('[data-parent-tab]');
      if (tab) { if (tab.dataset.parentTab === 'lesson') { state.lessonStep = 0; state.lessonDraft = {}; } state.tab = tab.dataset.parentTab; state.result = null; render(); return; }
      if (event.target.closest('[data-upgrade]')) { if (window.GuidedPlans) window.GuidedPlans.openUpgrade('parent', ''); return; }
      var open = event.target.closest('[data-open-task]');
      if (open) { state.tab = open.dataset.openTask; state.task = open.dataset.openTask; if (state.task === 'lesson') { state.lessonStep = 0; state.lessonDraft = {}; } state.result = null; render(); return; }
      if (event.target.closest('#pdBack')) { document.dispatchEvent(new CustomEvent('guided:parent-back')); return; }
      var example = event.target.closest('[data-topic-example]');
      if (example) {
        var topic = state.root.querySelector('[name="topic"]'); if (topic) topic.value = example.dataset.topicExample;
        var tform = example.closest('form');
        if (tform && example.dataset.term) {
          var termSel = tform.querySelector('[name="term"]'), weekSel = tform.querySelector('[name="week"]');
          if (termSel) termSel.value = example.dataset.term;
          if (weekSel && example.dataset.week) weekSel.value = example.dataset.week;
          if (tform.dataset.step) state.lessonDraft = Object.assign({}, state.lessonDraft, { term: example.dataset.term, week: example.dataset.week || state.lessonDraft.week });
        }
        state.root.querySelectorAll('[data-topic-example]').forEach(function (b) { b.classList.toggle('is-picked', b === example); });
        return;
      }
      if (event.target.closest('[data-lesson-back]')) { state.lessonStep = Math.max(0, state.lessonStep - 1); state.error = ''; render(); return; }
      if (event.target.closest('[data-lesson-next]')) {
        var wizard = event.target.closest('#pdTaskForm'), step = Number(wizard && wizard.dataset.step || 0), values = new FormData(wizard), draft = Object.assign({}, state.lessonDraft);
        values.forEach(function(value,key){draft[key]=value;});
        if (step === 0 && (!draft.childId || !draft.subject)) { state.error = 'Choose your child and a subject to continue.'; render(); return; }
        if (step === 1 && !String(draft.topic || '').trim()) { state.error = 'Enter a topic before continuing.'; render(); return; }
        state.lessonDraft = draft; state.lessonStep = Math.min(3, step + 1); state.error = ''; render(); return;
      }
      var edit = event.target.closest('[data-edit-child]');
      if (edit) { state.editingChild = edit.dataset.editChild; state.addingChild = false; state.tab = 'children'; render(); return; }
      if (event.target.closest('[data-add-child]')) { state.editingChild = ''; state.addingChild = true; state.error = ''; render(); var nameField = state.root.querySelector('#pdChildForm [name="name"]'); if (nameField) { nameField.focus(); nameField.scrollIntoView({ block: 'center', behavior: 'smooth' }); } return; }
      if (event.target.closest('[data-cancel-edit]')) { state.editingChild = ''; state.addingChild = false; state.error = ''; render(); return; }
      var remove = event.target.closest('[data-remove-child]');
      if (remove) {
        if (!window.confirm('Remove this child and their saved learning history from your parent account?')) return;
        var next = Object.assign({}, state.profile, { children: children().filter(function (child) { return child.id !== remove.dataset.removeChild; }) });
        saveProfile(next).then(function () { state.selectedChild = children()[0] && children()[0].id; return loadRecords(); }).catch(function (error) { state.error = error.message; render(); });
        return;
      }
      var del = event.target.closest('[data-delete-record]');
      if (del) {
        if (!window.confirm('Delete this saved activity? This cannot be undone.')) return;
        var delId = del.dataset.deleteRecord; del.disabled = true;
        window.PadiSync.deleteParentLearning(delId).then(function () {
          state.records = state.records.filter(function (item) { return item.id !== delId; });
          if (state.lessonRoom === delId) state.lessonRoom = null;
          render();
        }).catch(function (error) { state.error = error.message; render(); });
        return;
      }
      var done = event.target.closest('[data-complete]');
      if (done) {
        var record = state.records.find(function (item) { return item.id === done.dataset.complete; });
        if (!record) return;
        var card = done.closest('[data-record]');
        var scoreInput = card && card.querySelector('[data-score-input]');
        var score = scoreInput && scoreInput.value !== '' ? Math.max(0, Math.min(100, Number(scoreInput.value))) : null;
        var data = Object.assign({}, record.data, { status: 'completed', completedAt: Date.now(), score: score });
        done.disabled = true;
        saveRecord({ id: record.id, kind: record.kind, data: data }).then(render).catch(function (error) { state.error = error.message; render(); });
        return;
      }
      var view = event.target.closest('[data-view-record]');
      if (view) {
        var saved = state.records.find(function (item) { return item.id === view.dataset.viewRecord; });
        if (saved) { state.tab = saved.kind || 'progress'; state.task = saved.kind || 'lesson'; if (saved.kind === 'lesson') { state.lessonRoom = saved.id; state.result = null; } else { state.result = { title: (saved.data || {}).title || 'Saved learning activity', content: (saved.data || {}).content || 'This saved activity does not contain a preview.', kind: saved.kind || '' }; } render(); }
        return;
      }
      if (event.target.closest('[data-clear-result]')) { state.result = null; render(); return; }
      if (event.target.closest('[data-exit-lesson]')) { state.lessonRoom = null; state.result = null; state.tab = 'progress'; render(); return; }
      var stageButton = event.target.closest('[data-lesson-stage]');
      if (stageButton && state.lessonRoom) {
        if (state.stageSaving) return;
        var roomRecord = state.records.find(function (item) { return item.id === state.lessonRoom; });
        if (!roomRecord) { state.error = 'This lesson could not be found. Reopen it from Learning Progress.'; render(); return; }
        var previousStage = Number(roomRecord.data.lessonStage) || 0;
        var nextStage = Math.max(0, Math.min(5, Number(stageButton.dataset.lessonStage)));
        if (nextStage === previousStage) return;
        var roomData = Object.assign({}, roomRecord.data, { lessonStage: nextStage });
        roomRecord.data = roomData;
        state.stageSaving = true;
        render();
        saveRecord({ id: roomRecord.id, kind: roomRecord.kind, data: roomData }).then(function () {
          state.stageSaving = false;
          render();
        }).catch(function (error) {
          var current = state.records.find(function (item) { return item.id === roomRecord.id; });
          if (current) current.data = Object.assign({}, current.data, { lessonStage: previousStage });
          state.stageSaving = false;
          state.error = error.message || 'Could not save your lesson position. Please try again.';
          render();
        });
        return;
      }
      var reveal = event.target.closest('[data-reveal-answer]'); if (reveal) { var answer = reveal.parentNode.querySelector('.pd-answer-content'); if (answer) { answer.hidden = false; reveal.hidden = true; } return; }
      if (event.target.closest('[data-finish-lesson]')) { var finished = state.records.find(function (item) { return item.id === state.lessonRoom; }); if (finished) { var finishedData = Object.assign({}, finished.data, { status: 'completed', completedAt: Date.now(), lessonStage: 5 }); saveRecord({ id: finished.id, kind: finished.kind, data: finishedData }).then(function () { state.lessonRoom = null; state.tab = 'progress'; render(); }).catch(function (error) { state.error = error.message; render(); }); } return; }
    });
    state.root.addEventListener('change', function (event) {
      if (event.target.id === 'pdProgressChild') { state.progressChildId = event.target.value; render(); return; }
      var f = event.target.form;
      if (f && f.id === 'pdTaskForm' && !f.dataset.step && (event.target.name === 'childId' || event.target.name === 'subject')) {
        var box = state.root.querySelector('#pdSuggestBox');
        var who = children().find(function (c) { return c.id === f.elements.childId.value; });
        if (box) box.innerHTML = suggestHtml(who, f.elements.subject.value);
      }
    });
    state.root.addEventListener('change', function (event) {
      if (event.target.id === 'pdReminders') {
        var on = event.target.checked;
        saveProfile(Object.assign({}, state.profile, { familyReminders: on })).catch(function (error) { state.error = error.message; render(); });
        return;
      }
      if (event.target.name === 'class' && event.target.form && event.target.form.id === 'pdChildForm') {
        var cls = event.target.value;
        var box = event.target.form.querySelector('.pd-subject-grid');
        if (box) box.innerHTML = subjectsFor(cls).map(function (subject, i) { return '<label class="pd-check"><input type="checkbox" name="childSubjects" value="' + esc(subject) + '"' + (i < 3 ? ' checked' : '') + '><span>' + esc(subject) + '</span></label>'; }).join('');
      }
      if (event.target.name === 'childId' && event.target.form && event.target.form.id === 'pdTaskForm' && event.target.form.dataset.step === '0') {
        var picked = children().find(function(c){return c.id===event.target.value;});
        var subject = event.target.form.querySelector('[name="subject"]');
        if (picked && subject) { var opts = picked.subjects && picked.subjects.length ? picked.subjects : subjectsFor(picked.class); subject.innerHTML = opts.map(function(s){return '<option>'+esc(s)+'</option>';}).join(''); state.lessonDraft = Object.assign({},state.lessonDraft,{childId:picked.id,subject:opts[0]||''}); }
      }
      if (event.target.name === 'childId' && event.target.form && event.target.form.id === 'pdTaskForm' && event.target.form.dataset.step !== '0') {
        var child = children().find(function (item) { return item.id === event.target.value; });
        var subjectSelect = event.target.form.querySelector('[name="subject"]');
        if (child && subjectSelect) { state.selectedChild = child.id; subjectSelect.innerHTML = (child.subjects || []).map(function (subject) { return '<option>' + esc(subject) + '</option>'; }).join(''); }
      }
    });
    state.root.addEventListener('submit', function (event) {
      if (event.target.id === 'pdChildForm') {
        event.preventDefault();
        var form = event.target, name = form.elements.name.value.trim(), cls = form.elements.class.value;
        var subjects = Array.from(form.querySelectorAll('[name="childSubjects"]:checked')).map(function (input) { return input.value; });
        if (!name || !subjects.length) { state.error = 'Enter the child’s name and select at least one subject.'; render(); return; }
        var editing = children().find(function (child) { return child.id === state.editingChild; });
        var child = { id: editing ? editing.id : uid(), name: name, class: cls, subjects: subjects, minutes: Number(form.elements.minutes.value) || 30 };
        var next = Object.assign({}, state.profile, { children: editing ? children().map(function (item) { return item.id === editing.id ? child : item; }) : children().concat([child]) });
        if (!state.profile.roles || !state.profile.roles.includes('parent')) next.roles = ['parent'];
        next.primaryRole = 'parent';
        saveProfile(next).then(function () { state.selectedChild = child.id; state.tab = 'children'; state.addingChild = false; render(); }).catch(function (error) { state.error = error.message; render(); });
      }
      if (event.target.id === 'pdTaskForm') {
        event.preventDefault();
        generate(event.target);
      }
    });
  }

  async function generate(form) {
    if (state.busy) return;
    var values = Object.fromEntries(new FormData(form).entries());
    var child = children().find(function (item) { return item.id === values.childId; });
    if (!child) { state.error = 'Choose a child first.'; render(); return; }
    state.busy = true; state.error = ''; state.result = null; render();
    var task = state.task, topic = String(values.topic || '').trim();
    var focus = task === 'lesson'
      ? 'Prepare a complete parent-guided home lesson for this topic.'
      : task === 'explanation'
        ? 'Explain this topic simply to a parent so they can help their child understand it. Include a child-friendly explanation and everyday example.'
        : 'Prepare a practice worksheet for this topic with questions, a separate answer key and brief explanations.';
    var resourceType = task === 'practice' ? 'Learner worksheet' : 'Study notes';
    var notes = [focus, 'Parent-selected topic: ' + topic, values.notes ? 'Parent focus: ' + values.notes : '', 'The activity should fit the child’s daily learning goal of ' + child.minutes + ' minutes.'].filter(Boolean).join('\n');
    try {
      var headers = await auth();
      var response = await fetch('/api/generate', {
        method: 'POST',
        headers: Object.assign({ 'content-type': 'application/json', 'x-access-code': (localStorage.getItem('schoolpadi.access') || '') }, headers),
        body: JSON.stringify({ params: { subject: values.subject, cls: child.class, week: Number(values.week), term: Number(values.term), hook: false, light: true, studyNotes: true, bece: false, size: '', mode: 'parent', resourceType: resourceType, notes: notes }, thread: [] })
      });
      if (!response.ok) {
        var errorBody = {}; try { errorBody = await response.json(); } catch (ignore) {}
        if (response.status === 402 && errorBody.error === 'limit' && window.GuidedPlans && window.GuidedPlans.openUpgrade) window.GuidedPlans.openUpgrade(errorBody.reason || 'parent', errorBody.message || '');
        throw new Error(errorBody.message || 'Could not generate this learning activity (' + response.status + ').');
      }
      var output = '';
      if (response.body && response.body.getReader) {
        var reader = response.body.getReader(), decoder = new TextDecoder();
        for (;;) { var part = await reader.read(); if (part.done) break; output += decoder.decode(part.value, { stream: true }); }
      } else output = await response.text();
      var marker = output.indexOf('<<SCHOOLPADI_ERROR>>');
      if (marker >= 0) { var detail = output.slice(marker + 21).trim(); output = output.slice(0, marker).trim(); if (!output) throw new Error(detail || 'The resource could not be completed.'); }
      if (!output.trim()) throw new Error('The AI returned an empty learning activity. Please try again.');
      var title = labels[task] + ': ' + topic;
      var record = { id: uid(), kind: task, data: { childId: child.id, childName: child.name, class: child.class, dailyGoal: child.minutes, subject: values.subject, topic: topic, title: title, content: output, week: Number(values.week), term: Number(values.term), status: 'saved', lessonStage: 0, createdAt: Date.now() } };
      await saveRecord(record);
      if (task === 'lesson') { state.lessonRoom = record.id; state.result = null; } else state.result = { title: title, content: output, kind: task };
      state.error = '';
      if (window.GuidedPlans && window.GuidedPlans.load) window.GuidedPlans.load().catch(function () {});   // refresh the free-activities counter
    } catch (error) {
      state.error = error.message || 'Something went wrong. Please try again.';
    } finally {
      state.busy = false; render();
    }
  }

  window.GuidedParentDashboard = {
    mount: function (root, profile) {
      state.root = root;
      state.profile = profile || state.profile || {};
      if (!state.plansHooked && window.GuidedPlans && window.GuidedPlans.onChange) { state.plansHooked = true; window.GuidedPlans.onChange(function () { if (state.root && state.root.isConnected && !state.busy) render(); }); }
      if (!state.selectedChild && children().length) state.selectedChild = children()[0].id;
      if (!state.root.dataset.parentWired) wire();
      render();
      if (!state.loaded && !state.loading) loadRecords();
    },
    // The ads settings arrived after the dashboard drew: check the banner again.
    syncAds: function () { if (window.GuidedAds && window.GuidedAds.syncParent && state.root) window.GuidedAds.syncParent(state.tab === 'overview' && !state.busy && !state.result); },
    // Used by "New Home Lesson" in the sidebar: start a fresh home lesson.
    open: function (tab) {
      if (!state.root) return;
      state.tab = tab || 'overview'; state.result = null; state.error = '';
      if (state.tab === 'lesson') { state.lessonStep = 0; state.lessonDraft = {}; state.lessonRoom = null; }
      render();
    }
  };
})();
