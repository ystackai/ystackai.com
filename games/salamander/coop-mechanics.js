/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COOP MECHANICS MODULE — Pacific Rim Dual-Pilot Input Synchronisation
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ticket:    #93 — Salamander × Pacific Rim — Co-op mechanic framework
 * Author:    Dr. Schneider, Principal Architect (PhD ETH Zürich)
 * Module:    CoopMechanicsKernel — Input axis decomposition, conflict
 *            resolution strategy hierarchy, and shared input coordination.
 *
 * Architecture:
 *   DirectionAxisDecomposer (Utility/Static)
 *     ↕ used by
 *   ConflictResolutionStrategyFactory (Abstract Factory)
 *     → MomentumResolver (Concrete Strategy)
 *     → PriorityResolver (Concrete Strategy)
 *     → AlternatingResolver (Concrete Strategy with internal state)
 *     ↕ injected into
 *   SharedInputCoordinator (Mediator)
 *     → 180° ReversalGuard (Chain of Responsibility link)
 *     → DriftPenaltyAccumulator (temporal counter)
 *     → CoordinationBonusAccumulator (temporal counter)
 *
 * Additionally:
 *   CoopStateFactory (Abstract Factory + Builder)
 *   DistanceMetricStrategy (Strategy)
 *   SyncPredicateEvaluator (Composite predicate)
 *
 * Key Invariant:
 *   ∀ tick t : merge(P1_input(t), P2_input(t)) → exactly one d ∈ {up,down,left,right}
 *
 * Design Notes:
 *   In Pacific Rim mode, the neural drift mechanic requires that two
 *   pilots control a single mech-salamander. P1 governs vertical movement
 *   (W/S → up/down), P2 governs horizontal movement (←/→ → left/right).
 *   The SharedInputCoordinator merges these orthogonal input streams into
 *   a single directional command per game tick.
 *
 *   When both pilots provide input simultaneously, a pluggable conflict
 *   resolution strategy determines the winner. Three strategies are
 *   implemented per specification: momentum, priority, and alternating.
 *
 *   The 180° reversal guard operates as a post-merge filter, ensuring
 *   that the mech cannot instantaneously reverse direction (which would
 *   cause self-collision on the next tick — a violation of the Schneider
 *   Self-Collision Prevention Theorem, SCPT).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

// ══════════════════════════════════════════════════════════════════════════
// §1 — CONFIGURATION SCHEMAS
// ══════════════════════════════════════════════════════════════════════════

/**
 * InputConfigurationSchema — Canonical constants governing the input
 * coordination subsystem. Frozen per SIP (Schneider Immutability Postulate).
 *
 * @readonly
 */
var INPUT_CONFIG = Object.freeze({
  /** @type {Array<string>} Directions P1 is permitted to input (vertical axis) */
  P1_AXES: ['up', 'down'],
  /** @type {Array<string>} Directions P2 is permitted to input (horizontal axis) */
  P2_AXES: ['left', 'right'],
  /** @type {number} Maximum ticks of input lag tolerated by the sync buffer */
  INPUT_BUFFER_TICKS: 2,
  /** @type {number} Consecutive no-input ticks before drift penalty triggers */
  DRIFT_PENALTY_THRESHOLD: 5,
  /** @type {number} Consecutive both-input ticks before coordination bonus activates */
  COORDINATION_BONUS_THRESHOLD: 3,
});

/**
 * GridConfigurationSchema — Canonical grid constants.
 * @readonly
 */
var GRID_DIMENSIONS = Object.freeze({ cols: 20, rows: 20 });

/**
 * SyncConfigurationSchema — Sync distance and scoring constants.
 * @readonly
 */
var SYNC_DISTANCE_THRESHOLD = 3;
var TICK_INTERVAL_MS = 160;
var MAX_VOID_ZONES = 8;
var EMBER_REPLENISH_COUNT = 3;
var LEVEL_SCORE_DIVISOR = 10;


// ══════════════════════════════════════════════════════════════════════════
// §2 — DIRECTION AXIS DECOMPOSER (Static Utility)
// ══════════════════════════════════════════════════════════════════════════

