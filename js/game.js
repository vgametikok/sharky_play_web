// Страница игры («watch»): плеер, канал, лайк/дизлайк/избранное/поделиться,
// описание, комментарии, учёт игрового времени в game_stats.
import { sb, getMe, fmt, fmtDate } from './sb.js';
import { SUPABASE_URL, SUPABASE_ANON, GENRE_LABEL, SAVES_FN, SAVES_ANON } from './config.js';
import { el, initTopbar, avatar, channelHref, resolveGameSrc, isStorageGame, requireLogin, loadingEl, emptyEl } from './ui.js';

const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const gameId = params.get('id') || '';

// Провенанс показа: какая секция сайта привела к запуску (для recsys/A/B).
// Белый список — произвольные значения из URL в БД не попадают.
const FEED_SOURCES = {
  feed: 'web_feed', popular: 'web_popular', fresh: 'web_fresh',
  continue: 'web_continue', search: 'web_search', channel: 'web_channel',
};
const FEED_SOURCE = FEED_SOURCES[params.get('from')] || 'web_game';

initTopbar();
load();

let D = null; // payload web_game
let iframe = null;

async function load() {
  app.replaceChildren(loadingEl());
  const { data, error } = await sb.rpc('web_game', { p_game_id: gameId });
  if (error || !data) {
    console.error('web_game:', error && error.message);
    app.replaceChildren(emptyEl('Игра не найдена'));
    return;
  }
  D = data;
  render();
  startDwellTracking();
}

/* ── Рендер ── */

function render() {
  const g = D.game, a = D.author;
  document.title = `${g.title} — Sharky`;
  app.replaceChildren();

  // Плеер: sandbox БЕЗ allow-same-origin — игра не может выйти из песочницы.
  // github.io-игры — прямой src (отдельный origin, CSP не наследуется).
  // Storage-игры — fetch + srcdoc (Storage отдаёт .html как text/plain);
  // srcdoc наследует CSP этой страницы, поэтому game.html разрешает
  // 'unsafe-inline' в script-src (инлайн-скрипты самих игр).
  const src0 = resolveGameSrc(g.src);
  // Cache-busting по версии игры (games.version из web_game): после обновления
  // игроки получают свежий файл, а не закешированный HTTP-кешем старый.
  const src = src0 ? src0 + (src0.includes('?') ? '&' : '?') + 'v=' + (g.version || 1) : src0;
  const player = el('div', { class: 'player ' + (g.orientation === 'landscape' ? 'landscape' : 'portrait') });
  if (src) {
    iframe = el('iframe', { sandbox: 'allow-scripts', allow: 'autoplay', title: g.title });
    player.append(iframe);
    window.addEventListener('message', onGameMessage);
    if (isStorageGame(src)) {
      fetch(src)
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then((html) => { iframe.srcdoc = html; })
        .catch((err) => {
          console.error('game load:', err);
          player.replaceChildren(emptyEl('Не удалось загрузить игру. Обновите страницу.'));
        });
    } else {
      iframe.src = src;
    }
  } else {
    player.append(emptyEl('Источник игры не разрешён'));
  }
  // Кнопка «на весь экран» — для горизонтальных игр (десктоп).
  if (src && g.orientation === 'landscape') addFullscreenButton(player);
  app.append(player);

  // Тайтл + счёт из игры
  const scoreEl = el('span', { class: 'g-score', id: 'gScore' });
  app.append(el('div', { class: 'g-title' }, g.title, ' ', scoreEl));

  // Строка канала + действия
  const avLink = el('a', { href: channelHref(a.username) });
  avLink.append(avatar(a, 44));
  const subBtn = el('button', { class: 'btn btn-sub', onclick: toggleSubscribe });
  const actions = el('div', { class: 'g-actions', id: 'gActions' });
  app.append(el('div', { class: 'g-row' },
    el('div', { class: 'g-channel' },
      avLink,
      el('div', {},
        el('a', { class: 'name', href: channelHref(a.username) }, a.display_name || a.username),
        el('div', { class: 'subs', id: 'gSubs' })),
      subBtn),
    actions));
  renderChannelState();
  renderActions();

  // Описание: свёрнуто до 3 строк
  const desc = el('div', { class: 'g-desc' },
    el('div', { class: 'meta' },
      `${fmt(D.counts.plays)} играли · ${GENRE_LABEL[g.genre] || g.genre} · ${fmtDate(g.published_at)}`),
    el('div', { class: 'text' }, g.description || 'Без описания.'),
    el('div', { class: 'more' }, '…ещё'));
  desc.addEventListener('click', () => {
    desc.classList.toggle('open');
    desc.querySelector('.more').textContent = desc.classList.contains('open') ? 'Свернуть' : '…ещё';
  });
  app.append(desc);

  // Комментарии
  const comments = el('section', { class: 'comments' },
    el('h2', { id: 'cTitle' }, `${D.counts.comments} комментариев`),
    buildCommentForm(null),
    el('div', { id: 'cList' }));
  app.append(comments);
  renderComments();
}

