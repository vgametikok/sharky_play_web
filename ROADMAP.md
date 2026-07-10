# Sharky Web — ROADMAP (MVP)

«YouTube-версия» Sharky: десктопный сайт-каталог HTML-игр поверх той же базы, что и мобильная свайп-лента.

- **Сайт (десктоп, `sharky_web`)** = «главная YouTube»: каталог, поиск, каналы, страница игры. Горизонтальные и вертикальные игры вперемешку.
- **Мобильный Sharky (`sharky_play`, TG mini-app)** = «Shorts»: вертикальная свайп-лента. Уже работает, **не трогаем** в этом MVP.
- **Один Supabase, один аккаунт, одна база** на обе поверхности.

---

## 1. Ключевые архитектурные решения

| Вопрос | Решение | Почему |
|---|---|---|
| Supabase | **Тот же проект** `safjqsofdrxdmvnfgvjf` | «База распространяется на сайт» = те же таблицы. Второй проект форкнул бы `auth.users` и `public.users` → «один аккаунт везде» стало бы невозможно. |
| GitHub | **Отдельный репо** `sharky_web` + свой GitHub Pages | Сайт — многостраничный десктоп; не пухнет одностраничный TG mini-app. Оба смотрят в один Supabase (тот же URL + anon key). |
| Файлы игр | **Один источник** — остаются в `sharky_play`/Pages; `games.src` = абсолютный URL | Не дублируем `.html`. Sandbox-iframe кросс-доменно работает. |
| Sandbox | `sandbox="allow-scripts"` **без** `allow-same-origin` (как на мобиле) | Игра не должна вылезать из песочницы. postMessage работает и так. |
| Источник каталога | Сайт читает игры из таблицы `games`. Мобилка пока на `manifest.json` | Не трогаем работающую ленту; миграцию мобилы на БД — отдельным шагом позже. |
| Рубрикатор | Существующие оси `games.genre` / `setting` / `difficulty`. Основные чипы = `genre` | Таксономия уже в БД, новую не заводим. |

---

## 2. Аккаунт и аутентификация

- **Регистрация/вход на сайте — Google OAuth** (Supabase Auth). Первый вход провижнит строку `public.users` (`auth_uid` = auth.users.id, `telegram_id` = NULL, генерируем уникальный `username`, дефолтные `gradient`/`avatar_emoji`, `role='user'`).
- **`public.users` уже имеет обе колонки** `telegram_id` и `auth_uid` → одна строка = один человек на обеих поверхностях.
- **Привязка Telegram** (из личного кабинета): «Привязать Telegram» → HMAC-флоу `tg-auth` → `telegram_id` прикрепляется к **текущей** веб-строке (а не создаётся вторая). Требует правки `tg-auth`: если пришёл link-контекст залогиненного веб-юзера — merge в существующую строку, иначе как сейчас (create-by-telegram_id).
  - MVP-ограничение: привязка разрешена, только если этот `telegram_id` ещё не занят другой активной строкой. Полное **слияние двух уже существующих аккаунтов** (склейка историй лайков/подписок/статистики) — поздняя фича, не в MVP.
- **Гость-режим**: сайт открыт на чтение без входа. Действия (лайк/дизлайк/подписка/коммент/избранное/своя игра) требуют логина.
- **Аналитика**: `app_opens.platform='web'` при заходе; добавить бакет `web` в дашборд (`admin.html`, `platform_group`).

---

## 3. Изменения в базе

### Что переиспользуем как есть
`users`, `games` (title, description, thumbnail_url, genre/setting/difficulty, status, author_id→username), `follows` (=подписки на канал), `likes`, `saves` (=избранное), `comments` (+ `parent_id` ветки, `like_count`), `comment_likes`, `shares`, `game_stats` (active_ms, feed_source, feed_position), `app_opens`.

### Новое (миграции через Supabase MCP)
1. `ALTER TABLE games ADD COLUMN orientation text NOT NULL DEFAULT 'portrait' CHECK (orientation IN ('portrait','landscape'));`
2. `ALTER TABLE users ADD COLUMN banner_url text;`  (+ опц. `channel_accent text`)
3. `CREATE TABLE dislikes (user_id uuid, game_id text, created_at timestamptz DEFAULT now(), PRIMARY KEY (user_id, game_id));` — RLS-политики зеркалят `likes` (write только владельцу через `app_uid()`, self-select).
4. **Сидинг игр**: залить 12 игр из `sharky_play/games/manifest.json` в таблицу `games` (сейчас там 1 строка): `id, title, author_id (username), src`=абсолютный URL, `thumbnail_url`, `genre`, `orientation='portrait'`, `status='published'`, `accent/bg/emoji/score_label`.
5. Опц. хранилище под баннеры/обложки — Supabase Storage (bucket `channel-banners`, `thumbnails`).

### Web-read RPC (SECURITY DEFINER, guarded — паттерн `admin_*`)
Возвращают готовые payload'ы страниц, чтобы не раскрывать сырые таблицы и не собирать счётчики на клиенте:
- `web_home(p_orientation text default 'mix', p_limit int default 24)` → карточки (id, title, thumbnail, канал[username/display_name/avatar/gradient], genre, orientation, счётчики). Случайный порядок.
- `web_search(p_q text, p_genre text default null, p_orientation text default 'mix', p_limit int, p_offset int)` → ilike по title/description + фильтры.
- `web_channel(p_username text)` → шапка (display_name, avatar, gradient, banner_url, bio, `subscriber_count`, `active_players_28d`) + список игр канала.
- `web_game(p_game_id text)` → игра (title, description, src, orientation, accent, bg) + канал + счётчики (likes, dislikes, saves, comments, subscribers) + `my_state` (liked/disliked/saved/subscribed) для залогиненного.
- `web_play_history(p_limit int, p_offset int)` → из `game_stats` ∪ `games`, уникальные по игре, последняя игра сверху.
- `channel_active_players(p_username text)` → distinct `game_stats.user_id` за 28 дней по играм канала. **Активный игрок = сыграл ≥1 раз за 28 дней.**

