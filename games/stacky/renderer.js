// StackY renderer — candy theme, ghost piece, line clear animations
// Imports state from game.js: { board, piece, nextPiece, score, level, lines, gameOver, cols, rows, drop(), reset() }
import { state, COLS, ROWS, CELL, drop, reset } from './game.js';

const CANDY = ['#f472b6','#a78bfa','#38bdf8','#34d399','#fbbf24','#fb923c','#f87171'];
const BG = '#1a1025';
const GRID_LINE = 'rgba(255,255,255,.04)';

// --- canvas setup ---
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
canvas.width = COLS * CELL;
canvas.height = ROWS * CELL;

const nextCanvas = document.getElementById('next');
const nctx = nextCanvas.getContext('2d');
nextCanvas.width = nextCanvas.height = 4 * CELL;

const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const overlay = document.getElementById('overlay');

// --- line clear flash state ---
let clearingRows = [];
let clearFlash = 0;
const FLASH_FRAMES = 12;

export function triggerLineClear(rows) {
  clearingRows = rows;
  clearFlash = FLASH_FRAMES;
}

// --- ghost piece ---
function ghostY() {
  const p = state.piece;
  if (!p) return null;
  let gy = p.y;
  while (canPlace(p.shape, p.x, gy + 1)) gy++;
  return gy;
}
function canPlace(shape, px, py) {
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c]) {
        const x = px + c, y = py + r;
        if (x < 0 || x >= COLS || y >= ROWS) return false;
        if (y >= 0 && state.board[y][x]) return false;
      }
  return true;
}

// --- draw helpers ---
function drawCell(context, x, y, color, alpha = 1) {
  const px = x * CELL, py = y * CELL, pad = 1;
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.beginPath();
  context.roundRect(px + pad, py + pad, CELL - pad * 2, CELL - pad * 2, 4);
  context.fill();
  // candy highlight
  context.fillStyle = 'rgba(255,255,255,.25)';
  context.beginPath();
  context.roundRect(px + pad + 2, py + pad + 2, CELL - pad * 2 - 4, (CELL - pad * 2) * .35, [3, 3, 0, 0]);
  context.fill();
  context.globalAlpha = 1;
}

// --- main draw ---
function draw() {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // grid
  ctx.strokeStyle = GRID_LINE;
  ctx.lineWidth = 1;
  for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, canvas.height); ctx.stroke(); }
  for (let y = 1; y < ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(canvas.width, y * CELL); ctx.stroke(); }

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (state.board[r][c]) {
        const flashing = clearFlash > 0 && clearingRows.includes(r);
        if (flashing && Math.floor(clearFlash / 2) % 2)
          drawCell(ctx, c, r, '#fff');
        else
          drawCell(ctx, c, r, CANDY[(state.board[r][c] - 1) % CANDY.length]);
      }

  // ghost piece
  const p = state.piece;
  if (p && !state.gameOver) {
    const gy = ghostY();
    if (gy !== p.y)
      for (let r = 0; r < p.shape.length; r++)
        for (let c = 0; c < p.shape[r].length; c++)
          if (p.shape[r][c]) drawCell(ctx, p.x + c, gy + r, CANDY[(p.color - 1) % CANDY.length], .2);

    // active piece
    for (let r = 0; r < p.shape.length; r++)
      for (let c = 0; c < p.shape[r].length; c++)
        if (p.shape[r][c]) drawCell(ctx, p.x + c, p.y + r, CANDY[(p.color - 1) % CANDY.length]);
  }

  // flash countdown
  if (clearFlash > 0) clearFlash--;
  if (clearFlash === 0) clearingRows = [];

  // side panel
  scoreEl.textContent = state.score;
  levelEl.textContent = state.level;
  linesEl.textContent = state.lines;

  // next piece preview
  nctx.fillStyle = 'transparent';
  nctx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (state.nextPiece) {
    const np = state.nextPiece;
    const ox = Math.floor((4 - np.shape[0].length) / 2);
    const oy = Math.floor((4 - np.shape.length) / 2);
    for (let r = 0; r < np.shape.length; r++)
      for (let c = 0; c < np.shape[r].length; c++)
        if (np.shape[r][c]) drawCell(nctx, ox + c, oy + r, CANDY[(np.color - 1) % CANDY.length]);
  }

  // overlay
  overlay.style.display = state.gameOver ? 'flex' : 'none';

  // expose gameState for automated testing
  window.gameState = {
    score: state.score,
    alive: !state.gameOver,
    gameOver: state.gameOver,
    level: state.level,
    lines: state.lines,
    player: state.piece ? { x: state.piece.x, y: state.piece.y } : null
  };

  requestAnimationFrame(draw);
}

// start render loop
draw();
