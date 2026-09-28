// ===== Константы игры =====
const SIZE = 8;                                   // размер поля 8x8 клеток
const SHIP_SIZES = [3, 2, 2, 1, 1];                // размеры кораблей флота (5 кораблей)

// ===== НАСТРОЙКА РАЗМЕРА ИКОНКИ 3-КЛЕТОЧНОГО КОРАБЛЯ =====
// Здесь можно менять размер ТОЛЬКО корабля длиной 3 клетки.
// 1.00 = обычный размер
// 1.05 = на 5% больше
// 1.10 = на 10% больше
// 1.15 = на 15% больше
// 1.20 = на 20% больше
const THREE_CELL_SHIP_SCALE = 1.10;

// ===== Пути к картинкам кораблей =====
const PLAYER_SHIP_IMG = 'player-cruiser.svg';
const ENEMY_SHIP_IMG = 'enemy-tug.svg';

// ===== Пути к файлам звуков =====
const SOUND_FILES = {
  hit: 'hit.mp3',
  miss: 'miss.mp3',
  win: 'win.mp3',
  lose: 'lose.mp3',
};

// ===== Состояние игры =====
let playerBoard, enemyBoard;
let playerShips, enemyShips;
let playerCells, enemyCells;
let gameOver = false;
let playerTurn = true;
let soundOn = true;

// ===== Web Audio API =====
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

// ===== Универсальный проигрыватель =====
function playSound(key, fallbackFn) {
  if (!soundOn) return;

  const src = SOUND_FILES[key];
  const audio = new Audio(src);

  let usedFallback = false;

  const runFallback = () => {
    if (usedFallback) return;
    usedFallback = true;
    fallbackFn();
  };

  audio.addEventListener('error', runFallback);

  const playPromise = audio.play();

  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(runFallback);
  }
}

// ===== Звук попадания =====
function synthHitSound() {
  const ctx = getAudioCtx();

  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);

  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800, ctx.currentTime);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start();
  noise.stop(ctx.currentTime + 0.3);
}

// ===== Звук промаха =====
function synthMissSound() {
  const ctx = getAudioCtx();

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.25);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.25);
}

// ===== Победный звук: фанфара «чемпион» + аплодисменты =====
function synthWinSound() {
  const ctx = getAudioCtx(), t0 = ctx.currentTime;
  const note = (f, at, dur, type = 'sawtooth', vol = 0.18) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = type; o.frequency.value = f;
    lp.type = 'lowpass'; lp.frequency.value = 2200;
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    o.connect(lp).connect(g).connect(ctx.destination);
    o.start(t0 + at); o.stop(t0 + at + dur + 0.05);
  };
  // «та-та-та-таааа, та-та-таааа!»
  [[523.25, 0, .14], [523.25, .16, .14], [523.25, .32, .14], [659.25, .48, .5],
   [587.33, 1.02, .14], [659.25, 1.18, .14], [783.99, 1.34, .9]]
    .forEach(([f, at, d]) => { note(f, at, d); note(f / 2, at, d, 'triangle', .12); });
  // финальный мажорный аккорд
  [523.25, 659.25, 783.99, 1046.5].forEach(f => note(f, 1.34, 1.2, 'square', .06));
  // аплодисменты (шум с хлопками)
  const len = Math.floor(ctx.sampleRate * 2.2), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.15 ? 1 : 0.25) * Math.min(1, i / ctx.sampleRate * 4) * (1 - i / len);
  }
  const n = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
  n.buffer = buf; hp.type = 'highpass'; hp.frequency.value = 1500; g.gain.value = 0.35;
  n.connect(hp).connect(g).connect(ctx.destination); n.start(t0 + 1.2);
}

// ===== Звук поражения: грустный тромбон «вa-вa-вa-вааа» =====
function synthLoseSound() {
  const ctx = getAudioCtx(), t0 = ctx.currentTime;
  const notes = [[392, 0, .45], [370, .5, .45], [349.23, 1, .45], [330, 1.5, 1.2]];
  notes.forEach(([f, at, dur], i) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t0 + at);
    if (i === notes.length - 1) o.frequency.exponentialRampToValueAtTime(f * 0.7, t0 + at + dur); // последняя нота «сползает»
    lfo.frequency.value = 6; lg.gain.value = f * 0.015; lfo.connect(lg).connect(o.frequency);      // вибрато
    lp.type = 'lowpass'; lp.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(0.25, t0 + at + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    o.connect(lp).connect(g).connect(ctx.destination);
    o.start(t0 + at); lfo.start(t0 + at); o.stop(t0 + at + dur + 0.05); lfo.stop(t0 + at + dur + 0.05);
  });
}

function playHitSound() { playSound('hit', synthHitSound); }
function playMissSound() { playSound('miss', synthMissSound); }
function playWinSound() { playSound('win', synthWinSound); }
function playLoseSound() { playSound('lose', synthLoseSound); }

// ===== Создание пустого поля =====
function createEmptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

// ===== Случайная расстановка кораблей =====
function placeShips(board) {
  const ships = [];

  for (const size of SHIP_SIZES) {
    let placed = false;

    while (!placed) {
      const horizontal = Math.random() < 0.5;
      const row = Math.floor(Math.random() * SIZE);
      const col = Math.floor(Math.random() * SIZE);

      const cells = [];
      let fits = true;

      for (let i = 0; i < size; i++) {
        const r = horizontal ? row : row + i;
        const c = horizontal ? col + i : col;

        if (r >= SIZE || c >= SIZE || board[r][c] !== null) {
          fits = false;
          break;
        }

        cells.push([r, c]);
      }

      if (fits && !hasAdjacentShip(board, cells)) {
        cells.forEach(([r, c]) => { board[r][c] = 'ship'; });
        ships.push(cells);
        placed = true;
      }
    }
  }

  return ships;
}

// ===== Проверка соседних кораблей =====
function hasAdjacentShip(board, cells) {
  for (const [r, c] of cells) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr;
        const nc = c + dc;

        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr][nc] === 'ship') {
          return true;
        }
      }
    }
  }
  return false;
}