function renderChannelState() {
  document.getElementById('gSubs').textContent = `${fmt(D.author.subscribers)} подписчиков`;
  const btn = app.querySelector('.btn-sub');
  btn.className = 'btn btn-sub' + (D.my.subscribed ? ' on' : '');
  btn.textContent = D.my.subscribed ? 'Вы подписаны' : 'Подписаться';
}

function renderActions() {
  const c = D.counts, my = D.my;
  const host = document.getElementById('gActions');
  host.replaceChildren(
    // Сегментированная пара лайк/дизлайк (как на YouTube).
    el('div', { class: 'seg' },
      el('button', { class: my.liked ? 'on' : '', onclick: () => toggleMark('liked', 'likes') },
        `👍 ${fmt(c.likes)}`),
      el('button', { class: my.disliked ? 'on' : '', onclick: () => toggleMark('disliked', 'dislikes') },
        `👎 ${fmt(c.dislikes)}`)),
    el('button', { class: 'btn' + (my.saved ? ' on' : ''), onclick: () => toggleMark('saved', 'saves') },
      `⭐ ${fmt(c.saves)}`),
    el('button', { class: 'btn', onclick: doShare }, `↗ Поделиться`),
  );
}

/* ── Действия ── */

const MARK_TABLE = { liked: 'likes', disliked: 'dislikes', saved: 'saves' };
let markBusy = false;

async function toggleMark(flag, countKey) {
  const me = await requireLogin();
  if (!me || markBusy) return;
  markBusy = true;
  try {
    const table = MARK_TABLE[flag];
    if (D.my[flag]) {
      const { error } = await sb.from(table).delete().eq('user_id', me.id).eq('game_id', gameId);
      if (!error) { D.my[flag] = false; D.counts[countKey]--; }
    } else {
      // Лайк и дизлайк взаимоисключающие.
      const opposite = flag === 'liked' ? 'disliked' : flag === 'disliked' ? 'liked' : null;
      if (opposite && D.my[opposite]) {
        const oppTable = MARK_TABLE[opposite];
        const oppCount = opposite === 'liked' ? 'likes' : 'dislikes';
        const { error } = await sb.from(oppTable).delete().eq('user_id', me.id).eq('game_id', gameId);
        if (!error) { D.my[opposite] = false; D.counts[oppCount]--; }
      }
      const { error } = await sb.from(table).insert({ user_id: me.id, game_id: gameId });
      if (!error) { D.my[flag] = true; D.counts[countKey]++; }
    }
  } finally {
    markBusy = false;
    renderActions();
  }
}

async function toggleSubscribe() {
  const me = await requireLogin();
  if (!me || me.username === D.author.username) return;
  if (D.my.subscribed) {
    const { error } = await sb.from('follows').delete()
      .eq('follower_id', me.id).eq('followee_username', D.author.username);
    if (!error) { D.my.subscribed = false; D.author.subscribers--; }
  } else {
    const { error } = await sb.from('follows')
      .insert({ follower_id: me.id, followee_username: D.author.username });
    if (!error) { D.my.subscribed = true; D.author.subscribers++; }
  }
  renderChannelState();
}

async function doShare() {
  const url = location.origin + location.pathname + '?id=' + encodeURIComponent(gameId);
  try {
    if (navigator.share) await navigator.share({ title: D.game.title, url });
    else { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); }
  } catch { return; }
  const me = await getMe();
  if (me) {
    const { error } = await sb.from('shares').insert({ game_id: gameId, user_id: me.id });
    if (!error) { D.counts.shares++; renderActions(); }
  }
}

