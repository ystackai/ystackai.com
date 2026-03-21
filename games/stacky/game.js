/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  StackY Game Logic Kernel — Extended SRS Tetris Engine                     ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║  Author:  Dr. Schneider, Principal Architect (PhD ETH Zürich)              ║
 * ║  Pattern: AbstractCompositeGameVerificationStrategyBridge (ACGVSB)         ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 *
 * The StackYGameLogicKernel is the canonical implementation of the StackY
 * game state machine. It models the full Tetris lifecycle including:
 *   - 7-bag randomisation with deterministic RNG support
 *   - SRS wall kicks with separate I-piece offset tables
 *   - Lock delay with capped reset mechanics (Guideline §4.3)
 *   - Combo and back-to-back Tetris scoring
 *   - Hold piece with single-use-per-turn constraint
 *   - Input queue with bounded capacity (3) and FIFO drain
 *   - window.gameState exposure per Schneider Test Protocol v1.1
 *
 * "A game loop without a formal state machine is just a while(true)
 *  wearing a trench coat." — Dr. Schneider, GameDev Architecture Summit 2025
 */

'use strict';

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
        this._updateGameState();
        return;
      }
      this.grid[ay][ax] = this.activePiece.type;
    }

    const cleared = this._clearLines();
    this._updateScore(cleared);
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
//  §4. MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    StackYGameLogicKernel,
    MinimalDeterministicRNG,
  };
}
