// ===== Константы игры =====
const SIZE = 8;                                   // размер поля 8x8 клеток
const SHIP_SIZES = [3, 2, 2, 1, 1];                // размеры кораблей флота (5 кораблей)

// ===== Пути к картинкам кораблей =====
const PLAYER_SHIP_IMG = 'player-cruiser.svg'; // синий крейсер — наш флот, виден всегда
const ENEMY_SHIP_IMG = 'enemy-tug.svg';        // красный буксир — флот врага, виден только когда потоплен

// ===== Пути к файлам звуков (можно положить свои mp3 с такими именами в папку sounds/) =====
const SOUND_FILES = {
  hit: 'hit.mp3',
  miss: 'miss.mp3',
  win: 'win.mp3',
  lose: 'lose.mp3',
};

// ===== Состояние игры (хранится в обычных переменных, без localStorage) =====
let playerBoard, enemyBoard;                       // два массива-поля: игрока и врага
let playerShips, enemyShips;                       // списки клеток каждого корабля (для проверки потопления)
let playerCells, enemyCells;                       // 2D-массивы DOM-элементов клеток (создаются один раз за игру)
let gameOver = false;                               // флаг окончания игры
let playerTurn = true;                               // чей сейчас ход (true = игрок)
let soundOn = true;                                   // включён ли звук

// ===== Web Audio API контекст для запасных (синтезированных) звуков =====
let audioCtx = null;                                   // создаём контекст лениво, по первому клику

function getAudioCtx() {
  if (!audioCtx) {                                       // если контекста ещё нет
    audioCtx = new (window.AudioContext || window.webkitAudioContext)(); // создаём новый
  }
  return audioCtx;                                        // возвращаем контекст
}

// ===== Универсальный проигрыватель: сначала пробуем реальный файл, если его нет — запасной звук =====
function playSound(key, fallbackFn) {
  if (!soundOn) return;                                    // если звук выключен — ничего не делаем
  const src = SOUND_FILES[key];                            // путь к реальному файлу
  const audio = new Audio(src);                            // создаём аудио-элемент
  let usedFallback = false;                                 // защита от двойного запуска запасного звука
  const runFallback = () => {                                // функция единоразового запуска запасного звука
    if (usedFallback) return;
    usedFallback = true;
    fallbackFn();
  };
  audio.addEventListener('error', runFallback);              // файл не найден/не поддерживается — играем запасной звук
  const playPromise = audio.play();                          // пытаемся воспроизвести реальный файл
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(runFallback);                           // браузер отказал в автоплее/файла нет — тоже запасной звук
  }
}

// Синтезированный звук ПОПАДАНИЯ — низкий резкий "взрыв" (запасной вариант)
function synthHitSound() {
  const ctx = getAudioCtx();                               // получаем аудио-контекст
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate); // буфер шума на 0.3 сек
  const data = noiseBuffer.getChannelData(0);              // получаем массив сэмплов канала
  for (let i = 0; i < data.length; i++) {                   // заполняем буфер случайным шумом
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length); // шум, затухающий к концу
  }
  const noise = ctx.createBufferSource();                   // источник звука из буфера шума
  noise.buffer = noiseBuffer;                                // подключаем буфер к источнику
  const filter = ctx.createBiquadFilter();                   // фильтр, чтобы шум звучал как взрыв
  filter.type = 'lowpass';                                    // пропускаем только низкие частоты
  filter.frequency.setValueAtTime(800, ctx.currentTime);      // частота среза фильтра
  const gain = ctx.createGain();                               // регулятор громкости
  gain.gain.setValueAtTime(0.5, ctx.currentTime);              // стартовая громкость
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3); // плавное затухание громкости
  noise.connect(filter).connect(gain).connect(ctx.destination); // соединяем цепочку узлов и выводим на динамики
  noise.start();                                                // запускаем воспроизведение
  noise.stop(ctx.currentTime + 0.3);                            // останавливаем через 0.3 секунды
}