// ===== Создание сетки =====
function buildGrid(containerId) {
  const grid = document.getElementById(containerId);

  grid.innerHTML = '';
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = `repeat(${SIZE}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${SIZE}, 1fr)`;

  const cells = [];

  for (let r = 0; r < SIZE; r++) {
    cells.push([]);

    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.style.gridColumn = String(c + 1);
      cell.style.gridRow = String(r + 1);

      grid.appendChild(cell);
      cells[r].push(cell);
    }
  }

  return cells;
}

// ===== ОТДЕЛЬНЫЙ СЛОЙ ДЛЯ ИКОНОК КОРАБЛЕЙ =====
//
// Слой создаётся непосредственно в body и получает точные координаты
// самой сетки через getBoundingClientRect().
// Поэтому иконки не могут уехать за пределы игровой области
// из-за position, transform, padding или overflow родителя.
//
function getOrCreateShipLayer(gridEl) {
  const layerId = gridEl.id + 'ShipLayer';

  let layer = document.getElementById(layerId);

  if (!layer) {
    layer = document.createElement('div');
    layer.id = layerId;
    layer.className = 'ship-layer';

    // fixed относительно окна браузера
    layer.style.position = 'fixed';
    layer.style.pointerEvents = 'none';
    layer.style.zIndex = '99999';   // ниже анимаций победы/поражения/ничьей (.fx = 100000)
    layer.style.display = 'grid';
    layer.style.margin = '0';
    layer.style.padding = '0';
    layer.style.border = '0';
    layer.style.boxSizing = 'content-box';

    document.body.appendChild(layer);
  }

  return layer;
}

// ===== ТОЧНАЯ СИНХРОНИЗАЦИЯ С ИГРОВЫМ ПОЛЕМ =====
function syncShipLayer(gridEl) {
  const layer = getOrCreateShipLayer(gridEl);
  const cs = getComputedStyle(gridEl);
  const gridRect = gridEl.getBoundingClientRect();

  // Border
  const borderLeft = parseFloat(cs.borderLeftWidth) || 0;
  const borderTop = parseFloat(cs.borderTopWidth) || 0;
  const borderRight = parseFloat(cs.borderRightWidth) || 0;
  const borderBottom = parseFloat(cs.borderBottomWidth) || 0;

  // Padding
  const paddingLeft = parseFloat(cs.paddingLeft) || 0;
  const paddingTop = parseFloat(cs.paddingTop) || 0;
  const paddingRight = parseFloat(cs.paddingRight) || 0;
  const paddingBottom = parseFloat(cs.paddingBottom) || 0;

  // Реальная область клеток
  const contentLeft = gridRect.left + borderLeft + paddingLeft;
  const contentTop = gridRect.top + borderTop + paddingTop;
  const contentWidth = gridRect.width - borderLeft - borderRight - paddingLeft - paddingRight;
  const contentHeight = gridRect.height - borderTop - borderBottom - paddingTop - paddingBottom;

  // Позиция слоя
  layer.style.left = contentLeft + 'px';
  layer.style.top = contentTop + 'px';
  layer.style.width = contentWidth + 'px';
  layer.style.height = contentHeight + 'px';

  // Реальные размеры Grid
  layer.style.gridTemplateColumns = cs.gridTemplateColumns;
  layer.style.gridTemplateRows = cs.gridTemplateRows;
  layer.style.columnGap = cs.columnGap;
  layer.style.rowGap = cs.rowGap;

  return layer;
}

// ===== Рисуем силуэт корабля =====
function renderShipOverlay(gridEl, ship, imgSrc, isEnemy) {
  const rows = ship.map(([r]) => r);
  const cols = ship.map(([, c]) => c);

  const minR = Math.min(...rows);
  const maxR = Math.max(...rows);
  const minC = Math.min(...cols);
  const maxC = Math.max(...cols);

  const vertical = maxR > minR;

  const layer = syncShipLayer(gridEl);

  const overlay = document.createElement('div');

  overlay.className =
    'ship-overlay' +
    (vertical ? ' vertical' : '') +
    (isEnemy ? ' enemy-ship' : '');

  // Точная привязка к клеткам
  overlay.style.gridColumn = `${minC + 1} / ${maxC + 2}`;
  overlay.style.gridRow = `${minR + 1} / ${maxR + 2}`;
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.overflow = 'visible';
  overlay.style.minWidth = '0';
  overlay.style.minHeight = '0';
  overlay.style.pointerEvents = 'none';

  layer.appendChild(overlay);

  // Получаем реальный размер области корабля.
  const overlayRect = overlay.getBoundingClientRect();
  const width = overlayRect.width;
  const height = overlayRect.height;

  const rotator = document.createElement('div');
  rotator.className = 'ship-rotator';
  rotator.style.position = 'absolute';
  rotator.style.left = '50%';
  rotator.style.top = '50%';
  rotator.style.display = 'block';
  rotator.style.margin = '0';
  rotator.style.padding = '0';
  rotator.style.boxSizing = 'border-box';
  rotator.style.transformOrigin = 'center center';
  rotator.style.flex = 'none';
  rotator.style.pointerEvents = 'none';

  // ===== РАЗМЕР КОРАБЛЯ =====
  // Только 3-клеточный корабль получает увеличенный масштаб (THREE_CELL_SHIP_SCALE).
  const shipScale = ship.length === 3 ? THREE_CELL_SHIP_SCALE : 1.00;

  if (vertical) {
    rotator.style.width = height + 'px';
    rotator.style.height = width + 'px';
    rotator.style.transform = `translate(-50%, -50%) rotate(90deg) scale(${shipScale})`;
  } else {
    rotator.style.width = width + 'px';
    rotator.style.height = height + 'px';
    rotator.style.transform = `translate(-50%, -50%) scale(${shipScale})`;
  }

  const img = document.createElement('img');
  img.src = imgSrc;
  img.alt = '';
  img.style.width = '100%';
  img.style.height = '100%';
  img.style.display = 'block';
  img.style.objectFit = 'fill';
  img.style.margin = '0';
  img.style.padding = '0';
  img.style.pointerEvents = 'none';

  rotator.appendChild(img);
  overlay.appendChild(rotator);
}

