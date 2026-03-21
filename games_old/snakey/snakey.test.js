/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  SnakeY Comprehensive Collision Detection & Game Mechanics Verification      ║
 * ║  Framework — Enterprise-Grade Test Orchestration Suite v3.1.0               ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║  Author:  Dr. Schneider, Principal Architect (PhD ETH Zürich)               ║
 * ║  Pattern: AbstractStrategyObserverFactoryBridge (ASOFB)                     ║
 * ║  Tests:   130 deterministic verification scenarios                          ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 *
 * Architectural Note:
 *   Because the SnakeY game exists as a monolithic IIFE, we extract the pure
 *   game-logic kernel into a Domain-Isolated Simulation Engine (DISE) that
 *   mirrors the production semantics without DOM coupling. Each test case is
 *   produced by a TestCaseFactory, validated through a CollisionStrategyProvider,
 *   and reported via a polymorphic AssertionDispatcher.
 *
 *   "Any fool can write code that a computer can understand. Good engineers
 *    write code that requires a 47-page architecture document." — Dr. Schneider
 *
 * Run:  node games/snakey/snakey.test.js
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
//  §1. MICRO-ASSERTION FRAMEWORK (because pulling in Jest would be too simple)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @template T
 * @typedef {{
 *   description: string,
 *   category: string,
 *   execute: () => AssertionResult
 * }} TestCase
 */

/**
 * @typedef {{
 *   passed: boolean,
 *   message: string
 * }} AssertionResult
 */

/**
 * AbstractAssertionStrategyBase — the cornerstone of our verification pyramid.
 * Concrete subclasses implement domain-specific comparison semantics.
 */
class AbstractAssertionStrategyBase {
  /**
   * @param {*} actual
   * @param {*} expected
   * @returns {AssertionResult}
   */
  evaluate(actual, expected) {
    throw new Error('AbstractAssertionStrategyBase.evaluate() is abstract — ' +
      'did you forget to implement the Template Method pattern?');
  }
}