// Синтезированный звук ПРОМАХА — короткий "всплеск" (запасной вариант)
function synthMissSound() {
  const ctx = getAudioCtx();                                     // получаем аудио-контекст
  const osc = ctx.createOscillator();                             // создаём генератор тона
  osc.type = 'sine';                                               // форма волны — синус (мягкий звук)
  osc.frequency.setValueAtTime(600, ctx.currentTime);              // начальная частота (Гц)
  osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.25); // плавное понижение частоты (эффект "плюх")
  const gain = ctx.createGain();                                    // регулятор громкости
  gain.gain.setValueAtTime(0.3, ctx.currentTime);                   // стартовая громкость
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25); // затухание
  osc.connect(gain).connect(ctx.destination);                        // соединяем генератор -> громкость -> динамики
  osc.start();                                                       // запускаем звук
  osc.stop(ctx.currentTime + 0.25);                                  // останавливаем через 0.25 сек
}

// Синтезированная короткая победная фанфара (запасной вариант)
function synthWinSound() {
  const ctx = getAudioCtx();
  const notes = [523.25, 659.25, 783.99, 1046.5];                     // до-ми-соль-до (мажорное трезвучие вверх)
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + i * 0.12);
    osc.stop(ctx.currentTime + i * 0.12 + 0.3);
  });
}

// Синтезированный короткий грустный сигнал поражения (запасной вариант)
function synthLoseSound() {
  const ctx = getAudioCtx();
  const notes = [392, 349.23, 293.66];                                // соль-фа-ре (нисходящее движение)
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.18);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + i * 0.18);
    osc.stop(ctx.currentTime + i * 0.18 + 0.35);
  });
}

function playHitSound() { playSound('hit', synthHitSound); }          // публичная функция звука попадания
function playMissSound() { playSound('miss', synthMissSound); }       // публичная функция звука промаха
function playWinSound() { playSound('win', synthWinSound); }          // публичная функция звука победы
function playLoseSound() { playSound('lose', synthLoseSound); }       // публичная функция звука поражения

// ===== Создание пустого поля SIZE x SIZE, заполненного null =====
function createEmptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null)); // массив строк, каждая строка — массив клеток
}

// ===== Случайная расстановка кораблей на поле =====
function placeShips(board) {
  const ships = [];                                           // сюда сложим списки координат каждого корабля
  for (const size of SHIP_SIZES) {                              // для каждого размера корабля из списка
    let placed = false;                                         // флаг: корабль ещё не размещён
    while (!placed) {                                            // пробуем, пока не получится разместить
      const horizontal = Math.random() < 0.5;                    // случайно выбираем ориентацию: горизонтально/вертикально
      const row = Math.floor(Math.random() * SIZE);               // случайная стартовая строка
      const col = Math.floor(Math.random() * SIZE);               // случайный стартовый столбец
      const cells = [];                                            // координаты клеток текущего корабля
      let fits = true;                                              // предполагаем, что корабль поместится
      for (let i = 0; i < size; i++) {                              // проходим по длине корабля
        const r = horizontal ? row : row + i;                        // строка клетки (меняется, если вертикально)
        const c = horizontal ? col + i : col;                        // столбец клетки (меняется, если горизонтально)
        if (r >= SIZE || c >= SIZE || board[r][c] !== null) {          // если вышли за границы или клетка занята
          fits = false;                                                 // корабль не помещается — отмечаем
          break;                                                        // прерываем проверку
        }
        cells.push([r, c]);                                             // добавляем клетку в список корабля
      }
      if (fits && !hasAdjacentShip(board, cells)) {                     // если помещается и нет соседних кораблей вплотную
        cells.forEach(([r, c]) => board[r][c] = 'ship');                 // помечаем клетки как "корабль"
        ships.push(cells);                                                // сохраняем список клеток этого корабля
        placed = true;                                                    // корабль успешно размещён
      }
    }
  }
  return ships;                                                          // возвращаем все корабли поля
}

