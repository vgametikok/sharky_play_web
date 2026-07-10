// Общие UI-компоненты: DOM-хелпер, топбар, карточка игры, чипы, логин-модалка.
// БЕЗОПАСНОСТЬ: весь пользовательский контент попадает в DOM только через
// textContent (el-хелпер) — никакого innerHTML с данными из БД.
import { getMe, login, logout, tgLogin, fmt } from './sb.js';
import { GAMES_BASE, ALLOWED_GAME_ORIGINS, TG_BOT, SUPABASE_URL } from './config.js';

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

// Валидируем цвета из БД перед вставкой в inline-стили.
export const safeColor = (c) => (typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : null);
const safeGradient = (g) =>
  typeof g === 'string' && /^linear-gradient\([^;{}<>]*\)$/.test(g) ? g : 'linear-gradient(135deg,#7b5cff,#ff3c5f)';

export function avatar(u, size = 36) {
  const d = el('div', { class: 'avatar' }, (u && u.avatar_emoji) || '🎮');
  d.style.background = safeGradient(u && u.gradient);
  d.style.width = d.style.height = size + 'px';
  d.style.fontSize = Math.round(size * 0.5) + 'px';
  return d;
}

export const channelHref = (username) => 'channel.html?u=' + encodeURIComponent(username || '');
// from — провенанс показа (какая секция привела на игру), уходит в game_stats.feed_source.
export const gameHref = (id, from) =>
  'game.html?id=' + encodeURIComponent(id || '') + (from ? '&from=' + encodeURIComponent(from) : '');

// Абсолютный URL игры + проверка по белому списку источников.
export function resolveGameSrc(src) {
  const url = /^https?:\/\//.test(src || '') ? src : GAMES_BASE + String(src || '').replace(/^\/+/, '');
  try {
    const origin = new URL(url).origin;
    if (!ALLOWED_GAME_ORIGINS.includes(origin)) return null;
  } catch { return null; }
  return url;
}

// Игры из Supabase Storage нельзя грузить прямым iframe src: платформа
// намеренно отдаёт .html как text/plain (анти-фишинг; edge-функции она
// даунгрейдит так же). Такие игры доставляем как мобильная лента: fetch + srcdoc.
export const isStorageGame = (url) => {
  try { return new URL(url).origin === SUPABASE_URL; } catch { return false; }
};

export async function initTopbar() {
  const bar = document.getElementById('topbar');
  if (!bar) return;
  const q = new URLSearchParams(location.search).get('q') || '';
  bar.append(
    el('a', { class: 'tb-logo', href: 'index.html' }, '🦈', el('span', {}, 'Sharky')),
    el('form', { class: 'tb-search', action: 'search.html' },
      el('input', { name: 'q', type: 'search', placeholder: 'Поиск игр', value: q, autocomplete: 'off' }),
      el('button', { type: 'submit', 'aria-label': 'Искать' }, '🔍')),
    el('div', { class: 'tb-auth', id: 'tbAuth' }),
  );
  const auth = bar.querySelector('#tbAuth');
  const me = await getMe();
  if (!me) {
    auth.append(el('button', { class: 'btn btn-primary', onclick: showLoginModal }, 'Войти'));
    return;
  }
  const menu = el('div', { class: 'tb-menu hidden' },
    el('a', { href: channelHref(me.username) }, 'Мой канал'),
    el('a', { href: 'me.html' }, 'Личный кабинет'),
    el('button', { onclick: logout }, 'Выйти'));
  const av = avatar(me, 36);
  av.classList.add('tb-avatar');
  av.setAttribute('role', 'button');
  av.addEventListener('click', () => menu.classList.toggle('hidden'));
  auth.append(av, menu);
  document.addEventListener('click', (e) => {
    if (!auth.contains(e.target)) menu.classList.add('hidden');
  });
}

