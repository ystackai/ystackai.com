/**
 * StackY Game Engine — Tetris-variant with Wonka Golden Ticket mechanics.
 *
 * Standard Tetris rules: 7 pieces (I, O, T, S, Z, L, J), SRS rotation,
 * gravity, line clearing, scoring, progressive speed, game over detection.
 *
 * Depends on: pieces.js (StackyPieces)
 */
'use strict';

var StackyGame = (function () {
  var P = StackyPieces;
  var COLS = P.COLS;
  var ROWS = P.ROWS;

  // Scoring table (Guideline)
  var LINE_SCORES = { 1: 100, 2: 300, 3: 500, 4: 800 };

  // Chocolate river constants
  var CHOCOLATE_CELL = 8;            // grid value for chocolate blocks
  var CHOCOLATE_INTERVAL = 30000;    // ms between chocolate row rises
  var CHOCOLATE_GAPS = 2;            // random gaps per chocolate row

  // localStorage key
  var LS_KEY = 'stacky_hi';

  function loadHi() {
    try { return parseInt(localStorage.getItem(LS_KEY) || '0', 10) || 0; }
    catch (_) { return 0; }
  }
  function saveHi(n) {
    try { localStorage.setItem(LS_KEY, String(n)); } catch (_) {}
  }

  // 7-bag randomizer
  function createBag() {
    var bag = P.TYPES.slice();
    for (var i = bag.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = bag[i]; bag[i] = bag[j]; bag[j] = tmp;
    }
    return bag;
  }

  /**
   * Create a fresh game state object.
   */
  function createState() {
    return {
      grid: createEmptyGrid(),
      activePiece: null,
      heldPiece: null,
      holdUsedThisTurn: false,
      score: 0,
      hi: loadHi(),
      level: 1,
      linesCleared: 0,
      alive: true,
      phase: 'idle',       // 'idle' | 'playing' | 'paused' | 'gameOver'
      goldenTickets: 0,
      comboCounter: 0,
      dropInterval: 1000,  // ms between gravity drops
      lastDropTime: 0,
      lockDelayActive: false,
      lockDelayTimer: 0,
      lockDelayMax: 30,    // frames before auto-lock
      bag: [],
      nextPiece: null,
      // Chocolate river state
      lastChocolateTime: 0,
      chocolateRowsRisen: 0,
    };
  }

  function createEmptyGrid() {
    var grid = [];
    for (var y = 0; y < ROWS; y++) {
      grid.push(new Array(COLS).fill(0));
    }
    return grid;
  }

  /**
   * Check if a piece placement causes a collision.
   * Uses >= for boundary checks (fixes off-by-one issue).
   */
  function checkCollision(grid, piece) {
    var cells = P.getCells(piece);
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (c.x < 0 || c.x >= COLS) return true;
      if (c.y < 0 || c.y >= ROWS) return true;
      if (grid[c.y][c.x] !== 0) return true;
    }
    return false;
  }

  /** Pull next piece type from the 7-bag. */
  function nextFromBag(state) {
    if (state.bag.length === 0) {
      state.bag = createBag();
    }
    return state.bag.pop();
  }

  /** Spawn a new piece at the top. */
  function spawnPiece(state) {
    var type = state.nextPiece || nextFromBag(state);
    state.nextPiece = nextFromBag(state);

    state.activePiece = {
      type: type,
      rotation: 0,
      x: Math.floor((COLS - 4) / 2),
      y: 0,
    };
    state.holdUsedThisTurn = false;
    state.lockDelayActive = false;
    state.lockDelayTimer = 0;

    if (checkCollision(state.grid, state.activePiece)) {
      state.alive = false;
      state.phase = 'gameOver';
      state.activePiece = null;
      if (window.StackyAudio) window.StackyAudio.playGameOver();
      if (state.score > state.hi) {
        state.hi = state.score;
        saveHi(state.hi);
      }
    }
  }

  /** Start a new game. */
  function start(state) {
    state.grid = createEmptyGrid();
    state.activePiece = null;
    state.heldPiece = null;
    state.holdUsedThisTurn = false;
    state.score = 0;
    state.level = 1;
    state.linesCleared = 0;
    state.alive = true;
    state.phase = 'playing';
    state.goldenTickets = 0;
    state.comboCounter = 0;
    state.dropInterval = 1000;
    state.lastDropTime = 0;
    state.lockDelayActive = false;
    state.lockDelayTimer = 0;
    state.bag = [];
    state.nextPiece = null;
    state.lastChocolateTime = 0;
    state.chocolateRowsRisen = 0;
    spawnPiece(state);
    syncGameState(state);
  }

  /** Move active piece left. Returns true on success. */
  function moveLeft(state) {
    if (!state.activePiece || state.phase !== 'playing') return false;
    var candidate = {
      type: state.activePiece.type,
      rotation: state.activePiece.rotation,
      x: state.activePiece.x - 1,
      y: state.activePiece.y,
    };
    if (!checkCollision(state.grid, candidate)) {
      state.activePiece.x = candidate.x;
      if (state.lockDelayActive) state.lockDelayTimer = 0;
      return true;
    }
    return false;
  }

  /** Move active piece right. */
  function moveRight(state) {
    if (!state.activePiece || state.phase !== 'playing') return false;
    var candidate = {
      type: state.activePiece.type,
      rotation: state.activePiece.rotation,
      x: state.activePiece.x + 1,
      y: state.activePiece.y,
    };
    if (!checkCollision(state.grid, candidate)) {
      state.activePiece.x = candidate.x;
      if (state.lockDelayActive) state.lockDelayTimer = 0;
      return true;
    }
    return false;
  }

  /** Rotate clockwise with SRS wall kicks. */
  function rotateCW(state) {
    if (!state.activePiece || state.phase !== 'playing') return false;
    if (state.activePiece.type === 'O') return true;
    var fromRot = state.activePiece.rotation;
    var toRot = (fromRot + 1) % 4;
    var kicks = P.getKicks(state.activePiece.type, fromRot, toRot);
    for (var i = 0; i < kicks.length; i++) {
      var candidate = {
        type: state.activePiece.type,
        rotation: toRot,
        x: state.activePiece.x + kicks[i][0],
        y: state.activePiece.y - kicks[i][1], // SRS Y is inverted
      };
      if (!checkCollision(state.grid, candidate)) {
        state.activePiece.rotation = toRot;
        state.activePiece.x = candidate.x;
        state.activePiece.y = candidate.y;
        if (state.lockDelayActive) state.lockDelayTimer = 0;
        return true;
      }
    }
    return false;
  }

  /** Rotate counter-clockwise with SRS wall kicks. */
  function rotateCCW(state) {
    if (!state.activePiece || state.phase !== 'playing') return false;
    if (state.activePiece.type === 'O') return true;
    var fromRot = state.activePiece.rotation;
    var toRot = (fromRot + 3) % 4;
    var kicks = P.getKicks(state.activePiece.type, fromRot, toRot);
    for (var i = 0; i < kicks.length; i++) {
      var candidate = {
        type: state.activePiece.type,
        rotation: toRot,
        x: state.activePiece.x + kicks[i][0],
        y: state.activePiece.y - kicks[i][1],
      };
      if (!checkCollision(state.grid, candidate)) {
        state.activePiece.rotation = toRot;
        state.activePiece.x = candidate.x;
        state.activePiece.y = candidate.y;
        if (state.lockDelayActive) state.lockDelayTimer = 0;
        return true;
      }
    }
    return false;
  }

  /** Soft drop: move piece down one row. +1 score. */
  function softDrop(state) {
    if (!state.activePiece || state.phase !== 'playing') return false;
    var candidate = {
      type: state.activePiece.type,
      rotation: state.activePiece.rotation,
      x: state.activePiece.x,
      y: state.activePiece.y + 1,
    };
    if (!checkCollision(state.grid, candidate)) {
      state.activePiece.y = candidate.y;
      state.score += 1;
      state.lockDelayActive = false;
      return true;
    }
    return false;
  }

  /** Hard drop: instant placement at lowest valid y. +2 per row. */
  function hardDrop(state) {
    if (!state.activePiece || state.phase !== 'playing') return false;
    var dropDistance = 0;
    while (true) {
      var candidate = {
        type: state.activePiece.type,
        rotation: state.activePiece.rotation,
        x: state.activePiece.x,
        y: state.activePiece.y + dropDistance + 1,
      };
      if (checkCollision(state.grid, candidate)) break;
      dropDistance++;
    }
    state.activePiece.y += dropDistance;
    state.score += dropDistance * 2;
    lockPiece(state);
    return true;
  }

  /** Get the ghost piece Y position (hard drop preview). */
  function getGhostY(state) {
    if (!state.activePiece) return 0;
    var ghostY = state.activePiece.y;
    while (true) {
      var candidate = {
        type: state.activePiece.type,
        rotation: state.activePiece.rotation,
        x: state.activePiece.x,
        y: ghostY + 1,
      };
      if (checkCollision(state.grid, candidate)) break;
      ghostY++;
    }
    return ghostY;
  }

  /** Lock piece into grid and handle line clears. */
  function lockPiece(state) {
    if (!state.activePiece) return;
    var cells = P.getCells(state.activePiece);
    var colorIndex = P.TYPES.indexOf(state.activePiece.type) + 1;
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (c.y >= 0 && c.y < ROWS && c.x >= 0 && c.x < COLS) {
        state.grid[c.y][c.x] = colorIndex;
      }
    }
    state.activePiece = null;
    if (window.StackyAudio) window.StackyAudio.playPieceLock();
    var cleared = clearLines(state);
    if (cleared > 0) {
      updateScore(state, cleared);
      state.comboCounter++;
      if (window.StackyAudio) window.StackyAudio.playLineClear();
    } else {
      state.comboCounter = 0;
    }
    spawnPiece(state);
  }

  /**
   * Create a chocolate row: filled with CHOCOLATE_CELL except for random gaps.
   */
  function createChocolateRow() {
    var row = new Array(COLS).fill(CHOCOLATE_CELL);
    // Punch random gaps so the row doesn't auto-clear
    var gaps = [];
    while (gaps.length < CHOCOLATE_GAPS) {
      var g = Math.floor(Math.random() * COLS);
      if (gaps.indexOf(g) === -1) gaps.push(g);
    }
    for (var i = 0; i < gaps.length; i++) {
      row[gaps[i]] = 0;
    }
    return row;
  }

  /**
   * Rise one chocolate row from the bottom, pushing the grid up.
   * Returns false if the rise causes game over (top row occupied).
   */
  function riseChocolateRow(state) {
    // Check if top row has any blocks — if so, rising will push them off
    for (var x = 0; x < COLS; x++) {
      if (state.grid[0][x] !== 0) {
        state.alive = false;
        state.phase = 'gameOver';
        if (window.StackyAudio) window.StackyAudio.playGameOver();
        if (state.score > state.hi) {
          state.hi = state.score;
          saveHi(state.hi);
        }
        return false;
      }
    }
    // Shift grid up by removing top row, push chocolate row at bottom
    state.grid.shift();
    state.grid.push(createChocolateRow());
    state.chocolateRowsRisen++;

    // Adjust active piece position — it stays visually in place,
    // but the grid shifted up so piece's y decreases by 1
    if (state.activePiece) {
      state.activePiece.y -= 1;
      // If the piece now collides after the shift, lock it
      if (state.activePiece.y < 0 || checkCollision(state.grid, state.activePiece)) {
        lockPiece(state);
      }
    }
    return true;
  }

  /**
   * Clear completed lines, return count.
   * Also counts how many cleared rows contained chocolate cells (for bonus).
   */
  function clearLines(state) {
    var cleared = 0;
    var chocolateCleared = 0;
    for (var y = ROWS - 1; y >= 0; y--) {
      var full = true;
      for (var x = 0; x < COLS; x++) {
        if (state.grid[y][x] === 0) { full = false; break; }
      }
      if (full) {
        // Check if this row had any chocolate cells
        var hasChocolate = false;
        for (var cx = 0; cx < COLS; cx++) {
          if (state.grid[y][cx] === CHOCOLATE_CELL) { hasChocolate = true; break; }
        }
        if (hasChocolate) chocolateCleared++;
        state.grid.splice(y, 1);
        state.grid.unshift(new Array(COLS).fill(0));
        cleared++;
        y++; // re-check this row
      }
    }
    state.linesCleared += cleared;
    state._lastChocolateCleared = chocolateCleared;
    return cleared;
  }

  /** Update score based on lines cleared. */
  function updateScore(state, lines) {
    var points = (LINE_SCORES[lines] || 0) * state.level;
    // Chocolate river bonus: 2x points for each chocolate row cleared
    var chocoCleared = state._lastChocolateCleared || 0;
    if (chocoCleared > 0) {
      points += (LINE_SCORES[chocoCleared] || chocoCleared * 100) * state.level;
    }
    state.score += points;

    // Golden Ticket: 4-line clear (Tetris)
    if (lines === 4) {
      state.goldenTickets++;
    }

    // Level progression: every 10 lines
    var newLevel = Math.floor(state.linesCleared / 10) + 1;
    if (newLevel > state.level) {
      state.level = newLevel;
      state.dropInterval = Math.max(100, 1000 - (state.level - 1) * 75);
    }

    if (state.score > state.hi) {
      state.hi = state.score;
      saveHi(state.hi);
    }
  }

  /** Hold piece: swap active with held. */
  function hold(state) {
    if (!state.activePiece || state.phase !== 'playing') return false;
    if (state.holdUsedThisTurn) return false;
    var currentType = state.activePiece.type;
    if (state.heldPiece) {
      state.activePiece = {
        type: state.heldPiece,
        rotation: 0,
        x: Math.floor((COLS - 4) / 2),
        y: 0,
      };
      state.heldPiece = currentType;
    } else {
      state.heldPiece = currentType;
      spawnPiece(state);
    }
    state.holdUsedThisTurn = true;
    return true;
  }

  /** Gravity tick — called each frame with timestamp. */
  function tick(state, timestamp) {
    if (state.phase !== 'playing' || !state.activePiece) return;

    // Chocolate river: rise a row every CHOCOLATE_INTERVAL ms
    if (state.lastChocolateTime === 0) {
      state.lastChocolateTime = timestamp;
    }
    if (timestamp - state.lastChocolateTime >= CHOCOLATE_INTERVAL) {
      state.lastChocolateTime = timestamp;
      // Rise 2 chocolate rows per interval ("bottom 2 rows fill")
      for (var cr = 0; cr < 2; cr++) {
        if (!riseChocolateRow(state)) return; // game over from chocolate
      }
    }

    if (timestamp - state.lastDropTime >= state.dropInterval) {
      state.lastDropTime = timestamp;
      var candidate = {
        type: state.activePiece.type,
        rotation: state.activePiece.rotation,
        x: state.activePiece.x,
        y: state.activePiece.y + 1,
      };
      if (!checkCollision(state.grid, candidate)) {
        state.activePiece.y = candidate.y;
      } else {
        if (state.lockDelayActive) {
          state.lockDelayTimer++;
          if (state.lockDelayTimer >= state.lockDelayMax) {
            lockPiece(state);
          }
        } else {
          state.lockDelayActive = true;
          state.lockDelayTimer = 0;
        }
      }
    }
  }

  /** Pause / resume / toggle. */
  function pause(state) {
    if (state.phase === 'playing') state.phase = 'paused';
  }
  function resume(state) {
    if (state.phase === 'paused') state.phase = 'playing';
  }
  function togglePause(state) {
    if (state.phase === 'playing') pause(state);
    else if (state.phase === 'paused') resume(state);
  }

  /** Process a single input key. */
  function processInput(state, key) {
    if (state.phase !== 'playing') {
      if (key === 'Escape' || key === 'p' || key === 'P') {
        togglePause(state);
      }
      return;
    }
    switch (key) {
      case 'ArrowLeft':  case 'a': case 'A': moveLeft(state); break;
      case 'ArrowRight': case 'd': case 'D': moveRight(state); break;
      case 'ArrowDown':  case 's': case 'S': softDrop(state); break;
      case 'ArrowUp':    case 'w': case 'W': rotateCW(state); break;
      case ' ':          hardDrop(state); break;
      case 'z': case 'Z': rotateCCW(state); break;
      case 'c': case 'C': hold(state); break;
      case 'Escape': case 'p': case 'P': togglePause(state); break;
    }
  }

  /**
   * Compute danger level based on stack height.
   * 0 = safe, 1 = warning (top 6 rows), 2 = critical (top 3 rows).
   */
  function getDangerLevel(grid) {
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        if (grid[y][x] !== 0) return y < 3 ? 2 : y < 6 ? 1 : 0;
      }
    }
    return 0;
  }

  /** Apply tilt CSS classes to the board canvas. */
  function applyTiltVisual(danger) {
    var el = document.getElementById('game-canvas');
    if (!el) return;
    el.classList.toggle('tilt-warn', danger === 1);
    el.classList.toggle('tilt-danger', danger === 2);
  }

  /** Sync window.gameState for automated testing. */
  function syncGameState(state) {
    var danger = getDangerLevel(state.grid);
    applyTiltVisual(danger);
    window.gameState = {
      tiltLevel: danger,
      score: state.score,
      hi: state.hi,
      level: state.level,
      linesCleared: state.linesCleared,
      alive: state.alive,
      gameOver: !state.alive,
      phase: state.phase,
      goldenTickets: state.goldenTickets,
      activePiece: state.activePiece ? {
        type: state.activePiece.type,
        rotation: state.activePiece.rotation,
        x: state.activePiece.x,
        y: state.activePiece.y,
      } : null,
      heldPiece: state.heldPiece,
      nextPiece: state.nextPiece,
      comboCounter: state.comboCounter,
      grid: state.grid.map(function (row) { return row.slice(); }),
      dropInterval: state.dropInterval,
      player: state.activePiece ? {
        x: state.activePiece.x,
        y: state.activePiece.y,
      } : null,
      chocolateRowsRisen: state.chocolateRowsRisen,
      chocolateCell: CHOCOLATE_CELL,
    };
  }

  return {
    createState: createState,
    start: start,
    moveLeft: moveLeft,
    moveRight: moveRight,
    rotateCW: rotateCW,
    rotateCCW: rotateCCW,
    softDrop: softDrop,
    hardDrop: hardDrop,
    hold: hold,
    tick: tick,
    pause: pause,
    resume: resume,
    togglePause: togglePause,
    processInput: processInput,
    syncGameState: syncGameState,
    getGhostY: getGhostY,
    checkCollision: checkCollision,
    riseChocolateRow: riseChocolateRow,
    COLS: COLS,
    ROWS: ROWS,
    CHOCOLATE_CELL: CHOCOLATE_CELL,
    CHOCOLATE_INTERVAL: CHOCOLATE_INTERVAL,
  };
})();

