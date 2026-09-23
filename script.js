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
    audioCtx =
      new (window.AudioContext ||
        window.webkitAudioContext)();
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

  audio.addEventListener(
    'error',
    runFallback
  );

  const playPromise =
    audio.play();

  if (
    playPromise &&
    typeof playPromise.catch === 'function'
  ) {
    playPromise.catch(
      runFallback
    );
  }
}

// ===== Звук попадания =====
function synthHitSound() {
  const ctx =
    getAudioCtx();

  const noiseBuffer =
    ctx.createBuffer(
      1,
      ctx.sampleRate * 0.3,
      ctx.sampleRate
    );

  const data =
    noiseBuffer.getChannelData(0);

  for (
    let i = 0;
    i < data.length;
    i++
  ) {
    data[i] =
      (Math.random() * 2 - 1) *
      (1 - i / data.length);
  }

  const noise =
    ctx.createBufferSource();

  noise.buffer =
    noiseBuffer;

  const filter =
    ctx.createBiquadFilter();

  filter.type =
    'lowpass';

  filter.frequency.setValueAtTime(
    800,
    ctx.currentTime
  );

  const gain =
    ctx.createGain();

  gain.gain.setValueAtTime(
    0.5,
    ctx.currentTime
  );

  gain.gain.exponentialRampToValueAtTime(
    0.001,
    ctx.currentTime + 0.3
  );

  noise
    .connect(filter)
    .connect(gain)
    .connect(ctx.destination);

  noise.start();

  noise.stop(
    ctx.currentTime + 0.3
  );
}

// ===== Звук промаха =====
function synthMissSound() {
  const ctx =
    getAudioCtx();

  const osc =
    ctx.createOscillator();

  osc.type =
    'sine';

  osc.frequency.setValueAtTime(
    600,
    ctx.currentTime
  );

  osc.frequency.exponentialRampToValueAtTime(
    200,
    ctx.currentTime + 0.25
  );

  const gain =
    ctx.createGain();

  gain.gain.setValueAtTime(
    0.3,
    ctx.currentTime
  );

  gain.gain.exponentialRampToValueAtTime(
    0.001,
    ctx.currentTime + 0.25
  );

  osc
    .connect(gain)
    .connect(ctx.destination);

  osc.start();

  osc.stop(
    ctx.currentTime + 0.25
  );
}

// ===== Победный звук =====
function synthWinSound() {
  const ctx =
    getAudioCtx();

  const notes = [
    523.25,
    659.25,
    783.99,
    1046.5
  ];

  notes.forEach(
    (freq, i) => {

      const osc =
        ctx.createOscillator();

      osc.type =
        'triangle';

      osc.frequency.setValueAtTime(
        freq,
        ctx.currentTime + i * 0.12
      );

      const gain =
        ctx.createGain();

      gain.gain.setValueAtTime(
        0.25,
        ctx.currentTime + i * 0.12
      );

      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + i * 0.12 + 0.3
      );

      osc
        .connect(gain)
        .connect(ctx.destination);

      osc.start(
        ctx.currentTime + i * 0.12
      );

      osc.stop(
        ctx.currentTime + i * 0.12 + 0.3
      );
    }
  );
}

// ===== Звук поражения =====
function synthLoseSound() {
  const ctx =
    getAudioCtx();

  const notes = [
    392,
    349.23,
    293.66
  ];

  notes.forEach(
    (freq, i) => {

      const osc =
        ctx.createOscillator();

      osc.type =
        'sawtooth';

      osc.frequency.setValueAtTime(
        freq,
        ctx.currentTime + i * 0.18
      );

      const gain =
        ctx.createGain();

      gain.gain.setValueAtTime(
        0.2,
        ctx.currentTime + i * 0.18
      );

      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + i * 0.18 + 0.35
      );

      osc
        .connect(gain)
        .connect(ctx.destination);

      osc.start(
        ctx.currentTime + i * 0.18
      );

      osc.stop(
        ctx.currentTime + i * 0.18 + 0.35
      );
    }
  );
}

function playHitSound() {
  playSound(
    'hit',
    synthHitSound
  );
}

function playMissSound() {
  playSound(
    'miss',
    synthMissSound
  );
}

