// Главная: секции с простыми алгоритмами выдачи (web_home_v2) —
// продолжить играть / популярное / новинки / «для вас» (скоринг с шумом).
// Каждая секция помечает клики своим from → провенанс в game_stats.feed_source.
import { sb } from './sb.js';
import { el, initTopbar, gameCard, chipBar, skeletonCards, emptyEl } from './ui.js';

const host = document.getElementById('sections');
const chipsHost = document.getElementById('chips');
let orientation = 'mix';

function rail(title, cards) {
  if (!cards.length) return null;
  return el('section', { class: 'rail-sec' },
    el('h2', { class: 'section-title' }, title),
    el('div', { class: 'rail' }, cards));
}

async function load() {
  host.replaceChildren(el('div', { class: 'grid' }, skeletonCards(12)));
  const { data, error } = await sb.rpc('web_home_v2', { p_orientation: orientation });
  if (error) {
    console.error('web_home_v2:', error.message);
    host.replaceChildren(emptyEl('Не удалось загрузить игры. Обновите страницу.'));
    return;
  }
  const secs = [
    rail('▶️ Продолжить играть', (data.continue || []).map((g) => gameCard(g, 'continue'))),
    rail('🔥 Популярное', (data.popular || []).map((g) => gameCard(g, 'popular'))),
    rail('✨ Новинки', (data.fresh || []).map((g) => gameCard(g, 'fresh'))),
    el('section', {},
      el('h2', { class: 'section-title' }, '🎯 Для вас'),
      el('div', { class: 'grid' },
        (data.feed || []).length
          ? data.feed.map((g) => gameCard(g, 'feed'))
          : [emptyEl('Пока пусто')])),
  ].filter(Boolean);
  host.replaceChildren(...secs);
}

function renderChips() {
  chipsHost.replaceChildren(chipBar(
    [['mix', 'Смесь'], ['portrait', 'Вертикальные'], ['landscape', 'Горизонтальные']],
    orientation,
    (v) => { orientation = v; renderChips(); load(); },
  ));
}

initTopbar();
renderChips();
load();
