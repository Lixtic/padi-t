'use strict';
// Termly scheme of learning generator for /guides/scheme-of-work-ghana-how-to-prepare.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var form = $('sgForm'); if (!form) return;
  var cls = $('sgClass'), sub = $('sgSubject'), term = $('sgTerm'), msg = $('sgMsg'), out = $('sgOut'), acts = $('sgActions');
  var DATA = null, rows = [];
  var yr = new Date().getFullYear(), m = new Date().getMonth();
  var y0 = m >= 7 ? yr : yr - 1;
  $('sgYear').value = y0 + '/' + (y0 + 1);
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fill(sel, list, keep) {
    sel.innerHTML = list.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('');
    if (keep && list.indexOf(keep) >= 0) sel.value = keep;
  }
  function order(a) {
    function k(c) { var n = parseInt(c.replace(/\D/g, ''), 10); return (c.indexOf('KG') === 0 ? 0 : c.indexOf('Basic') === 0 ? 10 : 100) + n; }
    return a.sort(function (x, y) { return k(x) - k(y); });
  }
  function range(w) { return w.length > 1 ? w[0] + '–' + w[w.length - 1] : String(w[0]); }
  function build() {
    var r = (DATA[cls.value] || {})[sub.value]; r = r && r[term.value];
    if (!r) { rows = []; out.innerHTML = ''; acts.hidden = true; msg.textContent = 'This subject has no Term ' + term.value + ' scheme for ' + cls.value + ' yet.'; return; }
    rows = r.slice().sort(function (a, b) { return a[0][0] - b[0][0]; });
    msg.textContent = '';
    var h = '<div class="sg-head"><strong>' + esc(cls.value + ' ' + sub.value) + ' · Term ' + esc(term.value) + ' scheme of learning</strong><span>' +
      [$('sgYear').value && 'Academic year ' + esc($('sgYear').value), $('sgSchool').value && esc($('sgSchool').value), $('sgTeacher').value && 'Teacher: ' + esc($('sgTeacher').value)].filter(Boolean).join(' · ') + '</span></div>';
    h += '<div class="sg-wrap"><table class="sg-table"><thead><tr><th>Week</th><th>Strand and sub-strand</th><th>Content standard</th><th>Indicators</th><th>Resources</th><th>Remarks</th></tr></thead><tbody>';
    rows.forEach(function (x) {
      var w = range(x[0]);
      if (x[1] === 0) {
        h += '<tr><td>' + w + '</td><td>' + esc(x[2]) + (x[3] ? '<br><em>' + esc(x[3]) + '</em>' : '') + '</td><td>' + esc(x[4]) + '</td><td>' + (x[5].length ? '<ul>' + x[5].map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>' : esc(x[6])) + '</td><td></td><td></td></tr>';
      } else {
        h += '<tr class="sg-note"><td>' + w + '</td><td colspan="5">' + (x[1] === 2 ? 'End-of-term examination' : 'Revision') + (x[6] ? ': ' + esc(x[6]) : '') + '</td></tr>';
      }
    });
    out.innerHTML = h + '</tbody></table></div><p class="sg-fine">Topics follow the national curriculum. Add your own resources and remarks, and check dates against the school calendar your head teacher gives you.</p>';
    acts.hidden = false;
  }
  function setSubjects(keep) { fill(sub, Object.keys(DATA[cls.value]).sort(), keep); }
  function name() { return (cls.value + '-' + sub.value + '-term-' + term.value + '-scheme').toLowerCase().replace(/[^a-z0-9]+/g, '-'); }
  function wordHtml() {
    var css = 'body{font-family:Calibri,Arial,sans-serif;font-size:10pt}table{border-collapse:collapse;width:100%}th,td{border:1px solid #444;padding:4px;vertical-align:top;font-size:9pt}th{background:#E4EEE9}';
    return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Scheme of learning</title><style>@page{size:landscape}' + css + '</style></head><body>' + out.innerHTML + '</body></html>';
  }
  fetch('/scheme-gen.json').then(function (r) { return r.json(); }).then(function (d) {
    DATA = d;
    var box = $('scheme-generator'), dc = box.getAttribute('data-class') || 'Basic 7', ds = box.getAttribute('data-subject') || 'Mathematics';
    fill(cls, order(Object.keys(d)), dc);
    cls.disabled = sub.disabled = false;
    setSubjects(ds); build();
  }).catch(function () { msg.textContent = 'The generator could not load. Check your connection and refresh.'; });
  var smp = $('sgSamples');
  if (smp) smp.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || !DATA) return;
    cls.value = b.getAttribute('data-c'); setSubjects(b.getAttribute('data-s')); sub.value = b.getAttribute('data-s'); term.value = b.getAttribute('data-t');
    build(); out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  cls.addEventListener('change', function () { setSubjects(sub.value); build(); });
  [sub, term].forEach(function (e) { e.addEventListener('change', build); });
  ['sgYear', 'sgSchool', 'sgTeacher'].forEach(function (id) { $(id).addEventListener('input', function () { if (DATA) build(); }); });
  $('sgPrint').addEventListener('click', function () { document.body.classList.add('sg-printing'); window.print(); });
  window.addEventListener('afterprint', function () { document.body.classList.remove('sg-printing'); });
  $('sgWord').addEventListener('click', function () {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿', wordHtml()], { type: 'application/msword' }));
    a.download = name() + '.doc'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });
})();
