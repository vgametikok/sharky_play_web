// Общие UI-компоненты дизайн-системы ArcadeBox: каркас (сайдбар+топбар+футер),
// карточки игр (9:16 и 2:1), полки, чипы, панель фильтров, скелетоны, модалка.
// БЕЗОПАСНОСТЬ: весь пользовательский контент попадает в DOM только через
// textContent (el-хелпер) — никакого innerHTML с данными из БД.
import { getMe, login, logout, tgWidgetLogin, fmt } from './sb.js';
import { GAMES_BASE, ALLOWED_GAME_ORIGINS, SUPABASE_URL, MAKER_URL, GENRES, GENRE_LABEL, SETTING_LABEL, PERIODS } from './config.js';

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (typeof v !== 'function' && !k.startsWith('on')) node.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

// Валидируем цвета/градиенты из БД перед вставкой в inline-стили.
export const safeColor = (c) => (typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : null);
export const safeGradient = (g) =>
  typeof g === 'string' && /^linear-gradient\([^;{}<>]*\)$/.test(g) ? g : 'linear-gradient(135deg,#7b5cff,#ff3c5f)';

export function avatar(u, size = 36) {
  const d = el('div', { class: 'avatar' }, (u && u.avatar_emoji) || '🎮');
  d.style.background = safeGradient(u && u.gradient);
  d.style.width = d.style.height = size + 'px';
  d.style.fontSize = Math.round(size * 0.5) + 'px';
  return d;
}

export const channelHref = (username) => 'channel.html?u=' + encodeURIComponent(username || '');
// Билд плеера: бампить при правках game.html/game.js. Уходит в URL игры (&b=)
// как кеш-бастер — Pages отдаёт HTML с max-age=600, и без этого переход из
// каталога 10 минут открывал бы закешированный старый плеер.
export const PLAYER_BUILD = '3';
// from — провенанс показа (какая секция привела на игру), уходит в game_stats.feed_source.
export const gameHref = (id, from) =>
  'game.html?id=' + encodeURIComponent(id || '') + (from ? '&from=' + encodeURIComponent(from) : '') + '&b=' + PLAYER_BUILD;

// Абсолютный URL игры + проверка по белому списку источников.
export function resolveGameSrc(src) {
  const url = /^https?:\/\//.test(src || '') ? src : GAMES_BASE + String(src || '').replace(/^\/+/, '');
  try {
    const origin = new URL(url).origin;
    if (!ALLOWED_GAME_ORIGINS.includes(origin)) return null;
  } catch { return null; }
  return url;
}
// Storage-игры платформа отдаёт как text/plain → доставляем fetch + srcdoc.
export const isStorageGame = (url) => {
  try { return new URL(url).origin === SUPABASE_URL; } catch { return false; }
};

// Сид случайного порядка ленты: стабилен в рамках сессии браузера,
// чтобы offset-пагинация web_feed не давала дублей между страницами.
export function feedSeed() {
  let s = sessionStorage.getItem('sharky_feed_seed');
  if (!s) { s = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('sharky_feed_seed', s); }
  return s;
}

/* ── Каркас страницы: сайдбар + топбар + футер ── */
const NAV = [
  ['home', 'Главная', 'index.html'],
  ['search', 'Поиск', 'search.html'],
  ['saved', 'Избранное', 'me.html#saved'],
  ['profile', 'Профиль', 'me.html'],
];

const searchIcon = () => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', '15'); s.setAttribute('height', '15'); s.setAttribute('viewBox', '0 0 16 16');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.6'); s.setAttribute('stroke-linecap', 'round');
  s.innerHTML = '<circle cx="7" cy="7" r="4.6"/><line x1="10.6" y1="10.6" x2="14" y2="14"/>';
  return s;
};