function playWinSound() {
  playSound(
    'win',
    synthWinSound
  );
}

function playLoseSound() {
  playSound(
    'lose',
    synthLoseSound
  );
}

// ===== Создание пустого поля =====
function createEmptyBoard() {
  return Array.from(
    { length: SIZE },
    () => Array(SIZE).fill(null)
  );
}

// ===== Случайная расстановка кораблей =====
function placeShips(board) {

  const ships = [];

  for (
    const size of SHIP_SIZES
  ) {

    let placed = false;

    while (!placed) {

      const horizontal =
        Math.random() < 0.5;

      const row =
        Math.floor(
          Math.random() * SIZE
        );

      const col =
        Math.floor(
          Math.random() * SIZE
        );

      const cells = [];

      let fits = true;

      for (
        let i = 0;
        i < size;
        i++
      ) {

        const r =
          horizontal
            ? row
            : row + i;

        const c =
          horizontal
            ? col + i
            : col;

        if (
          r >= SIZE ||
          c >= SIZE ||
          board[r][c] !== null
        ) {

          fits = false;

          break;
        }

        cells.push([
          r,
          c
        ]);
      }

      if (
        fits &&
        !hasAdjacentShip(
          board,
          cells
        )
      ) {

        cells.forEach(
          ([r, c]) => {
            board[r][c] =
              'ship';
          }
        );

        ships.push(
          cells
        );

        placed = true;
      }
    }
  }

  return ships;
}

// ===== Проверка соседних кораблей =====
function hasAdjacentShip(
  board,
  cells
) {

  for (
    const [r, c]
    of cells
  ) {

    for (
      let dr = -1;
      dr <= 1;
      dr++
    ) {

      for (
        let dc = -1;
        dc <= 1;
        dc++
      ) {

        const nr =
          r + dr;

        const nc =
          c + dc;

        if (
          nr >= 0 &&
          nr < SIZE &&
          nc >= 0 &&
          nc < SIZE &&
          board[nr][nc] === 'ship'
        ) {

          return true;
        }
      }
    }
  }

  return false;
}

// ===== Создание сетки =====
function buildGrid(
  containerId
) {

  const grid =
    document.getElementById(
      containerId
    );

  grid.innerHTML = '';

  grid.style.display =
    'grid';

  grid.style.gridTemplateColumns =
    `repeat(${SIZE}, 1fr)`;

  grid.style.gridTemplateRows =
    `repeat(${SIZE}, 1fr)`;

  const cells = [];

  for (
    let r = 0;
    r < SIZE;
    r++
  ) {

    cells.push([]);

    for (
      let c = 0;
      c < SIZE;
      c++
    ) {

      const cell =
        document.createElement(
          'div'
        );

      cell.className =
        'cell';

      cell.dataset.r =
        r;

      cell.dataset.c =
        c;

      cell.style.gridColumn =
        String(c + 1);

      cell.style.gridRow =
        String(r + 1);

      grid.appendChild(
        cell
      );

      cells[r].push(
        cell
      );
    }
  }

  return cells;
}

// ===== ОТДЕЛЬНЫЙ СЛОЙ ДЛЯ ИКОНОК КОРАБЛЕЙ =====
//
// ИСПРАВЛЕНО:
// Слой больше НЕ привязывается к родительскому контейнеру игрового поля.
//
// Он создаётся непосредственно в body и получает точные координаты
// самой сетки через getBoundingClientRect().
//
// Поэтому иконки не могут уехать за пределы игровой области
// из-за position, transform, padding или overflow родителя.
//
function getOrCreateShipLayer(
  gridEl
) {

  const layerId =
    gridEl.id +
    'ShipLayer';

  let layer =
    document.getElementById(
      layerId
    );

  if (!layer) {

    layer =
      document.createElement(
        'div'
      );

    layer.id =
      layerId;

    layer.className =
      'ship-layer';

    // ===== ГЛАВНОЕ ИСПРАВЛЕНИЕ =====
    // Используем fixed относительно окна браузера.
    layer.style.position =
      'fixed';

    layer.style.pointerEvents =
      'none';

    layer.style.zIndex =
      '99999';

    layer.style.display =
      'grid';

    layer.style.margin =
      '0';

    layer.style.padding =
      '0';

    layer.style.border =
      '0';

    layer.style.boxSizing =
      'content-box';

    document.body.appendChild(
      layer
    );
  }

  return layer;
}