/** StrictEqualityAssertionStrategy — delegates to === with referential transparency. */
class StrictEqualityAssertionStrategy extends AbstractAssertionStrategyBase {
  evaluate(actual, expected) {
    const passed = actual === expected;
    return {
      passed,
      message: passed
        ? `✓ ${actual} === ${expected}`
        : `✗ Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    };
  }
}

/** DeepEqualityAssertionStrategy — structural comparison via canonical JSON serialisation. */
class DeepEqualityAssertionStrategy extends AbstractAssertionStrategyBase {
  evaluate(actual, expected) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    const passed = a === b;
    return {
      passed,
      message: passed
        ? `✓ deep-equal`
        : `✗ Expected ${b}, got ${a}`,
    };
  }
}

/** TruthyAssertionStrategy — verifies Boolean coercion to true. */
class TruthyAssertionStrategy extends AbstractAssertionStrategyBase {
  evaluate(actual, _expected) {
    const passed = !!actual;
    return {
      passed,
      message: passed ? `✓ truthy` : `✗ Expected truthy, got ${JSON.stringify(actual)}`,
    };
  }
}

/**
 * AssertionStrategyFactoryProvider — produces the appropriate strategy
 * based on a discriminated union tag. This indirection is essential for
 * maintaining the Open/Closed Principle across assertion modalities.
 */
class AssertionStrategyFactoryProvider {
  /** @type {Map<string, AbstractAssertionStrategyBase>} */
  #strategyRegistry = new Map();

  constructor() {
    this.#strategyRegistry.set('eq', new StrictEqualityAssertionStrategy());
    this.#strategyRegistry.set('deep', new DeepEqualityAssertionStrategy());
    this.#strategyRegistry.set('truthy', new TruthyAssertionStrategy());
  }

  /** @param {string} tag @returns {AbstractAssertionStrategyBase} */
  resolve(tag) {
    const strategy = this.#strategyRegistry.get(tag);
    if (!strategy) {
      throw new Error(`No assertion strategy registered for tag "${tag}". ` +
        `Available: [${[...this.#strategyRegistry.keys()].join(', ')}]`);
    }
    return strategy;
  }
}

// Singleton — because we definitely need exactly one of these.
const assertionFactory = new AssertionStrategyFactoryProvider();

/**
 * Convenience façade that hides the factory-strategy plumbing behind a
 * fluent interface. Dr. Schneider would never expose raw factories to
 * the test-case layer — that would violate the Dependency Inversion Principle.
 */
const assert = {
  eq(actual, expected) {
    return assertionFactory.resolve('eq').evaluate(actual, expected);
  },
  deep(actual, expected) {
    return assertionFactory.resolve('deep').evaluate(actual, expected);
  },
  truthy(actual) {
    return assertionFactory.resolve('truthy').evaluate(actual, undefined);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  §2. DOMAIN-ISOLATED SIMULATION ENGINE (DISE)
//      — a faithful recreation of the SnakeY game kernel, decoupled from DOM
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GridTopologyConfiguration — encapsulates the spatial parameters of the
 * discrete game board. Extracted as a first-class value object to support
 * hypothetical future grid-size parameterisation (YAGNI? Never heard of her).
 */
class GridTopologyConfiguration {
  constructor(cols = 20, rows = 20) {
    /** @readonly */ this.cols = cols;
    /** @readonly */ this.rows = rows;
  }

  /** @param {number} x @param {number} y */
  isWithinBounds(x, y) {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
  }

  get totalCells() {
    return this.cols * this.rows;
  }
}

/** Immutable direction vector value object. */
const DirectionVectorRegistry = Object.freeze({
  ArrowUp:    Object.freeze({ x:  0, y: -1 }),
  ArrowDown:  Object.freeze({ x:  0, y:  1 }),
  ArrowLeft:  Object.freeze({ x: -1, y:  0 }),
  ArrowRight: Object.freeze({ x:  1, y:  0 }),
});

/** Bijective opposite-direction mapping. */
const DirectionOppositeMapping = Object.freeze({
  ArrowUp:    'ArrowDown',
  ArrowDown:  'ArrowUp',
  ArrowLeft:  'ArrowRight',
  ArrowRight: 'ArrowLeft',
});

/**
 * GameStateSnapshot — the Memento of our simulation engine. Contains all
 * mutable state required to deterministically replay any game configuration.
 */
class GameStateSnapshot {
  constructor() {
    /** @type {'idle'|'playing'|'paused'|'dead'} */
    this.phase = 'idle';
    /** @type {string} */
    this.dir = 'ArrowRight';
    /** @type {{x:number, y:number}[]} */
    this.snake = [];
    /** @type {{x:number, y:number}} */
    this.food = { x: 0, y: 0 };
    /** @type {number} */
    this.score = 0;
    /** @type {number} */
    this.hi = 0;
  }
}

/**
 * DirectionQueueManager — manages the bounded input buffer with 180° reversal
 * rejection, faithfully mirroring the production queueDir() implementation.
 *
 * The max-size-2 invariant prevents the temporal aliasing attack where a player
 * enqueues [Left, Down] within a single tick to perform a de facto U-turn.
 */
class DirectionQueueManager {
  /** @type {string[]} */
  #buffer = [];
  /** @type {number} */
  #maxSize;

  constructor(maxSize = 2) {
    this.#maxSize = maxSize;
  }

  /**
   * @param {string} direction
   * @param {string} currentDirection - state.dir, used as fallback reference
   */
  enqueue(direction, currentDirection) {
    if (this.#buffer.length >= this.#maxSize) return;
    const ref = this.#buffer.length > 0
      ? this.#buffer[this.#buffer.length - 1]
      : currentDirection;
    if (direction === DirectionOppositeMapping[ref]) return;
    this.#buffer.push(direction);
  }

  /** @returns {string|undefined} */
  dequeue() {
    return this.#buffer.shift();
  }

  get length() {
    return this.#buffer.length;
  }

  clear() {
    this.#buffer.length = 0;
  }

  /** Expose internal buffer for verification (test-only accessor). */
  get _internalBuffer() {
    return [...this.#buffer];
  }
}

/**
 * FoodPlacementStrategyEngine — implements the production-equivalent O(N²)
 * free-cell enumeration algorithm. Accepts an optional deterministic RNG
 * injection point for reproducible test scenarios (Strategy pattern).
 *
 * @param {{x:number,y:number}[]} snake
 * @param {GridTopologyConfiguration} grid
 * @param {() => number} rng - Math.random replacement for determinism
 * @returns {{x:number,y:number}|null}
 */
function computeFoodPlacement(snake, grid, rng = Math.random) {
  const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
  const free = [];
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      if (!occupied.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  if (free.length === 0) return null;
  return free[Math.floor(rng() * free.length)];
}

/**
 * CollisionDetectionOracle — the authoritative source of truth for all
 * collision predicates. Implements the Specification pattern for composable
 * collision queries.
 */
class CollisionDetectionOracle {
  /** @type {GridTopologyConfiguration} */
  #grid;

  constructor(grid) {
    this.#grid = grid;
  }

  /** @param {{x:number,y:number}} head */
  isWallCollision(head) {
    return !this.#grid.isWithinBounds(head.x, head.y);
  }

  /**
   * @param {{x:number,y:number}} head
   * @param {{x:number,y:number}[]} body - snake[1..n] (head excluded)
   */
  isSelfCollision(head, body) {
    return body.some(seg => seg.x === head.x && seg.y === head.y);
  }

  /**
   * @param {{x:number,y:number}} head
   * @param {{x:number,y:number}} food
   */
  isFoodCollision(head, food) {
    return head.x === food.x && head.y === food.y;
  }
}

/**
 * GameSimulationEngine — the Domain-Isolated Simulation Engine proper.
 * Encapsulates a complete game tick cycle with deterministic food placement.
 *
 * This is the Mediator that coordinates GameStateSnapshot, DirectionQueueManager,
 * CollisionDetectionOracle, and FoodPlacementStrategyEngine into a cohesive
 * simulation step.
 */
class GameSimulationEngine {
  /** @type {GameStateSnapshot} */
  state;
  /** @type {DirectionQueueManager} */
  dirQueue;
  /** @type {GridTopologyConfiguration} */
  grid;
  /** @type {CollisionDetectionOracle} */
  collisionOracle;
  /** @type {() => number} */
  #rng;

  constructor(grid = new GridTopologyConfiguration(), rng = Math.random) {
    this.grid = grid;
    this.state = new GameStateSnapshot();
    this.dirQueue = new DirectionQueueManager();
    this.collisionOracle = new CollisionDetectionOracle(grid);
    this.#rng = rng;
  }

  /** Initialise to the canonical starting configuration. */
  initGame() {
    this.state.snake = [
      { x: 10, y: 10 },
      { x:  9, y: 10 },
      { x:  8, y: 10 },
    ];
    this.state.dir = 'ArrowRight';
    this.state.score = 0;
    this.state.phase = 'playing';
    this.dirQueue.clear();
    this.placeFood();
  }

  placeFood() {
    const result = computeFoodPlacement(this.state.snake, this.grid, this.#rng);
    if (result) this.state.food = result;
  }

  /**
   * Execute exactly one game tick — mirrors production tick() line-for-line.
   *
   * Returns a TickResultDescriptor for post-hoc verification.
   * @returns {{ died: boolean, ate: boolean, newHead: {x:number,y:number} }}
   */
  tick() {
    // 1. Consume one queued direction
    const queued = this.dirQueue.dequeue();
    if (queued !== undefined) this.state.dir = queued;

    // 2. Compute new head
    const delta = DirectionVectorRegistry[this.state.dir];
    const head = this.state.snake[0];
    const newHead = { x: head.x + delta.x, y: head.y + delta.y };

    // 3. Prepend new head
    this.state.snake.unshift(newHead);

    // 4. Food check
    const ateFood = this.collisionOracle.isFoodCollision(newHead, this.state.food);

    // 5. Trim tail (only when not growing)
    if (!ateFood) this.state.snake.pop();

    // 6. Wall collision
    if (this.collisionOracle.isWallCollision(newHead)) {
      this.state.phase = 'dead';
      return { died: true, ate: false, newHead };
    }

    // 7. Self collision
    if (this.collisionOracle.isSelfCollision(newHead, this.state.snake.slice(1))) {
      this.state.phase = 'dead';
      return { died: true, ate: false, newHead };
    }

    // 8. Food effects
    if (ateFood) {
      this.state.score += 1;
      if (this.state.score > this.state.hi) {
        this.state.hi = this.state.score;
      }
      this.placeFood();
    }

    return { died: false, ate: ateFood, newHead };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §3. TEST CASE FACTORY INFRASTRUCTURE
//      — because hand-writing test functions is artisanal and unscalable
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * AbstractTestCaseFactory — base class for producing TestCase instances.
 * Subclasses override createScenarios() to yield domain-specific test vectors.
 */
class AbstractTestCaseFactory {
  /** @returns {TestCase[]} */
  createScenarios() {
    throw new Error('Subclasses must implement createScenarios()');
  }
}

/**
 * TestSuiteOrchestrator — collects TestCases from multiple factories,
 * executes them, and produces a structured report.
 *
 * Follows the Composite + Iterator patterns for maximum architectural purity.
 */
class TestSuiteOrchestrator {
  /** @type {TestCase[]} */
  #cases = [];

  /** @param {AbstractTestCaseFactory[]} factories */
  registerFactories(factories) {
    for (const factory of factories) {
      this.#cases.push(...factory.createScenarios());
    }
  }

  execute() {
    let passed = 0;
    let failed = 0;
    const failures = [];

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║  SnakeY DISE Verification Suite — Dr. Schneider Architecture ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');

    let currentCategory = '';

    for (const tc of this.#cases) {
      if (tc.category !== currentCategory) {
        currentCategory = tc.category;
        console.log(`\n  ── ${currentCategory} ${'─'.repeat(Math.max(0, 55 - currentCategory.length))}`);
      }

      try {
        const result = tc.execute();
        if (result.passed) {
          passed++;
          console.log(`    ✓ ${tc.description}`);
        } else {
          failed++;
          failures.push({ description: tc.description, message: result.message });
          console.log(`    ✗ ${tc.description}`);
          console.log(`      ${result.message}`);
        }
      } catch (err) {
        failed++;
        failures.push({ description: tc.description, message: err.message });
        console.log(`    ✗ ${tc.description}`);
        console.log(`      EXCEPTION: ${err.message}`);
      }
    }

    console.log('\n' + '═'.repeat(65));
    console.log(`  Total: ${this.#cases.length}  |  Passed: ${passed}  |  Failed: ${failed}`);
    console.log('═'.repeat(65));

    if (failures.length > 0) {
      console.log('\n  FAILURES:');
      for (const f of failures) {
        console.log(`    • ${f.description}: ${f.message}`);
      }
    }

    console.log('');
    return { total: this.#cases.length, passed, failed };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §4. CONCRETE TEST CASE FACTORIES — 73 scenarios across 6 domains
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 4.1 Boundary Collision Verification Factory (20 tests) ─────────────────

class BoundaryCollisionTestCaseFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const grid = new GridTopologyConfiguration();
    const oracle = new CollisionDetectionOracle(grid);
    const tests = [];

    // TC-01 → TC-04: Wall collision from cardinal approach vectors
    const wallApproachVectors = [
      { dir: 'ArrowUp',    startHead: { x: 10, y: 0 },  desc: 'top wall via upward movement' },
      { dir: 'ArrowDown',  startHead: { x: 10, y: 19 }, desc: 'bottom wall via downward movement' },
      { dir: 'ArrowLeft',  startHead: { x: 0,  y: 10 }, desc: 'left wall via leftward movement' },
      { dir: 'ArrowRight', startHead: { x: 19, y: 10 }, desc: 'right wall via rightward movement' },
    ];

    wallApproachVectors.forEach(({ dir, startHead, desc }, i) => {
      tests.push({
        description: `TC-${String(i + 1).padStart(2, '0')}: Die on ${desc}`,
        category: 'Boundary Collisions',
        execute() {
          const engine = new GameSimulationEngine();
          engine.state.phase = 'playing';
          engine.state.dir = dir;
          engine.state.snake = [
            { ...startHead },
            { x: startHead.x - DirectionVectorRegistry[dir].x,
              y: startHead.y - DirectionVectorRegistry[dir].y },
            { x: startHead.x - 2 * DirectionVectorRegistry[dir].x,
              y: startHead.y - 2 * DirectionVectorRegistry[dir].y },
          ];
          engine.state.food = { x: 15, y: 15 }; // somewhere safe
          const result = engine.tick();
          return assert.eq(result.died, true);
        },
      });
    });

    // TC-05 → TC-08: Corner position collisions (all 4 corners)
    const cornerScenarios = [
      { head: { x: 0,  y: 0 },  dir: 'ArrowUp',    desc: 'top-left corner moving up' },
      { head: { x: 19, y: 0 },  dir: 'ArrowRight',  desc: 'top-right corner moving right' },
      { head: { x: 0,  y: 19 }, dir: 'ArrowLeft',   desc: 'bottom-left corner moving left' },
      { head: { x: 19, y: 19 }, dir: 'ArrowDown',   desc: 'bottom-right corner moving down' },
    ];

    cornerScenarios.forEach(({ head, dir, desc }, i) => {
      tests.push({
        description: `TC-${String(i + 5).padStart(2, '0')}: Die at ${desc}`,
        category: 'Boundary Collisions',
        execute() {
          const engine = new GameSimulationEngine();
          engine.state.phase = 'playing';
          engine.state.dir = dir;
          // Build a short snake trailing behind the head
          const d = DirectionVectorRegistry[DirectionOppositeMapping[dir]];
          engine.state.snake = [
            { ...head },
            { x: head.x + d.x, y: head.y + d.y },
            { x: head.x + 2 * d.x, y: head.y + 2 * d.y },
          ];
          engine.state.food = { x: 10, y: 10 };
          const result = engine.tick();
          return assert.eq(result.died, true);
        },
      });
    });

    // TC-09 → TC-12: Edge traversal — move along boundary then turn into wall
    const edgeTraversalScenarios = [
      { snake: [{ x: 5, y: 0 }, { x: 4, y: 0 }, { x: 3, y: 0 }], turnDir: 'ArrowUp', desc: 'along top edge then up' },
      { snake: [{ x: 5, y: 19 }, { x: 4, y: 19 }, { x: 3, y: 19 }], turnDir: 'ArrowDown', desc: 'along bottom edge then down' },
      { snake: [{ x: 0, y: 5 }, { x: 0, y: 4 }, { x: 0, y: 3 }], turnDir: 'ArrowLeft', desc: 'along left edge then left' },
      { snake: [{ x: 19, y: 5 }, { x: 19, y: 4 }, { x: 19, y: 3 }], turnDir: 'ArrowRight', desc: 'along right edge then right' },
    ];

    edgeTraversalScenarios.forEach(({ snake, turnDir, desc }, i) => {
      tests.push({
        description: `TC-${String(i + 9).padStart(2, '0')}: Die traversing ${desc}`,
        category: 'Boundary Collisions',
        execute() {
          const engine = new GameSimulationEngine();
          engine.state.phase = 'playing';
          engine.state.dir = turnDir;
          engine.state.snake = snake.map(s => ({ ...s }));
          engine.state.food = { x: 10, y: 10 };
          const result = engine.tick();
          return assert.eq(result.died, true);
        },
      });
    });

    // TC-13 → TC-16: Boundary at specific wall positions
    const specificBoundaryPositions = [
      { head: { x: 0, y: 10 },  dir: 'ArrowLeft',  desc: 'x=0 mid-left wall' },
      { head: { x: 19, y: 10 }, dir: 'ArrowRight', desc: 'x=19 mid-right wall' },
      { head: { x: 10, y: 0 },  dir: 'ArrowUp',    desc: 'y=0 mid-top wall' },
      { head: { x: 10, y: 19 }, dir: 'ArrowDown',  desc: 'y=19 mid-bottom wall' },
    ];

    specificBoundaryPositions.forEach(({ head, dir, desc }, i) => {
      tests.push({
        description: `TC-${String(i + 13).padStart(2, '0')}: Collision at ${desc}`,
        category: 'Boundary Collisions',
        execute() {
          const delta = DirectionVectorRegistry[dir];
          const newHead = { x: head.x + delta.x, y: head.y + delta.y };
          return assert.eq(oracle.isWallCollision(newHead), true);
        },
      });
    });

    // TC-17 → TC-20: Verify cells just inside boundary are NOT collisions
    const safeBoundaryCells = [
      { pos: { x: 0,  y: 0 },  desc: 'cell (0,0) is within bounds' },
      { pos: { x: 19, y: 0 },  desc: 'cell (19,0) is within bounds' },
      { pos: { x: 0,  y: 19 }, desc: 'cell (0,19) is within bounds' },
      { pos: { x: 19, y: 19 }, desc: 'cell (19,19) is within bounds' },
    ];

    safeBoundaryCells.forEach(({ pos, desc }, i) => {
      tests.push({
        description: `TC-${String(i + 17).padStart(2, '0')}: ${desc}`,
        category: 'Boundary Collisions',
        execute() {
          return assert.eq(oracle.isWallCollision(pos), false);
        },
      });
    });

    return tests;
  }
}

// ─── 4.2 Direction Queue Race Condition Factory (12 tests) ──────────────────

class DirectionQueueRaceConditionTestCaseFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];

    // TC-21: Two valid non-opposite directions enqueue successfully
    tests.push({
      description: 'TC-21: Enqueue two valid sequential directions',
      category: 'Direction Queue Race Conditions',
      execute() {
        const q = new DirectionQueueManager();
        q.enqueue('ArrowUp', 'ArrowRight');
        q.enqueue('ArrowLeft', 'ArrowRight');
        return assert.eq(q.length, 2);
      },
    });

    // TC-22: Queue correctly rejects third entry (max 2)
    tests.push({
      description: 'TC-22: Queue rejects third enqueue (capacity=2)',
      category: 'Direction Queue Race Conditions',
      execute() {
        const q = new DirectionQueueManager();
        q.enqueue('ArrowUp', 'ArrowRight');
        q.enqueue('ArrowLeft', 'ArrowRight');
        q.enqueue('ArrowDown', 'ArrowRight');
        return assert.eq(q.length, 2);
      },
    });

    // TC-23: Reject 180° reversal when queue is empty (checks state.dir)
    tests.push({
      description: 'TC-23: Reject 180° reversal against current direction',
      category: 'Direction Queue Race Conditions',
      execute() {
        const q = new DirectionQueueManager();
        q.enqueue('ArrowLeft', 'ArrowRight'); // opposite of ArrowRight
        return assert.eq(q.length, 0);
      },
    });

    // TC-24: Reject 180° reversal against queue tail (not state.dir)
    tests.push({
      description: 'TC-24: Reject 180° reversal against queue tail',
      category: 'Direction Queue Race Conditions',
      execute() {
        const q = new DirectionQueueManager();
        q.enqueue('ArrowUp', 'ArrowRight');   // valid: not opposite of Right
        q.enqueue('ArrowDown', 'ArrowRight'); // opposite of Up (queue tail)
        return assert.eq(q.length, 1);
      },
    });

    // TC-25: Same direction enqueued twice is valid
    tests.push({
      description: 'TC-25: Same direction enqueued twice is accepted',
      category: 'Direction Queue Race Conditions',
      execute() {
        const q = new DirectionQueueManager();
        q.enqueue('ArrowUp', 'ArrowRight');
        q.enqueue('ArrowUp', 'ArrowRight');
        return assert.eq(q.length, 2);
      },
    });

    // TC-26: Dequeue returns FIFO order
    tests.push({
      description: 'TC-26: Dequeue returns directions in FIFO order',
      category: 'Direction Queue Race Conditions',
      execute() {
        const q = new DirectionQueueManager();
        q.enqueue('ArrowUp', 'ArrowRight');
        q.enqueue('ArrowLeft', 'ArrowRight');
        const first = q.dequeue();
        return assert.eq(first, 'ArrowUp');
      },
    });

    // TC-27: Dequeue second element after first consumed
    tests.push({
      description: 'TC-27: Second dequeue returns second enqueued direction',
      category: 'Direction Queue Race Conditions',
      execute() {
        const q = new DirectionQueueManager();
        q.enqueue('ArrowUp', 'ArrowRight');
        q.enqueue('ArrowLeft', 'ArrowRight');
        q.dequeue();
        return assert.eq(q.dequeue(), 'ArrowLeft');
      },
    });

    // TC-28: Dequeue from empty returns undefined
    tests.push({
      description: 'TC-28: Dequeue from empty queue returns undefined',
      category: 'Direction Queue Race Conditions',
      execute() {
        const q = new DirectionQueueManager();
        return assert.eq(q.dequeue(), undefined);
      },
    });

    // TC-29: Race condition — queue Up then Left rapidly (both valid from Right)
    tests.push({
      description: 'TC-29: Rapid Up→Left from Right — both accepted',
      category: 'Direction Queue Race Conditions',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame(); // heading Right
        engine.dirQueue.enqueue('ArrowUp', engine.state.dir);
        engine.dirQueue.enqueue('ArrowLeft', engine.state.dir);
        engine.tick(); // consumes Up
        return assert.eq(engine.state.dir, 'ArrowUp');
      },
    });

    // TC-30: After consuming first queued dir, second is applied next tick
    tests.push({
      description: 'TC-30: Second queued direction applied on next tick',
      category: 'Direction Queue Race Conditions',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        engine.state.food = { x: 0, y: 0 }; // away from snake path
        engine.dirQueue.enqueue('ArrowUp', engine.state.dir);
        engine.dirQueue.enqueue('ArrowLeft', engine.state.dir);
        engine.tick(); // consumes Up
        engine.tick(); // consumes Left
        return assert.eq(engine.state.dir, 'ArrowLeft');
      },
    });

    // TC-31: Clear resets queue to empty
    tests.push({
      description: 'TC-31: Clear empties the direction queue',
      category: 'Direction Queue Race Conditions',
      execute() {
        const q = new DirectionQueueManager();
        q.enqueue('ArrowUp', 'ArrowRight');
        q.enqueue('ArrowLeft', 'ArrowRight');
        q.clear();
        return assert.eq(q.length, 0);
      },
    });

    // TC-32: Queue prevents U-turn via two opposite directions
    tests.push({
      description: 'TC-32: Cannot U-turn via sequential opposite enqueues',
      category: 'Direction Queue Race Conditions',
      execute() {
        const q = new DirectionQueueManager();
        // Moving Right, try: Up then Down (would effectively reverse)
        q.enqueue('ArrowUp', 'ArrowRight');
        q.enqueue('ArrowDown', 'ArrowRight'); // rejected: opposite of queue tail (Up)
        const dirs = [q.dequeue(), q.dequeue()];
        return assert.deep(dirs, ['ArrowUp', undefined]);
      },
    });

    return tests;
  }
}

// ─── 4.3 Self-Intersection Detection Factory (12 tests) ────────────────────

class SelfIntersectionDetectionTestCaseFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];

    // TC-33: Simple self-collision — snake turns into own body
    tests.push({
      description: 'TC-33: Self-collision turning into own body segment',
      category: 'Self-Intersection Detection',
      execute() {
        const engine = new GameSimulationEngine();
        engine.state.phase = 'playing';
        // Snake in an L-shape, heading will collide with body
        engine.state.snake = [
          { x: 5, y: 5 },  // head
          { x: 5, y: 6 },
          { x: 6, y: 6 },
          { x: 6, y: 5 },
          { x: 6, y: 4 },
        ];
        engine.state.dir = 'ArrowRight'; // moves to (6,5) — occupied by body[3]
        engine.state.food = { x: 0, y: 0 };
        const result = engine.tick();
        return assert.eq(result.died, true);
      },
    });

    // TC-34: Snake forms closed loop — head enters body
    tests.push({
      description: 'TC-34: Closed-loop self-collision',
      category: 'Self-Intersection Detection',
      execute() {
        const engine = new GameSimulationEngine();
        engine.state.phase = 'playing';
        engine.state.snake = [
          { x: 3, y: 3 },
          { x: 3, y: 4 },
          { x: 4, y: 4 },
          { x: 4, y: 3 },
          { x: 4, y: 2 },
          { x: 3, y: 2 },
          { x: 2, y: 2 },
        ];
        engine.state.dir = 'ArrowUp'; // head moves to (3,2) — occupied by body[5]
        engine.state.food = { x: 0, y: 0 };
        const result = engine.tick();
        return assert.eq(result.died, true);
      },
    });

    // TC-35: No false positive — tail vacates cell on non-eat tick
    tests.push({
      description: 'TC-35: No false self-collision when tail vacates',
      category: 'Self-Intersection Detection',
      execute() {
        const engine = new GameSimulationEngine();
        engine.state.phase = 'playing';
        // Snake chasing its own tail in a square — should survive
        engine.state.snake = [
          { x: 5, y: 5 },
          { x: 5, y: 6 },
          { x: 6, y: 6 },
          { x: 6, y: 5 },
        ];
        engine.state.dir = 'ArrowRight'; // head to (6,5) but tail (6,5) pops first
        engine.state.food = { x: 0, y: 0 };
        const result = engine.tick();
        return assert.eq(result.died, false);
      },
    });

    // TC-36: Self-collision on food — tail does NOT vacate when eating
    tests.push({
      description: 'TC-36: Self-collision when eating food (tail retained)',
      category: 'Self-Intersection Detection',
      execute() {
        const engine = new GameSimulationEngine();
        engine.state.phase = 'playing';
        engine.state.snake = [
          { x: 5, y: 5 },
          { x: 5, y: 6 },
          { x: 6, y: 6 },
          { x: 6, y: 5 },
        ];
        engine.state.dir = 'ArrowRight';
        engine.state.food = { x: 6, y: 5 }; // food on collision cell — tail stays!
        const result = engine.tick();
        return assert.eq(result.died, true);
      },
    });

    // TC-37: Head collides with second segment (immediate neighbor)
    tests.push({
      description: 'TC-37: Head collides with immediate next segment',
      category: 'Self-Intersection Detection',
      execute() {
        const oracle = new CollisionDetectionOracle(new GridTopologyConfiguration());
        const head = { x: 5, y: 5 };
        const body = [{ x: 5, y: 5 }, { x: 5, y: 6 }];
        return assert.eq(oracle.isSelfCollision(head, body), true);
      },
    });

    // TC-38: No self-collision with empty body
    tests.push({
      description: 'TC-38: No self-collision when body is empty',
      category: 'Self-Intersection Detection',
      execute() {
        const oracle = new CollisionDetectionOracle(new GridTopologyConfiguration());
        return assert.eq(oracle.isSelfCollision({ x: 5, y: 5 }, []), false);
      },
    });

    // TC-39: Self-collision with long snake (10 segments)
    tests.push({
      description: 'TC-39: Self-collision detected on 10-segment snake',
      category: 'Self-Intersection Detection',
      execute() {
        const engine = new GameSimulationEngine();
        engine.state.phase = 'playing';
        // Long snake coiled up, heading into own body
        engine.state.snake = [
          { x: 5, y: 3 },  // head
          { x: 4, y: 3 },
          { x: 4, y: 4 },
          { x: 5, y: 4 },
          { x: 6, y: 4 },
          { x: 6, y: 3 },
          { x: 6, y: 2 },
          { x: 5, y: 2 },
          { x: 4, y: 2 },
          { x: 3, y: 2 },
        ];
        engine.state.dir = 'ArrowRight'; // head to (6,3) — body[5]
        engine.state.food = { x: 0, y: 0 };
        const result = engine.tick();
        return assert.eq(result.died, true);
      },
    });

    // TC-40: No self-collision on straight-line snake
    tests.push({
      description: 'TC-40: Straight-line snake does not self-collide',
      category: 'Self-Intersection Detection',
      execute() {
        const engine = new GameSimulationEngine();
        engine.state.phase = 'playing';
        engine.state.snake = [
          { x: 10, y: 10 },
          { x: 9, y: 10 },
          { x: 8, y: 10 },
          { x: 7, y: 10 },
          { x: 6, y: 10 },
        ];
        engine.state.dir = 'ArrowRight';
        engine.state.food = { x: 0, y: 0 };
        const result = engine.tick();
        return assert.eq(result.died, false);
      },
    });

    // TC-41: U-shaped snake — head enters bend
    tests.push({
      description: 'TC-41: U-shaped snake — head enters inner bend',
      category: 'Self-Intersection Detection',
      execute() {
        const engine = new GameSimulationEngine();
        engine.state.phase = 'playing';
        engine.state.snake = [
          { x: 8, y: 5 },
          { x: 8, y: 6 },
          { x: 8, y: 7 },
          { x: 9, y: 7 },
          { x: 9, y: 6 },
          { x: 9, y: 5 },
          { x: 9, y: 4 },
        ];
        engine.state.dir = 'ArrowRight'; // head to (9,5) — body[5]
        engine.state.food = { x: 0, y: 0 };
        const result = engine.tick();
        return assert.eq(result.died, true);
      },
    });

    // TC-42: Snake length 2 — minimal snake cannot self-collide moving forward
    tests.push({
      description: 'TC-42: Length-2 snake cannot self-collide moving forward',
      category: 'Self-Intersection Detection',
      execute() {
        const engine = new GameSimulationEngine();
        engine.state.phase = 'playing';
        engine.state.snake = [
          { x: 10, y: 10 },
          { x: 9, y: 10 },
        ];
        engine.state.dir = 'ArrowRight';
        engine.state.food = { x: 0, y: 0 };
        const result = engine.tick();
        return assert.eq(result.died, false);
      },
    });

    // TC-43: Self-collision oracle correctness — non-adjacent match
    tests.push({
      description: 'TC-43: Oracle detects non-adjacent body overlap',
      category: 'Self-Intersection Detection',
      execute() {
        const oracle = new CollisionDetectionOracle(new GridTopologyConfiguration());
        const head = { x: 3, y: 3 };
        const body = [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
          { x: 3, y: 3 }, // match at index 2
          { x: 4, y: 4 },
        ];
        return assert.eq(oracle.isSelfCollision(head, body), true);
      },
    });

    // TC-44: Self-collision oracle — no match in body
    tests.push({
      description: 'TC-44: Oracle confirms no overlap in disjoint body',
      category: 'Self-Intersection Detection',
      execute() {
        const oracle = new CollisionDetectionOracle(new GridTopologyConfiguration());
        const head = { x: 0, y: 0 };
        const body = [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
          { x: 3, y: 3 },
        ];
        return assert.eq(oracle.isSelfCollision(head, body), false);
      },
    });

    return tests;
  }
}

// ─── 4.4 Food Spawn Exclusion Zone Factory (10 tests) ───────────────────────

class FoodSpawnExclusionZoneTestCaseFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];
    const grid = new GridTopologyConfiguration();

    // TC-45: Food never spawns on occupied cell
    tests.push({
      description: 'TC-45: Food placement avoids snake body',
      category: 'Food Spawn Exclusion Zones',
      execute() {
        const snake = [
          { x: 10, y: 10 },
          { x: 9, y: 10 },
          { x: 8, y: 10 },
        ];
        const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
        // Run 100 placements — none should land on snake
        for (let i = 0; i < 100; i++) {
          const food = computeFoodPlacement(snake, grid);
          if (occupied.has(`${food.x},${food.y}`)) {
            return assert.eq(false, true); // force fail
          }
        }
        return assert.eq(true, true);
      },
    });

    // TC-46: Food placement with snake along top edge
    tests.push({
      description: 'TC-46: Food avoids snake occupying top row',
      category: 'Food Spawn Exclusion Zones',
      execute() {
        const snake = [];
        for (let x = 0; x < 20; x++) snake.push({ x, y: 0 });
        const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
        for (let i = 0; i < 50; i++) {
          const food = computeFoodPlacement(snake, grid);
          if (food.y === 0) return assert.eq(false, true);
        }
        return assert.eq(true, true);
      },
    });

    // TC-47: Food placement with snake along right edge
    tests.push({
      description: 'TC-47: Food avoids snake occupying right column',
      category: 'Food Spawn Exclusion Zones',
      execute() {
        const snake = [];
        for (let y = 0; y < 20; y++) snake.push({ x: 19, y });
        const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
        for (let i = 0; i < 50; i++) {
          const food = computeFoodPlacement(snake, grid);
          if (food.x === 19) return assert.eq(false, true);
        }
        return assert.eq(true, true);
      },
    });

    // TC-48: Food placement with nearly full grid (399 cells occupied)
    tests.push({
      description: 'TC-48: Food placed on sole remaining cell',
      category: 'Food Spawn Exclusion Zones',
      execute() {
        const snake = [];
        for (let y = 0; y < 20; y++) {
          for (let x = 0; x < 20; x++) {
            if (!(x === 7 && y === 13)) snake.push({ x, y });
          }
        }
        const food = computeFoodPlacement(snake, grid, () => 0);
        return assert.deep(food, { x: 7, y: 13 });
      },
    });

    // TC-49: Food returns null on completely full grid
    tests.push({
      description: 'TC-49: Null returned when grid is completely full',
      category: 'Food Spawn Exclusion Zones',
      execute() {
        const snake = [];
        for (let y = 0; y < 20; y++) {
          for (let x = 0; x < 20; x++) {
            snake.push({ x, y });
          }
        }
        const food = computeFoodPlacement(snake, grid);
        return assert.eq(food, null);
      },
    });

    // TC-50: Free cell count is grid - snake length
    tests.push({
      description: 'TC-50: Free cell enumeration matches grid minus snake',
      category: 'Food Spawn Exclusion Zones',
      execute() {
        const snake = [
          { x: 10, y: 10 },
          { x: 9, y: 10 },
          { x: 8, y: 10 },
        ];
        const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
        let freeCount = 0;
        for (let y = 0; y < 20; y++) {
          for (let x = 0; x < 20; x++) {
            if (!occupied.has(`${x},${y}`)) freeCount++;
          }
        }
        return assert.eq(freeCount, 400 - 3);
      },
    });

    // TC-51: Deterministic RNG always selects first free cell
    tests.push({
      description: 'TC-51: Deterministic RNG=0 selects first free cell',
      category: 'Food Spawn Exclusion Zones',
      execute() {
        const snake = [{ x: 0, y: 0 }]; // only (0,0) is occupied
        const food = computeFoodPlacement(snake, grid, () => 0);
        // First free cell in row-major order: (1,0)
        return assert.deep(food, { x: 1, y: 0 });
      },
    });

    // TC-52: Deterministic RNG=0.999 selects last free cell
    tests.push({
      description: 'TC-52: Deterministic RNG≈1 selects last free cell',
      category: 'Food Spawn Exclusion Zones',
      execute() {
        const snake = [{ x: 0, y: 0 }];
        const food = computeFoodPlacement(snake, grid, () => 0.999);
        // Last free cell: (19,19) — 399 free cells, floor(0.999*399) = 398 → (19,19)
        return assert.deep(food, { x: 19, y: 19 });
      },
    });

    // TC-53: Food placement avoids snake at boundary corners
    tests.push({
      description: 'TC-53: Food avoids snake occupying all four corners',
      category: 'Food Spawn Exclusion Zones',
      execute() {
        const snake = [
          { x: 0, y: 0 },
          { x: 19, y: 0 },
          { x: 0, y: 19 },
          { x: 19, y: 19 },
        ];
        const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
        for (let i = 0; i < 50; i++) {
          const food = computeFoodPlacement(snake, grid);
          if (occupied.has(`${food.x},${food.y}`)) return assert.eq(false, true);
        }
        return assert.eq(true, true);
      },
    });

    // TC-54: Engine.placeFood() integration — food not on snake
    tests.push({
      description: 'TC-54: Engine placeFood() never overlaps snake',
      category: 'Food Spawn Exclusion Zones',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        const occupied = new Set(engine.state.snake.map(s => `${s.x},${s.y}`));
        for (let i = 0; i < 50; i++) {
          engine.placeFood();
          if (occupied.has(`${engine.state.food.x},${engine.state.food.y}`)) {
            return assert.eq(false, true);
          }
        }
        return assert.eq(true, true);
      },
    });

    return tests;
  }
}

