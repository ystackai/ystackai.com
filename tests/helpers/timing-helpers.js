/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  Timing & Race Condition Test Utilities — Temporal Verification Engine     ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║  Author:  Dr. Schneider, Principal Architect (PhD ETH Zürich)              ║
 * ║  Pattern: TemporalObserverSchedulerStrategyProxy (TOSSP)                   ║
 * ║  Module:  tests/helpers/timing-helpers.js                                  ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 *
 * Architectural Note:
 *   Time is the most insidious dimension of software. Race conditions,
 *   frame-timing glitches, and pause/resume state corruption hide in the
 *   temporal interstices between animation frames. This module provides
 *   deterministic control over requestAnimationFrame, setTimeout, and
 *   setInterval — the unholy trinity of browser timing APIs.
 *
 *   "Mocking time is like mocking God — you'd better get it exactly right,
 *    or everything falls apart on Sunday." — Dr. Schneider, JSConf EU 2024
 *
 * Usage:
 *   const { RequestAnimationFrameMock } = require('./tests/helpers/timing-helpers');
 *   const raf = new RequestAnimationFrameMock();
 *   raf.install(globalThis);
 *   // ... run animation code ...
 *   raf.tick(16.67);  // advance exactly one frame at 60fps
 *   raf.uninstall(globalThis);
 */

'use strict';

const {
  AbstractTestCaseFactory,
  assert,
} = require('./game-test-harness');


// ═══════════════════════════════════════════════════════════════════════════════
//  §1. requestAnimationFrame MOCK
//      — deterministic frame scheduling for animation testing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * RequestAnimationFrameMock — a fully deterministic replacement for
 * requestAnimationFrame and cancelAnimationFrame.
 *
 * Unlike the browser's rAF, this mock advances time only when you tell it to,
 * making frame-dependent logic fully reproducible. Each `tick()` call advances
 * the virtual clock and invokes all pending callbacks in registration order.
 *
 * Tracks: callback registration count, invocation count, cancellation count,
 * and the full history of frame timestamps for post-hoc verification.
 */
class RequestAnimationFrameMock {
  /** @type {Map<number, Function>} */
  #pendingCallbacks = new Map();
  /** @type {number} */
  #nextId = 1;
  /** @type {number} */
  #currentTime = 0;
  /** @type {number[]} */
  #frameTimestampHistory = [];
  /** @type {{ registered: number, invoked: number, cancelled: number }} */
  #stats = { registered: 0, invoked: 0, cancelled: 0 };
  /** @type {Function|null} - original rAF, saved during install */
  #originalRAF = null;
  /** @type {Function|null} */
  #originalCAF = null;

  /**
   * Register a callback — mirrors requestAnimationFrame semantics.
   * @param {Function} callback - Receives the current virtual timestamp
   * @returns {number} Frame request ID
   */
  requestAnimationFrame(callback) {
    const id = this.#nextId++;
    this.#pendingCallbacks.set(id, callback);
    this.#stats.registered++;
    return id;
  }

  /**
   * Cancel a pending callback — mirrors cancelAnimationFrame semantics.
   * @param {number} id
   */
  cancelAnimationFrame(id) {
    if (this.#pendingCallbacks.delete(id)) {
      this.#stats.cancelled++;
    }
  }