// active: 'home' | 'search' | 'saved' | 'profile' | null
export async function initShell(active) {
  const sb = document.getElementById('sidebar');
  if (sb) {
    sb.append(
      el('div', { class: 'sb-logo' }, 'SHARKY'),
      el('nav', { class: 'sb-nav' },
        NAV.map(([id, label, href]) =>
          el('a', { href, class: id === active ? 'active' : null }, label))));
  }
  const bar = document.getElementById('topbar');
  if (bar) {
    const q = new URLSearchParams(location.search).get('q') || '';
    const wrap = el('div', { class: 'tb-search' });
    wrap.append(searchIcon());
    const form = el('form', { action: 'search.html', style: { display: 'contents' } },
      el('input', { name: 'q', type: 'search', placeholder: 'Поиск игр', value: q, autocomplete: 'off', 'aria-label': 'Поиск игр' }));
    wrap.append(form);
    bar.append(wrap, el('div', { class: 'tb-auth', id: 'tbAuth' }));
  }
  const foot = document.getElementById('footer');
  if (foot) {
    foot.append(el('div', { class: 'ft-in' },
      el('div', { class: 'ft-top' },
        el('div', {},
          el('div', { class: 'ft-logo' }, 'SHARKY'),
          el('div', { class: 'ft-tag' }, 'Короткие браузерные игры. Без установки — открыл и играешь.')),
        el('div', { class: 'ft-links' },
          el('a', { href: 'index.html' }, 'Каталог'),
          el('a', { href: 'https://t.me/sharkyplay_bot', target: '_blank', rel: 'noopener' }, 'Telegram-приложение'),
          el('a', { href: 'search.html' }, 'Поиск'))),
      el('div', { class: 'ft-copy' }, '© 2026 Sharky. All rights reserved.')));
  }
  // Авторизация в топбаре (не блокируем рендер страницы).
  const auth = document.getElementById('tbAuth');
  if (auth) {
    const me = await getMe();
    if (!me) {
      // Кнопка есть и у гостя: по клику — сначала регистрация/вход.
      auth.append(
        el('button', { class: 'btn tb-create', onclick: showLoginModal }, 'Создать игру +'),
        el('button', { class: 'btn-login', onclick: showLoginModal }, 'Войти'));
    } else {
      auth.append(el('a', { class: 'btn tb-create', href: MAKER_URL, target: '_blank', rel: 'noopener' }, 'Создать игру +'));
      const menu = el('div', { class: 'tb-menu hidden' },
        el('a', { href: channelHref(me.username) }, 'Мой канал'),
        el('a', { href: 'me.html' }, 'Личный кабинет'),
        el('button', { onclick: logout }, 'Выйти'));
      const av = avatar(me, 30);
      av.classList.add('tb-avatar');
      av.setAttribute('role', 'button');
      av.addEventListener('click', () => menu.classList.toggle('hidden'));
      auth.append(av, menu);
      document.addEventListener('click', (e) => {
        if (!auth.contains(e.target)) menu.classList.add('hidden');
      });
    }
    return auth._me;
  }
}
// Легаси-алиас (страницы до редизайна звали initTopbar).
export const initTopbar = () => initShell(null);

/* ── Обложка: thumbnail_url или градиент bg→accent + эмодзи + название ── */
function cover(g, vert) {
  const c = el('div', { class: 'gc-cover' });
  if (g.thumbnail_url) {
    c.append(el('img', { src: g.thumbnail_url, alt: '', loading: 'lazy' }));
  } else {
    const dark = safeColor(g.bg) || '#15121c';
    const acc = safeColor(g.accent) || '#3a2b4d';
    c.style.background = `linear-gradient(${vert ? 30 : 65}deg, ${dark} 0%, ${acc} 150%)`;
    c.append(
      el('div', { class: 'gc-wm' }, g.emoji || '🎮'),
      el('div', { class: 'gc-ttl' }, g.title || ''));
  }
  return c;
}