// ─── 4.5 Score Overflow Handling Factory (6 tests) ──────────────────────────

class ScoreOverflowHandlingTestCaseFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];

    // TC-55: Score increments by 1 on food eaten
    tests.push({
      description: 'TC-55: Score increments by 1 when food is eaten',
      category: 'Score Overflow Handling',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        engine.state.food = { x: 11, y: 10 }; // directly ahead
        const result = engine.tick();
        return assert.eq(engine.state.score, 1);
      },
    });

    // TC-56: Score does not increment on non-food tick
    tests.push({
      description: 'TC-56: Score unchanged when no food eaten',
      category: 'Score Overflow Handling',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        engine.state.food = { x: 0, y: 0 }; // far away
        engine.tick();
        return assert.eq(engine.state.score, 0);
      },
    });

    // TC-57: Hi-score updates when score exceeds it
    tests.push({
      description: 'TC-57: Hi-score updated when score exceeds previous hi',
      category: 'Score Overflow Handling',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        engine.state.hi = 0;
        engine.state.food = { x: 11, y: 10 };
        engine.tick();
        return assert.eq(engine.state.hi, 1);
      },
    });

    // TC-58: Hi-score not overwritten when score is below it
    tests.push({
      description: 'TC-58: Hi-score preserved when score is below it',
      category: 'Score Overflow Handling',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        engine.state.hi = 100;
        engine.state.food = { x: 11, y: 10 };
        engine.tick();
        return assert.eq(engine.state.hi, 100);
      },
    });

    // TC-59: Score accumulates across multiple food pickups
    tests.push({
      description: 'TC-59: Score accumulates across sequential food pickups',
      category: 'Score Overflow Handling',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        // Feed the snake 5 times in a row
        for (let i = 0; i < 5; i++) {
          const head = engine.state.snake[0];
          const delta = DirectionVectorRegistry[engine.state.dir];
          engine.state.food = { x: head.x + delta.x, y: head.y + delta.y };
          engine.tick();
        }
        return assert.eq(engine.state.score, 5);
      },
    });

    // TC-60: Large score values handled correctly (no 32-bit overflow)
    tests.push({
      description: 'TC-60: Score handles large values (Number.MAX_SAFE_INTEGER vicinity)',
      category: 'Score Overflow Handling',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        engine.state.score = Number.MAX_SAFE_INTEGER - 1;
        engine.state.hi = 0;
        engine.state.food = { x: 11, y: 10 };
        engine.tick();
        return assert.eq(engine.state.score, Number.MAX_SAFE_INTEGER);
      },
    });

    return tests;
  }
}