// ===== Обновление клетки игрока =====
function updatePlayerCell(r, c) {
  const cell = playerCells[r][c];
  const val = playerBoard[r][c];

  cell.className = 'cell';

  if (val === 'ship') cell.classList.add('ship');
  if (val === 'hit') cell.classList.add('hit');
  if (val === 'sunk') cell.classList.add('sunk');
  if (val === 'miss') cell.classList.add('miss');
}

// ===== Обновление клетки врага =====
function updateEnemyCell(r, c) {
  const cell = enemyCells[r][c];
  const val = enemyBoard[r][c];

  cell.className = 'cell';

  // Корабль противника скрыт. Показываем только результат выстрела.
  if (val === 'hit') cell.classList.add('hit');
  if (val === 'sunk') cell.classList.add('sunk');
  if (val === 'miss') cell.classList.add('miss');
}

// ===== Отрисовка поля игрока =====
function renderPlayerBoard() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      updatePlayerCell(r, c);
    }
  }
}

// ===== Отрисовка поля врага =====
function renderEnemyBoard() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      updateEnemyCell(r, c);
    }
  }
}

// ===== Анимация взрыва =====
function showExplosion(cellEl) {
  const explosion = document.createElement('div');
  explosion.className = 'explosion';

  cellEl.appendChild(explosion);

  setTimeout(() => {
    explosion.remove();
  }, 600);
}

// ===== Проверка потопления корабля =====
function checkSunk(board, ships, r, c) {
  for (const ship of ships) {
    if (ship.some(([sr, sc]) => sr === r && sc === c)) {
      const sunk = ship.every(([sr, sc]) => board[sr][sc] === 'hit' || board[sr][sc] === 'sunk');

      if (sunk) {
        ship.forEach(([sr, sc]) => { board[sr][sc] = 'sunk'; });
        return ship;
      }
    }
  }
  return null;
}

// ===== Проверка победы =====
function allSunk(board, ships) {
  return ships.every(cells => cells.every(([r, c]) => board[r][c] === 'sunk'));
}

// ===== Выстрел игрока =====
function playerFire(r, c) {

  // 2 игрока: правое поле — красные, стреляет по нему игрок 1
  if (mode === 'pvp') {
    pvpFire(1, r, c);
    return;
  }

  if (gameOver || !playerTurn) {
    return;
  }

  const val = enemyBoard[r][c];

  if (val === 'hit' || val === 'miss' || val === 'sunk') {
    return;
  }

  const cellEl = enemyCells[r][c];

  if (val === 'ship') {

    // Попадание. Клетка сразу становится красной.
    enemyBoard[r][c] = 'hit';

    updateEnemyCell(r, c);
    showExplosion(cellEl);
    playHitSound();

    const sunkShip = checkSunk(enemyBoard, enemyShips, r, c);

    if (sunkShip) {

      // Только после того, как ВСЕ клетки корабля найдены, показываем его иконку.
      sunkShip.forEach(([sr, sc]) => {
        updateEnemyCell(sr, sc);
      });

      renderShipOverlay(
        document.getElementById('enemyGrid'),
        sunkShip,
        ENEMY_SHIP_IMG,
        true
      );

      statusEl_setSunk();

      if (soloTimer) { spend(); clocks[0] += SINK_BONUS; flashBonus(0); }   // +2 секунды за потопленный корабль
    }

    if (allSunk(enemyBoard, enemyShips)) {
      endGame(true);
      return;
    }

    if (!sunkShip) {
      setStatus('Попадание! Стреляйте ещё раз.');
    }

  } else {

    // ===== ПРОМАХ =====
    enemyBoard[r][c] = 'miss';

    updateEnemyCell(r, c);
    playMissSound();

    playerTurn = false;

    setStatus('Промах! Ход компьютера...');

    setTimeout(computerTurn, 700);
  }
}

// ===== Сообщение о потоплении =====
function statusEl_setSunk() {
  setStatus('Корабль противника потоплен! 💥' + (soloTimer ? ' +' + SINK_BONUS + ' с ⏱' : ''));
}

// ===== ИИ =====
let aiTargets = [];

function computerTurn() {
  if (gameOver) {
    return;
  }

  let r, c;

  if (aiTargets.length > 0) {
    [r, c] = aiTargets.shift();
  } else {
    do {
      r = Math.floor(Math.random() * SIZE);
      c = Math.floor(Math.random() * SIZE);
    } while (
      playerBoard[r][c] === 'hit' ||
      playerBoard[r][c] === 'miss' ||
      playerBoard[r][c] === 'sunk'
    );
  }

  const cellEl = playerCells[r][c];

  if (playerBoard[r][c] === 'ship') {

    playerBoard[r][c] = 'hit';

    updatePlayerCell(r, c);
    showExplosion(cellEl);
    playHitSound();

    addAdjacentTargets(r, c);

    const sunkShip = checkSunk(playerBoard, playerShips, r, c);

    if (sunkShip) {
      sunkShip.forEach(([sr, sc]) => {
        updatePlayerCell(sr, sc);
      });
    }

    if (sunkShip && soloTimer) { spend(); clocks[1] += SINK_BONUS; flashBonus(1); }   // +2 секунды компьютеру

    if (allSunk(playerBoard, playerShips)) {
      endGame(false);
      return;
    }

    setStatus(
      sunkShip
        ? 'Компьютер потопил ваш корабль! Его ход продолжается...'
        : 'Компьютер попал! Его ход продолжается...'
    );

    setTimeout(computerTurn, 700);

  } else {

    playerBoard[r][c] = 'miss';

    updatePlayerCell(r, c);
    playMissSound();

    playerTurn = true;

    setStatus('Компьютер промахнулся. Ваш ход!');
  }
}

// ===== Добавление соседних целей ИИ =====
function addAdjacentTargets(r, c) {
  const candidates = [
    [r - 1, c],
    [r + 1, c],
    [r, c - 1],
    [r, c + 1]
  ];

  for (const [nr, nc] of candidates) {
    if (
      nr >= 0 &&
      nr < SIZE &&
      nc >= 0 &&
      nc < SIZE &&
      playerBoard[nr][nc] !== 'hit' &&
      playerBoard[nr][nc] !== 'miss' &&
      playerBoard[nr][nc] !== 'sunk'
    ) {
      aiTargets.push([nr, nc]);
    }
  }
}

