// ═══════════════════════════════════════════════════════════════════════════
//  SnakeY Game Logic — core state machine, tick, and rendering
//  ─────────────────────────────────────────────────────────────────────────
//  Depends on: TrailSystem (trail-system.js), SnakeYAudio (audio.js)
//  Load order: trail-system.js → audio.js → game.js
//
//  Architecture:
//   • All mutable game state in a single `state` object
//   • Fixed-timestep accumulator loop — refresh-rate independent
//   • dirQueue (max 2) validated against tail, not head — prevents 180° race
//   • Two modes: classic (snake + food) and lightcycle (trail walls + survival)
//   • TrailSystem manages trail lifecycle, collision, and rendering
//   • window.gameState exposed every frame for automated testing
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────

  var COLS = 20;
  var ROWS = 20;
  var CELL = 24;
  var CANVAS_PX = 480;
  var TICK_MS = 150;
  var TRON_TICK_MS = 100;
  var LS_KEY = 'snakey_hi';
  var SWIPE_MIN = 20;
  var TRAIL_LIFETIME_MS = 7000;

  var DELTA = Object.freeze({
    ArrowUp:    { x:  0, y: -1 },
    ArrowDown:  { x:  0, y:  1 },
    ArrowLeft:  { x: -1, y:  0 },
    ArrowRight: { x:  1, y:  0 },
  });

  var OPPOSITE = Object.freeze({
    ArrowUp:    'ArrowDown',
    ArrowDown:  'ArrowUp',
    ArrowLeft:  'ArrowRight',
    ArrowRight: 'ArrowLeft',
  });

  // ── localStorage hi-score ──────────────────────────────────────────────

  function loadHi() {
    try { return parseInt(localStorage.getItem(LS_KEY) || '0', 10) || 0; }
    catch (_) { return 0; }
  }

  function saveHi(n) {
    try { localStorage.setItem(LS_KEY, String(n)); } catch (_) {}
  }

  // ── Canvas / HiDPI setup ───────────────────────────────────────────────

  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');

  var dpr = window.devicePixelRatio || 1;
  canvas.width = CANVAS_PX * dpr;
  canvas.height = CANVAS_PX * dpr;
  canvas.style.width = CANVAS_PX + 'px';
  canvas.style.height = CANVAS_PX + 'px';
  ctx.scale(dpr, dpr);

  // ── Responsive scaling ─────────────────────────────────────────────────

  var wrapper = document.getElementById('canvas-wrapper');

  function applyResponsiveScale() {
    var available = window.innerWidth * 0.95;
    var scale = available < CANVAS_PX ? available / CANVAS_PX : 1;
    wrapper.style.transform = scale < 1 ? 'scale(' + scale + ')' : '';
    wrapper.style.marginBottom = scale < 1 ? (CANVAS_PX * scale - CANVAS_PX) + 'px' : '';
  }
  applyResponsiveScale();
  window.addEventListener('resize', applyResponsiveScale);

  // ── Trail System (Tron mode) ───────────────────────────────────────────

  var trailSystem = new window.TrailSystem({ lifetimeMs: TRAIL_LIFETIME_MS });

  // ── Tron Mode toggle ───────────────────────────────────────────────────

  var tronMode = false;
  var tronToggleEl = document.getElementById('tron-toggle');

  var splashSubEl = document.querySelector('#overlay-splash .overlay-sub');
  var splashTitleEl = document.querySelector('#overlay-splash .overlay-title');
  var splashEmojiEl = document.querySelector('#overlay-splash .overlay-emoji');
  var heroTitleEl = document.querySelector('.hero h1');
  var heroSubEl = document.querySelector('.hero p');

  function updateModeUI() {
    if (tronMode) {
      splashEmojiEl.textContent = '\u26A1';
      splashTitleEl.textContent = 'Light Cycle';
      splashSubEl.innerHTML = 'Ride the grid. Your trail persists as a wall.<br>It fades after a few seconds \u2014 but hit it and you derez.';
      heroTitleEl.textContent = 'Light Cycle \u26A1';
      heroSubEl.textContent = 'Survive the grid. Don\'t hit your own trail.';
      if (scoreLabelEl) scoreLabelEl.textContent = 'Survived';
    } else {
      splashEmojiEl.textContent = '\uD83D\uDC0D';
      splashTitleEl.textContent = 'SnakeY';
      splashSubEl.innerHTML = 'Eat the food. Grow longer.<br>Don\'t hit walls or yourself.';
      heroTitleEl.textContent = 'SnakeY \uD83D\uDC0D';
      heroSubEl.textContent = 'Eat the food. Grow longer. Don\'t hit walls or yourself.';
      if (scoreLabelEl) scoreLabelEl.textContent = 'Score';
    }
  }

  tronToggleEl.addEventListener('click', function (e) {
    e.stopPropagation();
    tronMode = !tronMode;
    tronToggleEl.classList.toggle('active', tronMode);
    wrapper.style.borderColor = tronMode ? 'rgba(0, 255, 255, 0.4)' : '';
    wrapper.style.boxShadow = tronMode
      ? '0 0 0 1px rgba(0,255,255,0.15), 0 20px 60px rgba(0,0,0,0.6), 0 0 80px rgba(0,255,255,0.12)'
      : '';
    updateModeUI();
    if (state.phase === 'idle') initialDraw();
  });

  // ── Game state ─────────────────────────────────────────────────────────

  var state = {
    phase: 'idle',
    dir: 'ArrowRight',
    snake: [],
    food: { x: 0, y: 0 },
    score: 0,
    hi: loadHi(),
  };

  var dirQueue = [];

  // RAF loop state
  var rafId = null;
  var lastTs = null;
  var accumulated = 0;

  // ── UI element references ──────────────────────────────────────────────

  var scoreEl = document.getElementById('score-display');
  var scoreLabelEl = document.querySelector('.score-bar .score-label');
  var hiEl = document.getElementById('hi-display');
  var splashEl = document.getElementById('overlay-splash');
  var gameoverEl = document.getElementById('overlay-gameover');
  var goScoreEl = document.getElementById('go-score');
  var goHiEl = document.getElementById('go-hi');

  hiEl.textContent = String(state.hi);

  // ── Expose gameState for automated testing ─────────────────────────────

  window.gameState = {
    score: 0,
    alive: true,
    gameOver: false,
    phase: 'idle',
    level: 1,
    player: { x: 10, y: 10 },
    snake: [],
    food: { x: 0, y: 0 },
    dir: 'ArrowRight',
    gridCols: COLS,
    gridRows: ROWS,
    hi: state.hi,
    highScore: state.hi,
    snakeLength: 0,
    tronMode: tronMode,
    mode: 'classic',
    tronTrail: [],
    trailLength: 0,
    trailLifetimeMs: TRAIL_LIFETIME_MS,
    dirQueueLength: 0,
  };

  function syncGameState() {
    var head = state.snake.length > 0 ? state.snake[0] : { x: 0, y: 0 };
    window.gameState.score = state.score;
    window.gameState.alive = state.phase === 'playing' || state.phase === 'paused';
    window.gameState.gameOver = state.phase === 'dead';
    window.gameState.phase = state.phase;
    window.gameState.level = 1;
    window.gameState.player = { x: head.x, y: head.y };
    window.gameState.snake = state.snake.map(function (s) { return { x: s.x, y: s.y }; });
    window.gameState.food = { x: state.food.x, y: state.food.y };
    window.gameState.dir = state.dir;
    window.gameState.hi = state.hi;
    window.gameState.highScore = state.hi;
    window.gameState.snakeLength = state.snake.length;
    window.gameState.tronMode = tronMode;
    window.gameState.mode = tronMode ? 'lightcycle' : 'classic';
    window.gameState.tronTrail = trailSystem.toJSON();
    window.gameState.trailLength = tronMode ? trailSystem.length : 0;
    window.gameState.trailLifetimeMs = TRAIL_LIFETIME_MS;
    window.gameState.dirQueueLength = dirQueue.length;
  }
  syncGameState();

  // ── Direction queue ────────────────────────────────────────────────────

  function queueDir(d) {
    if (dirQueue.length >= 2) return;
    var ref = dirQueue.length > 0 ? dirQueue[dirQueue.length - 1] : state.dir;
    if (d === OPPOSITE[ref]) return;
    dirQueue.push(d);
  }

  // ── Score UI ───────────────────────────────────────────────────────────

  function updateScoreUI() {
    scoreEl.textContent = String(state.score);
    hiEl.textContent = String(state.hi);
  }

  // ── Food placement ─────────────────────────────────────────────────────

  function placeFood() {
    var occupied = new Set(state.snake.map(function (s) { return s.x + ',' + s.y; }));
    var free = [];
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        if (!occupied.has(x + ',' + y)) free.push({ x: x, y: y });
      }
    }
    if (free.length === 0) return;
    state.food = free[Math.floor(Math.random() * free.length)];
  }

  // ── Game initialiser ───────────────────────────────────────────────────

  function initGame() {
    state.snake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ];
    state.dir = 'ArrowRight';
    state.score = 0;
    trailSystem.clear();
    dirQueue.length = 0;

    if (tronMode) {
      // Seed trail with initial body segments (tail→neck, excluding head)
      var seedCells = [];
      for (var i = state.snake.length - 1; i >= 1; i--) {
        seedCells.push({ x: state.snake[i].x, y: state.snake[i].y });
      }
      trailSystem.seed(seedCells);
      // Keep snake as just the head — trail handles the visible body
      state.snake = [state.snake[0]];
    } else {
      placeFood();
    }
    updateScoreUI();
    syncGameState();
  }

  // ── Fixed-timestep RAF loop ────────────────────────────────────────────

  function startLoop() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    lastTs = null;
    accumulated = 0;
    rafId = requestAnimationFrame(loop);
  }

  function loop(ts) {
    if (lastTs !== null) accumulated += Math.min(ts - lastTs, 250);
    lastTs = ts;

    var tickInterval = tronMode ? TRON_TICK_MS : TICK_MS;
    while (accumulated >= tickInterval) {
      accumulated -= tickInterval;
      tick();
      if (state.phase !== 'playing') break;
    }

    draw(ts);
    syncGameState();
    if (state.phase === 'playing') rafId = requestAnimationFrame(loop);
  }

  // ── Game tick ──────────────────────────────────────────────────────────

  function tick() {
    // 1. Consume one queued direction
    if (dirQueue.length > 0) state.dir = dirQueue.shift();

    // 2. Compute new head
    var delta = DELTA[state.dir];
    var head = state.snake[0];
    var newHead = { x: head.x + delta.x, y: head.y + delta.y };

    if (tronMode) {
      // ── Light Cycle mode: persistent trail wall, survival scoring ──

      // Expire old trail segments before collision check
      trailSystem.expire();

      // Wall collision
      if (newHead.x < 0 || newHead.x >= COLS || newHead.y < 0 || newHead.y >= ROWS) {
        die();
        return;
      }

      // Trail collision — hit your own persistent trail and you derez
      if (trailSystem.collides(newHead.x, newHead.y)) {
        die();
        return;
      }

      // All clear — commit the move: old head becomes trail
      trailSystem.place(head.x, head.y);
      state.snake = [newHead];

      // Survival score — every tick alive earns a point
      state.score += 1;
      if (state.score > state.hi) {
        state.hi = state.score;
        saveHi(state.hi);
      }
      updateScoreUI();
    } else {
      // ── Classic Snake mode ──

      // 3. Prepend new head
      state.snake.unshift(newHead);

      // 4. Food check
      var ateFood = newHead.x === state.food.x && newHead.y === state.food.y;

      // 5. Trim tail (only when not growing)
      if (!ateFood) state.snake.pop();

      // 6. Wall collision
      if (newHead.x < 0 || newHead.x >= COLS || newHead.y < 0 || newHead.y >= ROWS) {
        die();
        return;
      }

      // 7. Self collision
      for (var i = 1; i < state.snake.length; i++) {
        if (state.snake[i].x === newHead.x && state.snake[i].y === newHead.y) {
          die();
          return;
        }
      }

      // 8. Food effects
      if (ateFood) {
        if (typeof SnakeYAudio !== 'undefined') SnakeYAudio.playEat();
        state.score += 1;
        if (state.score > state.hi) {
          state.hi = state.score;
          saveHi(state.hi);
        }
        updateScoreUI();
        placeFood();
      }
    }
  }

  // ── Death ──────────────────────────────────────────────────────────────

  var goEmojiEl = document.querySelector('#overlay-gameover .overlay-emoji');
  var goTitleEl = document.querySelector('#overlay-gameover .overlay-title');

  function die() {
    state.phase = 'dead';
    if (typeof SnakeYAudio !== 'undefined') {
      SnakeYAudio.stopDrone();
      SnakeYAudio.playDeath();
    }
    trackGameEnd();

    if (tronMode) {
      goEmojiEl.textContent = '\u26A1';
      goTitleEl.textContent = 'Derezzed';
    } else {
      goEmojiEl.textContent = '\uD83D\uDC80';
      goTitleEl.textContent = 'Game Over';
    }
    if (state.score > state.hi) {
      state.hi = state.score;
      saveHi(state.hi);
    }
    goScoreEl.textContent = String(state.score);
    goHiEl.textContent = String(state.hi);
    hiEl.textContent = String(state.hi);

    var goScoreLabelEl = document.querySelector('#overlay-gameover .overlay-score-label');
    if (goScoreLabelEl) goScoreLabelEl.textContent = tronMode ? 'Survived' : 'Score';
    gameoverEl.classList.remove('hidden');
    syncGameState();
  }

  // ── State transitions ──────────────────────────────────────────────────

  function startGame() {
    splashEl.classList.add('hidden');
    gameoverEl.classList.add('hidden');
    updateModeUI();
    initGame();
    state.phase = 'playing';
    syncGameState();
    trackGameStart();
    if (typeof SnakeYAudio !== 'undefined') {
      SnakeYAudio.init();
      SnakeYAudio.playStart();
      if (tronMode) SnakeYAudio.startDrone();
    }
    startLoop();
  }

  function togglePause() {
    if (state.phase === 'playing') {
      state.phase = 'paused';
    } else if (state.phase === 'paused') {
      state.phase = 'playing';
      startLoop();
    }
    syncGameState();
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  function draw(ts) {
    drawBg();
    if (!tronMode) drawFood(ts);
    drawSnake();
    if (state.phase === 'paused') drawPauseOverlay();
  }

  function drawBg() {
    if (tronMode) {
      ctx.fillStyle = '#0a0a12';
      ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

      ctx.strokeStyle = 'rgba(0, 255, 255, 0.07)';
      ctx.lineWidth = 0.5;
      for (var c = 1; c < COLS; c++) {
        ctx.beginPath();
        ctx.moveTo(c * CELL, 0);
        ctx.lineTo(c * CELL, CANVAS_PX);
        ctx.stroke();
      }
      for (var r = 1; r < ROWS; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * CELL);
        ctx.lineTo(CANVAS_PX, r * CELL);
        ctx.stroke();
      }

      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, CANVAS_PX - 2, CANVAS_PX - 2);
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = '#0d0d14';
      ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 0.5;
      for (var ci = 1; ci < COLS; ci++) {
        ctx.beginPath();
        ctx.moveTo(ci * CELL, 0);
        ctx.lineTo(ci * CELL, CANVAS_PX);
        ctx.stroke();
      }
      for (var ri = 1; ri < ROWS; ri++) {
        ctx.beginPath();
        ctx.moveTo(0, ri * CELL);
        ctx.lineTo(CANVAS_PX, ri * CELL);
        ctx.stroke();
      }
    }
  }

  function drawFood(ts) {
    var fx = state.food.x;
    var fy = state.food.y;
    var cx = fx * CELL + CELL / 2;
    var cy = fy * CELL + CELL / 2;
    var pulse = 1 + 0.12 * Math.sin(ts / 320);
    var r = (CELL / 2 - 3) * pulse;
    var glowR = r + 7 * pulse;

    var grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    grd.addColorStop(0, 'rgba(244,114,182,0.55)');
    grd.addColorStop(1, 'rgba(244,114,182,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f472b6';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.28, cy - r * 0.28, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSnake() {
    var snake = state.snake;
    var dir = state.dir;
    var len = snake.length;
    var pad = 1;
    var size = CELL - pad * 2;

    if (tronMode) {
      // Delegate trail rendering to TrailSystem
      trailSystem.draw(ctx, CELL);

      // Draw the cycle head — bright white core with cyan glow
      if (len > 0) {
        var head = snake[0];
        var hx = head.x * CELL;
        var hy = head.y * CELL;

        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 20;
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(hx, hy, CELL, CELL);

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(hx + 3, hy + 3, CELL - 6, CELL - 6);

        // Direction indicator
        var hcx = hx + CELL / 2;
        var hcy = hy + CELL / 2;
        var d = DELTA[dir];
        ctx.fillStyle = '#00ffff';
        ctx.beginPath();
        ctx.arc(hcx + d.x * 5, hcy + d.y * 5, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      for (var i = len - 1; i >= 0; i--) {
        var seg = snake[i];
        var px = seg.x * CELL + pad;
        var py = seg.y * CELL + pad;
        var t = len > 1 ? i / (len - 1) : 0;

        if (i === 0) {
          ctx.fillStyle = '#818cf8';
        } else {
          var cr = Math.round(99 + (49 - 99) * t);
          var cg = Math.round(102 + (46 - 102) * t);
          var cb = Math.round(241 + (129 - 241) * t);
          ctx.fillStyle = 'rgb(' + cr + ',' + cg + ',' + cb + ')';
        }

        roundRect(px, py, size, size, i === 0 ? 5 : 3);
        ctx.fill();

        if (i === 0) {
          ctx.strokeStyle = '#a5b4fc';
          ctx.lineWidth = 1;
          roundRect(px, py, size, size, 5);
          ctx.stroke();
          drawEyes(seg, dir);
        }
      }
    }
  }

  function drawEyes(seg, dir) {
    var cx = seg.x * CELL + CELL / 2;
    var cy = seg.y * CELL + CELL / 2;
    var eyeR = 2;
    var offset = 4;
    var eyes;

    if (dir === 'ArrowRight') eyes = [{ x: cx + offset, y: cy - 3 }, { x: cx + offset, y: cy + 3 }];
    else if (dir === 'ArrowLeft') eyes = [{ x: cx - offset, y: cy - 3 }, { x: cx - offset, y: cy + 3 }];
    else if (dir === 'ArrowUp') eyes = [{ x: cx - 3, y: cy - offset }, { x: cx + 3, y: cy - offset }];
    else eyes = [{ x: cx - 3, y: cy + offset }, { x: cx + 3, y: cy + offset }];

    ctx.fillStyle = '#ffffff';
    for (var i = 0; i < eyes.length; i++) {
      ctx.beginPath();
      ctx.arc(eyes[i].x, eyes[i].y, eyeR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#1e1b4b';
    for (var j = 0; j < eyes.length; j++) {
      ctx.beginPath();
      ctx.arc(eyes[j].x, eyes[j].y, eyeR - 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPauseOverlay() {
    ctx.fillStyle = 'rgba(10,10,20,0.55)';
    ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = tronMode ? '#00ffff' : '#a5b4fc';
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    if (tronMode) {
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 12;
    }
    ctx.fillText('PAUSED', CANVAS_PX / 2, CANVAS_PX / 2);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#64748b';
    ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('Press P or Space to resume', CANVAS_PX / 2, CANVAS_PX / 2 + 34);
  }

  function roundRect(x, y, w, h, r) {
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── Input: keyboard ────────────────────────────────────────────────────

  var KEY_DIR = {
    ArrowUp: 'ArrowUp', KeyW: 'ArrowUp',
    ArrowDown: 'ArrowDown', KeyS: 'ArrowDown',
    ArrowLeft: 'ArrowLeft', KeyA: 'ArrowLeft',
    ArrowRight: 'ArrowRight', KeyD: 'ArrowRight',
  };

  document.addEventListener('keydown', function (e) {
    var code = e.code;
    if (code.startsWith('Arrow')) e.preventDefault();

    switch (state.phase) {
      case 'idle':
        if (code === 'Space' || code === 'Enter' || KEY_DIR[code]) {
          e.preventDefault();
          startGame();
        }
        break;
      case 'dead':
        if (code === 'Space' || code === 'Enter') {
          e.preventDefault();
          startGame();
        }
        break;
      case 'playing':
        if (code === 'KeyP' || code === 'Space') {
          e.preventDefault();
          togglePause();
        } else {
          var d = KEY_DIR[code];
          if (d) queueDir(d);
        }
        break;
      case 'paused':
        if (code === 'KeyP' || code === 'Space') {
          e.preventDefault();
          togglePause();
        }
        break;
    }
  });

  // ── Auto-pause on tab hide ─────────────────────────────────────────────

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state.phase === 'playing') togglePause();
  });

  // ── Input: touch / swipe ───────────────────────────────────────────────

  var touchStart = null;

  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    var t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: false });

  canvas.addEventListener('touchend', function (e) {
    e.preventDefault();
    if (!touchStart) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - touchStart.x;
    var dy = t.clientY - touchStart.y;
    touchStart = null;

    var isTap = Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN;

    if (state.phase === 'idle' || state.phase === 'dead') {
      startGame();
      return;
    }
    if (state.phase === 'paused') {
      if (isTap) togglePause();
      return;
    }
    if (state.phase === 'playing') {
      if (isTap) return;
      var d = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft')
        : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
      queueDir(d);
    }
  }, { passive: false });

  // ── Button listeners ───────────────────────────────────────────────────

  document.getElementById('btn-start').addEventListener('click', startGame);
  document.getElementById('btn-restart').addEventListener('click', startGame);

  // ── Local metrics ──────────────────────────────────────────────────────

  var gameStartedAt = null;

  function trackGameStart() {
    gameStartedAt = Date.now();
  }

  function trackGameEnd() {
    if (gameStartedAt) {
      var elapsed = Math.floor((Date.now() - gameStartedAt) / 1000);
      gameStartedAt = null;
      try {
        var prev = parseInt(localStorage.getItem('snakey_total_sec') || '0', 10) || 0;
        localStorage.setItem('snakey_total_sec', String(prev + elapsed));
        var games = parseInt(localStorage.getItem('snakey_games') || '0', 10) || 0;
        localStorage.setItem('snakey_games', String(games + 1));
      } catch (e) {}
    }
  }

  // ── Initial draw ───────────────────────────────────────────────────────

  function initialDraw() {
    drawBg();

    var pad = 1;
    var size = CELL - pad * 2;

    var demoSegs = [
      { x: 12, y: 10 }, { x: 11, y: 10 }, { x: 10, y: 10 },
      { x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 },
      { x: 7, y: 11 }, { x: 7, y: 12 }, { x: 8, y: 12 },
      { x: 9, y: 12 },
    ];
    var dLen = demoSegs.length;

    if (tronMode) {
      for (var i = dLen - 1; i >= 1; i--) {
        var seg = demoSegs[i];
        var fade = 1 - (i / dLen) * 0.6;
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 6 * fade;
        ctx.fillStyle = 'rgba(0, 95, 111, ' + (fade * 0.8) + ')';
        ctx.fillRect(seg.x * CELL + pad, seg.y * CELL + pad, size, size);
        ctx.fillStyle = 'rgba(0, 255, 255, ' + (fade * 0.5) + ')';
        ctx.fillRect(seg.x * CELL + pad + 3, seg.y * CELL + pad + 3, size - 6, size - 6);
        ctx.shadowBlur = 0;
      }
      var dHead = demoSegs[0];
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#00ffff';
      ctx.fillRect(dHead.x * CELL, dHead.y * CELL, CELL, CELL);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(dHead.x * CELL + 3, dHead.y * CELL + 3, CELL - 6, CELL - 6);
    } else {
      for (var j = 0; j < demoSegs.length; j++) {
        var dseg = demoSegs[j];
        var dt = dLen > 1 ? j / (dLen - 1) : 0;
        if (j === 0) {
          ctx.fillStyle = '#818cf8';
        } else {
          var cr = Math.round(99 + (49 - 99) * dt);
          var cg = Math.round(102 + (46 - 102) * dt);
          var cb = Math.round(241 + (129 - 241) * dt);
          ctx.fillStyle = 'rgb(' + cr + ',' + cg + ',' + cb + ')';
        }
        roundRect(dseg.x * CELL + pad, dseg.y * CELL + pad, size, size, j === 0 ? 5 : 3);
        ctx.fill();
        if (j === 0) {
          ctx.strokeStyle = '#a5b4fc';
          ctx.lineWidth = 1;
          roundRect(dseg.x * CELL + pad, dseg.y * CELL + pad, size, size, 5);
          ctx.stroke();
        }
      }

      // Static food pellet
      var fc = { x: 13, y: 10 };
      var fcx = fc.x * CELL + CELL / 2;
      var fcy = fc.y * CELL + CELL / 2;
      var fr = CELL / 2 - 3;
      var grd = ctx.createRadialGradient(fcx, fcy, 0, fcx, fcy, fr + 6);
      grd.addColorStop(0, 'rgba(244,114,182,0.55)');
      grd.addColorStop(1, 'rgba(244,114,182,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(fcx, fcy, fr + 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f472b6';
      ctx.beginPath();
      ctx.arc(fcx, fcy, fr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.38)';
      ctx.beginPath();
      ctx.arc(fcx - fr * 0.28, fcy - fr * 0.28, fr * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  initGame();
  syncGameState();
  initialDraw();

}());
