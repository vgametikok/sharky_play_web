// Главная (ArcadeBox): ряд фильтров (чипы жанров + панель период/жанр, состояние
// в URL), секция VERTICAL — полка 9:16 одной страницей, секция HORIZONTAL —
// бесконечная сетка 2:1 с полками-вставками из вертикального пула.
// Данные: только web_feed (seed-стабильный случайный порядок, offset-пагинация).
import { sb } from './sb.js';
import {
  el, initShell, gameCardH, bigHeading, shelfBlock, chipsRow, filtersControl,
  skeletonGridH, skeletonShelfV, emptyState, emptyEl, feedSeed,
} from './ui.js';
import { GENRES, PERIODS } from './config.js';

const filterHost = document.getElementById('filterRow');
const secV = document.getElementById('secV');
const secH = document.getElementById('secH');
const sentinel = document.getElementById('sentinel');

const seed = feedSeed();
const H_PAGE = 12;

// Полки-вставки между блоками сетки: сортировки уже загруженного вертикального
// пула — никаких дополнительных RPC. from → провенанс в game_stats.feed_source.
const SHELF_DEFS = [
  ['TRENDING', (p) => [...p].sort((a, b) => (b.plays || 0) - (a.plays || 0)), 'web_popular'],
  ['FRESH THIS WEEK', (p) => [...p].sort((a, b) => (Date.parse(b.published_at) || 0) - (Date.parse(a.published_at) || 0)), 'web_fresh'],
  ['TOP RATED', (p) => [...p].sort((a, b) => (b.likes || 0) - (a.likes || 0)), 'web_top'],
];

/* ── Состояние фильтров (читается из URL при загрузке) ── */
const VALID_GENRES = new Set(GENRES.map(([id]) => id));
const q0 = new URLSearchParams(location.search);
let genre = VALID_GENRES.has(q0.get('genre')) ? q0.get('genre') : null;
let period = PERIODS.some(([id]) => id === q0.get('period')) && q0.get('period') !== 'all'
  ? q0.get('period') : null;

let token = 0; // инвалидация асинхронных ответов после смены фильтров
let io = null; // IntersectionObserver бесконечной ленты
// Скролл-фолбэк к IntersectionObserver: в throttled-окружениях (свёрнутые
// вкладки, встроенные webview) IO-колбэки могут не доставляться — обычный
// scroll-листенер надёжнее. Дублирование безвредно: loadPage guard'ится.
let checkNear = null;
window.addEventListener('scroll', () => checkNear && checkNear(), { passive: true });
window.addEventListener('resize', () => checkNear && checkNear());

function syncURL() {
  const u = new URL(location.href);
  if (genre) u.searchParams.set('genre', genre); else u.searchParams.delete('genre');
  if (period) u.searchParams.set('period', period); else u.searchParams.delete('period');
  history.replaceState(null, '', u);
}

const filters = filtersControl({
  period, genre,
  onApply: (f) => { period = f.period; genre = f.genre; applyFilters(); },
});

function renderChips() {
  const chips = chipsRow([[null, 'Все'], ...GENRES], genre, (v) => {
    if (v === genre) return;
    genre = v;
    filters.setFilters(period, genre); // панель отражает выбор чипа
    applyFilters();
  });
  filterHost.replaceChildren(chips, el('div', { class: 'filter-sep' }), filters);
}

// Любая смена фильтров: URL, чипы, сброс ленты (сид остаётся прежним).
function applyFilters() {
  syncURL();
  renderChips();
  reload();
}

function resetFilters() {
  genre = null; period = null;
  filters.setFilters(null, null);
  applyFilters();
}

const feedArgs = (section, limit, offset) => ({
  p_section: section, p_genre: genre, p_period: period,
  p_seed: seed, p_limit: limit, p_offset: offset,
});

