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
const skinSelect = document.getElementById('skin-select');

const THEME_KEY = 'tetris-theme';
const SKIN_KEY = 'tetris-skin';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId,
    linesSinceDye, dyePending, currentSkin;

// Colores pastel propios (derivados de COLORS con más blanco mezclado).
const PASTEL_COLORS = [
  null,
  '#bfeaf0', // I
  '#fdeeb8', // O
  '#e3c6ec', // T
  '#c9e8cb', // S
  '#f2c6c6', // Z
  '#c3e2ef', // J
  '#fdddb8', // L
];

// Mezcla un color hex con negro/blanco en la proporción `amount` (0-1).
function mixColor(hex, amount, withBlack) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const target = withBlack ? 0 : 255;
  r = Math.round(r + (target - r) * amount);
  g = Math.round(g + (target - g) * amount);
  b = Math.round(b + (target - b) * amount);
  return `rgb(${r}, ${g}, ${b})`;
}

const SKINS = {
  retro: {
    label: 'Retro',
    render(context, x, y, colorIndex, size, alpha) {
      const color = COLORS[colorIndex];
      context.fillStyle = color;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
    },
  },
  neon: {
    label: 'Neon',
    render(context, x, y, colorIndex, size, alpha) {
      const color = COLORS[colorIndex];
      const px = x * size + 1;
      const py = y * size + 1;
      const s = size - 2;
      context.fillStyle = mixColor(color, 0.75, true);
      context.fillRect(px, py, s, s);
      context.shadowBlur = 12;
      context.shadowColor = color;
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.strokeRect(px + 1, py + 1, s - 2, s - 2);
      // restaura el estado del contexto (el glow no debe contaminar el resto del frame)
      context.shadowBlur = 0;
      context.shadowColor = 'transparent';
      context.lineWidth = 1;
    },
  },
  pastel: {
    label: 'Pastel',
    render(context, x, y, colorIndex, size, alpha) {
      const color = PASTEL_COLORS[colorIndex];
      const px = x * size + 1;
      const py = y * size + 1;
      const s = size - 2;
      const radius = Math.min(6, s / 4);
      context.beginPath();
      if (typeof context.roundRect === 'function') {
        context.roundRect(px, py, s, s, radius);
      } else {
        context.moveTo(px + radius, py);
        context.lineTo(px + s - radius, py);
        context.quadraticCurveTo(px + s, py, px + s, py + radius);
        context.lineTo(px + s, py + s - radius);
        context.quadraticCurveTo(px + s, py + s, px + s - radius, py + s);
        context.lineTo(px + radius, py + s);
        context.quadraticCurveTo(px, py + s, px, py + s - radius);
        context.lineTo(px, py + radius);
        context.quadraticCurveTo(px, py, px + radius, py);
        context.closePath();
      }
      context.fillStyle = color;
      context.fill();
    },
  },
  pixel: {
    label: 'Pixel Art',
    render(context, x, y, colorIndex, size, alpha) {
      const color = COLORS[colorIndex];
      const px = x * size + 1;
      const py = y * size + 1;
      const s = size - 2;
      context.fillStyle = color;
      context.fillRect(px, py, s, s);

      // patrón de textura: cuadrícula 3x3 tipo dither/checkerboard
      const cell = s / 3;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          context.fillStyle = (i + j) % 2 === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
          context.fillRect(px + i * cell, py + j * cell, cell, cell);
        }
      }

      context.strokeStyle = mixColor(color, 0.5, true);
      context.lineWidth = 1;
      context.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
    },
  },
};

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

function applySkin(skin) {
  currentSkin = SKINS[skin] ? skin : 'retro';
  document.body.classList.remove('skin-retro', 'skin-neon', 'skin-pastel', 'skin-pixel');
  document.body.classList.add(`skin-${currentSkin}`);
  if (skinSelect) skinSelect.value = currentSkin;
}

function initSkin() {
  let saved = null;
  try {
    saved = localStorage.getItem(SKIN_KEY);
  } catch (e) { /* localStorage no disponible */ }
  applySkin(saved); // applySkin ya valida y usa 'retro' como fallback
}

if (skinSelect) {
  skinSelect.addEventListener('change', () => {
    applySkin(skinSelect.value);
    try {
      localStorage.setItem(SKIN_KEY, currentSkin);
    } catch (e) { /* localStorage no disponible */ }
    draw();
    drawNext();
  });
}

initSkin();

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
    // comodín (8) y pieza de tinte (9): tinte arcoíris animado (igual en todos los skins)
    const hue = (performance.now() / 8 + (x + y) * 25) % 360;
    context.fillStyle = `hsl(${hue}, 85%, 60%)`;
    context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    context.fillStyle = 'rgba(255,255,255,0.35)';
    context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
    context.globalAlpha = 1;
    return;
  }

  const skin = SKINS[currentSkin] || SKINS.retro;
  skin.render(context, x, y, colorIndex, size, alpha);

  // restaura el estado del contexto por si el renderer del skin lo modificó
  context.shadowBlur = 0;
  context.globalAlpha = 1;
  context.lineWidth = 1;
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

document.addEventListener('keydown', e => {
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

init();