// ===== Статус =====
function setStatus(text) {
  document.getElementById('status').textContent = text;
}

// ===== Завершение игры =====
function endGame(playerWon) {

  if (mode === 'pvp') {
    pvpWin(cur, '🎉 Игрок ' + (cur + 1) + ' победил! Весь флот соперника потоплен.');
    return;
  }

  gameOver = true;

  setStatus(
    playerWon
      ? '🎉 Вы победили! Весь флот противника потоплен.'
      : '💀 Поражение. Ваш флот уничтожен.'
  );

  if (playerWon) {
    playWinSound();
    showFx('playerGrid', 'win');    // конфетти и кубок на поле игрока
  } else {
    playLoseSound();
    showFx('playerGrid', 'sink');   // тонущий корабль на поле игрока
  }
}

// ===== Режимы, расстановка и передача хода =====
let mode = 'ai';                 // 'ai' — против компьютера, 'pvp' — 2 игрока
let boards = [], fleets = [];    // поля и флоты обоих игроков
let cur = 0;                     // индекс текущего игрока (0 или 1)
let phase = 'setup';             // 'setup' — расстановка, 'play' — бой
let pending = [], sel = 0, horiz = true; // ещё не поставленные корабли, выбранный, ориентация
const $ = id => document.getElementById(id);

// Новая игра в выбранном режиме
function newGame() { startMode(mode); }

function startMode(m) {
  mode = m;
  stopClock();
  clearFx();
  boards = [createEmptyBoard(), createEmptyBoard()];
  fleets = [[], []];
  aiTargets = [];
  score = [0, 0]; round = 1;
  $('nextRoundBtn').classList.add('hidden');
  beginSetup(0);
  if (m === 'pvp') {
    teamScreen(0);
  }
}

function bindPlayer(p) {          // левое поле — свой флот текущего игрока
  cur = p;
  playerBoard = boards[p];
  playerShips = fleets[p];
}

function beginSetup(p) {
  phase = 'setup'; gameOver = false; playerTurn = false;
  bindPlayer(p);
  enemyBoard = createEmptyBoard(); enemyShips = [];
  pending = SHIP_SIZES.slice(); sel = 0;
  playerCells = buildGrid('playerGrid');
  enemyCells = buildGrid('enemyGrid');
  $('enemyBlock').classList.add('hidden');
  $('setupPanel').classList.remove('hidden');
  afterSetupChange();
}

function afterSetupChange() {
  syncUi();
  renderPlayerBoard(); refreshShipOverlays(); renderFleet();
  setStatus(mode === 'pvp' ? (cur ? '🔴 Красные (игрок 2)' : '🔵 Синие (игрок 1)') + ': расставьте свой флот' : 'Расставьте свой флот');
}

function renderFleet() {
  const el = $('fleetList'); el.innerHTML = '';
  pending.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'chip' + (i === sel ? ' selected' : '');
    b.textContent = '■'.repeat(s);
    b.onclick = () => { sel = i; renderFleet(); };
    el.appendChild(b);
  });
  if (!pending.length) el.textContent = 'Весь флот расставлен';
  $('startBtn').disabled = pending.length > 0;
  $('startBtn').textContent = 'В бой';
  $('rotateBtn').textContent = 'Повернуть: ' + (horiz ? 'вдоль' : 'поперёк');
}

function shipCells(r, c) {        // клетки выбранного корабля от (r,c) или null
  if (sel >= pending.length) return null;
  const cells = [];
  for (let i = 0; i < pending[sel]; i++) {
    const rr = horiz ? r : r + i, cc = horiz ? c + i : c;
    if (rr >= SIZE || cc >= SIZE) return null;
    cells.push([rr, cc]);
  }
  return cells;
}

function clearPreview() {
  playerCells.forEach(row => row.forEach(el => el.classList.remove('preview', 'bad')));
}

function removeShipAt(r, c) {
  const i = playerShips.findIndex(sh => sh.some(([a, b]) => a === r && b === c));
  if (i < 0) return false;
  const [sh] = playerShips.splice(i, 1);
  sh.forEach(([a, b]) => { playerBoard[a][b] = null; });
  pending.push(sh.length); pending.sort((x, y) => y - x);
  sel = pending.indexOf(sh.length);
  return true;
}

function setupClick(r, c) {
  if (phase === 'play') { if (mode === 'pvp') pvpFire(0, r, c); return; } // левое поле — синие
  if (phase !== 'setup') return;
  if (playerBoard[r][c] === 'ship') { removeShipAt(r, c); afterSetupChange(); return; }
  const cells = shipCells(r, c);
  if (!cells) { setStatus('Корабль не помещается — выберите другую клетку или поверните'); return; }
  if (hasAdjacentShip(playerBoard, cells)) { setStatus('Корабли не должны касаться друг друга'); return; }
  cells.forEach(([a, b]) => { playerBoard[a][b] = 'ship'; });
  playerShips.push(cells);
  pending.splice(sel, 1); sel = 0;
  afterSetupChange();
}

function rotateShip() { horiz = !horiz; renderFleet(); }

function clearFleet() {
  playerShips.length = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) playerBoard[r][c] = null;
  pending = SHIP_SIZES.slice(); sel = 0;
}

// Кнопка «В бой» / «Готово»
function finishSetup() {
  if (pending.length) return;
  if (mode === 'ai') {
    enemyBoard = createEmptyBoard();
    enemyShips = placeShips(enemyBoard);
    boards[1] = enemyBoard; fleets[1] = enemyShips;
    beginTurn(0);
  } else if (cur === 0) {
    teamScreen(1, () => beginSetup(1));
  } else {
    beginPvpBattle();   // расстановка запомнена, начинается бой
  }
}

