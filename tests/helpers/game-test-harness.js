/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  Unified Game Test Harness — Reusable Infrastructure for Grid-Based Games  ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║  Author:  Dr. Schneider, Principal Architect (PhD ETH Zürich)              ║
 * ║  Pattern: AbstractMockCompositeStrategyHarnessBridge (AMCSHB)              ║
 * ║  Module:  tests/helpers/game-test-harness.js                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 *
 * Architectural Note:
 *   This module consolidates the previously duplicated test infrastructure
 *   (canvas mocks, assertion strategies, game simulation, input simulation)
 *   into a canonical, reusable harness that any grid-based game test suite
 *   may consume. The Dependency Inversion Principle demands that we depend
 *   on abstractions, not on copy-pasted MockCanvasRenderingContext2D classes.
 *
 *   "If you copy-paste a mock three times, you don't have a mock — you have
 *    a distributed monolith of lies." — Dr. Schneider, TestCon Berlin 2025
 *
 * Usage:
 *   const { GameTestHarnessFactory } = require('./tests/helpers/game-test-harness');
 *   const harness = GameTestHarnessFactory.create({ cols: 20, rows: 20 });
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
//  §1. MICRO-ASSERTION FRAMEWORK (Canonical Implementation)
//      — the Single Source of Truth for all verification predicates
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * AbstractAssertionStrategyBase — the cornerstone of our verification pyramid.
 * Concrete subclasses implement domain-specific comparison semantics.
 *
 * Note: "Assertion" is a deliberate Schneider-ism. It is architecturally
 * distinct from the pedestrian "assertion" found in lesser frameworks.
 */
class AbstractAssertionStrategyBase {
  /** @param {*} actual @param {*} expected @returns {{ passed: boolean, message: string }} */
  evaluate(actual, expected) {
    throw new Error('AbstractAssertionStrategyBase.evaluate() is abstract — ' +
      'did you forget to implement the Template Method pattern?');
  }
}

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

class DeepEqualityAssertionStrategy extends AbstractAssertionStrategyBase {
  evaluate(actual, expected) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    const passed = a === b;
    return {
      passed,
      message: passed ? `✓ deep-equal` : `✗ Expected ${b}, got ${a}`,
    };
  }
}

class TruthyAssertionStrategy extends AbstractAssertionStrategyBase {
  evaluate(actual, _expected) {
    const passed = !!actual;
    return {
      passed,
      message: passed ? `✓ truthy` : `✗ Expected truthy, got ${JSON.stringify(actual)}`,
    };
  }
}

class FalsyAssertionStrategy extends AbstractAssertionStrategyBase {
  evaluate(actual, _expected) {
    const passed = !actual;
    return {
      passed,
      message: passed ? `✓ falsy` : `✗ Expected falsy, got ${JSON.stringify(actual)}`,
    };
  }
}

class RangeAssertionStrategy extends AbstractAssertionStrategyBase {
  evaluate(actual, { min, max }) {
    const passed = actual >= min && actual <= max;
    return {
      passed,
      message: passed
        ? `✓ ${actual} ∈ [${min}, ${max}]`
        : `✗ ${actual} ∉ [${min}, ${max}]`,
    };
  }
}

class GreaterThanAssertionStrategy extends AbstractAssertionStrategyBase {
  evaluate(actual, expected) {
    const passed = actual > expected;
    return {
      passed,
      message: passed ? `✓ ${actual} > ${expected}` : `✗ ${actual} is not > ${expected}`,
    };
  }
}

class LessThanAssertionStrategy extends AbstractAssertionStrategyBase {
  evaluate(actual, expected) {
    const passed = actual < expected;
    return {
      passed,
      message: passed ? `✓ ${actual} < ${expected}` : `✗ ${actual} is not < ${expected}`,
    };
  }
}

class ThrowsAssertionStrategy extends AbstractAssertionStrategyBase {
  evaluate(fn, expectedPattern) {
    try {
      fn();
      return { passed: false, message: `✗ Expected function to throw, but it did not` };
    } catch (e) {
      if (expectedPattern && !e.message.match(expectedPattern)) {
        return { passed: false, message: `✗ Threw "${e.message}", expected pattern ${expectedPattern}` };
      }
      return { passed: true, message: `✓ threw as expected` };
    }
  }
}

