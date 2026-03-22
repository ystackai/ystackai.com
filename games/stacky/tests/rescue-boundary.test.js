/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  StackY Rescue Boundary Validation Suite v1.0.0                            ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║  Author:  Dr. Schneider, Principal Architect (PhD ETH Zürich)              ║
 * ║  Pattern: AbstractDeterministicBoundaryRescueVerificationBridge (ADBRVB)   ║
 * ║  Tests:   42 deterministic verification scenarios                          ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 *
 * Architectural Note:
 *   This suite exercises the topological boundary surface of the StackY 10×20
 *   grid with respect to piece placement, collision detection, and spawn-zone
 *   integrity. Row 0 (the spawn ceiling) and row 19 (the floor) represent the
 *   two critical rescue boundaries — positions where off-by-one errors manifest
 *   as either premature game-over or phantom piece placement in the void.
 *
 *   The term "rescue" refers to the recovery semantic: can a piece that appears
 *   to be in a terminal position be rescued via wall kick, lateral movement, or
 *   hold swap? These boundary rescue paths are the most fragile code paths in
 *   any Tetris implementation.
 *
 *   "A boundary is not a wall — it is a question the game asks every frame."
 *     — Dr. Schneider, Grid Topology Symposium 2025
 *
 * Run:  node games/stacky/tests/rescue-boundary.test.js
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
//  §1. DEPENDENCY RESOLUTION & HARNESS WIRING
// ═══════════════════════════════════════════════════════════════════════════════

const {
  GameTestHarnessFactory,
  AbstractTestCaseFactory,
  TestSuiteOrchestrator,
  GridStateAssertionEngine,
  CollisionValidationOracle,
  DeterministicRNG,
  assert,
} = require('../../../tests/helpers/game-test-harness');

const {
  CompositeBoundaryTestSuiteFactory,
  WallCollisionTestGenerator,
  CornerCaseTestGenerator,
  BoundaryTraversalTestGenerator,
} = require('../../../tests/helpers/boundary-conditions');

const { StackyPieces } = require('../pieces');

// ═══════════════════════════════════════════════════════════════════════════════
//  §2. THROWING ASSERTION ADAPTER (fail-fast multi-check pattern)
// ═══════════════════════════════════════════════════════════════════════════════

const check = {};
for (const key of Object.keys(assert)) {
  check[key] = (...args) => {
    const result = assert[key](...args);
    if (!result.passed) throw new Error(result.message);
  };
}

