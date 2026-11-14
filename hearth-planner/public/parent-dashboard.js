/* GuidEd Parent Dashboard: child management, home learning and progress. */
(function () {
  'use strict';
  var state = { root: null, profile: null, records: [], loaded: false, loading: false, tab: 'overview', task: 'lesson', editingChild: '', busy: false, error: '', result: null };
  var $ = function (selector, root) { return (root || state.root).querySelector(selector); };
  var esc = function (value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]; }); };
  var uid = function () { return 'pl-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-5); };
  var children = function () { return Array.isArray(state.profile && state.profile.children) ? state.profile.children : []; };
  var selectedChild = function () { return children().find(function (child) { return child.id === state.selectedChild; }) || children()[0] || null; };
  var subjectsFor = function (cls) {
    var level = window.GuidedLevels && window.GuidedLevels.levelOfClass(cls);
    return level && Array.isArray(level.subjects) ? level.subjects : ['Mathematics', 'English Language', 'Science', 'Computing', 'Social Studies'];
  };
  var labels = { lesson: 'Plan a Home Lesson', explanation: 'Help Me Understand', practice: 'Practice Exercises' };

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
      state.error = ''; state.editingChild = '';
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
      return '<article class="pd-child-card"><div><span class="pd-kicker">' + esc(child.class) + '</span><h3>' + esc(child.name) + '</h3><p>' + esc((child.subjects || []).join(' · ')) + '</p><small>' + esc(child.minutes || 30) + ' minutes daily</small></div><div class="pd-child-actions"><button type="button" data-edit-child="' + esc(child.id) + '">Edit</button><button type="button" class="pd-muted-action" data-remove-child="' + esc(child.id) + '">Remove</button></div></article>';
    }).join('');
    var child = list.find(function (item) { return item.id === state.editingChild; });
    var cls = child ? child.class : 'Basic 7';
    var selected = child && Array.isArray(child.subjects) ? child.subjects : subjectsFor(cls).slice(0, 3);
    var subjectOptions = subjectsFor(cls).map(function (subject) {
      return '<label class="pd-check"><input type="checkbox" name="childSubjects" value="' + esc(subject) + '"' + (selected.includes(subject) ? ' checked' : '') + '><span>' + esc(subject) + '</span></label>';
    }).join('');
    return '<div class="pd-section-head"><div><span class="pd-kicker">FAMILY LEARNING</span><h2>My Children</h2><p>Manage the children whose learning you support.</p></div><span class="pd-count">' + list.length + ' / 10</span></div>' +
      '<div class="pd-child-list">' + (cards || '<div class="pd-empty">Add your child to start planning learning activities.</div>') + '</div>' +
      (list.length >= 10 && !child ? '<p class="pd-note">You can add up to 10 children to one parent account.</p>' :
      '<form class="pd-form pd-child-form" id="pdChildForm"><h3>' + (child ? 'Update child details' : 'Add a child') + '</h3><label>Child’s name<input name="name" maxlength="80" required value="' + esc(child && child.name || '') + '" placeholder="Child’s name"></label><div class="pd-form-grid"><label>Class<select name="class">' + Array.from({ length: 9 }, function (_, i) { var value = 'Basic ' + (i + 1); return '<option' + (value === cls ? ' selected' : '') + '>' + value + '</option>'; }).join('') + '</select></label><label>Daily learning time<select name="minutes">' + [15, 30, 45, 60].map(function (n) { return '<option value="' + n + '"' + (Number(child && child.minutes || 30) === n ? ' selected' : '') + '>' + n + ' minutes</option>'; }).join('') + '</select></label></div><fieldset><legend>Subjects</legend><div class="pd-subject-grid">' + subjectOptions + '</div></fieldset><div class="pd-form-actions"><button class="pd-primary" type="submit">' + (child ? 'Save changes' : 'Add child') + '</button>' + (child ? '<button type="button" class="pd-secondary" data-cancel-edit>Cancel</button>' : '') + '</div></form>');
  }

  function renderTaskForm() {
    var list = children(), child = selectedChild();
    var subjects = child && child.subjects && child.subjects.length ? child.subjects : subjectsFor(child && child.class || 'Basic 7');
    var weekOptions = Array.from({ length: 14 }, function (_, i) { return '<option value="' + (i + 1) + '">' + (i + 1) + '</option>'; }).join('');
    return '<form class="pd-form pd-task-form" id="pdTaskForm"><div class="pd-form-grid"><label>Choose your child<select name="childId" required>' + list.map(function (item) { return '<option value="' + esc(item.id) + '"' + (child && item.id === child.id ? ' selected' : '') + '>' + esc(item.name) + ' · ' + esc(item.class) + '</option>'; }).join('') + '</select></label><label>Subject<select name="subject">' + subjects.map(function (subject) { return '<option>' + esc(subject) + '</option>'; }).join('') + '</select></label></div><label>Topic or area to learn<input name="topic" maxlength="180" placeholder="e.g. Parts of a computer" required></label><div class="pd-form-grid"><label>Term<select name="term"><option value="1">Term 1</option><option value="2">Term 2</option><option value="3">Term 3</option></select></label><label>Week<select name="week">' + weekOptions + '</select></label></div><label>Anything you want the AI to focus on (optional)<textarea name="notes" rows="2" maxlength="160" placeholder="e.g. Explain it using examples from our home or community."></textarea></label><button class="pd-primary" type="submit"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? 'Preparing…' : 'Create ' + esc(labels[state.task]).toLowerCase()) + '</button></form>';
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
    return '<article class="pd-activity" data-record="' + esc(record.id) + '"><div class="pd-activity-copy"><span class="pd-kicker">' + esc(labels[record.kind] || 'Learning activity') + '</span><h3>' + esc(data.title || data.topic || 'Learning activity') + '</h3><p>' + esc(meta) + '</p><small>' + (data.status === 'completed' ? 'Completed' : 'Saved for learning') + '</small></div><div class="pd-activity-actions"><button type="button" class="pd-secondary pd-small" data-view-record="' + esc(record.id) + '">Open activity</button>' + status + '</div></article>';
  }

  function render() {
    if (!state.root) return;
    var profile = state.profile || {}, list = children(), recent = state.records.slice(0, 4);
    var tabs = [['overview', 'Overview'], ['children', 'My Children'], ['lesson', 'Plan a Home Lesson'], ['explanation', 'Help Me Understand'], ['practice', 'Practice Exercises'], ['progress', 'Learning Progress']];
    var nav = tabs.map(function (item) { return '<button type="button" role="tab" aria-selected="' + (state.tab === item[0] ? 'true' : 'false') + '" data-parent-tab="' + item[0] + '" class="' + (state.tab === item[0] ? 'is-active' : '') + '"' + (state.tab === item[0] ? ' aria-current="page"' : '') + '>' + item[1] + '</button>'; }).join('');
    var body = '';
    if (state.tab === 'overview') {
      body = '<section class="pd-welcome"><div class="pd-welcome-copy"><span class="pd-kicker">YOUR FAMILY LEARNING SPACE</span><h2>Welcome, ' + esc(profile.displayName || 'Parent') + '.</h2><p>Every small learning moment counts. Choose a child, explore a topic and learn together at home.</p></div><button type="button" class="pd-primary pd-welcome-action" data-parent-tab="' + (list.length ? 'lesson' : 'children') + '">' + (list.length ? 'Plan a home lesson' : 'Add your child') + '</button></section><div class="pd-stats"><article><strong>' + list.length + '</strong><span>Children</span></article><article><strong>' + state.records.length + '</strong><span>Saved activities</span></article><article><strong>' + state.records.filter(function (r) { return r.data && r.data.status === 'completed'; }).length + '</strong><span>Completed</span></article></div><div class="pd-quick-grid"><button type="button" data-open-task="lesson"><strong>Plan a Home Lesson</strong><span>Create a guided activity to learn together.</span></button><button type="button" data-open-task="explanation"><strong>Help Me Understand</strong><span>Get a simple explanation of a difficult topic.</span></button><button type="button" data-open-task="practice"><strong>Practice Exercises</strong><span>Give your child questions with answers.</span></button><button type="button" data-parent-tab="progress"><strong>Learning Progress</strong><span>See saved and completed activities.</span></button></div><div class="pd-section-head"><div><h2>My Children</h2><p>Learning profiles linked to your account.</p></div><button type="button" class="pd-text-button" data-parent-tab="children">Manage children</button></div><div class="pd-child-list">' + (list.length ? list.map(function (child) { return '<article class="pd-child-card"><div><span class="pd-kicker">' + esc(child.class) + '</span><h3>' + esc(child.name) + '</h3><p>' + esc((child.subjects || []).join(' · ')) + '</p></div><button type="button" data-edit-child="' + esc(child.id) + '">Edit</button></article>'; }).join('') : '<div class="pd-empty">Add a child to begin.</div>') + '</div><div class="pd-section-head"><div><h2>Recent learning</h2><p>Your latest saved activities.</p></div><button type="button" class="pd-text-button" data-parent-tab="progress">View all</button></div><div class="pd-activity-list">' + (recent.length ? recent.map(renderActivity).join('') : '<div class="pd-empty">Your saved lessons, explanations and exercises will appear here.</div>') + '</div>';
    } else if (state.tab === 'children') body = renderChildren();
    else if (['lesson', 'explanation', 'practice'].includes(state.tab)) {
      state.task = state.tab;
      body = '<div class="pd-section-head"><div><span class="pd-kicker">CURRICULUM-GUIDED HOME LEARNING</span><h2>' + esc(labels[state.task]) + '</h2><p>' + (state.task === 'lesson' ? 'A complete activity for you and your child to work through together.' : state.task === 'explanation' ? 'A clear explanation you can use when your child gets stuck.' : 'Age-appropriate questions with an answer key and explanations.') + '</p></div></div>' + (list.length ? renderTaskForm() : '<div class="pd-empty">Add a child profile before creating a home-learning activity.</div><button type="button" class="pd-primary" data-parent-tab="children">Add a child</button>') + (state.result ? '<section class="pd-result" aria-live="polite"><div class="pd-section-head"><div><span class="pd-kicker">READY FOR YOU AND YOUR CHILD</span><h3>' + esc(state.result.title) + '</h3></div><button type="button" class="pd-text-button" data-clear-result>Close</button></div><pre>' + esc(state.result.content) + '</pre></section>' : '');
    } else {
      body = '<div class="pd-section-head"><div><span class="pd-kicker">MY CHILD’S LEARNING JOURNEY</span><h2>Learning Progress</h2><p>Keep track of activities your child has completed.</p></div></div><div class="pd-progress-summary"><strong>' + state.records.filter(function (r) { return r.data && r.data.status === 'completed'; }).length + '</strong><span>completed activities</span></div><div class="pd-activity-list">' + (state.records.length ? state.records.map(renderActivity).join('') : '<div class="pd-empty">No learning activities yet. Create a home lesson to get started.</div>') + '</div>';
    }
    state.root.innerHTML = '<div class="pd-header"><div><span class="pd-brand">GuidEd <i>Family</i></span><span class="pd-account">Parent account</span></div><button type="button" class="pd-exit" id="pdBack">Back to workspace</button></div><div class="pd-intro"><h1>Parent Dashboard</h1><p>Support your child’s learning, one step at a time.</p></div><nav class="pd-tabs" aria-label="Parent dashboard">' + nav + '</nav><div class="pd-main">' + (state.error ? '<p class="pd-error" role="alert">' + esc(state.error) + '</p>' : '') + (state.loading ? '<p class="pd-note">Loading your saved learning activities…</p>' : '') + body + '</div>';
    if (state.root.dataset.parentWired !== '1') wire();
  }

  function wire() {
    state.root.dataset.parentWired = '1';
    state.root.addEventListener('click', function (event) {
      var tab = event.target.closest('[data-parent-tab]');
      if (tab) { state.tab = tab.dataset.parentTab; state.result = null; render(); return; }
      var open = event.target.closest('[data-open-task]');
      if (open) { state.tab = open.dataset.openTask; state.task = open.dataset.openTask; state.result = null; render(); return; }
      if (event.target.closest('#pdBack')) { document.dispatchEvent(new CustomEvent('guided:parent-back')); return; }
      var edit = event.target.closest('[data-edit-child]');
      if (edit) { state.editingChild = edit.dataset.editChild; state.tab = 'children'; render(); return; }
      if (event.target.closest('[data-cancel-edit]')) { state.editingChild = ''; render(); return; }
      var remove = event.target.closest('[data-remove-child]');
      if (remove) {
        if (!window.confirm('Remove this child and their saved learning history from your parent account?')) return;
        var next = Object.assign({}, state.profile, { children: children().filter(function (child) { return child.id !== remove.dataset.removeChild; }) });
        saveProfile(next).then(function () { state.selectedChild = children()[0] && children()[0].id; return loadRecords(); }).catch(function (error) { state.error = error.message; render(); });
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
        if (saved) { state.tab = saved.kind || 'progress'; state.task = saved.kind || 'lesson'; state.result = { title: (saved.data || {}).title || 'Saved learning activity', content: (saved.data || {}).content || 'This saved activity does not contain a preview.' }; render(); }
        return;
      }
      if (event.target.closest('[data-clear-result]')) { state.result = null; render(); }
    });
    state.root.addEventListener('change', function (event) {
      if (event.target.name === 'class' && event.target.form && event.target.form.id === 'pdChildForm') {
        var cls = event.target.value;
        var box = event.target.form.querySelector('.pd-subject-grid');
        if (box) box.innerHTML = subjectsFor(cls).map(function (subject, i) { return '<label class="pd-check"><input type="checkbox" name="childSubjects" value="' + esc(subject) + '"' + (i < 3 ? ' checked' : '') + '><span>' + esc(subject) + '</span></label>'; }).join('');
      }
      if (event.target.name === 'childId' && event.target.form && event.target.form.id === 'pdTaskForm') {
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
        saveProfile(next).then(function () { state.selectedChild = child.id; state.tab = 'children'; render(); }).catch(function (error) { state.error = error.message; render(); });
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
      var record = { id: uid(), kind: task, data: { childId: child.id, childName: child.name, class: child.class, dailyGoal: child.minutes, subject: values.subject, topic: topic, title: title, content: output, week: Number(values.week), term: Number(values.term), status: 'saved', createdAt: Date.now() } };
      await saveRecord(record);
      state.result = { title: title, content: output };
      state.error = '';
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
      if (!state.selectedChild && children().length) state.selectedChild = children()[0].id;
      if (!state.root.dataset.parentWired) wire();
      render();
      if (!state.loaded && !state.loading) loadRecords();
    }
  };
})();