/**
 * DirectionAxisDecomposer — Decomposes directional input into its axis
 * classification and delta vector components.
 *
 * In the Pacific Rim co-op paradigm, the input space is partitioned into
 * two orthogonal axes:
 *   - Vertical:   { up, down }    — controlled by P1 (Jaeger left hemisphere)
 *   - Horizontal: { left, right } — controlled by P2 (Jaeger right hemisphere)
 *
 * This decomposition enables axis-aware validation: P1 inputs on the
 * horizontal axis are rejected (and vice versa), modelling the neural
 * drift constraint where each pilot controls only their assigned hemisphere.
 *
 * @namespace
 */
var DirectionAxisDecomposer = {

  /**
   * DELTA_VECTORS — Canonical movement deltas per direction.
   * @private @readonly
   */
  _DELTA: Object.freeze({
    up:    { dx:  0, dy: -1 },
    down:  { dx:  0, dy:  1 },
    left:  { dx: -1, dy:  0 },
    right: { dx:  1, dy:  0 },
  }),

  /**
   * getAxis — Returns the axis classification for a given direction.
   *
   * @param {string|null} direction — A cardinal direction or null
   * @returns {'vertical'|'horizontal'|null} Axis classification
   */
  getAxis: function (direction) {
    if (direction === 'up' || direction === 'down') return 'vertical';
    if (direction === 'left' || direction === 'right') return 'horizontal';
    return null;
  },

  /**
   * isValidP1Input — Predicate: is the direction on P1's axis?
   *
   * @param {string} direction — Direction to validate
   * @returns {boolean} True if direction ∈ P1_AXES
   */
  isValidP1Input: function (direction) {
    return INPUT_CONFIG.P1_AXES.indexOf(direction) !== -1;
  },

  /**
   * isValidP2Input — Predicate: is the direction on P2's axis?
   *
   * @param {string} direction — Direction to validate
   * @returns {boolean} True if direction ∈ P2_AXES
   */
  isValidP2Input: function (direction) {
    return INPUT_CONFIG.P2_AXES.indexOf(direction) !== -1;
  },

  /**
   * decompose — Converts a direction into its delta vector components.
   *
   * @param {string|null} direction — A cardinal direction or null
   * @returns {{ dx: number, dy: number }} Movement delta
   */
  decompose: function (direction) {
    return this._DELTA[direction] || { dx: 0, dy: 0 };
  },
};


// ══════════════════════════════════════════════════════════════════════════
// §3 — CONFLICT RESOLUTION STRATEGY FACTORY (Abstract Factory)
// ══════════════════════════════════════════════════════════════════════════

/**
 * ConflictResolutionStrategyFactory — Produces pluggable merge strategies
 * that determine which player's input wins when both provide input on
 * the same tick.
 *
 * Three strategies are defined per the Pacific Rim specification:
 *
 *   1. MomentumResolver — Favours the axis aligned with current movement
 *      direction. If neither axis matches (degenerate case), P1 wins.
 *      Rationale: physical momentum of the Jaeger makes axis-aligned
 *      corrections easier than cross-axis manoeuvres.
 *
 *   2. PriorityResolver — P1 always wins ties. Simple, deterministic,
 *      useful for asymmetric co-op where P1 is the "lead pilot."
 *
 *   3. AlternatingResolver — Priority alternates between P1 and P2 on
 *      each tick. Maintains internal tick counter. Promotes equitable
 *      control distribution (democratic drift paradigm).
 *
 * @namespace
 */
