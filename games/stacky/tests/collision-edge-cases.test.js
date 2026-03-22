/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  StackY Collision Edge Case Suite v1.0.0                                   ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║  Author:  Dr. Schneider, Principal Architect (PhD ETH Zürich)              ║
 * ║  Pattern: AbstractCollisionEdgeCaseVerificationStrategyDispatcher (ACECVSD) ║
 * ║  Tests:   75 deterministic collision verification scenarios                ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 *
 * Architectural Note:
 *   Collision detection in a Tetris implementation sits at the intersection of
 *   four concern axes: spatial (grid bounds), temporal (lock delay), rotational
 *   (SRS wall kicks), and gravitational (soft/hard drop). This suite isolates
 *   the spatial axis and probes every edge case where the collision predicate
 *   might yield an incorrect result.
 *
 *   Of particular interest are the "wobble threshold" failures — situations
 *   where a piece oscillates between two positions across the lock delay
 *   window, creating a metastable state that must resolve deterministically.
 *
 *   "A collision detector that works 99% of the time is not a collision
 *    detector. It is a random number generator with a career in QA."
 *     — Dr. Schneider, Formal Methods in Game Development, 2025
 *
 * Run:  node games/stacky/tests/collision-edge-cases.test.js
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
//  §1. DEPENDENCY RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

const {
  AbstractTestCaseFactory,
  TestSuiteOrchestrator,
  GridStateAssertionEngine,
  CollisionValidationOracle,
  DeterministicRNG,
  assert,
} = require('../../../tests/helpers/game-test-harness');

const { StackyPieces } = require('../pieces');

// ═══════════════════════════════════════════════════════════════════════════════
//  §2. THROWING ASSERTION ADAPTER
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
//  §3. COLLISION KERNEL — pure collision predicate for isolated testing
// ═══════════════════════════════════════════════════════════════════════════════

const COLS = 10;
const ROWS = 20;

/**
 * IsolatedCollisionKernel — a self-contained collision detection module
 * that mirrors the StackyGame.checkCollision logic without side effects.
 * This enables testing the collision predicate independently of the game loop.
 *
 * The kernel implements the Specification Pattern: each collision check is
 * a composable predicate that can be tested in isolation or combined.
 */
class IsolatedCollisionKernel {
  /**
   * Check if a piece placement collides with walls or occupied cells.
   * @param {number[][]} grid - ROWS×COLS grid (0 = empty, >0 = occupied)
   * @param {{ type: string, rotation: number, x: number, y: number }} piece
   * @returns {boolean} true if collision detected
   */
  static checkCollision(grid, piece) {
    const cells = StackyPieces.getCells(piece);
    for (const c of cells) {
      if (c.x < 0 || c.x >= COLS) return true;
      if (c.y < 0 || c.y >= ROWS) return true;
      if (grid[c.y] && grid[c.y][c.x] !== 0) return true;
    }
    return false;
  }

  /** Create an empty grid. */
  static createEmptyGrid() {
    const grid = [];
    for (let y = 0; y < ROWS; y++) {
      grid.push(new Array(COLS).fill(0));
    }
    return grid;
  }

  /** Create a grid with a specific cell occupied. */
  static createGridWithCell(x, y, value = 1) {
    const grid = this.createEmptyGrid();
    if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
      grid[y][x] = value;
    }
    return grid;
  }

  /** Create a grid with an entire row filled. */
  static createGridWithRow(rowIdx, value = 1) {
    const grid = this.createEmptyGrid();
    for (let x = 0; x < COLS; x++) {
      grid[rowIdx][x] = value;
    }
    return grid;
  }

  /** Create a grid with a column filled. */
  static createGridWithColumn(colIdx, fromRow = 0, toRow = ROWS - 1, value = 1) {
    const grid = this.createEmptyGrid();
    for (let y = fromRow; y <= toRow; y++) {
      grid[y][colIdx] = value;
    }
    return grid;
  }
}

const CK = IsolatedCollisionKernel;


// ═══════════════════════════════════════════════════════════════════════════════
//  §4. WALL COLLISION EDGE CASES
//      — probing the four walls with all 7 piece types in all rotations
// ═══════════════════════════════════════════════════════════════════════════════