const metaLine = (g) => {
  const genre = GENRE_LABEL[g.genre] || g.genre || '';
  const setting = SETTING_LABEL[g.setting] || '';
  return setting ? `${genre} / ${setting}` : genre;
};
const playsEl = (g) => {
  const s = el('span', { class: 'gc-plays' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '10'); svg.setAttribute('height', '10');
  svg.setAttribute('viewBox', '0 0 12 12'); svg.setAttribute('fill', 'currentColor');
  svg.innerHTML = '<circle cx="6" cy="3.6" r="2.4"/><path d="M1.3 11c.5-3 8.9-3 9.4 0z"/>';
  s.append(svg, fmt(g.plays));
  return s;
};

// Вертикальная карточка 9:16 (полки).
export function gameCardV(g, from) {
  return el('a', { class: 'gcard v', href: gameHref(g.id, from), 'aria-label': g.title },
    cover(g, true),
    el('div', { class: 'gc-body' },
      el('div', { class: 'gc-name' }, g.title || ''),
      el('div', { class: 'gc-meta' }, metaLine(g)),
      el('div', { class: 'gc-stats' },
        el('span', { class: 'gc-likes' }, `♥ ${fmt(g.likes)}`),
        playsEl(g))));
}

// Горизонтальная карточка 2:1 (сетка).
export function gameCardH(g, from) {
  return el('a', { class: 'gcard h', href: gameHref(g.id, from), 'aria-label': g.title },
    cover(g, false),
    el('div', { class: 'gc-body' },
      el('div', { class: 'gc-name' }, g.title || ''),
      el('div', { class: 'gc-row2' },
        el('span', { class: 'gc-meta' }, metaLine(g)),
        el('div', { class: 'gc-stats' },
          el('span', { class: 'gc-likes' }, `♥ ${fmt(g.likes)}`),
          playsEl(g)))));
}

// Легаси-алиас: карточка по display_orientation.
export const gameCard = (g, from) =>
  (g.display_orientation === 'vertical' ? gameCardV(g, from) : gameCardH(g, from));

/* ── Дисплейный заголовок секции + счётчик ── */
export function bigHeading(text, count) {
  const row = el('div', { class: 'h-row' }, el('h2', { class: 'h-display' }, text));
  if (count != null)
    row.append(el('span', { class: 'h-count' }, `${count < 10 ? '0' : ''}${count} GAMES`));
  return row;
}

/* ── Полка вертикальных карточек со стрелками ── */
const arrowSvg = (dir) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', '15'); s.setAttribute('height', '15'); s.setAttribute('viewBox', '0 0 16 16');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.innerHTML = dir < 0 ? '<polyline points="9.5,3.5 5.5,8 9.5,12.5"/>' : '<polyline points="6.5,3.5 10.5,8 6.5,12.5"/>';
  return s;
};
// title == null → полка без заголовка (главная полка под bigHeading).
export function shelfBlock(title, games, from) {
  const row = el('div', { class: 'shelf-row' }, games.map((g) => gameCardV(g, from)));
  const mk = (dir) => {
    const b = el('button', { class: 'shelf-arr ' + (dir < 0 ? 'left' : 'right'), 'aria-label': dir < 0 ? 'Назад' : 'Вперёд' }, arrowSvg(dir));
    b.addEventListener('click', () => row.scrollBy({ left: dir * 636, behavior: 'smooth' }));
    return b;
  };
  const shelf = el('div', { class: 'shelf' }, row, mk(-1), mk(1));
  return title ? el('section', {}, el('h3', { class: 'h-shelf' }, title), shelf) : shelf;
}

/* ── Чипы жанров ── */
// items: [[value, label]], active — значение
export function chipsRow(items, active, onPick) {
  return el('div', { class: 'chips-scroll' },
    items.map(([val, label]) =>
      el('button', { class: 'chip' + (val === active ? ' active' : ''), onclick: () => onPick(val) }, label)));
}
export const chipBar = (items, active, onPick) => // легаси-обёртка
  el('div', { class: 'chips' }, chipsRow(items, active, onPick).children.length ? [...chipsRow(items, active, onPick).children] : []);