var ConflictResolutionStrategyFactory = {

  /**
   * createMomentumResolver — Creates a strategy that favours the axis
   * matching the mech's current direction of travel.
   *
   * @returns {{ name: string, resolve: Function }}
   */
  createMomentumResolver: function () {
    return {
      name: 'momentum',

      /**
       * resolve — Picks the input whose axis matches current direction.
       *
       * @param {string} p1Input — P1's directional input
       * @param {string} p2Input — P2's directional input
       * @param {string} currentDir — Mech's current direction
       * @returns {string} Winning direction
       */
      resolve: function (p1Input, p2Input, currentDir) {
        var currentAxis = DirectionAxisDecomposer.getAxis(currentDir);
        var p1Axis = DirectionAxisDecomposer.getAxis(p1Input);
        var p2Axis = DirectionAxisDecomposer.getAxis(p2Input);

        // Prefer the player whose input axis matches current momentum
        if (currentAxis === p1Axis) return p1Input;
        if (currentAxis === p2Axis) return p2Input;

        // Degenerate fallback: P1 wins (vertical hemisphere priority)
        return p1Input;
      },
    };
  },

  /**
   * createPriorityResolver — Creates a strategy where P1 always wins.
   *
   * @returns {{ name: string, resolve: Function }}
   */
  createPriorityResolver: function () {
    return {
      name: 'priority',

      /**
       * resolve — P1 always wins, regardless of context.
       *
       * @param {string} p1Input — P1's directional input
       * @param {string} _p2Input — P2's directional input (ignored)
       * @param {string} _currentDir — Current direction (ignored)
       * @returns {string} P1's input
       */
      resolve: function (p1Input, _p2Input, _currentDir) {
        return p1Input;
      },
    };
  },

  /**
   * createAlternatingResolver — Creates a strategy that alternates
   * priority between P1 and P2 on each invocation.
   *
   * Contains internal mutable state (tick counter). The resetTick()
   * method allows external synchronisation with the game loop.
   *
   * @returns {{ name: string, resolve: Function, resetTick: Function }}
   */
  createAlternatingResolver: function () {
    var tick = 0;

    return {
      name: 'alternating',

      /**
       * resolve — Odd ticks → P1, even ticks → P2.
       *
       * @param {string} p1Input — P1's directional input
       * @param {string} p2Input — P2's directional input
       * @param {string} _currentDir — Current direction (unused)
       * @returns {string} Winning direction
       */
      resolve: function (p1Input, p2Input, _currentDir) {
        tick++;
        return (tick % 2 === 1) ? p1Input : p2Input;
      },

      /**
       * resetTick — Resets the internal tick counter to 0.
       */
      resetTick: function () {
        tick = 0;
      },
    };
  },
};


// ══════════════════════════════════════════════════════════════════════════
// §4 — SHARED INPUT COORDINATOR (Mediator)
// ══════════════════════════════════════════════════════════════════════════

/**
 * OPPOSITE_DIRECTION_MAP — Canonical 180° reversal lookup.
 * @private @readonly
 */
var OPPOSITE_DIRECTION_MAP = Object.freeze({
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
});

/**
 * SharedInputCoordinator — The central mediator that merges P1 and P2
 * inputs into a single direction command per tick.
 *
 * This is the core of the Pacific Rim co-op mechanic. Each game tick,
 * the coordinator receives raw directional inputs from both players,
 * validates them against axis constraints, resolves conflicts via the
 * injected strategy, and enforces 180° reversal prevention.
 *
 * Additionally tracks:
 *   - consecutiveNoInput: ticks with no valid input (drift detection)
 *   - consecutiveBothInput: ticks with dual valid input (coordination bonus)
 *
 * Rules (from specification):
 *   1. P1 input must be on vertical axis; horizontal inputs are rejected
 *   2. P2 input must be on horizontal axis; vertical inputs are rejected
 *   3. If only one player provides input → use that input
 *   4. If both provide input → use conflict resolution strategy
 *   5. If neither provides input → maintain current direction (momentum)
 *   6. 180° reversal prevention applies to the merged output
 *
 * @class
 * @param {Object} [strategy] — Conflict resolution strategy (default: momentum)
 */
function SharedInputCoordinator(strategy) {
  /** @private */
  this._strategy = strategy || ConflictResolutionStrategyFactory.createMomentumResolver();
  /** @private @type {string} */
  this._currentDir = 'right';
  /** @private @type {number} */
  this._consecutiveNoInput = 0;
  /** @private @type {number} */
  this._consecutiveBothInput = 0;
}

// ── Property Accessors ────────────────────────────────────────────────────

Object.defineProperty(SharedInputCoordinator.prototype, 'currentDirection', {
  get: function () { return this._currentDir; },
  enumerable: true,
});