// Проверка: не соприкасается ли новый корабль с уже существующими (чтобы не лепились впритык)
function hasAdjacentShip(board, cells) {
  for (const [r, c] of cells) {                                          // для каждой клетки нового корабля
    for (let dr = -1; dr <= 1; dr++) {                                    // проверяем соседей по строкам (-1,0,1)
      for (let dc = -1; dc <= 1; dc++) {                                   // и по столбцам (-1,0,1)
        const nr = r + dr, nc = c + dc;                                     // координаты соседней клетки
        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr][nc] === 'ship') { // если сосед в пределах поля и это корабль
          return true;                                                        // значит есть соприкосновение — запрещаем
        }
      }
    }
  }
  return false;                                                             // соприкосновений не найдено
}

// ===== Создаёт DOM-сетку клеток один раз за игру и возвращает 2D-массив ссылок на клетки =====
function buildGrid(containerId) {
  const grid = document.getElementById(containerId);                       // находим контейнер сетки в DOM
  grid.innerHTML = '';                                                      // очищаем перед созданием новой игры
  const cells = [];                                                         // сюда сложим ссылки на DOM-клетки
  for (let r = 0; r < SIZE; r++) {                                          // проходим по строкам
    cells.push([]);                                                          // новая строка в массиве ссылок
    for (let c = 0; c < SIZE; c++) {                                         // и по столбцам
      const cell = document.createElement('div');                            // создаём div-клетку
      cell.className = 'cell';                                                // базовый класс клетки
      cell.dataset.r = r;                                                       // сохраняем координаты в data-атрибутах
      cell.dataset.c = c;
      grid.appendChild(cell);                                                   // добавляем клетку в сетку
      cells[r].push(cell);                                                       // сохраняем ссылку для быстрого доступа
    }
  }
  return cells;                                                              // возвращаем 2D-массив клеток
}

// ===== Рисует силуэт корабля СТРОГО над теми клетками, которые он занимает =====
// Вместо того чтобы полагаться на CSS-грид контейнера (что могло сдвигать иконку),
// берём реальные экранные координаты первой и последней клетки корабля
// и ставим силуэт как position:absolute ровно по этому прямоугольнику.
function renderShipOverlay(gridEl, cellsArr, ship, imgSrc, isEnemy) {
  const rows = ship.map(([r]) => r);                                        // все строки клеток корабля
  const cols = ship.map(([, c]) => c);                                       // все столбцы клеток корабля
  const minR = Math.min(...rows), maxR = Math.max(...rows);                   // границы по строкам
  const minC = Math.min(...cols), maxC = Math.max(...cols);                   // границы по столбцам
  const vertical = maxR > minR;                                              // корабль вертикальный, если строки различаются

  // контейнер сетки должен быть точкой отсчёта для абсолютного позиционирования
  if (getComputedStyle(gridEl).position === 'static') {
    gridEl.style.position = 'relative';
  }

  // реальные DOM-клетки начала и конца корабля
  const startCell = cellsArr[minR][minC];
  const endCell = cellsArr[maxR][maxC];

  // ВАЖНО: используем offsetLeft/offsetTop/offsetWidth/offsetHeight, а НЕ getBoundingClientRect.
  // offset-свойства всегда отражают истинное место клетки в раскладке (layout) страницы
  // и НЕ меняются от CSS transform/анимаций (например, "вспышка"/масштабирование при
  // попадании или потоплении). getBoundingClientRect же возвращает уже ВИЗУАЛЬНО
  // трансформированный прямоугольник — если измерить его ровно в момент срабатывания
  // CSS-анимации на клетке, силуэт мог "поймать" клетку в разгар анимации и встать
  // со сдвигом. offset-свойства от этой проблемы не зависят в принципе.
  // Оба измеряются относительно одного и того же offsetParent (это gridEl, т.к. мы
  // выставили ему position:relative выше), поэтому их можно напрямую вычитать друг из друга.
  const left = startCell.offsetLeft;
  const top = startCell.offsetTop;
  const width = (endCell.offsetLeft + endCell.offsetWidth) - startCell.offsetLeft;
  const height = (endCell.offsetTop + endCell.offsetHeight) - startCell.offsetTop;

  const overlay = document.createElement('div');                             // контейнер силуэта
  overlay.className = 'ship-overlay' + (vertical ? ' vertical' : '') + (isEnemy ? ' enemy-ship' : '');
  overlay.style.position = 'absolute';                                       // позиционируем поверх сетки
  overlay.style.left = left + 'px';
  overlay.style.top = top + 'px';
  overlay.style.width = width + 'px';
  overlay.style.height = height + 'px';
  overlay.style.display = 'flex';                                            // центрируем иконку внутри квадрата
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.pointerEvents = 'none';                                      // силуэт не должен перехватывать клики по клеткам
  overlay.style.zIndex = '2';                                                 // рисуем поверх клеток поля

  const rotator = document.createElement('div');                             // обёртка для поворота картинки
  rotator.className = 'ship-rotator';
  // до поворота задаём "горизонтальные" размеры (как будто корабль лежит боком),
  // чтобы после rotate(90deg) итоговый видимый прямоугольник точно совпал с overlay
  rotator.style.width = (vertical ? height : width) + 'px';
  rotator.style.height = (vertical ? width : height) + 'px';
  if (vertical) {
    rotator.style.transform = 'rotate(90deg)';
  }

  const img = document.createElement('img');                                 // сама картинка корабля
  img.src = imgSrc;
  img.alt = '';                                                               // декоративная картинка, текст не нужен
  img.style.width = '100%';
  img.style.height = '100%';
  img.style.display = 'block';
  img.style.objectFit = 'contain';                                           // иконка ровно вписывается в квадрат клеток

  rotator.appendChild(img);
  overlay.appendChild(rotator);
  gridEl.appendChild(overlay);                                               // добавляем силуэт поверх клеток
}