// ===== ТОЧНАЯ СИНХРОНИЗАЦИЯ С ИГРОВЫМ ПОЛЕМ =====
function syncShipLayer(
  gridEl
) {

  const layer =
    getOrCreateShipLayer(
      gridEl
    );

  const cs =
    getComputedStyle(
      gridEl
    );

  const gridRect =
    gridEl.getBoundingClientRect();

  // ===== Border =====
  const borderLeft =
    parseFloat(
      cs.borderLeftWidth
    ) || 0;

  const borderTop =
    parseFloat(
      cs.borderTopWidth
    ) || 0;

  const borderRight =
    parseFloat(
      cs.borderRightWidth
    ) || 0;

  const borderBottom =
    parseFloat(
      cs.borderBottomWidth
    ) || 0;

  // ===== Padding =====
  const paddingLeft =
    parseFloat(
      cs.paddingLeft
    ) || 0;

  const paddingTop =
    parseFloat(
      cs.paddingTop
    ) || 0;

  const paddingRight =
    parseFloat(
      cs.paddingRight
    ) || 0;

  const paddingBottom =
    parseFloat(
      cs.paddingBottom
    ) || 0;

  // ===== Реальная область клеток =====
  const contentLeft =
    gridRect.left +
    borderLeft +
    paddingLeft;

  const contentTop =
    gridRect.top +
    borderTop +
    paddingTop;

  const contentWidth =
    gridRect.width -
    borderLeft -
    borderRight -
    paddingLeft -
    paddingRight;

  const contentHeight =
    gridRect.height -
    borderTop -
    borderBottom -
    paddingTop -
    paddingBottom;

  // ===== Позиция слоя =====
  layer.style.left =
    contentLeft + 'px';

  layer.style.top =
    contentTop + 'px';

  layer.style.width =
    contentWidth + 'px';

  layer.style.height =
    contentHeight + 'px';

  // ===== Реальные размеры Grid =====
  layer.style.gridTemplateColumns =
    cs.gridTemplateColumns;

  layer.style.gridTemplateRows =
    cs.gridTemplateRows;

  layer.style.columnGap =
    cs.columnGap;

  layer.style.rowGap =
    cs.rowGap;

  return layer;
}

// ===== Рисуем силуэт корабля =====
function renderShipOverlay(
  gridEl,
  ship,
  imgSrc,
  isEnemy
) {

  const rows =
    ship.map(
      ([r]) => r
    );

  const cols =
    ship.map(
      ([, c]) => c
    );

  const minR =
    Math.min(...rows);

  const maxR =
    Math.max(...rows);

  const minC =
    Math.min(...cols);

  const maxC =
    Math.max(...cols);

  const vertical =
    maxR > minR;

  const layer =
    syncShipLayer(
      gridEl
    );

  const overlay =
    document.createElement(
      'div'
    );

  overlay.className =
    'ship-overlay' +
    (
      vertical
        ? ' vertical'
        : ''
    ) +
    (
      isEnemy
        ? ' enemy-ship'
        : ''
    );

  // ===== Точная привязка к клеткам =====
  overlay.style.gridColumn =
    `${minC + 1} / ${maxC + 2}`;

  overlay.style.gridRow =
    `${minR + 1} / ${maxR + 2}`;

  overlay.style.display =
    'flex';

  overlay.style.alignItems =
    'center';

  overlay.style.justifyContent =
    'center';

  overlay.style.overflow =
    'visible';

  overlay.style.minWidth =
    '0';

  overlay.style.minHeight =
    '0';

  overlay.style.pointerEvents =
    'none';

  layer.appendChild(
    overlay
  );

  // Получаем реальный размер области корабля.
  const overlayRect =
    overlay.getBoundingClientRect();

  const width =
    overlayRect.width;

  const height =
    overlayRect.height;

  const rotator =
    document.createElement(
      'div'
    );

  rotator.className =
    'ship-rotator';

  rotator.style.position =
    'absolute';

  rotator.style.left =
    '50%';

  rotator.style.top =
    '50%';

  rotator.style.display =
    'block';

  rotator.style.margin =
    '0';

  rotator.style.padding =
    '0';

  rotator.style.boxSizing =
    'border-box';

  rotator.style.transformOrigin =
    'center center';

  rotator.style.flex =
    'none';

  rotator.style.pointerEvents =
    'none';

  // ===== РАЗМЕР КОРАБЛЯ =====
  //
  // Только 3-клеточный корабль
  // получает увеличенный масштаб.
  //
  // Размер можно менять здесь:
  //
  // THREE_CELL_SHIP_SCALE = 1.10
  //
  const shipScale =
    ship.length === 3
      ? THREE_CELL_SHIP_SCALE
      : 1.00;

  if (vertical) {

    rotator.style.width =
      height + 'px';

    rotator.style.height =
      width + 'px';

    rotator.style.transform =
      `translate(-50%, -50%) rotate(90deg) scale(${shipScale})`;

  } else {

    rotator.style.width =
      width + 'px';

    rotator.style.height =
      height + 'px';

    rotator.style.transform =
      `translate(-50%, -50%) scale(${shipScale})`;
  }

  const img =
    document.createElement(
      'img'
    );

  img.src =
    imgSrc;

  img.alt =
    '';

  img.style.width =
    '100%';

  img.style.height =
    '100%';

  img.style.display =
    'block';

  img.style.objectFit =
    'fill';

  img.style.margin =
    '0';

  img.style.padding =
    '0';

  img.style.pointerEvents =
    'none';

  rotator.appendChild(
    img
  );

  overlay.appendChild(
    rotator
  );
}

