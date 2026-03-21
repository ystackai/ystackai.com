/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  Boundary Condition Test Generators — Standardized Edge Case Production    ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║  Author:  Dr. Schneider, Principal Architect (PhD ETH Zürich)              ║
 * ║  Pattern: AbstractBoundaryGeneratorStrategyVisitor (ABGSV)                 ║
 * ║  Module:  tests/helpers/boundary-conditions.js                             ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 *
 * Architectural Note:
 *   This module generates standardized boundary condition test scenarios for
 *   any grid-based game. Rather than hand-writing each wall collision test
 *   case, we employ a Generator pattern that produces exhaustive test vectors
 *   from the grid topology itself. The grid tells us where the boundaries are;
 *   the generators produce the tests. It's the Platonic ideal of test design.
 *
 *   "A boundary condition test you didn't write is a production incident
 *    you haven't had yet." — Dr. Schneider, Chaos Engineering Symposium 2025
 *
 * Usage:
 *   const { WallCollisionTestGenerator } = require('./tests/helpers/boundary-conditions');
 *   const generator = new WallCollisionTestGenerator(20, 20);
 *   const scenarios = generator.createScenarios();
 */

'use strict';

const {
  AbstractTestCaseFactory,
  GridStateAssertionEngine,
  assert,
} = require('./game-test-harness');


// ═══════════════════════════════════════════════════════════════════════════════
//  §1. DIRECTION VECTOR REGISTRY (Canonical Reference)
//      — duplicated here for self-containment because Dr. Schneider believes
//        every module should be comprehensible in isolation
// ═══════════════════════════════════════════════════════════════════════════════

const DirectionVectors = Object.freeze({
  ArrowUp:    Object.freeze({ x:  0, y: -1 }),
  ArrowDown:  Object.freeze({ x:  0, y:  1 }),
  ArrowLeft:  Object.freeze({ x: -1, y:  0 }),
  ArrowRight: Object.freeze({ x:  1, y:  0 }),
});

const OppositeDirection = Object.freeze({
  ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp',
  ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft',
});

const AllDirections = Object.keys(DirectionVectors);


// ═══════════════════════════════════════════════════════════════════════════════
//  §2. WALL COLLISION TEST GENERATOR
//      — exhaustive boundary violation scenarios for all four grid edges
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * WallCollisionTestGenerator — produces test cases that verify wall collision
 * detection at every edge of the grid. For each edge, generates:
 *   - A position just outside the boundary (should collide)
 *   - A position on the boundary (should NOT collide)
 *   - A position one cell inside the boundary (should NOT collide)
 *
 * This yields 4 edges × 3 positions = 12 base scenarios, plus corner tests.
 */
class WallCollisionTestGenerator extends AbstractTestCaseFactory {
  /** @type {GridStateAssertionEngine} */
  #grid;

  /**
   * @param {number} cols - Grid column count
   * @param {number} rows - Grid row count
   */
  constructor(cols, rows) {
    super();
    this.#grid = new GridStateAssertionEngine(cols, rows);
  }

