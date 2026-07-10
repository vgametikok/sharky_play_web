// Страница канала: баннер, шапка, подписка, случайная игра, список игр.
import { sb, fmt } from './sb.js';
import { GENRE_LABEL } from './config.js';
import { el, initTopbar, avatar, gameCard, gameHref, chipBar, requireLogin, loadingEl, emptyEl, safeColor } from './ui.js';

const app = document.getElementById('app');
const username = new URLSearchParams(location.search).get('u') || '';
let genreFilter = null;

initTopbar();
load();

async function load() {
  app.replaceChildren(loadingEl());
  const { data, error } = await sb.rpc('web_channel', { p_username: username });
  if (error || !data) {
    console.error('web_channel:', error && error.message);
    app.replaceChildren(emptyEl('Канал не найден'));
    return;
  }
  render(data.channel, data.games || []);
}

function render(ch, games) {
  document.title = `${ch.display_name} — Sharky`;
  app.replaceChildren();

  // Баннер
  const banner = el('div', { class: 'ch-banner' });
  if (ch.banner_url) banner.append(el('img', { src: ch.banner_url, alt: '' }));
  else banner.style.background = ch.gradient && /^linear-gradient\([^;{}<>]*\)$/.test(ch.gradient)
    ? ch.gradient : 'linear-gradient(135deg,#7b5cff,#ff3c5f)';
  app.append(banner);

  // Шапка
  const subBtn = el('button', { class: 'btn btn-sub' + (ch.subscribed ? ' on' : '') },
    ch.subscribed ? 'Вы подписаны' : 'Подписаться');
  const statsEl = el('div', { class: 'ch-stats' });
  const renderStats = () => {
    statsEl.textContent =
      `@${ch.username} · ${fmt(ch.subscribers)} подписчиков · ${fmt(ch.active_players_28d)} активных игроков за 28 дней`;
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
    avatar(ch, 80),
    el('div', { style: { flex: '1', minWidth: '220px' } },
      el('h1', {}, ch.display_name || ch.username),
      statsEl,
      ch.bio ? el('div', { class: 'ch-bio' }, ch.bio) : null),
    subBtn));

  // Случайная игра канала
  if (games.length) {
    const g = games[Math.floor(Math.random() * games.length)];
    const thumb = el('a', { class: 'thumb', href: gameHref(g.id) });
    if (g.thumbnail_url) thumb.append(el('img', { src: g.thumbnail_url, alt: '' }));
    else {
      thumb.style.background =
        `linear-gradient(135deg, ${safeColor(g.bg) || '#15121c'}, ${safeColor(g.accent) || '#3a2b4d'})`;
      thumb.append(el('div', { class: 'thumb-emoji' }, g.emoji || '🎮'));
    }
    app.append(el('div', { class: 'featured' },
      thumb,
      el('div', { class: 'featured-info' },
        el('h2', {}, el('a', { href: gameHref(g.id) }, g.title)),
        el('div', { class: 'card-meta', style: { marginBottom: '8px' } },
          `${GENRE_LABEL[g.genre] || g.genre} · ${fmt(g.plays)} играли · ${fmt(g.likes)} лайков`),
        el('p', {}, g.description || 'Без описания — просто откройте и играйте!'),
        el('div', { style: { marginTop: '12px' } },
          el('a', { class: 'btn btn-primary', href: gameHref(g.id) }, '▶ Играть')))));
  }

  // Список игр с рубрикатором
  app.append(el('div', { class: 'section-title' }, `Игры (${games.length})`));
  const chipsHost = el('div');
  const grid = el('div', { class: 'grid' });
  app.append(chipsHost, grid);

  const genres = [...new Set(games.map((g) => g.genre).filter(Boolean))];
  const renderGrid = () => {
    const list = genreFilter ? games.filter((g) => g.genre === genreFilter) : games;
    grid.replaceChildren(...(list.length ? list.map(gameCard) : [emptyEl('Нет игр в этом жанре')]));
  };
  const renderChips = () => {
    if (genres.length < 2) return;
    chipsHost.replaceChildren(chipBar(
      [[null, 'Все'], ...genres.map((g) => [g, GENRE_LABEL[g] || g])],
      genreFilter,
      (v) => { genreFilter = v; renderChips(); renderGrid(); },
    ));
  };
  renderChips();
  renderGrid();
}