Object.defineProperty(SharedInputCoordinator.prototype, 'consecutiveNoInput', {
  get: function () { return this._consecutiveNoInput; },
  enumerable: true,
});

Object.defineProperty(SharedInputCoordinator.prototype, 'consecutiveBothInput', {
  get: function () { return this._consecutiveBothInput; },
  enumerable: true,
});

Object.defineProperty(SharedInputCoordinator.prototype, 'isDrifting', {
  /**
   * @returns {boolean} True if no-input streak has reached drift penalty threshold
   */
  get: function () {
    return this._consecutiveNoInput >= INPUT_CONFIG.DRIFT_PENALTY_THRESHOLD;
  },
  enumerable: true,
});

Object.defineProperty(SharedInputCoordinator.prototype, 'isCoordinated', {
  /**
   * @returns {boolean} True if both-input streak has reached coordination bonus threshold
   */
  get: function () {
    return this._consecutiveBothInput >= INPUT_CONFIG.COORDINATION_BONUS_THRESHOLD;
  },
  enumerable: true,
});

// ── Core Merge Logic ──────────────────────────────────────────────────────

/**
 * merge — Processes one tick of input from both players.
 *
 * Input validation, conflict resolution, reversal prevention, and counter
 * updates are all performed within this single method call (Transaction
 * Script pattern — cf. Fowler, "Patterns of Enterprise Application
 * Architecture", 2002).
 *
 * @param {string|null} p1Input — P1's directional input (or null)
 * @param {string|null} p2Input — P2's directional input (or null)
 * @returns {{ direction: string, source: string, valid: boolean }}
 */
SharedInputCoordinator.prototype.merge = function (p1Input, p2Input) {
  // Phase 1: Axis constraint validation
  var p1Valid = p1Input && DirectionAxisDecomposer.isValidP1Input(p1Input);
  var p2Valid = p2Input && DirectionAxisDecomposer.isValidP2Input(p2Input);

  var result;

  // Phase 2: Input categorisation and resolution
  if (p1Valid && p2Valid) {
    // Both pilots providing valid input — invoke conflict strategy
    this._consecutiveBothInput++;
    this._consecutiveNoInput = 0;
    var resolved = this._strategy.resolve(p1Input, p2Input, this._currentDir);
    result = { direction: resolved, source: 'both', valid: true };

  } else if (p1Valid) {
    // Only P1 providing valid input
    this._consecutiveBothInput = 0;
    this._consecutiveNoInput = 0;
    result = { direction: p1Input, source: 'p1', valid: true };

  } else if (p2Valid) {
    // Only P2 providing valid input
    this._consecutiveBothInput = 0;
    this._consecutiveNoInput = 0;
    result = { direction: p2Input, source: 'p2', valid: true };

  } else {
    // Neither pilot providing valid input — engage momentum autopilot
    this._consecutiveBothInput = 0;
    this._consecutiveNoInput++;
    result = { direction: this._currentDir, source: 'momentum', valid: true };
  }

  // Phase 3: 180° reversal guard (post-merge filter)
  if (result.direction === OPPOSITE_DIRECTION_MAP[this._currentDir]) {
    result = { direction: this._currentDir, source: 'reversal-blocked', valid: false };
  }

  // Phase 4: Commit direction
  this._currentDir = result.direction;
  return result;
};

/**
 * reset — Restores coordinator to initial state.
 *
 * Resets direction to default ('right'), clears all temporal counters.
 * Strategy instance is preserved (stateless strategies are unaffected;
 * stateful strategies like AlternatingResolver retain their internal
 * tick count unless explicitly reset via strategy.resetTick()).
 */
SharedInputCoordinator.prototype.reset = function () {
  this._currentDir = 'right';
  this._consecutiveNoInput = 0;
  this._consecutiveBothInput = 0;
};


// ══════════════════════════════════════════════════════════════════════════
// §5 — DISTANCE METRIC STRATEGY
// ══════════════════════════════════════════════════════════════════════════