function toast(text) {
  const t = el('div', { class: 'modal-back', style: { background: 'transparent', pointerEvents: 'none', alignItems: 'flex-end', paddingBottom: '40px' } },
    el('div', { class: 'modal', style: { padding: '12px 24px' } }, text));
  document.body.append(t);
  setTimeout(() => t.remove(), 1800);
}

/* ── Полноэкранный режим ── */

function addFullscreenButton(player) {
  const btn = el('button', { class: 'fs-btn', title: 'На весь экран', 'aria-label': 'На весь экран' }, '⛶');
  btn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else (player.requestFullscreen ? player.requestFullscreen() : Promise.reject()).catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => {
    const on = document.fullscreenElement === player;
    btn.textContent = on ? '🗗' : '⛶';
    btn.title = on ? 'Свернуть' : 'На весь экран';
  });
  player.append(btn);
}

/* ── Сообщения от игры (protocol Sharky) ── */

function onGameMessage(e) {
  if (!iframe || e.source !== iframe.contentWindow) return;
  const d = e.data || {};
  if (d.type === 'ready') {
    iframe.contentWindow.postMessage({ type: 'init', accent: D.game.accent, bg: D.game.bg }, '*');
    iframe.contentWindow.postMessage({ type: 'start' }, '*');
  } else if (d.type === 'score' || d.type === 'gameover') {
    const s = document.getElementById('gScore');
    if (s && typeof d.value === 'number') s.textContent = `· ${d.value} ${D.game.score_label || ''}`;
  } else if (d.type === 'sharky-progress-load') {
    // Игра просит облачный прогресс — читаем из отдельного проекта сейвов.
    saveApi('load')
      .then((r) => postToGame({ type: 'sharky-progress', data: r && r.data ? r.data : null, guest: !!(r && r.guest) }))
      .catch((err) => { console.error('progress load:', err.message); postToGame({ type: 'sharky-progress', data: null }); });
  } else if (d.type === 'sharky-progress-save') {
    if (d.data && typeof d.data === 'object') queueSave(d.data);
  }
}

function postToGame(msg) {
  if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage(msg, '*');
}

/* ── Облачные сейвы (отдельный проект Supabase) ──
   Личность игрока проверяет edge-функция по access-token основного проекта. ── */

let savesToken = null; // кэш токена для keepalive-сейва на закрытии вкладки

async function saveApi(action, data) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return { guest: true }; // гость не сохраняется (нет личности)
  savesToken = session.access_token;
  const res = await fetch(SAVES_FN, {
    method: 'POST',
    headers: { apikey: SAVES_ANON, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ game_id: gameId, action, data }),
  });
  if (!res.ok) throw new Error('saves ' + res.status);
  return res.json();
}

let saveTimer = null;
let pendingSave = null;
function queueSave(data) {
  pendingSave = data;
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    const d = pendingSave; pendingSave = null;
    try { await saveApi('save', d); } catch (err) { console.error('progress save:', err.message); }
  }, 1500);
}

// Не потерять последний сейв при закрытии вкладки.
window.addEventListener('pagehide', () => {
  if (!pendingSave || !savesToken) return;
  const d = pendingSave; pendingSave = null;
  fetch(SAVES_FN, {
    method: 'POST', keepalive: true,
    headers: { apikey: SAVES_ANON, Authorization: 'Bearer ' + savesToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ game_id: gameId, action: 'save', data: d }),
  }).catch(() => {});
});

/* ── Комментарии ── */

function buildCommentForm(parentId, onDone) {
  const ta = el('textarea', { maxlength: 120, placeholder: parentId ? 'Ваш ответ…' : 'Введите комментарий…' });
  const form = el('div', { class: 'c-form' }, ta,
    el('button', {
      class: 'btn btn-primary',
      onclick: async () => {
        const me = await requireLogin();
        if (!me) return;
        const text = ta.value.trim();
        if (!text) return;
        const { error } = await sb.from('comments')
          .insert({ game_id: gameId, user_id: me.id, text, parent_id: parentId });
        if (error) { console.error('comment:', error.message); toast('Не удалось отправить'); return; }
        ta.value = '';
        if (onDone) onDone();
        await refreshComments();
      },
    }, parentId ? 'Ответить' : 'Отправить'));
  return form;
}

