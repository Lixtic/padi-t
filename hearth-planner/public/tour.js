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
      { icon: '📁', title: 'Your Library', text: 'Everything you create is saved in Library and follows you to any phone or computer.' },
      { icon: '🧭', title: 'Guides and careers', text: 'Open More for free parent guides, such as helping with homework and preparing for the BECE, and Career Roadmaps to explore jobs and the steps to reach them.' }
    ].concat(COMMON_END);
    return [
      { icon: '👋', title: 'Welcome to GuidEd', text: 'Weekly lesson plans for Ghana classes, ready in minutes. Here is a one-minute look around.' },
      { icon: '🏠', title: 'Home', text: 'Home is your teaching space. Use the quick buttons to plan a lesson, prepare study notes, find classroom media or make a worksheet. It also shows your week at a glance and the plan you were working on.' },
      { icon: '✨', title: 'Create a plan', text: 'In Office, pick your class, subject and week, then tap Create lesson plan. GuidEd follows the NaCCA curriculum and writes two lessons, study notes and a marking guide. The round + button starts a new plan from anywhere.' },
      { icon: '🎛️', title: 'Options that fit your class', text: 'Under Options you can set your class size, switch the lesson hook on or off, and turn BECE practice on or off. Add a topic or a week-ending date in the box if you need to.' },
      { icon: '🧰', title: 'Resources and media', text: 'In Office, the Resources tab makes study notes, worksheets, homework packs, BECE practice and teaching slides on their own. The Media tab helps you find pictures and videos for the lesson.' },
      { icon: '📝', title: 'BECE practice', text: 'For JHS classes, a plan can include 10 multiple-choice questions and 3 structured questions with a marking guide. They are shaped by what the BECE Chief Examiners reported candidates found hard.' },
      { icon: '📚', title: 'Use your own scheme', text: 'If your school has its own scheme of work, open More, then Use my own scheme, and add it from a spreadsheet or Word table. Planning will follow it. It stays on this device.' },
      { icon: '📁', title: 'Library, Share and download', text: 'Plans, notes, worksheets and slides are saved in Library and follow you to any phone or computer. Open a plan and use Share to send it as a PDF or Word file, for example on WhatsApp.' },
      { icon: '🧭', title: 'Guides and Career Roadmaps', text: 'In More you will find free teaching guides, including a scheme of work generator and the BECE report guides. Career Roadmaps lets your learners explore careers and track their own steps with dates.' }
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
    if (last) confetti(dlg.querySelector('.tour-body'));
    dlg.querySelector('[data-tour="back"]').hidden = i === 0;
    dlg.querySelector('[data-tour="skip"]').hidden = last;
    dlg.querySelector('[data-tour="next"]').textContent = last ? 'Get started' : 'Next';
  }

  // A small burst of confetti on the last step. Plain spans moved by CSS; removed again when the animation ends.
  function confetti(box) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var colors = ['#f5b301', '#3b82f6', '#22c55e', '#ef4444', '#a855f7', '#ec4899'], wrap = document.createElement('div');
    wrap.className = 'tour-confetti'; wrap.setAttribute('aria-hidden', 'true');
    for (var n = 0; n < 18; n++) {
      var bit = document.createElement('span'), a = (n / 18) * 2 * Math.PI + Math.random() * 0.4, d = 70 + Math.random() * 70;
      bit.style.cssText = '--x:' + Math.round(Math.cos(a) * d) + 'px;--y:' + Math.round(Math.sin(a) * d - 30) + 'px;--r:' + Math.round(Math.random() * 540 - 270) + 'deg;background:' + colors[n % colors.length] + ';animation-delay:' + (Math.random() * 0.12).toFixed(2) + 's';
      wrap.appendChild(bit);
    }
    box.appendChild(wrap); setTimeout(function () { if (wrap.parentNode) wrap.remove(); }, 1600);
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
      else if (k === 'back') { i = Math.max(0, i - 1); dlg.dataset.dir = 'back'; render(); }
      else if (i >= steps.length - 1) close(); else { i++; dlg.dataset.dir = 'next'; render(); }
    });
    dlg.addEventListener('cancel', done);
  }

  function start() {
    if (!dlg) build();
    steps = stepsFor(document.body.classList.contains('role-parent')); i = 0; dlg.dataset.dir = 'next'; render();
    var open = document.querySelectorAll('dialog[open]');
    open.forEach(function (d) { if (d !== dlg) d.close(); });
    if (!dlg.open) dlg.showModal();
  }
  window.GuidedTour = { start: start, seen: function () { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return true; } } };
})();
