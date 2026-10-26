// Публичная конфигурация Sharky Web.
// ВАЖНО: здесь НЕТ секретов. Anon-ключ Supabase — публичный по дизайну:
// все данные защищает RLS на сервере. service_role и прочие секреты
// живут только в edge-функциях и никогда не попадают в код сайта.
export const SUPABASE_URL = 'https://safjqsofdrxdmvnfgvjf.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhZmpxc29mZHJ4ZG12bmZndmpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Nzk2NDgsImV4cCI6MjA5NjQ1NTY0OH0.gcZ452loXUS0fmApZLr7PqvIYYZ8TqxIX2plgLNnoDo';

// Бот для Telegram Login Widget (тот же, что у мини-аппа).
// Для работы виджета у @BotFather должен быть выполнен /setdomain
// на домен сайта: vgametikok.github.io
export const TG_BOT = 'sharkyplay_bot';
// Числовой id бота (часть токена до двоеточия) — обязателен для Telegram.Login.auth.
export const TG_BOT_ID = 8642379598;

// Игры с относительным src лежат в репозитории мобильной ленты.
export const GAMES_BASE = 'https://vgametikok.github.io/sharky_play/';

// Sharky Maker — сервис генерации игр (тот же Supabase → тот же аккаунт).
export const MAKER_URL = 'https://vgametikok.github.io/sharky_ai_game_engine/';

// Белый список источников, откуда разрешено грузить игры в iframe
// (дублирует frame-src в CSP — защита в глубину).
// Многофайловые билды (R2 + Worker sharky-games): отдельный origin, грузятся прямым src.
export const GAMES_CDN = 'https://sharky-games.vgametikok.workers.dev';

export const ALLOWED_GAME_ORIGINS = [
  GAMES_CDN,
  'https://vgametikok.github.io',
  SUPABASE_URL,
];

// Облачные сейвы прогресса — таблица public.game_progress в основном проекте (RLS: user_id = auth.uid()).

export const GENRES = [
  ['arcade', 'Аркады'],
  ['puzzle', 'Головоломки'],
  ['reaction', 'Реакция'],
  ['memory', 'Память'],
  ['logic', 'Логика'],
  ['other', 'Другое'],
];
export const GENRE_LABEL = Object.fromEntries(GENRES);

// Сеттинг игры (games.setting) — вторая часть меты на карточке.
export const SETTING_LABEL = {
  abstract: 'Абстракция', space: 'Космос', nature: 'Природа',
  city: 'Город', retro: 'Ретро', other: 'Мир',
};

// Периоды фильтра публикации (совпадают с p_period в web_feed/web_search_v2).
export const PERIODS = [
  ['week', 'Неделя'], ['month', 'Месяц'], ['year', 'Год'], ['all', 'Всё время'],
];