// Начало хода игрока p: слева его флот, справа поле соперника
function beginTurn(p) {
  phase = 'play'; gameOver = false;
  syncUi();
  bindPlayer(p);
  enemyBoard = boards[1 - p]; enemyShips = fleets[1 - p];
  playerCells = buildGrid('playerGrid');
  enemyCells = buildGrid('enemyGrid');
  $('setupPanel').classList.add('hidden');
  $('enemyBlock').classList.remove('hidden');
  playerTurn = true;
  renderPlayerBoard(); renderEnemyBoard(); refreshShipOverlays();
  if (soloTimer) { clocks = [TIME_PER_PLAYER, TIME_PER_PLAYER]; renderClocks(); startClock(); }   // режим «ПРО»
  setStatus(mode === 'pvp'
    ? 'Игрок ' + (p + 1) + ': стреляйте по полю соперника'
    : 'Стреляйте по полю противника — кликните по клетке справа');
}

// Экран передачи устройства (закрывает оба поля)
function handoff(title, text, cb) {
  $('handoffTitle').innerHTML = title;
  $('handoffText').textContent = text;
  $('handoff').classList.remove('hidden');
  $('handoffBtn').onclick = () => { $('handoff').classList.add('hidden'); cb(); };
}

// ===== 2 игрока: общий бой, шахматные часы =====
const TIME_PER_PLAYER = 20;      // секунд на каждого игрока (общий запас, как в шахматах)
let clocks = [0, 0], tick = null, lastTick = 0;
const SINK_BONUS = 2;            // +секунды за полностью потопленный корабль (режим «ПРО»)
let cfg = { rounds: 1, timer: true };   // настройки игры с другом: число раундов и таймер
let score = [0, 0], round = 1;          // счёт по раундам и номер текущего раунда

function syncUi() {              // подписи, рамки и таймеры под текущий режим
  const pvpPlay = mode === 'pvp' && phase === 'play';
  const aiPlay = mode === 'ai' && phase === 'play';
  $('playerGrid').classList.toggle('as-red', mode === 'pvp' && phase === 'setup' && cur === 1);
  $('clockL').classList.toggle('hidden', !((pvpPlay && cfg.timer) || (aiPlay && soloTimer)));
  $('clockR').classList.toggle('hidden', !((pvpPlay && cfg.timer) || (aiPlay && soloTimer)));
  $('titleL').innerHTML = pvpPlay ? 'Поле синих <span class="tag tag-player">игрок 1</span>'
    : mode === 'pvp' ? 'Ваш флот <span class="tag ' + (cur ? 'tag-enemy">красные' : 'tag-player">синие') + '</span>'
    : 'Ваш флот <span class="tag tag-player">синий</span>';
  $('titleR').innerHTML = pvpPlay ? 'Поле красных <span class="tag tag-enemy">игрок 2</span>'
    : 'Поле противника <span class="tag tag-enemy">красный</span>';
  if ((pvpPlay && cfg.timer) || (aiPlay && soloTimer)) renderClocks();
  const showScore = mode === 'pvp' && cfg.rounds > 1;
  $('scoreBar').classList.toggle('hidden', !showScore);
  if (showScore) renderScore();
  syncGiveUp();
}

function renderClocks() {
  [0, 1].forEach(i => {
    const el = $(i ? 'clockR' : 'clockL');
    el.textContent = (i ? (mode === 'ai' ? '🤖 ' : '🔴 ') : '🔵 ') + Math.max(0, clocks[i]).toFixed(1) + ' с';
    el.classList.toggle('running', phase === 'play' && !gameOver && activeSide() === i);
    el.classList.toggle('low', clocks[i] < 5);
  });
}

function activeSide() {         // 0 — левые часы, 1 — правые
  return mode === 'pvp' ? cur : (playerTurn ? 0 : 1);   // в одиночной игре справа часы компьютера
}

function spend() {
  if (!tick) return;             // без таймера время не считаем               // списать прошедшее время с часов текущего игрока
  const n = performance.now();
  clocks[activeSide()] -= (n - lastTick) / 1000;
  lastTick = n;
}

function startClock() {
  stopClock();
  lastTick = performance.now();
  tick = setInterval(() => {
    if (gameOver) { stopClock(); return; }
    spend();
    const a = activeSide();
    if (clocks[a] <= 0) { clocks[a] = 0; timeUp(); return; }
    renderClocks();
  }, 100);
}

function stopClock() {
  clearInterval(tick); tick = null;
  if (phase === 'play') renderClocks();
}

function sunkCount(side) {       // сколько кораблей на поле side потоплено
  return fleets[side].filter(sh => sh.every(([a, b]) => boards[side][a][b] === 'sunk')).length;
}

function timeUp() {
  if (mode === 'ai') { soloTimeUp(); return; }              // время вышло: побеждает тот, кто потопил больше кораблей
  const blue = sunkCount(1), red = sunkCount(0);
  const res = blue > red ? '🏆 Победили синие!' : red > blue ? '🏆 Победили красные!' : '🤝 Ничья!';
  pvpWin(blue === red ? null : blue > red ? 0 : 1,
    '⏱ Время ' + (cur ? 'красных' : 'синих') + ' вышло. Потоплено: 🔵 ' + blue + ', 🔴 ' + red + '. ' + res);
}

function soloTimeUp() {          // время вышло в одиночной игре: сравниваем потопленные корабли
  gameOver = true; stopClock();
  const you = sunkCount(1), pc = sunkCount(0);
  const info = '⏱ Время вышло! Потоплено кораблей: вы — ' + you + ', компьютер — ' + pc + '. ';
  if (you > pc) { setStatus(info + '🏆 Вы победили!'); playWinSound(); showFx('playerGrid', 'win'); }
  else if (you < pc) { setStatus(info + '💀 Победил компьютер.'); playLoseSound(); showFx('playerGrid', 'sink'); }
  else {                         // ничья: рукопожатие на обоих полях
    setStatus(info + '🤝 Ничья!');
    showFx('playerGrid', 'draw');
    showFx('enemyGrid', 'draw');
  }
}

function turnText() {
  return cur === 0 ? '🔵 Ход синих (игрок 1): атакуйте красное поле справа'
                    : '🔴 Ход красных (игрок 2): атакуйте синее поле слева';
}