// ===== Отрисовка (обновление) клетки поля игрока =====
function updatePlayerCell(r, c) {
  const cell = playerCells[r][c];                                            // находим DOM-клетку
  const val = playerBoard[r][c];                                              // текущее состояние клетки
  cell.className = 'cell';                                                    // сбрасываем классы к базовому
  if (val === 'ship') cell.classList.add('ship');                              // показываем корабль игрока
  if (val === 'hit') cell.classList.add('hit');                                // показываем попадание по кораблю игрока
  if (val === 'sunk') cell.classList.add('sunk');                              // показываем потопленный корабль игрока
  if (val === 'miss') cell.classList.add('miss');                              // показываем промах компьютера
}

// ===== Отрисовка (обновление) клетки поля врага =====
function updateEnemyCell(r, c) {
  const cell = enemyCells[r][c];                                              // находим DOM-клетку
  const val = enemyBoard[r][c];                                                // состояние клетки (корабль скрыт от игрока)
  cell.className = 'cell';                                                     // сбрасываем классы к базовому
  if (val === 'hit') cell.classList.add('hit');                                 // показываем попадание
  if (val === 'sunk') cell.classList.add('sunk');                               // показываем потопленный корабль
  if (val === 'miss') cell.classList.add('miss');                               // показываем промах
}

// ===== Полная перерисовка всех клеток игрока (используется один раз при старте игры) =====
function renderPlayerBoard() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      updatePlayerCell(r, c);
    }
  }
}

// ===== Полная перерисовка всех клеток врага (используется один раз при старте игры) =====
function renderEnemyBoard() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      updateEnemyCell(r, c);
    }
  }
}

// ===== Показать анимацию взрыва в конкретной клетке DOM =====
function showExplosion(cellEl) {
  const boom = document.createElement('div');                                       // контейнер взрыва
  boom.className = 'explosion';                                                       // класс для позиционирования
  const core = document.createElement('div');                                          // яркое ядро взрыва
  core.className = 'core';
  boom.appendChild(core);                                                               // добавляем ядро в контейнер
  for (let i = 0; i < 8; i++) {                                                          // создаём 8 разлетающихся искр
    const spark = document.createElement('div');                                          // одна искра
    spark.className = 'spark';
    const angle = (Math.PI * 2 * i) / 8;                                                    // угол разлёта искры (по кругу)
    const dist = 26 + Math.random() * 10;                                                    // случайная дальность разлёта
    spark.style.setProperty('--dx', Math.cos(angle) * dist + 'px');                           // смещение по X через CSS-переменную
    spark.style.setProperty('--dy', Math.sin(angle) * dist + 'px');                           // смещение по Y через CSS-переменную
    boom.appendChild(spark);                                                                   // добавляем искру во взрыв
  }
  cellEl.appendChild(boom);                                                                     // вставляем взрыв в клетку
  setTimeout(() => boom.remove(), 550);                                                          // убираем взрыв из DOM после анимации
}