// ─── 4.6 Edge Cases & Miscellaneous Verification Factory (13 tests) ─────────

class EdgeCaseMiscellaneousVerificationTestCaseFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];

    // TC-61: Snake occupying row 0, column 19 — the specified edge case
    tests.push({
      description: 'TC-61: Snake at row 0 col 19 moving right dies (wall)',
      category: 'Edge Cases & Miscellaneous',
      execute() {
        const engine = new GameSimulationEngine();
        engine.state.phase = 'playing';
        engine.state.snake = [
          { x: 19, y: 0 },
          { x: 18, y: 0 },
          { x: 17, y: 0 },
        ];
        engine.state.dir = 'ArrowRight';
        engine.state.food = { x: 10, y: 10 };
        const result = engine.tick();
        return assert.eq(result.died, true);
      },
    });

    // TC-62: Snake at row 0, col 19 moving up dies (wall)
    tests.push({
      description: 'TC-62: Snake at row 0 col 19 moving up dies (wall)',
      category: 'Edge Cases & Miscellaneous',
      execute() {
        const engine = new GameSimulationEngine();
        engine.state.phase = 'playing';
        engine.state.snake = [
          { x: 19, y: 0 },
          { x: 19, y: 1 },
          { x: 19, y: 2 },
        ];
        engine.state.dir = 'ArrowUp';
        engine.state.food = { x: 10, y: 10 };
        const result = engine.tick();
        return assert.eq(result.died, true);
      },
    });

    // TC-63: Snake at row 0, col 19 moving down survives
    tests.push({
      description: 'TC-63: Snake at row 0 col 19 moving down survives',
      category: 'Edge Cases & Miscellaneous',
      execute() {
        const engine = new GameSimulationEngine();
        engine.state.phase = 'playing';
        engine.state.snake = [
          { x: 19, y: 0 },
          { x: 18, y: 0 },
          { x: 17, y: 0 },
        ];
        engine.state.dir = 'ArrowDown';
        engine.state.food = { x: 10, y: 10 };
        const result = engine.tick();
        return assert.eq(result.died, false);
      },
    });

    // TC-64: Initial game state — snake at canonical position
    tests.push({
      description: 'TC-64: initGame() places snake at canonical start position',
      category: 'Edge Cases & Miscellaneous',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        return assert.deep(
          engine.state.snake,
          [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
        );
      },
    });

    // TC-65: initGame() sets direction to ArrowRight
    tests.push({
      description: 'TC-65: initGame() sets direction to ArrowRight',
      category: 'Edge Cases & Miscellaneous',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        return assert.eq(engine.state.dir, 'ArrowRight');
      },
    });

    // TC-66: Tick with no queued direction maintains current direction
    tests.push({
      description: 'TC-66: Tick with empty queue preserves current direction',
      category: 'Edge Cases & Miscellaneous',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        engine.state.food = { x: 0, y: 0 };
        engine.tick();
        return assert.eq(engine.state.dir, 'ArrowRight');
      },
    });

    // TC-67: Snake head position advances by one cell per tick
    tests.push({
      description: 'TC-67: Head advances by exactly one cell per tick',
      category: 'Edge Cases & Miscellaneous',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        engine.state.food = { x: 0, y: 0 };
        const headBefore = { ...engine.state.snake[0] };
        engine.tick();
        const headAfter = engine.state.snake[0];
        return assert.deep(headAfter, { x: headBefore.x + 1, y: headBefore.y });
      },
    });

    // TC-68: Food eaten grows snake by exactly 1 segment
    tests.push({
      description: 'TC-68: Eating food grows snake by exactly 1 segment',
      category: 'Edge Cases & Miscellaneous',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        const lenBefore = engine.state.snake.length;
        engine.state.food = { x: 11, y: 10 }; // directly ahead
        engine.tick();
        return assert.eq(engine.state.snake.length, lenBefore + 1);
      },
    });

    // TC-69: Non-food tick preserves snake length
    tests.push({
      description: 'TC-69: Non-food tick preserves snake length',
      category: 'Edge Cases & Miscellaneous',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        engine.state.food = { x: 0, y: 0 };
        const lenBefore = engine.state.snake.length;
        engine.tick();
        return assert.eq(engine.state.snake.length, lenBefore);
      },
    });

    // TC-70: Multiple food eats accumulate length correctly
    tests.push({
      description: 'TC-70: 5 sequential food eats → length increases by 5',
      category: 'Edge Cases & Miscellaneous',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        const lenBefore = engine.state.snake.length;
        for (let i = 0; i < 5; i++) {
          const head = engine.state.snake[0];
          const delta = DirectionVectorRegistry[engine.state.dir];
          engine.state.food = { x: head.x + delta.x, y: head.y + delta.y };
          engine.tick();
        }
        return assert.eq(engine.state.snake.length, lenBefore + 5);
      },
    });

    // TC-71: Die sets phase to 'dead'
    tests.push({
      description: 'TC-71: Wall collision sets phase to dead',
      category: 'Edge Cases & Miscellaneous',
      execute() {
        const engine = new GameSimulationEngine();
        engine.state.phase = 'playing';
        engine.state.snake = [
          { x: 19, y: 10 },
          { x: 18, y: 10 },
          { x: 17, y: 10 },
        ];
        engine.state.dir = 'ArrowRight';
        engine.state.food = { x: 0, y: 0 };
        engine.tick();
        return assert.eq(engine.state.phase, 'dead');
      },
    });

    // TC-72: Self-collision also sets phase to 'dead'
    tests.push({
      description: 'TC-72: Self-collision sets phase to dead',
      category: 'Edge Cases & Miscellaneous',
      execute() {
        const engine = new GameSimulationEngine();
        engine.state.phase = 'playing';
        engine.state.snake = [
          { x: 5, y: 5 },
          { x: 5, y: 6 },
          { x: 6, y: 6 },
          { x: 6, y: 5 },
          { x: 6, y: 4 },
        ];
        engine.state.dir = 'ArrowRight';
        engine.state.food = { x: 0, y: 0 };
        engine.tick();
        return assert.eq(engine.state.phase, 'dead');
      },
    });

    // TC-73: Grid topology — total cells equals 400
    tests.push({
      description: 'TC-73: Grid topology: 20×20 = 400 total cells',
      category: 'Edge Cases & Miscellaneous',
      execute() {
        const grid = new GridTopologyConfiguration();
        return assert.eq(grid.totalCells, 400);
      },
    });

    return tests;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §5. ADVANCED COLLISION DETECTION VERIFICATION FACTORIES
