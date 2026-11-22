'use strict';
(() => {
  const search = document.getElementById('guide-search');
  const clear = document.getElementById('guide-search-clear');
  const cards = Array.from(document.querySelectorAll('.guide-card'));
  const audienceButtons = Array.from(document.querySelectorAll('.guide-filter'));
  const topicButtons = Array.from(document.querySelectorAll('.guide-topic'));
  const count = document.getElementById('guide-count');
  const empty = document.getElementById('guide-empty');
  if (!search || !cards.length) return;

  const pager = document.getElementById('guide-pager');
  const PER = 9;
  let audience = 'all';
  let topic = 'all';
  let page = Math.max(1, parseInt(new URLSearchParams(location.search).get('page'), 10) || 1);

  function setActive(buttons, attribute, value) {
    buttons.forEach((button) => {
      const active = button.dataset[attribute] === value;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function pageButton(label, to, opts) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.className = 'guide-page' + (opts && opts.current ? ' is-active' : '');
    if (opts && opts.aria) b.setAttribute('aria-label', opts.aria);
    if (opts && opts.current) b.setAttribute('aria-current', 'page');
    if (opts && opts.disabled) b.disabled = true; else b.addEventListener('click', () => { page = to; update(true); });
    return b;
  }

  function drawPager(pages) {
    if (!pager) return;
    pager.replaceChildren();
    pager.hidden = pages <= 1;
    if (pages <= 1) return;
    pager.append(pageButton('‹ Prev', page - 1, { disabled: page === 1, aria: 'Previous page' }));
    for (let n = 1; n <= pages; n++) pager.append(pageButton(String(n), n, { current: n === page, aria: 'Page ' + n }));
    pager.append(pageButton('Next ›', page + 1, { disabled: page === pages, aria: 'Next page' }));
  }

  function update(fromPager) {
    const query = search.value.trim().toLowerCase();
    const matched = cards.filter((card) => {
      const matchesQuery = !query || card.dataset.search.includes(query);
      const matchesAudience = audience === 'all' || card.dataset.audience === audience;
      const matchesTopic = topic === 'all' || card.dataset.topic === topic;
      return matchesQuery && matchesAudience && matchesTopic;
    });
    const pages = Math.max(1, Math.ceil(matched.length / PER));
    if (!fromPager && fromPager !== 'keep') page = 1;           // a new search or filter starts at page 1
    page = Math.min(page, pages);
    const first = (page - 1) * PER, shown = new Set(matched.slice(first, first + PER));
    cards.forEach((card) => { card.hidden = !shown.has(card); });
    if (count) count.textContent = matched.length <= PER ? matched.length + (matched.length === 1 ? ' guide' : ' guides') : 'Showing ' + (first + 1) + '–' + (first + shown.size) + ' of ' + matched.length;
    if (empty) empty.hidden = matched.length !== 0;
    drawPager(pages);
    try {
      const u = new URL(location.href);
      if (page > 1) u.searchParams.set('page', String(page)); else u.searchParams.delete('page');
      history.replaceState(null, '', u);
    } catch (e) { /* the page still works without the address update */ }
    if (fromPager === true) { const top = document.querySelector('.guides-results'); if (top) top.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }
  }

  search.addEventListener('input', () => update());
  if (clear) clear.addEventListener('click', () => { search.value = ''; search.focus(); update(); });
  audienceButtons.forEach((button) => button.addEventListener('click', () => {
    audience = button.dataset.audience;
    setActive(audienceButtons, 'audience', audience);
    update();
  }));
  topicButtons.forEach((button) => button.addEventListener('click', () => {
    topic = button.dataset.topic;
    setActive(topicButtons, 'topic', topic);
    update();
  }));
  update('keep');
})();