// ===== Проверка, потоплен ли корабль, которому принадлежит клетка (r,c) =====
function checkSunk(board, ships, r, c) {
  const ship = ships.find(cells => cells.some(([sr, sc]) => sr === r && sc === c)); // находим корабль по координате
  if (!ship) return null;                                                             // если корабль не найден — выходим
  const allHit = ship.every(([sr, sc]) => board[sr][sc] === 'hit' || board[sr][sc] === 'sunk'); // все ли клетки подбиты
  if (allHit) {                                                                         // если корабль весь подбит
    ship.forEach(([sr, sc]) => board[sr][sc] = 'sunk');                                   // помечаем все его клетки как "потоплен"
    return ship;                                                                           // возвращаем клетки потопленного корабля
  }
  return null;                                                                            // корабль ещё не потоплен
}

// ===== Проверка победы: все ли корабли на поле потоплены =====
function allSunk(board, ships) {
  return ships.every(cells => cells.every(([r, c]) => board[r][c] === 'sunk'));            // каждый корабль полностью потоплен
}

// ===== Выстрел игрока по клетке (r, c) вражеского поля =====
function playerFire(r, c) {
  if (gameOver || !playerTurn) return;                                                      // защита от лишних кликов
  const val = enemyBoard[r][c];
  if (val === 'hit' || val === 'miss' || val === 'sunk') return;                              // по этой клетке уже стреляли
  const cellEl = enemyCells[r][c];                                                            // находим DOM-элемент клетки
  if (val === 'ship') {                                                                       // если попали в корабль
    enemyBoard[r][c] = 'hit';                                                                     // помечаем клетку как попадание
    updateEnemyCell(r, c);                                                                        // обновляем внешний вид клетки
    showExplosion(cellEl);                                                                        // показываем анимацию взрыва
    playHitSound();                                                                                // проигрываем звук попадания
    const sunkShip = checkSunk(enemyBoard, enemyShips, r, c);                                      // проверяем, потоплен ли корабль
    if (sunkShip) {                                                                                // если корабль потоплен целиком
      sunkShip.forEach(([sr, sc]) => updateEnemyCell(sr, sc));                                       // обновляем все его клетки
      renderShipOverlay(document.getElementById('enemyGrid'), enemyCells, sunkShip, ENEMY_SHIP_IMG, true); // показываем силуэт вражеского корабля точно над его клетками
      statusEl_setSunk();                                                                             // сообщаем о потоплении
    }
    if (allSunk(enemyBoard, enemyShips)) {                                                          // если весь вражеский флот потоплен
      endGame(true);                                                                                 // игрок победил
      return;                                                                                         // выходим из функции
    }
    if (!sunkShip) setStatus('Попадание! Стреляйте ещё раз.');                                        // при попадании ход остаётся у игрока
  } else {                                                                                            // если промах
    enemyBoard[r][c] = 'miss';                                                                         // помечаем клетку как промах
    updateEnemyCell(r, c);                                                                             // обновляем внешний вид клетки
    playMissSound();                                                                                     // проигрываем звук промаха
    playerTurn = false;                                                                                   // ход переходит к компьютеру
    setStatus('Промах! Ход компьютера...');                                                                // сообщаем игроку
    setTimeout(computerTurn, 700);                                                                           // даём небольшую паузу перед ходом ИИ
  }
}

// Вспомогательная функция для отображения текста про потопленный корабль
function statusEl_setSunk() {
  setStatus('Корабль противника потоплен! 💥');                                                               // текст при потоплении
}

// ===== Простой ИИ компьютера: сначала случайный поиск, затем добивание вокруг попадания =====
let aiTargets = [];                                                                                             // очередь клеток-кандидатов для добивания после попадания