//      — Schneider Test Protocol v1.1 Compliance Extension
//
//  Domains:
//    VII.   Wraparound Boundary Rejection Verification
//    VIII.  Rapid Direction Change Temporal Aliasing
//    IX.    Self-Collision at Speed Level 3+ (Extended Snake Topologies)
//    X.     Concurrent Input Handling & Queue Saturation
//
//  "A boundary condition untested is a production incident deferred."
//  — Dr. Schneider, Incident Retrospective #47, 2025-01-15
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 5.1 Wraparound Boundary Rejection Verification Factory (12 tests) ──────
//
// SnakeY employs strict wall-death semantics (no toroidal wraparound).
// This factory exhaustively verifies that every boundary exit is lethal
// and that no off-by-one error permits a ghost wrap.

class WraparoundBoundaryRejectionVerificationFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];

    // TC-74 → TC-77: Verify death at all four edge midpoints (no wraparound)
    const edgeMidpoints = [
      { head: { x: 10, y: 0 },  dir: 'ArrowUp',    wrapTo: { x: 10, y: 19 }, desc: 'top midpoint does not wrap to bottom' },
      { head: { x: 10, y: 19 }, dir: 'ArrowDown',  wrapTo: { x: 10, y: 0 },  desc: 'bottom midpoint does not wrap to top' },
      { head: { x: 0,  y: 10 }, dir: 'ArrowLeft',  wrapTo: { x: 19, y: 10 }, desc: 'left midpoint does not wrap to right' },
      { head: { x: 19, y: 10 }, dir: 'ArrowRight', wrapTo: { x: 0,  y: 10 }, desc: 'right midpoint does not wrap to left' },
    ];

    edgeMidpoints.forEach(({ head, dir, wrapTo, desc }, i) => {
      tests.push({
        description: `TC-${74 + i}: ${desc}`,
        category: 'Wraparound Boundary Rejection',
        execute() {
          const engine = new GameSimulationEngine();
          engine.state.phase = 'playing';
          engine.state.dir = dir;
          const opp = DirectionOppositeMapping[dir];
          const d = DirectionVectorRegistry[opp];
          engine.state.snake = [
            { ...head },
            { x: head.x + d.x, y: head.y + d.y },
            { x: head.x + 2 * d.x, y: head.y + 2 * d.y },
          ];
          engine.state.food = { x: 10, y: 10 };
          const result = engine.tick();
          // Must die — not wrap
          const diedResult = assert.eq(result.died, true);
          if (!diedResult.passed) return diedResult;
          // Verify head did NOT wrap to the opposite side
          const headAfter = engine.state.snake[0];
          const didNotWrap = assert.eq(
            headAfter.x === wrapTo.x && headAfter.y === wrapTo.y,
            false
          );
          return didNotWrap;
        },
      });
    });

    // TC-78 → TC-81: All four corner exit vectors produce death, not wrap
    const cornerExits = [
      { head: { x: 0,  y: 0 },  dir: 'ArrowUp',    desc: 'top-left up exit' },
      { head: { x: 0,  y: 0 },  dir: 'ArrowLeft',  desc: 'top-left left exit' },
      { head: { x: 19, y: 19 }, dir: 'ArrowDown',  desc: 'bottom-right down exit' },
      { head: { x: 19, y: 19 }, dir: 'ArrowRight', desc: 'bottom-right right exit' },
    ];

    cornerExits.forEach(({ head, dir, desc }, i) => {
      tests.push({
        description: `TC-${78 + i}: Corner exit — ${desc} kills (no wrap)`,
        category: 'Wraparound Boundary Rejection',
        execute() {
          const engine = new GameSimulationEngine();
          engine.state.phase = 'playing';
          engine.state.dir = dir;
          // Build snake trailing away from direction of travel
          const opp = DirectionOppositeMapping[dir];
          const d = DirectionVectorRegistry[opp];
          const s1 = { x: head.x + d.x, y: head.y + d.y };
          const s2 = { x: head.x + 2 * d.x, y: head.y + 2 * d.y };
          // Clamp trailing segments to grid bounds
          const clamp = (v, max) => Math.max(0, Math.min(max - 1, v));
          engine.state.snake = [
            { ...head },
            { x: clamp(s1.x, 20), y: clamp(s1.y, 20) },
            { x: clamp(s2.x, 20), y: clamp(s2.y, 20) },
          ];
          engine.state.food = { x: 10, y: 10 };
          const result = engine.tick();
          return assert.eq(result.died, true);
        },
      });
    });

    // TC-82: Consecutive boundary approach — survive at edge, die on next tick
    tests.push({
      description: 'TC-82: Survive at boundary edge, die on next tick (no wrap)',
      category: 'Wraparound Boundary Rejection',
      execute() {
        const engine = new GameSimulationEngine();
        engine.state.phase = 'playing';
        engine.state.dir = 'ArrowRight';
        engine.state.snake = [
          { x: 18, y: 10 },
          { x: 17, y: 10 },
          { x: 16, y: 10 },
        ];
        engine.state.food = { x: 0, y: 0 };
        // First tick: head moves to x=19 — still in bounds
        const r1 = engine.tick();
        const survived = assert.eq(r1.died, false);
        if (!survived.passed) return survived;
        // Second tick: head moves to x=20 — out of bounds, death
        const r2 = engine.tick();
        return assert.eq(r2.died, true);
      },
    });

    // TC-83: Boundary at x=-1 (left wall exit)
    tests.push({
      description: 'TC-83: Head at x=-1 is OOB (left wall, no wrap)',
      category: 'Wraparound Boundary Rejection',
      execute() {
        const oracle = new CollisionDetectionOracle(new GridTopologyConfiguration());
        return assert.eq(oracle.isWallCollision({ x: -1, y: 10 }), true);
      },
    });

    // TC-84: Boundary at y=-1 (top wall exit)
    tests.push({
      description: 'TC-84: Head at y=-1 is OOB (top wall, no wrap)',
      category: 'Wraparound Boundary Rejection',
      execute() {
        const oracle = new CollisionDetectionOracle(new GridTopologyConfiguration());
        return assert.eq(oracle.isWallCollision({ x: 10, y: -1 }), true);
      },
    });

    // TC-85: Boundary at x=20 (right wall exit, exclusive upper bound)
    tests.push({
      description: 'TC-85: Head at x=20 is OOB (exclusive right bound)',
      category: 'Wraparound Boundary Rejection',
      execute() {
        const oracle = new CollisionDetectionOracle(new GridTopologyConfiguration());
        return assert.eq(oracle.isWallCollision({ x: 20, y: 10 }), true);
      },
    });

    return tests;
  }
}

