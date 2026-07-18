// Страница канала (ArcadeBox): баннер, шапка с подпиской, случайная игра,
// игры автора с разбивкой по ориентации (вертикальная полка + сетка 2:1).
import { sb, fmt } from './sb.js';
import { GENRE_LABEL } from './config.js';
import {
  el, initShell, avatar, gameCardH, shelfBlock, gameHref, requireLogin,
  emptyEl, safeColor, safeGradient, skeletonGridH, skeletonShelfV,
} from './ui.js';

const app = document.getElementById('app');
const username = new URLSearchParams(location.search).get('u') || '';

initShell(null);
load();

async function load() {
  // Скелетоны: баннер + полка + сетка.
  app.replaceChildren(
    el('div', { class: 'ch-banner skel', style: { background: 'var(--surface2)' } }),
    el('div', { class: 'shelf-row', style: { marginTop: '28px' } }, skeletonShelfV(6)),
    el('div', { class: 'ggrid' }, skeletonGridH(3)));

  const { data, error } = await sb.rpc('web_channel', { p_username: username });
  if (error || !data) {
    console.error('web_channel:', error && error.message);
    app.replaceChildren(emptyEl('Канал не найден'));
    return;
  }
  const games = data.games || [];
  // web_channel не отдаёт display_orientation — добираем из таблицы games
  // (published-игры читаемы по RLS, как в me.js). Фолбэк — по orientation.
  if (games.length) {
    const { data: rows } = await sb.from('games')
      .select('id,display_orientation').in('id', games.map((g) => g.id));
    const dmap = new Map((rows || []).map((r) => [r.id, r.display_orientation]));
    for (const g of games) {
      g.display_orientation = dmap.get(g.id)
        || (g.orientation === 'portrait' ? 'vertical' : 'horizontal');
    }
  }
  render(data.channel, games);
}

/* Обложка 2:1 для featured: thumbnail или градиент bg→accent + эмодзи + название
   (тот же вид, что gc-cover в ui.js, собрано инлайном). */
function featuredThumb(g) {
  const thumb = el('a', { class: 'thumb', href: gameHref(g.id, 'web_channel'), 'aria-label': g.title });
  if (g.thumbnail_url) {
    thumb.append(el('img', { src: g.thumbnail_url, alt: '' }));
  } else {
    const dark = safeColor(g.bg) || '#15121c';
    const acc = safeColor(g.accent) || '#3a2b4d';
    thumb.style.background = `linear-gradient(65deg, ${dark} 0%, ${acc} 150%)`;
    thumb.append(
      el('div', { class: 'gc-wm' }, g.emoji || '🎮'),
      el('div', { class: 'gc-ttl' }, g.title || ''));
  }
  return thumb;
}

function render(ch, games) {
  document.title = `${ch.display_name || ch.username} — Sharky`;
  app.replaceChildren();

  // Баннер
  const banner = el('div', { class: 'ch-banner' });
  if (ch.banner_url) banner.append(el('img', { src: ch.banner_url, alt: '' }));
  else banner.style.background = safeGradient(ch.gradient);
  app.append(banner);

  // Шапка: аватар, имя, статы, био, подписка
  const subBtn = el('button', { class: 'btn btn-sub' + (ch.subscribed ? ' on' : '') },
    ch.subscribed ? 'Вы подписаны' : 'Подписаться');
  const statsEl = el('div', { class: 'ch-stats' });
  const renderStats = () => {
    statsEl.textContent =
      `${fmt(ch.subscribers)} ПОДПИСЧИКОВ · ${fmt(ch.active_players_28d)} ИГРОКОВ ЗА 28 ДНЕЙ`;
  };
  renderStats();
  subBtn.addEventListener('click', async () => {
    const me = await requireLogin();
    if (!me) return;
    if (me.username === ch.username) return;
    subBtn.disabled = true;
    if (ch.subscribed) {
      const { error } = await sb.from('follows').delete()
        .eq('follower_id', me.id).eq('followee_username', ch.username);
      if (!error) { ch.subscribed = false; ch.subscribers--; }
    } else {
      const { error } = await sb.from('follows')
        .insert({ follower_id: me.id, followee_username: ch.username });
      if (!error) { ch.subscribed = true; ch.subscribers++; }
    }
    subBtn.disabled = false;
    subBtn.className = 'btn btn-sub' + (ch.subscribed ? ' on' : '');
    subBtn.textContent = ch.subscribed ? 'Вы подписаны' : 'Подписаться';
    renderStats();
  });

  app.append(el('div', { class: 'ch-head' },
    avatar(ch, 72),
    el('div', { style: { flex: '1', minWidth: '220px' } },
      el('h1', {}, ch.display_name || ch.username),
      statsEl,
      ch.bio ? el('div', { class: 'ch-bio' }, ch.bio) : null),
    subBtn));

  // Случайная игра канала
  if (games.length) {
    const g = games[Math.floor(Math.random() * games.length)];
    app.append(el('div', { class: 'featured' },
      featuredThumb(g),
      el('div', { class: 'featured-info' },
        el('h2', {}, el('a', { href: gameHref(g.id, 'web_channel') }, g.title)),
        el('div', { class: 'ch-stats', style: { margin: '0 0 10px' } },
          `${(GENRE_LABEL[g.genre] || g.genre || '').toUpperCase()} · ${fmt(g.plays)} ИГРАЛИ · ♥ ${fmt(g.likes)}`),
        el('p', {}, g.description || 'Без описания — просто откройте и играйте!'),
        el('div', { style: { marginTop: '14px' } },
          el('a', { class: 'btn btn-primary', href: gameHref(g.id, 'web_channel') }, '▶ Играть')))));
  }

  // Игры автора: вертикальные — полкой, горизонтальные (включая vnh) — сеткой 2:1
  if (!games.length) {
    app.append(emptyEl('У автора пока нет игр'));
    return;
  }
  const vGames = games.filter((g) => g.display_orientation === 'vertical');
  const hGames = games.filter((g) => g.display_orientation !== 'vertical');
  if (vGames.length) {
    app.append(
      el('h3', { class: 'h-shelf' }, 'ВЕРТИКАЛЬНЫЕ'),
      shelfBlock(null, vGames, 'web_channel'));
  }
  if (hGames.length) {
    app.append(
      el('h3', { class: 'h-shelf' }, 'ГОРИЗОНТАЛЬНЫЕ'),
      el('div', { class: 'ggrid' }, hGames.map((g) => gameCardH(g, 'web_channel'))));
  }
}
