/**
 * StackY Renderer — connects StackyGame engine to canvas display.
 *
 * Depends on: pieces.js (StackyPieces), game.js (StackyGame), input.js (StackyInput)
 * Loaded after all three in index.html.
 */
'use strict';

(function () {

  // ── Constants ──────────────────────────────────────────────────────────

  var COLS = StackyGame.COLS;
  var ROWS = StackyGame.ROWS;
  var CANVAS_W = 300;
  var CANVAS_H = 600;
  var CELL = CANVAS_W / COLS;  // 30px per cell

  /** Color palette for piece types (indexed by TYPES order + 1). */
  var PIECE_COLORS = [
    null,       // 0 = empty
    '#00f0f0',  // 1 = I (cyan)
    '#f0f000',  // 2 = O (yellow)
    '#a000f0',  // 3 = T (purple)
    '#00f000',  // 4 = S (green)
    '#f00000',  // 5 = Z (red)
    '#f0a000',  // 6 = L (orange)
    '#0000f0',  // 7 = J (blue)
  ];

  /** Candy glow palette (matching PIECE_COLORS order). */
  var PIECE_GLOW = [
    null,
    '#7ff8f8',  // I
    '#f8f87f',  // O
    '#d07ff8',  // T
    '#7ff87f',  // S
    '#f87f7f',  // Z
    '#f8d07f',  // L
    '#7f7ff8',  // J
  ];

  var GHOST_ALPHA = 0.2;

// --- line clear animation state ---
   var clearingRows = [];
   var clearFlash = 0;
   var FLASH_FRAMES = 20;

   // --- screen shake ---
   var shakeIntensity = 0;
   var shakeDecay = 0.92;

   // --- piece spin/land animation state ---
   var pieceSpinAngle = 0;
   var pieceLandTargetY = null;
   var pieceLandAnimation = false;

   // --- particles ---
   var particles = [];

   function spawnParticles(rows) {
     for (var ri = 0; ri < rows.length; ri++) {
       var r = rows[ri];
       for (var c = 0; c < COLS; c++) {
         if (state.grid[r][c] === 0) continue;
         var colorIdx = state.grid[r][c];
         var particleCount = 4 + Math.random() * 3;
         for (var i = 0; i < particleCount; i++) {
           particles.push({
             x: (c + 0.5) * CELL, y: (r + 0.5) * CELL,
             vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 8 - 4,
             life: 1, decay: 0.015 + Math.random() * 0.02,
             color: PIECE_COLORS[colorIdx], size: 3 + Math.random() * 4
           });
         }
       }
     }
   }

   function triggerScreenShake(intensity) {
     shakeIntensity = intensity;
   }
      }
    }
  }

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

  function startGame() {
    splashEl.classList.add('hidden');
    gameoverEl.classList.add('hidden');
    pausedEl.classList.add('hidden');
    StackyGame.start(state);
    updateScoreUI();
    startLoop();
  }

  function restartGame() {
    startGame();
  }

  // ── Line-clear animation ─────────────────────────────────────────────

  function triggerLineClear(rows) {
    spawnParticles(rows);
    clearingRows = rows.slice();
    clearFlash = FLASH_FRAMES;
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

    // Advance line-clear flash animation
    if (clearFlash > 0) clearFlash--;
    if (clearFlash === 0) clearingRows = [];

    // Run gravity tick
    StackyGame.tick(state, ts);

    // Check phase transitions
    if (state.phase === 'gameOver') {
      onGameOver();
      draw();
      syncExposedState();
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
    syncExposedState();
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

  /** Expose game state on window for external tooling / overlays. */
  function syncExposedState() {
    window.gameState = {
      score: state.score,
      alive: state.phase !== 'gameOver',
      gameOver: state.phase === 'gameOver',
      level: state.level,
      lines: state.linesCleared,
      player: state.activePiece ? { x: state.activePiece.x, y: state.activePiece.y } : null
    };
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  function draw() {
    // Background
    ctx.fillStyle = '#0d0d14';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    for (var x = 1; x < COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, CANVAS_H);
      ctx.stroke();
    }
    for (var y = 1; y < ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(CANVAS_W, y * CELL);
      ctx.stroke();
    }

    // Locked blocks (with line-clear flash animation)
    for (var row = 0; row < ROWS; row++) {
      for (var col = 0; col < COLS; col++) {
        if (state.grid[row][col] !== 0) {
          var flashing = clearFlash > 0 && clearingRows.indexOf(row) !== -1;
          if (flashing) {
            var t = 1 - clearFlash / FLASH_FRAMES; // 0→1 progress
            var sweep = (t * (COLS + 4) - 2);      // sweep position across row
            var dist = Math.abs(col - sweep);
            var bright = Math.max(0, 1 - dist / 3);
            var alpha = 1 - t * t;                  // fade out quadratically
            drawCell(ctx, col, row, PIECE_COLORS[state.grid[row][col]], alpha);
            if (bright > 0) {
              ctx.globalAlpha = bright * alpha;
              ctx.fillStyle = '#fff';
              ctx.fillRect(col * CELL + 1, row * CELL + 1, CELL - 2, CELL - 2);
              ctx.globalAlpha = 1;
            }
          } else {
            drawCell(ctx, col, row, PIECE_COLORS[state.grid[row][col]], 1);
          }
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
          drawGhostCell(gc.x, gc.y, colorIdx);
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

    // Particles
    ctx.shadowBlur = 0;
    for (var pi = particles.length - 1; pi >= 0; pi--) {
      var pt = particles[pi];
      pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.15; pt.life -= pt.decay;
      if (pt.life <= 0) { particles.splice(pi, 1); continue; }
      ctx.globalAlpha = pt.life;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * pt.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawCell(context, col, row, color, alpha) {
    var x = col * CELL;
    var y = row * CELL;
    var inset = 1;
    var s = CELL - inset * 2;
    var glowColor = PIECE_GLOW[PIECE_COLORS.indexOf(color)];

    context.save();
    context.globalAlpha = alpha;

    // Glow
    if (glowColor) {
      context.shadowColor = glowColor;
      context.shadowBlur = 8;
    }

    // Main fill
    context.fillStyle = color;
    context.fillRect(x + inset, y + inset, s, s);
    context.shadowBlur = 0;

    // Candy highlight
    context.fillStyle = 'rgba(255,255,255,0.28)';
    context.fillRect(x + inset + 2, y + inset + 2, s - 4, s * 0.32);

    // Bottom shadow
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.fillRect(x + inset, y + CELL - inset - 2, s, 2);

    context.restore();
  }

  /** Ghost piece cell — semi-transparent with dashed outline. */
  function drawGhostCell(col, row, colorIdx) {
    var px = col * CELL + 1;
    var py = row * CELL + 1;
    var s = CELL - 2;
    var color = PIECE_COLORS[colorIdx];

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = color;
    ctx.fillRect(px, py, s, s);

    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(px, py, s, s);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
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

  // Wire up line-clear callback
  state.onLineClear = triggerLineClear;

  StackyGame.syncGameState(state);
  draw();
  drawHoldPanel();
  drawNextPanel();

}());
