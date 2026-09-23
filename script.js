// ===== Константы игры =====
const SIZE = 8;
const SHIP_SIZES = [3, 2, 2, 1, 1];


// ===== Пути к картинкам кораблей =====
const PLAYER_SHIP_IMG = 'player-cruiser.svg';
const ENEMY_SHIP_IMG = 'enemy-tug.svg';


// ===== Пути к звукам =====
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
      new (
        window.AudioContext ||
        window.webkitAudioContext
      )();

  }

  return audioCtx;
}


// ===== Проигрывание звука =====
function playSound(key, fallbackFn) {

  if (!soundOn) return;

  const src =
    SOUND_FILES[key];

  const audio =
    new Audio(src);

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
        ctx.currentTime +
        i * 0.12 +
        0.3
      );


      osc
        .connect(gain)
        .connect(ctx.destination);


      osc.start(
        ctx.currentTime + i * 0.12
      );


      osc.stop(
        ctx.currentTime +
        i * 0.12 +
        0.3
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
        ctx.currentTime +
        i * 0.18 +
        0.35
      );


      osc
        .connect(gain)
        .connect(ctx.destination);


      osc.start(
        ctx.currentTime + i * 0.18
      );


      osc.stop(
        ctx.currentTime +
        i * 0.18 +
        0.35
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


// ============================================================
// СОЗДАНИЕ ПОЛЯ
// ============================================================


function createEmptyBoard() {

  return Array.from(
    { length: SIZE },
    () =>
      Array(SIZE).fill(null)
  );
}


// ============================================================
// РАССТАНОВКА КОРАБЛЕЙ
// ============================================================


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


// ============================================================
// ПРОВЕРКА СОСЕДСТВА КОРАБЛЕЙ
// ============================================================


function hasAdjacentShip(
  board,
  cells
) {

  for (
    const [r, c] of cells
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


// ============================================================
// СОЗДАНИЕ GRID
// ============================================================


function buildGrid(
  containerId
) {

  const grid =
    document.getElementById(
      containerId
    );


  grid.innerHTML =
    '';


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


      // Жёстко закрепляем клетку
      // за конкретной координатой Grid.

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


// ============================================================
// СЛОЙ ДЛЯ КОРАБЛЕЙ
// ============================================================
//
// ВАЖНО:
//
// Здесь больше НЕТ второй CSS Grid.
//
// Иконка корабля получает координаты непосредственно
// от настоящих клеток через getBoundingClientRect().
//
// Поэтому она физически привязывается к реальным клеткам.
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


  const parent =
    gridEl.parentElement;


  if (
    getComputedStyle(
      parent
    ).position === 'static'
  ) {

    parent.style.position =
      'relative';
  }


  if (!layer) {

    layer =
      document.createElement(
        'div'
      );


    layer.id =
      layerId;


    layer.className =
      'ship-layer';


    layer.style.position =
      'absolute';


    layer.style.left =
      '0';

    layer.style.top =
      '0';


    layer.style.width =
      '100%';

    layer.style.height =
      '100%';


    layer.style.pointerEvents =
      'none';


    layer.style.zIndex =
      '99999';


    layer.style.margin =
      '0';

    layer.style.padding =
      '0';

    layer.style.border =
      '0';


    layer.style.boxSizing =
      'border-box';


    parent.appendChild(
      layer
    );
  }


  return layer;
}


// ============================================================
// РИСОВАНИЕ КОРАБЛЯ
// ============================================================


function renderShipOverlay(
  gridEl,
  ship,
  imgSrc,
  isEnemy
) {

  if (
    !ship ||
    ship.length === 0
  ) {

    return;
  }


  const layer =
    getOrCreateShipLayer(
      gridEl
    );


  // --------------------------------------------------------
  // Получаем реальные клетки корабля
  // --------------------------------------------------------

  const shipCells =
    ship
      .map(
        ([r, c]) => {

          if (
            gridEl.id ===
            'playerGrid'
          ) {

            return playerCells[r][c];
          }


          return enemyCells[r][c];

        }
      )
      .filter(Boolean);


  if (
    shipCells.length === 0
  ) {

    return;
  }


  // --------------------------------------------------------
  // Получаем реальные координаты ВСЕХ клеток корабля
  // --------------------------------------------------------

  const rects =
    shipCells.map(
      cell =>
        cell.getBoundingClientRect()
    );


  // --------------------------------------------------------
  // Находим точные границы корабля
  // --------------------------------------------------------

  const left =
    Math.min(
      ...rects.map(
        rect => rect.left
      )
    );


  const top =
    Math.min(
      ...rects.map(
        rect => rect.top
      )
    );


  const right =
    Math.max(
      ...rects.map(
        rect => rect.right
      )
    );


  const bottom =
    Math.max(
      ...rects.map(
        rect => rect.bottom
      )
    );


  // Реальный размер всей области,
  // которую занимает корабль.
  //
  // 3 клетки -> иконка на 3 клетки
  // 2 клетки -> иконка на 2 клетки
  // 1 клетка -> иконка на 1 клетку

  const width =
    right - left;


  const height =
    bottom - top;


  if (
    width <= 0 ||
    height <= 0
  ) {

    return;
  }


  // --------------------------------------------------------
  // Определяем ориентацию корабля
  // --------------------------------------------------------

  const rows =
    ship.map(
      ([r]) => r
    );


  const vertical =
    Math.max(...rows) >
    Math.min(...rows);


  // --------------------------------------------------------
  // Получаем реальные координаты слоя
  // --------------------------------------------------------

  const layerRect =
    layer.getBoundingClientRect();


  // --------------------------------------------------------
  // Контейнер корабля
  // --------------------------------------------------------

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


  overlay.style.position =
    'absolute';


  // Позиция относительно реального слоя.
  // Это устраняет смещение из-за
  // границ/padding родителя.

  overlay.style.left =
    (
      left -
      layerRect.left
    ) + 'px';


  overlay.style.top =
    (
      top -
      layerRect.top
    ) + 'px';


  // Сам overlay всегда имеет ТОЧНЫЙ размер
  // выбранных клеток.

  overlay.style.width =
    width + 'px';


  overlay.style.height =
    height + 'px';


  overlay.style.margin =
    '0';


  overlay.style.padding =
    '0';


  overlay.style.border =
    '0';


  overlay.style.boxSizing =
    'border-box';


  overlay.style.display =
    'block';


  overlay.style.overflow =
    'visible';


  overlay.style.pointerEvents =
    'none';


  // --------------------------------------------------------
  // ПОВОРОТ КОРАБЛЯ
  // --------------------------------------------------------

  const rotator =
    document.createElement(
      'div'
    );


  rotator.className =
    'ship-rotator';


  rotator.style.position =
    'absolute';


  // Ставим rotator точно в центр overlay.

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


  // --------------------------------------------------------
  // ГОРИЗОНТАЛЬНЫЙ КОРАБЛЬ
  // --------------------------------------------------------

  if (!vertical) {

    // Иконка имеет точно такую же ширину
    // и высоту, как выбранные клетки.

    rotator.style.width =
      width + 'px';


    rotator.style.height =
      height + 'px';


    rotator.style.transform =
      'translate(-50%, -50%)';

  }


  // --------------------------------------------------------
  // ВЕРТИКАЛЬНЫЙ КОРАБЛЬ
  // --------------------------------------------------------

  else {

    // До поворота картинка горизонтальная.
    //
    // Если корабль занимает:
    //
    // 1 клетку по ширине
    // 3 клетки по высоте
    //
    // до поворота:
    //
    // width  = 3 клетки
    // height = 1 клетка
    //
    // после rotate(90deg):
    //
    // width  = 1 клетка
    // height = 3 клетки

    rotator.style.width =
      height + 'px';


    rotator.style.height =
      width + 'px';


    rotator.style.transform =
      'translate(-50%, -50%) rotate(90deg)';

  }


  // --------------------------------------------------------
  // КАРТИНКА КОРАБЛЯ
  // --------------------------------------------------------

  const img =
    document.createElement(
      'img'
    );


  img.src =
    imgSrc;


  img.alt =
    '';


  img.draggable =
    false;


  // Картинка занимает весь rotator.
  //
  // Поэтому размер автоматически зависит
  // от количества клеток корабля.

  img.style.width =
    '100%';


  img.style.height =
    '100%';


  img.style.display =
    'block';


  img.style.margin =
    '0';


  img.style.padding =
    '0';


  img.style.border =
    '0';


  img.style.boxSizing =
    'border-box';


  img.style.objectFit =
    'fill';


  img.style.pointerEvents =
    'none';


  img.style.userSelect =
    'none';


  // --------------------------------------------------------
  // Собираем корабль
  // --------------------------------------------------------

  rotator.appendChild(
    img
  );


  overlay.appendChild(
    rotator
  );


  layer.appendChild(
    overlay
  );
}


// ============================================================
// ОБНОВЛЕНИЕ КЛЕТКИ ИГРОКА
// ============================================================


function updatePlayerCell(
  r,
  c
) {

  const cell =
    playerCells[r][c];


  cell.classList.remove(
    'ship',
    'hit',
    'miss',
    'sunk'
  );


  const value =
    playerBoard[r][c];


  if (
    value === 'ship'
  ) {

    cell.classList.add(
      'ship'
    );
  }


  if (
    value === 'hit'
  ) {

    cell.classList.add(
      'hit'
    );
  }


  if (
    value === 'miss'
  ) {

    cell.classList.add(
      'miss'
    );
  }


  if (
    value === 'sunk'
  ) {

    cell.classList.add(
      'sunk'
    );
  }
}


// ============================================================
// ОБНОВЛЕНИЕ КЛЕТКИ ВРАГА
// ============================================================


function updateEnemyCell(
  r,
  c
) {

  const cell =
    enemyCells[r][c];


  cell.classList.remove(
    'ship',
    'hit',
    'miss',
    'sunk'
  );


  const value =
    enemyBoard[r][c];


  if (
    value === 'ship'
  ) {

    cell.classList.add(
      'ship'
    );
  }


  if (
    value === 'hit'
  ) {

    cell.classList.add(
      'hit'
    );
  }


  if (
    value === 'miss'
  ) {

    cell.classList.add(
      'miss'
    );
  }


  if (
    value === 'sunk'
  ) {

    cell.classList.add(
      'sunk'
    );
  }
}


// ============================================================
// ОТОБРАЖЕНИЕ ПОЛЯ ИГРОКА
// ============================================================


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


// ============================================================
// ОТОБРАЖЕНИЕ ПОЛЯ ВРАГА
// ============================================================


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


// ============================================================
// ВЗРЫВ
// ============================================================


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
    500
  );
}


// ============================================================
// ПРОВЕРКА ПОТОПЛЕНИЯ
// ============================================================


function checkSunk(
  board,
  ships,
  r,
  c
) {

  const ship =
    ships.find(
      cells =>
        cells.some(
          ([sr, sc]) =>
            sr === r &&
            sc === c
        )
    );


  if (!ship) {

    return null;
  }


  const isSunk =
    ship.every(
      ([sr, sc]) =>
        board[sr][sc] === 'hit' ||
        board[sr][sc] === 'sunk'
    );


  if (isSunk) {

    ship.forEach(
      ([sr, sc]) => {

        board[sr][sc] =
          'sunk';

      }
    );


    return ship;
  }


  return null;
}


// ============================================================
// ПРОВЕРКА ВСЕХ ПОТОПЛЕННЫХ КОРАБЛЕЙ
// ============================================================


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


// ============================================================
// ВЫСТРЕЛ ИГРОКА
// ============================================================


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

      sunkShip.forEach(
        ([sr, sc]) =>
          updateEnemyCell(
            sr,
            sc
          )
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

      endGame(
        true
      );


      return;
    }


    if (!sunkShip) {

      setStatus(
        'Попадание! Стреляйте ещё раз.'
      );

    }

  }


  else {

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


// ============================================================
// СТАТУС ПОТОПЛЕНИЯ
// ============================================================


function statusEl_setSunk() {

  setStatus(
    'Корабль противника потоплен! 💥'
  );
}


// ============================================================
// ИИ
// ============================================================


let aiTargets = [];


function computerTurn() {

  if (gameOver) {

    return;
  }


  let r, c;


  if (
    aiTargets.length > 0
  ) {

    [
      r,
      c
    ] =
      aiTargets.shift();

  }


  else {

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
        ([sr, sc]) =>
          updatePlayerCell(
            sr,
            sc
          )
      );
    }


    if (
      allSunk(
        playerBoard,
        playerShips
      )
    ) {

      endGame(
        false
      );


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

  }


  else {

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


// ============================================================
// ДОБАВЛЕНИЕ ЦЕЛЕЙ ИИ
// ============================================================


function addAdjacentTargets(
  r,
  c
) {

  const candidates = [

    [
      r - 1,
      c
    ],

    [
      r + 1,
      c
    ],

    [
      r,
      c - 1
    ],

    [
      r,
      c + 1
    ]

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


// ============================================================
// СТАТУС
// ============================================================


function setStatus(
  text
) {

  const status =
    document.getElementById(
      'status'
    );


  if (status) {

    status.textContent =
      text;
  }
}


// ============================================================
// КОНЕЦ ИГРЫ
// ============================================================


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

  }


  else {

    playLoseSound();

  }
}


// ============================================================
// ОБНОВЛЕНИЕ ВСЕХ ИКОНОК КОРАБЛЕЙ
// ============================================================


function refreshShipOverlays() {

  document
    .querySelectorAll(
      '.ship-overlay'
    )
    .forEach(
      el =>
        el.remove()
    );


  const doRender =
    () => {

      const playerGridEl =
        document.getElementById(
          'playerGrid'
        );


      if (
        playerGridEl &&
        playerShips
      ) {

        playerShips.forEach(
          ship =>
            renderShipOverlay(
              playerGridEl,
              ship,
              PLAYER_SHIP_IMG,
              false
            )
        );
      }


      const enemyGridEl =
        document.getElementById(
          'enemyGrid'
        );


      if (
        enemyGridEl &&
        enemyShips
      ) {

        enemyShips.forEach(
          ship => {

            const isSunk =
              ship.every(
                ([r, c]) =>
                  enemyBoard[r][c] ===
                  'sunk'
              );


            if (isSunk) {

              renderShipOverlay(
                enemyGridEl,
                ship,
                ENEMY_SHIP_IMG,
                true
              );
            }
          }
        );
      }
    };


  // Два кадра нужны, чтобы браузер успел
  // окончательно рассчитать размеры клеток.

  requestAnimationFrame(
    () => {

      requestAnimationFrame(
        doRender
      );

    }
  );
}


// ============================================================
// НОВАЯ ИГРА
// ============================================================


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


// ============================================================
// КЛИК ПО ВРАЖЕСКОМУ ПОЛЮ
// ============================================================


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


// ============================================================
// КНОПКА НОВОЙ ИГРЫ
// ============================================================


document
  .getElementById(
    'newGameBtn'
  )
  .addEventListener(
    'click',
    newGame
  );


// ============================================================
// КНОПКА ЗВУКА
// ============================================================


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


// ============================================================
// RESIZE
// ============================================================


window.addEventListener(
  'resize',
  refreshShipOverlays
);


// ============================================================
// ЗАПУСК ИГРЫ
// ============================================================


newGame();


// ============================================================
// ПЕРЕСЧЁТ ПОСЛЕ ПОЛНОЙ ЗАГРУЗКИ
// ============================================================


window.addEventListener(
  'load',
  refreshShipOverlays
);