function updatePvpCell(side, r, c) {   // в бою корабли скрыты у обоих: видны только результаты
  const cell = (side ? enemyCells : playerCells)[r][c];
  const v = boards[side][r][c];
  cell.className = 'cell';
  if (v === 'hit' || v === 'sunk' || v === 'miss') cell.classList.add(v);
}

function beginPvpBattle() {
  phase = 'play'; gameOver = false; cur = (round - 1) % 2;   // кто стреляет первым, чередуется по раундам
  playerBoard = boards[0]; playerShips = fleets[0];
  enemyBoard = boards[1]; enemyShips = fleets[1];
  playerCells = buildGrid('playerGrid');
  enemyCells = buildGrid('enemyGrid');
  $('setupPanel').classList.add('hidden');
  $('enemyBlock').classList.remove('hidden');
  clocks = [TIME_PER_PLAYER, TIME_PER_PLAYER];
  syncUi();
  for (let side = 0; side < 2; side++)
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) updatePvpCell(side, r, c);
  refreshShipOverlays();
  if (cfg.timer) startClock();
  setStatus(turnText());
}

function pvpFire(side, r, c) {   // side: 0 — синее поле (слева), 1 — красное (справа)
  if (phase !== 'play' || gameOver) return;
  if (side !== 1 - cur) { setStatus('Это ваше поле! ' + turnText()); return; }
  const board = boards[side], val = board[r][c];
  if (val === 'hit' || val === 'miss' || val === 'sunk') return;
  const cellEl = (side ? enemyCells : playerCells)[r][c];
  if (val === 'ship') {
    board[r][c] = 'hit';
    updatePvpCell(side, r, c); showExplosion(cellEl); playHitSound();
    const sunk = checkSunk(board, fleets[side], r, c);
    if (sunk) {
      sunk.forEach(([a, b]) => updatePvpCell(side, a, b));
      renderShipOverlay($(side ? 'enemyGrid' : 'playerGrid'), sunk, side ? ENEMY_SHIP_IMG : PLAYER_SHIP_IMG, side === 1);
      if (cfg.timer) { spend(); clocks[cur] += SINK_BONUS; flashBonus(cur); }   // +2 секунды стреляющему
    }
    if (allSunk(board, fleets[side])) { endGame(true); return; }
    setStatus((cur ? '🔴 ' : '🔵 ') + (sunk ? 'Корабль потоплен! 💥 ' + (cfg.timer ? '+' + SINK_BONUS + ' с ⏱ ' : '') : 'Попадание! ') + 'Стреляйте ещё раз.');
  } else {
    board[r][c] = 'miss';
    updatePvpCell(side, r, c); playMissSound();
    spend(); cur = 1 - cur;      // ход (и часы) переходят к сопернику
    renderClocks(); setStatus(turnText());
  }
}

// ===== Экран «КОМАНДА ВЫБИРАЕТ», счёт и меню матча =====
function teamScreen(p, cb) {
  const blue = p === 0;
  handoff(
    '<div class="team-big ' + (blue ? 'team-blue">СИНЯЯ КОМАНДА ВЫБИРАЕТ' : 'team-red">КРАСНАЯ КОМАНДА ВЫБИРАЕТ') + '</div>' +
    '<div class="turn-away ' + (blue ? 'team-red">КРАСНЫЙ ОТВЕРНИСЬ!' : 'team-blue">СИНИЙ ОТВЕРНИСЬ!') + '</div>',
    blue ? 'Вы играете за синих и атакуете красное поле справа.' : 'Вы играете за красных и атакуете синее поле слева.',
    cb || (() => {}));
}

function renderScore() {         // шкала: заполненные кружки — выигранные раунды
  const n = cfg.rounds, pips = w => '●'.repeat(w) + '○'.repeat(Math.max(0, n - w));
  $('scoreL').textContent = '🔵 ' + pips(score[0]);
  $('scoreR').textContent = pips(score[1]) + ' 🔴';
  $('roundLbl').textContent = 'Раунд ' + round + ' из ' + n + ' · ' + score[0] + ' : ' + score[1];
}

function nextRound() {
  round++; clearFx();
  $('nextRoundBtn').classList.add('hidden');
  boards = [createEmptyBoard(), createEmptyBoard()]; fleets = [[], []];
  beginSetup(0);
  teamScreen(0);
}

function flashBonus(i) {         // подсветка часов при бонусе +2 с
  const el = $(i ? 'clockR' : 'clockL');
  el.classList.add('bonus');
  setTimeout(() => el.classList.remove('bonus'), 900);
}

const pick = { match: false, rounds: 3, own: false };
let soloTimer = true;            // игра для одного: НУБ (без таймера) или ПРО (с таймером)
function refreshMenu() {
  document.querySelectorAll('#fmtOpts .chip').forEach(b => b.classList.toggle('selected', (b.dataset.v === 'match') === pick.match));
  $('roundOpts').classList.toggle('hidden', !pick.match);
  document.querySelectorAll('#roundOpts .chip').forEach(b =>
    b.classList.toggle('selected', b.dataset.r === 'own' ? pick.own : !pick.own && +b.dataset.r === pick.rounds));
  $('ownRounds').classList.toggle('hidden', !pick.own);
  document.querySelectorAll('#modeOpts .mode-btn').forEach(b => b.classList.toggle('selected', (b.dataset.t === '1') === soloTimer));
}
$('menu').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.v) pick.match = b.dataset.v === 'match';
  if (b.dataset.r) { pick.own = b.dataset.r === 'own'; if (!pick.own) pick.rounds = +b.dataset.r; }
  refreshMenu();
});
$('menuStart').addEventListener('click', () => {
  const own = clampRounds();   // своё число: от 2 до 6
  cfg = { rounds: pick.match ? (pick.own ? own : pick.rounds) : 1, timer: true };   // в игре с другом таймер всегда включён
  $('menu').classList.add('hidden');
  $('home').classList.add('hidden');
  startMode('pvp');
});
// Своё число раундов: не меньше 2 и не больше 6 (исправляется сразу после ввода)
function clampRounds() {
  const v = Math.min(6, Math.max(2, parseInt($('ownRounds').value, 10) || 2));
  $('ownRounds').value = v;
  return v;
}
$('ownRounds').addEventListener('change', clampRounds);
$('ownRounds').addEventListener('blur', clampRounds);
$('menuCancel').addEventListener('click', () => $('menu').classList.add('hidden'));
$('nextRoundBtn').addEventListener('click', nextRound);
$('soloMenu').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b && b.dataset.t) { soloTimer = b.dataset.t === '1'; refreshMenu(); }
});
$('soloStart').addEventListener('click', () => {
  $('soloMenu').classList.add('hidden');
  $('home').classList.add('hidden');
  startMode('ai');
});
$('soloCancel').addEventListener('click', () => $('soloMenu').classList.add('hidden'));
$('homeBtn').addEventListener('click', goHome);

