/* GuidEd · editor.js
   Visual editing of a generated plan, right where it is shown: tap any text to change it, add or remove lines and
   table rows, bold/italic, undo/redo, unsaved-changes protection. The edited page is turned back into the same
   plain text the app already stores and exports, so Word export keeps working. No dependencies. */
(function (root) {
  'use strict';
  var EDIT = 'h2, h3, h4, p:not(.q), li, .ln, .li, .qt, .ot';

  /* ───────── Page → text ───────── */
  function inl(node, cell, plain) {
    var out = '';
    node.childNodes.forEach(function (n) {
      if (n.nodeType === 3) { out += n.nodeValue.replace(/[ ​]/g, ' '); return; }
      if (n.nodeType !== 1) return;
      var t = n.tagName;
      if (t === 'BR') { out += ' '; return; }
      if (n.classList.contains('n')) return;                        // the "1." label of a numbered line
      var inner = inl(n, cell, plain);
      if (plain) { out += (t === 'DIV' || t === 'P') ? ' ' + inner : inner; return; }
      var mark = (t === 'STRONG' || t === 'B') ? '**' : (t === 'EM' || t === 'I') ? '*' : t === 'CODE' ? '`' : '';
      if (mark && inner.trim()) {
        var lead = inner.match(/^\s*/)[0], trail = inner.match(/\s*$/)[0];
        out += lead + mark + inner.trim() + mark + trail;
      } else out += (t === 'DIV' || t === 'P') ? ' ' + inner : inner;
    });
    return out;
  }
  var tidy = function (s) { return s.replace(/\s+/g, ' ').trim(); };
  var line = function (el, plain) { return tidy(inl(el, false, plain)); };

  function cellMd(cell) {
    var lines = [], pending = '';
    var flush = function () { if (tidy(pending)) lines.push(tidy(pending)); pending = ''; };
    cell.childNodes.forEach(function (n) {
      if (n.nodeType === 1 && n.tagName === 'DIV') {
        flush();
        var txt = tidy(inl(n, true));
        if (!txt) return;
        if (n.classList.contains('li') && n.classList.contains('num')) {
          var lab = n.querySelector('.n');
          lines.push((lab ? lab.textContent.trim() : '1.') + ' ' + txt);
        } else if (n.classList.contains('li')) lines.push('- ' + txt);
        else lines.push(txt);
      } else if (n.nodeType === 3) pending += n.nodeValue;
      else if (n.nodeType === 1) pending += inl({ childNodes: [n] }, true);
    });
    flush();
    return lines.join('<br>').replace(/\|/g, '\\|');
  }

  function tableMd(t) {
    var rows = Array.prototype.slice.call(t.rows), head = !!t.tHead, cols = 1, out = [];
    rows.forEach(function (tr) {
      var n = 0; Array.prototype.forEach.call(tr.cells, function (c) { n += c.colSpan || 1; });
      if (n > cols) cols = n;
    });
    rows.forEach(function (tr, i) {
      var cells = Array.prototype.map.call(tr.cells, cellMd);
      if (tr.cells.length === 1 && cols > 1) { while (cells.length < cols) cells.push(''); }
      if (!cells.some(Boolean) && !(head && i === 0)) return;        // a row left completely empty is dropped
      out.push('| ' + cells.join(' | ') + ' |');
      if (head && i === 0) out.push('|' + new Array(cols + 1).join('---|'));
    });
    if (!head) { var blank = []; for (var k = 0; k < cols; k++) blank.push(''); out.unshift('| ' + blank.join(' | ') + ' |', '|' + new Array(cols + 1).join('---|')); }
    return out.join('\n');
  }

  function serialize(rootEl) {
    var out = [];
    Array.prototype.forEach.call(rootEl.children, function (el) {
      var t = el.tagName, c = el.classList, s;
      if (t === 'H2') { s = line(el, true); if (s) out.push('# ' + s); }
      else if (t === 'H3') { s = line(el, true); if (s) out.push('## ' + s); }
      else if (t === 'H4') { s = line(el, true); if (s) out.push('**' + s + '**'); }
      else if (t === 'P') {
        var ls = [], cur = '';
        el.childNodes.forEach(function (n) {
          if (n.nodeType === 1 && n.tagName === 'BR') { if (tidy(cur)) ls.push(tidy(cur)); cur = ''; }
          else cur += n.nodeType === 3 ? n.nodeValue : inl({ childNodes: [n] }, false);
        });
        if (tidy(cur)) ls.push(tidy(cur));
        if (ls.length) out.push(ls.join('\n'));
      } else if (t === 'UL' || t === 'OL') {
        var start = Number(el.getAttribute('start')) || 1, items = [];
        Array.prototype.forEach.call(el.children, function (li) { var x = line(li); if (x) items.push((t === 'UL' ? '- ' : (start + items.length) + '. ') + x); });
        if (items.length) out.push(items.join('\n'));
      } else if (c.contains('mcq')) {
        var q = el.querySelector('.q'), qn = q && q.querySelector('.qn'), qt = q && q.querySelector('.qt');
        var ls2 = [((qn ? qn.textContent.trim() : '1.') + ' ' + (qt ? line(qt) : ''))];
        Array.prototype.forEach.call(el.querySelectorAll('.opt'), function (o) {
          var l = o.querySelector('.ol'), x = o.querySelector('.ot');
          ls2.push((l ? l.textContent.trim() : 'A.') + ' ' + (x ? line(x) : ''));
        });
        out.push(ls2.join('\n'));
      } else if (t === 'HR') out.push('---');
      else if (c.contains('tbl-wrap')) { var tb = el.querySelector('table'); if (tb) out.push(tableMd(tb)); }
    });
    return out.join('\n\n') + '\n';
  }

  /* ───────── Edit mode ───────── */
  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }

  function prepare(body) {
    Array.prototype.forEach.call(body.querySelectorAll('.tbl td, .tbl th'), function (c) {
      if (!c.querySelector('div')) c.appendChild(mk('div', 'ln'));       // blank cells get a line you can type in
    });
    Array.prototype.forEach.call(body.querySelectorAll(EDIT), function (el) {
      el.setAttribute('contenteditable', 'true'); el.setAttribute('role', 'textbox'); el.setAttribute('spellcheck', 'true');
    });
    Array.prototype.forEach.call(body.querySelectorAll('.n, .qn, .ol'), function (el) { el.setAttribute('contenteditable', 'false'); });
  }

  function begin(o) {
    var body = o.body, toast = o.toast || function () {};
    body.classList.add('editing');
    try { document.execCommand('styleWithCSS', false, false); } catch (e) { /* ignore */ }
    prepare(body);
    var base = serialize(body), undo = [body.innerHTML], redo = [], last = null, savedRange = null, snapTimer = 0, draftTimer = 0, discardTimer = 0, askDiscard = false;

    var bar = mk('div', 'edit-bar'); bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Editing tools');
    var top = mk('div', 'eb-top'), cancel = mk('button', 'tool', 'Cancel'), save = mk('button', 'tool tool-main', 'Save changes'), title = mk('span', 'eb-title', 'Editing');
    cancel.type = save.type = 'button'; cancel.setAttribute('data-act', 'cancel'); save.setAttribute('data-act', 'save');
    top.append(cancel, title, save);
    var tools = mk('div', 'eb-tools');
    var defs = [['undo', '↶ Undo'], ['redo', '↷ Redo'], ['|'], ['bold', 'B'], ['italic', 'I'], ['|'], ['addline', '+ Line'], ['delline', '− Line'], ['|'], ['addrow', '+ Row'], ['delrow', '− Row'], ['|'], ['raw', 'Text mode']];
    var btn = {};
    defs.forEach(function (d) {
      if (d[0] === '|') { tools.appendChild(mk('span', 'eb-sep')); return; }
      var b = mk('button', 'eb-btn' + (d[0] === 'bold' ? ' is-b' : d[0] === 'italic' ? ' is-i' : ''), d[1]);
      b.type = 'button'; b.setAttribute('data-act', d[0]);
      if (d[0] === 'undo') b.title = 'Undo'; if (d[0] === 'addline') b.title = 'Add a line below the one you are on'; if (d[0] === 'delline') b.title = 'Remove the line you are on';
      if (d[0] === 'addrow') b.title = 'Add a table row below this one'; if (d[0] === 'delrow') b.title = 'Remove this table row';
      btn[d[0]] = b; tools.appendChild(b);
    });
    var hint = mk('p', 'eb-hint', 'Tap any text to change it. Press Enter for a new line.');
    bar.append(top, tools, hint);
    ['pointerdown', 'mousedown'].forEach(function (ev) { bar.addEventListener(ev, function (e) { if (e.target.closest('button')) e.preventDefault(); }); });   // keep the cursor where it was

    function block(el) { return el && el.closest ? el.closest(EDIT) : null; }
    function state() {
      var row = last && last.closest('tr'), body1 = row && !row.closest('thead') && !row.classList.contains('lt') && !row.classList.contains('ph');
      btn.undo.disabled = undo.length < 2; btn.redo.disabled = !redo.length;
      btn.addrow.disabled = !body1; btn.delrow.disabled = !body1 || row.parentNode.rows.length < 2;
      btn.addline.disabled = !last || last.matches('.qt, .ot'); btn.delline.disabled = !last || last.matches('.qt, .ot');
      btn.bold.disabled = btn.italic.disabled = !last;
    }
    function snap(force) {
      var h = body.innerHTML;
      if (h === undo[undo.length - 1]) return;
      undo.push(h); if (undo.length > 60) undo.shift(); redo = [];
      clearTimeout(draftTimer); draftTimer = setTimeout(function () { if (o.onDraft) o.onDraft(serialize(body)); }, 900);
      state();
    }
    function later() { clearTimeout(snapTimer); snapTimer = setTimeout(snap, 600); }
    function restore(h) { body.innerHTML = h; prepare(body); last = null; state(); }
    function doUndo() { snap(); if (undo.length < 2) return; redo.push(undo.pop()); restore(undo[undo.length - 1]); }
    function doRedo() { if (!redo.length) return; var h = redo.pop(); undo.push(h); restore(h); }
    function caretIn(el, atEnd) {
      el.focus();
      var r = document.createRange(); r.selectNodeContents(el); r.collapse(!atEnd !== false ? false : true);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* ignore */ }
    }
    function fresh(like) {
      var tag = like.matches('li') ? 'li' : like.matches('.li') ? 'div' : like.matches('.ln') ? 'div' : 'p';
      var e = mk(tag, like.matches('.li') ? 'li' : like.matches('.ln') ? 'ln' : '');
      e.setAttribute('contenteditable', 'true'); e.setAttribute('role', 'textbox'); e.setAttribute('spellcheck', 'true');
      return e;
    }
    function addLine(b) {
      b = b || last; if (!b || b.matches('.qt, .ot')) return;
      var n = fresh(b); b.after(n); snap(); caretIn(n, true); last = n; state();
    }
    function delLine(b, back) {
      b = b || last; if (!b || b.matches('.qt, .ot')) return;
      var sibs = Array.prototype.filter.call(b.parentNode.children, function (x) { return x.matches(EDIT); });
      if (sibs.length < 2 && b.closest('td, th, li, ul, ol') && !b.matches('p, h2, h3, h4')) { b.textContent = ''; snap(); caretIn(b, true); return; }
      var next = b.previousElementSibling && b.previousElementSibling.matches(EDIT) ? b.previousElementSibling : b.nextElementSibling && b.nextElementSibling.matches(EDIT) ? b.nextElementSibling : null;
      var list = b.parentNode.matches('ul, ol') && sibs.length < 2 ? b.parentNode : null;
      (list || b).remove(); last = null; snap();
      if (next) { caretIn(next, true); last = next; } state();
    }
    function addRow() {
      var tr = last && last.closest('tr'); if (!tr) return;
      var c = tr.cloneNode(true);
      Array.prototype.forEach.call(c.cells, function (cell) { cell.innerHTML = ''; });
      prepare(c); tr.after(c); snap();
      var first = c.querySelector(EDIT); if (first) { caretIn(first, true); last = first; } state();
    }
    function delRow() {
      var tr = last && last.closest('tr'); if (!tr || tr.parentNode.rows.length < 2) return;
      var nx = tr.nextElementSibling || tr.previousElementSibling; tr.remove(); last = null; snap();
      var f = nx && nx.querySelector(EDIT); if (f) { caretIn(f, true); last = f; }
      state(); toast('Row removed. Tap Undo to bring it back.');
    }
    function fmt(cmd) {
      if (savedRange) { var s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
      if (last) last.focus();
      document.execCommand(cmd); snap();
    }
    function dirty() { return serialize(body) !== base; }
    function close() {
      clearTimeout(snapTimer); clearTimeout(draftTimer); clearTimeout(discardTimer);
      document.removeEventListener('selectionchange', onSel);
      body.removeEventListener('focusin', onFocus); body.removeEventListener('input', later);
      body.removeEventListener('keydown', onKey); body.removeEventListener('paste', onPaste); body.removeEventListener('beforeinput', onBefore);
      body.classList.remove('editing'); bar.remove();
    }

    function onFocus(e) { var b = block(e.target); if (b) { last = b; state(); } }
    function onSel() {
      var s = window.getSelection();
      if (s.rangeCount && body.contains(s.anchorNode)) { savedRange = s.getRangeAt(0).cloneRange(); var b = block(s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentNode); if (b && b !== last) { last = b; state(); } }
    }
    function onKey(e) {
      var b = block(e.target), mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
      if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); doRedo(); return; }
      if (!b) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (b.matches('.qt, .ot')) { var all = Array.prototype.slice.call(body.querySelectorAll('.qt, .ot')), nx = all[all.indexOf(b) + 1]; if (nx) caretIn(nx, false); return; }
        addLine(b);
      } else if (e.key === 'Backspace' && !tidy(b.textContent) && !b.matches('.qt, .ot')) {
        var sibs = Array.prototype.filter.call(b.parentNode.children, function (x) { return x.matches(EDIT); });
        if (sibs.length > 1) { e.preventDefault(); delLine(b, true); }
      } else if (e.key === 'Escape') b.blur();
    }
    function onBefore(e) {
      if (e.inputType === 'historyUndo') { e.preventDefault(); doUndo(); }
      else if (e.inputType === 'historyRedo') { e.preventDefault(); doRedo(); }
      else if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') e.preventDefault();
    }
    function onPaste(e) {
      e.preventDefault();
      var t = ((e.clipboardData || window.clipboardData).getData('text/plain') || '').replace(/\s*\n\s*/g, ' ');
      document.execCommand('insertText', false, t);
    }
    document.addEventListener('selectionchange', onSel);
    body.addEventListener('focusin', onFocus); body.addEventListener('input', later);
    body.addEventListener('keydown', onKey); body.addEventListener('paste', onPaste); body.addEventListener('beforeinput', onBefore);

    tools.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.disabled) return;
      var a = b.getAttribute('data-act');
      if (a === 'undo') doUndo(); else if (a === 'redo') doRedo();
      else if (a === 'bold') fmt('bold'); else if (a === 'italic') fmt('italic');
      else if (a === 'addline') addLine(); else if (a === 'delline') delLine();
      else if (a === 'addrow') addRow(); else if (a === 'delrow') delRow();
      else if (a === 'raw') { var md = serialize(body); close(); if (o.onRaw) o.onRaw(md); }
    });
    save.addEventListener('click', function () {
      snap(); var md = serialize(body);
      if (!md.trim()) { toast('The plan cannot be empty.'); return; }
      close(); if (o.onSave) o.onSave(md);
    });
    cancel.addEventListener('click', function () {
      if (dirty() && !askDiscard) {
        askDiscard = true; cancel.textContent = 'Discard changes?'; cancel.classList.add('is-danger');
        discardTimer = setTimeout(function () { askDiscard = false; cancel.textContent = 'Cancel'; cancel.classList.remove('is-danger'); }, 4000);
        return;
      }
      close(); if (o.onCancel) o.onCancel();
    });
    state();
    return { bar: bar, serialize: function () { return serialize(body); }, dirty: dirty, cancel: function () { cancel.click(); }, close: close };
  }

  root.PadiEditor = { begin: begin, serialize: serialize };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PadiEditor;
})(typeof window !== 'undefined' ? window : globalThis);