  /**
   * Advance the virtual clock by `deltaMs` and invoke all pending callbacks.
   * Callbacks registered during tick execution are NOT invoked until the
   * next tick — matching browser behavior.
   *
   * @param {number} [deltaMs=16.667] - Time to advance (default: ~60fps)
   * @returns {number} Number of callbacks invoked
   */
  tick(deltaMs = 16.667) {
    this.#currentTime += deltaMs;
    this.#frameTimestampHistory.push(this.#currentTime);

    // Snapshot current callbacks — new registrations during this tick
    // are deferred to the next tick (matching browser behavior)
    const currentBatch = new Map(this.#pendingCallbacks);
    this.#pendingCallbacks.clear();

    let invoked = 0;
    for (const [_id, callback] of currentBatch) {
      callback(this.#currentTime);
      this.#stats.invoked++;
      invoked++;
    }

    return invoked;
  }

  /**
   * Advance multiple frames at once.
   * @param {number} frameCount - Number of frames to advance
   * @param {number} [deltaMs=16.667] - Time per frame
   * @returns {number} Total callbacks invoked across all frames
   */
  tickFrames(frameCount, deltaMs = 16.667) {
    let totalInvoked = 0;
    for (let i = 0; i < frameCount; i++) {
      totalInvoked += this.tick(deltaMs);
    }
    return totalInvoked;
  }

  /**
   * Advance to a specific target time, invoking frames at the given interval.
   * @param {number} targetTime - Absolute virtual time to reach
   * @param {number} [frameInterval=16.667]
   * @returns {number} Number of frames advanced
   */
  advanceTo(targetTime, frameInterval = 16.667) {
    let frames = 0;
    while (this.#currentTime < targetTime) {
      const remaining = targetTime - this.#currentTime;
      this.tick(Math.min(remaining, frameInterval));
      frames++;
    }
    return frames;
  }

  /**
   * Install this mock onto a global-like object, replacing requestAnimationFrame
   * and cancelAnimationFrame.
   * @param {object} target - The global object (globalThis, window, etc.)
   */
  install(target) {
    this.#originalRAF = target.requestAnimationFrame;
    this.#originalCAF = target.cancelAnimationFrame;
    target.requestAnimationFrame = (cb) => this.requestAnimationFrame(cb);
    target.cancelAnimationFrame = (id) => this.cancelAnimationFrame(id);
  }

  /**
   * Uninstall the mock, restoring original functions.
   * @param {object} target
   */
  uninstall(target) {
    if (this.#originalRAF) target.requestAnimationFrame = this.#originalRAF;
    if (this.#originalCAF) target.cancelAnimationFrame = this.#originalCAF;
    this.#originalRAF = null;
    this.#originalCAF = null;
  }

  /** @returns {number} Current virtual timestamp */
  get currentTime() { return this.#currentTime; }

  /** @returns {number} Number of pending (uninvoked) callbacks */
  get pendingCount() { return this.#pendingCallbacks.size; }

  /** @returns {number[]} History of frame timestamps */
  get frameHistory() { return [...this.#frameTimestampHistory]; }

  /** @returns {{ registered: number, invoked: number, cancelled: number }} */
  get stats() { return { ...this.#stats }; }

  /** Full reset for test isolation. */
  reset() {
    this.#pendingCallbacks.clear();
    this.#nextId = 1;
    this.#currentTime = 0;
    this.#frameTimestampHistory.length = 0;
    this.#stats = { registered: 0, invoked: 0, cancelled: 0 };
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §2. setTimeout / setInterval MOCK
//      — because setTimeout(fn, 0) doesn't actually mean "immediately"
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TimerMock — a deterministic replacement for setTimeout, clearTimeout,
 * setInterval, and clearInterval. Time advances only via explicit `advance()`
 * calls, making all timer-dependent code fully deterministic.
 */
class TimerMock {
  /** @type {Map<number, { callback: Function, fireAt: number, interval: number|null, type: string }>} */
  #timers = new Map();
  #nextId = 1;
  #currentTime = 0;
  #originalSetTimeout = null;
  #originalClearTimeout = null;
  #originalSetInterval = null;
  #originalClearInterval = null;

  setTimeout(callback, delay = 0) {
    const id = this.#nextId++;
    this.#timers.set(id, {
      callback,
      fireAt: this.#currentTime + delay,
      interval: null,
      type: 'timeout',
    });
    return id;
  }

  clearTimeout(id) {
    this.#timers.delete(id);
  }

  setInterval(callback, interval) {
    const id = this.#nextId++;
    this.#timers.set(id, {
      callback,
      fireAt: this.#currentTime + interval,
      interval,
      type: 'interval',
    });
    return id;
  }

  clearInterval(id) {
    this.#timers.delete(id);
  }

  /**
   * Advance the virtual clock by `ms` milliseconds, firing any timers
   * whose scheduled time has been reached.
   *
   * @param {number} ms - Milliseconds to advance
   * @returns {number} Number of callbacks fired
   */
  advance(ms) {
    const targetTime = this.#currentTime + ms;
    let fired = 0;

    // Process timers in chronological order
    while (this.#currentTime < targetTime) {
      // Find the next timer to fire
      let nextFireAt = targetTime;
      for (const [_id, timer] of this.#timers) {
        if (timer.fireAt < nextFireAt) nextFireAt = timer.fireAt;
      }
      this.#currentTime = nextFireAt;

      // Fire all timers at this timestamp
      const toFire = [];
      for (const [id, timer] of this.#timers) {
        if (timer.fireAt <= this.#currentTime) {
          toFire.push([id, timer]);
        }
      }

      for (const [id, timer] of toFire) {
        timer.callback();
        fired++;

        if (timer.type === 'interval') {
          // Reschedule interval
          timer.fireAt = this.#currentTime + timer.interval;
        } else {
          // Remove one-shot timeout
          this.#timers.delete(id);
        }
      }
    }

    this.#currentTime = targetTime;
    return fired;
  }

  /**
   * Install onto a global-like object.
   * @param {object} target
   */
  install(target) {
    this.#originalSetTimeout = target.setTimeout;
    this.#originalClearTimeout = target.clearTimeout;
    this.#originalSetInterval = target.setInterval;
    this.#originalClearInterval = target.clearInterval;
    target.setTimeout = (cb, delay) => this.setTimeout(cb, delay);
    target.clearTimeout = (id) => this.clearTimeout(id);
    target.setInterval = (cb, interval) => this.setInterval(cb, interval);
    target.clearInterval = (id) => this.clearInterval(id);
  }

  /**
   * Uninstall, restoring original functions.
   * @param {object} target
   */
  uninstall(target) {
    if (this.#originalSetTimeout) target.setTimeout = this.#originalSetTimeout;
    if (this.#originalClearTimeout) target.clearTimeout = this.#originalClearTimeout;
    if (this.#originalSetInterval) target.setInterval = this.#originalSetInterval;
    if (this.#originalClearInterval) target.clearInterval = this.#originalClearInterval;
  }

  get currentTime() { return this.#currentTime; }
  get pendingCount() { return this.#timers.size; }

  reset() {
    this.#timers.clear();
    this.#nextId = 1;
    this.#currentTime = 0;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §3. FRAME TRANSITION INPUT TESTER
//      — what happens when input arrives between frame boundaries?
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * FrameTransitionInputTester — a test utility that simulates input events
 * arriving at precise points within the frame lifecycle:
 *
 *   - Before any frame callback fires (pre-frame)
 *   - During a frame callback (mid-frame)
 *   - After all frame callbacks have fired (post-frame)
 *   - Between two frame callbacks when multiple are pending
 *
 * This exposes race conditions where input handling depends on frame timing.
 */
class FrameTransitionInputTester {
  /** @type {RequestAnimationFrameMock} */
  #raf;
  /** @type {Array<{ phase: string, input: object, result: any }>} */
  #log = [];

  constructor(rafMock) {
    this.#raf = rafMock;
  }

  /**
   * Test input delivered before a frame tick.
   * @param {Function} inputFn - Function that delivers the input
   * @param {Function} frameFn - The frame callback being tested
   * @returns {{ inputDelivered: boolean, frameProcessedInput: boolean }}
   */
  testPreFrameInput(inputFn, frameFn) {
    let inputDelivered = false;
    let frameProcessedInput = false;
    let inputState = null;

    // Deliver input
    inputState = inputFn();
    inputDelivered = true;

    // Register and tick the frame
    this.#raf.requestAnimationFrame((timestamp) => {
      frameProcessedInput = frameFn(timestamp, inputState);
    });
    this.#raf.tick();

    const result = { inputDelivered, frameProcessedInput };
    this.#log.push({ phase: 'pre-frame', input: inputState, result });
    return result;
  }

  /**
   * Test input delivered during a frame callback (mid-frame).
   * @param {Function} inputFn - Function that delivers the input
   * @param {Function} frameFn - The frame callback
   * @returns {{ inputDuringFrame: boolean, nextFrameSawInput: boolean }}
   */
  testMidFrameInput(inputFn, frameFn) {
    let inputDuringFrame = false;
    let nextFrameSawInput = false;
    let inputState = null;

    // First frame: deliver input during callback
    this.#raf.requestAnimationFrame((timestamp) => {
      frameFn(timestamp, null);
      inputState = inputFn();
      inputDuringFrame = true;
    });
    this.#raf.tick();

    // Second frame: check if input was captured
    this.#raf.requestAnimationFrame((timestamp) => {
      nextFrameSawInput = frameFn(timestamp, inputState);
    });
    this.#raf.tick();

    const result = { inputDuringFrame, nextFrameSawInput };
    this.#log.push({ phase: 'mid-frame', input: inputState, result });
    return result;
  }

  /**
   * Test input delivered after all frame callbacks complete (post-frame).
   * @param {Function} inputFn
   * @param {Function} frameFn
   * @returns {{ inputAfterFrame: boolean, nextFrameSawInput: boolean }}
   */
  testPostFrameInput(inputFn, frameFn) {
    let inputAfterFrame = false;
    let nextFrameSawInput = false;
    let inputState = null;

    // First frame
    this.#raf.requestAnimationFrame((timestamp) => {
      frameFn(timestamp, null);
    });
    this.#raf.tick();

    // Input arrives after the frame
    inputState = inputFn();
    inputAfterFrame = true;

    // Second frame
    this.#raf.requestAnimationFrame((timestamp) => {
      nextFrameSawInput = frameFn(timestamp, inputState);
    });
    this.#raf.tick();

    const result = { inputAfterFrame, nextFrameSawInput };
    this.#log.push({ phase: 'post-frame', input: inputState, result });
    return result;
  }

  get log() { return [...this.#log]; }

  reset() {
    this.#log.length = 0;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §4. PAUSE/RESUME STATE VALIDATOR
//      — because "paused" is a state, not a wish
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PauseResumeStateValidator — provides test assertions for verifying
 * correct pause/resume behavior in game loops. Checks that:
 *
 *   - Game state is frozen during pause (no ticks advance)
 *   - Input is correctly buffered or ignored during pause
 *   - Resume restores the correct pre-pause state
 *   - Rapid pause/resume toggling doesn't corrupt state
 *   - Pause during frame transition is handled gracefully
 */
class PauseResumeStateValidator {
  /**
   * Verify that state doesn't change during pause.
   * @param {Function} getState - Returns the current game state snapshot
   * @param {Function} pauseFn - Pauses the game
   * @param {Function} tickFn - Attempts to advance one game tick
   * @returns {{ passed: boolean, message: string }}
   */
  static assertFrozenDuringPause(getState, pauseFn, tickFn) {
    const beforePause = JSON.stringify(getState());
    pauseFn();
    // Attempt several ticks while paused
    for (let i = 0; i < 10; i++) tickFn();
    const afterTicks = JSON.stringify(getState());
    const passed = beforePause === afterTicks;
    return {
      passed,
      message: passed
        ? '✓ State frozen during pause'
        : `✗ State changed during pause: before=${beforePause}, after=${afterTicks}`,
    };
  }

  /**
   * Verify that resume restores interactive state.
   * @param {Function} getPhase - Returns current game phase string
   * @param {Function} pauseFn
   * @param {Function} resumeFn
   * @param {string} expectedResumePhase
   * @returns {{ passed: boolean, message: string }}
   */
  static assertResumeRestoresPhase(getPhase, pauseFn, resumeFn, expectedResumePhase = 'playing') {
    pauseFn();
    const pausedPhase = getPhase();
    resumeFn();
    const resumedPhase = getPhase();
    const passed = resumedPhase === expectedResumePhase;
    return {
      passed,
      message: passed
        ? `✓ Resume restored phase to "${expectedResumePhase}" (was "${pausedPhase}")`
        : `✗ Expected phase "${expectedResumePhase}" after resume, got "${resumedPhase}"`,
    };
  }

  /**
   * Verify rapid pause/resume toggling doesn't corrupt state.
   * @param {Function} getState
   * @param {Function} togglePauseFn - Toggles pause on/off
   * @param {number} [toggleCount=20]
   * @returns {{ passed: boolean, message: string }}
   */
  static assertRapidToggleStability(getState, togglePauseFn, toggleCount = 20) {
    const initial = JSON.stringify(getState());

    for (let i = 0; i < toggleCount; i++) {
      togglePauseFn();
    }

    // After even number of toggles, should be back to original state
    if (toggleCount % 2 === 0) {
      const final = JSON.stringify(getState());
      const passed = initial === final;
      return {
        passed,
        message: passed
          ? `✓ State stable after ${toggleCount} rapid toggles`
          : `✗ State corrupted after ${toggleCount} toggles`,
      };
    }

    // Odd toggles: just verify no crash
    return { passed: true, message: `✓ Survived ${toggleCount} rapid toggles without crash` };
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §5. WINDOW RESIZE MID-GAME HANDLER
//      — simulating viewport changes during active gameplay
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * WindowResizeSimulator — generates synthetic resize events and verifies
 * that the game correctly adapts its canvas dimensions, viewport scaling,
 * and game state during and after resize.
 */
class WindowResizeSimulator {
  /** @type {Array<{ width: number, height: number, timestamp: number }>} */
  #resizeHistory = [];
  #timestamp = 0;

  /**
   * Create a synthetic resize event.
   * @param {number} width - New window/viewport width
   * @param {number} height - New window/viewport height
   * @returns {{ type: string, target: { innerWidth: number, innerHeight: number } }}
   */
  createResizeEvent(width, height) {
    this.#timestamp += 16;
    const event = {
      type: 'resize',
      target: { innerWidth: width, innerHeight: height },
      timestamp: this.#timestamp,
    };
    this.#resizeHistory.push({ width, height, timestamp: this.#timestamp });
    return event;
  }

  /**
   * Simulate a rapid sequence of resize events (e.g., user dragging window edge).
   * @param {{ width: number, height: number }[]} sizes - Sequence of sizes
   * @param {number} [intervalMs=16] - Time between resize events
   * @returns {object[]} Array of synthetic resize events
   */
  rapidResizeSequence(sizes, intervalMs = 16) {
    return sizes.map(({ width, height }) => {
      this.#timestamp += intervalMs;
      const event = this.createResizeEvent(width, height);
      return event;
    });
  }

  /**
   * Verify canvas dimensions match expected values after resize.
   * @param {{ width: number, height: number }} canvas
   * @param {number} expectedWidth
   * @param {number} expectedHeight
   * @returns {{ passed: boolean, message: string }}
   */
  static assertCanvasDimensions(canvas, expectedWidth, expectedHeight) {
    const passed = canvas.width === expectedWidth && canvas.height === expectedHeight;
    return {
      passed,
      message: passed
        ? `✓ Canvas dimensions ${canvas.width}×${canvas.height} match expected`
        : `✗ Canvas ${canvas.width}×${canvas.height}, expected ${expectedWidth}×${expectedHeight}`,
    };
  }

  /**
   * Verify that game grid dimensions are preserved after canvas resize.
   * (Grid cell count should not change; only pixel size per cell changes.)
   * @param {{ cols: number, rows: number }} gridBefore
   * @param {{ cols: number, rows: number }} gridAfter
   * @returns {{ passed: boolean, message: string }}
   */
  static assertGridPreserved(gridBefore, gridAfter) {
    const passed = gridBefore.cols === gridAfter.cols && gridBefore.rows === gridAfter.rows;
    return {
      passed,
      message: passed
        ? `✓ Grid ${gridBefore.cols}×${gridBefore.rows} preserved after resize`
        : `✗ Grid changed from ${gridBefore.cols}×${gridBefore.rows} to ${gridAfter.cols}×${gridAfter.rows}`,
    };
  }

  get resizeHistory() { return [...this.#resizeHistory]; }

  reset() {
    this.#resizeHistory.length = 0;
    this.#timestamp = 0;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §6. TIMING TEST CASE GENERATORS
//      — pre-built test factories for common timing scenarios
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * RAFBehaviorTestGenerator — produces test cases that verify the
 * RequestAnimationFrameMock itself behaves correctly. Meta-tests: the
 * tests that test the test infrastructure.
 *
 * "Who watches the watchmen? The meta-test suite, obviously."
 *   — Dr. Schneider
 */
class RAFBehaviorTestGenerator extends AbstractTestCaseFactory {
  createScenarios() {
    const category = 'rAF Mock Behavior';
    const scenarios = [];

    scenarios.push({
      description: 'TC-TM-01: Callback receives correct timestamp after tick',
      category,
      execute: () => {
        const raf = new RequestAnimationFrameMock();
        let receivedTime = -1;
        raf.requestAnimationFrame((t) => { receivedTime = t; });
        raf.tick(16.667);
        return assert.eq(receivedTime, 16.667);
      },
    });

    scenarios.push({
      description: 'TC-TM-02: Multiple ticks accumulate time correctly',
      category,
      execute: () => {
        const raf = new RequestAnimationFrameMock();
        let receivedTime = -1;
        raf.tick(16.667);
        raf.requestAnimationFrame((t) => { receivedTime = t; });
        raf.tick(16.667);
        return assert.eq(receivedTime, 33.334);
      },
    });

    scenarios.push({
      description: 'TC-TM-03: cancelAnimationFrame prevents callback invocation',
      category,
      execute: () => {
        const raf = new RequestAnimationFrameMock();
        let called = false;
        const id = raf.requestAnimationFrame(() => { called = true; });
        raf.cancelAnimationFrame(id);
        raf.tick();
        return assert.falsy(called);
      },
    });

    scenarios.push({
      description: 'TC-TM-04: Callbacks registered during tick are deferred to next tick',
      category,
      execute: () => {
        const raf = new RequestAnimationFrameMock();
        let innerCalled = false;
        raf.requestAnimationFrame(() => {
          // Register a new callback during this frame's execution
          raf.requestAnimationFrame(() => { innerCalled = true; });
        });
        raf.tick();
        // Inner callback should NOT have been called yet
        const afterFirstTick = innerCalled;
        raf.tick();
        // Now it should be called
        return assert.truthy(!afterFirstTick && innerCalled);
      },
    });

    scenarios.push({
      description: 'TC-TM-05: tickFrames advances the correct number of frames',
      category,
      execute: () => {
        const raf = new RequestAnimationFrameMock();
        let callCount = 0;
        // Each tick, register a new callback (simulating a game loop)
        const loop = () => {
          raf.requestAnimationFrame(() => {
            callCount++;
            loop();
          });
        };
        loop();
        raf.tickFrames(10);
        return assert.eq(callCount, 10);
      },
    });

    scenarios.push({
      description: 'TC-TM-06: advanceTo reaches target time with correct frame count',
      category,
      execute: () => {
        const raf = new RequestAnimationFrameMock();
        let lastTime = 0;
        const loop = () => {
          raf.requestAnimationFrame((t) => {
            lastTime = t;
            loop();
          });
        };
        loop();
        const frames = raf.advanceTo(100, 16.667);
        // Should have advanced ~6 frames (100 / 16.667 ≈ 6)
        return assert.truthy(frames >= 6 && frames <= 7);
      },
    });

    scenarios.push({
      description: 'TC-TM-07: Stats track registrations, invocations, and cancellations',
      category,
      execute: () => {
        const raf = new RequestAnimationFrameMock();
        raf.requestAnimationFrame(() => {});
        raf.requestAnimationFrame(() => {});
        const id = raf.requestAnimationFrame(() => {});
        raf.cancelAnimationFrame(id);
        raf.tick();
        const s = raf.stats;
        return assert.truthy(s.registered === 3 && s.invoked === 2 && s.cancelled === 1);
      },
    });

    scenarios.push({
      description: 'TC-TM-08: Frame history records all tick timestamps',
      category,
      execute: () => {
        const raf = new RequestAnimationFrameMock();
        raf.tick(16);
        raf.tick(16);
        raf.tick(16);
        return assert.deep(raf.frameHistory, [16, 32, 48]);
      },
    });

    return scenarios;
  }
}

/**
 * TimerMockBehaviorTestGenerator — meta-tests for the TimerMock.
 */
class TimerMockBehaviorTestGenerator extends AbstractTestCaseFactory {
  createScenarios() {
    const category = 'Timer Mock Behavior';
    const scenarios = [];

    scenarios.push({
      description: 'TC-TM-09: setTimeout fires after specified delay',
      category,
      execute: () => {
        const timer = new TimerMock();
        let fired = false;
        timer.setTimeout(() => { fired = true; }, 100);
        timer.advance(99);
        if (fired) return { passed: false, message: '✗ Fired too early' };
        timer.advance(1);
        return assert.truthy(fired);
      },
    });

    scenarios.push({
      description: 'TC-TM-10: setInterval fires repeatedly at correct intervals',
      category,
      execute: () => {
        const timer = new TimerMock();
        let count = 0;
        timer.setInterval(() => { count++; }, 50);
        timer.advance(250);
        return assert.eq(count, 5);
      },
    });

    scenarios.push({
      description: 'TC-TM-11: clearTimeout prevents callback from firing',
      category,
      execute: () => {
        const timer = new TimerMock();
        let fired = false;
        const id = timer.setTimeout(() => { fired = true; }, 100);
        timer.clearTimeout(id);
        timer.advance(200);
        return assert.falsy(fired);
      },
    });

    scenarios.push({
      description: 'TC-TM-12: clearInterval stops repeated firing',
      category,
      execute: () => {
        const timer = new TimerMock();
        let count = 0;
        const id = timer.setInterval(() => { count++; }, 50);
        timer.advance(125); // Should fire twice (at 50 and 100)
        timer.clearInterval(id);
        timer.advance(200); // Should not fire any more
        return assert.eq(count, 2);
      },
    });

    scenarios.push({
      description: 'TC-TM-13: Multiple timers fire in chronological order',
      category,
      execute: () => {
        const timer = new TimerMock();
        const order = [];
        timer.setTimeout(() => order.push('B'), 200);
        timer.setTimeout(() => order.push('A'), 100);
        timer.setTimeout(() => order.push('C'), 300);
        timer.advance(300);
        return assert.deep(order, ['A', 'B', 'C']);
      },
    });

    return scenarios;
  }
}

/**
 * PauseResumeTestGenerator — produces test scenarios for pause/resume
 * behavior using injected game lifecycle hooks.
 *
 * @param {object} options
 * @param {Function} options.createGame - Factory that returns a game-like object
 * @param {Function} options.getState - Returns serializable state snapshot
 * @param {Function} options.getPhase - Returns current phase string
 * @param {Function} options.pause - Pauses the game
 * @param {Function} options.resume - Resumes the game
 * @param {Function} options.tick - Advances one game tick
 * @param {Function} options.togglePause - Toggles pause
 */
class PauseResumeTestGenerator extends AbstractTestCaseFactory {
  #opts;

  constructor(opts) {
    super();
    this.#opts = opts;
  }

  createScenarios() {
    const scenarios = [];
    const category = 'Pause/Resume State Integrity';
    const o = this.#opts;

    scenarios.push({
      description: 'TC-PR-01: Game state frozen during pause',
      category,
      execute: () => {
        o.createGame();
        return PauseResumeStateValidator.assertFrozenDuringPause(
          o.getState, o.pause, o.tick
        );
      },
    });

    scenarios.push({
      description: 'TC-PR-02: Resume restores playing phase',
      category,
      execute: () => {
        o.createGame();
        return PauseResumeStateValidator.assertResumeRestoresPhase(
          o.getPhase, o.pause, o.resume, 'playing'
        );
      },
    });

    scenarios.push({
      description: 'TC-PR-03: Rapid toggle stability (20 toggles)',
      category,
      execute: () => {
        o.createGame();
        return PauseResumeStateValidator.assertRapidToggleStability(
          o.getState, o.togglePause, 20
        );
      },
    });

    return scenarios;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §7. COMPOSITE TIMING TEST SUITE FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * CompositeTimingTestSuiteFactory — creates and wires all timing-related
 * test generators. The meta-tests (rAF and Timer mock behavior) are always
 * included; game-specific pause/resume tests are optional.
 */
class CompositeTimingTestSuiteFactory {
  /**
   * @param {object} [options]
   * @param {object} [options.pauseResumeHooks] - If provided, includes pause/resume tests
   * @returns {{ generators: AbstractTestCaseFactory[] }}
   */
  static create(options = {}) {
    const generators = [
      new RAFBehaviorTestGenerator(),
      new TimerMockBehaviorTestGenerator(),
    ];

    if (options.pauseResumeHooks) {
      generators.push(new PauseResumeTestGenerator(options.pauseResumeHooks));
    }

    return { generators };
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §8. MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  // Core mocks
  RequestAnimationFrameMock,
  TimerMock,

  // Test utilities
  FrameTransitionInputTester,
  PauseResumeStateValidator,
  WindowResizeSimulator,

  // Test generators
  RAFBehaviorTestGenerator,
  TimerMockBehaviorTestGenerator,
  PauseResumeTestGenerator,

  // Composite factory
  CompositeTimingTestSuiteFactory,
};
