// ═══════════════════════════════════════════════════════════════════════════
//  SnakeY — game.js
//  Core game state, movement logic, food spawning, collision detection.
//  Extracted from index.html for multi-engineer merge safety.
// ═══════════════════════════════════════════════════════════════════════════

var SnakeyGame = (function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────────────

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

  // ── Game state ─────────────────────────────────────────────────────────

  var state = {
    phase: 'idle',
    dir:   'ArrowRight',
    snake: [],
    food:  { x: 0, y: 0 },
    score: 0,
    hi:    loadHi(),
    tronTrail: [],
  };

  var dirQueue = [];
  var tronMode = false;

  // ── Direction queue ────────────────────────────────────────────────────

  function queueDir(d) {
    if (dirQueue.length >= 2) return;
    var ref = dirQueue.length > 0 ? dirQueue[dirQueue.length - 1] : state.dir;
    if (d === OPPOSITE[ref]) return;
    dirQueue.push(d);
  }

  // ── Food placement ─────────────────────────────────────────────────────

  function placeFood() {
    var occupied = {};
    for (var i = 0; i < state.snake.length; i++) {
      occupied[state.snake[i].x + ',' + state.snake[i].y] = true;
    }
    var free = [];
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        if (!occupied[x + ',' + y]) free.push({ x: x, y: y });
      }
    }
    if (free.length === 0) return;
    state.food = free[Math.floor(Math.random() * free.length)];
  }

  // ── Game initialiser ───────────────────────────────────────────────────

  function initGame() {
    state.snake = [
      { x: 10, y: 10 },
      { x:  9, y: 10 },
      { x:  8, y: 10 },
    ];
    state.dir       = 'ArrowRight';
    state.score     = 0;
    state.tronTrail = [];
    dirQueue.length = 0;
    if (!tronMode) placeFood();
  }

  // ── Game tick ──────────────────────────────────────────────────────────

  var onDie = null; // callback set by engine

  function tick() {
    // 1. Consume one queued direction
    if (dirQueue.length > 0) state.dir = dirQueue.shift();

    // 2. Compute new head
    var d       = DELTA[state.dir];
    var head    = state.snake[0];
    var newHead = { x: head.x + d.x, y: head.y + d.y };

    // 3. Prepend new head
    state.snake.unshift(newHead);

    if (tronMode) {
      // ── Light Cycle mode ──
      var now = Date.now();
      state.tronTrail.push({ x: head.x, y: head.y, placedAt: now });

      // Expire old trail segments
      while (state.tronTrail.length > 0 && now - state.tronTrail[0].placedAt > TRAIL_LIFETIME_MS) {
        state.tronTrail.shift();
      }

      // Keep snake short
      if (state.snake.length > 1) state.snake.pop();

      // Wall collision
      if (newHead.x < 0 || newHead.x >= COLS || newHead.y < 0 || newHead.y >= ROWS) {
        die();
        return;
      }

      // Trail collision
      for (var ti = 0; ti < state.tronTrail.length; ti++) {
        if (state.tronTrail[ti].x === newHead.x && state.tronTrail[ti].y === newHead.y) {
          die();
          return;
        }
      }

      // Survival score
      state.score += 1;
      if (state.score > state.hi) {
        state.hi = state.score;
        saveHi(state.hi);
      }
    } else {
      // ── Classic Snake mode ──

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
      for (var si = 1; si < state.snake.length; si++) {
        if (state.snake[si].x === newHead.x && state.snake[si].y === newHead.y) {
          die();
          return;
        }
      }

      // 8. Food effects
      if (ateFood) {
        state.score += 1;
        if (state.score > state.hi) {
          state.hi = state.score;
          saveHi(state.hi);
        }
        placeFood();
      }
    }
  }

  function die() {
    state.phase = 'dead';
    if (state.score > state.hi) {
      state.hi = state.score;
      saveHi(state.hi);
    }
    if (onDie) onDie();
  }

  // ── Metrics ────────────────────────────────────────────────────────────

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
      } catch(e) {}
    }
  }

  // ── window.gameState ───────────────────────────────────────────────────

  window.gameState = {
    score: 0, highScore: 0, alive: true, gameOver: false,
    phase: 'idle', level: 1, player: { x: 10, y: 10 },
    snake: [], snakeLength: 0, food: { x: 0, y: 0 },
    dir: 'ArrowRight', gridCols: COLS, gridRows: ROWS,
    hi: 0, tronMode: false, mode: 'classic',
    tronTrail: [], trailLength: 0, trailLifetimeMs: TRAIL_LIFETIME_MS,
    dirQueueLength: 0,
  };

  function syncGameState() {
    var head = state.snake.length > 0 ? state.snake[0] : { x: 0, y: 0 };
    window.gameState.score          = state.score;
    window.gameState.highScore      = state.hi;
    window.gameState.alive          = state.phase === 'playing' || state.phase === 'paused';
    window.gameState.gameOver       = state.phase === 'dead';
    window.gameState.phase          = state.phase;
    window.gameState.level          = 1;
    window.gameState.player         = { x: head.x, y: head.y };
    window.gameState.snake          = state.snake.map(function(s) { return { x: s.x, y: s.y }; });
    window.gameState.snakeLength    = state.snake.length;
    window.gameState.food           = { x: state.food.x, y: state.food.y };
    window.gameState.dir            = state.dir;
    window.gameState.hi             = state.hi;
    window.gameState.tronMode       = tronMode;
    window.gameState.mode           = tronMode ? 'lightcycle' : 'classic';
    window.gameState.tronTrail      = state.tronTrail.map(function(t) { return { x: t.x, y: t.y, placedAt: t.placedAt }; });
    window.gameState.trailLength    = tronMode ? state.tronTrail.length : 0;
    window.gameState.trailLifetimeMs = TRAIL_LIFETIME_MS;
    window.gameState.dirQueueLength = dirQueue.length;
  }

  // ── Public API ─────────────────────────────────────────────────────────

  return {
    COLS: COLS,
    ROWS: ROWS,
    CELL: CELL,
    CANVAS_PX: CANVAS_PX,
    TICK_MS: TICK_MS,
    TRON_TICK_MS: TRON_TICK_MS,
    TRAIL_LIFETIME_MS: TRAIL_LIFETIME_MS,
    SWIPE_MIN: SWIPE_MIN,
    DELTA: DELTA,
    OPPOSITE: OPPOSITE,

    state: state,
    dirQueue: dirQueue,

    get tronMode() { return tronMode; },
    set tronMode(v) { tronMode = !!v; },

    set onDie(fn) { onDie = fn; },

    loadHi: loadHi,
    saveHi: saveHi,
    queueDir: queueDir,
    placeFood: placeFood,
    initGame: initGame,
    tick: tick,
    die: die,
    syncGameState: syncGameState,
    trackGameStart: trackGameStart,
    trackGameEnd: trackGameEnd,
  };
}());
