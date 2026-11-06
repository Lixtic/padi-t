/* GuidEd · plan-join.js
   Joins the Lesson Metadata table, the Lesson 1 table and the Lesson 2 table into ONE continuous table.
   The lesson title becomes a full-width row inside it. The Learning Objectives and Prerequisite knowledge
   lines move out of the table into the Study Notes section, so the table comes first.
   Used for the on-screen view and the Word export. The saved text is never changed. */
(function (root) {
  'use strict';
  var isTable = function (l) { return /^\s*\|/.test(l) && (l.match(/\|/g) || []).length >= 2; };
  var isSep = function (cells) { return cells.every(function (c) { return /^:?-{3,}:?$/.test(c); }); };
  function cellsOf(line) {
    var s = line.trim();
    if (s.charAt(0) === '|') s = s.slice(1);
    if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
    return s.split('|').map(function (c) { return c.trim(); });
  }
  var LESSON = /^#{1,3}\s*\**\s*lesson\s*(?:\d|one|two)\b/i;
  var PHASE = /^\**\s*phase\b|^\**\s*phase\s*\/\s*duration/i;

  function join(md) {
    var L = String(md || '').replace(/\r\n?/g, '\n').split('\n');
    var s = 0;
    while (s < L.length && !isTable(L[s])) s++;
    if (s >= L.length) return md;
    var e = s;
    while (e < L.length && isTable(L[e])) e++;
    var meta = L.slice(s, e).map(cellsOf).filter(function (c) { return !isSep(c); });
    if (meta.length < 2 || !meta[0].every(function (c) { return !c; })) return md;       // metadata table has a blank header row
    var cols = meta[0].length;
    var rows = meta.slice(1);
    var pos = e, lessons = 0, moved = [];
    for (;;) {
      var p = pos;
      while (p < L.length && !L[p].trim()) p++;
      if (p >= L.length || !LESSON.test(L[p].trim())) break;
      var title = L[p].trim().replace(/^#{1,3}\s*/, '').replace(/^\*+|\*+$/g, '').trim();
      var extra = [], q = p + 1;
      while (q < L.length && !isTable(L[q])) {
        var t = L[q].trim();
        if (/^#{1,6}\s/.test(t)) { q = -1; break; }             // another heading before a table: not the layout we expect
        if (t) extra.push(t);
        q++;
      }
      if (q < 0 || q >= L.length) break;
      var qe = q;
      while (qe < L.length && isTable(L[qe])) qe++;
      var tbl = L.slice(q, qe).map(cellsOf).filter(function (c) { return !isSep(c); });
      if (tbl.length < 2 || tbl[0].length !== cols || !PHASE.test(tbl[0][0].replace(/\*/g, ''))) break;
      var span = function (text) { var r = [text]; while (r.length < cols) r.push(''); return r; };
      rows.push(span('**' + title + '**'));
      if (extra.length) { moved.push('**Objectives for ' + title + '**'); extra.forEach(function (x) { moved.push(x); }); }
      tbl.forEach(function (r) { rows.push(r); });
      pos = qe; lessons++;
    }
    if (!lessons) return md;
    var blank = []; for (var k = 0; k < cols; k++) blank.push('');
    var sep = []; for (k = 0; k < cols; k++) sep.push('---');
    var out = L.slice(0, s);
    out.push('| ' + blank.join(' | ') + ' |', '|' + sep.join('|') + '|');
    rows.forEach(function (r) { out.push('| ' + r.join(' | ') + ' |'); });
    var rest = L.slice(pos);
    if (moved.length) {
      var block = [''].concat(moved.reduce(function (a, x) { a.push(x, ''); return a; }, []));
      var h = -1;
      for (k = 0; k < rest.length; k++) if (/^#{1,3}\s*\**\s*study notes\b/i.test(rest[k].trim())) { h = k; break; }
      if (h >= 0) rest = rest.slice(0, h + 1).concat(block, rest.slice(h + 1));
      else rest = ['', '## Learning Objectives and Prerequisite Knowledge'].concat(block, rest);
    }
    return out.concat(rest).join('\n');
  }

  var api = { join: join };
  root.SchoolPadiJoin = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
