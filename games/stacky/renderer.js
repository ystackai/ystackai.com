/**
 * StackY Renderer — connects StackyGame engine to canvas display.
 *
 * Depends on: pieces.js (StackyPieces), game.js (StackyGame), input.js (StackyInput)
 * Loaded after all three in index.html.
 */
'use strict';

(function () {

  // ── Constants ──────────────────────────────────────────────────────────

  var P = StackyPieces;
  var CANVAS_W = 300;
  var CANVAS_H = 600;
  var CELL = CANVAS_W / P.COLS;  // 30px per cell

  /** Color palette — use Wonka candy colors from pieces.js, plus chocolate. */
  var PIECE_COLORS = StackyPieces.CANDY_COLORS.slice();
  // Index 8 = chocolate cell
  PIECE_COLORS[StackyGame.CHOCOLATE_CELL] = StackyPieces.CHOCOLATE_COLOR;

  var GHOST_ALPHA = 0.2;

  // ── Canvas setup ───────────────────────────────────────────────────────

  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  canvas.width = CANVAS_W * dpr;
  canvas.height = CANVAS_H * dpr;
  canvas.style.width = CANVAS_W + 'px';
  canvas.style.height = CANVAS_H + 'px';
  ctx.scale(dpr, dpr);

  // Side panel canvases
  var holdCanvas = document.getElementById('hold-canvas');
  var holdCtx = holdCanvas.getContext('2d');
  var nextCanvas = document.getElementById('next-canvas');
  var nextCtx = nextCanvas.getContext('2d');

  // Scale side panels for HiDPI
  function setupSmallCanvas(c, cx) {
    var w = c.width; var h = c.height;
    c.width = w * dpr; c.height = h * dpr;
    c.style.width = w + 'px'; c.style.height = h + 'px';
    cx.scale(dpr, dpr);
    return { w: w, h: h };
  }
  var holdSize = setupSmallCanvas(holdCanvas, holdCtx);
  var nextSize = setupSmallCanvas(nextCanvas, nextCtx);

  // ── Responsive scaling ─────────────────────────────────────────────────

  var wrapper = document.getElementById('canvas-wrapper');

  function applyResponsiveScale() {
    var available = window.innerWidth * 0.55;
    var scale = available < CANVAS_W ? available / CANVAS_W : 1;
    wrapper.style.transform = scale < 1 ? 'scale(' + scale + ')' : '';
    wrapper.style.marginBottom = scale < 1 ? (CANVAS_H * scale - CANVAS_H) + 'px' : '';
  }

  // ── UI refs ────────────────────────────────────────────────────────────

  var scoreEl = document.getElementById('score-display');
  var hiEl = document.getElementById('hi-display');
  var levelEl = document.getElementById('level-display');
  var linesEl = document.getElementById('lines-display');
  var splashEl = document.getElementById('overlay-splash');
  var pausedEl = document.getElementById('overlay-paused');
  var gameoverEl = document.getElementById('overlay-gameover');
  var goScoreEl = document.getElementById('go-score');
  var goHiEl = document.getElementById('go-hi');
  var btnStart = document.getElementById('btn-start');
  var btnRestart = document.getElementById('btn-restart');

  // ── Game state ─────────────────────────────────────────────────────────

  var state = StackyGame.createState();
  var rafId = null;
  var inputCleanup = null;

  hiEl.textContent = String(state.hi);

  // ── Score UI ───────────────────────────────────────────────────────────

  function updateScoreUI() {
    scoreEl.textContent = String(state.score);
    hiEl.textContent = String(state.hi);
    levelEl.textContent = String(state.level);
    linesEl.textContent = String(state.linesCleared);
  }

  // ── State transitions ─────────────────────────────────────────────────

  // ── Audio tracking state ──────────────────────────────────────────────
  var prevLines = 0;
  var prevChocolateRows = 0;

  function startGame() {
    StackyAudio.init();
    splashEl.classList.add('hidden');
    gameoverEl.classList.add('hidden');
    pausedEl.classList.add('hidden');
    StackyGame.start(state);
    prevLines = 0;
    prevChocolateRows = 0;
    updateScoreUI();
    startLoop();
  }

  function restartGame() {
    startGame();
  }

  // ── RAF loop ───────────────────────────────────────────────────────────

  var lastTs = null;

  function startLoop() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    lastTs = null;
    rafId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    lastTs = null;
  }

  function loop(ts) {
    if (lastTs === null) lastTs = ts;

    // Run gravity tick
    StackyGame.tick(state, ts);

    // Audio triggers: detect line clears, chocolate rises, piece locks
    if (state.linesCleared > prevLines) {
      StackyAudio.playLineClear();
      prevLines = state.linesCleared;
    }
    if (state.chocolateRowsRisen > prevChocolateRows) {
      StackyAudio.playChocolateRumble();
      prevChocolateRows = state.chocolateRowsRisen;
    }

    // Check phase transitions
    if (state.phase === 'gameOver') {
      StackyAudio.playGameOver();
      onGameOver();
      draw();
      StackyGame.syncGameState(state);
      return;
    }

    if (state.phase === 'paused') {
      pausedEl.classList.remove('hidden');
      draw();
      StackyGame.syncGameState(state);
      // Keep looping to detect resume
      rafId = requestAnimationFrame(loop);
      return;
    }

    pausedEl.classList.add('hidden');
    updateScoreUI();
    draw();
    drawHoldPanel();
    drawNextPanel();
    StackyGame.syncGameState(state);

    lastTs = ts;
    rafId = requestAnimationFrame(loop);
  }

  function onGameOver() {
    goScoreEl.textContent = String(state.score);
    goHiEl.textContent = String(state.hi);
    gameoverEl.classList.remove('hidden');
    stopLoop();
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  function draw() {
    // Background
    ctx.fillStyle = '#0d0d14';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    for (var x = 1; x < P.COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, CANVAS_H);
      ctx.stroke();
    }
    for (var y = 1; y < P.ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(CANVAS_W, y * CELL);
      ctx.stroke();
    }

    // Locked blocks
    for (var row = 0; row < P.ROWS; row++) {
      for (var col = 0; col < P.COLS; col++) {
        if (state.grid[row][col] !== 0) {
          drawCell(ctx, col, row, PIECE_COLORS[state.grid[row][col]], 1);
        }
      }
    }

    // Ghost piece
    if (state.activePiece && state.phase === 'playing') {
      var ghostY = StackyGame.getGhostY(state);
      var ghostPiece = {
        type: state.activePiece.type,
        rotation: state.activePiece.rotation,
        x: state.activePiece.x,
        y: ghostY,
      };
      var ghostCells = StackyPieces.getCells(ghostPiece);
      var colorIdx = StackyPieces.TYPES.indexOf(state.activePiece.type) + 1;
      for (var i = 0; i < ghostCells.length; i++) {
        var gc = ghostCells[i];
        if (gc.y >= 0) {
          drawCell(ctx, gc.x, gc.y, PIECE_COLORS[colorIdx], GHOST_ALPHA);
        }
      }
    }

    // Active piece
    if (state.activePiece) {
      var cells = StackyPieces.getCells(state.activePiece);
      var ci = StackyPieces.TYPES.indexOf(state.activePiece.type) + 1;
      for (var j = 0; j < cells.length; j++) {
        var c = cells[j];
        if (c.y >= 0) {
          drawCell(ctx, c.x, c.y, PIECE_COLORS[ci], 1);
        }
      }
    }
  }

  function drawCell(context, col, row, color, alpha) {
    var x = col * CELL;
    var y = row * CELL;
    var inset = 1;

    context.save();
    context.globalAlpha = alpha;

    // Main fill
    context.fillStyle = color;
    context.fillRect(x + inset, y + inset, CELL - inset * 2, CELL - inset * 2);

    // Top highlight
    context.fillStyle = 'rgba(255,255,255,0.2)';
    context.fillRect(x + inset, y + inset, CELL - inset * 2, 2);

    // Left highlight
    context.fillStyle = 'rgba(255,255,255,0.1)';
    context.fillRect(x + inset, y + inset, 2, CELL - inset * 2);

    // Bottom shadow
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.fillRect(x + inset, y + CELL - inset - 2, CELL - inset * 2, 2);

    context.restore();
  }

  // ── Side panel rendering ───────────────────────────────────────────────

  function drawPiecePreview(context, size, type) {
    context.clearRect(0, 0, size.w, size.h);
    context.fillStyle = '#1a1a2e';
    context.fillRect(0, 0, size.w, size.h);

    if (!type) return;

    var piece = { type: type, rotation: 0, x: 0, y: 0 };
    var cells = StackyPieces.getCells(piece);
    var colorIdx = StackyPieces.TYPES.indexOf(type) + 1;

    // Find bounding box
    var minX = 99, maxX = -1, minY = 99, maxY = -1;
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].x < minX) minX = cells[i].x;
      if (cells[i].x > maxX) maxX = cells[i].x;
      if (cells[i].y < minY) minY = cells[i].y;
      if (cells[i].y > maxY) maxY = cells[i].y;
    }

    var pw = maxX - minX + 1;
    var ph = maxY - minY + 1;
    var cellSize = Math.min((size.w - 20) / pw, (size.h - 20) / ph, 20);
    var offsetX = (size.w - pw * cellSize) / 2;
    var offsetY = (size.h - ph * cellSize) / 2;

    for (var j = 0; j < cells.length; j++) {
      var cx = offsetX + (cells[j].x - minX) * cellSize;
      var cy = offsetY + (cells[j].y - minY) * cellSize;

      context.fillStyle = PIECE_COLORS[colorIdx];
      context.fillRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2);

      context.fillStyle = 'rgba(255,255,255,0.2)';
      context.fillRect(cx + 1, cy + 1, cellSize - 2, 2);
    }
  }

  function drawHoldPanel() {
    drawPiecePreview(holdCtx, holdSize, state.heldPiece);
  }

  function drawNextPanel() {
    drawPiecePreview(nextCtx, nextSize, state.nextPiece);
  }

  // ── Input setup ────────────────────────────────────────────────────────

  function handleStateChange() {
    updateScoreUI();
    draw();
    drawHoldPanel();
    drawNextPanel();
    StackyGame.syncGameState(state);

    // Handle overlay transitions triggered by input
    if (state.phase === 'gameOver') {
      onGameOver();
    } else if (state.phase === 'paused') {
      pausedEl.classList.remove('hidden');
    } else if (state.phase === 'playing') {
      pausedEl.classList.add('hidden');
    }
  }

  inputCleanup = StackyInput.attach(state, {
    onStart: startGame,
    onRestart: restartGame,
    onStateChange: handleStateChange,
  });

  // Button handlers
  btnStart.addEventListener('click', function () { startGame(); });
  btnRestart.addEventListener('click', function () { restartGame(); });

  // ── Responsive ─────────────────────────────────────────────────────────

  window.addEventListener('resize', applyResponsiveScale);
  applyResponsiveScale();

  // ── Cleanup for HMR ───────────────────────────────────────────────────

  function cleanup() {
    stopLoop();
    if (inputCleanup) { inputCleanup(); inputCleanup = null; }
    window.removeEventListener('resize', applyResponsiveScale);
    state.phase = 'idle';
    state.alive = true;
    StackyGame.syncGameState(state);
    window._stackyInitialized = false;
  }

  if (typeof window.stackyDestroy === 'function' && window._stackyInitialized) {
    window.stackyDestroy();
  }
  window.stackyDestroy = cleanup;
  window._stackyInitialized = true;
  window.addEventListener('beforeunload', cleanup);

  // ── Initial state ──────────────────────────────────────────────────────

  StackyGame.syncGameState(state);
  draw();
  drawHoldPanel();
  drawNextPanel();

}());