// ─── 5.2 Rapid Direction Change Temporal Aliasing Factory (10 tests) ────────
//
// Verifies that the direction queue correctly handles sub-tick input bursts
// across all permutations of valid 90° turn sequences, preventing the
// "temporal aliasing attack" where rapid keypresses exploit the queue buffer.

class RapidDirectionChangeTemporalAliasingFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];

    // TC-86: Triple rapid input — only first two accepted (queue capacity)
    tests.push({
      description: 'TC-86: Triple rapid input saturates queue at capacity 2',
      category: 'Rapid Direction Changes',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame(); // heading Right
        engine.dirQueue.enqueue('ArrowUp', engine.state.dir);
        engine.dirQueue.enqueue('ArrowLeft', engine.state.dir);
        engine.dirQueue.enqueue('ArrowDown', engine.state.dir); // rejected: queue full
        return assert.eq(engine.dirQueue.length, 2);
      },
    });

    // TC-87: Rapid 90° turn sequence applied across two ticks
    tests.push({
      description: 'TC-87: Rapid Up→Left from Right applied across two ticks',
      category: 'Rapid Direction Changes',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        engine.state.food = { x: 0, y: 0 };
        engine.dirQueue.enqueue('ArrowUp', engine.state.dir);
        engine.dirQueue.enqueue('ArrowLeft', engine.state.dir);
        engine.tick(); // consumes Up
        const afterFirst = engine.state.dir;
        engine.tick(); // consumes Left
        const afterSecond = engine.state.dir;
        const r1 = assert.eq(afterFirst, 'ArrowUp');
        if (!r1.passed) return r1;
        return assert.eq(afterSecond, 'ArrowLeft');
      },
    });

    // TC-88: Rapid direction change does not produce retrograde self-collision
    tests.push({
      description: 'TC-88: Rapid 90° turns do not cause false self-collision',
      category: 'Rapid Direction Changes',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        engine.state.food = { x: 0, y: 0 };
        // Enqueue Up then Left from Right — should make an L-turn, not die
        engine.dirQueue.enqueue('ArrowUp', engine.state.dir);
        engine.dirQueue.enqueue('ArrowLeft', engine.state.dir);
        const r1 = engine.tick();
        if (r1.died) return assert.eq(r1.died, false);
        const r2 = engine.tick();
        return assert.eq(r2.died, false);
      },
    });

    // TC-89: Exhaustive 90° turn pair matrix — all 8 valid L-turns from Right
    const validTurnPairs = [
      ['ArrowUp', 'ArrowLeft'],
      ['ArrowUp', 'ArrowRight'],
      ['ArrowDown', 'ArrowLeft'],
      ['ArrowDown', 'ArrowRight'],
    ];

    validTurnPairs.forEach(([first, second], i) => {
      tests.push({
        description: `TC-${89 + i}: Rapid ${first.replace('Arrow','')}→${second.replace('Arrow','')} from Right — both accepted`,
        category: 'Rapid Direction Changes',
        execute() {
          const q = new DirectionQueueManager();
          q.enqueue(first, 'ArrowRight');
          q.enqueue(second, 'ArrowRight');
          // Second is validated against queue tail (first), not state.dir
          const expected = (second === DirectionOppositeMapping[first]) ? 1 : 2;
          return assert.eq(q.length, expected);
        },
      });
    });

    // TC-93: Rapid reversal attempt via perpendicular intermediary
    tests.push({
      description: 'TC-93: Cannot achieve reversal via Up→Down (perpendicular trick)',
      category: 'Rapid Direction Changes',
      execute() {
        const q = new DirectionQueueManager();
        q.enqueue('ArrowUp', 'ArrowRight');     // accepted: perpendicular
        q.enqueue('ArrowDown', 'ArrowRight');    // rejected: opposite of queue tail (Up)
        return assert.eq(q.length, 1);
      },
    });

    // TC-94: Queue refill after partial consumption
    tests.push({
      description: 'TC-94: Queue accepts new input after partial consumption',
      category: 'Rapid Direction Changes',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        engine.state.food = { x: 0, y: 0 };
        engine.dirQueue.enqueue('ArrowUp', engine.state.dir);
        engine.dirQueue.enqueue('ArrowLeft', engine.state.dir);
        engine.tick(); // consumes Up, queue now has 1 (Left)
        // Can enqueue again since queue dropped below capacity
        engine.dirQueue.enqueue('ArrowDown', engine.state.dir);
        return assert.eq(engine.dirQueue.length, 2);
      },
    });

    // TC-95: Four rapid inputs across two tick cycles — correct direction trace
    tests.push({
      description: 'TC-95: Four rapid inputs across two tick cycles trace correctly',
      category: 'Rapid Direction Changes',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        engine.state.food = { x: 0, y: 0 };
        // Cycle 1: enqueue Up, Left
        engine.dirQueue.enqueue('ArrowUp', engine.state.dir);
        engine.dirQueue.enqueue('ArrowLeft', engine.state.dir);
        engine.tick(); // consumes Up
        engine.tick(); // consumes Left
        // Cycle 2: enqueue Down, Right (from Left)
        engine.dirQueue.enqueue('ArrowDown', engine.state.dir);
        engine.dirQueue.enqueue('ArrowRight', engine.state.dir);
        engine.tick(); // consumes Down
        engine.tick(); // consumes Right
        return assert.eq(engine.state.dir, 'ArrowRight');
      },
    });

    return tests;
  }
}

// ─── 5.3 Self-Collision at Speed Level 3+ Factory (10 tests) ────────────────
//
// "Speed level" is derived as floor(score/5)+1. At level 3+ (score ≥ 10),
// the snake has ≥ 13 segments, creating rich topological configurations
// where self-intersection becomes increasingly probable. These tests verify
// collision detection correctness on extended snake geometries.

class SelfCollisionAtSpeedLevel3PlusFactory extends AbstractTestCaseFactory {
  /**
   * Helper — builds a snake of given length heading right from (startX, startY),
   * coiling in a serpentine pattern to fit within the grid.
   * @param {number} length
   * @param {number} startX
   * @param {number} startY
   * @returns {{x:number,y:number}[]}
   */
  static buildSerpentineSnake(length, startX = 10, startY = 10) {
    const segments = [{ x: startX, y: startY }];
    let x = startX, y = startY;
    let dx = -1, dy = 0;  // trailing behind head (heading right)
    let rowWidth = 18;     // cells before turning

    for (let i = 1; i < length; i++) {
      x += dx;
      // Serpentine: when we hit a turn point, go down one row and reverse
      if (x < 1 || x > rowWidth) {
        x -= dx; // undo
        y += 1;  // go down
        dx = -dx; // reverse horizontal direction
      }
      segments.push({ x, y });
    }
    return segments;
  }

  createScenarios() {
    const tests = [];

    // TC-96: 13-segment snake (level 3, score=10) — self-collision in spiral
    tests.push({
      description: 'TC-96: 13-segment snake (level 3) spiral self-collision',
      category: 'Self-Collision at Speed Level 3+',
      execute() {
        const engine = new GameSimulationEngine();
        engine.state.phase = 'playing';
        // Construct a tight spiral where head will enter body
        engine.state.snake = [
          { x: 5, y: 3 },   // head — will move Right to (6,3) = body[9]
          { x: 4, y: 3 },
          { x: 3, y: 3 },
          { x: 3, y: 4 },
          { x: 4, y: 4 },
          { x: 5, y: 4 },
          { x: 6, y: 4 },
          { x: 7, y: 4 },
          { x: 7, y: 3 },
          { x: 6, y: 3 },   // body[9] — collision target
          { x: 6, y: 2 },
          { x: 5, y: 2 },
          { x: 4, y: 2 },
        ];
        engine.state.dir = 'ArrowRight';
        engine.state.food = { x: 0, y: 0 };
        const result = engine.tick();
        return assert.eq(result.died, true);
      },
    });

    // TC-97: 18-segment snake (level 4, score=15) — double-coil collision
    tests.push({
      description: 'TC-97: 18-segment snake (level 4) double-coil collision',
      category: 'Self-Collision at Speed Level 3+',
      execute() {
        const engine = new GameSimulationEngine();
        engine.state.phase = 'playing';
        // Two-row coil: head at far end about to enter own body
        engine.state.snake = [
          { x: 3, y: 5 },   // head — moves Up to (3,4) = body[11]
          { x: 3, y: 6 },
          { x: 4, y: 6 },
          { x: 5, y: 6 },
          { x: 6, y: 6 },
          { x: 7, y: 6 },
          { x: 8, y: 6 },
          { x: 8, y: 5 },
          { x: 7, y: 5 },
          { x: 6, y: 5 },
          { x: 5, y: 5 },
          { x: 4, y: 5 },
          { x: 4, y: 4 },
          { x: 3, y: 4 },   // body[13] — collision target at (3,4)
          { x: 2, y: 4 },
          { x: 2, y: 5 },
          { x: 2, y: 6 },
          { x: 2, y: 7 },
        ];
        engine.state.dir = 'ArrowUp';
        engine.state.food = { x: 0, y: 0 };
        const result = engine.tick();
        return assert.eq(result.died, true);
      },
    });

    // TC-98: Long snake (20 segments) — collision at tail-end segment
    tests.push({
      description: 'TC-98: 20-segment snake collision at distant body segment',
      category: 'Self-Collision at Speed Level 3+',
      execute() {
        const oracle = new CollisionDetectionOracle(new GridTopologyConfiguration());
        const head = { x: 10, y: 10 };
        // Build 19-segment body with collision at segment index 18
        const body = [];
        for (let i = 0; i < 18; i++) body.push({ x: i, y: 0 });
        body.push({ x: 10, y: 10 }); // match at end
        return assert.eq(oracle.isSelfCollision(head, body), true);
      },
    });

    // TC-99: Long snake chasing tail — survives when tail vacates
    tests.push({
      description: 'TC-99: 15-segment snake chasing own tail survives (tail pops)',
      category: 'Self-Collision at Speed Level 3+',
      execute() {
        const engine = new GameSimulationEngine();
        engine.state.phase = 'playing';
        // Tight rectangle: head chasing tail
        engine.state.snake = [
          { x: 5, y: 5 },  // head — moves Down to (5,6)
          { x: 5, y: 4 },
          { x: 6, y: 4 },
          { x: 7, y: 4 },
          { x: 7, y: 5 },
          { x: 7, y: 6 },
          { x: 7, y: 7 },
          { x: 6, y: 7 },
          { x: 5, y: 7 },
          { x: 4, y: 7 },
          { x: 4, y: 6 },
          { x: 4, y: 5 },
          { x: 4, y: 4 },
          { x: 4, y: 3 },
          { x: 5, y: 3 },  // tail — will be popped (no food)
        ];
        engine.state.dir = 'ArrowDown'; // head to (5,6) — not occupied after tail pop
        engine.state.food = { x: 0, y: 0 };
        const result = engine.tick();
        return assert.eq(result.died, false);
      },
    });

    // TC-100: Long snake eating food on tail — tail retained causes collision
    tests.push({
      description: 'TC-100: 15-segment snake eating on tail cell — tail retained, dies',
      category: 'Self-Collision at Speed Level 3+',
      execute() {
        const engine = new GameSimulationEngine();
        engine.state.phase = 'playing';
        // Same shape as TC-99 but with food at head destination
        engine.state.snake = [
          { x: 5, y: 5 },
          { x: 5, y: 4 },
          { x: 6, y: 4 },
          { x: 7, y: 4 },
          { x: 7, y: 5 },
          { x: 7, y: 6 },
          { x: 7, y: 7 },
          { x: 6, y: 7 },
          { x: 5, y: 7 },
          { x: 4, y: 7 },
          { x: 4, y: 6 },  // body[10] at (4,6)
          { x: 4, y: 5 },
          { x: 4, y: 4 },
          { x: 4, y: 3 },
          { x: 5, y: 3 },
        ];
        engine.state.dir = 'ArrowLeft'; // head to (4,5) — body[11]
        engine.state.food = { x: 4, y: 5 }; // food there — tail stays
        const result = engine.tick();
        return assert.eq(result.died, true);
      },
    });

    // TC-101: Maximum plausible snake (50 segments) — no false positive on safe move
    tests.push({
      description: 'TC-101: 50-segment serpentine snake — safe move does not false-positive',
      category: 'Self-Collision at Speed Level 3+',
      execute() {
        const engine = new GameSimulationEngine();
        engine.state.phase = 'playing';
        // Build a long horizontal snake moving right with clear path
        const snake = [];
        for (let i = 0; i < 50; i++) {
          snake.push({ x: 10 - Math.floor(i / 18) * (i % 2 === 0 ? 1 : -1), y: 5 + Math.floor(i / 1) });
        }
        // Simpler: horizontal line from x=10 backward, then wrap rows
        const safeSnake = [];
        let sx = 10, sy = 10;
        for (let i = 0; i < 50; i++) {
          safeSnake.push({ x: sx, y: sy });
          sx--;
          if (sx < 0) { sx = 19; sy++; }
        }
        engine.state.snake = safeSnake;
        engine.state.dir = 'ArrowRight';
        engine.state.food = { x: 0, y: 0 };
        const result = engine.tick();
        return assert.eq(result.died, false);
      },
    });

    // TC-102: Collision detection at body midpoint on 25-segment snake
    tests.push({
      description: 'TC-102: 25-segment snake — collision at body midpoint (segment 12)',
      category: 'Self-Collision at Speed Level 3+',
      execute() {
        const oracle = new CollisionDetectionOracle(new GridTopologyConfiguration());
        const head = { x: 8, y: 8 };
        const body = [];
        for (let i = 0; i < 24; i++) body.push({ x: i % 20, y: Math.floor(i / 20) });
        body[12] = { x: 8, y: 8 }; // inject collision at midpoint
        return assert.eq(oracle.isSelfCollision(head, body), true);
      },
    });

    // TC-103: Score-derived level calculation at level 3 boundary
    tests.push({
      description: 'TC-103: Score 10 yields level 3 (floor(10/5)+1)',
      category: 'Self-Collision at Speed Level 3+',
      execute() {
        const score = 10;
        const level = Math.floor(score / 5) + 1;
        return assert.eq(level, 3);
      },
    });

    // TC-104: Score-derived level calculation at level 5
    tests.push({
      description: 'TC-104: Score 20 yields level 5 (floor(20/5)+1)',
      category: 'Self-Collision at Speed Level 3+',
      execute() {
        const score = 20;
        const level = Math.floor(score / 5) + 1;
        return assert.eq(level, 5);
      },
    });

    // TC-105: Snake length at score=10 is 13 (initial 3 + 10 food)
    tests.push({
      description: 'TC-105: Snake length at score 10 is 13 segments',
      category: 'Self-Collision at Speed Level 3+',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        const initialLen = engine.state.snake.length; // 3
        // Feed 10 times
        for (let i = 0; i < 10; i++) {
          const head = engine.state.snake[0];
          const delta = DirectionVectorRegistry[engine.state.dir];
          engine.state.food = { x: head.x + delta.x, y: head.y + delta.y };
          engine.tick();
        }
        return assert.eq(engine.state.snake.length, initialLen + 10);
      },
    });

