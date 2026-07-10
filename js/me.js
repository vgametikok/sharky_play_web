// Личный кабинет: профиль канала, мои игры, история игр.
import { sb, getMe, login, fmt, fmtDate } from './sb.js';
import { el, initTopbar, gameCard, gameHref, channelHref, safeColor, loadingEl, emptyEl } from './ui.js';

const app = document.getElementById('app');
initTopbar();
init();

async function init() {
  app.replaceChildren(loadingEl());
  const me = await getMe();
  if (!me) {
    app.replaceChildren(el('div', { class: 'panel', style: { textAlign: 'center' } },
      el('div', { class: 'modal-emoji' }, '🦈'),
      el('h2', {}, 'Личный кабинет'),
      el('p', { style: { color: 'var(--text2)', margin: '10px 0 16px' } },
        'Войдите, чтобы управлять своим каналом и видеть историю игр.'),
      el('button', { class: 'btn btn-primary', onclick: login }, 'Войти через Google')));
    return;
  }
  app.replaceChildren();
  renderProfile(me);
  renderMyGames(me);
  renderHistory();
}

/* ── Профиль / настройки канала ── */

function renderProfile(me) {
  const nameIn = el('input', { value: me.display_name || '', maxlength: 60 });
  const emojiIn = el('input', { value: me.avatar_emoji || '🎮', maxlength: 4, style: { width: '80px' } });
  const bioIn = el('textarea', { maxlength: 200, rows: 3 });
  bioIn.value = me.bio || '';
  const bannerIn = el('input', { value: me.banner_url || '', placeholder: 'https://… (картинка-баннер канала)' });
  const status = el('span', { style: { color: 'var(--text2)', marginLeft: '10px', fontSize: '14px' } });

  const saveBtn = el('button', {
    class: 'btn btn-primary',
    onclick: async () => {
      status.textContent = 'Сохраняю…';
      const patch = {
        display_name: nameIn.value.trim() || me.username,
        avatar_emoji: emojiIn.value.trim() || '🎮',
        bio: bioIn.value.trim(),
        banner_url: bannerIn.value.trim() || null,
      };
      const { error } = await sb.from('users').update(patch).eq('id', me.id);
      status.textContent = error ? 'Ошибка: ' + error.message : 'Сохранено ✓';
      if (!error) setTimeout(() => { status.textContent = ''; }, 2500);
    },
  }, 'Сохранить');

  app.append(el('section', { class: 'panel' },
    el('h2', {}, 'Мой канал'),
    el('div', { class: 'form-row' }, el('label', {}, 'Название канала'), nameIn),
    el('div', { class: 'form-row' }, el('label', {}, 'Эмодзи-аватар'), emojiIn),
    el('div', { class: 'form-row' }, el('label', {}, 'Описание'), bioIn),
    el('div', { class: 'form-row' }, el('label', {}, 'Баннер (URL картинки)'), bannerIn),
    el('div', {}, saveBtn, status,
      el('a', { class: 'btn', style: { marginLeft: '10px' }, href: channelHref(me.username) },
        'Открыть мой канал'))));
}

/* ── Мои игры ── */

async function renderMyGames(me) {
  const section = el('section', { class: 'panel' },
    el('h2', {}, 'Мои игры'), loadingEl());
  app.append(section);
  const { data } = await sb.rpc('web_channel', { p_username: me.username });
  section.querySelector('.loading').remove();
  const games = (data && data.games) || [];
  if (!games.length) {
    section.append(el('p', { style: { color: 'var(--text2)' } },
      'У вас пока нет опубликованных игр. Загрузка игр появится здесь в следующем обновлении.'));
    return;
  }
  section.append(el('div', { class: 'grid' }, games.map(gameCard)));
}

/* ── История игр ── */

async function renderHistory() {
  const section = el('section', { class: 'panel' },
    el('h2', {}, 'История игр'), loadingEl());
  app.append(section);
  const { data, error } = await sb.rpc('web_play_history', { p_limit: 30, p_offset: 0 });
  section.querySelector('.loading').remove();
  if (error) { section.append(emptyEl('Не удалось загрузить историю')); return; }
  const rows = data || [];
  if (!rows.length) {
    section.append(el('p', { style: { color: 'var(--text2)' } },
      'Вы ещё не играли на сайте. Откройте любую игру с главной!'));
    return;
  }
  section.append(...rows.map((r) => {
    const g = r.game;
    const thumb = el('a', { class: 'hist-thumb', href: gameHref(g.id) });
    if (g.thumbnail_url) thumb.append(el('img', { src: g.thumbnail_url, alt: '' }));
    else {
      thumb.style.background =
        `linear-gradient(135deg, ${safeColor(g.bg) || '#15121c'}, ${safeColor(g.accent) || '#3a2b4d'})`;
      thumb.append(g.emoji || '🎮');
    }
    const mins = Math.round((r.total_ms || 0) / 60000);
    return el('div', { class: 'hist-item' },
      thumb,
      el('div', { class: 'hist-info' },
        el('a', { class: 'hist-title', href: gameHref(g.id) }, g.title),
        el('div', { class: 'hist-meta' },
          `${g.author.display_name || g.author.username} · последняя игра ${fmtDate(r.last_played)}` +
          ` · сессий: ${fmt(r.sessions)}${mins ? ` · ~${mins} мин` : ''}`)));
  }));
}
