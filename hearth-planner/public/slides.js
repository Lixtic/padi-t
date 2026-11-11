/* Teaching slides as a deck of cards: swipe on a phone, arrows or keys on a computer, and a full-screen Present mode.
   parse(md) turns "## Slide N: Title" sections into slides; deck(md, state) builds the viewer.
   Everything the model wrote goes in as text, never as HTML. */
(function (root) {
  'use strict';

  function clean(t) { return String(t || '').replace(/\*\*|__|`/g, '').replace(/<br\s*\/?>/gi, ' ').trim(); }

  function parse(md) {
    var slides = [], cur = null;
    String(md || '').replace(/\r/g, '').split('\n').forEach(function (raw) {
      var line = raw.trim(), m = /^#{2,3}\s*slide\s*(\d+)?\s*[:.\-–—]?\s*(.*)$/i.exec(line);
      if (m) { cur = { title: clean(m[2]) || 'Slide ' + (slides.length + 1), bullets: [], extra: [], notes: '' }; slides.push(cur); return; }
      if (!cur || !line) return;
      var notes = /^\*{0,2}\s*(teacher'?s?\s*notes?)\s*:?\s*\*{0,2}\s*:?\s*(.*)$/i.exec(line);
      if (notes) { cur.notes = clean(notes[2]); cur.inNotes = true; return; }
      var extra = /^\*{0,2}\s*(activity|ask the class|ask|task|question|think|discuss|try it)\s*:?\s*\*{0,2}\s*:?\s*(.*)$/i.exec(line);
      if (extra && /^\*\*/.test(line)) { cur.extra.push({ label: clean(extra[1]).replace(/^./, function (c) { return c.toUpperCase(); }), text: clean(extra[2]) }); cur.inNotes = false; return; }
      var b = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
      if (b) { cur.bullets.push(clean(b[1])); cur.inNotes = false; return; }
      if (cur.inNotes) cur.notes += ' ' + clean(line);
      else if (!/^#/.test(line)) cur.bullets.push(clean(line));
    });
    slides.forEach(function (s) { delete s.inNotes; });
    return slides;
  }

  function isDeck(params) { return !!(params && params.mode === 'resources' && params.resourceType === 'Teaching slides'); }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function card(s, i, total, big) {
    var c = el('article', 'sl-card' + (i === 0 ? ' is-title' : '') + (big ? ' is-big' : ''));
    c.setAttribute('aria-label', 'Slide ' + (i + 1) + ' of ' + total);
    c.appendChild(el('div', 'sl-num', String(i + 1)));
    c.appendChild(el('h3', 'sl-title', s.title));
    if (s.bullets.length) {
      var ul = el('ul', 'sl-points');
      s.bullets.forEach(function (b) { ul.appendChild(el('li', '', b)); });
      c.appendChild(ul);
    }
    s.extra.forEach(function (x) {
      var box = el('div', 'sl-extra');
      box.appendChild(el('strong', '', x.label));
      box.appendChild(el('span', '', x.text));
      c.appendChild(box);
    });
    if (s.notes && !big) {
      var d = el('details', 'sl-notes'), sum = el('summary', '', 'Teacher notes');
      d.appendChild(sum); d.appendChild(el('p', '', s.notes));
      c.appendChild(d);
    }
    return c;
  }

  /* st keeps the position between repaints while the slides are still being written: { i: 0 } */
  function deck(md, st) {
    st = st || { i: 0 };
    var slides = parse(md), total = slides.length;
    var wrap = el('div', 'deck');
    if (!total) return wrap;
    st.i = Math.min(Math.max(st.i || 0, 0), total - 1);

    var prev = el('button', 'deck-btn'); prev.type = 'button'; prev.textContent = 'Back'; prev.setAttribute('aria-label', 'Previous slide');
    var next = el('button', 'deck-btn deck-next'); next.type = 'button'; next.textContent = 'Next'; next.setAttribute('aria-label', 'Next slide');
    var count = el('span', 'deck-count'); count.setAttribute('aria-live', 'polite');
    var top = el('div', 'deck-top'); top.appendChild(prev); top.appendChild(count); top.appendChild(next);

    var bar = el('div', 'deck-bar'), fill = el('span'); bar.appendChild(fill); bar.setAttribute('aria-hidden', 'true');
    var track = el('div', 'deck-track'); track.tabIndex = 0; track.setAttribute('role', 'group'); track.setAttribute('aria-label', 'Slides. Swipe or use the arrow keys.');
    slides.forEach(function (s, i) { track.appendChild(card(s, i, total, false)); });

    var nav = el('div', 'deck-nav');
    var present = el('button', 'deck-present'); present.type = 'button'; present.textContent = 'Present full screen';
    var dots = el('div', 'deck-dots'); dots.setAttribute('aria-hidden', 'true');
    nav.appendChild(dots); nav.appendChild(present);
    var dotEls = slides.map(function (_, i) { var d = el('span', 'deck-dot'); if (total <= 14) dots.appendChild(d); return d; });

    wrap.appendChild(top); wrap.appendChild(bar); wrap.appendChild(track); wrap.appendChild(nav);

    function paint() {
      count.textContent = (st.i + 1) + ' / ' + total;
      fill.style.width = ((st.i + 1) / total * 100) + '%';
      prev.disabled = st.i === 0; next.disabled = st.i === total - 1;
      dotEls.forEach(function (d, i) { d.classList.toggle('on', i === st.i); });
    }
    function go(i, smooth) {
      st.i = Math.min(Math.max(i, 0), total - 1);
      var c = track.children[st.i];
      if (c) track.scrollTo({ left: c.offsetLeft - track.offsetLeft, behavior: smooth === false ? 'auto' : 'smooth' });
      paint();
    }
    var timer = null;
    track.addEventListener('scroll', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var w = track.clientWidth || 1, i = Math.round(track.scrollLeft / w);
        if (i !== st.i && i >= 0 && i < total) { st.i = i; paint(); }
      }, 60);
    }, { passive: true });
    prev.addEventListener('click', function () { go(st.i - 1); });
    next.addEventListener('click', function () { go(st.i + 1); });
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(st.i + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(st.i - 1); }
    });
    present.addEventListener('click', function () { presentFull(slides, st, go); });

    paint();
    setTimeout(function () { if (st.i) go(st.i, false); }, 0);   // keep the place after a repaint
    return wrap;
  }

  /* Full-screen: one big slide, tap the right side or press → for next, the left side or ← for back, Esc to close. */
  function presentFull(slides, st, sync) {
    var total = slides.length, i = st.i;
    var dlg = document.createElement('dialog'); dlg.className = 'deck-full'; dlg.setAttribute('aria-label', 'Presenting slides');
    var stage = el('div', 'deck-stage');
    var close = el('button', 'deck-x'); close.type = 'button'; close.textContent = 'Close'; close.setAttribute('aria-label', 'Close presentation');
    var pos = el('div', 'deck-pos');
    var left = el('button', 'deck-zone deck-zl'); left.type = 'button'; left.setAttribute('aria-label', 'Previous slide');
    var right = el('button', 'deck-zone deck-zr'); right.type = 'button'; right.setAttribute('aria-label', 'Next slide');
    dlg.appendChild(stage); dlg.appendChild(left); dlg.appendChild(right); dlg.appendChild(close); dlg.appendChild(pos);
    function show() {
      stage.replaceChildren(card(slides[i], i, total, true));
      pos.textContent = (i + 1) + ' / ' + total;
      left.hidden = i === 0; right.hidden = i === total - 1;
    }
    function move(d) { var n = Math.min(Math.max(i + d, 0), total - 1); if (n !== i) { i = n; show(); } }
    left.addEventListener('click', function () { move(-1); });
    right.addEventListener('click', function () { move(1); });
    close.addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); move(-1); }
    });
    dlg.addEventListener('close', function () { st.i = i; sync(i, false); dlg.remove(); });
    document.body.appendChild(dlg);
    show();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    var fs = dlg.requestFullscreen || dlg.webkitRequestFullscreen;
    if (fs) { try { var p = fs.call(dlg); if (p && p.catch) p.catch(function () {}); } catch (e) { /* the dialog is already full-window */ } }
  }

  root.SchoolPadiSlides = { parse: parse, deck: deck, isDeck: isDeck };
})(typeof window !== 'undefined' ? window : this);