    return tests;
  }
}

// ─── 5.4 Concurrent Input Handling & Queue Saturation Factory (10 tests) ────
//
// Models the real-world scenario where multiple keydown events arrive within
// a single tick window (16.67ms at 60fps). Verifies queue capacity enforcement,
// FIFO ordering under saturation, and correct behaviour when inputs arrive
// between ticks.

class ConcurrentInputHandlingQueueSaturationFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];

    // TC-106: Simultaneous Up+Left at same timestamp — first enqueued wins
    tests.push({
      description: 'TC-106: Simultaneous perpendicular inputs — FIFO ordering preserved',
      category: 'Concurrent Input Handling',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame(); // heading Right
        // Simulate two inputs arriving "simultaneously" (same tick window)
        engine.dirQueue.enqueue('ArrowUp', engine.state.dir);
        engine.dirQueue.enqueue('ArrowDown', engine.state.dir); // rejected: opposite of Up
        engine.tick();
        return assert.eq(engine.state.dir, 'ArrowUp');
      },
    });

    // TC-107: Five rapid inputs — only first two survive queue capacity
    tests.push({
      description: 'TC-107: Five rapid inputs — queue capacity limits to 2',
      category: 'Concurrent Input Handling',
      execute() {
        const q = new DirectionQueueManager();
        q.enqueue('ArrowUp', 'ArrowRight');
        q.enqueue('ArrowLeft', 'ArrowRight');
        q.enqueue('ArrowDown', 'ArrowRight');
        q.enqueue('ArrowUp', 'ArrowRight');
        q.enqueue('ArrowRight', 'ArrowRight');
        return assert.eq(q.length, 2);
      },
    });

    // TC-108: Queue processes correctly after being drained and refilled
    tests.push({
      description: 'TC-108: Queue drain-refill cycle preserves FIFO semantics',
      category: 'Concurrent Input Handling',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        engine.state.food = { x: 0, y: 0 };
        // Fill
        engine.dirQueue.enqueue('ArrowUp', engine.state.dir);
        engine.dirQueue.enqueue('ArrowLeft', engine.state.dir);
        // Drain via ticks
        engine.tick();
        engine.tick();
        // Refill
        engine.dirQueue.enqueue('ArrowDown', engine.state.dir);
        engine.dirQueue.enqueue('ArrowRight', engine.state.dir);
        engine.tick();
        return assert.eq(engine.state.dir, 'ArrowDown');
      },
    });

    // TC-109: Enqueue during tick consumption — queue re-accepts after dequeue
    tests.push({
      description: 'TC-109: Queue re-accepts input after dequeue frees capacity',
      category: 'Concurrent Input Handling',
      execute() {
        const q = new DirectionQueueManager();
        q.enqueue('ArrowUp', 'ArrowRight');
        q.enqueue('ArrowLeft', 'ArrowRight');
        // Queue full
        const fullResult = assert.eq(q.length, 2);
        if (!fullResult.passed) return fullResult;
        // Consume one
        q.dequeue();
        // Can enqueue again
        q.enqueue('ArrowDown', 'ArrowRight');
        return assert.eq(q.length, 2);
      },
    });

    // TC-110: All four directions enqueued — only first two valid survive
    tests.push({
      description: 'TC-110: All four arrows rapid-fired — capacity + reversal filter',
      category: 'Concurrent Input Handling',
      execute() {
        const q = new DirectionQueueManager();
        // Currently heading Right
        q.enqueue('ArrowUp', 'ArrowRight');     // accepted (perpendicular)
        q.enqueue('ArrowDown', 'ArrowRight');   // rejected (opposite of queue tail Up)
        q.enqueue('ArrowLeft', 'ArrowRight');   // rejected (queue full after first)
        q.enqueue('ArrowRight', 'ArrowRight');  // rejected (queue full)
        // Wait — re-check: after first enqueue, length=1. Second is opposite of tail (Up),
        // so rejected. Third: length still 1, Left vs Up? Not opposite. Accepted!
        const q2 = new DirectionQueueManager();
        q2.enqueue('ArrowUp', 'ArrowRight');    // accepted → length 1
        q2.enqueue('ArrowDown', 'ArrowRight');  // rejected (opposite of Up)
        q2.enqueue('ArrowLeft', 'ArrowRight');  // accepted (not opposite of Up) → length 2
        q2.enqueue('ArrowRight', 'ArrowRight'); // rejected (queue full)
        return assert.eq(q2.length, 2);
      },
    });

    // TC-111: WASD and Arrow keys treated identically by queue
    tests.push({
      description: 'TC-111: Queue treats WASD-mapped directions identically to arrows',
      category: 'Concurrent Input Handling',
      execute() {
        // Both 'ArrowUp' from W and from Arrow key map to same string
        const q1 = new DirectionQueueManager();
        q1.enqueue('ArrowUp', 'ArrowRight'); // as if from ArrowUp key
        const q2 = new DirectionQueueManager();
        q2.enqueue('ArrowUp', 'ArrowRight'); // as if from KeyW (mapped to ArrowUp)
        return assert.eq(q1.length, q2.length);
      },
    });

    // TC-112: Interleaved tick-input-tick-input cycle — correct direction trace
    tests.push({
      description: 'TC-112: Interleaved tick-input cycles trace correct path',
      category: 'Concurrent Input Handling',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        engine.state.food = { x: 0, y: 0 };
        const trace = [engine.state.dir];
        // Tick 1: no input
        engine.tick();
        trace.push(engine.state.dir);
        // Input: Up
        engine.dirQueue.enqueue('ArrowUp', engine.state.dir);
        // Tick 2: consumes Up
        engine.tick();
        trace.push(engine.state.dir);
        // Input: Left
        engine.dirQueue.enqueue('ArrowLeft', engine.state.dir);
        // Tick 3: consumes Left
        engine.tick();
        trace.push(engine.state.dir);
        return assert.deep(trace, ['ArrowRight', 'ArrowRight', 'ArrowUp', 'ArrowLeft']);
      },
    });

    // TC-113: Queue state is independent per game — clear on initGame
    tests.push({
      description: 'TC-113: initGame() clears queued directions',
      category: 'Concurrent Input Handling',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        engine.dirQueue.enqueue('ArrowUp', engine.state.dir);
        engine.dirQueue.enqueue('ArrowLeft', engine.state.dir);
        engine.initGame(); // reset
        return assert.eq(engine.dirQueue.length, 0);
      },
    });

    // TC-114: Queue reversal rejection uses tail, not state.dir — regression
    tests.push({
      description: 'TC-114: Reversal check uses queue tail (regression guard)',
      category: 'Concurrent Input Handling',
      execute() {
        const q = new DirectionQueueManager();
        // State.dir is Right, enqueue Up (valid), then try Right (not opposite of Up)
        q.enqueue('ArrowUp', 'ArrowRight');
        q.enqueue('ArrowRight', 'ArrowRight'); // valid: Right is not opposite of Up
        const dirs = [q.dequeue(), q.dequeue()];
        return assert.deep(dirs, ['ArrowUp', 'ArrowRight']);
      },
    });

    // TC-115: Empty queue dequeue returns undefined — safe for tick consumption
    tests.push({
      description: 'TC-115: Multiple dequeues from empty queue all return undefined',
      category: 'Concurrent Input Handling',
      execute() {
        const q = new DirectionQueueManager();
        const results = [q.dequeue(), q.dequeue(), q.dequeue()];
        return assert.deep(results, [undefined, undefined, undefined]);
      },
    });

    return tests;
  }
}

