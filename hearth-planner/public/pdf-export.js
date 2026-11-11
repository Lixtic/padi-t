/* Browser-side PDF export. Same content and look as the Word export (public/docx-export.js): A4, bordered tables,
   dark-green header rows, shaded label cells. Needs pdfMake (vendor/pdfmake.min.js + vendor/pdfmake-fonts.js), loaded on demand. */
(function (root) {
  'use strict';

  var GREEN = '#006A4E', LABEL = '#E9F3EE', NAVY = '#1B365D', BORDER = '#7F7F7F', GREY = '#666666';
  var BR = '\uE000', PIPE = '\uE001';
  var NEW_PAGE = /^(lesson\s*(2|two)\b|study notes|teacher.?s notes|bece|class exercise|wassce|answer key)/i;
  var META_HEADING = /metadata|lesson (details|information)/i;
  var PHASE_HEADER = /phase|duration/i;
  var LABEL_COLUMN = /phase|duration|criteri|aspect|stage/i;
  var SEP_CELL = /^:?-{3,}:?$/;
  var INLINE = /\*\*(.+?)\*\*|(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g;

  function clean(text) {
    text = String(text || '').replace(/\r\n?/g, '\n');
    text = text.replace(/<ElicitationsGroup>[\s\S]*?(?:<\/ElicitationsGroup>|$)/gi, '');
    text = text.replace(/<suggested_responses>[\s\S]*?(?:<\/suggested_responses>|$)/gi, '');
    text = text.replace(/\[(?:AWARD_XP|LESSON_STATE|MOOD|VOCAB_LEVEL|POWER_WORDS|SESSION_TITLE)[^\]]*\]/gi, '');
    text = text.replace(/^\s*\**export title\**\s*:.*$/gim, '');
    text = text.replace(/<br\s*\/?>/gi, BR);
    text = text.replace(/<\/?[A-Za-z][^>]*>/g, '');
    return text.replace(/\\\|/g, PIPE);
  }

  function build(title, content, opts) {
    opts = opts || {};
    var portrait = !!opts.portrait;
    var MX = 43, MY = 37;
    var USABLE = (portrait ? 595.28 : 841.89) - 2 * MX;
    title = String(title || 'GES Lesson Plan').trim().slice(0, 150) || 'GES Lesson Plan';
    content = clean(content);
    var Join = root.SchoolPadiJoin || (typeof require === 'function' ? require('./plan-join.js') : null);
    if (Join) content = content.split(/\n(?=#+\s*Lesson Metadata)/i).map(function (part) { return Join.join(part); }).join('\n\n');

    var unpipe = new RegExp(PIPE, 'g');
    // Inline **bold** and *italic* into pdfMake text runs.
    function runs(text, o) {
      o = o || {};
      var out = [];
      function emit(chunk, bold, italic) {
        chunk = chunk.split(BR).join('\n').replace(unpipe, '|');
        if (!chunk) return;
        var r = { text: chunk };
        if (bold || o.bold) r.bold = true;
        if (italic || o.italic) r.italics = true;
        out.push(r);
      }
      var pos = 0, m;
      INLINE.lastIndex = 0;
      while ((m = INLINE.exec(text))) {
        emit(text.slice(pos, m.index), false, false);
        if (m[1] !== undefined) emit(m[1], true, false);
        else { emit(m[2], false, false); emit(m[3], false, true); }
        pos = m.index + m[0].length;
      }
      emit(text.slice(pos), false, false);
      return out.length ? out : [{ text: '' }];
    }

    // One paragraph per line; bullets and numbered lines get a hanging indent.
    function paragraphs(text, o) {
      o = o || {};
      var size = o.size || 9.5;
      var lines = text.split(BR).map(function (l) { return l.trim(); }).filter(Boolean);
      if (!lines.length) lines = [''];
      return lines.map(function (line) {
        var label = null, m;
        if ((m = line.match(/^[-•▪‣*]\s+(.*)$/))) { label = '•'; line = m[1]; }
        else if ((m = line.match(/^((?:\d{1,2}|[A-Ha-h])[.)])\s+(.*)$/))) { label = m[1]; line = m[2]; }
        var base = { fontSize: size, color: o.color, alignment: o.align, margin: [0, 0, 0, o.after == null ? 2 : o.after] };
        if (label) {
          var isOption = /^[A-Ha-h][.)]$/.test(label);
          var left = isOption ? 30 : 0;
          return { columns: [{ width: left + 13, text: label, fontSize: size, bold: o.bold, color: o.color, margin: [left, 0, 0, 0] }, { width: '*', text: runs(line, o), fontSize: size, color: o.color }], columnGap: 2, margin: [0, 0, 0, o.after == null ? 2 : o.after] };
        }
        base.text = runs(line, o);
        return base;
      });
    }

    function splitRow(line) {
      var s = line.trim();
      if (s.charAt(0) === '|') s = s.slice(1);
      if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
      return s.split('|').map(function (c) { return c.trim(); });
    }
    function plain(t) { return t.replace(new RegExp(BR, 'g'), ' ').replace(/\*+/g, '').trim(); }

    function widths(rows, hasHeader, meta) {
      var cols = rows[0].length, first = hasHeader ? rows[0][0] : '', w = [], c;
      var signArea = hasHeader && cols === 3 && /^\**\s*class teacher/i.test(first);
      if (signArea) w = [36, 36, 28];   // signature and stamp area
      else if (meta) w = cols === 2 ? [28, 72] : rows[0].map(function () { return 1; });
      else if (hasHeader && cols === 3 && PHASE_HEADER.test(first)) w = [15, 68, 17];
      else if (hasHeader && cols === 4 && PHASE_HEADER.test(first)) w = [13, 36, 36, 15];
      else {
        for (c = 0; c < cols; c++) {
          var sum = 0; rows.forEach(function (r) { sum += plain(r[c]).length; });
          w.push(Math.min(Math.max(sum / rows.length, 6), 70));
        }
      }
      var total = w.reduce(function (a, b) { return a + b; }, 0);
      return w.map(function (x) { return USABLE * x / total; });
    }

    function metaCell(v) {
      var t = v.trim();
      if (t && /^(?:\*\*[^*]+\*\*\s*:?|[^:*\n]{2,40}:)\s*$/.test(t)) return { text: t, label: true };
      if (t && t.indexOf('**') === -1) {
        var m = t.match(/^([A-Za-z][^:\n]{1,38}):\s+(\S[\s\S]*)$/);
        if (m) return { text: '**' + m[1].trim() + ':** ' + m[2], label: false };
      }
      return { text: v, label: false };
    }

    var LAYOUT = {
      hLineWidth: function () { return 0.5; }, vLineWidth: function () { return 0.5; },
      hLineColor: function () { return BORDER; }, vLineColor: function () { return BORDER; },
      paddingLeft: function () { return 4.5; }, paddingRight: function () { return 4.5; },
      paddingTop: function () { return 2.5; }, paddingBottom: function () { return 2.5; }
    };
    function cell(value, o) {
      var c = { stack: paragraphs(value, o) };
      if (o.minH) c.stack.push({ text: ' ', fontSize: 1, margin: [0, 0, 0, o.minH] });   // room to sign and stamp
      if (o.fill) c.fillColor = o.fill;
      return c;
    }
    function tableNode(body, w, headerRows, big, pageBreak) {
      var node = { table: { headerRows: headerRows, widths: w.map(function (x) { return x - 9; }), body: body, dontBreakRows: !big }, layout: LAYOUT, margin: [0, 0, 0, 6] };
      if (pageBreak) node.pageBreak = 'before';
      return node;
    }

    // Returns one or more table nodes (a joined plan table is cut where Lesson 2 starts, so Lesson 2 begins on a new page).
    function tables(rows, hasHeader, meta) {
      var cols = Math.max.apply(null, rows.map(function (r) { return r.length; }));
      rows = rows.map(function (r) { while (r.length < cols) r.push(''); return r; });
      var isPhaseRow = function (r) { return /^\**\s*phase\s*\/\s*duration/i.test(r[0] || ''); };
      var joined = meta && !hasHeader && rows.some(isPhaseRow);
      var big = rows.some(function (r) { return r.join('').length >= 700; });
      var w;
      var G = null;
      if (joined && cols === 3) { G = [0.19, 0.05, 0.40, 0.13, 0.23].map(function (x) { return USABLE * x; }); w = G; }   // 5-column grid: metadata rows 24 / 40 / 36, lesson rows 19 / 58 / 23
      else if (joined) { var a = USABLE * 0.19, c = USABLE * 0.23; w = [a, USABLE - a - c, c]; }
      else w = widths(rows, hasHeader, meta);
      var labelFirst = hasHeader && !meta && LABEL_COLUMN.test(rows[0][0]);
      var out = [], body = [], inLesson = false, breakNext = false;
      function span(text, o) { var n = G ? 5 : cols, arr = [cell(text, o)]; for (var k = 1; k < n; k++) arr.push({}); arr[0].colSpan = n; return arr; }
      // spread 3 cells over the 5-column grid: spans [2,1,2] for metadata rows, [1,3,1] for lesson rows
      function grid(cells, spans) { var out = []; cells.forEach(function (c, i) { out.push(c); for (var k = 1; k < spans[i]; k++) out.push({}); if (spans[i] > 1) c.colSpan = spans[i]; }); return out; }
      function flush() { if (body.length) { out.push(tableNode(body, w, 0, big, breakNext)); breakNext = false; body = []; } }

      rows.forEach(function (row, r) {
        if (joined) {
          var only = row[0] && cols > 1 && row.slice(1).every(function (x) { return !x; });
          var isLessonTitle = only && /^\**\s*lesson\s*(\d|one|two)\b/i.test(row[0]);
          if (isLessonTitle || only) {
            if (isLessonTitle) {
              inLesson = true;
              if (/^\**\s*lesson\s*(2|two)\b/i.test(row[0]) && opts.pageBreak !== false && body.length) { flush(); breakNext = true; }
            }
            body.push(span(row[0], isLessonTitle ? { size: 9.5, bold: true, color: '#FFFFFF', after: 0, fill: GREEN } : { size: 8.5, after: 0, fill: LABEL }));
            return;
          }
          if (isPhaseRow(row)) {
            var ph = row.map(function (v) { return cell(v, { size: 8.5, bold: true, color: '#FFFFFF', align: 'center', after: 0, fill: NAVY }); });
            body.push(G ? grid(ph, [1, 3, 1]) : ph);
            return;
          }
          var cells = row.map(function (value, c) {
            var isLabel = false;
            if (inLesson) isLabel = c === 0; else { var mc = metaCell(value); value = mc.text; isLabel = mc.label; }
            return cell(value, { size: inLesson ? 8.5 : 8, bold: isLabel, after: inLesson ? 1 : 0, fill: isLabel ? LABEL : null });
          });
          body.push(G ? grid(cells, inLesson ? [1, 3, 1] : [2, 1, 2]) : cells);
          return;
        }
        var isHead = hasHeader && r === 0, sign = hasHeader && cols === 3 && /^\**\s*class teacher/i.test(rows[0][0]);
        body.push(row.map(function (value, c) {
          if (isHead) return cell(value, { size: 8.5, bold: true, color: '#FFFFFF', align: 'center', after: 0, fill: GREEN });
          var isLabel = false;
          if (meta) { var mc = metaCell(value); value = mc.text; isLabel = mc.label; }
          else if (labelFirst && c === 0) isLabel = true;
          return cell(value, { size: 8.5, bold: isLabel, after: 1, fill: isLabel ? LABEL : null, minH: sign ? 34 : 0 });
        }));
      });
      if (!joined) { out.push(tableNode(body, w, hasHeader ? 1 : 0, big, false)); return out; }
      flush();
      return out;
    }

    function heading(text, level, pageBreak) {
      var size = { 1: 14, 2: 12, 3: 10.5 }[level];
      var node = { text: runs(text.replace(new RegExp(BR, 'g'), ' '), { bold: true }), fontSize: size, color: GREEN, margin: [0, { 1: 8, 2: 7, 3: 5 }[level], 0, 3], keepWithNext: true };
      if (pageBreak) node.pageBreak = 'before';
      return node;
    }

    var children = [];
    children.push({ text: title, fontSize: 14.5, bold: true, color: GREEN, alignment: 'center', margin: [0, 0, 0, 5] });
    var school = String(opts.school || '').trim().slice(0, 100), teacher = String(opts.teacher || '').trim().slice(0, 80);
    var who = [school ? 'School: ' + school : '', teacher ? 'Teacher: ' + teacher : ''].filter(Boolean).join('   |   ');
    if (who) children.push({ text: who, fontSize: 10, color: GREY, alignment: 'center', margin: [0, 0, 0, 5] });

    var lines = content.split('\n'), i = 0, lastHeading = '', wrote = false, metaSeen = false;
    var isTableLine = function (l) { return l.charAt(0) === '|' && (l.match(/\|/g) || []).length >= 2; };

    while (i < lines.length) {
      var raw = lines[i].trim();
      if (!raw || /^(?:-{3,}|\*{3,}|_{3,})$/.test(raw) || raw.indexOf('```') === 0) { i++; continue; }

      if (isTableLine(raw)) {
        var block = [];
        while (i < lines.length && isTableLine(lines[i].trim())) { block.push(lines[i].trim()); i++; }
        var rows = [];
        block.forEach(function (l) {
          var cells = splitRow(l);
          if (cells.every(function (c) { return SEP_CELL.test(c); })) return;
          rows.push(cells);
        });
        if (rows.length) {
          var hasHeader = true;
          if (rows[0].every(function (c) { return !c; })) { rows = rows.slice(1); hasHeader = false; }
          if (rows.length) {
            var meta = !hasHeader || META_HEADING.test(lastHeading);
            tables(rows, hasHeader && !meta, meta).forEach(function (n) { children.push(n); });
            wrote = true;
          }
        }
        continue;
      }

      i++;
      var text = raw;
      if (text.charAt(0) === '>') text = text.replace(/^[>\s]+/, '');
      var level = null, ht = null, m;
      if ((m = text.match(/^(#{1,6})\s*(.+?)\s*#*$/))) { level = Math.min(m[1].length, 3); ht = m[2]; }
      else if ((m = text.match(/^\*\*(.+?)\*\*\s*:?$/)) && text.length < 120) { level = 3; ht = m[1]; }
      else if (text.length < 100 && text === text.toUpperCase() && /[A-Z]/.test(text) && !/^[-•*]\s/.test(text)) { level = 2; ht = text; }
      if (ht !== null) {
        ht = ht.replace(/^[*_\s]+|[*_\s]+$/g, '');
        var newPlan = META_HEADING.test(ht) && level === 1 && metaSeen;
        if (META_HEADING.test(ht) && level === 1) metaSeen = true;
        // The Lesson Metadata heading stays hidden: the table is self-explanatory. A new plan in the same file still starts on a new page.
        if (META_HEADING.test(ht) && level === 1) { if (newPlan) children.push({ text: ' ', fontSize: 1, pageBreak: 'before' }); }
        else children.push(heading(ht, level, wrote && NEW_PAGE.test(ht)));
        lastHeading = ht; wrote = true;
        continue;
      }
      paragraphs(text, { size: 9.5, after: 3 }).forEach(function (p) { children.push(p); });
      wrote = true;
    }

    var footerText = title.slice(0, 80);
    var extra = opts.footer ? '   |   ' + String(opts.footer).slice(0, 60) : '';
    return {
      info: { title: title, creator: 'GuidEd', producer: 'GuidEd' },
      pageSize: 'A4',
      pageOrientation: portrait ? 'portrait' : 'landscape',
      pageMargins: [MX, MY, MX, MY + 8],
      defaultStyle: { font: 'Roboto', fontSize: 9.5, lineHeight: 1.12 },
      content: children,
      footer: function (page, pages) { return { text: footerText + '   |   Page ' + page + ' of ' + pages + extra, alignment: 'center', fontSize: 8, color: GREY, margin: [0, 10, 0, 0] }; }
    };
  }

  // Resolves to a Blob.
  function toBlob(pdfMake, title, content, opts) {
    return new Promise(function (ok, no) {
      try { pdfMake.createPdf(build(title, content, opts)).getBlob(ok); } catch (e) { no(e); }
    });
  }

  var api = { build: build, toBlob: toBlob };
  root.SchoolPadiPdf = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
