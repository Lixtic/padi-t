/* GuidEd · tour.js
   A short, friendly walk through the app for new users. It is a simple card with steps (no element highlighting, so it
   cannot break on a small screen). Starts after sign-up, from the welcome notification, or from Settings > Take the tour. */
(function () {
  'use strict';
  var KEY = 'guided.tourDone', dlg = null, i = 0, steps = [];

  var COMMON_END = [
    { icon: '🔔', title: 'Notifications', text: 'The bell at the top right shows updates, new lessons and family activity. A number on it means something new.' },
    { icon: '⚙️', title: 'Settings', text: 'Change the theme, reminders and your profile in Settings. You can replay this tour there any time.' }
  ];
  function stepsFor(parent) {
    if (parent) return [
      { icon: '👋', title: 'Welcome to GuidEd', text: 'Short, guided lessons for your children at home. Here is a one-minute look around.' },
      { icon: '👨‍👩‍👧', title: 'Add your children', text: 'Open the Family tab and add each child with their class. Lessons are matched to their level.' },
      { icon: '🏡', title: 'Plan a home lesson', text: 'Tap “Plan a home lesson”, choose a child and a subject, and GuidEd prepares a lesson you can do together.' },
      { icon: '📈', title: 'Follow progress', text: 'Progress shows what each child has completed, so you always know what to do next.' },
      { icon: '📁', title: 'Your Library', text: 'Everything you create is saved in Library and follows you to any phone or computer.' }
    ].concat(COMMON_END);
    return [
      { icon: '👋', title: 'Welcome to GuidEd', text: 'Weekly lesson plans for Ghana classes, ready in minutes. Here is a one-minute look around.' },
      { icon: '🎓', title: 'Choose your class', text: 'Pick your class, subject and week at the top of the planner. GuidEd follows the NaCCA curriculum for that week.' },
      { icon: '✨', title: 'Create a plan', text: 'GuidEd writes two lessons, study notes, exam practice and a marking guide. Export it to Word when you are happy.' },
      { icon: '📁', title: 'Your Library', text: 'Plans, notes, worksheets and slides are saved in Library and follow you to any phone or computer.' }
    ].concat(COMMON_END);
  }

  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function done() { try { localStorage.setItem(KEY, '1'); } catch (e) { /* storage blocked */ } }
  function close() { done(); if (dlg && dlg.open) dlg.close(); }

  function render() {
    var s = steps[i], last = i === steps.length - 1;
    dlg.querySelector('.tour-body').innerHTML =
      '<div class="tour-icon" aria-hidden="true">' + s.icon + '</div>' +
      '<h2 id="tourTitle">' + esc(s.title) + '</h2>' +
      '<p class="as-sub">' + esc(s.text) + '</p>' +
      '<div class="tour-dots" role="img" aria-label="Step ' + (i + 1) + ' of ' + steps.length + '">' +
      steps.map(function (_, n) { return '<span' + (n === i ? ' class="on"' : '') + '></span>'; }).join('') + '</div>';
    dlg.querySelector('[data-tour="back"]').hidden = i === 0;
    dlg.querySelector('[data-tour="skip"]').hidden = last;
    dlg.querySelector('[data-tour="next"]').textContent = last ? 'Get started' : 'Next';
  }

  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'acct-sheet tour-sheet'; dlg.setAttribute('aria-labelledby', 'tourTitle');
    dlg.innerHTML = '<section><div class="tour-body"></div><div class="tour-actions">' +
      '<button type="button" class="as-second" data-tour="back">Back</button>' +
      '<button type="button" class="as-submit" data-tour="next">Next</button></div>' +
      '<button type="button" class="aud-skip" data-tour="skip">Skip the tour</button></section>';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-tour]'); if (!b) return;
      var k = b.getAttribute('data-tour');
      if (k === 'skip') close();
      else if (k === 'back') { i = Math.max(0, i - 1); render(); }
      else if (i >= steps.length - 1) close(); else { i++; render(); }
    });
    dlg.addEventListener('cancel', done);
  }

  function start() {
    if (!dlg) build();
    steps = stepsFor(document.body.classList.contains('role-parent')); i = 0; render();
    var open = document.querySelectorAll('dialog[open]');
    open.forEach(function (d) { if (d !== dlg) d.close(); });
    if (!dlg.open) dlg.showModal();
  }
  window.GuidedTour = { start: start, seen: function () { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return true; } } };
})();