/**
 * DistanceMetricStrategy — Encapsulates distance metric selection.
 *
 * The Salamander grid uses Manhattan distance for sync detection.
 * This abstraction allows future substitution with Chebyshev or Euclidean
 * metrics without modifying dependent code (Open/Closed Principle).
 *
 * Three metrics are provided per the Schneider Metric Triad:
 *   - Manhattan (L1 norm): |Δx| + |Δy|
 *   - Chebyshev (L∞ norm): max(|Δx|, |Δy|)
 *   - Euclidean (L2 norm): √(Δx² + Δy²)
 *
 * @namespace
 */
var DistanceMetricStrategy = {

  /**
   * manhattan — L1 distance (taxicab geometry).
   * Used for sync detection in the game specification.
   */
  manhattan: function (a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  },

  /**
   * chebyshev — L∞ distance (chessboard geometry).
   * Potentially useful for future "king-move" mechanics.
   */
  chebyshev: function (a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  },

  /**
   * euclidean — L2 distance (Pythagorean).
   * Useful for visual effects (e.g., sync beam opacity).
   */
  euclidean: function (a, b) {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
  },
};


// ══════════════════════════════════════════════════════════════════════════
// §6 — SYNC PREDICATE EVALUATOR
// ══════════════════════════════════════════════════════════════════════════

/**
 * SyncPredicateEvaluator — Evaluates the synchronisation predicate
 * between two positions on the grid.
 *
 * The sync predicate determines:
 *   - Whether players are "in sync" (within threshold distance)
 *   - The applicable score multiplier (2x if synced, 1x otherwise)
 *
 * The metric and threshold are configurable at construction time,
 * enabling parameterised testing across different sync radii.
 *
 * @class
 * @param {number} [threshold=SYNC_DISTANCE_THRESHOLD] — Sync distance threshold
 * @param {string} [metric='manhattan'] — Distance metric name
 */
function SyncPredicateEvaluator(threshold, metric) {
  this._threshold = (threshold !== undefined) ? threshold : SYNC_DISTANCE_THRESHOLD;
  this._metricName = metric || 'manhattan';
  this._metricFn = DistanceMetricStrategy[this._metricName];

  if (!this._metricFn) {
    throw new Error('[SchneiderProtocol] Unknown metric: ' + this._metricName);
  }
}

/**
 * evaluate — Computes sync status between two positions.
 *
 * @param {{ x: number, y: number }} posA — First position
 * @param {{ x: number, y: number }} posB — Second position
 * @returns {{ distance: number, synced: boolean, multiplier: number }}
 */
SyncPredicateEvaluator.prototype.evaluate = function (posA, posB) {
  var d = this._metricFn(posA, posB);
  var synced = d <= this._threshold;
  return {
    distance: d,
    synced: synced,
    multiplier: synced ? 2 : 1,
  };
};


// ══════════════════════════════════════════════════════════════════════════
// §7 — COOPERATIVE STATE FACTORY (Abstract Factory + Builder)
// ══════════════════════════════════════════════════════════════════════════

/**
 * CoopStateFactory — Generates deterministic game states for reproducible
 * testing and initial game setup.
 *
 * Design Pattern: Abstract Factory + Builder
 *
 * Per the Schneider methodology, state construction must be:
 *   (a) Deterministic — no Math.random() in construction paths
 *   (b) Minimal — only set fields relevant to the construction context
 *   (c) Documented — each field annotated with its SBT tier
 *   (d) Override-friendly — spread semantics for partial customisation
 *
 * @namespace
 */