// ===== Обновление клетки игрока =====
function updatePlayerCell(
  r,
  c
) {

  const cell =
    playerCells[r][c];

  const val =
    playerBoard[r][c];

  cell.className =
    'cell';

  if (val === 'ship') {

    cell.classList.add(
      'ship'
    );
  }

  if (val === 'hit') {

    cell.classList.add(
      'hit'
    );
  }

  if (val === 'sunk') {

    cell.classList.add(
      'sunk'
    );
  }

  if (val === 'miss') {

    cell.classList.add(
      'miss'
    );
  }
}

// ===== Обновление клетки врага =====
function updateEnemyCell(
  r,
  c
) {

  const cell =
    enemyCells[r][c];

  const val =
    enemyBoard[r][c];

  cell.className =
    'cell';

  // Корабль противника скрыт.
  // Показываем только результат выстрела.

  if (val === 'hit') {

    cell.classList.add(
      'hit'
    );
  }

  if (val === 'sunk') {

    cell.classList.add(
      'sunk'
    );
  }

  if (val === 'miss') {

    cell.classList.add(
      'miss'
    );
  }
}

// ===== Отрисовка поля игрока =====
function renderPlayerBoard() {

  for (
    let r = 0;
    r < SIZE;
    r++
  ) {

    for (
      let c = 0;
      c < SIZE;
      c++
    ) {

      updatePlayerCell(
        r,
        c
      );
    }
  }
}

// ===== Отрисовка поля врага =====
function renderEnemyBoard() {

  for (
    let r = 0;
    r < SIZE;
    r++
  ) {

    for (
      let c = 0;
      c < SIZE;
      c++
    ) {

      updateEnemyCell(
        r,
        c
      );
    }
  }
}

// ===== Анимация взрыва =====
function showExplosion(
  cellEl
) {

  const explosion =
    document.createElement(
      'div'
    );

  explosion.className =
    'explosion';

  cellEl.appendChild(
    explosion
  );

  setTimeout(
    () => {
      explosion.remove();
    },
    600
  );
}

// ===== Проверка потопления корабля =====
function checkSunk(
  board,
  ships,
  r,
  c
) {

  for (
    const ship of ships
  ) {

    if (
      ship.some(
        ([sr, sc]) =>
          sr === r &&
          sc === c
      )
    ) {

      const sunk =
        ship.every(
          ([sr, sc]) =>
            board[sr][sc] === 'hit' ||
            board[sr][sc] === 'sunk'
        );

      if (sunk) {

        ship.forEach(
          ([sr, sc]) => {

            board[sr][sc] =
              'sunk';
          }
        );

        return ship;
      }
    }
  }

  return null;
}