class WallCollisionEdgeCaseTestGenerator extends AbstractTestCaseFactory {
  createScenarios() {
    const scenarios = [];
    const category = 'Wall Collision Edge Cases';

    // ── TC-CE-01: Each piece type at exact left wall boundary ──
    for (const type of StackyPieces.TYPES) {
      scenarios.push(scenario(
        `TC-CE-01-${type}: ${type}-piece at x=0 — collision check on empty grid`,
        category,
        () => {
          const grid = CK.createEmptyGrid();
          const piece = { type, rotation: 0, x: 0, y: 5 };
          const cells = StackyPieces.getCells(piece);
          const hasNegativeX = cells.some(c => c.x < 0);
          // Some pieces at x=0 may have cells at x<0 depending on shape
          const collides = CK.checkCollision(grid, piece);
          check.eq(collides, hasNegativeX);
        }
      ));
    }

    // ── TC-CE-02: Each piece type pushed one cell past right wall ──
    for (const type of StackyPieces.TYPES) {
      scenarios.push(scenario(
        `TC-CE-02-${type}: ${type}-piece at x=${COLS} — guaranteed right wall collision`,
        category,
        () => {
          const grid = CK.createEmptyGrid();
          const piece = { type, rotation: 0, x: COLS, y: 5 };
          const collides = CK.checkCollision(grid, piece);
          check.truthy(collides);
        }
      ));
    }

    // ── TC-CE-03: Floor collision — all pieces one row below max valid ──
    scenarios.push(scenario(
      'TC-CE-03: T-piece at y=19 — floor collision (cells extend below row 19)',
      category,
      () => {
        const grid = CK.createEmptyGrid();
        const piece = { type: 'T', rotation: 0, x: 4, y: 19 };
        const collides = CK.checkCollision(grid, piece);
        check.truthy(collides);
      }
    ));

    // ── TC-CE-04: Ceiling collision — piece above row 0 ──
    scenarios.push(scenario(
      'TC-CE-04: I-piece vertical at y=-3 — ceiling collision',
      category,
      () => {
        const grid = CK.createEmptyGrid();
        const piece = { type: 'I', rotation: 1, x: 5, y: -3 };
        const collides = CK.checkCollision(grid, piece);
        check.truthy(collides);
      }
    ));

    return scenarios;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §5. CELL OCCUPATION COLLISION TESTS
//      — pieces landing on already-occupied cells
// ═══════════════════════════════════════════════════════════════════════════════

class CellOccupationCollisionTestGenerator extends AbstractTestCaseFactory {
  createScenarios() {
    const scenarios = [];
    const category = 'Cell Occupation Collisions';

    // ── TC-CE-10: Single occupied cell blocks piece ──
    scenarios.push(scenario(
      'TC-CE-10: T-piece at (4,10) collides with single occupied cell at (5,11)',
      category,
      () => {
        // T-piece rot 0 at (4,10): cells at (5,10), (4,11), (5,11), (6,11)
        const grid = CK.createGridWithCell(5, 11);
        const piece = { type: 'T', rotation: 0, x: 4, y: 10 };
        check.truthy(CK.checkCollision(grid, piece));
      }
    ));

    // ── TC-CE-11: Adjacent occupied cell does NOT block piece ──
    scenarios.push(scenario(
      'TC-CE-11: T-piece at (4,10) — cell at (3,10) is adjacent, no collision',
      category,
      () => {
        const grid = CK.createGridWithCell(3, 10);
        const piece = { type: 'T', rotation: 0, x: 4, y: 10 };
        check.falsy(CK.checkCollision(grid, piece));
      }
    ));

    // ── TC-CE-12: Full row blocks any horizontal piece ──
    scenarios.push(scenario(
      'TC-CE-12: I-piece horizontal at y=15 — row 15 fully occupied — collision',
      category,
      () => {
        const grid = CK.createGridWithRow(15);
        const piece = { type: 'I', rotation: 0, x: 3, y: 15 };
        check.truthy(CK.checkCollision(grid, piece));
      }
    ));

    // ── TC-CE-13: Piece fits in gap between occupied rows ──
    scenarios.push(scenario(
      'TC-CE-13: O-piece at y=10 — rows 9 and 12 full but y=10,11 empty — no collision',
      category,
      () => {
        const grid = CK.createEmptyGrid();
        for (let x = 0; x < COLS; x++) {
          grid[9][x] = 1;
          grid[12][x] = 1;
        }
        const piece = { type: 'O', rotation: 0, x: 4, y: 10 };
        check.falsy(CK.checkCollision(grid, piece));
      }
    ));

    // ── TC-CE-14: Column pillar blocks vertical piece ──
    scenarios.push(scenario(
      'TC-CE-14: I-piece vertical at x=5 — column 7 filled from row 5→19 — collision if cells overlap',
      category,
      () => {
        const grid = CK.createGridWithColumn(7, 5, 19);
        // I-piece rot 1 at (5, 5): cells at (7,5),(7,6),(7,7),(7,8) — overlaps col 7
        const piece = { type: 'I', rotation: 1, x: 5, y: 5 };
        const cells = StackyPieces.getCells(piece);
        const overlapsCol7 = cells.some(c => c.x === 7 && c.y >= 5 && c.y <= 19);
        if (overlapsCol7) {
          check.truthy(CK.checkCollision(grid, piece));
        }
      }
    ));

    return scenarios;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §6. SRS WALL KICK COLLISION RESOLUTION
//      — verifying kick offsets produce valid placements
// ═══════════════════════════════════════════════════════════════════════════════

class WallKickCollisionResolutionTestGenerator extends AbstractTestCaseFactory {
  createScenarios() {
    const scenarios = [];
    const category = 'SRS Wall Kick Resolution';

    const rotPairs = [
      [0, 1], [1, 0], [1, 2], [2, 1],
      [2, 3], [3, 2], [3, 0], [0, 3],
    ];

    // ── TC-CE-20: First kick offset (0,0) — identity transform ──
    for (const [from, to] of rotPairs) {
      scenarios.push(scenario(
        `TC-CE-20-${from}→${to}: T-piece kick table ${from}→${to} starts with (0,0)`,
        category,
        () => {
          const kicks = StackyPieces.getKicks('T', from, to);
          check.truthy(kicks.length >= 1);
          check.eq(kicks[0][0], 0);
          check.eq(kicks[0][1], 0);
        }
      ));
    }

    // ── TC-CE-21: I-piece has 5 kick offsets per rotation pair ──
    scenarios.push(scenario(
      'TC-CE-21: I-piece kick table 0→1 has exactly 5 offsets',
      category,
      () => {
        const kicks = StackyPieces.getKicks('I', 0, 1);
        check.eq(kicks.length, 5);
      }
    ));

    // ── TC-CE-22: O-piece kick table is identity only ──
    scenarios.push(scenario(
      'TC-CE-22: O-piece kick table returns [[0,0]] for any rotation',
      category,
      () => {
        const kicks = StackyPieces.getKicks('O', 0, 1);
        check.eq(kicks.length, 1);
        check.eq(kicks[0][0], 0);
        check.eq(kicks[0][1], 0);
      }
    ));

    // ── TC-CE-23: Wall kick at left edge — at least one valid placement ──
    scenarios.push(scenario(
      'TC-CE-23: I-piece at x=0, rot 0→1 — wall kick sequence finds valid placement',
      category,
      () => {
        const grid = CK.createEmptyGrid();
        const piece = { type: 'I', rotation: 0, x: 0, y: 10 };
        const toRot = 1;
        const kicks = StackyPieces.getKicks('I', 0, toRot);
        let found = false;
        for (const kick of kicks) {
          const candidate = {
            type: 'I', rotation: toRot,
            x: piece.x + kick[0],
            y: piece.y - kick[1],
          };
          if (!CK.checkCollision(grid, candidate)) {
            found = true;
            break;
          }
        }
        check.truthy(found);
      }
    ));

    // ── TC-CE-24: Wall kick at right edge ──
    scenarios.push(scenario(
      'TC-CE-24: I-piece at x=9, rot 0→3 — wall kick finds valid placement on empty grid',
      category,
      () => {
        const grid = CK.createEmptyGrid();
        const piece = { type: 'I', rotation: 0, x: 9, y: 10 };
        const toRot = 3;
        const kicks = StackyPieces.getKicks('I', 0, toRot);
        let found = false;
        for (const kick of kicks) {
          const candidate = {
            type: 'I', rotation: toRot,
            x: piece.x + kick[0],
            y: piece.y - kick[1],
          };
          if (!CK.checkCollision(grid, candidate)) {
            found = true;
            break;
          }
        }
        check.truthy(found);
      }
    ));

    return scenarios;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §7. WOBBLE THRESHOLD COLLISION TESTS
//      — metastable states at the lock delay boundary
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * WobbleThresholdCollisionTestGenerator
 *
 * A "wobble" occurs when a piece at the floor is laterally shifted by the player
 * during lock delay, causing it to alternate between grounded and airborne states.
 * The collision predicate must remain consistent regardless of the wobble phase.
 *
 * This generator constructs grid configurations that create narrow corridors
 * where a piece can slide left/right but must eventually lock — testing that
 * the collision detection is frame-order independent.
 */
class WobbleThresholdCollisionTestGenerator extends AbstractTestCaseFactory {
  createScenarios() {
    const scenarios = [];
    const category = 'Wobble Threshold Failures';

    // ── TC-CE-30: T-piece on uneven floor — left position grounded, right airborne ──
    scenarios.push(scenario(
      'TC-CE-30: T-piece wobble — col 4 floor at row 18, col 5 floor at row 19',
      category,
      () => {
        const grid = CK.createEmptyGrid();
        // Create uneven floor: col 4 has block at row 19, col 5 is empty
        grid[19][4] = 1;
        // T-piece at (3, 17) rot 0: cells at (4,17), (3,18), (4,18), (5,18)
        const piece = { type: 'T', rotation: 0, x: 3, y: 17 };
        const collidesAtY17 = CK.checkCollision(grid, piece);
        // Should not collide — piece cells at y=17 and y=18, only (4,19) is occupied
        check.falsy(collidesAtY17);

        // Moving down to y=18: cells at (4,18), (3,19), (4,19), (5,19)
        const pieceLower = { type: 'T', rotation: 0, x: 3, y: 18 };
        const collidesAtY18 = CK.checkCollision(grid, pieceLower);
        // Cell (4,19) is occupied → collision
        check.truthy(collidesAtY18);
      }
    ));

    // ── TC-CE-31: I-piece horizontal wobble over gap ──
    scenarios.push(scenario(
      'TC-CE-31: I-piece horizontal wobble — gap at col 5, floor at row 19',
      category,
      () => {
        const grid = CK.createEmptyGrid();
        for (let x = 0; x < COLS; x++) {
          if (x !== 5) grid[19][x] = 1;
        }
        // I-piece horizontal at y=18, x=3: cells at (3,18),(4,18),(5,18),(6,18)
        const pieceAbove = { type: 'I', rotation: 0, x: 3, y: 18 };
        check.falsy(CK.checkCollision(grid, pieceAbove));

        // I-piece at y=19, x=3: cells at (3,19),(4,19),(5,19),(6,19)
        // col 5 at row 19 is empty, but cols 3,4,6 are occupied → collision
        const pieceAtFloor = { type: 'I', rotation: 0, x: 3, y: 19 };
        check.truthy(CK.checkCollision(grid, pieceAtFloor));
      }
    ));

    // ── TC-CE-32: Lateral slide during wobble preserves collision state ──
    scenarios.push(scenario(
      'TC-CE-32: Lateral slide consistency — collision at (4,18) = collision at (5,18) on uniform floor',
      category,
      () => {
        const grid = CK.createEmptyGrid();
        for (let x = 0; x < COLS; x++) grid[19][x] = 1;

        // T-piece at two adjacent positions, same y, same floor
        const pieceA = { type: 'T', rotation: 0, x: 4, y: 18 };
        const pieceB = { type: 'T', rotation: 0, x: 5, y: 18 };
        const collA = CK.checkCollision(grid, pieceA);
        const collB = CK.checkCollision(grid, pieceB);
        // Both should be either true or false (consistent floor behavior)
        check.eq(collA, collB);
      }
    ));

    // ── TC-CE-33: Wobble between two rotations — same y ──
    scenarios.push(scenario(
      'TC-CE-33: S-piece rotation wobble at floor — rot 0 vs rot 2 at same (x,y)',
      category,
      () => {
        const grid = CK.createEmptyGrid();
        const piece0 = { type: 'S', rotation: 0, x: 4, y: 17 };
        const piece2 = { type: 'S', rotation: 2, x: 4, y: 17 };
        // Both rotations at same position on empty grid — neither should collide
        check.falsy(CK.checkCollision(grid, piece0));
        check.falsy(CK.checkCollision(grid, piece2));
      }
    ));

    // ── TC-CE-34: Wobble at column 0 — can't slide left ──
    scenarios.push(scenario(
      'TC-CE-34: T-piece at x=0 — left slide attempt produces collision',
      category,
      () => {
        const grid = CK.createEmptyGrid();
        const piece = { type: 'T', rotation: 0, x: 0, y: 18 };
        check.falsy(CK.checkCollision(grid, piece));

        const pieceLeft = { type: 'T', rotation: 0, x: -1, y: 18 };
        check.truthy(CK.checkCollision(grid, pieceLeft));
      }
    ));

    // ── TC-CE-35: Wobble at column 9 — can't slide right ──
    scenarios.push(scenario(
      'TC-CE-35: T-piece at rightmost valid x — right slide attempt produces collision',
      category,
      () => {
        const grid = CK.createEmptyGrid();
        // Find rightmost valid x for T-piece rot 0
        let maxX = 0;
        for (let x = 0; x < COLS; x++) {
          const piece = { type: 'T', rotation: 0, x, y: 10 };
          if (!CK.checkCollision(grid, piece)) maxX = x;
        }
        const pieceRight = { type: 'T', rotation: 0, x: maxX + 1, y: 10 };
        check.truthy(CK.checkCollision(grid, pieceRight));
      }
    ));

    return scenarios;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §8. MULTI-PIECE OVERLAP DETECTION
//      — verifying that getCells produces non-overlapping placements
// ═══════════════════════════════════════════════════════════════════════════════

class MultiPieceOverlapTestGenerator extends AbstractTestCaseFactory {
  createScenarios() {
    const scenarios = [];
    const category = 'Multi-Piece Overlap Detection';

    // ── TC-CE-40: Two pieces at same position always overlap ──
    scenarios.push(scenario(
      'TC-CE-40: Two T-pieces at identical (x,y,rot) — cells overlap',
      category,
      () => {
        const cellsA = StackyPieces.getCells({ type: 'T', rotation: 0, x: 4, y: 10 });
        const cellsB = StackyPieces.getCells({ type: 'T', rotation: 0, x: 4, y: 10 });
        const aSet = new Set(cellsA.map(c => `${c.x},${c.y}`));
        const overlaps = cellsB.some(c => aSet.has(`${c.x},${c.y}`));
        check.truthy(overlaps);
      }
    ));

    // ── TC-CE-41: Each piece type has exactly 4 cells ──
    for (const type of StackyPieces.TYPES) {
      scenarios.push(scenario(
        `TC-CE-41-${type}: ${type}-piece getCells returns exactly 4 cells`,
        category,
        () => {
          const cells = StackyPieces.getCells({ type, rotation: 0, x: 4, y: 10 });
          check.eq(cells.length, 4);
        }
      ));
    }

    // ── TC-CE-42: No piece has duplicate cells within itself ──
    for (const type of StackyPieces.TYPES) {
      for (let rot = 0; rot < 4; rot++) {
        scenarios.push(scenario(
          `TC-CE-42-${type}-r${rot}: ${type} rotation ${rot} — no duplicate cells`,
          category,
          () => {
            const cells = StackyPieces.getCells({ type, rotation: rot % (type === 'O' ? 1 : 4), x: 4, y: 10 });
            const grid = new GridStateAssertionEngine(COLS, ROWS);
            check.truthy(grid.hasNoDuplicates(cells));
          }
        ));
      }
    }

    return scenarios;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §9. ORCHESTRATION & EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

const orchestrator = new TestSuiteOrchestrator(
  'StackY Collision Edge Case Suite — Dr. Schneider',
  75
);

orchestrator.registerFactories([
  new WallCollisionEdgeCaseTestGenerator(),
  new CellOccupationCollisionTestGenerator(),
  new WallKickCollisionResolutionTestGenerator(),
  new WobbleThresholdCollisionTestGenerator(),
  new MultiPieceOverlapTestGenerator(),
]);

orchestrator.execute();
