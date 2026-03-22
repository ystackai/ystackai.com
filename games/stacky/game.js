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

  // Scoring table (Guideline)
  var LINE_SCORES = { 1: 100, 2: 300, 3: 500, 4: 800 };

  // Chocolate river constants
  var CHOCOLATE_CELL = 8;            // grid value for chocolate blocks
  var CHOCOLATE_INTERVAL = 30000;    // ms between chocolate row rises
  var CHOCOLATE_GAPS = 2;            // random gaps per chocolate row
  var CHOCOLATE_CLEAR_BONUS = 500;   // flat bonus per chocolate row cleared
  var BOUNDARY_CHECK_INTERVAL = 500; // ms between top-boundary collision checks

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
      lastBoundaryCheck: 0,
    };
  }

  function createEmptyGrid() {
    var grid = [];
    for (var y = 0; y < P.ROWS; y++) {
      grid.push(new Array(P.COLS).fill(0));
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
      if (c.x < 0 || c.x >= P.COLS) return true;
      if (c.y < 0 || c.y >= P.ROWS) return true;
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
      x: Math.floor((P.COLS - 4) / 2),
      y: 0,
    };
    state.holdUsedThisTurn = false;
    state.lockDelayActive = false;
    state.lockDelayTimer = 0;

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
    state.lastBoundaryCheck = 0;
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
      if (c.y >= 0 && c.y < P.ROWS && c.x >= 0 && c.x < P.COLS) {
        state.grid[c.y][c.x] = colorIndex;
      }
    }
    state.activePiece = null;
    // Play lock click sound
    if (typeof StackyAudio !== 'undefined') {
      StackyAudio.playLock();
    }
    var cleared = clearLines(state);
    if (cleared > 0) {
      updateScore(state, cleared);
      state.comboCounter++;
    } else {
      state.comboCounter = 0;
    }
    spawnPiece(state);
  }

  /**
   * Create a chocolate row: filled with CHOCOLATE_CELL except for random gaps.
   */
  function createChocolateRow() {
    var row = new Array(P.COLS).fill(CHOCOLATE_CELL);
    // Punch random gaps so the row doesn't auto-clear
    var gaps = [];
    while (gaps.length < CHOCOLATE_GAPS) {
      var g = Math.floor(Math.random() * P.COLS);
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
    for (var x = 0; x < P.COLS; x++) {
      if (state.grid[0][x] !== 0) {
        state.alive = false;
        state.phase = 'gameOver';
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
    for (var y = P.ROWS - 1; y >= 0; y--) {
      var full = true;
      for (var x = 0; x < P.COLS; x++) {
        if (state.grid[y][x] === 0) { full = false; break; }
      }
      if (full) {
        // Check if this row had any chocolate cells
        var hasChocolate = false;
        for (var cx = 0; cx < P.COLS; cx++) {
          if (state.grid[y][cx] === CHOCOLATE_CELL) { hasChocolate = true; break; }
        }
        if (hasChocolate) chocolateCleared++;
        state.grid.splice(y, 1);
        state.grid.unshift(new Array(P.COLS).fill(0));
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
    // Chocolate river bonus: flat 500 per chocolate row cleared
    var chocoCleared = state._lastChocolateCleared || 0;
    if (chocoCleared > 0) {
      points += chocoCleared * CHOCOLATE_CLEAR_BONUS;
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
        x: Math.floor((P.COLS - 4) / 2),
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

    // Periodic boundary check: detect if any locked block has been pushed
    // into the top row by rising chocolate, triggering game over.
    if (state.lastBoundaryCheck === 0) {
      state.lastBoundaryCheck = timestamp;
    }
    if (timestamp - state.lastBoundaryCheck >= BOUNDARY_CHECK_INTERVAL) {
      state.lastBoundaryCheck = timestamp;
      // If active piece now collides after grid shift, end the game
      if (state.activePiece && checkCollision(state.grid, state.activePiece)) {
        state.alive = false;
        state.phase = 'gameOver';
        if (state.score > state.hi) {
          state.hi = state.score;
          saveHi(state.hi);
        }
        return;
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

  /** Sync window.gameState for automated testing. */
  function syncGameState(state) {
    window.gameState = {
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
    CHOCOLATE_CELL: CHOCOLATE_CELL,
    CHOCOLATE_INTERVAL: CHOCOLATE_INTERVAL,
  };
})();
