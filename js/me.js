// Личный кабинет (ArcadeBox): герой профиля, редактор канала (с градиентом),
// сохранённые игры, мои игры, история игр с пагинацией.
import { sb, getMe, fmt, fmtDate, tgWidgetLink } from './sb.js';
import {
  el, initShell, showLoginModal, avatar, channelHref, gameHref,
  gameCardH, safeColor, safeGradient, loadingEl, emptyEl,
} from './ui.js';

const app = document.getElementById('app');
initShell('profile'); // без await — авторизация топбара не блокирует рендер страницы
init();

// Пресеты градиента профиля (колонка users.gradient доступна на запись).
const GRADS = [
  'linear-gradient(135deg,#FF5A1F,#FF9A3D)',
  'linear-gradient(135deg,#7C5CFF,#B07CFF)',
  'linear-gradient(135deg,#2BE4A6,#0E7A5A)',
  'linear-gradient(135deg,#4FC3FF,#1B4DFF)',
  'linear-gradient(135deg,#FF3B6B,#FF7AB8)',
  'linear-gradient(135deg,#FFB020,#FF5A1F)',
  'linear-gradient(135deg,#37E0B8,#5B8CFF)',
  'linear-gradient(135deg,#141416,#3A3A44)',
];

const GAME_COLS = 'id,title,thumbnail_url,bg,accent,emoji,genre,setting,display_orientation,status';

async function init() {
  app.replaceChildren(loadingEl());
  const me = await getMe();
  if (!me) {
    app.replaceChildren(el('div', {
      class: 'panel',
      style: { margin: '40px auto 0', maxWidth: '420px', textAlign: 'center' },
    },
      el('div', { class: 'modal-emoji' }, '🦈'),
      el('p', { style: { color: 'var(--text2)', margin: '12px 0 20px', fontSize: '13.5px' } },
        'Войдите, чтобы увидеть свой профиль'),
      el('button', { class: 'btn-login', onclick: showLoginModal }, 'Войти')));
    return;
  }
  app.replaceChildren();
  let editorPanel;
  const hero = renderHero(me, () => editorPanel.classList.toggle('hidden'));
  editorPanel = renderEditor(me, hero);
  app.append(hero, editorPanel);
  // Секции стартуют параллельно: каждая синхронно вставляет свою панель со скелетоном.
  renderAccount();
  renderSaved(me);
  renderFollows(me);
  renderMyGames(me);
  renderHistory();
}

/* ── Герой профиля ── */

function renderHero(me, onEdit) {
  const av = avatar(me, 64);
  const h1 = el('h1', {}, me.display_name || me.username);
  const hero = el('section', { class: 'me-hero' },
    av,
    el('div', {},
      h1,
      el('div', { class: 'me-sub' }, '@' + (me.username || ''))),
    el('div', { style: { marginLeft: 'auto', display: 'flex', gap: '9px', flexWrap: 'wrap' } },
      el('a', { class: 'btn', href: channelHref(me.username) }, 'Мой канал'),
      el('button', { class: 'btn', onclick: onEdit }, 'Редактировать')));
  hero._nameEl = h1;
  hero._avatarEl = av;
  return hero;
}

/* ── Редактор профиля (скрыт по умолчанию) ── */

