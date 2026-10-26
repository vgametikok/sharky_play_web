// Узкий экран / телефон → вертикальная лента (feed.html). Десктоп остаётся в каталоге.
// ?catalog=1 (или выбор, запомненный в localStorage) оставляет каталог и на телефоне.
(function () {
  try {
    var q = new URLSearchParams(location.search);
    if (q.has('catalog')) { localStorage.setItem('sharky_view', 'catalog'); return; }
    if (q.has('feed')) localStorage.removeItem('sharky_view');
    if (localStorage.getItem('sharky_view') === 'catalog') return;
    var narrow = window.matchMedia('(max-width: 720px)').matches;
    var coarse = window.matchMedia('(pointer: coarse)').matches;
    if (narrow && coarse || window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
      location.replace('feed.html' + location.hash);
    }
  } catch (e) {}
})();