// ===== Проверка победы =====
function allSunk(
  board,
  ships
) {

  return ships.every(
    cells =>
      cells.every(
        ([r, c]) =>
          board[r][c] === 'sunk'
      )
  );
}

// ===== Выстрел игрока =====
function playerFire(
  r,
  c
) {

  if (
    gameOver ||
    !playerTurn
  ) {
    return;
  }

  const val =
    enemyBoard[r][c];

  if (
    val === 'hit' ||
    val === 'miss' ||
    val === 'sunk'
  ) {
    return;
  }

  const cellEl =
    enemyCells[r][c];

  if (
    val === 'ship'
  ) {

    // Попадание.
    // Клетка сразу становится красной.
    enemyBoard[r][c] =
      'hit';

    updateEnemyCell(
      r,
      c
    );

    showExplosion(
      cellEl
    );

    playHitSound();

    const sunkShip =
      checkSunk(
        enemyBoard,
        enemyShips,
        r,
        c
      );

    if (sunkShip) {

      // Только после того, как
      // ВСЕ клетки корабля найдены,
      // показываем его иконку.

      sunkShip.forEach(
        ([sr, sc]) => {

          updateEnemyCell(
            sr,
            sc
          );
        }
      );

      renderShipOverlay(
        document.getElementById(
          'enemyGrid'
        ),
        sunkShip,
        ENEMY_SHIP_IMG,
        true
      );

      statusEl_setSunk();
    }

    if (
      allSunk(
        enemyBoard,
        enemyShips
      )
    ) {

      endGame(true);

      return;
    }

    if (!sunkShip) {

      setStatus(
        'Попадание! Стреляйте ещё раз.'
      );
    }

  } else {

    // ===== ПРОМАХ =====

    enemyBoard[r][c] =
      'miss';

    updateEnemyCell(
      r,
      c
    );

    playMissSound();

    playerTurn =
      false;

    setStatus(
      'Промах! Ход компьютера...'
    );

    setTimeout(
      computerTurn,
      700
    );
  }
}

// ===== Сообщение о потоплении =====
function statusEl_setSunk() {

  setStatus(
    'Корабль противника потоплен! 💥'
  );
}

// ===== ИИ =====
let aiTargets = [];

function computerTurn() {

  if (gameOver) {
    return;
  }

  let r, c;

  if (
    aiTargets.length > 0
  ) {

    [r, c] =
      aiTargets.shift();

  } else {

    do {

      r =
        Math.floor(
          Math.random() * SIZE
        );

      c =
        Math.floor(
          Math.random() * SIZE
        );

    } while (
      playerBoard[r][c] === 'hit' ||
      playerBoard[r][c] === 'miss' ||
      playerBoard[r][c] === 'sunk'
    );
  }

  const cellEl =
    playerCells[r][c];

  if (
    playerBoard[r][c] === 'ship'
  ) {

    playerBoard[r][c] =
      'hit';

    updatePlayerCell(
      r,
      c
    );

    showExplosion(
      cellEl
    );

    playHitSound();

    addAdjacentTargets(
      r,
      c
    );

    const sunkShip =
      checkSunk(
        playerBoard,
        playerShips,
        r,
        c
      );

    if (sunkShip) {

      sunkShip.forEach(
        ([sr, sc]) => {

          updatePlayerCell(
            sr,
            sc
          );
        }
      );
    }

    if (
      allSunk(
        playerBoard,
        playerShips
      )
    ) {

      endGame(false);

      return;
    }

    setStatus(
      sunkShip
        ? 'Компьютер потопил ваш корабль! Его ход продолжается...'
        : 'Компьютер попал! Его ход продолжается...'
    );

    setTimeout(
      computerTurn,
      700
    );

  } else {

    playerBoard[r][c] =
      'miss';

    updatePlayerCell(
      r,
      c
    );

    playMissSound();

    playerTurn =
      true;

    setStatus(
      'Компьютер промахнулся. Ваш ход!'
    );
  }
}

