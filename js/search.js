// Поиск/каталог (ArcadeBox): web_search_v2 — релевантная выдача + фильтры
// жанра и периода, единая смешанная сетка 2:1 и пагинация «Показать ещё».
// q/genre/period живут в URL (history.replaceState), кнопка «ещё» видна,
// пока loaded < total; ошибка догрузки НЕ стирает уже показанные карточки.
import { sb } from './sb.js';
import { GENRES, PERIODS } from './config.js';
import {
  el, initShell, gameCardH, bigHeading, chipsRow, filtersControl,
  skeletonGridH, emptyState, emptyEl,
} from './ui.js';

const PAGE = 24;
const FROM = 'web_search'; // провенанс кликов по карточкам

// ── Состояние из URL (валидируем значения по справочникам) ──
const sp = new URLSearchParams(location.search);
const state = {
  q: (sp.get('q') || '').trim(),
  genre: GENRES.some(([id]) => id === sp.get('genre')) ? sp.get('genre') : null,
  period: PERIODS.some(([id]) => id === sp.get('period') && id !== 'all') ? sp.get('period') : null,
  total: 0,
};
let loaded = 0; // сколько карточек уже в сетке
let seq = 0;    // токен свежей загрузки — защита от гонок при быстрой смене фильтров

initShell('search'); // сознательно без await: auth не блокирует выдачу

const headHost = document.getElementById('head');
const filterRow = document.getElementById('filterRow');
const resultsHost = document.getElementById('results');
let grid = el('div', { class: 'ggrid' });
const noteHost = el('div');  // место под сообщение об ошибке догрузки
const moreHost = el('div');  // место под кнопку «Показать ещё»

function syncUrl() {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.genre) p.set('genre', state.genre);
  if (state.period) p.set('period', state.period);
  const qs = p.toString();
  history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
}

// Заголовок SEARCH + счётчик (появляется, когда известен total) + подзапрос.
function renderHead(total) {
  const nodes = [bigHeading('Search', total)];
  if (state.q)
    nodes.push(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginTop: '-10px' } },
      `по запросу "${state.q}"`));
  headHost.replaceChildren(...nodes);
}

// ── Фильтры: чипы жанров (single-select) + панель «Фильтры» ──
const fc = filtersControl({
  period: state.period,
  genre: state.genre,
  onApply: ({ period, genre }) => {
    state.period = period;
    state.genre = genre;
    renderChips();
    syncUrl();
    loadFresh();
  },
});

let chipsNode = null;
function renderChips() {
  const node = chipsRow([[null, 'Все жанры'], ...GENRES], state.genre, (v) => {
    if (v === state.genre) return;
    state.genre = v;
    renderChips();
    fc.setFilters(state.period, state.genre);
    syncUrl();
    loadFresh();
  });
  if (chipsNode) chipsNode.replaceWith(node);
  else filterRow.prepend(node);
  chipsNode = node;
}
renderChips();
filterRow.append(el('div', { class: 'filter-sep' }), fc);

const rpc = (offset) => sb.rpc('web_search_v2', {
  p_q: state.q, p_genre: state.genre, p_period: state.period,
  p_limit: PAGE, p_offset: offset,
});

function renderMore() {
  moreHost.replaceChildren();
  if (loaded < state.total)
    moreHost.append(el('div', { style: { textAlign: 'center', marginTop: '28px' } },
      el('button', { class: 'btn', onclick: loadMore }, 'Показать ещё')));
}

// Сброс всего (кнопка в пустом состоянии): запрос + фильтры.
function resetAll() {
  state.q = ''; state.genre = null; state.period = null;
  const inp = document.querySelector('.tb-search input');
  if (inp) inp.value = '';
  fc.setFilters(null, null);
  renderChips();
  syncUrl();
  loadFresh();
}

// Свежая загрузка (offset 0): скелетоны вместо сетки, затем первая страница.
async function loadFresh() {
  const my = ++seq;
  renderHead(null);
  grid = el('div', { class: 'ggrid' }, skeletonGridH(6));
  noteHost.replaceChildren();
  moreHost.replaceChildren();
  resultsHost.replaceChildren(grid, noteHost, moreHost);
  const { data, error } = await rpc(0);
  if (my !== seq) return; // фильтры успели смениться — этот ответ устарел
  if (error) {
    console.error('web_search_v2:', error.message);
    resultsHost.replaceChildren(emptyEl('Не удалось загрузить результаты. Попробуйте ещё раз.'));
    return;
  }
  state.total = data.total || 0;
  renderHead(state.total);
  if (!state.total) {
    resultsHost.replaceChildren(emptyState(
      'Nothing found', 'Ничего не найдено по вашему запросу и фильтрам.', 'Сбросить', resetAll));
    return;
  }
  const cards = (data.cards || []).map((g) => gameCardH(g, FROM));
  loaded = cards.length;
  grid.replaceChildren(...cards);
  renderMore();
}

// Догрузка следующей страницы: существующие карточки НЕ трогаем;
// при ошибке — сообщение под сеткой, кнопка остаётся.
async function loadMore(ev) {
  const btn = ev.currentTarget;
  btn.disabled = true;
  const my = seq;
  const { data, error } = await rpc(loaded);
  if (my !== seq) return; // началась свежая загрузка — ответ устарел
  if (error) {
    console.error('web_search_v2:', error.message);
    noteHost.replaceChildren(emptyEl('Не удалось загрузить ещё — попробуйте снова'));
    btn.disabled = false;
    return;
  }
  noteHost.replaceChildren();
  state.total = data.total ?? state.total;
  const cards = (data.cards || []).map((g) => gameCardH(g, FROM));
  if (!cards.length) state.total = loaded; // сервер иссяк раньше total — прячем кнопку
  grid.append(...cards);
  loaded += cards.length;
  renderMore();
}

loadFresh();