// ===== Победа, поражение, ничья, сдача =====
function clearFx() { document.querySelectorAll('.fx').forEach(e => e.remove()); }

// Анимация поверх поля: 'win' — конфетти и кубок, 'draw' — рукопожатие, 'sink' — тонущий корабль
function showFx(gridId, kind, label) {
  const g = $(gridId), fx = document.createElement('div');
  fx.className = 'fx ' + kind;
  fx.style.cssText = 'left:' + g.offsetLeft + 'px;top:' + g.offsetTop + 'px;width:' + g.offsetWidth + 'px;height:' + g.offsetHeight + 'px';
  if (kind === 'win') {
    for (let i = 0; i < 45; i++) {
      const p = document.createElement('i');
      p.className = 'confetti';
      p.style.cssText = 'left:' + Math.random() * 100 + '%;background:hsl(' + Math.random() * 360 + ',90%,60%);' +
        'animation-duration:' + (2 + Math.random() * 2) + 's;animation-delay:' + Math.random() * 2 + 's';
      fx.appendChild(p);
    }
    fx.insertAdjacentHTML('beforeend', '<div class="trophy">🏆</div><div class="fx-text">' + (label || 'ПОБЕДА!') + '</div>');
  } else if (kind === 'draw') {
    fx.insertAdjacentHTML('beforeend', '<div class="handshake">🤝</div><div class="fx-text">' + (label || 'НИЧЬЯ!') + '</div>');
  } else {
    fx.innerHTML = '<img class="sinking" src="' + (gridId === 'enemyGrid' ? ENEMY_SHIP_IMG : PLAYER_SHIP_IMG) + '" alt=""><div class="water"></div><div class="fx-text">ПОРАЖЕНИЕ</div>';
  }
  g.parentElement.appendChild(fx);
  syncGiveUp();
}

function pvpWin(side, text) {    // side: 0 — синие, 1 — красные, null — ничья в раунде (очки никому не начисляются)
  gameOver = true; stopClock();
  if (side !== null) score[side]++;
  if (cfg.rounds === 1) { finishFx(side, text, 'ПОБЕДА!'); return; }   // простая игра
  renderScore();
  if (round < cfg.rounds) {                                              // матч продолжается
    finishFx(side, text + ' Счёт: 🔵 ' + score[0] + ' : ' + score[1] + ' 🔴', 'ПОБЕДА!');
    $('nextRoundBtn').classList.remove('hidden');
    return;
  }
  // последний раунд: сыграны ВСЕ выбранные раунды — только теперь считаем итог
  const w = score[0] > score[1] ? 0 : score[1] > score[0] ? 1 : null;
  finishFx(side, text + ' Подводим итоги матча…', 'ПОБЕДА!', true);
  setTimeout(() => showFinal(w), 3500);
}

function finishFx(side, text, label, silent) {   // у победителя кубок и звук, у проигравшего тонущий корабль
  setStatus(text);
  if (side === null) {                            // ничья: рукопожатие на обоих полях, очки не начисляются
    showFx('playerGrid', 'draw');
    showFx('enemyGrid', 'draw');
    return;
  }
  if (!silent) playWinSound();
  showFx(side ? 'enemyGrid' : 'playerGrid', 'win', label);
  showFx(side ? 'playerGrid' : 'enemyGrid', 'sink');
}

function showFinal(w) {          // итог матча на весь экран
  const fin = $('final');
  fin.querySelectorAll('.confetti').forEach(e => e.remove());
  $('finalBox').innerHTML = (w === null
    ? '<div class="trophy">🤝</div><div class="team-big">НИЧЬЯ!</div>'
    : '<div class="trophy">🏆</div><div class="team-big ' + (w ? 'team-red' : 'team-blue') + '">' + (w ? 'КРАСНАЯ' : 'СИНЯЯ') + ' КОМАНДА<br>ПОБЕДИЛА!</div>') +
    '<p>Счёт по раундам: <b class="sc-blue">🔵 ' + score[0] + '</b> : <b class="sc-red">' + score[1] + ' 🔴</b></p>' +
    '<button class="action primary big" id="finalHome">🏠 На главный экран</button>';
  if (w !== null) {
    for (let i = 0; i < 90; i++) {
      const p = document.createElement('i');
      p.className = 'confetti';
      p.style.cssText = 'left:' + Math.random() * 100 + '%;background:hsl(' + Math.random() * 360 + ',90%,60%);' +
        'animation-duration:' + (2.5 + Math.random() * 2.5) + 's;animation-delay:' + Math.random() * 2 + 's';
      fin.appendChild(p);
    }
    playWinSound();
  }
  fin.classList.remove('hidden');
  $('finalHome').onclick = goHome;
}

function goHome() {              // назад на главный экран
  stopClock(); clearFx();
  $('final').classList.add('hidden');
  $('handoff').classList.add('hidden');
  $('home').classList.remove('hidden');
}

function syncGiveUp() {          // кнопки «Принять поражение» видны только во время боя
  const play = phase === 'play', pvp = mode === 'pvp';
  $('giveUpL').classList.toggle('hidden', !play);
  $('giveUpR').classList.toggle('hidden', !(play && pvp));
  ['giveUpL', 'giveUpR'].forEach(id => { $(id).style.visibility = gameOver ? 'hidden' : 'visible'; }); // место сохраняется
  $('giveUpL').textContent = pvp ? '🏳️ Синие: принять поражение' : '🏳️ Принять поражение';
}

