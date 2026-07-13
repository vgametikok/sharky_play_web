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

// Игры с относительным src лежат в репозитории мобильной ленты.
export const GAMES_BASE = 'https://vgametikok.github.io/sharky_play/';

// Белый список источников, откуда разрешено грузить игры в iframe
// (дублирует frame-src в CSP — защита в глубину).
export const ALLOWED_GAME_ORIGINS = [
  'https://vgametikok.github.io',
  SUPABASE_URL,
];

// Отдельный проект Supabase для облачных сейвов прогресса (не основной!):
// личность игрока проверяет edge-функция progress по токену основного проекта.
// Ключ публичный по дизайну — данные защищает RLS + серверная проверка токена.
export const SAVES_FN = 'https://twvagexajheoapzskvjw.supabase.co/functions/v1/progress';
export const SAVES_ANON = 'sb_publishable_z7qy94kQKbXMtvMPVZGziw_cVpfLgDI';

export const GENRES = [
  ['arcade', 'Аркады'],
  ['puzzle', 'Головоломки'],
  ['reaction', 'Реакция'],
  ['memory', 'Память'],
  ['logic', 'Логика'],
  ['other', 'Другое'],
];
export const GENRE_LABEL = Object.fromEntries(GENRES);