/* ── VERTICAL: одна страница до 48 карточек (в БД максимум 23) ── */
async function loadVertical(t) {
  secV.replaceChildren(el('div', { class: 'shelf-row' }, skeletonShelfV(6)));
  const { data, error } = await sb.rpc('web_feed', feedArgs('vertical', 48, 0));
  if (t !== token) return { games: [], error: true };
  if (error) {
    console.error('web_feed vertical:', error.message, error);
    secV.replaceChildren(emptyEl('Не удалось загрузить ленту'));
    return { games: [], error: true };
  }
  const games = Array.isArray(data) ? data : [];
  if (!games.length) {
    secV.replaceChildren(); // пусто — прячем секцию вместе с заголовком
  } else {
    secV.replaceChildren(bigHeading('Vertical', games.length), shelfBlock(null, games, 'web_vshelf'));
  }
  return { games, error: false };
}

/* ── Обе секции пустые → большое пустое состояние ── */
function showEmptyBoth() {
  secH.replaceChildren();
  secV.replaceChildren(emptyState(
    'Nothing found', 'Ни одна игра не подходит под фильтры.', 'Сбросить фильтры', resetFilters));
}

/* ── Перезагрузка обеих секций (старт и каждая смена фильтров) ── */
async function reload() {
  const t = ++token;
  if (io) { io.disconnect(); io = null; }
  const vReady = loadVertical(t);

  // HORIZONTAL: заголовок без счётчика; счётчик появится в конце ленты.
  const st = { offset: 0, shelfIdx: 0, loading: false, ended: false, headRow: bigHeading('Horizontal') };
  secH.replaceChildren(st.headRow);

  const loadPage = async () => {
    if (st.loading || st.ended || t !== token) return;
    st.loading = true;
    const skel = el('div', { class: 'ggrid' }, skeletonGridH(3));
    secH.append(skel);
    const { data, error } = await sb.rpc('web_feed', feedArgs('horizontal', H_PAGE, st.offset));
    skel.remove();
    if (t !== token) return;
    if (error) {
      console.error('web_feed horizontal:', error.message, error);
      st.ended = true;
      if (io) { io.disconnect(); io = null; }
      secH.append(emptyEl('Не удалось загрузить ленту'));
      return;
    }
    const page = Array.isArray(data) ? data : [];
    const first = st.offset === 0;
    if (page.length) {
      secH.append(el('div', { class: 'ggrid' }, page.map((g) => gameCardH(g, 'web_feed'))));
      st.offset += page.length;
    }
    if (page.length < H_PAGE) {
      // Конец ленты: наблюдатель выключаем, счётчик — фактически загруженное.
      st.ended = true;
      if (io) { io.disconnect(); io = null; }
      if (st.offset > 0) {
        st.headRow.append(el('span', { class: 'h-count' }, `${st.offset < 10 ? '0' : ''}${st.offset} GAMES`));
      } else {
        secH.replaceChildren(); // горизонтальных нет — прячем секцию целиком
        if (first) {
          const v = await vReady;
          if (t !== token) return;
          if (!v.error && !v.games.length) showEmptyBoth();
        }
      }
    } else if (st.shelfIdx < SHELF_DEFS.length) {
      // Полная страница из 12: одна полка-вставка между блоками (максимум 3).
      const v = await vReady;
      if (t !== token) return;
      if (v.games.length) {
        const [title, sortFn, from] = SHELF_DEFS[st.shelfIdx++];
        secH.append(shelfBlock(title, sortFn(v.games).slice(0, 10), from));
      }
    }
    st.loading = false;
    // Перенаблюдаем сентинел: если он всё ещё в зоне видимости — придёт
    // свежая запись пересечения и подгрузится следующая страница.
    if (!st.ended && io) { io.unobserve(sentinel); io.observe(sentinel); }
    if (!st.ended && checkNear) checkNear();
  };

  io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) loadPage();
  }, { rootMargin: '700px 0px' });
  io.observe(sentinel);
  checkNear = () => {
    if (t !== token || st.ended) { checkNear = null; return; }
    if (sentinel.getBoundingClientRect().top < window.innerHeight + 700) loadPage();
  };
  loadPage();
}

initShell('home'); // без await — авторизация в топбаре не блокирует рендер
renderChips();
reload();
