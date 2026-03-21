// StackY game logic
import { PIECES } from './pieces.js';

export const COLS = 10, ROWS = 20, CELL = 28;

export const state = {
  board: Array.from({ length: ROWS }, () => Array(COLS).fill(0)),
  piece: null, nextPiece: null,
  score: 0, level: 1, lines: 0, gameOver: false,
  onLineClear: null, // renderer sets this callback
};

let dropTimer = 0, lastTime = 0;

function randomPiece() {
  const p = PIECES[Math.random() * PIECES.length | 0];
  return { shape: p.shapes[0], rot: 0, defs: p, x: (COLS - p.shapes[0][0].length) / 2 | 0, y: 0, color: p.color };
}

function collides(shape, px, py) {
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c]) {
        const x = px + c, y = py + r;
        if (x < 0 || x >= COLS || y >= ROWS) return true;
        if (y >= 0 && state.board[y][x]) return true;
      }
  return false;
}

function lock() {
  const p = state.piece;
  for (let r = 0; r < p.shape.length; r++)
    for (let c = 0; c < p.shape[r].length; c++)
      if (p.shape[r][c]) {
        const y = p.y + r;
        if (y < 0) { state.gameOver = true; return; }
        state.board[y][p.x + c] = p.color;
      }
  clearLines();
  spawn();
}

function clearLines() {
  const full = [];
  for (let r = 0; r < ROWS; r++)
    if (state.board[r].every(c => c)) full.push(r);
  if (!full.length) return;
  if (state.onLineClear) state.onLineClear(full);
  const pts = [0, 100, 300, 500, 800];
  state.score += (pts[full.length] || 800) * state.level;
  state.lines += full.length;
  state.level = (state.lines / 10 | 0) + 1;
  for (const r of full) { state.board.splice(r, 1); state.board.unshift(Array(COLS).fill(0)); }
}

function spawn() {
  state.piece = state.nextPiece || randomPiece();
  state.nextPiece = randomPiece();
  if (collides(state.piece.shape, state.piece.x, state.piece.y)) state.gameOver = true;
}

export function reset() {
  state.board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  state.score = 0; state.level = 1; state.lines = 0; state.gameOver = false;
  state.piece = null; state.nextPiece = null;
  spawn();
}

export function drop() {
  const p = state.piece;
  while (!collides(p.shape, p.x, p.y + 1)) p.y++;
  lock();
}

function move(dx) {
  if (!collides(state.piece.shape, state.piece.x + dx, state.piece.y)) state.piece.x += dx;
}

function rotate() {
  const p = state.piece;
  const next = (p.rot + 1) % p.defs.shapes.length;
  const shape = p.defs.shapes[next];
  // try wall kicks: 0, -1, +1, -2, +2
  for (const kick of [0, -1, 1, -2, 2]) {
    if (!collides(shape, p.x + kick, p.y)) {
      p.shape = shape; p.rot = next; p.x += kick; return;
    }
  }
}

function tick(time) {
  if (state.gameOver) { requestAnimationFrame(tick); return; }
  const dt = time - lastTime; lastTime = time;
  const speed = Math.max(50, 500 - (state.level - 1) * 40);
  dropTimer += dt;
  if (dropTimer >= speed) {
    dropTimer = 0;
    if (!collides(state.piece.shape, state.piece.x, state.piece.y + 1)) state.piece.y++;
    else lock();
  }
  window.gameState = { score: state.score, alive: !state.gameOver, gameOver: state.gameOver, level: state.level, lines: state.lines, player: state.piece ? { x: state.piece.x, y: state.piece.y } : null };
  requestAnimationFrame(tick);
}

// input
document.addEventListener('keydown', e => {
  if (state.gameOver) { if (e.key === 'r' || e.key === 'R') reset(); return; }
  const p = state.piece; if (!p) return;
  switch (e.key) {
    case 'ArrowLeft': move(-1); break;
    case 'ArrowRight': move(1); break;
    case 'ArrowDown':
      if (!collides(p.shape, p.x, p.y + 1)) { p.y++; state.score += 1; }
      break;
    case 'ArrowUp': rotate(); break;
    case ' ': drop(); break;
  }
  e.preventDefault();
});

// touch controls
let touchX = 0, touchY = 0;
document.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; });
document.addEventListener('touchend', e => {
  if (state.gameOver) { reset(); return; }
  const dx = e.changedTouches[0].clientX - touchX, dy = e.changedTouches[0].clientY - touchY;
  if (Math.abs(dx) < 20 && Math.abs(dy) < 20) { rotate(); return; }
  if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1);
  else if (dy > 0) drop();
});

// start
spawn();
requestAnimationFrame(tick);
