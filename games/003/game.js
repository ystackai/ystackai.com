/**
 * Game 003 Engine — "StackY meets The Matrix"
 *
 * Robust HTML5 Canvas game engine with:
 *   - Main loop (RAF-based with delta time)
 *   - Entity management (add, remove, update, render)
 *   - Input handling (keyboard + touch)
 *   - State machine (splash → playing → paused → gameOver)
 *   - Placeholder mashup mechanics (Matrix code rain + block mechanics)
 *   - window.gameState exposed every frame for automated testing
 *
 * Depends on: nothing (standalone engine)
 */
'use strict';

var Game003 = (function () {

  // ── Constants ───────────────────────────────────────────────────────────

  var CANVAS_W = 400;
  var CANVAS_H = 600;
  var COLS = 10;
  var ROWS = 20;
  var CELL = CANVAS_W / COLS;  // 40px

  var PLAYER_START_X = 4;
  var PLAYER_START_Y = 0;
  var PLAYER_SPEED = 1;           // cells per input
  var GRAVITY_INTERVAL = 800;     // ms between gravity ticks at level 1
  var GRAVITY_SPEEDUP = 50;       // ms faster per level
  var GRAVITY_MIN = 100;          // fastest gravity interval
  var LINES_PER_LEVEL = 5;
  var LOCK_DELAY_MS = 500;

  var MATRIX_RAIN_COLS = 20;
  var MATRIX_RAIN_SPEED = 0.06;   // cells per ms

  // Block shapes: simple 2x2 and 1x3 for now (placeholder for full piece system)
  var BLOCK_SHAPES = [
    // Square
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    // L-shape
    [[0, 0], [0, 1], [0, 2], [1, 2]],
    // Line
    [[0, 0], [1, 0], [2, 0]],
    // T-shape
    [[0, 0], [1, 0], [2, 0], [1, 1]],
    // S-shape
    [[1, 0], [2, 0], [0, 1], [1, 1]],
  ];

  var LS_KEY = 'game003_hi';

  // ── localStorage helpers ────────────────────────────────────────────────

  function loadHi() {
    try { return parseInt(localStorage.getItem(LS_KEY) || '0', 10) || 0; }
    catch (_) { return 0; }
  }
  function saveHi(n) {
    try { localStorage.setItem(LS_KEY, String(n)); } catch (_) {}
  }

  // ── Grid helpers ────────────────────────────────────────────────────────

  function createEmptyGrid() {
    var grid = [];
    for (var y = 0; y < ROWS; y++) {
      grid.push(new Array(COLS).fill(0));
    }
    return grid;
  }

  // ── Entity System ───────────────────────────────────────────────────────

  function createEntityManager() {
    return {
      entities: [],
      nextId: 1,

      add: function (entity) {
        entity._id = this.nextId++;
        entity.alive = true;
        this.entities.push(entity);
        return entity._id;
      },

      remove: function (id) {
        for (var i = 0; i < this.entities.length; i++) {
          if (this.entities[i]._id === id) {
            this.entities[i].alive = false;
            break;
          }
        }
      },

      getById: function (id) {
        for (var i = 0; i < this.entities.length; i++) {
          if (this.entities[i]._id === id) return this.entities[i];
        }
        return null;
      },

      getByTag: function (tag) {
        var result = [];
        for (var i = 0; i < this.entities.length; i++) {
          if (this.entities[i].alive && this.entities[i].tag === tag) {
            result.push(this.entities[i]);
          }
        }
        return result;
      },

      update: function (dt, state) {
        for (var i = 0; i < this.entities.length; i++) {
          var e = this.entities[i];
          if (e.alive && typeof e.update === 'function') {
            e.update(dt, state);
          }
        }
        // Prune dead entities
        this.entities = this.entities.filter(function (e) { return e.alive; });
      },

      render: function (ctx, state) {
        for (var i = 0; i < this.entities.length; i++) {
          var e = this.entities[i];
          if (e.alive && typeof e.render === 'function') {
            e.render(ctx, state);
          }
        }
      },

      clear: function () {
        this.entities = [];
      },
    };
  }

  // ── Matrix Rain Entity ──────────────────────────────────────────────────

  function createMatrixRainDrop(col, totalCols) {
    var x = (col / totalCols) * CANVAS_W;
    return {
      tag: 'rain',
      x: x,
      y: -Math.random() * CANVAS_H,
      speed: MATRIX_RAIN_SPEED * (0.5 + Math.random()),
      length: 4 + Math.floor(Math.random() * 12),
      chars: [],
      charTimer: 0,
      charInterval: 80 + Math.random() * 120,

      update: function (dt) {
        this.y += this.speed * dt;
        this.charTimer += dt;
        if (this.charTimer >= this.charInterval) {
          this.charTimer = 0;
          // Shift chars and add new one
          if (this.chars.length >= this.length) this.chars.shift();
          this.chars.push(String.fromCharCode(0x30A0 + Math.floor(Math.random() * 96)));
        }
        if (this.y > CANVAS_H + this.length * 16) {
          this.y = -this.length * 16;
          this.chars = [];
        }
      },

      render: function (ctx) {
        ctx.font = '14px monospace';
        for (var i = 0; i < this.chars.length; i++) {
          var alpha = (i / this.chars.length) * 0.6;
          var isHead = (i === this.chars.length - 1);
          ctx.fillStyle = isHead
            ? 'rgba(180, 255, 180, 0.9)'
            : 'rgba(0, 255, 65, ' + alpha + ')';
          ctx.fillText(this.chars[i], this.x, this.y - (this.chars.length - i) * 16);
        }
      },
    };
  }

  // ── Block Piece ─────────────────────────────────────────────────────────

  function randomShape() {
    return BLOCK_SHAPES[Math.floor(Math.random() * BLOCK_SHAPES.length)];
  }

  function createPiece() {
    var shape = randomShape();
    // Center piece horizontally
    var maxX = 0;
    for (var i = 0; i < shape.length; i++) {
      if (shape[i][0] > maxX) maxX = shape[i][0];
    }
    var startX = Math.floor((COLS - maxX - 1) / 2);
    return {
      shape: shape,
      x: startX,
      y: 0,
      colorIndex: 1 + Math.floor(Math.random() * 5),
    };
  }

  function getPieceCells(piece) {
    var cells = [];
    for (var i = 0; i < piece.shape.length; i++) {
      cells.push({
        x: piece.x + piece.shape[i][0],
        y: piece.y + piece.shape[i][1],
      });
    }
    return cells;
  }

  function checkCollision(grid, piece) {
    var cells = getPieceCells(piece);
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (c.x < 0 || c.x >= COLS) return true;
      if (c.y >= ROWS) return true;
      if (c.y >= 0 && grid[c.y][c.x] !== 0) return true;
    }
    return false;
  }

  function getGhostY(grid, piece) {
    var ghostY = piece.y;
    while (true) {
      var test = { shape: piece.shape, x: piece.x, y: ghostY + 1, colorIndex: piece.colorIndex };
      if (checkCollision(grid, test)) break;
      ghostY++;
    }
    return ghostY;
  }

  // ── State Machine ───────────────────────────────────────────────────────
  //
  //  splash → playing ⇄ paused
  //              ↓
  //          gameOver → (restart) → playing
  //
  //  Mashup phases (placeholder):
  //    'normal'    — standard block dropping
  //    'matrix'    — Matrix code rain effect active, blocks glitch
  //    'bullet'    — slow-mo / bullet-time (future mechanic)
  //

  var PHASES = ['splash', 'playing', 'paused', 'gameOver'];
  var MASHUP_MODES = ['normal', 'matrix', 'bullet'];

  // ── Create State ────────────────────────────────────────────────────────

  function createState() {
    return {
      // Core state machine
      phase: 'splash',
      mashupMode: 'normal',

      // Grid
      grid: createEmptyGrid(),

      // Active piece
      activePiece: null,
      nextPiece: null,

      // Score
      score: 0,
      hi: loadHi(),
      level: 1,
      linesCleared: 0,
      alive: true,
      comboCounter: 0,

      // Timing
      gravityInterval: GRAVITY_INTERVAL,
      lastGravityTime: 0,
      lockDelayActive: false,
      lockDelayStart: 0,

      // Mashup state (placeholder)
      mashupTimer: 0,
      mashupDuration: 10000,    // 10s mashup event
      mashupCooldown: 30000,    // 30s between mashup events
      lastMashupEnd: 0,
      matrixIntensity: 0,       // 0..1 for visual effects

      // Entities
      entities: createEntityManager(),

      // Input queue
      inputQueue: [],
    };
  }

  // ── Game Logic ──────────────────────────────────────────────────────────

  function spawnPiece(state) {
    state.activePiece = state.nextPiece || createPiece();
    state.nextPiece = createPiece();
    state.lockDelayActive = false;
    state.lockDelayStart = 0;

    if (checkCollision(state.grid, state.activePiece)) {
      state.alive = false;
      state.phase = 'gameOver';
      state.activePiece = null;
      if (state.score > state.hi) {
        state.hi = state.score;
        saveHi(state.hi);
      }
    }
  }

  function lockPiece(state) {
    if (!state.activePiece) return;
    var cells = getPieceCells(state.activePiece);
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (c.y >= 0 && c.y < ROWS && c.x >= 0 && c.x < COLS) {
        state.grid[c.y][c.x] = state.activePiece.colorIndex;
      }
    }
    state.activePiece = null;
    var cleared = clearLines(state);
    if (cleared > 0) {
      updateScore(state, cleared);
      state.comboCounter++;
    } else {
      state.comboCounter = 0;
    }
    spawnPiece(state);
  }

  function clearLines(state) {
    var cleared = 0;
    for (var y = ROWS - 1; y >= 0; y--) {
      var full = true;
      for (var x = 0; x < COLS; x++) {
        if (state.grid[y][x] === 0) { full = false; break; }
      }
      if (full) {
        state.grid.splice(y, 1);
        state.grid.unshift(new Array(COLS).fill(0));
        cleared++;
        y++; // re-check
      }
    }
    state.linesCleared += cleared;
    return cleared;
  }

  var LINE_SCORES = { 1: 100, 2: 300, 3: 500, 4: 800 };

  function updateScore(state, lines) {
    var points = (LINE_SCORES[lines] || lines * 100) * state.level;

    // Mashup bonus: matrix mode gives 1.5x points
    if (state.mashupMode === 'matrix') {
      points = Math.floor(points * 1.5);
    }

    state.score += points;

    // Level progression
    var newLevel = Math.floor(state.linesCleared / LINES_PER_LEVEL) + 1;
    if (newLevel > state.level) {
      state.level = newLevel;
      state.gravityInterval = Math.max(GRAVITY_MIN, GRAVITY_INTERVAL - (state.level - 1) * GRAVITY_SPEEDUP);
    }

    if (state.score > state.hi) {
      state.hi = state.score;
      saveHi(state.hi);
    }
  }

  // ── Movement ────────────────────────────────────────────────────────────

  function moveLeft(state) {
    if (!state.activePiece || state.phase !== 'playing') return false;
    var test = { shape: state.activePiece.shape, x: state.activePiece.x - 1, y: state.activePiece.y, colorIndex: state.activePiece.colorIndex };
    if (!checkCollision(state.grid, test)) {
      state.activePiece.x = test.x;
      if (state.lockDelayActive) state.lockDelayStart = Date.now();
      return true;
    }
    return false;
  }

  function moveRight(state) {
    if (!state.activePiece || state.phase !== 'playing') return false;
    var test = { shape: state.activePiece.shape, x: state.activePiece.x + 1, y: state.activePiece.y, colorIndex: state.activePiece.colorIndex };
    if (!checkCollision(state.grid, test)) {
      state.activePiece.x = test.x;
      if (state.lockDelayActive) state.lockDelayStart = Date.now();
      return true;
    }
    return false;
  }

  function softDrop(state) {
    if (!state.activePiece || state.phase !== 'playing') return false;
    var test = { shape: state.activePiece.shape, x: state.activePiece.x, y: state.activePiece.y + 1, colorIndex: state.activePiece.colorIndex };
    if (!checkCollision(state.grid, test)) {
      state.activePiece.y = test.y;
      state.score += 1;
      state.lockDelayActive = false;
      return true;
    }
    return false;
  }

  function hardDrop(state) {
    if (!state.activePiece || state.phase !== 'playing') return false;
    var dropDist = 0;
    while (true) {
      var test = { shape: state.activePiece.shape, x: state.activePiece.x, y: state.activePiece.y + dropDist + 1, colorIndex: state.activePiece.colorIndex };
      if (checkCollision(state.grid, test)) break;
      dropDist++;
    }
    state.activePiece.y += dropDist;
    state.score += dropDist * 2;
    lockPiece(state);
    return true;
  }

  // ── Mashup State Machine (Placeholder) ──────────────────────────────────

  function updateMashup(state, now) {
    if (state.phase !== 'playing') return;

    if (state.mashupMode === 'normal') {
      // Check if it's time for a mashup event
      if (now - state.lastMashupEnd >= state.mashupCooldown && state.level >= 2) {
        state.mashupMode = 'matrix';
        state.mashupTimer = now;
        state.matrixIntensity = 0;
        // Spawn extra rain entities for the event
        for (var i = 0; i < 10; i++) {
          state.entities.add(createMatrixRainDrop(
            Math.floor(Math.random() * MATRIX_RAIN_COLS),
            MATRIX_RAIN_COLS
          ));
        }
      }
    } else if (state.mashupMode === 'matrix') {
      var elapsed = now - state.mashupTimer;
      // Ramp intensity up then down
      var half = state.mashupDuration / 2;
      if (elapsed < half) {
        state.matrixIntensity = elapsed / half;
      } else {
        state.matrixIntensity = 1 - (elapsed - half) / half;
      }
      state.matrixIntensity = Math.max(0, Math.min(1, state.matrixIntensity));

      if (elapsed >= state.mashupDuration) {
        state.mashupMode = 'normal';
        state.lastMashupEnd = now;
        state.matrixIntensity = 0;
        // Remove extra rain entities
        var rains = state.entities.getByTag('rain');
        for (var r = 0; r < rains.length; r++) {
          rains[r].alive = false;
        }
      }
    }
    // 'bullet' mode: placeholder for future mechanic
  }

  // ── Input Processing ────────────────────────────────────────────────────

  function processInput(state, key) {
    if (state.phase === 'splash') {
      if (key === ' ' || key === 'Enter') {
        startGame(state);
      }
      return;
    }
    if (state.phase === 'gameOver') {
      if (key === ' ' || key === 'Enter') {
        startGame(state);
      }
      return;
    }
    if (state.phase === 'paused') {
      if (key === 'Escape' || key === 'p' || key === 'P') {
        state.phase = 'playing';
      }
      return;
    }
    // playing
    switch (key) {
      case 'ArrowLeft':  case 'a': case 'A': moveLeft(state); break;
      case 'ArrowRight': case 'd': case 'D': moveRight(state); break;
      case 'ArrowDown':  case 's': case 'S': softDrop(state); break;
      case ' ':          hardDrop(state); break;
      case 'Escape': case 'p': case 'P':
        state.phase = 'paused';
        break;
    }
  }

  // ── Gravity Tick ────────────────────────────────────────────────────────

  function tick(state, timestamp) {
    if (state.phase !== 'playing' || !state.activePiece) return;

    // Mashup system
    updateMashup(state, timestamp);

    // Gravity
    if (timestamp - state.lastGravityTime >= state.gravityInterval) {
      state.lastGravityTime = timestamp;
      var test = { shape: state.activePiece.shape, x: state.activePiece.x, y: state.activePiece.y + 1, colorIndex: state.activePiece.colorIndex };
      if (!checkCollision(state.grid, test)) {
        state.activePiece.y = test.y;
        state.lockDelayActive = false;
      } else {
        // Start or continue lock delay
        if (!state.lockDelayActive) {
          state.lockDelayActive = true;
          state.lockDelayStart = timestamp;
        } else if (timestamp - state.lockDelayStart >= LOCK_DELAY_MS) {
          lockPiece(state);
        }
      }
    }

    // Update entities
    var dt = 16; // approximate frame dt for entities
    state.entities.update(dt, state);
  }

  // ── Start / Reset ───────────────────────────────────────────────────────

  function startGame(state) {
    state.grid = createEmptyGrid();
    state.activePiece = null;
    state.nextPiece = null;
    state.score = 0;
    state.level = 1;
    state.linesCleared = 0;
    state.alive = true;
    state.phase = 'playing';
    state.comboCounter = 0;
    state.gravityInterval = GRAVITY_INTERVAL;
    state.lastGravityTime = 0;
    state.lockDelayActive = false;
    state.lockDelayStart = 0;
    state.mashupMode = 'normal';
    state.mashupTimer = 0;
    state.lastMashupEnd = 0;
    state.matrixIntensity = 0;
    state.entities.clear();

    // Seed background rain (subtle, always present)
    for (var i = 0; i < 8; i++) {
      state.entities.add(createMatrixRainDrop(
        Math.floor(Math.random() * MATRIX_RAIN_COLS),
        MATRIX_RAIN_COLS
      ));
    }

    spawnPiece(state);
    syncGameState(state);
  }

  // ── window.gameState sync ───────────────────────────────────────────────

  function syncGameState(state) {
    window.gameState = {
      score: state.score,
      hi: state.hi,
      level: state.level,
      linesCleared: state.linesCleared,
      alive: state.alive,
      gameOver: !state.alive,
      phase: state.phase,
      mashupMode: state.mashupMode,
      matrixIntensity: state.matrixIntensity,
      comboCounter: state.comboCounter,
      gravityInterval: state.gravityInterval,
      activePiece: state.activePiece ? {
        shape: state.activePiece.shape,
        x: state.activePiece.x,
        y: state.activePiece.y,
        colorIndex: state.activePiece.colorIndex,
      } : null,
      nextPiece: state.nextPiece ? {
        shape: state.nextPiece.shape,
        x: state.nextPiece.x,
        y: state.nextPiece.y,
        colorIndex: state.nextPiece.colorIndex,
      } : null,
      grid: state.grid.map(function (row) { return row.slice(); }),
      player: state.activePiece ? {
        x: state.activePiece.x,
        y: state.activePiece.y,
      } : null,
      entityCount: state.entities.entities.length,
    };
  }

  // ── Public API ──────────────────────────────────────────────────────────

  return {
    CANVAS_W: CANVAS_W,
    CANVAS_H: CANVAS_H,
    COLS: COLS,
    ROWS: ROWS,
    CELL: CELL,
    BLOCK_SHAPES: BLOCK_SHAPES,

    createState: createState,
    startGame: startGame,
    tick: tick,
    processInput: processInput,
    syncGameState: syncGameState,
    moveLeft: moveLeft,
    moveRight: moveRight,
    softDrop: softDrop,
    hardDrop: hardDrop,
    lockPiece: lockPiece,
    clearLines: clearLines,
    checkCollision: checkCollision,
    getPieceCells: getPieceCells,
    getGhostY: getGhostY,
    createPiece: createPiece,
    createEntityManager: createEntityManager,
  };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Game003;
}