function computerTurn() {
  if (gameOver) return;                                                                                          // если игра окончена — не стреляем
  let r, c;                                                                                                       // координаты выстрела компьютера
  if (aiTargets.length > 0) {                                                                                     // если есть накопленные цели рядом с попаданием
    [r, c] = aiTargets.shift();                                                                                     // берём следующую цель из очереди
  } else {                                                                                                        // иначе стреляем случайно
    do {
      r = Math.floor(Math.random() * SIZE);                                                                         // случайная строка
      c = Math.floor(Math.random() * SIZE);                                                                         // случайный столбец
    } while (playerBoard[r][c] === 'hit' || playerBoard[r][c] === 'miss' || playerBoard[r][c] === 'sunk');          // пока не найдём ещё не стрелянную клетку
  }
  const cellEl = playerCells[r][c];                                                                                 // находим DOM-клетку поля игрока
  if (playerBoard[r][c] === 'ship') {                                                                                 // если компьютер попал
    playerBoard[r][c] = 'hit';                                                                                         // помечаем попадание
    updatePlayerCell(r, c);                                                                                            // обновляем внешний вид клетки
    showExplosion(cellEl);                                                                                             // показываем взрыв на поле игрока
    playHitSound();                                                                                                    // звук попадания
    addAdjacentTargets(r, c);                                                                                          // добавляем соседние клетки в очередь для добивания
    const sunkShip = checkSunk(playerBoard, playerShips, r, c);                                                        // проверяем потопление
    if (sunkShip) sunkShip.forEach(([sr, sc]) => updatePlayerCell(sr, sc));                                             // обновляем все клетки потопленного корабля
    if (allSunk(playerBoard, playerShips)) {                                                                            // если весь флот игрока потоплен
      endGame(false);                                                                                                     // компьютер победил
      return;                                                                                                             // выходим
    }
    setStatus(sunkShip ? 'Компьютер потопил ваш корабль! Его ход продолжается...' : 'Компьютер попал! Его ход продолжается...'); // статус
    setTimeout(computerTurn, 700);                                                                                        // компьютер стреляет ещё раз при попадании
  } else {                                                                                                              // если компьютер промахнулся
    playerBoard[r][c] = 'miss';                                                                                           // помечаем промах
    updatePlayerCell(r, c);                                                                                               // обновляем внешний вид клетки
    playMissSound();                                                                                                       // звук промаха
    playerTurn = true;                                                                                                      // ход возвращается к игроку
    setStatus('Компьютер промахнулся. Ваш ход!');                                                                            // сообщаем игроку
  }
}

// Добавляет соседние (вверх/вниз/влево/вправо) клетки от удачного попадания в очередь ИИ
function addAdjacentTargets(r, c) {
  const candidates = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];                                                  // четыре соседние клетки
  for (const [nr, nc] of candidates) {                                                                                    // проверяем каждую
    if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE &&                                                                    // в пределах поля
        playerBoard[nr][nc] !== 'hit' && playerBoard[nr][nc] !== 'miss' && playerBoard[nr][nc] !== 'sunk') {               // ещё не стреляная
      aiTargets.push([nr, nc]);                                                                                              // добавляем в очередь целей
    }
  }
}

// ===== Обновление текста статуса игры =====
function setStatus(text) {
  document.getElementById('status').textContent = text;                                                                   // просто меняем текст в статус-строке
}

// ===== Завершение игры =====
function endGame(playerWon) {
  gameOver = true;                                                                                                          // ставим флаг окончания
  setStatus(playerWon ? '🎉 Вы победили! Весь флот противника потоплен.' : '💀 Поражение. Ваш флот уничтожен.');              // финальное сообщение
  if (playerWon) playWinSound(); else playLoseSound();                                                                       // проигрываем звук победы/поражения
}

