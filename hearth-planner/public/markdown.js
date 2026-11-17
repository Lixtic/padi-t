/* GuidEd · markdown renderer. Plain functions, no page state: every piece of text is escaped first, then a small set of
   formatting (headings, lists, tables, bold, italics, https links and images) is added back. Used by app.js and tested on its own. */
(function () {
  'use strict';
  /* ───────── Markdown renderer (tables, headings, lists; all text is escaped first) ───────── */
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function inline(s) {
    return esc(s)
      .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, (m, label, url) => '<a href="' + url.replace(/"/g, '%22').replace(/'/g, '%27') + '" target="_blank" rel="noopener noreferrer">' + label + '</a>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<em>$2</em>');
  }

  function cellHtml(text) {
    const lines = text.split(/<br\s*\/?>/i).map((l) => l.trim()).filter(Boolean);
    return lines.map((l) => {
      let m = l.match(/^[-•*]\s+(.*)$/);
      if (m) return '<div class="li">' + inline(m[1]) + '</div>';
      m = l.match(/^(\d{1,2}[.)])\s+(.*)$/);
      if (m) return '<div class="li num"><span class="n">' + esc(m[1]) + '</span>' + inline(m[2]) + '</div>';
      return '<div class="ln">' + inline(l) + '</div>';
    }).join('');
  }

  function splitRow(line) {
    let s = line.trim().replace(/\\\|/g, '\u0001');
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    return s.split('|').map((c) => c.replace(/\u0001/g, '|').trim());
  }

  function tableHtml(lines) {
    const rows = [];
    for (const l of lines) {
      const cells = splitRow(l);
      if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
      rows.push(cells);
    }
    if (!rows.length) return '';
    let head = rows[0];
    let body = rows.slice(1);
    const blank = head.every((c) => !c);
    if (blank) { head = null; }
    const cols = Math.max(...rows.map((r) => r.length));
    const label = head && /phase|duration|criteri|aspect|stage/i.test(head[0]);
    const cls = ['tbl'];
    if (!head) cls.push('kv');
    if (label) cls.push('label-col');
    if (label && cols === 3) cls.push('lesson');
    if (head && cols >= 6) cls.push('wide');
    const pad = (r) => r.concat(Array(Math.max(0, cols - r.length)).fill(''));
    const isPhaseRow = (r) => /^\**\s*phase\s*\/\s*duration/i.test(r[0] || '');
    const joined = !head && rows.some(isPhaseRow);               // Metadata + Lesson 1 + Lesson 2 as one table
    if (joined) cls.push('joined');
    let html = '<div class="tbl-wrap"><table class="' + cls.join(' ') + '">';
    if (joined) {
      let inLesson = false;
      html += '<tbody>' + rows.slice(1).map((r) => {
        const only = r[0] && cols > 1 && r.slice(1).every((c) => !c);
        if (only) return '<tr class="' + (/^\**\s*lesson\s*(\d|one|two)\b/i.test(r[0]) ? 'lt' : 'sp') + '"><td colspan="' + cols + '">' + cellHtml(r[0]) + '</td></tr>';
        if (isPhaseRow(r)) { inLesson = true; return '<tr class="ph">' + pad(r).map((c) => '<th>' + cellHtml(c) + '</th>').join('') + '</tr>'; }
        const names = ['', 'Learning activities', 'Resources'];
        return '<tr' + (inLesson ? ' class="phase"' : '') + '>' + pad(r).map((c, ci) => '<td' + (inLesson && names[ci] ? ' data-l="' + names[ci] + '"' : '') + '>' + cellHtml(c) + '</td>').join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
      return html;
    }
    if (head) html += '<thead><tr>' + pad(head).map((c) => '<th>' + cellHtml(c) + '</th>').join('') + '</tr></thead>';
    html += '<tbody>' + (head ? body : rows.slice(1)).map((r) => '<tr>' + pad(r).map((c) => '<td>' + cellHtml(c) + '</td>').join('') + '</tr>').join('') + '</tbody>';
    return html + '</table></div>';
  }

  function renderMd(text) {
    if (window.SchoolPadiJoin) text = window.SchoolPadiJoin.join(text);
    const lines = text.replace(/\r/g, '').split('\n');
    let html = '', list = null, para = [];
    const flushP = () => { if (para.length) { html += '<p>' + para.map(inline).join('<br>') + '</p>'; para = []; } };
    const flushL = () => { if (list) { html += '<' + list.t + (list.start > 1 ? ' start="' + list.start + '"' : '') + '>' + list.items.map((x) => '<li>' + inline(x) + '</li>').join('') + '</' + list.t + '>'; list = null; } };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trimEnd();
      let m;
      if (/^\s*```/.test(line)) continue;
      if (!line.trim()) { flushP(); flushL(); continue; }
      if (/^\s*\|/.test(line) && (line.match(/\|/g) || []).length >= 2) {
        flushP(); flushL();
        const block = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) { block.push(lines[i]); i++; }
        i--;
        html += tableHtml(block);
        continue;
      }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushP(); flushL(); html += '<hr>'; continue; }
      if ((m = line.match(/^!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)$/))) {
        flushP(); flushL();
        html += '<figure class="study-illustration"><img src="' + esc(m[2]) + '" alt="' + esc(m[1]) + '" loading="lazy"><figcaption>' + esc(m[1]) + '</figcaption></figure>';
        continue;
      }
      if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*$/))) {
        flushP(); flushL();
        const lvl = Math.min(m[1].length, 3);
        html += '<h' + (lvl + 1) + ' class="h' + lvl + '">' + inline(m[2]) + '</h' + (lvl + 1) + '>';
        continue;
      }
      if ((m = line.match(/^\s*[-•*]\s+(.*)$/))) {
        flushP(); if (!list || list.t !== 'ul') { flushL(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); continue;
      }
      if ((m = line.match(/^\s*(\d{1,2})[.)]\s+(.*)$/))) {
        const opt = /^\s*[A-Da-d][.)]\s+\S/;
        if (opt.test(lines[i + 1] || '')) {              // a multiple-choice question: stem, then options A to D on their own lines
          flushP(); flushL();
          const opts = [];
          while (i + 1 < lines.length && opt.test(lines[i + 1])) { i++; opts.push(lines[i].trim().match(/^([A-Da-d])[.)]\s+(.*)$/)); }
          html += '<div class="mcq"><p class="q"><span class="qn">' + m[1] + '.</span> <span class="qt">' + inline(m[2]) + '</span></p><div class="opts">'
            + opts.map((o) => '<div class="opt"><span class="ol">' + o[1].toUpperCase() + '.</span><span class="ot">' + inline(o[2]) + '</span></div>').join('') + '</div></div>';
          continue;
        }
        flushP(); if (!list || list.t !== 'ol') { flushL(); list = { t: 'ol', start: Number(m[1]), items: [] }; } list.items.push(m[2]); continue;
      }
      if ((m = line.match(/^\*\*([^*]+?)\*\*\s*:?\s*$/)) && line.length < 120) {
        flushP(); flushL(); html += '<h4 class="h3">' + inline(m[1]) + '</h4>'; continue;
      }
      flushL();
      para.push(line.replace(/<br\s*\/?>/gi, ' '));
    }
    flushP(); flushL();
    return html;
  }
  window.GuidedMarkdown = { esc, inline, renderMd };
})();