function renderEditor(me, hero) {
  let draftGradient = (typeof me.gradient === 'string' && me.gradient) ? me.gradient : GRADS[0];

  const nameIn = el('input', { value: me.display_name || '', maxlength: 60 });
  const emojiIn = el('input', { value: me.avatar_emoji || '🎮', maxlength: 4, style: { width: '90px' } });
  const bioIn = el('textarea', { maxlength: 200, rows: 3 });
  bioIn.value = me.bio || '';
  const bannerIn = el('input', {
    type: 'url', value: me.banner_url || '',
    placeholder: 'https://… (картинка-баннер канала)',
  });

  // Живой предпросмотр баннера: URL, а без него — черновой градиент.
  const preview = el('div', { class: 'ch-banner', style: { height: '120px', marginTop: '0', marginBottom: '8px' } });
  function updPreview() {
    const url = bannerIn.value.trim();
    if (/^https?:\/\//i.test(url)) {
      preview.style.background = 'none';
      preview.style.backgroundImage = `url("${url.replace(/["\\]/g, (c) => encodeURIComponent(c))}")`;
      preview.style.backgroundSize = 'cover';
      preview.style.backgroundPosition = 'center';
    } else {
      preview.style.backgroundImage = 'none';
      preview.style.background = safeGradient(draftGradient);
    }
  }
  bannerIn.addEventListener('input', updPreview);

  const pick = el('div', { class: 'grad-pick' },
    GRADS.map((g) => {
      const b = el('button', { type: 'button', 'aria-label': 'Градиент профиля', style: { background: g } });
      if (g === draftGradient) b.classList.add('on');
      b.addEventListener('click', () => {
        draftGradient = g;
        for (const x of pick.children) x.classList.toggle('on', x === b);
        updPreview();
      });
      return b;
    }));

  const status = el('span', { style: { color: 'var(--text2)', marginLeft: '12px', fontSize: '13px' } });
  const saveBtn = el('button', {
    class: 'btn btn-primary',
    onclick: async () => {
      status.textContent = 'Сохраняю…';
      const patch = {
        display_name: nameIn.value.trim() || me.username,
        avatar_emoji: emojiIn.value.trim() || '🎮',
        bio: bioIn.value.trim(),
        banner_url: bannerIn.value.trim() || null,
        gradient: draftGradient,
      };
      const { error } = await sb.from('users').update(patch).eq('id', me.id);
      if (error) { status.textContent = 'Ошибка: ' + error.message; return; }
      status.textContent = 'Сохранено ✓';
      setTimeout(() => { status.textContent = ''; }, 2500);
      Object.assign(me, patch);
      hero._nameEl.textContent = me.display_name;
      const fresh = avatar(me, 64);
      hero._avatarEl.replaceWith(fresh);
      hero._avatarEl = fresh;
    },
  }, 'Сохранить');

  const panel = el('section', { class: 'panel hidden', id: 'editor' },
    el('h2', {}, 'Редактирование профиля'),
    el('div', { class: 'form-row' }, el('label', {}, 'Название канала'), nameIn),
    el('div', { class: 'form-row' }, el('label', {}, 'Эмодзи-аватар'), emojiIn),
    el('div', { class: 'form-row' }, el('label', {}, 'Описание'), bioIn),
    el('div', { class: 'form-row' }, el('label', {}, 'Баннер (URL картинки)'), preview, bannerIn),
    el('div', { class: 'form-row' }, el('label', {}, 'Градиент профиля'), pick),
    el('div', { style: { marginTop: '6px' } }, saveBtn, status));
  updPreview();
  return panel;
}

/* ── Аккаунт: способ входа + привязка Telegram (К2) ── */

async function renderAccount() {
  const section = el('section', { class: 'panel' },
    el('h2', {}, 'АККАУНТ'), loadingEl());
  app.append(section);

  const [{ data: { session } }, meResp] = await Promise.all([
    sb.auth.getSession(),
    sb.rpc('web_me'),
  ]);
  section.querySelector('.loading').remove();
  if (meResp.error || !meResp.data) {
    console.error('web_me:', meResp.error && meResp.error.message);
    section.append(emptyEl('Не удалось загрузить данные аккаунта'));
    return;
  }
  const email = session?.user?.email || '';
  const isTgEmail = /@sharky\.telegram$/i.test(email);
  const rows = el('div', {});
  section.append(rows);

  const line = (label, value) => el('div', { class: 'hist-item' },
    el('div', { class: 'hist-info' },
      el('div', { class: 'hist-title' }, label),
      el('div', { class: 'hist-meta' }, value)));

  rows.append(line('Вход', isTgEmail ? 'через Telegram' : email || '—'));

  function renderTgRow(hasTg) {
    const existing = rows.querySelector('[data-tg-row]');
    if (existing) existing.remove();
    const row = el('div', { class: 'hist-item', 'data-tg-row': '1' },
      el('div', { class: 'hist-info' },
        el('div', { class: 'hist-title' }, 'Telegram'),
        el('div', { class: 'hist-meta' }, hasTg
          ? 'привязан — лайки и история общие с мини-аппом'
          : 'не привязан')));
    if (!hasTg && !isTgEmail) {
      const status = el('span', { class: 'hist-meta', style: { marginLeft: '10px' } });
      const btn = el('button', {
        class: 'btn', style: { marginLeft: 'auto' },
        onclick: async () => {
          btn.disabled = true;
          status.textContent = 'Подтвердите в Telegram…';
          try {
            await tgWidgetLink();
            renderTgRow(true);
          } catch (err) {
            console.error('tgWidgetLink:', err);
            btn.disabled = false;
            status.textContent = err.message === 'conflict'
              ? 'Этот Telegram уже привязан к другому аккаунту'
              : 'Не получилось. Попробуйте ещё раз';
          }
        },
      }, 'Привязать Telegram');
      row.append(btn, status);
    } else if (hasTg) {
      row.append(el('span', { style: { marginLeft: 'auto', color: 'var(--ab)', fontFamily: 'var(--mono)', fontSize: '12px' } }, '✓'));
    }
    rows.append(row);
  }
  renderTgRow(!!meResp.data.has_telegram);
}