// ===== Запуск новой игры: пересоздаём поля и сетки, расставляем корабли, сбрасываем состояние =====
function newGame() {
  playerCells = buildGrid('playerGrid');                                                                                     // заново создаём DOM-клетки поля игрока
  enemyCells = buildGrid('enemyGrid');                                                                                       // заново создаём DOM-клетки поля врага

  playerBoard = createEmptyBoard();                                                                                          // пустое поле игрока
  enemyBoard = createEmptyBoard();                                                                                            // пустое поле врага
  playerShips = placeShips(playerBoard);                                                                                       // расставляем корабли игрока
  enemyShips = placeShips(enemyBoard);                                                                                          // расставляем корабли врага
  gameOver = false;                                                                                                              // сбрасываем флаг окончания
  playerTurn = true;                                                                                                              // ходит игрок первым
  aiTargets = [];                                                                                                                  // очищаем очередь целей ИИ

  renderPlayerBoard();                                                                                                               // отрисовываем состояние клеток игрока
  renderEnemyBoard();                                                                                                                 // отрисовываем состояние клеток врага

  refreshShipOverlays();                                                                                                                 // рисуем силуэт над каждым своим кораблём (и потопленными вражескими, если есть)

  setStatus('Стреляйте по полю противника — кликните по клетке справа');                                                            // стартовый текст статуса
}

// ===== Убирает все текущие силуэты и рисует их заново по актуальным координатам клеток =====
// Используется: сразу после старта игры (с двойным requestAnimationFrame, чтобы раскладка
// страницы — шрифты, картинки, адаптивные размеры — успела полностью стабилизироваться
// перед замером координат клеток), при ресайзе окна, а также сразу после полной загрузки страницы.
function refreshShipOverlays() {
  document.querySelectorAll('.ship-overlay').forEach(el => el.remove());                                                                 // убираем старые силуэты
  const doRender = () => {
    const playerGridEl = document.getElementById('playerGrid');
    playerShips.forEach(ship => renderShipOverlay(playerGridEl, playerCells, ship, PLAYER_SHIP_IMG, false));                              // свои корабли видны всегда
    const enemyGridEl = document.getElementById('enemyGrid');
    enemyShips.forEach(ship => {
      if (ship.every(([r, c]) => enemyBoard[r][c] === 'sunk')) {                                                                          // силуэт врага — только если корабль потоплен
        renderShipOverlay(enemyGridEl, enemyCells, ship, ENEMY_SHIP_IMG, true);
      }
    });
  };
  // двойной requestAnimationFrame гарантирует, что браузер уже завершил раскладку
  // (первый кадр — очистка применилась, второй — размеры клеток уже окончательные)
  requestAnimationFrame(() => requestAnimationFrame(doRender));
}

// ===== Клик по клетке вражеского поля — делегирование одним обработчиком на всю сетку =====
document.getElementById('enemyGrid').addEventListener('click', function (e) {
  const cell = e.target.closest('.cell');                                                                                              // находим клетку, по которой кликнули
  if (!cell) return;                                                                                                                    // клик был не по клетке (например, по силуэту корабля)
  playerFire(Number(cell.dataset.r), Number(cell.dataset.c));                                                                            // делаем выстрел по координатам клетки
});

// ===== Обработчик кнопки "Новая игра" =====
document.getElementById('newGameBtn').addEventListener('click', newGame);                                                              // при клике запускаем newGame()

// ===== Обработчик переключателя звука =====
document.getElementById('soundBtn').addEventListener('click', function () {
  soundOn = !soundOn;                                                                                                                     // инвертируем состояние звука
  this.textContent = soundOn ? '🔊 Звук: вкл' : '🔇 Звук: выкл';                                                                            // обновляем текст кнопки
});

// ===== Пересчитываем позиции силуэтов при изменении размера окна =====
// (например, на телефоне при повороте экрана клетки меняют размер — силуэты должны подстроиться)
window.addEventListener('resize', refreshShipOverlays);

// ===== Запускаем первую игру при загрузке страницы =====
newGame();                                                                                                                                  // вызываем сразу, чтобы поле появилось при открытии

// ===== Дополнительный пересчёт после полной загрузки страницы =====
// На случай, если шрифты, изображения фона или адаптивные стили ещё догружались
// в момент вызова newGame() и слегка изменили итоговый размер/положение клеток —
// пересчитываем силуэты ещё раз, когда все ресурсы страницы точно загружены.
window.addEventListener('load', refreshShipOverlays);