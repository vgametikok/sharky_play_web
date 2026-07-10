// Главная: случайная подборка игр + переключатель ориентации.
import { sb } from './sb.js';
import { initTopbar, gameCard, chipBar, loadingEl, emptyEl } from './ui.js';

const grid = document.getElementById('grid');
const chipsHost = document.getElementById('chips');
let orientation = 'mix';

async function load() {
  grid.replaceChildren(loadingEl());
  const { data, error } = await sb.rpc('web_home', { p_orientation: orientation, p_limit: 24 });
  if (error) {
    console.error('web_home:', error.message);
    grid.replaceChildren(emptyEl('Не удалось загрузить игры. Обновите страницу.'));
    return;
  }
  grid.replaceChildren(...(data.length ? data.map(gameCard) : [emptyEl('Пока пусто')]));
}

function renderChips() {
  chipsHost.replaceChildren(chipBar(
    [['mix', 'Смесь'], ['portrait', 'Вертикальные'], ['landscape', 'Горизонтальные']],
    orientation,
    (v) => { orientation = v; renderChips(); load(); },
  ));
}

initTopbar();
renderChips();
load();