/* ── Подписки: каналы + новое от ваших авторов (К2) ── */

async function renderFollows(me) {
  const section = el('section', { class: 'panel' },
    el('h2', {}, 'ПОДПИСКИ'), loadingEl());
  app.append(section);
  const [flResp, feedResp] = await Promise.all([
    sb.rpc('web_my_follows'),
    sb.rpc('web_follow_feed', { p_limit: 12, p_offset: 0 }),
  ]);
  section.querySelector('.loading').remove();
  if (flResp.error) {
    console.error('web_my_follows:', flResp.error.message);
    section.append(emptyEl('Не удалось загрузить подписки'));
    return;
  }
  const follows = flResp.data || [];
  if (!follows.length) {
    section.append(emptyEl('Вы пока ни на кого не подписаны. Кнопка «Подписаться» — на странице любой игры.'));
    return;
  }
  const list = el('div', {});
  for (const f of follows) {
    const row = el('div', { class: 'hist-item' });
    const avLink = el('a', { href: channelHref(f.username) });
    avLink.append(avatar(f, 44));
    row.append(
      avLink,
      el('div', { class: 'hist-info' },
        el('a', { class: 'hist-title', href: channelHref(f.username) }, f.display_name || f.username),
        el('div', { class: 'hist-meta' }, `${fmt(f.games_count)} игр · с ${fmtDate(f.followed_at)}`)),
      el('button', {
        class: 'btn btn-ghost', style: { marginLeft: 'auto' },
        onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          const { error } = await sb.from('follows')
            .delete().match({ follower_id: me.id, followee_username: f.username });
          if (error) { btn.disabled = false; return; }
          row.remove();
        },
      }, 'Отписаться'));
    list.append(row);
  }
  section.append(list);

  // Свежие игры каналов из подписок — retention-петля «новое от ваших авторов».
  const feed = (!feedResp.error && feedResp.data) || [];
  if (feed.length) {
    section.append(
      el('h2', { style: { marginTop: '22px' } }, 'НОВОЕ ОТ ВАШИХ АВТОРОВ'),
      el('div', { class: 'ggrid', style: { marginTop: '4px' } },
        feed.map((g) => gameCardH(g, 'web_follows'))));
  }
}

/* ── Миниатюра строки (сохранённые + история) ── */

function histThumb(g, from) {
  const t = el('a', { class: 'hist-thumb', href: gameHref(g.id, from) });
  if (g.thumbnail_url) {
    t.append(el('img', { src: g.thumbnail_url, alt: '', loading: 'lazy' }));
  } else {
    t.style.background =
      `linear-gradient(65deg, ${safeColor(g.bg) || '#15121c'} 0%, ${safeColor(g.accent) || '#3a2b4d'} 150%)`;
    t.append(g.emoji || '🎮');
  }
  return t;
}

/* ── Сохранённые ── */