function surrender(side) {       // side — кто нажал: 0 — синие (или игрок), 1 — красные
  if (phase !== 'play' || gameOver) return;
  if (!confirm('Принять поражение? Игра будет завершена.')) return;
  if (mode === 'ai') {
    gameOver = true;
    setStatus('🏳️ Вы приняли поражение. Победил компьютер.');
    playLoseSound();
    showFx('playerGrid', 'sink');
    return;
  }
  spend();
  pvpWin(1 - side, '🏳️ ' + (side ? 'Красные' : 'Синие') + ' приняли поражение. Победили ' + (side ? 'синие' : 'красные') + '!');
}

$('giveUpL').addEventListener('click', () => surrender(0));
$('giveUpR').addEventListener('click', () => surrender(1));

// ===== Обработчики расстановки =====
$('playerGrid').addEventListener('click', e => {
  const el = e.target.closest('.cell');
  if (el) setupClick(+el.dataset.r, +el.dataset.c);
});
$('playerGrid').addEventListener('mouseover', e => {
  if (phase !== 'setup') return;
  const el = e.target.closest('.cell');
  clearPreview();
  if (!el) return;
  const r = +el.dataset.r, c = +el.dataset.c;
  if (playerBoard[r][c] === 'ship') return;
  const cells = shipCells(r, c);
  if (!cells) { el.classList.add('bad'); return; }
  const bad = hasAdjacentShip(playerBoard, cells);
  cells.forEach(([a, b]) => playerCells[a][b].classList.add(bad ? 'bad' : 'preview'));
});
$('playerGrid').addEventListener('mouseleave', () => { if (phase === 'setup') clearPreview(); });
$('playerGrid').addEventListener('contextmenu', e => {
  if (phase !== 'setup') return;
  e.preventDefault(); rotateShip();
});
document.addEventListener('keydown', e => {
  if (phase === 'setup' && 'rRкК'.includes(e.key) && e.key.length === 1) rotateShip();
});
$('rotateBtn').addEventListener('click', rotateShip);
$('randomBtn').addEventListener('click', () => {
  clearFleet();
  playerShips.push(...placeShips(playerBoard));
  pending = []; sel = 0;
  afterSetupChange();
});
$('clearBtn').addEventListener('click', () => { clearFleet(); afterSetupChange(); });
$('startBtn').addEventListener('click', finishSetup);
$('modeAiBtn').addEventListener('click', () => { refreshMenu(); $('soloMenu').classList.remove('hidden'); });
$('modePvpBtn').addEventListener('click', () => { refreshMenu(); $('menu').classList.remove('hidden'); });

// ===== Обновление силуэтов кораблей =====
function refreshShipOverlays() {

  document.querySelectorAll('.ship-overlay').forEach(el => el.remove());

  const doRender = () => {

    if (mode === 'pvp' && phase === 'play') {
      [0, 1].forEach(side => fleets[side].forEach(ship => {
        if (ship.every(([r, c]) => boards[side][r][c] === 'sunk'))
          renderShipOverlay($(side ? 'enemyGrid' : 'playerGrid'), ship, side ? ENEMY_SHIP_IMG : PLAYER_SHIP_IMG, side === 1);
      }));
      return;
    }

    const playerGridEl = document.getElementById('playerGrid');

    // ===== СВОЙ ФЛОТ =====
    // Свои корабли игрок видит всегда.
    playerShips.forEach(ship =>
      renderShipOverlay(
        playerGridEl,
        ship,
        (mode === 'pvp' && cur === 1 ? ENEMY_SHIP_IMG : PLAYER_SHIP_IMG),
        false
      )
    );

    const enemyGridEl = document.getElementById('enemyGrid');

    // ===== ФЛОТ ПРОТИВНИКА =====
    // В начале игры корабли НЕ рисуются.
    // Иконка появляется только тогда, когда ВСЕ клетки конкретного корабля имеют состояние "sunk".
    enemyShips.forEach(ship => {
      if (ship.every(([r, c]) => enemyBoard[r][c] === 'sunk')) {
        renderShipOverlay(enemyGridEl, ship, ENEMY_SHIP_IMG, true);
      }
    });
  };

  requestAnimationFrame(() => requestAnimationFrame(doRender));
}

// ===== Клик по клетке врага =====
document.getElementById('enemyGrid').addEventListener('click', function (e) {
  const cell = e.target.closest('.cell');

  if (!cell) {
    return;
  }

  playerFire(Number(cell.dataset.r), Number(cell.dataset.c));
});

// ===== Новая игра =====
document.getElementById('newGameBtn').addEventListener('click', newGame);

// ===== Звук =====
document.getElementById('soundBtn').addEventListener('click', function () {
  soundOn = !soundOn;
  this.textContent = soundOn ? '🔊 Звук: вкл' : '🔇 Звук: выкл';
});

// ===== Пересчёт при изменении размера окна =====
window.addEventListener('resize', refreshShipOverlays);

// ===== Пересчёт при прокрутке страницы =====
// Нужно потому, что слой находится поверх страницы
// и должен следовать за игровым полем.
window.addEventListener('scroll', refreshShipOverlays);

// ===== Слой кораблей всегда точно следует за полем =====
// Корабли нарисованы в отдельном fixed-слое; если вёрстка сдвинулась
// (длинный статус, анимация, скрытая кнопка), слой сразу возвращается на место.
function followGrids() {
  document.querySelectorAll('.ship-layer').forEach(layer => {
    const grid = document.getElementById(layer.id.replace('ShipLayer', ''));
    if (!grid) return;
    const rc = grid.getBoundingClientRect();
    const key = [rc.left, rc.top, rc.width, rc.height].map(v => v.toFixed(1)).join('|');
    if (layer.dataset.key === key) return;
    const sizeChanged = layer.dataset.key &&
      layer.dataset.key.split('|').slice(2).join() !== key.split('|').slice(2).join();
    layer.dataset.key = key;
    syncShipLayer(grid);
    if (sizeChanged) refreshShipOverlays();
  });
  requestAnimationFrame(followGrids);
}
requestAnimationFrame(followGrids);

// ===== Запуск игры =====
newGame();

// ===== Дополнительный пересчёт после загрузки =====
window.addEventListener('load', refreshShipOverlays);