var CoopStateFactory = {

  /**
   * createDefaultPlayer — Constructs a minimal player state object.
   *
   * @param {string} id — Player identifier ('p1' or 'p2')
   * @param {number} x — Initial x position (Tier-1: spatial)
   * @param {number} y — Initial y position (Tier-1: spatial)
   * @param {string} dir — Initial direction (Tier-1: directional)
   * @returns {Object} Player state object
   */
  createDefaultPlayer: function (id, x, y, dir) {
    return {
      id: id,                    // Tier-0: identity
      pos: { x: x, y: y },      // Tier-1: spatial state
      dir: dir,                  // Tier-1: directional state
      dirQueue: [],              // Tier-1: input buffer
      tail: [],                  // Tier-1: body segments
      score: 0,                  // Tier-0: accumulator
      alive: true,               // Tier-1: liveness predicate
    };
  },

  /**
   * createP1 — Constructs P1 with default Salamander spawn position.
   *
   * @param {Object} [overrides={}] — Field overrides
   * @returns {Object} P1 state object
   */
  createP1: function (overrides) {
    overrides = overrides || {};
    var base = CoopStateFactory.createDefaultPlayer('p1', 4, 10, 'right');
    base.tail = [{ x: 3, y: 10 }, { x: 2, y: 10 }];
    var key;
    for (key in overrides) {
      if (overrides.hasOwnProperty(key)) {
        base[key] = overrides[key];
      }
    }
    return base;
  },

  /**
   * createP2 — Constructs P2 with default Salamander spawn position.
   *
   * @param {Object} [overrides={}] — Field overrides
   * @returns {Object} P2 state object
   */
  createP2: function (overrides) {
    overrides = overrides || {};
    var base = CoopStateFactory.createDefaultPlayer('p2', 15, 10, 'left');
    base.tail = [{ x: 16, y: 10 }, { x: 17, y: 10 }];
    var key;
    for (key in overrides) {
      if (overrides.hasOwnProperty(key)) {
        base[key] = overrides[key];
      }
    }
    return base;
  },

  /**
   * createGameState — Constructs a complete game state with all fields.
   *
   * Includes movie mashup extension fields (sharedHealthPool, betrayalState,
   * sharedInputBuffer) defaulting to null per specification.
   *
   * @param {Object} [overrides={}] — Field overrides (supports nested p1/p2)
   * @returns {Object} Complete game state
   */
  createGameState: function (overrides) {
    overrides = overrides || {};
    var state = {
      phase: 'playing',
      p1: CoopStateFactory.createP1(overrides.p1),
      p2: CoopStateFactory.createP2(overrides.p2),
      embers: overrides.embers || [],
      voids: overrides.voids || [],
      synced: false,
      level: 1,
      hi: 0,
      // Movie mashup extensions (spec contract — null until activated)
      sharedHealthPool: overrides.sharedHealthPool || null,
      betrayalState: overrides.betrayalState || null,
      sharedInputBuffer: overrides.sharedInputBuffer || null,
    };
    // Apply remaining top-level overrides
    var key;
    for (key in overrides) {
      if (overrides.hasOwnProperty(key) &&
          key !== 'p1' && key !== 'p2' && key !== 'embers' && key !== 'voids' &&
          key !== 'sharedHealthPool' && key !== 'betrayalState' && key !== 'sharedInputBuffer') {
        state[key] = overrides[key];
      }
    }
    return state;
  },
};


// ══════════════════════════════════════════════════════════════════════════
// §8 — MODULE EXPORTS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Export via Schneider Module Export Canonical Form (SMECF).
 */
var CoopMechanicsExports = {
  // Configuration
  INPUT_CONFIG: INPUT_CONFIG,
  GRID_DIMENSIONS: GRID_DIMENSIONS,
  SYNC_DISTANCE_THRESHOLD: SYNC_DISTANCE_THRESHOLD,
  TICK_INTERVAL_MS: TICK_INTERVAL_MS,
  MAX_VOID_ZONES: MAX_VOID_ZONES,
  EMBER_REPLENISH_COUNT: EMBER_REPLENISH_COUNT,
  LEVEL_SCORE_DIVISOR: LEVEL_SCORE_DIVISOR,

  // Input subsystem
  DirectionAxisDecomposer: DirectionAxisDecomposer,
  ConflictResolutionStrategyFactory: ConflictResolutionStrategyFactory,
  SharedInputCoordinator: SharedInputCoordinator,

  // Sync subsystem
  DistanceMetricStrategy: DistanceMetricStrategy,
  SyncPredicateEvaluator: SyncPredicateEvaluator,

  // State factory
  CoopStateFactory: CoopStateFactory,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CoopMechanicsExports;
}
if (typeof window !== 'undefined') {
  window.CoopMechanics = CoopMechanicsExports;
}