// ===== Добавление соседних целей ИИ =====
function addAdjacentTargets(
  r,
  c
) {

  const candidates = [
    [r - 1, c],
    [r + 1, c],
    [r, c - 1],
    [r, c + 1]
  ];

  for (
    const [nr, nc]
    of candidates
  ) {

    if (
      nr >= 0 &&
      nr < SIZE &&
      nc >= 0 &&
      nc < SIZE &&
      playerBoard[nr][nc] !== 'hit' &&
      playerBoard[nr][nc] !== 'miss' &&
      playerBoard[nr][nc] !== 'sunk'
    ) {

      aiTargets.push([
        nr,
        nc
      ]);
    }
  }
}

// ===== Статус =====
function setStatus(
  text
) {

  document.getElementById(
    'status'
  ).textContent =
    text;
}

// ===== Завершение игры =====
function endGame(
  playerWon
) {

  gameOver =
    true;

  setStatus(
    playerWon
      ? '🎉 Вы победили! Весь флот противника потоплен.'
      : '💀 Поражение. Ваш флот уничтожен.'
  );

  if (playerWon) {

    playWinSound();

  } else {

    playLoseSound();
  }
}

// ===== Новая игра =====
function newGame() {

  playerCells =
    buildGrid(
      'playerGrid'
    );

  enemyCells =
    buildGrid(
      'enemyGrid'
    );

  playerBoard =
    createEmptyBoard();

  enemyBoard =
    createEmptyBoard();

  playerShips =
    placeShips(
      playerBoard
    );

  enemyShips =
    placeShips(
      enemyBoard
    );

  gameOver =
    false;

  playerTurn =
    true;

  aiTargets = [];

  renderPlayerBoard();

  renderEnemyBoard();

  refreshShipOverlays();

  setStatus(
    'Стреляйте по полю противника — кликните по клетке справа'
  );
}

// ===== Обновление силуэтов кораблей =====
function refreshShipOverlays() {

  document
    .querySelectorAll(
      '.ship-overlay'
    )
    .forEach(
      el => el.remove()
    );

  const doRender = () => {

    const playerGridEl =
      document.getElementById(
        'playerGrid'
      );

    // ===== СВОЙ ФЛОТ =====
    // Свои корабли игрок видит всегда.
    playerShips.forEach(
      ship =>
        renderShipOverlay(
          playerGridEl,
          ship,
          PLAYER_SHIP_IMG,
          false
        )
    );

    const enemyGridEl =
      document.getElementById(
        'enemyGrid'
      );

    // ===== ФЛОТ ПРОТИВНИКА =====
    //
    // В начале игры корабли НЕ рисуются.
    //
    // Иконка появляется только тогда,
    // когда ВСЕ клетки конкретного
    // корабля имеют состояние "sunk".

    enemyShips.forEach(
      ship => {

        if (
          ship.every(
            ([r, c]) =>
              enemyBoard[r][c] === 'sunk'
          )
        ) {

          renderShipOverlay(
            enemyGridEl,
            ship,
            ENEMY_SHIP_IMG,
            true
          );
        }
      }
    );
  };

  requestAnimationFrame(
    () =>
      requestAnimationFrame(
        doRender
      )
  );
}

// ===== Клик по клетке врага =====
document
  .getElementById(
    'enemyGrid'
  )
  .addEventListener(
    'click',
    function (e) {

      const cell =
        e.target.closest(
          '.cell'
        );

      if (!cell) {
        return;
      }

      playerFire(
        Number(
          cell.dataset.r
        ),
        Number(
          cell.dataset.c
        )
      );
    }
  );

// ===== Новая игра =====
document
  .getElementById(
    'newGameBtn'
  )
  .addEventListener(
    'click',
    newGame
  );

// ===== Звук =====
document
  .getElementById(
    'soundBtn'
  )
  .addEventListener(
    'click',
    function () {

      soundOn =
        !soundOn;

      this.textContent =
        soundOn
          ? '🔊 Звук: вкл'
          : '🔇 Звук: выкл';
    }
  );

// ===== Пересчёт при изменении размера окна =====
window.addEventListener(
  'resize',
  refreshShipOverlays
);

// ===== Пересчёт при прокрутке страницы =====
// Нужно потому, что слой находится поверх страницы
// и должен следовать за игровым полем.
window.addEventListener(
  'scroll',
  refreshShipOverlays
);

// ===== Запуск игры =====
newGame();

// ===== Дополнительный пересчёт после загрузки =====
window.addEventListener(
  'load',
  refreshShipOverlays
);