/* ── Кнопка «Фильтры» + выпадающая панель (черновик → Apply) ── */
// opts: { period, genre, onApply({period, genre}) }
export function filtersControl(opts) {
  let period = opts.period || null, genre = opts.genre || null;
  let draftP = period, draftG = genre, open = false;
  const wrap = el('div', { class: 'filters-wrap' });

  const fsvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  fsvg.setAttribute('width', '14'); fsvg.setAttribute('height', '14'); fsvg.setAttribute('viewBox', '0 0 16 16');
  fsvg.innerHTML = '<line x1="1" y1="4.5" x2="15" y2="4.5" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="11.5" x2="15" y2="11.5" stroke="currentColor" stroke-width="1.5"/><circle cx="10.5" cy="4.5" r="2.5" fill="#141416" stroke="currentColor" stroke-width="1.5"/><circle cx="5.5" cy="11.5" r="2.5" fill="#141416" stroke="currentColor" stroke-width="1.5"/>';

  function render() {
    wrap.replaceChildren();
    const btn = el('button', { class: 'filters-btn', onclick: () => { open = !open; draftP = period; draftG = genre; render(); } }, fsvg, 'Фильтры');
    wrap.append(btn);
    const applied = (period ? 1 : 0) + (genre ? 1 : 0);
    if (applied) wrap.append(el('span', { class: 'filters-badge' }, applied));
    if (!open) return;
    wrap.append(el('div', { class: 'filters-overlay', onclick: () => { open = false; render(); } }));
    const seg = el('div', { class: 'fp-seg' },
      PERIODS.map(([id, label]) =>
        el('button', { class: (draftP || 'all') === id ? 'on' : null, onclick: () => { draftP = id === 'all' ? null : id; render(); } }, label)));
    const genres = el('div', { class: 'fp-genres' },
      [[null, 'Все жанры'], ...GENRES].map(([id, label]) => {
        const on = draftG === id;
        return el('button', { class: 'fp-opt' + (on ? ' on' : ''), onclick: () => { draftG = id; render(); } },
          el('span', { class: 'fp-box' }, on ? '✓' : ''),
          el('span', {}, label));
      }));
    wrap.append(el('div', { class: 'filters-panel' },
      el('div', { class: 'fp-label' }, 'Период'),
      seg,
      el('div', { class: 'fp-label' }, 'Жанр'),
      genres,
      el('div', { class: 'fp-foot' },
        el('button', { class: 'fp-reset', onclick: () => { draftP = null; draftG = null; render(); } }, 'Сбросить'),
        el('button', { class: 'fp-apply', onclick: () => { period = draftP; genre = draftG; open = false; render(); opts.onApply({ period, genre }); } }, 'Применить'))));
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { open = false; render(); } });
  render();
  wrap.setFilters = (p, g) => { period = p; genre = g; render(); };
  return wrap;
}

/* ── Скелетоны ── */
const skel = (kind) => el('div', { class: 'skel ' + kind },
  el('div', { class: 'sk-cov' }),
  el('div', { class: 'sk-body' }, el('div', { class: 'sk-line' }), el('div', { class: 'sk-line short' })));
export const skeletonGridH = (n = 6) => Array.from({ length: n }, () => skel('h'));
export const skeletonShelfV = (n = 6) => Array.from({ length: n }, () => skel('v'));
export const skeletonCards = skeletonGridH; // легаси-алиас

/* ── Пустое состояние ── */
export function emptyState(title, sub, btnLabel, onBtn) {
  const s = el('div', { class: 'empty-state' },
    el('div', { class: 'es-title' }, title),
    el('div', { class: 'es-sub' }, sub));
  if (btnLabel) s.append(el('button', { class: 'es-btn', onclick: onBtn }, btnLabel));
  return s;
}
export const loadingEl = () => el('div', { class: 'loading' }, 'Загрузка…');
export const emptyEl = (text) => el('div', { class: 'empty' }, text);

/* ── Логин-модалка ── */
export function showLoginModal() {
  if (document.querySelector('.modal-back')) return;
  const hint = el('p', {}, 'Один аккаунт для сайта и Telegram: лайки, подписки, комментарии и история игр.');
  const tgBtn = el('button', {
    class: 'btn btn-tg',
    onclick: async () => {
      tgBtn.disabled = true;
      tgBtn.textContent = 'Подтвердите вход в Telegram…';
      try {
        await tgWidgetLogin();
      } catch (err) {
        console.error('tgWidgetLogin:', err);
        tgBtn.disabled = false;
        tgBtn.textContent = 'Войти через Telegram';
        hint.textContent = 'Не получилось войти через Telegram. Попробуйте ещё раз или войдите через Google.';
      }
    },
  }, 'Войти через Telegram');
  const back = el('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) back.remove(); } },
    el('div', { class: 'modal' },
      el('div', { class: 'modal-emoji' }, '🦈'),
      el('h3', {}, 'Войдите в Sharky'),
      hint,
      tgBtn,
      el('button', { class: 'btn btn-google', onclick: login }, 'Войти через Google'),
      el('button', { class: 'btn btn-ghost', onclick: () => back.remove() }, 'Не сейчас')));
  document.body.append(back);
}

// Вернёт профиль или покажет логин-модалку и вернёт null.
export async function requireLogin() {
  const me = await getMe();
  if (me) return me;
  showLoginModal();
  return null;
}