export function gameCard(g, from) {
  const href = gameHref(g.id, from);
  const a = g.author || {};
  const thumb = el('a', { class: 'thumb', href, 'aria-label': g.title });
  if (g.thumbnail_url) {
    thumb.append(el('img', { src: g.thumbnail_url, alt: '', loading: 'lazy' }));
  } else {
    thumb.style.background =
      `linear-gradient(135deg, ${safeColor(g.bg) || '#15121c'}, ${safeColor(g.accent) || '#3a2b4d'})`;
    thumb.append(el('div', { class: 'thumb-emoji' }, g.emoji || '🎮'));
  }
  thumb.append(
    el('span', { class: 'thumb-play' }, '▶'),
    el('span', { class: 'thumb-badge', title: g.orientation === 'landscape' ? 'Горизонтальная' : 'Вертикальная' },
      g.orientation === 'landscape' ? '▭' : '▯'));
  const avLink = el('a', { href: channelHref(a.username) });
  avLink.append(avatar(a, 36));
  return el('article', { class: 'card' },
    thumb,
    el('div', { class: 'card-body' },
      avLink,
      el('div', { class: 'card-info' },
        el('a', { class: 'card-title', href }, g.title || ''),
        el('a', { class: 'card-author', href: channelHref(a.username) }, a.display_name || a.username || ''),
        el('div', { class: 'card-meta' }, `${fmt(g.plays)} играли · ${fmt(g.likes)} лайков`))));
}

// Скелетоны на время загрузки (вместо текста «Загрузка…»).
export function skeletonCards(n = 8) {
  return Array.from({ length: n }, () =>
    el('div', { class: 'card sk' },
      el('div', { class: 'thumb sk-shimmer' }),
      el('div', { class: 'card-body' },
        el('div', { class: 'avatar sk-shimmer', style: { width: '36px', height: '36px' } }),
        el('div', { class: 'card-info', style: { flex: '1' } },
          el('div', { class: 'sk-line sk-shimmer' }),
          el('div', { class: 'sk-line sk-shimmer short' })))));
}

export function chipBar(items, active, onPick) {
  return el('div', { class: 'chips' },
    items.map(([val, label]) =>
      el('button', { class: 'chip' + (val === active ? ' active' : ''), onclick: () => onPick(val) }, label)));
}

export function showLoginModal() {
  if (document.querySelector('.modal-back')) return;
  const tgHost = el('div', { class: 'tg-widget' });
  const back = el('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) back.remove(); } },
    el('div', { class: 'modal' },
      el('div', { class: 'modal-emoji' }, '🦈'),
      el('h3', {}, 'Войдите в Sharky'),
      el('p', {}, 'Один аккаунт для сайта и Telegram: лайки, подписки, комментарии и история игр.'),
      el('button', { class: 'btn btn-google', onclick: login }, 'Войти через Google'),
      tgHost,
      el('button', { class: 'btn btn-ghost', onclick: () => back.remove() }, 'Не сейчас')));
  document.body.append(back);
  // Кнопка Telegram: embed-iframe oauth.telegram.org НАПРЯМУЮ, без виджет-скрипта
  // telegram.org (он ненадёжно рендерится при динамической вставке в модалку).
  // Слушаем postMessage от oauth.telegram.org — ровно тот же протокол, что
  // использует официальный виджет. Требование Telegram: /setdomain у BotFather.
  const tgSrc = 'https://oauth.telegram.org/embed/' + TG_BOT
    + '?origin=' + encodeURIComponent(location.origin)
    + '&return_to=' + encodeURIComponent(location.href)
    + '&size=large&userpic=false&radius=22&request_access=write&lang=ru';
  const tgFrame = el('iframe', {
    src: tgSrc, scrolling: 'no', title: 'Войти через Telegram',
    style: { border: '0', width: '240px', height: '44px', colorScheme: 'auto' },
  });
  tgHost.append(tgFrame);
  const onTgMessage = (e) => {
    if (e.origin !== 'https://oauth.telegram.org') return;
    let d;
    try { d = JSON.parse(e.data); } catch { return; }
    if (d.event === 'auth_user' && d.auth_data) {
      window.removeEventListener('message', onTgMessage);
      tgLogin(d.auth_data).catch((err) => {
        console.error('tgLogin:', err);
        const p = back.querySelector('p');
        if (p) p.textContent = 'Не удалось войти через Telegram. Попробуйте ещё раз.';
      });
    } else if (d.event === 'resize') {
      if (d.width) tgFrame.style.width = Math.min(d.width, 320) + 'px';
      if (d.height) tgFrame.style.height = Math.min(d.height, 60) + 'px';
    }
  };
  window.addEventListener('message', onTgMessage);
}

// Вернёт профиль или покажет логин-модалку и вернёт null.
export async function requireLogin() {
  const me = await getMe();
  if (me) return me;
  showLoginModal();
  return null;
}

export const loadingEl = () => el('div', { class: 'loading' }, 'Загрузка…');
export const emptyEl = (text) => el('div', { class: 'empty' }, text);