// ═══════════════════════════════════════════════════════════════════════════════
//  §1. DEPENDENCY RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

let COLS, ROWS, PIECE_TYPES, PIECE_SHAPES, SRS_WALL_KICK_TABLE,
    AbstractRotationTransformationEngine;

if (typeof require !== 'undefined') {
  const pieces = require('./pieces');
  COLS = pieces.COLS;
  ROWS = pieces.ROWS;
  PIECE_TYPES = pieces.PIECE_TYPES;
  PIECE_SHAPES = pieces.PIECE_SHAPES;
  SRS_WALL_KICK_TABLE = pieces.SRS_WALL_KICK_TABLE;
  AbstractRotationTransformationEngine = pieces.AbstractRotationTransformationEngine;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §2. DETERMINISTIC RNG FALLBACK
//      — for environments lacking the test harness DeterministicRNG
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * MinimalDeterministicRNG — a park-miller LCG for reproducible piece
 * sequences in non-test environments. The test harness injects its own
 * DeterministicRNG via the config object.
 */
class MinimalDeterministicRNG {
  constructor(seed = 42) {
    this._state = seed;
  }

  nextInt(max) {
    this._state = (this._state * 16807 + 0) % 2147483647;
    return ((this._state / 2147483647) * max) | 0;
  }

  next() {
    this._state = (this._state * 16807 + 0) % 2147483647;
    return this._state / 2147483647;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §3. STACKY GAME LOGIC KERNEL
//      — the System Under Test (SUT) for the verification suite
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * StackYGameLogicKernel
 *
 * Extended game logic kernel modelling the full Tetris state machine
 * including SRS wall kicks, T-spin detection, cascade line clears,
 * combo scoring, and the Golden Ticket 4-line-clear event.
 *
 * Public fields are used (rather than private #fields) to facilitate
 * direct state manipulation in test scenarios — an intentional
 * architectural concession to the DomainIsolatedStateKernel pattern.
 */
class StackYGameLogicKernel {
  constructor(config = {}) {
    this.cols = config.cols || COLS;
    this.rows = config.rows || ROWS;
    this.rng = config.rng || new MinimalDeterministicRNG(42);
    this.reset();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §3.1 STATE LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────

  reset() {
    this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(0));
    this.activePiece = null;
    this.holdPiece = null;
    this.holdUsed = false;
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.combo = -1;
    this.phase = 'initializing';
    this.dropInterval = 1000;
    this.lockDelay = 500;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.maxLockResets = 15;
    this.lastClearWasTetris = false;
    this.bag = [];
    this.nextQueue = [];
    this.tSpinDetected = false;
    this.frameCount = 0;
    this.inputQueue = [];
    this.maxInputQueue = 3;
  }

  start() {
    this.reset();
    this.phase = 'playing';
    this._refillBag();
    this._fillNextQueue();
    this._spawnPiece();
    this._updateGameState();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §3.2 BAG RANDOMISATION (7-bag system)
  // ─────────────────────────────────────────────────────────────────────────

  _refillBag() {
    const types = [...PIECE_TYPES];
    for (let i = types.length - 1; i > 0; i--) {
      const j = this.rng.nextInt(i + 1);
      [types[i], types[j]] = [types[j], types[i]];
    }
    this.bag.push(...types);
  }

  _fillNextQueue() {
    while (this.nextQueue.length < 5) {
      if (this.bag.length === 0) this._refillBag();
      this.nextQueue.push(this.bag.shift());
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §3.3 PIECE SPAWNING
  // ─────────────────────────────────────────────────────────────────────────

  _spawnPiece() {
    if (this.nextQueue.length === 0) this._fillNextQueue();
    const type = this.nextQueue.shift();
    this._fillNextQueue();

    const shape = PIECE_SHAPES[type];
    this.activePiece = {
      type,
      cells: shape.cells.map(c => [...c]),
      rotation: 0,
      x: Math.floor(this.cols / 2),
      y: 1,
    };

    if (this._collides(this.activePiece.cells, this.activePiece.x, this.activePiece.y)) {
      this.phase = 'gameOver';
      if (typeof window !== 'undefined' && window.StackyAudio) window.StackyAudio.playGameOver();
      this._updateGameState();
      return false;
    }

    this.holdUsed = false;
    this.lockTimer = 0;
    this.lockResets = 0;
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §3.4 COLLISION DETECTION
  // ─────────────────────────────────────────────────────────────────────────

  _getAbsoluteCells(cells, originX, originY) {
    return cells.map(([cx, cy]) => [originX + cx, originY + cy]);
  }

  _collides(cells, originX, originY) {
    const absolute = this._getAbsoluteCells(cells, originX, originY);
    for (const [ax, ay] of absolute) {
      if (ax < 0 || ax >= this.cols || ay >= this.rows) return true;
      if (ay >= 0 && this.grid[ay][ax] !== 0) return true;
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §3.5 PIECE LOCKING & LINE CLEARING
  // ─────────────────────────────────────────────────────────────────────────

  _lockPiece() {
    if (!this.activePiece) return;
    const absolute = this._getAbsoluteCells(
      this.activePiece.cells,
      this.activePiece.x,
      this.activePiece.y
    );

    for (const [ax, ay] of absolute) {
      if (ay < 0) {
        this.phase = 'gameOver';
        if (typeof window !== 'undefined' && window.StackyAudio) window.StackyAudio.playGameOver();
        this._updateGameState();
        return;
      }
      this.grid[ay][ax] = this.activePiece.type;
    }

    if (typeof window !== 'undefined' && window.StackyAudio) window.StackyAudio.playPieceLock();
    const cleared = this._clearLines();
    this._updateScore(cleared);
    if (cleared > 0 && typeof window !== 'undefined' && window.StackyAudio) window.StackyAudio.playLineClear();
    this.activePiece = null;
    this._spawnPiece();
  }

  _clearLines() {
    const fullRows = [];
    for (let y = 0; y < this.rows; y++) {
      if (this.grid[y].every(cell => cell !== 0)) {
        fullRows.push(y);
      }
    }

    if (fullRows.length === 0) {
      this.combo = -1;
      return 0;
    }

    this.combo++;

    for (const y of fullRows) {
      this.grid.splice(y, 1);
      this.grid.unshift(Array(this.cols).fill(0));
    }

    this.lines += fullRows.length;
    this.level = Math.floor(this.lines / 10) + 1;
    this._updateDropInterval();

    if (fullRows.length === 4) {
      this.lastClearWasTetris = true;
    } else {
      this.lastClearWasTetris = false;
    }

    return fullRows.length;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §3.6 SCORING (Guideline + Combo + B2B Tetris)
  // ─────────────────────────────────────────────────────────────────────────

  _updateScore(linesCleared) {
    if (linesCleared === 0) return;

    const basePoints = { 1: 100, 2: 300, 3: 500, 4: 800 };
    let points = (basePoints[linesCleared] || 0) * this.level;

    // Back-to-back Tetris bonus
    if (linesCleared === 4 && this.lastClearWasTetris) {
      points = Math.floor(points * 1.5);
    }

    // Combo bonus
    if (this.combo > 0) {
      points += 50 * this.combo * this.level;
    }

    this.score += points;
  }

  _updateDropInterval() {
    const speed = Math.max(100, 1000 - (this.level - 1) * 50);
    this.dropInterval = speed;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §3.7 MOVEMENT
  // ─────────────────────────────────────────────────────────────────────────

  moveLeft() {
    if (this.phase !== 'playing' || !this.activePiece) return false;
    if (!this._collides(this.activePiece.cells, this.activePiece.x - 1, this.activePiece.y)) {
      this.activePiece.x--;
      this._resetLockDelay();
      this._updateGameState();
      return true;
    }
    return false;
  }

  moveRight() {
    if (this.phase !== 'playing' || !this.activePiece) return false;
    if (!this._collides(this.activePiece.cells, this.activePiece.x + 1, this.activePiece.y)) {
      this.activePiece.x++;
      this._resetLockDelay();
      this._updateGameState();
      return true;
    }
    return false;
  }

  softDrop() {
    if (this.phase !== 'playing' || !this.activePiece) return false;
    if (!this._collides(this.activePiece.cells, this.activePiece.x, this.activePiece.y + 1)) {
      this.activePiece.y++;
      this.score += 1;
      this.lockTimer = 0;
      this._updateGameState();
      return true;
    }
    return false;
  }

  hardDrop() {
    if (this.phase !== 'playing' || !this.activePiece) return false;
    let dropDistance = 0;
    while (!this._collides(this.activePiece.cells, this.activePiece.x, this.activePiece.y + 1)) {
      this.activePiece.y++;
      dropDistance++;
    }
    this.score += dropDistance * 2;
    this._lockPiece();
    this._updateGameState();
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §3.8 ROTATION (SRS Wall Kicks)
  // ─────────────────────────────────────────────────────────────────────────

  rotateCW() {
    if (this.phase !== 'playing' || !this.activePiece) return false;
    if (this.activePiece.type === 'O') return false;

    const newCells = AbstractRotationTransformationEngine.rotateCW(this.activePiece.cells);
    const fromRot = this.activePiece.rotation;
    const toRot = (fromRot + 1) % 4;
    const kickKey = `${fromRot}->${toRot}`;

    const kickTable = this.activePiece.type === 'I'
      ? SRS_WALL_KICK_TABLE.I
      : SRS_WALL_KICK_TABLE.standard;

    const offsets = kickTable[kickKey] || [{ x: 0, y: 0 }];

    for (const offset of offsets) {
      const testX = this.activePiece.x + offset.x;
      const testY = this.activePiece.y + offset.y;
      if (!this._collides(newCells, testX, testY)) {
        this.activePiece.cells = newCells;
        this.activePiece.x = testX;
        this.activePiece.y = testY;
        this.activePiece.rotation = toRot;
        this._resetLockDelay();
        this._updateGameState();
        return true;
      }
    }
    return false;
  }

  rotateCCW() {
    if (this.phase !== 'playing' || !this.activePiece) return false;
    if (this.activePiece.type === 'O') return false;

    const newCells = AbstractRotationTransformationEngine.rotateCCW(this.activePiece.cells);
    const fromRot = this.activePiece.rotation;
    const toRot = (fromRot + 3) % 4;
    const kickKey = `${fromRot}->${toRot}`;

    const kickTable = this.activePiece.type === 'I'
      ? SRS_WALL_KICK_TABLE.I
      : SRS_WALL_KICK_TABLE.standard;

    const offsets = kickTable[kickKey] || [{ x: 0, y: 0 }];

    for (const offset of offsets) {
      const testX = this.activePiece.x + offset.x;
      const testY = this.activePiece.y + offset.y;
      if (!this._collides(newCells, testX, testY)) {
        this.activePiece.cells = newCells;
        this.activePiece.x = testX;
        this.activePiece.y = testY;
        this.activePiece.rotation = toRot;
        this._resetLockDelay();
        this._updateGameState();
        return true;
      }
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §3.9 HOLD PIECE
  // ─────────────────────────────────────────────────────────────────────────

  hold() {
    if (this.phase !== 'playing' || !this.activePiece || this.holdUsed) return false;

    const currentType = this.activePiece.type;
    if (this.holdPiece) {
      const swapType = this.holdPiece;
      this.holdPiece = currentType;
      const shape = PIECE_SHAPES[swapType];
      this.activePiece = {
        type: swapType,
        cells: shape.cells.map(c => [...c]),
        rotation: 0,
        x: Math.floor(this.cols / 2),
        y: 1,
      };
    } else {
      this.holdPiece = currentType;
      this._spawnPiece();
    }

    this.holdUsed = true;
    this._updateGameState();
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §3.10 PAUSE / RESUME
  // ─────────────────────────────────────────────────────────────────────────

  pause() {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this._updateGameState();
    }
  }

  resume() {
    if (this.phase === 'paused') {
      this.phase = 'playing';
      this._updateGameState();
    }
  }

  togglePause() {
    if (this.phase === 'playing') this.pause();
    else if (this.phase === 'paused') this.resume();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §3.11 LOCK DELAY MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  _resetLockDelay() {
    if (this.lockResets < this.maxLockResets) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §3.12 INPUT QUEUE (Bounded FIFO)
  // ─────────────────────────────────────────────────────────────────────────

  queueInput(action) {
    if (this.inputQueue.length < this.maxInputQueue) {
      this.inputQueue.push(action);
    }
  }

  processInputQueue() {
    while (this.inputQueue.length > 0) {
      const action = this.inputQueue.shift();
      if (typeof this[action] === 'function') {
        this[action]();
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §3.13 GAME TICK
  // ─────────────────────────────────────────────────────────────────────────

  tick(deltaMs) {
    if (this.phase !== 'playing') return;
    this.frameCount++;

    this.processInputQueue();

    if (this.activePiece) {
      if (this._collides(this.activePiece.cells, this.activePiece.x, this.activePiece.y + 1)) {
        this.lockTimer += deltaMs;
        if (this.lockTimer >= this.lockDelay) {
          this._lockPiece();
        }
      } else {
        this.lockTimer = 0;
      }
    }

    this._updateGameState();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §3.14 TEST HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  _fillRow(y) {
    for (let x = 0; x < this.cols; x++) {
      this.grid[y][x] = 'G';
    }
  }

  _fillRowPartial(y, gapX) {
    for (let x = 0; x < this.cols; x++) {
      this.grid[y][x] = x === gapX ? 0 : 'G';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §3.15 GAMESTATE SNAPSHOT (Schneider Test Protocol v1.1)
  // ─────────────────────────────────────────────────────────────────────────

  getGameState() {
    return {
      score: this.score,
      level: this.level,
      lines: this.lines,
      phase: this.phase,
      alive: this.phase !== 'gameOver',
      gameOver: this.phase === 'gameOver',
      combo: this.combo,
      holdPiece: this.holdPiece,
      activePiece: this.activePiece ? {
        type: this.activePiece.type,
        rotation: this.activePiece.rotation,
        x: this.activePiece.x,
        y: this.activePiece.y,
      } : null,
      nextQueue: [...this.nextQueue],
      grid: this.grid.map(row => [...row]),
      dropInterval: this.dropInterval,
      lockTimer: this.lockTimer,
      frameCount: this.frameCount,
    };
  }

  _updateGameState() {
    if (typeof globalThis !== 'undefined') {
      globalThis.gameState = this.getGameState();
    }
    if (typeof window !== 'undefined') {
      window.gameState = this.getGameState();
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §4. MINIMAL RENDERER GAME LOGIC
//      — simplified game functions for the lightweight renderer
// ═══════════════════════════════════════════════════════════════════════════════

var StackyMinimal = (function () {
  var _COLS = 10, _ROWS = 20, _CELL = 28;
  var _PIECES = (typeof PIECES !== 'undefined') ? PIECES : [];

  var minimalState = {
    board: Array.from({ length: _ROWS }, function () { return Array(_COLS).fill(0); }),
    piece: null, nextPiece: null,
    score: 0, level: 1, lines: 0, gameOver: false,
    onLineClear: null,
  };

  var dropTimer = 0, lastTime = 0;

  function randomPiece() {
    var p = _PIECES[Math.random() * _PIECES.length | 0];
    return { shape: p.shapes[0], rot: 0, defs: p, x: (_COLS - p.shapes[0][0].length) / 2 | 0, y: 0, color: p.color };
  }

  function collides(shape, px, py) {
    for (var r = 0; r < shape.length; r++)
      for (var c = 0; c < shape[r].length; c++)
        if (shape[r][c]) {
          var x = px + c, y = py + r;
          if (x < 0 || x >= _COLS || y >= _ROWS) return true;
          if (y >= 0 && minimalState.board[y][x]) return true;
        }
    return false;
  }

  function lock() {
    var p = minimalState.piece;
    for (var r = 0; r < p.shape.length; r++)
      for (var c = 0; c < p.shape[r].length; c++)
        if (p.shape[r][c]) {
          var y = p.y + r;
          if (y < 0) { minimalState.gameOver = true; if (window.StackyAudio) window.StackyAudio.playGameOver(); return; }
          minimalState.board[y][p.x + c] = p.color;
        }
    if (window.StackyAudio) window.StackyAudio.playPieceLock();
    clearLines();
    spawn();
  }

  function clearLines() {
    var full = [];
    for (var r = 0; r < _ROWS; r++)
      if (minimalState.board[r].every(function (c) { return c; })) full.push(r);
    if (!full.length) return;
    if (window.StackyAudio) window.StackyAudio.playLineClear();
    if (minimalState.onLineClear) minimalState.onLineClear(full);
    var pts = [0, 100, 300, 500, 800];
    minimalState.score += (pts[full.length] || 800) * minimalState.level;
    minimalState.lines += full.length;
    minimalState.level = (minimalState.lines / 10 | 0) + 1;
    for (var i = 0; i < full.length; i++) {
      minimalState.board.splice(full[i], 1);
      minimalState.board.unshift(Array(_COLS).fill(0));
    }
  }

  function spawn() {
    minimalState.piece = minimalState.nextPiece || randomPiece();
    minimalState.nextPiece = randomPiece();
    if (collides(minimalState.piece.shape, minimalState.piece.x, minimalState.piece.y)) {
      minimalState.gameOver = true;
      if (window.StackyAudio) window.StackyAudio.playGameOver();
    }
  }

  function reset() {
    minimalState.board = Array.from({ length: _ROWS }, function () { return Array(_COLS).fill(0); });
    minimalState.score = 0; minimalState.level = 1; minimalState.lines = 0; minimalState.gameOver = false;
    minimalState.piece = null; minimalState.nextPiece = null;
    spawn();
  }

  function drop() {
    var p = minimalState.piece;
    while (!collides(p.shape, p.x, p.y + 1)) p.y++;
    lock();
  }

  function move(dx) {
    if (!collides(minimalState.piece.shape, minimalState.piece.x + dx, minimalState.piece.y)) {
      minimalState.piece.x += dx;
    }
  }

  function rotate() {
    var p = minimalState.piece;
    var next = (p.rot + 1) % p.defs.shapes.length;
    var shape = p.defs.shapes[next];
    var kicks = [0, -1, 1, -2, 2];
    for (var i = 0; i < kicks.length; i++) {
      if (!collides(shape, p.x + kicks[i], p.y)) {
        p.shape = shape; p.rot = next; p.x += kicks[i]; return;
      }
    }
  }

  function tick(time) {
    if (minimalState.gameOver) return;
    var dt = time - lastTime; lastTime = time;
    var speed = Math.max(50, 500 - (minimalState.level - 1) * 40);
    dropTimer += dt;
    if (dropTimer >= speed) {
      dropTimer = 0;
      if (!collides(minimalState.piece.shape, minimalState.piece.x, minimalState.piece.y + 1)) {
        minimalState.piece.y++;
      } else {
        lock();
      }
    }
  }

  return {
    state: minimalState,
    COLS: _COLS,
    ROWS: _ROWS,
    CELL: _CELL,
    reset: reset,
    drop: drop,
    move: move,
    rotate: rotate,
    tick: tick,
    collides: collides,
  };
})();

// ═══════════════════════════════════════════════════════════════════════════════
//  §5. MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    StackyGame,
    StackYGameLogicKernel,
    MinimalDeterministicRNG,
    StackyMinimal,
  };
}