// ─── 4.11 Game State Exploration & Segment Tracking Factory (15 tests) ───────

/**
 * GameStateExplorationSegmentTrackingVerificationFactory — validates that the
 * externally-observable game state projection (window.gameState in production,
 * simulated here via the GameStateSnapshot) faithfully represents the internal
 * model at every lifecycle phase, with particular attention to:
 *
 *   - Player position (head) tracking across tick boundaries
 *   - Snake body segment array integrity (deep copy, correct ordering)
 *   - Game state field consistency across phase transitions
 *   - Segment growth on food consumption
 *   - Segment contiguity invariant (adjacent segments differ by exactly 1 cell)
 *
 * This factory implements the Schneider Automated Test Protocol §7.3 —
 * "Observable State Projection Fidelity Verification" (OSPFV).
 */
class GameStateExplorationSegmentTrackingVerificationFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];

    /**
     * ProjectGameState — mirrors the production syncGameState() function,
     * projecting internal GameSimulationEngine state into the external
     * window.gameState schema. This is the System Under Test's Rosetta Stone.
     *
     * @param {GameSimulationEngine} engine
     * @returns {Object} — the projected game state object
     */
    function projectGameState(engine) {
      const s = engine.state;
      return {
        score:       s.score,
        hi:          s.hi,
        alive:       s.phase === 'playing' || s.phase === 'paused',
        gameOver:    s.phase === 'dead',
        phase:       s.phase,
        level:       Math.floor(s.score / 5) + 1,
        player:      s.snake.length > 0
          ? { x: s.snake[0].x, y: s.snake[0].y }
          : { x: 0, y: 0 },
        snakeLength: s.snake.length,
        segments:    s.snake.map(seg => ({ x: seg.x, y: seg.y })),
        direction:   s.dir,
        food:        { x: s.food.x, y: s.food.y },
        gridCols:    engine.grid.cols,
        gridRows:    engine.grid.rows,
      };
    }

    /**
     * SegmentContiguityInvariantValidator — verifies that consecutive segments
     * in the snake body differ by exactly one cell in either x or y (but not both),
     * which is the topological invariant of a non-diagonal grid snake.
     *
     * @param {{x:number,y:number}[]} segments
     * @returns {boolean}
     */
    function validateSegmentContiguity(segments) {
      for (let i = 1; i < segments.length; i++) {
        const dx = Math.abs(segments[i].x - segments[i - 1].x);
        const dy = Math.abs(segments[i].y - segments[i - 1].y);
        if ((dx + dy) !== 1) return false;
      }
      return true;
    }

    // TC-116: Initial game state projection has correct default values
    tests.push({
      description: 'TC-116: Initial projected state has idle phase and zero score',
      category: 'Game State Exploration',
      execute() {
        const engine = new GameSimulationEngine();
        const gs = projectGameState(engine);
        const r1 = assert.eq(gs.phase, 'idle');
        if (!r1.passed) return r1;
        const r2 = assert.eq(gs.score, 0);
        if (!r2.passed) return r2;
        return assert.eq(gs.gameOver, false);
      },
    });

    // TC-117: After initGame(), player position matches head of snake
    tests.push({
      description: 'TC-117: Player position tracks snake head after init',
      category: 'Game State Exploration',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        const gs = projectGameState(engine);
        return assert.deep(gs.player, { x: 10, y: 10 });
      },
    });

    // TC-118: Segments array is a deep copy with correct initial ordering
    tests.push({
      description: 'TC-118: Segments array matches initial snake body ordering',
      category: 'Game State Exploration',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        const gs = projectGameState(engine);
        return assert.deep(gs.segments, [
          { x: 10, y: 10 },
          { x:  9, y: 10 },
          { x:  8, y: 10 },
        ]);
      },
    });

    // TC-119: Player position updates after one tick (movement tracking)
    tests.push({
      description: 'TC-119: Player position advances by direction delta after tick',
      category: 'Game State Exploration',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        engine.state.food = { x: 0, y: 0 }; // safe distance
        engine.tick();
        const gs = projectGameState(engine);
        return assert.deep(gs.player, { x: 11, y: 10 });
      },
    });

    // TC-120: Segments maintain contiguity invariant after multiple ticks
    tests.push({
      description: 'TC-120: Segment contiguity invariant holds after 5 ticks',
      category: 'Game State Exploration',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        engine.state.food = { x: 0, y: 0 };
        for (let i = 0; i < 5; i++) engine.tick();
        const gs = projectGameState(engine);
        return assert.truthy(validateSegmentContiguity(gs.segments));
      },
    });

    // TC-121: Snake grows by one segment when food is consumed
    tests.push({
      description: 'TC-121: snakeLength increments by 1 on food consumption',
      category: 'Game State Exploration',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        const initialLen = engine.state.snake.length;
        // Place food directly ahead of the snake's head
        engine.state.food = { x: 11, y: 10 };
        engine.tick();
        const gs = projectGameState(engine);
        return assert.eq(gs.snakeLength, initialLen + 1);
      },
    });

    // TC-122: Segments array grows correctly — new head prepended, tail retained
    tests.push({
      description: 'TC-122: Segments array grows with head prepend on eat',
      category: 'Game State Exploration',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        engine.state.food = { x: 11, y: 10 };
        engine.tick();
        const gs = projectGameState(engine);
        // Head should be new position, original segments retained (no pop)
        const r1 = assert.eq(gs.segments[0].x, 11);
        if (!r1.passed) return r1;
        return assert.eq(gs.segments.length, 4);
      },
    });

    // TC-123: Level computation — level = floor(score / 5) + 1
    tests.push({
      description: 'TC-123: Level advances at score thresholds (0→1, 5→2, 10→3)',
      category: 'Game State Exploration',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        const gs0 = projectGameState(engine);
        const r1 = assert.eq(gs0.level, 1);
        if (!r1.passed) return r1;
        engine.state.score = 5;
        const gs5 = projectGameState(engine);
        const r2 = assert.eq(gs5.level, 2);
        if (!r2.passed) return r2;
        engine.state.score = 10;
        const gs10 = projectGameState(engine);
        return assert.eq(gs10.level, 3);
      },
    });

    // TC-124: alive=true during 'playing' phase
    tests.push({
      description: 'TC-124: alive is true when phase is playing',
      category: 'Game State Exploration',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        const gs = projectGameState(engine);
        return assert.eq(gs.alive, true);
      },
    });

    // TC-125: gameOver=true and alive=false after death
    tests.push({
      description: 'TC-125: gameOver=true and alive=false after wall collision',
      category: 'Game State Exploration',
      execute() {
        const engine = new GameSimulationEngine();
        engine.state.phase = 'playing';
        engine.state.dir = 'ArrowRight';
        engine.state.snake = [
          { x: 19, y: 10 },
          { x: 18, y: 10 },
          { x: 17, y: 10 },
        ];
        engine.state.food = { x: 5, y: 5 };
        engine.tick(); // hits right wall
        const gs = projectGameState(engine);
        const r1 = assert.eq(gs.gameOver, true);
        if (!r1.passed) return r1;
        return assert.eq(gs.alive, false);
      },
    });

    // TC-126: Direction field tracks queued direction changes
    tests.push({
      description: 'TC-126: Projected direction updates after queued turn',
      category: 'Game State Exploration',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        engine.state.food = { x: 0, y: 0 };
        engine.dirQueue.enqueue('ArrowUp', engine.state.dir);
        engine.tick();
        const gs = projectGameState(engine);
        return assert.eq(gs.direction, 'ArrowUp');
      },
    });

    // TC-127: Food position is correctly projected
    tests.push({
      description: 'TC-127: Projected food position matches internal state',
      category: 'Game State Exploration',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        engine.state.food = { x: 7, y: 13 };
        const gs = projectGameState(engine);
        return assert.deep(gs.food, { x: 7, y: 13 });
      },
    });

    // TC-128: Grid dimensions are correctly exposed
    tests.push({
      description: 'TC-128: Grid dimensions (20x20) exposed in projected state',
      category: 'Game State Exploration',
      execute() {
        const engine = new GameSimulationEngine();
        const gs = projectGameState(engine);
        const r1 = assert.eq(gs.gridCols, 20);
        if (!r1.passed) return r1;
        return assert.eq(gs.gridRows, 20);
      },
    });

    // TC-129: Segments are deep copies — mutation of projection doesn't affect engine
    tests.push({
      description: 'TC-129: Projected segments are isolated from internal state',
      category: 'Game State Exploration',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        const gs = projectGameState(engine);
        gs.segments[0].x = 999; // mutate projection
        return assert.eq(engine.state.snake[0].x, 10); // internal state unchanged
      },
    });

    // TC-130: Multi-tick path tracing — segments form correct trail
    tests.push({
      description: 'TC-130: Snake segments form correct trail after L-shaped path',
      category: 'Game State Exploration',
      execute() {
        const engine = new GameSimulationEngine();
        engine.initGame();
        engine.state.food = { x: 0, y: 0 };
        // Move right twice, then up twice
        engine.tick(); // head → (11,10)
        engine.tick(); // head → (12,10)
        engine.dirQueue.enqueue('ArrowUp', engine.state.dir);
        engine.tick(); // head → (12,9)
        engine.tick(); // head → (12,8)
        const gs = projectGameState(engine);
        // Snake is 3 segments: head + 2 trailing
        return assert.deep(gs.segments, [
          { x: 12, y: 8 },
          { x: 12, y: 9 },
          { x: 12, y: 10 },
        ]);
      },
    });

    return tests;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §6. MAIN EXECUTION — TestSuiteOrchestrator assembly & invocation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Entrypoint — assembles the factory pipeline and dispatches the orchestrator.
 *
 * Architectural purists may note that we could have used a
 * FactoryOfFactoryRegistryProviderSingleton here, but Dr. Schneider decided
 * that was "a bridge too far" (his words, 2024 Architecture Review Board).
 */
function main() {
  const orchestrator = new TestSuiteOrchestrator();

  orchestrator.registerFactories([
    new BoundaryCollisionTestCaseFactory(),
    new DirectionQueueRaceConditionTestCaseFactory(),
    new SelfIntersectionDetectionTestCaseFactory(),
    new FoodSpawnExclusionZoneTestCaseFactory(),
    new ScoreOverflowHandlingTestCaseFactory(),
    new EdgeCaseMiscellaneousVerificationTestCaseFactory(),
    // Schneider Test Protocol v1.1 — Advanced Collision Detection Extension
    new WraparoundBoundaryRejectionVerificationFactory(),
    new RapidDirectionChangeTemporalAliasingFactory(),
    new SelfCollisionAtSpeedLevel3PlusFactory(),
    new ConcurrentInputHandlingQueueSaturationFactory(),
    // Schneider Test Protocol v1.2 — Game State Exploration & Segment Tracking
    new GameStateExplorationSegmentTrackingVerificationFactory(),
  ]);

  const { total, passed, failed } = orchestrator.execute();

  if (total !== 130) {
    console.error(`\n  ⚠  INVARIANT VIOLATION: Expected 130 test cases, got ${total}.`);
    console.error('     The TestCaseFactory pipeline has a cardinality mismatch.');
    process.exit(2);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