/**
 * AssertionStrategyFactoryProvider — the polymorphic dispatch table for
 * assertion resolution. Registered strategies are resolved via discriminated
 * union tags, maintaining the Open/Closed Principle across all modalities.
 */
class AssertionStrategyFactoryProvider {
  /** @type {Map<string, AbstractAssertionStrategyBase>} */
  #strategyRegistry = new Map();

  constructor() {
    this.#strategyRegistry.set('eq', new StrictEqualityAssertionStrategy());
    this.#strategyRegistry.set('deep', new DeepEqualityAssertionStrategy());
    this.#strategyRegistry.set('truthy', new TruthyAssertionStrategy());
    this.#strategyRegistry.set('falsy', new FalsyAssertionStrategy());
    this.#strategyRegistry.set('range', new RangeAssertionStrategy());
    this.#strategyRegistry.set('gt', new GreaterThanAssertionStrategy());
    this.#strategyRegistry.set('lt', new LessThanAssertionStrategy());
    this.#strategyRegistry.set('throws', new ThrowsAssertionStrategy());
  }

  /** @param {string} tag @param {AbstractAssertionStrategyBase} strategy */
  register(tag, strategy) {
    if (!(strategy instanceof AbstractAssertionStrategyBase)) {
      throw new Error('Strategy must extend AbstractAssertionStrategyBase — ' +
        'the Liskov Substitution Principle is not optional.');
    }
    this.#strategyRegistry.set(tag, strategy);
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

/** Singleton — because we definitely need exactly one of these. */
const assertionFactory = new AssertionStrategyFactoryProvider();

/**
 * Convenience façade that hides the factory-strategy plumbing behind a
 * fluent interface. Dr. Schneider would never expose raw factories to
 * the test-case layer — that would violate the Dependency Inversion Principle.
 */
const assert = {
  eq:     (a, b)       => assertionFactory.resolve('eq').evaluate(a, b),
  deep:   (a, b)       => assertionFactory.resolve('deep').evaluate(a, b),
  truthy: (a)          => assertionFactory.resolve('truthy').evaluate(a, undefined),
  falsy:  (a)          => assertionFactory.resolve('falsy').evaluate(a, undefined),
  range:  (a, min, max) => assertionFactory.resolve('range').evaluate(a, { min, max }),
  gt:     (a, b)       => assertionFactory.resolve('gt').evaluate(a, b),
  lt:     (a, b)       => assertionFactory.resolve('lt').evaluate(a, b),
  throws: (fn, pattern) => assertionFactory.resolve('throws').evaluate(fn, pattern),
};


// ═══════════════════════════════════════════════════════════════════════════════
//  §2. CANVAS MOCK INFRASTRUCTURE
//      — Observable test doubles for the Canvas 2D API surface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * CanvasOperationRecorder — records all draw calls for post-hoc verification.
 * Implements the Command pattern — each draw call becomes a replayable record.
 */
class CanvasOperationRecorder {
  /** @type {Array<{ op: string, args?: any[], timestamp: number }>} */
  #log = [];
  #frameCounter = 0;

  record(op, args = undefined) {
    this.#log.push({ op, args, frame: this.#frameCounter });
  }

  advanceFrame() { this.#frameCounter++; }

  /** @returns {Array<{ op: string, args?: any[], frame: number }>} */
  get operations() { return [...this.#log]; }

  /** Filter operations by type for targeted verification. */
  operationsOfType(opType) {
    return this.#log.filter(entry => entry.op === opType);
  }

  /** Count occurrences of a specific operation in a specific frame. */
  countInFrame(opType, frameNumber) {
    return this.#log.filter(e => e.op === opType && e.frame === frameNumber).length;
  }

  reset() {
    this.#log.length = 0;
    this.#frameCounter = 0;
  }
}

/**
 * MockCanvasRenderingContext2D — a comprehensive, observable mock of the
 * Canvas 2D API surface area. Each draw call is delegated to the
 * CanvasOperationRecorder for post-hoc verification.
 *
 * Covers: clearRect, fillRect, strokeRect, beginPath, arc, fill, stroke,
 * moveTo, lineTo, save, restore, translate, rotate, scale, setTransform,
 * globalAlpha, fillStyle, strokeStyle, lineWidth, font, textAlign,
 * fillText, strokeText, drawImage, createLinearGradient, createRadialGradient.
 */
class MockCanvasRenderingContext2D {
  /** @type {CanvasOperationRecorder} */
  recorder;

  constructor(recorder = new CanvasOperationRecorder()) {
    this.recorder = recorder;
    this.globalAlpha = 1.0;
    this.fillStyle = '';
    this.strokeStyle = '';
    this.lineWidth = 1;
    this.font = '10px sans-serif';
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
    this.shadowBlur = 0;
    this.shadowColor = 'rgba(0, 0, 0, 0)';
    this.shadowOffsetX = 0;
    this.shadowOffsetY = 0;
    this._transformStack = [];
  }

  clearRect(x, y, w, h)   { this.recorder.record('clearRect', [x, y, w, h]); }
  fillRect(x, y, w, h)    { this.recorder.record('fillRect', [x, y, w, h]); }
  strokeRect(x, y, w, h)  { this.recorder.record('strokeRect', [x, y, w, h]); }
  beginPath()              { this.recorder.record('beginPath'); }
  closePath()              { this.recorder.record('closePath'); }
  moveTo(x, y)            { this.recorder.record('moveTo', [x, y]); }
  lineTo(x, y)            { this.recorder.record('lineTo', [x, y]); }
  arc(x, y, r, s, e, ccw) { this.recorder.record('arc', [x, y, r, s, e, ccw]); }
  fill()                   { this.recorder.record('fill'); }
  stroke()                 { this.recorder.record('stroke'); }
  fillText(text, x, y)    { this.recorder.record('fillText', [text, x, y]); }
  strokeText(text, x, y)  { this.recorder.record('strokeText', [text, x, y]); }
  drawImage(...args)       { this.recorder.record('drawImage', args); }

  save()    { this.recorder.record('save'); this._transformStack.push(this.globalAlpha); }
  restore() { this.recorder.record('restore'); this.globalAlpha = this._transformStack.pop() ?? 1.0; }

  translate(x, y)     { this.recorder.record('translate', [x, y]); }
  rotate(angle)        { this.recorder.record('rotate', [angle]); }
  scale(x, y)          { this.recorder.record('scale', [x, y]); }
  setTransform(...args) { this.recorder.record('setTransform', args); }

  createLinearGradient(x0, y0, x1, y1) {
    const stops = [];
    return {
      addColorStop(offset, color) { stops.push({ offset, color }); },
      _stops: stops,
    };
  }

  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    const stops = [];
    return {
      addColorStop(offset, color) { stops.push({ offset, color }); },
      _stops: stops,
    };
  }

  /** @returns {ImageData-like object} */
  getImageData(x, y, w, h) {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }

  measureText(text) {
    return { width: text.length * 7 };  // 7px per char — close enough for testing
  }

  reset() {
    this.recorder.reset();
    this.globalAlpha = 1.0;
    this.fillStyle = '';
    this.strokeStyle = '';
  }
}

/**
 * MockCanvas — a fake HTMLCanvasElement that returns our mock context.
 * Supports getContext('2d'), width/height, and DOM removal tracking.
 */
class MockCanvas {
  constructor(width = 400, height = 300) {
    this.width = width;
    this.height = height;
    this._recorder = new CanvasOperationRecorder();
    this._ctx = new MockCanvasRenderingContext2D(this._recorder);
    this._removed = false;
    this._parent = null;
    this.style = {};
    this._eventListeners = new Map();
  }

  getContext(type) {
    if (type === '2d') return this._ctx;
    throw new Error(`MockCanvas does not support context type "${type}".`);
  }

  remove() {
    this._removed = true;
    if (this._parent) {
      this._parent._children = this._parent._children.filter(c => c !== this);
    }
  }

  addEventListener(event, handler) {
    if (!this._eventListeners.has(event)) this._eventListeners.set(event, []);
    this._eventListeners.get(event).push(handler);
  }

  removeEventListener(event, handler) {
    if (!this._eventListeners.has(event)) return;
    const handlers = this._eventListeners.get(event);
    this._eventListeners.set(event, handlers.filter(h => h !== handler));
  }

  dispatchEvent(event) {
    const handlers = this._eventListeners.get(event.type) || [];
    for (const h of handlers) h(event);
  }

  getBoundingClientRect() {
    return { top: 0, left: 0, width: this.width, height: this.height, right: this.width, bottom: this.height };
  }
}

/**
 * MockDOMContainer — simulates a parent DOM node for canvas attachment/removal.
 */
class MockDOMContainer {
  constructor() {
    this._children = [];
  }

  appendChild(child) {
    child._parent = this;
    this._children.push(child);
    return child;
  }

  removeChild(child) {
    child._parent = null;
    this._children = this._children.filter(c => c !== child);
    return child;
  }

  get childElementCount() { return this._children.length; }
  get children() { return [...this._children]; }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §3. KEYBOARD INPUT SIMULATION ENGINE
//      — because dispatching KeyboardEvents requires its own abstraction layer
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * KeyboardInputSimulationEngine — generates synthetic keyboard events with
 * configurable timing for deterministic input-sequence verification.
 *
 * Supports: single key presses, rapid sequences, held keys, and simultaneous
 * key combinations. Each event carries a monotonically increasing timestamp
 * to simulate real-world input temporal characteristics.
 */
class KeyboardInputSimulationEngine {
  /** @type {number} */
  #timestampCursor = 0;
  /** @type {Array<{ event: object, timestamp: number }>} */
  #inputLog = [];

  /**
   * Create a synthetic KeyboardEvent-like object.
   * @param {string} key - The key value (e.g., 'ArrowUp', 'w', ' ')
   * @param {string} type - Event type: 'keydown' | 'keyup' | 'keypress'
   * @param {object} [modifiers] - { ctrlKey, shiftKey, altKey, metaKey }
   * @returns {object} Synthetic keyboard event
   */
  createKeyEvent(key, type = 'keydown', modifiers = {}) {
    const event = {
      type,
      key,
      code: this.#keyToCode(key),
      ctrlKey: modifiers.ctrlKey || false,
      shiftKey: modifiers.shiftKey || false,
      altKey: modifiers.altKey || false,
      metaKey: modifiers.metaKey || false,
      timestamp: this.#timestampCursor,
      preventDefault: () => {},
      stopPropagation: () => {},
      _defaultPrevented: false,
    };
    event.preventDefault = () => { event._defaultPrevented = true; };
    this.#inputLog.push({ event, timestamp: this.#timestampCursor });
    return event;
  }

  /**
   * Simulate a rapid sequence of keydown events with configurable inter-key delay.
   * @param {string[]} keys - Array of key values
   * @param {number} [interKeyDelayMs=0] - Milliseconds between each keypress
   * @returns {object[]} Array of synthetic events
   */
  rapidSequence(keys, interKeyDelayMs = 0) {
    return keys.map((key, i) => {
      this.#timestampCursor += interKeyDelayMs;
      return this.createKeyEvent(key, 'keydown');
    });
  }

  /**
   * Simulate a key press (keydown + keyup pair) with configurable hold duration.
   * @param {string} key
   * @param {number} [holdDurationMs=50]
   * @returns {{ down: object, up: object }}
   */
  pressAndRelease(key, holdDurationMs = 50) {
    const down = this.createKeyEvent(key, 'keydown');
    this.#timestampCursor += holdDurationMs;
    const up = this.createKeyEvent(key, 'keyup');
    return { down, up };
  }

  /**
   * Simulate simultaneous keys (e.g., two arrow keys at once).
   * All keydown events share the same timestamp.
   * @param {string[]} keys
   * @returns {object[]}
   */
  simultaneousKeys(keys) {
    const snapshot = this.#timestampCursor;
    return keys.map(key => {
      this.#timestampCursor = snapshot;  // same timestamp for all
      return this.createKeyEvent(key, 'keydown');
    });
  }

  /** Advance the internal clock without generating events. */
  advanceTime(ms) { this.#timestampCursor += ms; }

  /** @returns {number} Current virtual timestamp */
  get currentTimestamp() { return this.#timestampCursor; }

  /** @returns {Array<{ event: object, timestamp: number }>} Full input log */
  get inputLog() { return [...this.#inputLog]; }

  reset() {
    this.#timestampCursor = 0;
    this.#inputLog.length = 0;
  }

  /**
   * Map key values to key codes — because the Web Platform decided we need
   * both `key` and `code` properties on keyboard events.
   * @param {string} key @returns {string}
   */
  #keyToCode(key) {
    const codeMap = {
      'ArrowUp': 'ArrowUp', 'ArrowDown': 'ArrowDown',
      'ArrowLeft': 'ArrowLeft', 'ArrowRight': 'ArrowRight',
      'w': 'KeyW', 'a': 'KeyA', 's': 'KeyS', 'd': 'KeyD',
      'W': 'KeyW', 'A': 'KeyA', 'S': 'KeyS', 'D': 'KeyD',
      ' ': 'Space', 'Enter': 'Enter', 'Escape': 'Escape',
      'p': 'KeyP', 'P': 'KeyP', 'r': 'KeyR', 'R': 'KeyR',
    };
    return codeMap[key] || `Key${key.toUpperCase()}`;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §4. GRID STATE ASSERTION UTILITIES
//      — because verifying 2D spatial invariants deserves its own DSL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GridStateAssertionEngine — provides high-level predicates for verifying
 * the state of grid-based game boards. Operates on a universal coordinate
 * representation: arrays of {x, y} position objects.
 */
class GridStateAssertionEngine {
  /** @type {number} */ #cols;
  /** @type {number} */ #rows;

  constructor(cols, rows) {
    this.#cols = cols;
    this.#rows = rows;
  }

  /** Verify a position is within grid bounds. */
  isInBounds(pos) {
    return pos.x >= 0 && pos.x < this.#cols && pos.y >= 0 && pos.y < this.#rows;
  }

  /** Verify a position is on the grid boundary (edge). */
  isOnBoundary(pos) {
    return this.isInBounds(pos) && (
      pos.x === 0 || pos.x === this.#cols - 1 ||
      pos.y === 0 || pos.y === this.#rows - 1
    );
  }

  /** Verify a position is exactly at a corner. */
  isCorner(pos) {
    return (pos.x === 0 || pos.x === this.#cols - 1) &&
           (pos.y === 0 || pos.y === this.#rows - 1);
  }

  /** Verify no duplicate positions exist in an array (e.g., snake body). */
  hasNoDuplicates(positions) {
    const seen = new Set();
    for (const p of positions) {
      const key = `${p.x},${p.y}`;
      if (seen.has(key)) return false;
      seen.add(key);
    }
    return true;
  }

  /** Verify all positions in an array are within bounds. */
  allInBounds(positions) {
    return positions.every(p => this.isInBounds(p));
  }

  /** Verify an entity occupies a contiguous path (each segment adjacent to the next). */
  isContiguous(positions) {
    for (let i = 1; i < positions.length; i++) {
      const dx = Math.abs(positions[i].x - positions[i - 1].x);
      const dy = Math.abs(positions[i].y - positions[i - 1].y);
      if (dx + dy !== 1) return false;
    }
    return true;
  }

  /** Get all four corner positions for the grid. */
  get corners() {
    return [
      { x: 0, y: 0 },
      { x: this.#cols - 1, y: 0 },
      { x: 0, y: this.#rows - 1 },
      { x: this.#cols - 1, y: this.#rows - 1 },
    ];
  }

  /** Get all boundary positions (entire perimeter). */
  get boundary() {
    const positions = [];
    for (let x = 0; x < this.#cols; x++) {
      positions.push({ x, y: 0 });
      positions.push({ x, y: this.#rows - 1 });
    }
    for (let y = 1; y < this.#rows - 1; y++) {
      positions.push({ x: 0, y });
      positions.push({ x: this.#cols - 1, y });
    }
    return positions;
  }

  get cols() { return this.#cols; }
  get rows() { return this.#rows; }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §5. COLLISION DETECTION VALIDATION HELPERS
//      — the Specification pattern applied to spatial predicates
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * CollisionValidationOracle — a reusable, game-agnostic collision detection
 * verification suite. Provides wall, self, entity-entity, and food collision
 * predicates that can be composed via the Specification pattern.
 */
class CollisionValidationOracle {
  /** @type {GridStateAssertionEngine} */
  #gridEngine;

  constructor(gridEngine) {
    this.#gridEngine = gridEngine;
  }

  /**
   * Verify that a position triggers a wall collision (outside bounds).
   * @param {{ x: number, y: number }} pos
   * @returns {{ passed: boolean, message: string }}
   */
  assertWallCollision(pos) {
    const outOfBounds = !this.#gridEngine.isInBounds(pos);
    return {
      passed: outOfBounds,
      message: outOfBounds
        ? `✓ Wall collision at (${pos.x}, ${pos.y})`
        : `✗ Expected wall collision at (${pos.x}, ${pos.y}) but position is in bounds`,
    };
  }

  /**
   * Verify that a position does NOT trigger a wall collision.
   * @param {{ x: number, y: number }} pos
   * @returns {{ passed: boolean, message: string }}
   */
  assertNoWallCollision(pos) {
    const inBounds = this.#gridEngine.isInBounds(pos);
    return {
      passed: inBounds,
      message: inBounds
        ? `✓ No wall collision at (${pos.x}, ${pos.y})`
        : `✗ Unexpected wall collision at (${pos.x}, ${pos.y})`,
    };
  }

  /**
   * Verify self-collision: head overlaps any body segment.
   * @param {{ x: number, y: number }} head
   * @param {{ x: number, y: number }[]} body
   * @returns {{ passed: boolean, message: string }}
   */
  assertSelfCollision(head, body) {
    const collides = body.some(seg => seg.x === head.x && seg.y === head.y);
    return {
      passed: collides,
      message: collides
        ? `✓ Self-collision detected at (${head.x}, ${head.y})`
        : `✗ Expected self-collision at (${head.x}, ${head.y}) but none found`,
    };
  }

  /**
   * Verify no self-collision exists.
   * @param {{ x: number, y: number }} head
   * @param {{ x: number, y: number }[]} body
   * @returns {{ passed: boolean, message: string }}
   */
  assertNoSelfCollision(head, body) {
    const collides = body.some(seg => seg.x === head.x && seg.y === head.y);
    return {
      passed: !collides,
      message: !collides
        ? `✓ No self-collision at (${head.x}, ${head.y})`
        : `✗ Unexpected self-collision at (${head.x}, ${head.y})`,
    };
  }

  /**
   * Verify entity-entity collision (two positions overlap).
   * @param {{ x: number, y: number }} a
   * @param {{ x: number, y: number }} b
   * @returns {{ passed: boolean, message: string }}
   */
  assertEntityCollision(a, b) {
    const collides = a.x === b.x && a.y === b.y;
    return {
      passed: collides,
      message: collides
        ? `✓ Entity collision at (${a.x}, ${a.y})`
        : `✗ Expected collision between (${a.x}, ${a.y}) and (${b.x}, ${b.y})`,
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §6. DETERMINISTIC RNG (Seedable PRNG for Reproducible Scenarios)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * DeterministicRNG — a seedable linear congruential generator for
 * reproducible test scenarios. Uses the Numerical Recipes LCG parameters.
 *
 * "Randomness in tests is just a bug you haven't reproduced yet."
 *   — Dr. Schneider, ICST 2024 Keynote
 */
class DeterministicRNG {
  #state;

  constructor(seed = 42) {
    this.#state = seed;
  }

  next() {
    this.#state = (this.#state * 1664525 + 1013904223) & 0xFFFFFFFF;
    return (this.#state >>> 0) / 0xFFFFFFFF;
  }

  /** Returns a bound function for injection into APIs expecting () => number */
  get generator() {
    return () => this.next();
  }

  /** Generate an integer in [min, max) */
  nextInt(min, max) {
    return min + Math.floor(this.next() * (max - min));
  }

  /** Reset to initial seed for scenario replay. */
  reset(seed) {
    this.#state = seed ?? 42;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §7. TEST CASE FACTORY INFRASTRUCTURE
//      — because hand-writing test functions is artisanal and unscalable
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * AbstractTestCaseFactory — base class for producing TestCase instances.
 * Subclasses override createScenarios() to yield domain-specific test vectors.
 *
 * The Factory Method pattern ensures each test domain encapsulates its own
 * scenario generation logic, preventing the God Object anti-pattern.
 */
class AbstractTestCaseFactory {
  /** @returns {Array<{ description: string, category: string, execute: () => { passed: boolean, message: string } }>} */
  createScenarios() {
    throw new Error('Subclasses must implement createScenarios() — ' +
      'the Template Method pattern requires it.');
  }
}

/**
 * TestSuiteOrchestrator — collects TestCases from multiple factories,
 * executes them, and produces a structured report with category breakdowns.
 *
 * Follows the Composite + Iterator patterns for maximum architectural purity.
 */
class TestSuiteOrchestrator {
  /** @type {Array<{ description: string, category: string, execute: Function }>} */
  #cases = [];
  #suiteName;
  #expectedTotal;

  /**
   * @param {string} suiteName - Display name for the test suite
   * @param {number} [expectedTotal] - If set, an invariant violation is raised if total !== expected
   */
  constructor(suiteName = 'Test Suite', expectedTotal = undefined) {
    this.#suiteName = suiteName;
    this.#expectedTotal = expectedTotal;
  }

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
    const categoryResults = new Map();

    console.log('');
    console.log('╔' + '═'.repeat(63) + '╗');
    console.log('║  ' + this.#suiteName.padEnd(60) + '║');
    console.log('╚' + '═'.repeat(63) + '╝');
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
          console.log(`      → ${result.message}`);
        }
        // Track per-category
        if (!categoryResults.has(tc.category)) {
          categoryResults.set(tc.category, { passed: 0, failed: 0 });
        }
        const cat = categoryResults.get(tc.category);
        result.passed ? cat.passed++ : cat.failed++;
      } catch (err) {
        failed++;
        failures.push({ description: tc.description, message: `EXCEPTION: ${err.message}` });
        console.log(`    ✗ ${tc.description} [EXCEPTION]`);
        console.log(`      → ${err.message}`);
      }
    }

    const total = passed + failed;

    // Category breakdown
    console.log('\n  ── Summary by Category ' + '─'.repeat(38));
    for (const [category, result] of categoryResults) {
      const status = result.failed === 0 ? '✓' : '✗';
      console.log(`    ${status} ${category}: ${result.passed}/${result.passed + result.failed}`);
    }

    console.log(`\n  Total: ${passed}/${total} passed, ${failed} failed`);

    // Invariant check
    if (this.#expectedTotal !== undefined && total !== this.#expectedTotal) {
      console.log(`\n  ⚠ INVARIANT VIOLATION: Expected ${this.#expectedTotal} tests, found ${total}`);
      process.exit(2);
    }

    if (failed > 0) {
      console.log('\n  Failed tests:');
      for (const f of failures) {
        console.log(`    ✗ ${f.description}: ${f.message}`);
      }
      process.exit(1);
    }

    console.log('\n  All tests passed. The architecture holds.\n');
    return { passed, failed, total, categoryResults };
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §8. GAME TEST HARNESS FACTORY
//      — the Grand Unified Factory that wires everything together
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GameTestHarnessFactory — a Dependency Injection Container masquerading
 * as a factory, producing fully-wired test harness instances for any
 * grid-based game. Because manually constructing six collaborating objects
 * would be "too simple" and would deny us this beautiful class.
 *
 * @example
 *   const harness = GameTestHarnessFactory.create({ cols: 20, rows: 20 });
 *   const { canvas, ctx, input, grid, collisions, rng } = harness;
 */
class GameTestHarnessFactory {
  /**
   * @param {object} options
   * @param {number} [options.cols=20] - Grid columns
   * @param {number} [options.rows=20] - Grid rows
   * @param {number} [options.canvasWidth=400] - Canvas pixel width
   * @param {number} [options.canvasHeight=400] - Canvas pixel height
   * @param {number} [options.seed=42] - RNG seed for determinism
   * @returns {GameTestHarness}
   */
  static create({
    cols = 20,
    rows = 20,
    canvasWidth = 400,
    canvasHeight = 400,
    seed = 42,
  } = {}) {
    const canvas = new MockCanvas(canvasWidth, canvasHeight);
    const ctx = canvas._ctx;
    const recorder = canvas._recorder;
    const container = new MockDOMContainer();
    const input = new KeyboardInputSimulationEngine();
    const grid = new GridStateAssertionEngine(cols, rows);
    const collisions = new CollisionValidationOracle(grid);
    const rng = new DeterministicRNG(seed);

    return {
      canvas,
      ctx,
      recorder,
      container,
      input,
      grid,
      collisions,
      rng,
      /** Convenience: reset all mutable state for test isolation. */
      reset() {
        ctx.reset();
        input.reset();
        rng.reset(seed);
      },
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §9. MODULE EXPORTS
//      — the public API surface of the Unified Game Test Harness
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  // Assertion framework
  AbstractAssertionStrategyBase,
  AssertionStrategyFactoryProvider,
  assertionFactory,
  assert,

  // Canvas mocks
  CanvasOperationRecorder,
  MockCanvasRenderingContext2D,
  MockCanvas,
  MockDOMContainer,

  // Input simulation
  KeyboardInputSimulationEngine,

  // Grid state
  GridStateAssertionEngine,

  // Collision validation
  CollisionValidationOracle,

  // RNG
  DeterministicRNG,

  // Test infrastructure
  AbstractTestCaseFactory,
  TestSuiteOrchestrator,

  // Grand Unified Factory
  GameTestHarnessFactory,
};
