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

  let audience = 'all';
  let topic = 'all';

  function setActive(buttons, attribute, value) {
    buttons.forEach((button) => {
      const active = button.dataset[attribute] === value;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function update() {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    cards.forEach((card) => {
      const matchesQuery = !query || card.dataset.search.includes(query);
      const matchesAudience = audience === 'all' || card.dataset.audience === audience;
      const matchesTopic = topic === 'all' || card.dataset.topic === topic;
      const show = matchesQuery && matchesAudience && matchesTopic;
      card.hidden = !show;
      if (show) visible++;
    });
    if (count) count.textContent = visible + (visible === 1 ? ' guide' : ' guides');
    if (empty) empty.hidden = visible !== 0;
  }

  search.addEventListener('input', update);
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
  update();
})();