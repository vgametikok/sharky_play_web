// Поиск + каталог: строка запроса, жанры, ориентация, «показать ещё».
import { sb } from './sb.js';
import { GENRES } from './config.js';
import { el, initTopbar, gameCard, chipBar, loadingEl, emptyEl } from './ui.js';

const grid = document.getElementById('grid');
const chipsHost = document.getElementById('chips');
const moreHost = document.getElementById('more');
const PAGE = 24;

const state = {
  q: new URLSearchParams(location.search).get('q') || '',
  genre: null,
  orientation: 'mix',
  offset: 0,
};

const heading = document.getElementById('heading');
if (state.q) heading.textContent = `Результаты по запросу «${state.q}»`;

async function load(append = false) {
  if (!append) { state.offset = 0; grid.replaceChildren(loadingEl()); }
  moreHost.replaceChildren();
  const { data, error } = await sb.rpc('web_search', {
    p_q: state.q, p_genre: state.genre, p_orientation: state.orientation,
    p_limit: PAGE, p_offset: state.offset,
  });
  if (error) {
    console.error('web_search:', error.message);
    grid.replaceChildren(emptyEl('Ошибка поиска. Попробуйте ещё раз.'));
    return;
  }
  const cards = data.map(gameCard);
  if (append) grid.append(...cards);
  else grid.replaceChildren(...(cards.length ? cards : [emptyEl('Ничего не найдено')]));
  if (data.length === PAGE) {
    moreHost.replaceChildren(el('button', {
      class: 'btn',
      onclick: () => { state.offset += PAGE; load(true); },
    }, 'Показать ещё'));
  }
}

function renderChips() {
  chipsHost.replaceChildren(
    chipBar([[null, 'Все жанры'], ...GENRES], state.genre,
      (v) => { state.genre = v; renderChips(); load(); }),
    chipBar([['mix', 'Смесь'], ['portrait', 'Вертикальные'], ['landscape', 'Горизонтальные']],
      state.orientation,
      (v) => { state.orientation = v; renderChips(); load(); }),
  );
}

initTopbar();
renderChips();
load();