async function refreshComments() {
  const { data } = await sb.rpc('web_game', { p_game_id: gameId });
  if (!data) return;
  D.comments = data.comments;
  D.counts.comments = data.counts.comments;
  document.getElementById('cTitle').textContent = `${D.counts.comments} комментариев`;
  renderComments();
}

function renderComments() {
  const host = document.getElementById('cList');
  const list = D.comments || [];
  const roots = list.filter((c) => !c.parent_id);
  const replies = (id) => list.filter((c) => c.parent_id === id);
  host.replaceChildren(...(roots.length
    ? roots.map((c) => commentEl(c, replies(c.id)))
    : [emptyEl('Пока нет комментариев — будьте первым!')]));
}

function commentEl(c, replies = []) {
  const body = el('div', { class: 'c-body' },
    el('div', { class: 'c-head' },
      el('a', { class: 'c-name', href: channelHref(c.user.username) }, c.user.display_name || c.user.username),
      el('span', { class: 'c-date' }, fmtDate(c.created_at) + (c.edited ? ' · изм.' : ''))),
    el('div', { class: 'c-text' }, c.text),
    el('div', { class: 'c-actions' },
      el('button', { class: c.my_like ? 'on' : '', onclick: () => toggleCommentLike(c) },
        `♥ ${c.like_count || ''}`),
      !c.parent_id ? el('button', {
        onclick: (e) => {
          const item = e.target.closest('.c-item');
          if (item.querySelector('.c-form')) { item.querySelector('.c-form').remove(); return; }
          const f = buildCommentForm(c.id, () => f.remove());
          item.querySelector('.c-body').append(f);
        },
      }, 'Ответить') : null,
      c.mine ? el('button', {
        onclick: async () => {
          const { error } = await sb.from('comments').delete().eq('id', c.id);
          if (!error) refreshComments();
        },
      }, 'Удалить') : null));
  const item = el('div', { class: 'c-item' }, avatar(c.user, 36), body);
  if (replies.length) body.append(el('div', { class: 'c-replies' }, replies.map((r) => commentEl(r))));
  return item;
}

async function toggleCommentLike(c) {
  const me = await requireLogin();
  if (!me) return;
  if (c.my_like) {
    const { error } = await sb.from('comment_likes').delete()
      .eq('user_id', me.id).eq('comment_id', c.id);
    if (!error) { c.my_like = false; c.like_count--; }
  } else {
    const { error } = await sb.from('comment_likes')
      .insert({ user_id: me.id, comment_id: c.id });
    if (!error) { c.my_like = true; c.like_count++; }
  }
  renderComments();
}

/* ── Учёт игрового времени (порт схемы из engine.js мобилки):
   INSERT строки при загрузке, UPDATE active_ms каждые 10 c и на уходе. ── */

let statId = null;
let activeMs = 0;
let visibleSince = null;

async function startDwellTracking() {
  const me = await getMe();
  if (!me || !iframe) return; // гостей не учитываем (RLS требует владельца)
  statId = crypto.randomUUID();
  const { error } = await sb.from('game_stats').insert({
    id: statId, game_id: gameId, user_id: me.id,
    active_ms: 0, loaded: true, feed_source: FEED_SOURCE,
  });
  if (error) { console.error('game_stats insert:', error.message); statId = null; return; }
  visibleSince = document.visibilityState === 'visible' ? performance.now() : null;
  setInterval(checkpoint, 10000);
  document.addEventListener('visibilitychange', () => {
    settle();
    if (document.visibilityState === 'hidden') checkpoint(true);
  });
  window.addEventListener('pagehide', () => { settle(); checkpoint(true); });
}

function settle() {
  const now = performance.now();
  if (visibleSince != null) activeMs += now - visibleSince;
  visibleSince = document.visibilityState === 'visible' ? now : null;
}

async function checkpoint(useBeaconStyle = false) {
  if (!statId) return;
  settle();
  const payload = { active_ms: Math.round(activeMs) };
  if (useBeaconStyle) {
    // keepalive-fetch переживает закрытие вкладки.
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    fetch(`${SUPABASE_URL}/rest/v1/game_stats?id=eq.${statId}`, {
      method: 'PATCH', keepalive: true,
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: 'Bearer ' + session.access_token,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } else {
    sb.from('game_stats').update(payload).eq('id', statId).then(() => {}, () => {});
  }
}