async function renderSaved(me) {
  const section = el('section', { class: 'panel', id: 'saved' },
    el('h2', {}, 'СОХРАНЁННЫЕ'), loadingEl());
  section.style.scrollMarginTop = '74px'; // не прятать заголовок под липкий топбар
  app.append(section);
  const rows = await loadSaves(me);
  section.querySelector('.loading').remove();
  if (rows === null) section.append(emptyEl('Не удалось загрузить сохранённые'));
  else if (!rows.length) section.append(emptyEl('Пока ничего не сохранено — жмите ⭐ на странице игры'));
  else section.append(el('div', {}, rows.map((r) => savedRow(me, r))));
  if (location.hash === '#saved') section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadSaves(me) {
  const { data, error } = await sb.from('saves')
    .select(`created_at, game_id, games(${GAME_COLS})`)
    .eq('user_id', me.id)
    .order('created_at', { ascending: false });
  if (!error) {
    return (data || [])
      .map((r) => ({ created_at: r.created_at, game: Array.isArray(r.games) ? r.games[0] : r.games }))
      .filter((r) => r.game);
  }
  // Фолбэк при несовпадении имени FK-связи: два запроса вместо embed.
  const s1 = await sb.from('saves').select('created_at, game_id')
    .eq('user_id', me.id).order('created_at', { ascending: false });
  if (s1.error) return null;
  const ids = [...new Set((s1.data || []).map((r) => r.game_id))];
  if (!ids.length) return [];
  const s2 = await sb.from('games').select(GAME_COLS).in('id', ids);
  if (s2.error) return null;
  const byId = new Map((s2.data || []).map((g) => [g.id, g]));
  return (s1.data || [])
    .map((r) => ({ created_at: r.created_at, game: byId.get(r.game_id) }))
    .filter((r) => r.game);
}

function savedRow(me, r) {
  const g = r.game;
  const row = el('div', { class: 'hist-item' },
    histThumb(g, 'web_saves'),
    el('div', { class: 'hist-info' },
      el('a', { class: 'hist-title', href: gameHref(g.id, 'web_saves') }, g.title || ''),
      el('div', { class: 'hist-meta' }, 'сохранено ' + fmtDate(r.created_at))),
    el('button', {
      class: 'btn btn-ghost', style: { marginLeft: 'auto' },
      onclick: async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        const { error } = await sb.from('saves').delete().match({ user_id: me.id, game_id: g.id });
        if (error) { btn.disabled = false; return; }
        row.remove();
      },
    }, 'Убрать'));
  return row;
}

/* ── Мои игры ── */

async function renderMyGames(me) {
  const section = el('section', { class: 'panel' },
    el('h2', {}, 'МОИ ИГРЫ'), loadingEl());
  app.append(section);
  const { data, error } = await sb.rpc('web_channel', { p_username: me.username });
  section.querySelector('.loading').remove();
  if (error) { section.append(emptyEl('Не удалось загрузить игры')); return; }
  const games = (data && data.games) || [];
  if (!games.length) {
    section.append(emptyEl('У вас пока нет опубликованных игр. Загрузка игр появится здесь в следующем обновлении.'));
    return;
  }
  section.append(el('div', { class: 'ggrid', style: { marginTop: '4px' } },
    games.map((g) => gameCardH(g, 'web_channel'))));
}

/* ── История игр ── */

async function renderHistory() {
  const LIMIT = 30;
  const section = el('section', { class: 'panel' },
    el('h2', {}, 'ИСТОРИЯ ИГР'), loadingEl());
  app.append(section);
  const list = el('div', {});
  const foot = el('div', {});
  let offset = 0;

  async function loadPage() {
    const { data, error } = await sb.rpc('web_play_history', { p_limit: LIMIT, p_offset: offset });
    return error ? null : (data || []);
  }
  function appendPage(rows) {
    offset += rows.length;
    for (const r of rows) list.append(histRow(r));
    foot.replaceChildren();
    if (rows.length === LIMIT) {
      foot.append(el('button', {
        class: 'btn', style: { marginTop: '14px' },
        onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          const more = await loadPage();
          if (more === null) { btn.disabled = false; return; }
          appendPage(more);
        },
      }, 'Показать ещё'));
    }
  }

  const first = await loadPage();
  section.querySelector('.loading').remove();
  if (first === null) { section.append(emptyEl('Не удалось загрузить историю')); return; }
  if (!first.length) {
    section.append(emptyEl('Вы ещё не играли на сайте. Откройте любую игру с главной!'));
    return;
  }
  section.append(list, foot);
  appendPage(first);
}

function histRow(r) {
  const g = r.game;
  const mins = Math.round((r.total_ms || 0) / 60000);
  const author = (g.author && (g.author.display_name || g.author.username)) || '';
  return el('div', { class: 'hist-item' },
    histThumb(g, 'web_history'),
    el('div', { class: 'hist-info' },
      el('a', { class: 'hist-title', href: gameHref(g.id, 'web_history') }, g.title || ''),
      el('div', { class: 'hist-meta' },
        `${author} · ${fmtDate(r.last_played)} · сессий: ${fmt(r.sessions)}${mins ? ` · ~${mins} мин` : ''}`)));
}