function scenario(description, category, fn) {
  return {
    description,
    category,
    execute: () => {
      try {
        fn();
        return { passed: true, message: '✓ all checks passed' };
      } catch (err) {
        return { passed: false, message: err.message };
      }
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §3. STACKY-SPECIFIC STATE FACTORY
//      — deterministic game state construction for boundary probing
// ═══════════════════════════════════════════════════════════════════════════════

const COLS = 10;
const ROWS = 20;

/**
 * StackYBoundaryStateFactory — produces game states with surgical precision
 * for boundary validation. Each factory method constructs a state where
 * specific boundary conditions are active, enabling isolated verification
 * of collision detection at the grid's topological extremes.
 */
class StackYBoundaryStateFactory {
  /**
   * Create a minimal game state with an empty grid and a piece placed
   * at the specified position. Bypasses the bag randomizer for determinism.
   */
  static createWithPieceAt(type, x, y, rotation = 0) {
    const grid = [];
    for (let r = 0; r < ROWS; r++) {
      grid.push(new Array(COLS).fill(0));
    }
    return {
      grid,
      activePiece: { type, rotation, x, y },
      heldPiece: null,
      holdUsedThisTurn: false,
      score: 0,
      hi: 0,
      level: 1,
      linesCleared: 0,
      alive: true,
      phase: 'playing',
      goldenTickets: 0,
      comboCounter: 0,
      dropInterval: 1000,
      lastDropTime: 0,
      lockDelayActive: false,
      lockDelayTimer: 0,
      lockDelayMax: 30,
      bag: ['I', 'O', 'T', 'S', 'Z', 'L', 'J'],
      nextPiece: 'T',
    };
  }

  /**
   * Create a state with the bottom N rows filled (simulating a near-full
   * board for top-out boundary testing).
   */
  static createWithFilledRows(filledRowCount, type = 'T', x = 3, y = 0) {
    const state = this.createWithPieceAt(type, x, y);
    for (let r = ROWS - filledRowCount; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        state.grid[r][c] = 1;
      }
    }
    return state;
  }

  /**
   * Create a state with a specific column gap pattern in the bottom rows.
   * The gap column remains empty; all other columns are filled.
   * This enables testing of piece placement into narrow rescue corridors.
   */
  static createWithGapColumn(gapCol, filledRowCount) {
    const state = this.createWithPieceAt('I', 3, 0);
    for (let r = ROWS - filledRowCount; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        state.grid[r][c] = (c === gapCol) ? 0 : 1;
      }
    }
    return state;
  }

  /**
   * Create a state where rows are filled except for a complete line
   * at a specific row — for testing line clear at boundary rows.
   */
  static createWithCompleteLine(lineRow) {
    const state = this.createWithPieceAt('T', 3, 0);
    for (let c = 0; c < COLS; c++) {
      state.grid[lineRow][c] = 1;
    }
    return state;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §4. ROW 0 (CEILING) BOUNDARY TEST GENERATOR
//      — the spawn zone where game-over decisions are made
// ═══════════════════════════════════════════════════════════════════════════════

class Row0CeilingBoundaryTestGenerator extends AbstractTestCaseFactory {
  createScenarios() {
    const scenarios = [];
    const category = 'Row 0 (Ceiling) Boundary';

    // ── TC-RB-01: Piece spawns at row 0 without immediate collision ──
    scenarios.push(scenario(
      'TC-RB-01: T-piece spawns at row 0 on empty grid — no collision',
      category,
      () => {
        const state = StackYBoundaryStateFactory.createWithPieceAt('T', 3, 0);
        const cells = StackyPieces.getCells(state.activePiece);
        const grid = new GridStateAssertionEngine(COLS, ROWS);
        for (const cell of cells) {
          check.truthy(grid.isInBounds(cell));
        }
      }
    ));

    // ── TC-RB-02: I-piece horizontal at row 0 — all cells valid ──
    scenarios.push(scenario(
      'TC-RB-02: I-piece horizontal at y=0, x=0 — all 4 cells in row 0',
      category,
      () => {
        const cells = StackyPieces.getCells({ type: 'I', rotation: 0, x: 0, y: 0 });
        check.eq(cells.length, 4);
        for (const cell of cells) {
          check.eq(cell.y, 0);
          check.truthy(cell.x >= 0 && cell.x < COLS);
        }
      }
    ));

    // ── TC-RB-03: Piece at y=-1 collides (above ceiling) ──
    scenarios.push(scenario(
      'TC-RB-03: T-piece at y=-1 produces cells above grid — collision detected',
      category,
      () => {
        const cells = StackyPieces.getCells({ type: 'T', rotation: 0, x: 3, y: -1 });
        const hasOutOfBounds = cells.some(c => c.y < 0);
        check.truthy(hasOutOfBounds);
      }
    ));

    // ── TC-RB-04: Spawn on full row 0 triggers game over ──
    scenarios.push(scenario(
      'TC-RB-04: Row 0 fully occupied → spawn collision → game over invariant',
      category,
      () => {
        const state = StackYBoundaryStateFactory.createWithPieceAt('T', 3, 0);
        for (let c = 0; c < COLS; c++) {
          state.grid[0][c] = 1;
        }
        // Any piece overlapping row 0 should collide
        const piece = { type: 'T', rotation: 0, x: 3, y: 0 };
        const cells = StackyPieces.getCells(piece);
        const hasConflict = cells.some(c => c.y >= 0 && c.y < ROWS && state.grid[c.y][c.x] !== 0);
        check.truthy(hasConflict);
      }
    ));

    // ── TC-RB-05: All 7 piece types valid at spawn position ──
    for (const type of StackyPieces.TYPES) {
      scenarios.push(scenario(
        `TC-RB-05-${type}: ${type}-piece at spawn (x=3,y=0,r=0) — all cells in bounds`,
        category,
        () => {
          const cells = StackyPieces.getCells({ type, rotation: 0, x: 3, y: 0 });
          const grid = new GridStateAssertionEngine(COLS, ROWS);
          for (const cell of cells) {
            check.truthy(grid.isInBounds(cell));
          }
        }
      ));
    }

    // ── TC-RB-06: Rotation at row 0 — kick or deny ──
    scenarios.push(scenario(
      'TC-RB-06: T-piece rotation at y=0 — either succeeds via kick or stays in bounds',
      category,
      () => {
        const piece = { type: 'T', rotation: 0, x: 4, y: 0 };
        const toRot = 1;
        const kicks = StackyPieces.getKicks('T', 0, toRot);
        // At least one kick offset should produce in-bounds cells
        let anyValid = false;
        for (const kick of kicks) {
          const candidate = {
            type: 'T', rotation: toRot,
            x: piece.x + kick[0],
            y: piece.y - kick[1],
          };
          const cells = StackyPieces.getCells(candidate);
          const allInBounds = cells.every(c => c.x >= 0 && c.x < COLS && c.y >= 0 && c.y < ROWS);
          if (allInBounds) { anyValid = true; break; }
        }
        check.truthy(anyValid);
      }
    ));

    return scenarios;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §5. ROW 19 (FLOOR) BOUNDARY TEST GENERATOR
//      — the lock surface where pieces commit to the grid
// ═══════════════════════════════════════════════════════════════════════════════

class Row19FloorBoundaryTestGenerator extends AbstractTestCaseFactory {
  createScenarios() {
    const scenarios = [];
    const category = 'Row 19 (Floor) Boundary';

    // ── TC-RB-10: Piece at row 19 — cells touch floor ──
    scenarios.push(scenario(
      'TC-RB-10: O-piece at y=18 occupies rows 18-19 — valid floor contact',
      category,
      () => {
        const cells = StackyPieces.getCells({ type: 'O', rotation: 0, x: 4, y: 18 });
        const maxY = Math.max(...cells.map(c => c.y));
        check.eq(maxY, 19);
        const grid = new GridStateAssertionEngine(COLS, ROWS);
        for (const cell of cells) {
          check.truthy(grid.isInBounds(cell));
        }
      }
    ));

    // ── TC-RB-11: Piece below row 19 — collision ──
    scenarios.push(scenario(
      'TC-RB-11: O-piece at y=19 produces cells at y=20 — out of bounds',
      category,
      () => {
        const cells = StackyPieces.getCells({ type: 'O', rotation: 0, x: 4, y: 19 });
        const hasOutOfBounds = cells.some(c => c.y >= ROWS);
        check.truthy(hasOutOfBounds);
      }
    ));

    // ── TC-RB-12: I-piece vertical at floor boundary ──
    scenarios.push(scenario(
      'TC-RB-12: I-piece vertical (rot=1) at y=16 — bottom cell at y=19',
      category,
      () => {
        // I-piece rotation 1: cells at (x+2, y+0), (x+2, y+1), (x+2, y+2), (x+2, y+3)
        const cells = StackyPieces.getCells({ type: 'I', rotation: 1, x: 3, y: 16 });
        const maxY = Math.max(...cells.map(c => c.y));
        check.eq(maxY, 19);
      }
    ));

    // ── TC-RB-13: I-piece vertical one row too low — collision ──
    scenarios.push(scenario(
      'TC-RB-13: I-piece vertical (rot=1) at y=17 — bottom cell at y=20 — collision',
      category,
      () => {
        const cells = StackyPieces.getCells({ type: 'I', rotation: 1, x: 3, y: 17 });
        const hasOutOfBounds = cells.some(c => c.y >= ROWS);
        check.truthy(hasOutOfBounds);
      }
    ));

    // ── TC-RB-14: Hard drop to floor — piece lands at row 19 ──
    scenarios.push(scenario(
      'TC-RB-14: Hard drop simulation — T-piece descends to max valid y on empty grid',
      category,
      () => {
        // Simulate hard drop: find max y where all cells are in bounds
        const type = 'T';
        const x = 4;
        let maxValidY = 0;
        for (let y = 0; y < ROWS; y++) {
          const cells = StackyPieces.getCells({ type, rotation: 0, x, y });
          const allValid = cells.every(c => c.x >= 0 && c.x < COLS && c.y >= 0 && c.y < ROWS);
          if (allValid) maxValidY = y;
          else break;
        }
        // T-piece rotation 0 has cells at y and y+1, so max valid y = 18
        check.eq(maxValidY, 18);
      }
    ));

    // ── TC-RB-15: All 7 pieces — floor contact validation ──
    for (const type of StackyPieces.TYPES) {
      scenarios.push(scenario(
        `TC-RB-15-${type}: ${type}-piece max valid y touches row 19`,
        category,
        () => {
          const x = 3;
          let maxValidY = -1;
          for (let y = 0; y < ROWS; y++) {
            const cells = StackyPieces.getCells({ type, rotation: 0, x, y });
            const allValid = cells.every(c => c.x >= 0 && c.x < COLS && c.y >= 0 && c.y < ROWS);
            if (allValid) maxValidY = y;
          }
          // At max valid y, the piece's lowest cell should be at row 19
          const cells = StackyPieces.getCells({ type, rotation: 0, x, y: maxValidY });
          const maxCellY = Math.max(...cells.map(c => c.y));
          check.eq(maxCellY, 19);
        }
      ));
    }

    return scenarios;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §6. LATERAL BOUNDARY (COLUMN 0 / COLUMN 9) TEST GENERATOR
//      — left and right wall rescue paths
// ═══════════════════════════════════════════════════════════════════════════════

class LateralBoundaryTestGenerator extends AbstractTestCaseFactory {
  createScenarios() {
    const scenarios = [];
    const category = 'Lateral Boundaries (Col 0/9)';

    // ── TC-RB-20: I-piece horizontal at x=0 — leftmost valid position ──
    scenarios.push(scenario(
      'TC-RB-20: I-piece horizontal at x=0 — all cells in bounds (cols 0-3)',
      category,
      () => {
        const cells = StackyPieces.getCells({ type: 'I', rotation: 0, x: 0, y: 5 });
        check.eq(cells.length, 4);
        for (const cell of cells) {
          check.truthy(cell.x >= 0 && cell.x < COLS);
        }
      }
    ));

    // ── TC-RB-21: I-piece horizontal at x=-1 — left wall collision ──
    scenarios.push(scenario(
      'TC-RB-21: I-piece horizontal at x=-1 — cell at x=-1 — left wall collision',
      category,
      () => {
        const cells = StackyPieces.getCells({ type: 'I', rotation: 0, x: -1, y: 5 });
        const hasOutOfBounds = cells.some(c => c.x < 0);
        check.truthy(hasOutOfBounds);
      }
    ));

    // ── TC-RB-22: I-piece horizontal at x=6 — rightmost valid position ──
    scenarios.push(scenario(
      'TC-RB-22: I-piece horizontal at x=6 — cells at cols 6,7,8,9 — in bounds',
      category,
      () => {
        const cells = StackyPieces.getCells({ type: 'I', rotation: 0, x: 6, y: 5 });
        const maxX = Math.max(...cells.map(c => c.x));
        check.eq(maxX, 9);
        for (const cell of cells) {
          check.truthy(cell.x >= 0 && cell.x < COLS);
        }
      }
    ));

    // ── TC-RB-23: I-piece horizontal at x=7 — right wall collision ──
    scenarios.push(scenario(
      'TC-RB-23: I-piece horizontal at x=7 — cell at x=10 — right wall collision',
      category,
      () => {
        const cells = StackyPieces.getCells({ type: 'I', rotation: 0, x: 7, y: 5 });
        const hasOutOfBounds = cells.some(c => c.x >= COLS);
        check.truthy(hasOutOfBounds);
      }
    ));

    // ── TC-RB-24: Wall kick at left edge — rotation should kick right ──
    scenarios.push(scenario(
      'TC-RB-24: T-piece at x=0, rotation 3→0 — wall kick resolves to valid position',
      category,
      () => {
        const piece = { type: 'T', rotation: 3, x: 0, y: 10 };
        const toRot = 0;
        const kicks = StackyPieces.getKicks('T', 3, toRot);
        let anyValid = false;
        for (const kick of kicks) {
          const candidate = {
            type: 'T', rotation: toRot,
            x: piece.x + kick[0],
            y: piece.y - kick[1],
          };
          const cells = StackyPieces.getCells(candidate);
          const allInBounds = cells.every(c => c.x >= 0 && c.x < COLS && c.y >= 0 && c.y < ROWS);
          if (allInBounds) { anyValid = true; break; }
        }
        check.truthy(anyValid);
      }
    ));

    // ── TC-RB-25: Wall kick at right edge ──
    scenarios.push(scenario(
      'TC-RB-25: T-piece at x=7, rotation 1→2 — wall kick resolves to valid position',
      category,
      () => {
        // T-piece rot 1 at x=7: cells include x+2=9 (right edge). Rotation to 2
        // may push cells further right, requiring a leftward kick.
        const piece = { type: 'T', rotation: 1, x: 7, y: 10 };
        const toRot = 2;
        const kicks = StackyPieces.getKicks('T', 1, toRot);
        let anyValid = false;
        for (const kick of kicks) {
          const candidate = {
            type: 'T', rotation: toRot,
            x: piece.x + kick[0],
            y: piece.y - kick[1],
          };
          const cells = StackyPieces.getCells(candidate);
          const allInBounds = cells.every(c => c.x >= 0 && c.x < COLS && c.y >= 0 && c.y < ROWS);
          if (allInBounds) { anyValid = true; break; }
        }
        check.truthy(anyValid);
      }
    ));

    return scenarios;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §7. CORNER RESCUE PATH GENERATOR
//      — the topological vertices where two boundaries intersect
// ═══════════════════════════════════════════════════════════════════════════════

class CornerRescuePathTestGenerator extends AbstractTestCaseFactory {
  createScenarios() {
    const scenarios = [];
    const category = 'Corner Rescue Paths';

    // ── TC-RB-30: Top-left corner — piece at (0,0) ──
    scenarios.push(scenario(
      'TC-RB-30: O-piece at (0,0) — fits in top-left corner',
      category,
      () => {
        const cells = StackyPieces.getCells({ type: 'O', rotation: 0, x: 0, y: 0 });
        const grid = new GridStateAssertionEngine(COLS, ROWS);
        for (const cell of cells) {
          check.truthy(grid.isInBounds(cell));
        }
      }
    ));

    // ── TC-RB-31: Top-right corner — O-piece at max x ──
    // O-piece shape: offsets (col+1,col+2), so max valid x = COLS - 3 = 7
    scenarios.push(scenario(
      'TC-RB-31: O-piece at (7,0) — fits in top-right corner (cols 8-9)',
      category,
      () => {
        const cells = StackyPieces.getCells({ type: 'O', rotation: 0, x: 7, y: 0 });
        const maxX = Math.max(...cells.map(c => c.x));
        check.eq(maxX, 9);
        const grid = new GridStateAssertionEngine(COLS, ROWS);
        for (const cell of cells) {
          check.truthy(grid.isInBounds(cell));
        }
      }
    ));

    // ── TC-RB-32: Bottom-left corner — O-piece at (0,18) ──
    scenarios.push(scenario(
      'TC-RB-32: O-piece at (0,18) — fits in bottom-left corner (rows 18-19)',
      category,
      () => {
        const cells = StackyPieces.getCells({ type: 'O', rotation: 0, x: 0, y: 18 });
        const grid = new GridStateAssertionEngine(COLS, ROWS);
        for (const cell of cells) {
          check.truthy(grid.isInBounds(cell));
        }
        const maxY = Math.max(...cells.map(c => c.y));
        check.eq(maxY, 19);
      }
    ));

    // ── TC-RB-33: Bottom-right corner — O-piece at (7,18) ──
    scenarios.push(scenario(
      'TC-RB-33: O-piece at (7,18) — fits in bottom-right corner',
      category,
      () => {
        const cells = StackyPieces.getCells({ type: 'O', rotation: 0, x: 7, y: 18 });
        const grid = new GridStateAssertionEngine(COLS, ROWS);
        for (const cell of cells) {
          check.truthy(grid.isInBounds(cell));
        }
        const maxX = Math.max(...cells.map(c => c.x));
        const maxY = Math.max(...cells.map(c => c.y));
        check.eq(maxX, 9);
        check.eq(maxY, 19);
      }
    ));

    // ── TC-RB-34: Diagonal exit from each corner is out of bounds ──
    const cornerExits = [
      { name: 'top-left',     x: -1, y: -1 },
      { name: 'top-right',    x: COLS, y: -1 },
      { name: 'bottom-left',  x: -1, y: ROWS },
      { name: 'bottom-right', x: COLS, y: ROWS },
    ];

    for (const exit of cornerExits) {
      scenarios.push(scenario(
        `TC-RB-34-${exit.name}: Diagonal exit (${exit.x},${exit.y}) is out of bounds`,
        category,
        () => {
          const grid = new GridStateAssertionEngine(COLS, ROWS);
          check.falsy(grid.isInBounds({ x: exit.x, y: exit.y }));
        }
      ));
    }

    return scenarios;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §8. COMPOSITE GRID BOUNDARY GENERATOR (10×20 StackY topology)
// ═══════════════════════════════════════════════════════════════════════════════

class StackYGridBoundaryTestGenerator extends AbstractTestCaseFactory {
  createScenarios() {
    const scenarios = [];
    const category = 'Grid Topology (10×20)';
    const grid = new GridStateAssertionEngine(COLS, ROWS);

    // ── TC-RB-40: Perimeter cell count ──
    scenarios.push(scenario(
      'TC-RB-40: Perimeter cell count = 2×10 + 2×18 = 56',
      category,
      () => {
        const expected = 2 * COLS + 2 * (ROWS - 2);
        check.eq(grid.boundary.length, expected);
      }
    ));

    // ── TC-RB-41: All perimeter cells are on boundary ──
    scenarios.push(scenario(
      'TC-RB-41: All perimeter cells classified as boundary',
      category,
      () => {
        for (const pos of grid.boundary) {
          check.truthy(grid.isOnBoundary(pos));
        }
      }
    ));

    // ── TC-RB-42: Interior cells are not boundary ──
    scenarios.push(scenario(
      'TC-RB-42: Interior cells (1,1)→(8,18) are not on boundary',
      category,
      () => {
        for (let y = 1; y < ROWS - 1; y++) {
          for (let x = 1; x < COLS - 1; x++) {
            if (grid.isOnBoundary({ x, y })) {
              throw new Error(`Interior cell (${x},${y}) incorrectly classified as boundary`);
            }
          }
        }
      }
    ));

    // ── TC-RB-43: Exactly 4 corners ──
    scenarios.push(scenario(
      'TC-RB-43: Grid has exactly 4 corners',
      category,
      () => {
        check.eq(grid.corners.length, 4);
      }
    ));

    return scenarios;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §9. ORCHESTRATION & EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

const orchestrator = new TestSuiteOrchestrator(
  'StackY Rescue Boundary Validation Suite — Dr. Schneider',
  42
);

orchestrator.registerFactories([
  new Row0CeilingBoundaryTestGenerator(),
  new Row19FloorBoundaryTestGenerator(),
  new LateralBoundaryTestGenerator(),
  new CornerRescuePathTestGenerator(),
  new StackYGridBoundaryTestGenerator(),
]);

orchestrator.execute();
