/* GuidEd · myscheme.js
   Lets a teacher use their own scheme of work instead of the built-in one. The scheme is read from a spreadsheet (.xlsx or .csv)
   or a Word table (.docx), checked, previewed and kept on this device. Planning then uses it through the same lookup the built-in
   scheme uses, so the rest of the app does not need to know the difference.
   Nothing here needs a library: .xlsx and .docx are zip files, read with the browser's own DecompressionStream. */
(function (root) {
  'use strict';
  var KEY = 'guided.myschemes.v1', MAX_WEEK = 20, MAX_TEXT = 300, MAX_IND = 12;

  /* ───────── Text helpers ───────── */
  function clean(s) { return String(s == null ? '' : s).replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim(); }
  function unxml(s) {
    return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(+d); }).replace(/&amp;/g, '&');
  }
  function utf8(u8) { return new TextDecoder('utf-8').decode(u8); }

  /* ───────── CSV / TSV ───────── */
  function parseDelimited(text) {
    text = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    var first = text.split('\n')[0] || '', count = function (c) { return first.split(c).length; };
    var d = count('\t') > count(',') && count('\t') >= count(';') ? '\t' : count(';') > count(',') ? ';' : ',';
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"' && !cell) q = true;
      else if (ch === d) { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    row.push(cell); if (row.some(function (c) { return c !== ''; })) rows.push(row);
    return rows;
  }

  /* ───────── Zip (just enough to read .xlsx and .docx) ───────── */
  async function inflate(data) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open Word or Excel files. Save the scheme as a .csv file instead.');
    var stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function unzip(buf) {
    var u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), e = -1, i;
    for (i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('That file is not a valid Word or Excel file.');
    var n = dv.getUint16(e + 10, true), off = dv.getUint32(e + 16, true), files = {}, k;
    for (k = 0; k < n; k++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      var nl = dv.getUint16(off + 28, true), el = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true);
      files[utf8(u8.subarray(off + 46, off + 46 + nl))] = { method: dv.getUint16(off + 10, true), size: dv.getUint32(off + 20, true), at: dv.getUint32(off + 42, true) };
      off += 46 + nl + el + cl;
    }
    return {
      names: Object.keys(files),
      read: async function (name) {
        var f = files[name]; if (!f) return null;
        var ln = dv.getUint16(f.at + 26, true), le = dv.getUint16(f.at + 28, true), start = f.at + 30 + ln + le, data = u8.subarray(start, start + f.size);
        return utf8(f.method === 0 ? data : await inflate(data));
      }
    };
  }

  /* ───────── .xlsx ───────── */
  function colIndex(ref) { var m = /^([A-Z]+)/.exec(ref), n = 0; if (!m) return 0; for (var i = 0; i < m[1].length; i++) n = n * 26 + m[1].charCodeAt(i) - 64; return n - 1; }
  function sheetRows(xml, shared) {
    var rows = [], rowRe = /<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g, m;
    while ((m = rowRe.exec(xml))) {
      var cells = [], body = m[1] || '', cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, c;
      while ((c = cellRe.exec(body))) {
        var attrs = c[1], inner = c[2] || '', ref = /\br="([A-Z]+\d+)"/.exec(attrs), type = /\bt="(\w+)"/.exec(attrs), val = '';
        var v = /<v>([\s\S]*?)<\/v>/.exec(inner);
        if (type && type[1] === 's') val = v ? shared[+v[1]] || '' : '';
        else if (type && type[1] === 'inlineStr') val = (inner.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || []).map(function (t) { return unxml(t.replace(/<[^>]+>/g, '')); }).join('');
        else val = v ? unxml(v[1]) : '';
        cells[ref ? colIndex(ref[1]) : cells.length] = val;
      }
      for (var j = 0; j < cells.length; j++) if (cells[j] === undefined) cells[j] = '';
      rows.push(cells);
    }
    return rows;
  }
  async function readXlsx(buf) {
    var z = unzip(buf), sharedXml = await z.read('xl/sharedStrings.xml'), shared = [];
    if (sharedXml) (sharedXml.match(/<si\b[\s\S]*?<\/si>/g) || []).forEach(function (si) {
      shared.push((si.match(/<t\b[^>]*>[\s\S]*?<\/t>/g) || []).map(function (t) { return unxml(t.replace(/<[^>]+>/g, '')); }).join(''));
    });
    var sheets = z.names.filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); })
      .sort(function (a, b) { return parseInt(a.replace(/\D+/g, ''), 10) - parseInt(b.replace(/\D+/g, ''), 10); });
    var tables = [];
    for (var i = 0; i < sheets.length; i++) tables.push(sheetRows(await z.read(sheets[i]), shared));
    return tables;
  }

  /* ───────── .docx (the tables in it) ───────── */
  async function readDocx(buf) {
    var z = unzip(buf), xml = await z.read('word/document.xml');
    if (!xml) throw new Error('That Word file has no readable content.');
    var tables = [];
    (xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || []).forEach(function (tbl) {
      var rows = [];
      (tbl.match(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g) || []).forEach(function (tr) {
        var cells = [];
        (tr.match(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g) || []).forEach(function (tc) {
          var paras = (tc.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) || []).map(function (p) {
            return unxml(p.replace(/<w:tab\s*\/>/g, ' ').replace(/<w:br\s*\/>/g, '\n').replace(/<(?!\/?w:t[ >])[^>]*>/g, '').replace(/<[^>]+>/g, ''));
          });
          cells.push(paras.join('\n'));
        });
        if (cells.length) rows.push(cells);
      });
      if (rows.length) tables.push(rows);
    });
    return tables;
  }

  /* ───────── Table → scheme rows ───────── */
  function headerKey(text) {
    var t = String(text || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    if (/^(weeks?|wk|wks|week s)\b/.test(t)) return 'week';
    if (/sub ?strand/.test(t)) return 'substrand';
    if (/strand/.test(t)) return 'strand';
    if (/content standard|^standard/.test(t)) return 'standard';
    if (/indicator|learning outcome|objective|exemplar/.test(t)) return 'indicators';
    if (/^type\b|week type/.test(t)) return 'type';
    if (/topic|focus|theme|^content$|^lesson$/.test(t)) return 'topic';
    return '';
  }
  function parseWeeks(text) {
    var s = String(text || ''), out = [], m, range = /(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})/g;
    var rest = s.replace(range, function (_, a, b) { a = +a; b = +b; for (var w = Math.min(a, b); w <= Math.max(a, b) && w - Math.min(a, b) < MAX_WEEK; w++) out.push(w); return ' '; });
    var num = /\d{1,2}/g; while ((m = num.exec(rest))) out.push(+m[0]);
    return out.filter(function (w, i) { return w >= 1 && w <= MAX_WEEK && out.indexOf(w) === i; }).sort(function (a, b) { return a - b; });
  }
  function splitIndicators(text) {
    var t = clean(text); if (!t) return [];
    var parts = t.split('\n').map(clean).filter(Boolean);
    if (parts.length === 1) {
      var codes = t.match(/\b(?:B[1-9]|SHS[1-3])(?:\.\d+){2,5}\b/gi) || [];
      if (codes.length > 1) parts = t.split(/(?=\b(?:B[1-9]|SHS[1-3])(?:\.\d+){2,5}\b)/i).map(clean).filter(Boolean);
    }
    return parts.slice(0, MAX_IND).map(function (p) { return p.slice(0, MAX_TEXT); });
  }
  function fromTable(table) {
    var hi = -1, map = null, i, j;
    for (i = 0; i < Math.min(table.length, 8) && hi < 0; i++) {
      var m = {}, cols = 0;
      (table[i] || []).forEach(function (c, idx) { var k = headerKey(c); if (k && m[k] === undefined) { m[k] = idx; cols++; } });
      if (m.week !== undefined && cols >= 2) { hi = i; map = m; }
    }
    if (hi < 0) return { error: 'I could not find a "Week" column. The first row of the table should name its columns, for example Week, Strand, Sub-strand, Content standard, Indicators.' };
    var out = [], prev = null, carry = { strand: '', substrand: '', standard: '' };
    var cell = function (r, k) { return map[k] === undefined ? '' : clean(r[map[k]]); };
    for (i = hi + 1; i < table.length; i++) {
      var r = table[i] || [];
      var weeks = parseWeeks(cell(r, 'week'));
      var strand = cell(r, 'strand'), sub = cell(r, 'substrand'), std = cell(r, 'standard'), topic = cell(r, 'topic'), inds = splitIndicators(cell(r, 'indicators'));
      if (!weeks.length) {                                   // a merged week cell: this row adds to the week above
        if (prev && (inds.length || topic)) { inds.forEach(function (x) { if (prev.indicators.length < MAX_IND) prev.indicators.push(x); }); if (topic && !prev.focus) prev.focus = topic.slice(0, MAX_TEXT); }
        continue;
      }
      var blob = [strand, sub, std, topic, inds.join(' ')].join(' ').trim();
      var type = cell(r, 'type').toLowerCase();
      if (!/^(teach|revision|exam)/.test(type)) {
        type = 'teach';
        if (!inds.length && !std && /exam|assessment|test\b/i.test(blob)) type = 'exam';
        else if (!inds.length && !std && /revis/i.test(blob)) type = 'revision';
        else if (!blob) type = '';
      } else type = type.slice(0, 5) === 'exam' ? 'exam' : type.slice(0, 3) === 'rev' ? 'revision' : 'teach';
      if (!type) continue;
      if (type === 'teach') {                                // merged strand and standard cells come through empty on the rows below
        if (!strand) strand = carry.strand; else { carry.strand = strand; carry.substrand = ''; carry.standard = ''; }
        if (!sub) sub = carry.substrand; else { carry.substrand = sub; }
        if (!std) std = carry.standard; else carry.standard = std;
      }
      var row = { weeks: weeks, type: type, strand: strand.slice(0, MAX_TEXT), substrand: sub.slice(0, MAX_TEXT), standard: std.slice(0, MAX_TEXT), indicators: inds, focus: (topic || (type !== 'teach' ? blob : '')).slice(0, MAX_TEXT) };
      if (type === 'teach' && !row.strand && !row.indicators.length && !row.focus) continue;
      out.push(row); prev = row;
    }
    if (!out.length) return { error: 'The table has a Week column but no weeks with content under it.' };
    return { rows: out };
  }
  function summarise(rows) {
    var weeks = {}; rows.forEach(function (r) { r.weeks.forEach(function (w) { weeks[w] = 1; }); });
    var list = Object.keys(weeks).map(Number).sort(function (a, b) { return a - b; });
    return { weeks: list.length, last: list[list.length - 1] || 0, teach: rows.filter(function (r) { return r.type === 'teach'; }).length };
  }
  function bestOf(tables) {
    var firstError = '', i, r;
    for (i = 0; i < tables.length; i++) { r = fromTable(tables[i]); if (r.rows) return r; firstError = firstError || r.error; }
    return { error: firstError || 'I could not find a table in that file.' };
  }
  // Reads a File (or anything with name and arrayBuffer/text) into { rows } or { error }.
  async function readFile(file) {
    var name = String(file.name || '').toLowerCase();
    try {
      if (/\.(xlsx|xlsm)$/.test(name)) return bestOf(await readXlsx(await file.arrayBuffer()));
      if (/\.docx$/.test(name)) { var t = await readDocx(await file.arrayBuffer()); return t.length ? bestOf(t) : { error: 'That Word file has no table in it. Put the scheme in a table, or save it as a spreadsheet.' }; }
      if (/\.(csv|tsv|txt)$/.test(name)) return bestOf([parseDelimited(await file.text())]);
      if (/\.(pdf|doc|xls|ppt|pptx|jpg|jpeg|png)$/.test(name)) return { error: 'I cannot read that kind of file yet. Open it in Word or Excel and save it as .docx, .xlsx or .csv.' };
      return bestOf([parseDelimited(await file.text())]);
    } catch (e) { return { error: (e && e.message) || 'I could not read that file.' }; }
  }

  /* ───────── Storage ───────── */
  function load() { try { var o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function persist(all) { try { localStorage.setItem(KEY, JSON.stringify(all)); return true; } catch (e) { return false; } }
  function keyOf(subject, cls, term) { return [subject, cls, String(term)].join('|'); }
  function get(subject, cls, term) { return load()[keyOf(subject, cls, term)] || null; }
  function save(subject, cls, term, rows, name) { var all = load(); all[keyOf(subject, cls, term)] = { name: String(name || '').slice(0, 120), savedAt: Date.now(), rows: rows }; return persist(all); }
  function remove(subject, cls, term) { var all = load(); delete all[keyOf(subject, cls, term)]; return persist(all); }
  function list() {
    var all = load();
    return Object.keys(all).map(function (k) { var p = k.split('|'); return { key: k, subject: p[0], cls: p[1], term: Number(p[2]), name: all[k].name, summary: summarise(all[k].rows || []) }; })
      .sort(function (a, b) { return (a.subject + a.cls).localeCompare(b.subject + b.cls) || a.term - b.term; });
  }

  /* ───────── Lookup (mirrors SchoolPadiSchemes.lookup) ───────── */
  function topicOf(x) { return x.strand ? x.strand + (x.substrand ? ' > ' + x.substrand : '') : x.indicators[0] || x.focus || ''; }
  function lookupCustom(entry, term, week) {
    var rows = (entry && entry.rows) || [], i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].weeks.indexOf(Number(week)) === -1) continue;
      var r = rows[i], out = { term: 'Term ' + term, termNo: Number(term), source: 'Your own scheme', custom: true, weeks: r.weeks, type: r.type, strand: r.strand, substrand: r.substrand, standard: r.standard, indicators: r.indicators.slice(), focus: r.focus, topics: [] };
      if (r.type === 'revision') {
        rows.forEach(function (x) { if (x.type === 'teach') { var t = topicOf(x); if (t && out.topics.indexOf(t) === -1) out.topics.push(t); } });
      } else if (r.type === 'teach') {
        var prev = null, j;
        for (j = i - 1; j >= 0 && !prev; j--) if (rows[j].type === 'teach') prev = rows[j];
        if (prev && topicOf(prev) !== topicOf(r)) out.recall = topicOf(prev);
      }
      return out;
    }
    return null;
  }
  function spanOf(entry) { var max = 0; ((entry && entry.rows) || []).forEach(function (r) { r.weeks.forEach(function (w) { if (w > max) max = w; }); }); return max; }

  // Put the teacher's scheme in front of the built-in one wherever the app asks the scheme API.
  function install() {
    var S = root.SchoolPadiSchemes; if (!S || S.__mine) return;
    var lookup = S.lookup, has = S.has, span = S.span;
    S.lookup = function (subject, cls, term, week) { var e = get(subject, cls, term); return e ? lookupCustom(e, term, week) : lookup(subject, cls, term, week); };
    S.has = function (subject, cls, term) { return !!get(subject, cls, term) || has(subject, cls, term); };
    S.span = function (subject, cls, term) { var e = get(subject, cls, term); return e ? spanOf(e) : span(subject, cls, term); };
    S.__mine = true;
  }
  // What the browser sends with a plan request when the teacher uses their own scheme (the server checks and limits it).
  function requestScheme(params) {
    var e = get(params.subject, params.cls, params.term);
    return e ? lookupCustom(e, params.term, params.week) : null;
  }

  /* ───────── Template ───────── */
  var TEMPLATE = [
    ['Week', 'Strand', 'Sub-strand', 'Content standard', 'Indicators'],
    ['1', 'Revision', '', '', ''],
    ['2', 'Introduction to Computing', 'Components of Computers', 'B7.1.1.1. Examine the parts of a computer', 'B7.1.1.1.1 Discuss the fourth-generation computers\nB7.1.1.1.2 Demonstrate the use of input devices'],
    ['3-4', 'Introduction to Computing', 'Windows Desktop', 'B7.1.1.2. Use the features of the Windows desktop', 'B7.1.1.2.1 Practise file and folder management'],
    ['12', 'End of term examination', '', '', '']
  ];
  function templateCsv() {
    return TEMPLATE.map(function (r) { return r.map(function (c) { return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
  }

  var api = { readFile: readFile, fromTable: fromTable, parseDelimited: parseDelimited, readXlsx: readXlsx, readDocx: readDocx, parseWeeks: parseWeeks, summarise: summarise,
    get: get, save: save, remove: remove, list: list, install: install, requestScheme: requestScheme, lookupCustom: lookupCustom, templateCsv: templateCsv };
  root.GuidedMyScheme = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  /* ───────── Upload sheet ───────── */
  if (typeof document === 'undefined') return;
  install();
  var dlg = null, pending = null, ctx = null, hooks = { toast: function () {}, changed: function () {} };
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function $(sel) { return dlg.querySelector(sel); }
  function options(items, cur) { return items.map(function (x) { return '<option value="' + esc(x) + '"' + (String(x) === String(cur) ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join(''); }
  function termWord(cls) { return /^SHS/i.test(cls) ? 'Semester' : 'Term'; }

  function paintSaved() {
    var items = list(), box = $('#msSaved');
    box.hidden = !items.length;
    box.innerHTML = items.length ? '<h3>Schemes saved on this device</h3>' + items.map(function (s) {
      return '<div class="ms-saved"><span><strong>' + esc(s.subject) + '</strong> · ' + esc(s.cls) + ' · ' + termWord(s.cls) + ' ' + s.term + '<small>' + s.summary.weeks + ' weeks' + (s.name ? ' · ' + esc(s.name) : '') + '</small></span>' +
        '<button type="button" class="ms-del" data-key="' + esc(s.key) + '">Remove</button></div>';
    }).join('') : '';
  }
  function paintPreview() {
    var box = $('#msPreview');
    if (!pending) { box.innerHTML = ''; $('#msSave').disabled = true; return; }
    if (pending.error) { box.innerHTML = '<p class="as-err" role="alert">' + esc(pending.error) + '</p>'; $('#msSave').disabled = true; return; }
    var sum = summarise(pending.rows);
    box.innerHTML = '<p class="ms-ok">Found ' + sum.weeks + ' week' + (sum.weeks === 1 ? '' : 's') + ' (up to week ' + sum.last + '). Check that it looks right:</p><ul class="ms-rows">' +
      pending.rows.slice(0, 8).map(function (r) {
        return '<li><b>Wk ' + esc(r.weeks.length > 1 ? r.weeks[0] + '–' + r.weeks[r.weeks.length - 1] : r.weeks[0]) + '</b> ' + esc(r.type === 'teach' ? (topicOf(r) || r.indicators[0] || 'Teaching week') : r.type === 'exam' ? 'Examination' : 'Revision') + '</li>';
      }).join('') + (pending.rows.length > 8 ? '<li class="ms-more">…and ' + (pending.rows.length - 8) + ' more rows</li>' : '') + '</ul>';
    $('#msSave').disabled = false;
  }
  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'acct-sheet ms-sheet'; dlg.setAttribute('aria-labelledby', 'msTitle');
    dlg.innerHTML = '<section><h2 id="msTitle">Use your own scheme</h2>' +
      '<p class="as-sub">Upload your scheme of work for one class and subject. GuidEd will plan from it instead of the built-in scheme. It stays on this device.</p>' +
      '<div class="ms-grid"><label class="as-field"><span>Subject</span><select id="msSubject"></select></label>' +
      '<label class="as-field"><span>Class</span><select id="msClass"></select></label>' +
      '<label class="as-field"><span id="msTermLabel">Term</span><select id="msTerm"></select></label></div>' +
      '<label class="as-field"><span>Scheme file (.xlsx, .docx or .csv)</span><input type="file" id="msFile" accept=".xlsx,.xlsm,.docx,.csv,.tsv,.txt"></label>' +
      '<p class="ms-help">It should be a table with a <b>Week</b> column and columns such as Strand, Sub-strand, Content standard and Indicators. <button type="button" class="as-link" id="msTemplate">Download a template</button></p>' +
      '<div id="msPreview" aria-live="polite"></div>' +
      '<div class="tour-actions"><button type="button" class="as-second" id="msCancel">Close</button><button type="button" class="as-submit" id="msSave" disabled>Save scheme</button></div>' +
      '<div id="msSaved" hidden></div></section>';
    document.body.appendChild(dlg);
    var fill = function (keep) {
      var cls = $('#msClass').value || ctx.cls, c = ctx.get ? ctx.get(cls) : ctx;
      $('#msSubject').innerHTML = options(c.subjects, keep ? $('#msSubject').value : ctx.subject);
      $('#msTerm').innerHTML = options(c.terms, keep ? $('#msTerm').value : ctx.term);
      $('#msTermLabel').textContent = termWord(cls);
    };
    $('#msClass').addEventListener('change', function () { fill(true); });
    $('#msFile').addEventListener('change', async function () {
      var f = this.files && this.files[0]; if (!f) return;
      $('#msPreview').innerHTML = '<p class="ms-help">Reading…</p>';
      pending = await readFile(f); pending.name = f.name; paintPreview();
    });
    $('#msTemplate').addEventListener('click', function () {
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + templateCsv()], { type: 'text/csv' })); a.download = 'guided-scheme-template.csv';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    });
    $('#msCancel').addEventListener('click', function () { dlg.close(); });
    $('#msSave').addEventListener('click', function () {
      if (!pending || !pending.rows) return;
      var subject = $('#msSubject').value, cls = $('#msClass').value, term = $('#msTerm').value;
      if (!save(subject, cls, term, pending.rows, pending.name)) { hooks.toast('Could not save the scheme on this device. Free some browser storage and try again.'); return; }
      pending = null; $('#msFile').value = ''; paintPreview(); paintSaved(); hooks.changed();
      hooks.toast('Your scheme is saved for ' + subject + ', ' + cls + '. GuidEd will plan from it.');
      dlg.close();
    });
    dlg.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.ms-del'); if (!b) return;
      var p = b.getAttribute('data-key').split('|'); remove(p[0], p[1], p[2]); paintSaved(); hooks.changed(); hooks.toast('Removed. GuidEd will use the built-in scheme for ' + p[0] + ', ' + p[1] + '.');
    });
    dlg.fill = fill;
  }
  function open() {
    if (!dlg) build();
    ctx = hooks.context(); pending = null; $('#msFile').value = '';
    $('#msClass').innerHTML = options(ctx.classes, ctx.cls); dlg.fill(false); paintPreview(); paintSaved();
    document.querySelectorAll('dialog[open]').forEach(function (d) { if (d !== dlg) d.close(); });
    if (!dlg.open) dlg.showModal();
  }
  api.init = function (h) { hooks = Object.assign(hooks, h || {}); install(); };
  api.open = open;
  api.isCustom = function (p) { return !!get(p.subject, p.cls, p.term); };
})(typeof window !== 'undefined' ? window : globalThis);
