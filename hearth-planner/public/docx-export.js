/* Browser-side GES Word export (used by the artifact build, where no server exists).
   Same layout as lib/ges_docx_export.py: landscape A4, fixed-width bordered tables,
   dark-green repeating header row, shaded label cells, rows that avoid splitting.
   Needs the `docx` library (global `docx`, or pass it in when used from Node). */
(function (root) {
  'use strict';

  var FONT = 'Arial';
  var GREEN = '006A4E', LABEL = 'E9F3EE', BORDER = '7F7F7F', GREY = '666666';
  var PAGE_W = 16838, PAGE_H = 11906;              // A4 landscape, twips
  var MARGIN_X = 850, MARGIN_Y = 740;              // 1.5 cm, 1.3 cm
  var BR = '', PIPE = '';

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

  function build(docx, title, content, opts) {
    var D = docx;
    var portrait = !!(opts && opts.portrait);
    var USABLE = (portrait ? PAGE_H : PAGE_W) - 2 * MARGIN_X;
    title = String(title || 'GES Lesson Plan').trim().slice(0, 150) || 'GES Lesson Plan';
    content = clean(content);
    var Join = root.SchoolPadiJoin || (typeof require === 'function' ? require('./plan-join.js') : null);
    // A file can hold several plans (the term pack): each one is joined on its own, and each starts on a new page.
    if (Join) content = content.split(/\n(?=#+\s*Lesson Metadata)/i).map(function (part) { return Join.join(part); }).join('\n\n');

    function runs(text, o) {
      o = o || {};
      var out = [];
      function emit(chunk, bold, italic) {
        chunk.split(BR).forEach(function (part, i) {
          if (i) out.push(new D.TextRun({ break: 1 }));
          if (part) out.push(new D.TextRun({ text: part.replace(new RegExp(PIPE, 'g'), '|'), bold: bold || undefined, italics: italic || undefined, font: FONT, size: o.size, color: o.color }));
        });
      }
      var pos = 0, m;
      INLINE.lastIndex = 0;
      while ((m = INLINE.exec(text))) {
        emit(text.slice(pos, m.index), o.bold, o.italic);
        if (m[1] !== undefined) emit(m[1], true, o.italic);
        else { emit(m[2], o.bold, o.italic); emit(m[3], o.bold, true); }
        pos = m.index + m[0].length;
      }
      emit(text.slice(pos), o.bold, o.italic);
      return out;
    }

    // One paragraph per line; bullets and numbered lines get a hanging indent.
    function paragraphs(text, o) {
      o = o || {};
      var lines = text.split(BR).map(function (l) { return l.trim(); }).filter(Boolean);
      if (!lines.length) lines = [''];
      return lines.map(function (line) {
        var label = null, m;
        if ((m = line.match(/^[-•▪‣*]\s+(.*)$/))) { label = '•'; line = m[1]; }
        else if ((m = line.match(/^((?:\d{1,2}|[A-Ha-h])[.)])\s+(.*)$/))) { label = m[1]; line = m[2]; }
        var children = runs(line, o);
        var opts = { spacing: { before: 0, after: o.after == null ? 40 : o.after }, alignment: o.align, keepNext: o.keepNext, pageBreakBefore: o.pageBreakBefore || undefined };
        var isOption = !!label && /^[A-Ha-h][.)]$/.test(label);
        if (isOption && !/^[Dd]/.test(label)) opts.keepNext = true;            // keep A, B, C with the next option
        if (label && !isOption && /\?\s*$/.test(line)) opts.keepNext = true;    // keep a question with its options
        if (label) {
          var left = isOption ? 765 : 255;
          opts.indent = { left: left, hanging: 255 };
          opts.tabStops = [{ type: D.TabStopType.LEFT, position: left }];
          children = [new D.TextRun({ text: label + '\t', font: FONT, size: o.size, bold: o.bold || undefined, color: o.color })].concat(children);
        }
        opts.children = children;
        return new D.Paragraph(opts);
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
      if (meta) w = cols === 2 ? [28, 72] : rows[0].map(function () { return 1; });
      else if (hasHeader && cols === 3 && PHASE_HEADER.test(first)) w = [15, 68, 17];
      else if (hasHeader && cols === 4 && PHASE_HEADER.test(first)) w = [13, 36, 36, 15];
      else {
        for (c = 0; c < cols; c++) {
          var sum = 0; rows.forEach(function (r) { sum += plain(r[c]).length; });
          w.push(Math.min(Math.max(sum / rows.length, 6), 70));
        }
      }
      var total = w.reduce(function (a, b) { return a + b; }, 0);
      var tw = w.map(function (x) { return Math.floor(USABLE * x / total); });
      tw[tw.length - 1] += USABLE - tw.reduce(function (a, b) { return a + b; }, 0);
      return tw;
    }

    function metaCell(v) {
      var t = v.trim();
      if (t && /^(?:\*\*[^*]+\*\*\s*:?|[^:*\n]{2,40}:)\s*$/.test(t)) return { text: t, label: true };
      if (t && t.indexOf('**') === -1) {
        var m = t.match(/^([A-Za-z][^:\n]{1,38}):\s+(\S[\s\S]*)$/);
        if (m) return { text: '**' + m[1].trim() + ':** ' + m[2], label: false };
      }
      return { text: v, label: false };
    }

    function table(rows, hasHeader, meta) {
      var cols = Math.max.apply(null, rows.map(function (r) { return r.length; }));
      rows = rows.map(function (r) { while (r.length < cols) r.push(''); return r; });
      var isPhaseRow = function (r) { return /^\**\s*phase\s*\/\s*duration/i.test(r[0] || ''); };
      var joined = meta && !hasHeader && rows.some(isPhaseRow);        // Metadata + Lesson 1 + Lesson 2 as one table
      var w = joined ? (function () { var a = Math.floor(USABLE * 0.19), c = Math.floor(USABLE * 0.23); return [a, USABLE - a - c, c]; })() : widths(rows, hasHeader, meta);
      var labelFirst = hasHeader && !meta && LABEL_COLUMN.test(rows[0][0]);
      var line = { style: D.BorderStyle.SINGLE, size: 6, color: BORDER };
      var inLesson = false;
      var trs = rows.map(function (row, r) {
        if (joined) {
          var only = row[0] && cols > 1 && row.slice(1).every(function (c) { return !c; });
          var isLessonTitle = only && /^\**\s*lesson\s*(\d|one|two)\b/i.test(row[0]);
          var rowOpts = { cantSplit: true };
          if (isLessonTitle || only) {
            if (isLessonTitle) inLesson = true;
            var pOpts = isLessonTitle
              ? { size: 19, bold: true, color: 'FFFFFF', after: 0, keepNext: true }
              : { size: 17, after: 0, keepNext: true };
            if (isLessonTitle && /^\**\s*lesson\s*(2|two)\b/i.test(row[0]) && opts && opts.pageBreak !== false) pOpts.pageBreakBefore = true;
            return new D.TableRow({ cantSplit: true, children: [new D.TableCell({
              columnSpan: cols, width: { size: USABLE, type: D.WidthType.DXA },
              margins: { top: 50, bottom: 50, left: 90, right: 90 },
              shading: { type: D.ShadingType.CLEAR, fill: isLessonTitle ? GREEN : LABEL, color: 'auto' },
              children: paragraphs(row[0], pOpts)
            })] });
          }
          if (isPhaseRow(row)) {
            return new D.TableRow({ cantSplit: true, children: row.map(function (value, c) {
              return new D.TableCell({ width: { size: w[c], type: D.WidthType.DXA }, verticalAlign: D.VerticalAlign.CENTER,
                margins: { top: 50, bottom: 50, left: 90, right: 90 }, shading: { type: D.ShadingType.CLEAR, fill: '1B365D', color: 'auto' },
                children: paragraphs(value, { size: 17, bold: true, color: 'FFFFFF', align: D.AlignmentType.CENTER, after: 0, keepNext: true }) });
            }) });
          }
          var bigRow = row.join('').length >= 700;
          return new D.TableRow({ cantSplit: !bigRow, children: row.map(function (value, c) {
            var isLabel = false;
            if (inLesson) isLabel = c === 0; else { var mc = metaCell(value); value = mc.text; isLabel = mc.label; }
            return new D.TableCell({ width: { size: w[c], type: D.WidthType.DXA }, verticalAlign: D.VerticalAlign.TOP,
              margins: { top: 50, bottom: 50, left: 90, right: 90 },
              shading: isLabel ? { type: D.ShadingType.CLEAR, fill: LABEL, color: 'auto' } : undefined,
              children: paragraphs(value, { size: 17, bold: isLabel, after: 20 }) });
          }) });
        }
        var isHead = hasHeader && r === 0;
        var big = row.join('').length >= 700;
        return new D.TableRow({
          tableHeader: isHead || undefined,
          cantSplit: !big,
          children: row.map(function (value, c) {
            var o = { size: 17 }, shade = null, children;
            if (isHead) {
              shade = GREEN;
              children = paragraphs(value, { size: 17, bold: true, color: 'FFFFFF', align: D.AlignmentType.CENTER, after: 0, keepNext: true });
            } else {
              var isLabel = false;
              if (meta) { var mc = metaCell(value); value = mc.text; isLabel = mc.label; }
              else if (labelFirst && c === 0) isLabel = true;
              if (isLabel) shade = LABEL;
              children = paragraphs(value, { size: 17, bold: isLabel, after: 20 });
            }
            return new D.TableCell({
              width: { size: w[c], type: D.WidthType.DXA },
              verticalAlign: isHead ? D.VerticalAlign.CENTER : D.VerticalAlign.TOP,
              margins: { top: 50, bottom: 50, left: 90, right: 90 },
              shading: shade ? { type: D.ShadingType.CLEAR, fill: shade, color: 'auto' } : undefined,
              children: children
            });
          })
        });
      });
      return new D.Table({
        width: { size: USABLE, type: D.WidthType.DXA },
        columnWidths: w,
        layout: D.TableLayoutType.FIXED,
        alignment: D.AlignmentType.CENTER,
        borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
        rows: trs
      });
    }

    function heading(text, level, pageBreak) {
      var size = { 1: 26, 2: 23, 3: 21 }[level];
      return new D.Paragraph({
        pageBreakBefore: pageBreak || undefined,
        keepNext: true,
        spacing: { before: { 1: 240, 2: 200, 3: 160 }[level], after: 60 },
        children: runs(text.replace(new RegExp(BR, 'g'), ' '), { size: size, bold: true, color: GREEN })
      });
    }

    var children = [];
    children.push(new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { after: 120 }, children: runs(title, { size: 28, bold: true, color: GREEN }) }));
    var school = String((opts && opts.school) || '').trim().slice(0, 100), teacher = String((opts && opts.teacher) || '').trim().slice(0, 80);
    var who = [school ? 'School: ' + school : '', teacher ? 'Teacher: ' + teacher : ''].filter(Boolean).join('   |   ');
    if (who) children.push(new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { after: 120 }, children: runs(who, { size: 20, color: GREY }) }));

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
            children.push(table(rows, hasHeader && !meta, meta));
            children.push(new D.Paragraph({ spacing: { before: 0, after: 0, line: 120, lineRule: D.LineRuleType.EXACT }, children: [] }));
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
        children.push(heading(ht, level, wrote && (NEW_PAGE.test(ht) || newPlan)));
        lastHeading = ht; wrote = true;
        continue;
      }
      paragraphs(text, { size: 19, after: 60 }).forEach(function (p) { children.push(p); });
      wrote = true;
    }

    var footer = new D.Footer({
      children: [new D.Paragraph({
        alignment: D.AlignmentType.CENTER,
        children: [
          new D.TextRun({ text: title.slice(0, 80) + '   |   Page ', size: 16, color: GREY, font: FONT }),
          new D.TextRun({ children: [D.PageNumber.CURRENT], size: 16, color: GREY, font: FONT }),
          new D.TextRun({ text: ' of ', size: 16, color: GREY, font: FONT }),
          new D.TextRun({ children: [D.PageNumber.TOTAL_PAGES], size: 16, color: GREY, font: FONT })
        ].concat(opts && opts.footer ? [new D.TextRun({ text: '   |   ' + String(opts.footer).slice(0, 60), size: 16, color: GREY, font: FONT })] : [])
      })]
    });

    return new D.Document({
      creator: 'GuidEd',
      title: title,
      styles: { default: { document: { run: { font: FONT, size: 19 } } } },
      sections: [{
        properties: { page: { size: { width: 11906, height: 16838, orientation: portrait ? D.PageOrientation.PORTRAIT : D.PageOrientation.LANDSCAPE }, margin: { top: MARGIN_Y, bottom: MARGIN_Y, left: MARGIN_X, right: MARGIN_X, footer: 340 } } },
        footers: { default: footer },
        children: children
      }]
    });
  }

  // Resolves to a Blob (browser) or Buffer (Node).
  function toFile(docx, title, content, opts) {
    var doc = build(docx, title, content, opts);
    return typeof Blob !== 'undefined' ? docx.Packer.toBlob(doc) : docx.Packer.toBuffer(doc);
  }

  var api = { build: build, toFile: toFile };
  root.SchoolPadiDocx = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
