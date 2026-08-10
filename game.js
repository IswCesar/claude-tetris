'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7ec8e3', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const WILD = 8;        // celda comodín en el tablero
const DYE = 9;          // celda de la pieza de tinte (solo en vuelo/preview)
const DYE_EVERY = 5;   // líneas acumuladas para conceder una pieza de tinte
const WILD_SCORE = 25; // puntos por comodín eliminado (x nivel)

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const dyeBadge = document.getElementById('dye-badge');
const startOverlay = document.getElementById('start-overlay');
const startRecordsEl = document.getElementById('start-records');
const startBestCombo = document.getElementById('start-best-combo');
const startBestMaxLines = document.getElementById('start-best-maxlines');
const playBtn = document.getElementById('play-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');

const THEME_KEY = 'tetris-theme';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId,
    linesSinceDye, dyePending;

function applyTheme(theme) {
  document.body.classList.toggle('light-mode', theme === 'light');
  themeToggle.checked = theme === 'light';
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeToggle.addEventListener('change', () => {
  const theme = themeToggle.checked ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
});

initTheme();

// ---- Records (localStorage) ----
const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function loadRecords() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(r => r && typeof r.score === 'number')
      .map(r => ({
        name: String(r.name || 'ANON').slice(0, 12),
        score: r.score | 0,
        lines: r.lines | 0,
        level: r.level | 0,
        combo: r.combo | 0,
        maxLines: r.maxLines | 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECORDS);
  } catch (e) {
    return [];
  }
}

function saveRecords(list) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(list)); } catch (e) { /* storage bloqueado */ }
}

function qualifies(sc) {
  if (sc <= 0) return false;
  const list = loadRecords();
  return list.length < MAX_RECORDS || sc > list[list.length - 1].score;
}

function addRecord(entry) {
  const list = loadRecords();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, MAX_RECORDS);
  saveRecords(top);
  return top.indexOf(entry);
}

function resetRecords() { saveRecords([]); }

function bestStats() {
  const list = loadRecords();
  return {
    combo: list.reduce((m, r) => Math.max(m, r.combo), 0),
    maxLines: list.reduce((m, r) => Math.max(m, r.maxLines), 0),
  };
}

function renderRecords(container, highlightIndex) {
  const list = loadRecords();
  if (!list.length) {
    container.innerHTML = '<p class="records-empty">Sin records todavía</p>';
    return;
  }
  const rows = list.map((r, i) =>
    `<tr class="${i === highlightIndex ? 'record-new' : ''}">` +
    `<td>${i + 1}</td><td>${escapeHtml(r.name)}</td>` +
    `<td>${r.score.toLocaleString()}</td><td>${r.lines}</td><td>${r.combo}</td></tr>`
  ).join('');
  container.innerHTML =
    '<table class="records-table"><thead><tr>' +
    '<th>#</th><th>NOMBRE</th><th>PUNTOS</th><th>LÍN</th><th>COMBO</th>' +
    `</tr></thead><tbody>${rows}</tbody></table>`;
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function dyePiece() {
  return { type: DYE, shape: [[DYE, DYE], [DYE, DYE]], x: Math.floor(COLS / 2) - 1, y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

// Regla determinista: para cada columna ocupada por la pieza se mira la celda
// inmediatamente debajo de su bloque más bajo. Se ignoran suelo, vacíos y
// comodines. Gana el color más frecuente; en caso de empate, el de menor índice.
// Devuelve 0 si no hay ningún color objetivo.
function landingColor() {
  const shape = current.shape;
  const counts = new Array(8).fill(0);
  for (let c = 0; c < shape[0].length; c++) {
    let bottom = -1;
    for (let r = 0; r < shape.length; r++) if (shape[r][c]) bottom = r;
    if (bottom === -1) continue;
    const by = current.y + bottom + 1;
    const bx = current.x + c;
    if (by >= ROWS) continue;
    const v = board[by][bx];
    if (v >= 1 && v <= 7) counts[v]++;
  }
  let best = 0;
  for (let t = 1; t <= 7; t++) if (counts[t] > counts[best]) best = t;
  return best;
}

function applyDye() {
  const target = landingColor();
  merge();
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const v = board[r][c];
      if (v === DYE || (target && v === target)) board[r][c] = WILD;
    }
}

// Compacta cada columna hacia abajo (los bloques caen a los huecos que dejan los comodines).
function applyGravity() {
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (!board[r][c]) continue;
      if (write !== r) { board[write][c] = board[r][c]; board[r][c] = 0; }
      write--;
    }
  }
}

function scanFullRows() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  return cleared;
}

function clearLines() {
  let cleared = scanFullRows();
  if (!cleared) return;
  let gained = (LINE_SCORES[Math.min(cleared, 4)] || 0) * level;

  // cualquier línea completada consume TODOS los comodines supervivientes
  let wilds = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === WILD) { board[r][c] = 0; wilds++; }

  if (wilds) {
    applyGravity();
    const extra = scanFullRows(); // 1 pasada de cascada
    if (extra) {
      gained += (LINE_SCORES[Math.min(extra, 4)] || 0) * level;
      cleared += extra;
    }
  }

  lines += cleared;
  score += gained + wilds * WILD_SCORE * level;
  level = Math.floor(lines / 10) + 1;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);

  linesSinceDye += cleared;
  if (linesSinceDye >= DYE_EVERY) { linesSinceDye -= DYE_EVERY; dyePending = true; }

  updateHUD();
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.type === DYE) applyDye(); else merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  if (dyePending) { next = dyePiece(); dyePending = false; }
  else { next = randomPiece(); }
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;

  if (colorIndex >= WILD) {
    // comodín (8) y pieza de tinte (9): tinte arcoíris animado
    const hue = (performance.now() / 8 + (x + y) * 25) % 360;
    context.fillStyle = `hsl(${hue}, 85%, 60%)`;
    context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    context.fillStyle = 'rgba(255,255,255,0.35)';
    context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
    context.globalAlpha = 1;
    return;
  }

  const color = COLORS[colorIndex];
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid-color').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  dyeBadge.classList.toggle('hidden', next.type !== DYE);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
      if (gameOver) return;
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  linesSinceDye = 0;
  dyePending = false;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Pantalla de inicio ----
function updateStartStats() {
  const stats = bestStats();
  startBestCombo.textContent = stats.combo;
  startBestMaxLines.textContent = stats.maxLines;
}

function startGame() {
  startOverlay.classList.add('hidden');
  init();
}

playBtn.addEventListener('click', startGame);

resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todos los records?')) return;
  resetRecords();
  renderRecords(startRecordsEl);
  updateStartStats();
});

document.addEventListener('keydown', e => {
  if (!startOverlay.classList.contains('hidden')) {
    if (e.code === 'Enter') startGame();
    return;
  }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

renderRecords(startRecordsEl);
updateStartStats();