Записи (like/dislike/save/comment/follow) идут обычным RLS INSERT/DELETE через `app_uid()` — существующий паттерн.
Плюс публичная SELECT-политика на `games WHERE status='published'` для простых листингов.

---

## 4. Страницы сайта

Топбар везде: лого · поиск · «Создать» · аватар (меню профиля). Тёмная тема (как YT).

### 4.1 Главная
Сетка карточек игр (обложка + тайтл + канал + плейс/просмотры). Чипы-фильтр: **`[Смесь] [Вертикальные] [Горизонтальные]`**, смесь по умолчанию. Порядок случайный (`web_home`, `feed_source='web_home'`). Клик по карточке/тайтлу → страница игры.

### 4.2 Поиск + каталог
Строка поиска + чипы `genre` + сетка результатов (`web_search`).

### 4.3 Страница канала (у каждого аккаунта по умолчанию)
- Шапка: `banner_url`, название канала (`display_name`), подписчики (`follows`), **активные игроки за 28 дней** (`channel_active_players`).
- Ниже — одна случайная игра канала: слева обложка/баннер, справа заголовок + описание (портрет или ландшафт).
- Ниже — список всех игр канала с теми же чипами-рубрикатором, что на главной.

### 4.4 Страница игры («watch», как на референсе-скриншоте)
Клик по обложке/названию из любого места сайта открывает эту страницу:
- **Плеер сверху** (sandbox-iframe): портретная игра — в центрированной рамке (пилларбокс, как Shorts на десктопе), ландшафт — на всю ширину плеера. Протокол postMessage + дуэлл-трекинг портируем из `engine.js` (`feed_source='web_game'`).
- **Тайтл** под плеером.
- **Строка канала**: аватар + название + `подписаться` · `лайк/дизлайк` · `поделиться` · `избранное`.
- **Описание**: свёрнуто 3 строки + «…ещё».
- **Комментарии** (таблицы уже есть; ветки через `parent_id`, лайки коммента через `comment_likes`).

### 4.5 Личный кабинет (scoped-админка)
- **Мой канал**: правка баннера / названия / описания / аватара; привязать Telegram.
- **Мои игры**: список + правка `title/description/genre/orientation/thumbnail/status` + добавить игру. Паттерны `admin.html`, но scoped по `app_uid()`/username через RLS/RPC.
- **История игр**: в какие игры я играл (`web_play_history`).

---

## 5. Фазы разработки (~2 недели)

### Фаза 0 — Каркас (0.5–1 д)
Репо `sharky_web` + GitHub Pages. Supabase JS (тот же проект). Включить Google OAuth + redirect на домен Pages. Общий слой: supabase-client, роутинг, топбар, тёмная тема.

### Фаза 1 — Данные (0.5–1 д)
Миграции: `games.orientation`, `users.banner_url`, таблица `dislikes` (+RLS). Сидинг 12 игр в `games`. Все web-read RPC + `channel_active_players`.

### Фаза 2 — Логин и профиль (1 д)
Google-вход → провижн `users`. `app_opens.platform='web'` + веб-бакет в дашборде. Гость-режим. Привязка Telegram (правка `tg-auth` под merge).

### Фаза 3 — Читаемые страницы (2–3 д)
Главная (сетка + чипы ориентации). Поиск+каталог. Канал (шапка + активные игроки + случайная игра + список). Общие компоненты: карточка игры, чипы, сетка.

### Фаза 4 — Страница игры / watch (2–3 д)
Плеер (портрет/ландшафт) + дуэлл-трекинг. Строка канала (подписка). Лайк/дизлайк/поделиться/избранное. Описание 3 строки + «…ещё». Комментарии (+ветки).

### Фаза 5 — Личный кабинет (2 д)
Мой канал (правка). Мои игры (CRUD, scoped). История игр.

### Фаза 6 — Шлифовка (1–2 д)
Дип-линки и share-URL на игру/канал, OG-мета. Веб-бакет в аналитике. QA десктоп + мобильный веб, адаптив.

---

## 6. Позже (после MVP)
- Полное **слияние** двух ранее существовавших аккаунтов (TG + Google).
- Миграция **мобильной ленты** с `manifest.json` на таблицу `games` (единый источник).
- **Горизонтальный контент**: новые landscape-игры (в MVP каталог в основном портретный + пилларбокс на watch).
- **Рекомендации на вебе** (recsys слой 3): `FEED_SOURCE='reco_v1'` вместо random на главной.
- Уведомления о подписках, счётчики-кэши для лайков/дизлайков на масштабе.

---

## 7. Критерии приёмки MVP
- [ ] Вход через Google создаёт/находит строку `users`; можно привязать Telegram к этой же строке.
- [ ] Главная показывает игры из БД; чипы Смесь/Вертикальные/Горизонтальные фильтруют по `orientation`.
- [ ] Поиск находит игры по названию/описанию + фильтр `genre`.
- [ ] У каждого аккаунта есть страница канала с шапкой, подписчиками и активными игроками (28д).
- [ ] Страница игры: играется в песочнице, лайк/дизлайк/подписка/избранное/поделиться/комментарии работают и пишутся в общий Supabase.
- [ ] Дуэлл-время игр с сайта пишется в `game_stats` (`feed_source` с web-префиксом).
- [ ] Личный кабинет: правка своего канала и своих игр (scoped), история сыгранного.
- [ ] Тот же аккаунт виден и на сайте, и в мобильной ленте (общие подписки/лайки).