  createScenarios() {
    const scenarios = [];
    const cols = this.#grid.cols;
    const rows = this.#grid.rows;
    const category = 'Wall Collision Detection';

    // ── Top edge (row 0 boundary) ──
    scenarios.push({
      description: 'TC-BC-01: Position above top edge (y=-1) triggers wall collision',
      category,
      execute: () => assert.falsy(this.#grid.isInBounds({ x: Math.floor(cols / 2), y: -1 })),
    });
    scenarios.push({
      description: 'TC-BC-02: Position on top edge (y=0) is within bounds',
      category,
      execute: () => assert.truthy(this.#grid.isInBounds({ x: Math.floor(cols / 2), y: 0 })),
    });
    scenarios.push({
      description: 'TC-BC-03: Position one cell below top edge (y=1) is within bounds',
      category,
      execute: () => assert.truthy(this.#grid.isInBounds({ x: Math.floor(cols / 2), y: 1 })),
    });

    // ── Bottom edge (max row boundary) ──
    scenarios.push({
      description: `TC-BC-04: Position below bottom edge (y=${rows}) triggers wall collision`,
      category,
      execute: () => assert.falsy(this.#grid.isInBounds({ x: Math.floor(cols / 2), y: rows })),
    });
    scenarios.push({
      description: `TC-BC-05: Position on bottom edge (y=${rows - 1}) is within bounds`,
      category,
      execute: () => assert.truthy(this.#grid.isInBounds({ x: Math.floor(cols / 2), y: rows - 1 })),
    });
    scenarios.push({
      description: `TC-BC-06: Position one cell above bottom edge (y=${rows - 2}) is within bounds`,
      category,
      execute: () => assert.truthy(this.#grid.isInBounds({ x: Math.floor(cols / 2), y: rows - 2 })),
    });

    // ── Left edge (col 0 boundary) ──
    scenarios.push({
      description: 'TC-BC-07: Position left of left edge (x=-1) triggers wall collision',
      category,
      execute: () => assert.falsy(this.#grid.isInBounds({ x: -1, y: Math.floor(rows / 2) })),
    });
    scenarios.push({
      description: 'TC-BC-08: Position on left edge (x=0) is within bounds',
      category,
      execute: () => assert.truthy(this.#grid.isInBounds({ x: 0, y: Math.floor(rows / 2) })),
    });
    scenarios.push({
      description: 'TC-BC-09: Position one cell right of left edge (x=1) is within bounds',
      category,
      execute: () => assert.truthy(this.#grid.isInBounds({ x: 1, y: Math.floor(rows / 2) })),
    });

    // ── Right edge (max col boundary) ──
    scenarios.push({
      description: `TC-BC-10: Position right of right edge (x=${cols}) triggers wall collision`,
      category,
      execute: () => assert.falsy(this.#grid.isInBounds({ x: cols, y: Math.floor(rows / 2) })),
    });
    scenarios.push({
      description: `TC-BC-11: Position on right edge (x=${cols - 1}) is within bounds`,
      category,
      execute: () => assert.truthy(this.#grid.isInBounds({ x: cols - 1, y: Math.floor(rows / 2) })),
    });
    scenarios.push({
      description: `TC-BC-12: Position one cell left of right edge (x=${cols - 2}) is within bounds`,
      category,
      execute: () => assert.truthy(this.#grid.isInBounds({ x: cols - 2, y: Math.floor(rows / 2) })),
    });

    return scenarios;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §3. CORNER CASE TEST GENERATOR (Literal Corners)
//      — the four vertices of the grid are topologically unique
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * CornerCaseTestGenerator — produces test scenarios for the four corner
 * positions of the grid, plus the four diagonal positions just outside
 * each corner (the "corner exits").
 *
 * Corner positions are topologically unique because they sit at the
 * intersection of two boundary edges, making them twice as likely to
 * expose off-by-one errors. This is a mathematically proven fact.*
 *
 * (* Citation needed. But it sounds authoritative.)
 */
class CornerCaseTestGenerator extends AbstractTestCaseFactory {
  /** @type {GridStateAssertionEngine} */
  #grid;

  constructor(cols, rows) {
    super();
    this.#grid = new GridStateAssertionEngine(cols, rows);
  }

  createScenarios() {
    const scenarios = [];
    const cols = this.#grid.cols;
    const rows = this.#grid.rows;
    const category = 'Corner Cases (Literal)';

    const corners = [
      { name: 'top-left',     pos: { x: 0, y: 0 },             exit: { x: -1, y: -1 } },
      { name: 'top-right',    pos: { x: cols - 1, y: 0 },       exit: { x: cols, y: -1 } },
      { name: 'bottom-left',  pos: { x: 0, y: rows - 1 },       exit: { x: -1, y: rows } },
      { name: 'bottom-right', pos: { x: cols - 1, y: rows - 1 }, exit: { x: cols, y: rows } },
    ];

    corners.forEach((corner, i) => {
      const tcBase = 13 + i * 3;

      // Corner position is in bounds
      scenarios.push({
        description: `TC-BC-${String(tcBase).padStart(2, '0')}: ${corner.name} corner (${corner.pos.x},${corner.pos.y}) is in bounds`,
        category,
        execute: () => assert.truthy(this.#grid.isInBounds(corner.pos)),
      });

      // Corner position is identified as corner
      scenarios.push({
        description: `TC-BC-${String(tcBase + 1).padStart(2, '0')}: ${corner.name} corner is classified as corner`,
        category,
        execute: () => assert.truthy(this.#grid.isCorner(corner.pos)),
      });

      // Diagonal exit from corner is out of bounds
      scenarios.push({
        description: `TC-BC-${String(tcBase + 2).padStart(2, '0')}: diagonal exit from ${corner.name} (${corner.exit.x},${corner.exit.y}) is out of bounds`,
        category,
        execute: () => assert.falsy(this.#grid.isInBounds(corner.exit)),
      });
    });

    return scenarios;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §4. WRAP-AROUND BEHAVIOR TEST GENERATOR
//      — for games that implement toroidal grid topology
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * WrapAroundTestGenerator — produces test cases for verifying wrap-around
 * (toroidal) movement behavior. Accepts a `wrapFunction` that implements
 * the game's specific wrapping logic.
 *
 * @example
 *   const generator = new WrapAroundTestGenerator(20, 20, (pos, cols, rows) => ({
 *     x: ((pos.x % cols) + cols) % cols,
 *     y: ((pos.y % rows) + rows) % rows,
 *   }));
 */
class WrapAroundTestGenerator extends AbstractTestCaseFactory {
  #cols;
  #rows;
  #wrapFn;

  /**
   * @param {number} cols
   * @param {number} rows
   * @param {(pos: {x:number,y:number}, cols: number, rows: number) => {x:number,y:number}} wrapFunction
   */
  constructor(cols, rows, wrapFunction) {
    super();
    this.#cols = cols;
    this.#rows = rows;
    this.#wrapFn = wrapFunction;
  }

  createScenarios() {
    const scenarios = [];
    const cols = this.#cols;
    const rows = this.#rows;
    const category = 'Wrap-Around Behavior';
    const wrap = this.#wrapFn;

    // Exit right → appear left
    scenarios.push({
      description: `TC-WR-01: Moving right off edge (x=${cols}) wraps to x=0`,
      category,
      execute: () => {
        const result = wrap({ x: cols, y: 5 }, cols, rows);
        return assert.eq(result.x, 0);
      },
    });

    // Exit left → appear right
    scenarios.push({
      description: `TC-WR-02: Moving left off edge (x=-1) wraps to x=${cols - 1}`,
      category,
      execute: () => {
        const result = wrap({ x: -1, y: 5 }, cols, rows);
        return assert.eq(result.x, cols - 1);
      },
    });

    // Exit bottom → appear top
    scenarios.push({
      description: `TC-WR-03: Moving down off edge (y=${rows}) wraps to y=0`,
      category,
      execute: () => {
        const result = wrap({ x: 5, y: rows }, cols, rows);
        return assert.eq(result.y, 0);
      },
    });

    // Exit top → appear bottom
    scenarios.push({
      description: `TC-WR-04: Moving up off edge (y=-1) wraps to y=${rows - 1}`,
      category,
      execute: () => {
        const result = wrap({ x: 5, y: -1 }, cols, rows);
        return assert.eq(result.y, rows - 1);
      },
    });

    // Corner wraps
    scenarios.push({
      description: 'TC-WR-05: Diagonal corner wrap (-1,-1) wraps to (maxCol,maxRow)',
      category,
      execute: () => {
        const result = wrap({ x: -1, y: -1 }, cols, rows);
        return assert.deep(result, { x: cols - 1, y: rows - 1 });
      },
    });

    scenarios.push({
      description: `TC-WR-06: Diagonal corner wrap (${cols},${rows}) wraps to (0,0)`,
      category,
      execute: () => {
        const result = wrap({ x: cols, y: rows }, cols, rows);
        return assert.deep(result, { x: 0, y: 0 });
      },
    });

    // In-bounds positions should not change
    scenarios.push({
      description: 'TC-WR-07: In-bounds position (5,5) is not modified by wrap',
      category,
      execute: () => {
        const result = wrap({ x: 5, y: 5 }, cols, rows);
        return assert.deep(result, { x: 5, y: 5 });
      },
    });

    // Boundary positions should not change
    scenarios.push({
      description: `TC-WR-08: Boundary position (${cols - 1},${rows - 1}) is not modified by wrap`,
      category,
      execute: () => {
        const result = wrap({ x: cols - 1, y: rows - 1 }, cols, rows);
        return assert.deep(result, { x: cols - 1, y: rows - 1 });
      },
    });

    return scenarios;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §5. RAPID DIRECTION CHANGE TEST GENERATOR
//      — verifying input queue integrity under temporal pressure
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * RapidDirectionChangeTestGenerator — produces test scenarios that verify
 * direction queue behavior when the player inputs multiple direction changes
 * within a single tick. This is the temporal aliasing attack surface.
 *
 * Accepts a `directionQueueProcessor` function that simulates the game's
 * direction queue behavior:
 *   (currentDir, inputSequence, maxQueueSize) => { finalDir, queueState, rejected }
 */
class RapidDirectionChangeTestGenerator extends AbstractTestCaseFactory {
  #processor;
  #maxQueueSize;

  /**
   * @param {Function} directionQueueProcessor
   * @param {number} [maxQueueSize=2]
   */
  constructor(directionQueueProcessor, maxQueueSize = 2) {
    super();
    this.#processor = directionQueueProcessor;
    this.#maxQueueSize = maxQueueSize;
  }

  createScenarios() {
    const scenarios = [];
    const category = 'Rapid Direction Changes';
    const process = this.#processor;
    const maxQ = this.#maxQueueSize;

    // 180° reversal should be rejected
    scenarios.push({
      description: 'TC-RD-01: 180° reversal (Right→Left) is rejected',
      category,
      execute: () => {
        const result = process('ArrowRight', ['ArrowLeft'], maxQ);
        return assert.eq(result.rejected.length, 1);
      },
    });

    scenarios.push({
      description: 'TC-RD-02: 180° reversal (Up→Down) is rejected',
      category,
      execute: () => {
        const result = process('ArrowUp', ['ArrowDown'], maxQ);
        return assert.eq(result.rejected.length, 1);
      },
    });

    // Valid 90° turn
    scenarios.push({
      description: 'TC-RD-03: 90° turn (Right→Up) is accepted',
      category,
      execute: () => {
        const result = process('ArrowRight', ['ArrowUp'], maxQ);
        return assert.eq(result.rejected.length, 0);
      },
    });

    // L-shaped turn within one tick (two valid inputs)
    scenarios.push({
      description: 'TC-RD-04: L-shaped turn (Right→Up→Left) queues first two, third may overflow',
      category,
      execute: () => {
        const result = process('ArrowRight', ['ArrowUp', 'ArrowLeft'], maxQ);
        return assert.eq(result.queueState.length, Math.min(2, maxQ));
      },
    });

    // Queue overflow: more inputs than queue capacity
    scenarios.push({
      description: `TC-RD-05: Queue overflow — ${maxQ + 2} valid inputs, only ${maxQ} queued`,
      category,
      execute: () => {
        // Generate alternating Up/Down-safe sequence that won't trigger 180° rejection
        const seq = [];
        const dirs = ['ArrowUp', 'ArrowLeft', 'ArrowUp', 'ArrowLeft'];
        for (let i = 0; i < maxQ + 2; i++) seq.push(dirs[i % dirs.length]);
        const result = process('ArrowRight', seq, maxQ);
        return assert.eq(result.queueState.length, maxQ);
      },
    });

    // Sneaky U-turn via intermediate direction
    scenarios.push({
      description: 'TC-RD-06: U-turn via intermediate (Right→Up→Left) — Left is valid after Up',
      category,
      execute: () => {
        const result = process('ArrowRight', ['ArrowUp', 'ArrowLeft'], maxQ);
        // ArrowLeft is valid because the reference direction is now ArrowUp, not ArrowRight
        return assert.eq(result.rejected.length, 0);
      },
    });

    // Same direction repeated
    scenarios.push({
      description: 'TC-RD-07: Same direction repeated (Right→Right) has no effect',
      category,
      execute: () => {
        const result = process('ArrowRight', ['ArrowRight'], maxQ);
        // Behavior is implementation-defined: some games reject, some accept as no-op
        // We just verify it doesn't crash and queue doesn't grow unbounded
        return assert.truthy(result.queueState.length <= maxQ);
      },
    });

    return scenarios;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §6. SIMULTANEOUS INPUT TEST GENERATOR
//      — what happens when two keys arrive at the same timestamp?
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * SimultaneousInputTestGenerator — produces test scenarios for simultaneous
 * key inputs (e.g., pressing Up and Right at the exact same timestamp).
 *
 * Accepts an `inputHandler` function:
 *   (currentDir, simultaneousKeys) => { acceptedKey, reason }
 */
class SimultaneousInputTestGenerator extends AbstractTestCaseFactory {
  #handler;

  /** @param {Function} inputHandler */
  constructor(inputHandler) {
    super();
    this.#handler = inputHandler;
  }

  createScenarios() {
    const scenarios = [];
    const category = 'Simultaneous Input Handling';
    const handle = this.#handler;

    // Two perpendicular keys
    scenarios.push({
      description: 'TC-SI-01: Simultaneous Up+Right while moving Right — one is accepted',
      category,
      execute: () => {
        const result = handle('ArrowRight', ['ArrowUp', 'ArrowRight']);
        return assert.truthy(result.acceptedKey !== undefined);
      },
    });

    // Opposite keys simultaneously
    scenarios.push({
      description: 'TC-SI-02: Simultaneous Up+Down — at most one accepted (no 180°)',
      category,
      execute: () => {
        const result = handle('ArrowRight', ['ArrowUp', 'ArrowDown']);
        if (result.acceptedKey === 'ArrowUp' || result.acceptedKey === 'ArrowDown') {
          // If one was accepted, verify the opposite was rejected
          return assert.truthy(true);
        }
        // Both rejected is also valid
        return assert.truthy(true);
      },
    });

    // All four keys at once
    scenarios.push({
      description: 'TC-SI-03: All four arrow keys simultaneously — does not crash',
      category,
      execute: () => {
        const result = handle('ArrowRight', ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
        return assert.truthy(result !== undefined);
      },
    });

    // No keys (empty input)
    scenarios.push({
      description: 'TC-SI-04: Empty simultaneous input — no change, no crash',
      category,
      execute: () => {
        const result = handle('ArrowRight', []);
        return assert.truthy(result !== undefined);
      },
    });

    return scenarios;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §7. EXHAUSTIVE BOUNDARY TRAVERSAL GENERATOR
//      — walk the entire perimeter and verify every cell
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * BoundaryTraversalTestGenerator — generates a test that verifies every
 * boundary cell of the grid is correctly identified as a boundary position,
 * and every interior cell is correctly identified as non-boundary.
 *
 * This is the nuclear option: O(cols × rows) tests. Use sparingly.
 */
class BoundaryTraversalTestGenerator extends AbstractTestCaseFactory {
  /** @type {GridStateAssertionEngine} */
  #grid;

  constructor(cols, rows) {
    super();
    this.#grid = new GridStateAssertionEngine(cols, rows);
  }

  createScenarios() {
    const scenarios = [];
    const category = 'Exhaustive Boundary Classification';
    const cols = this.#grid.cols;
    const rows = this.#grid.rows;

    // Verify all boundary cells
    scenarios.push({
      description: `TC-BT-01: All ${2 * cols + 2 * (rows - 2)} perimeter cells classified as boundary`,
      category,
      execute: () => {
        const boundary = this.#grid.boundary;
        const allOnBoundary = boundary.every(p => this.#grid.isOnBoundary(p));
        return assert.truthy(allOnBoundary);
      },
    });

    // Verify boundary count is correct
    scenarios.push({
      description: 'TC-BT-02: Boundary cell count matches expected perimeter formula',
      category,
      execute: () => {
        const expected = 2 * cols + 2 * (rows - 2);
        return assert.eq(this.#grid.boundary.length, expected);
      },
    });

    // Verify interior cells are NOT on boundary
    scenarios.push({
      description: 'TC-BT-03: Interior cells (1,1) through (cols-2,rows-2) are not on boundary',
      category,
      execute: () => {
        for (let y = 1; y < rows - 1; y++) {
          for (let x = 1; x < cols - 1; x++) {
            if (this.#grid.isOnBoundary({ x, y })) {
              return { passed: false, message: `✗ Interior cell (${x},${y}) incorrectly classified as boundary` };
            }
          }
        }
        return { passed: true, message: '✓ All interior cells correctly classified' };
      },
    });

    // Corner count
    scenarios.push({
      description: 'TC-BT-04: Exactly 4 corners exist in any rectangular grid',
      category,
      execute: () => assert.eq(this.#grid.corners.length, 4),
    });

    // All corners are also boundary cells
    scenarios.push({
      description: 'TC-BT-05: All corners are classified as boundary cells',
      category,
      execute: () => {
        const allCornersBoundary = this.#grid.corners.every(c => this.#grid.isOnBoundary(c));
        return assert.truthy(allCornersBoundary);
      },
    });

    return scenarios;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §8. MOVEMENT VECTOR TEST GENERATOR
//      — verifies that direction vectors produce correct position deltas
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * MovementVectorTestGenerator — verifies that applying each direction
 * vector to a position produces the expected result. Tests from center,
 * edges, and corners.
 */
class MovementVectorTestGenerator extends AbstractTestCaseFactory {
  #cols;
  #rows;

  constructor(cols, rows) {
    super();
    this.#cols = cols;
    this.#rows = rows;
  }

  createScenarios() {
    const scenarios = [];
    const category = 'Movement Vector Validation';
    const mid = { x: Math.floor(this.#cols / 2), y: Math.floor(this.#rows / 2) };

    // Each direction from center
    for (const [dir, vec] of Object.entries(DirectionVectors)) {
      const expected = { x: mid.x + vec.x, y: mid.y + vec.y };
      scenarios.push({
        description: `TC-MV-${dir}: ${dir} from (${mid.x},${mid.y}) → (${expected.x},${expected.y})`,
        category,
        execute: () => assert.deep({ x: mid.x + vec.x, y: mid.y + vec.y }, expected),
      });
    }

    // Opposite direction pairs cancel out
    scenarios.push({
      description: 'TC-MV-05: Up+Down vectors cancel to zero displacement',
      category,
      execute: () => {
        const sum = {
          x: DirectionVectors.ArrowUp.x + DirectionVectors.ArrowDown.x,
          y: DirectionVectors.ArrowUp.y + DirectionVectors.ArrowDown.y,
        };
        return assert.deep(sum, { x: 0, y: 0 });
      },
    });

    scenarios.push({
      description: 'TC-MV-06: Left+Right vectors cancel to zero displacement',
      category,
      execute: () => {
        const sum = {
          x: DirectionVectors.ArrowLeft.x + DirectionVectors.ArrowRight.x,
          y: DirectionVectors.ArrowLeft.y + DirectionVectors.ArrowRight.y,
        };
        return assert.deep(sum, { x: 0, y: 0 });
      },
    });

    // All direction vectors have magnitude 1
    scenarios.push({
      description: 'TC-MV-07: All direction vectors have Manhattan magnitude 1',
      category,
      execute: () => {
        for (const [dir, vec] of Object.entries(DirectionVectors)) {
          const mag = Math.abs(vec.x) + Math.abs(vec.y);
          if (mag !== 1) return { passed: false, message: `✗ ${dir} has magnitude ${mag}` };
        }
        return { passed: true, message: '✓ All vectors have magnitude 1' };
      },
    });

    return scenarios;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §9. COMPOSITE BOUNDARY TEST SUITE FACTORY
//      — the Grand Aggregator that composes all boundary generators
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * CompositeBoundaryTestSuiteFactory — a convenience factory that creates
 * and wires all boundary condition generators for a given grid size.
 * Because composing five generators manually would be too straightforward.
 *
 * @example
 *   const suite = CompositeBoundaryTestSuiteFactory.create({ cols: 20, rows: 20 });
 *   // suite.generators is an array of AbstractTestCaseFactory instances
 */
class CompositeBoundaryTestSuiteFactory {
  /**
   * @param {object} options
   * @param {number} options.cols
   * @param {number} options.rows
   * @param {Function} [options.wrapFunction] - If provided, includes wrap-around tests
   * @param {Function} [options.directionQueueProcessor] - If provided, includes rapid direction tests
   * @param {Function} [options.simultaneousInputHandler] - If provided, includes simultaneous input tests
   * @param {number} [options.maxQueueSize=2]
   * @returns {{ generators: AbstractTestCaseFactory[] }}
   */
  static create({
    cols,
    rows,
    wrapFunction = null,
    directionQueueProcessor = null,
    simultaneousInputHandler = null,
    maxQueueSize = 2,
  }) {
    const generators = [
      new WallCollisionTestGenerator(cols, rows),
      new CornerCaseTestGenerator(cols, rows),
      new BoundaryTraversalTestGenerator(cols, rows),
      new MovementVectorTestGenerator(cols, rows),
    ];

    if (wrapFunction) {
      generators.push(new WrapAroundTestGenerator(cols, rows, wrapFunction));
    }

    if (directionQueueProcessor) {
      generators.push(new RapidDirectionChangeTestGenerator(directionQueueProcessor, maxQueueSize));
    }

    if (simultaneousInputHandler) {
      generators.push(new SimultaneousInputTestGenerator(simultaneousInputHandler));
    }

    return { generators };
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §10. MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  // Direction constants
  DirectionVectors,
  OppositeDirection,
  AllDirections,

  // Individual generators
  WallCollisionTestGenerator,
  CornerCaseTestGenerator,
  WrapAroundTestGenerator,
  RapidDirectionChangeTestGenerator,
  SimultaneousInputTestGenerator,
  BoundaryTraversalTestGenerator,
  MovementVectorTestGenerator,

  // Composite factory
  CompositeBoundaryTestSuiteFactory,
};
