-- После мержа: ничего обновлять в БД НЕ нужно.
-- 38 встроенных игр хранят ОТНОСИТЕЛЬНЫЙ src 'games/<file>.html':
--   * admin.html (превью) резолвит его относительно своей страницы -> /sharky_play_web/games/... (файлы теперь здесь)
--   * сайт (js/ui.js) резолвит через GAMES_BASE в js/config.js (пока старый https://vgametikok.github.io/sharky_play/).
-- Когда https://vgametikok.github.io/sharky_play_web/games/flappy.html открывается -> поменять GAMES_BASE
-- на 'https://vgametikok.github.io/sharky_play_web/' (одна строка кода, отдельный коммит).
-- Проверка (read-only): нет ли абсолютных ссылок на старый репозиторий.
select id, src from public.games where src like '%github.io/sharky_play/%';
select count(*) as relative_builtin from public.games where src like 'games/%';
