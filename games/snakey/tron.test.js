/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  Tron Trail Decay — Comprehensive Temporal Boundary Verification Suite      ║
 * ║  Schneider Test Protocol v2.0 — Temporal Systems Edition                    ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║  Author:  Dr. Schneider, Principal Architect (PhD ETH Zürich)               ║
 * ║  Pattern: TemporalBoundaryEpsilonVerificationOrchestratorMediator (TBEVOM)  ║
 * ║  Tests:   42 deterministic temporal boundary verification scenarios          ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 *
 * Architectural Note:
 *   The temporal decay boundary at T=7000ms constitutes a half-open interval
 *   discontinuity in the trail segment lifecycle state machine. This suite
 *   exercises the epsilon-neighbourhood of that boundary with surgical precision,
 *   as documented in Chapter 7 ("Temporal Boundary Conditions in Distributed
 *   Game State Machines") of my dissertation at ETH Zürich.
 *
 *   The epsilon pattern for float comparison is critical: JavaScript's IEEE 754
 *   double-precision representation introduces representational ambiguity at
 *   the nanosecond scale. We define TEMPORAL_EPSILON = 0.001ms as the minimum
 *   resolvable temporal quantum for decay boundary verification.
 *
 *   Test domains:
 *     I.    Exact Decay Boundary (T = 7000ms)
 *     II.   Pre-Boundary Epsilon Band (T = 6999ms, T = 6999.999ms)
 *     III.  Post-Boundary Epsilon Band (T = 7001ms, T = 7000.001ms)
 *     IV.   Concurrent Collision-During-Decay Linearizability
 *     V.    Unbounded Trail Array Growth Pressure
 *     VI.   Rapid Direction Changes at Decay Boundary
 *     VII.  Multi-Segment Temporal Ordering Invariants
 *
 *   "A temporal boundary you haven't tested with epsilon precision is a
 *    Heisenbug you haven't discovered yet." — Dr. Schneider, PODC 2024
 *
 * Run:  node games/snakey/tron.test.js
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
//  §1. MICRO-ASSERTION FRAMEWORK (Temporal Systems Edition)
//      Re-derived from the SnakeY Unified Test Harness for domain isolation.
//      Includes epsilon-aware floating-point comparison strategy.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * AbstractAssertionStrategyBase — the cornerstone of our verification pyramid.
 */
class AbstractAssertionStrategyBase {
  evaluate(actual, expected) {
    throw new Error('AbstractAssertionStrategyBase.evaluate() is abstract');
  }
}

/** StrictEqualityAssertionStrategy — delegates to === */
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

/** DeepEqualityAssertionStrategy — structural comparison via canonical JSON */
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

/** TruthyAssertionStrategy — verifies Boolean coercion to true */
class TruthyAssertionStrategy extends AbstractAssertionStrategyBase {
  evaluate(actual, _expected) {
    const passed = !!actual;
    return {
      passed,
      message: passed ? `✓ truthy` : `✗ Expected truthy, got ${JSON.stringify(actual)}`,
    };
  }
}

/** FalsyAssertionStrategy — verifies Boolean coercion to false */
class FalsyAssertionStrategy extends AbstractAssertionStrategyBase {
  evaluate(actual, _expected) {
    const passed = !actual;
    return {
      passed,
      message: passed ? `✓ falsy` : `✗ Expected falsy, got ${JSON.stringify(actual)}`,
    };
  }
}

/**
 * EpsilonTemporalAssertionStrategy — compares floating-point temporal values
 * within a configurable epsilon band. Essential for IEEE 754 boundary testing.
 *
 * As documented in my dissertation: "The half-open interval [T, T+ε) requires
 * comparison semantics that acknowledge the representational limits of double-
 * precision floating-point arithmetic in temporal domain verification."
 */
class EpsilonTemporalAssertionStrategy extends AbstractAssertionStrategyBase {
  /** @param {number} epsilon */
  constructor(epsilon = 0.001) {
    super();
    this._epsilon = epsilon;
  }

  evaluate(actual, expected) {
    const diff = Math.abs(actual - expected);
    const passed = diff < this._epsilon;
    return {
      passed,
      message: passed
        ? `✓ |${actual} - ${expected}| = ${diff} < ε(${this._epsilon})`
        : `✗ |${actual} - ${expected}| = ${diff} >= ε(${this._epsilon})`,
    };
  }
}

/**
 * AssertionStrategyFactoryProvider — produces the appropriate strategy
 * based on a discriminated union tag.
 */
class AssertionStrategyFactoryProvider {
  #strategyRegistry = new Map();

  constructor() {
    this.#strategyRegistry.set('eq', new StrictEqualityAssertionStrategy());
    this.#strategyRegistry.set('deep', new DeepEqualityAssertionStrategy());
    this.#strategyRegistry.set('truthy', new TruthyAssertionStrategy());
    this.#strategyRegistry.set('falsy', new FalsyAssertionStrategy());
    this.#strategyRegistry.set('epsilon', new EpsilonTemporalAssertionStrategy());
  }

  resolve(tag) {
    const strategy = this.#strategyRegistry.get(tag);
    if (!strategy) {
      throw new Error(`No assertion strategy registered for tag "${tag}".`);
    }
    return strategy;
  }
}

const assertionFactory = new AssertionStrategyFactoryProvider();

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
  falsy(actual) {
    return assertionFactory.resolve('falsy').evaluate(actual, undefined);
  },
  epsilon(actual, expected) {
    return assertionFactory.resolve('epsilon').evaluate(actual, expected);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  §2. TEST CASE FACTORY INFRASTRUCTURE
// ═══════════════════════════════════════════════════════════════════════════════

class AbstractTestCaseFactory {
  createScenarios() {
    throw new Error('Subclasses must implement createScenarios()');
  }
}

class TestSuiteOrchestrator {
  #cases = [];

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
    console.log('╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║  Tron Trail Decay Temporal Boundary Suite — Schneider Protocol   ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝');
    console.log('');

    let currentCategory = '';

    for (const tc of this.#cases) {
      if (tc.category !== currentCategory) {
        currentCategory = tc.category;
        console.log(`\n  ── ${currentCategory} ──`);
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
        failures.push({ description: tc.description, message: `THREW: ${err.message}` });
        console.log(`    ✗ ${tc.description}`);
        console.log(`      THREW: ${err.message}`);
      }
    }

    const total = passed + failed;
    console.log('\n' + '═'.repeat(69));
    console.log(`  TOTAL: ${total}  |  PASSED: ${passed}  |  FAILED: ${failed}`);
    console.log('═'.repeat(69));

    if (failures.length > 0) {
      console.log('\n  FAILURES:');
      for (const f of failures) {
        console.log(`    ✗ ${f.description}`);
        console.log(`      ${f.message}`);
      }
    }

    console.log('');
    if (failed > 0) process.exitCode = 1;
    return { total, passed, failed };
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §3. SYSTEM UNDER TEST — TemporalTrailSegmentManager
// ═══════════════════════════════════════════════════════════════════════════════

const {
  TrailDecayConfiguration,
  TemporalTrailSegment,
  TemporalTrailSegmentManager,
} = require('./tron.js');

/** TEMPORAL CONSTANTS — the decay boundary and its epsilon neighbourhood */
const DECAY_TTL_MS       = 7000;
const TEMPORAL_EPSILON    = 0.001;   // minimum resolvable temporal quantum


// ═══════════════════════════════════════════════════════════════════════════════
//  §4. DOMAIN I — Exact Decay Boundary (T = 7000ms)
//      The critical discontinuity point. Segments born at T=0 must be alive
//      at T<7000 and dead at T>=7000. This is the half-open interval [0, 7000).
// ═══════════════════════════════════════════════════════════════════════════════

class ExactDecayBoundaryTestCaseFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];

    // TC-TD-01: Single segment decays at exactly 7000ms
    tests.push({
      description: 'TC-TD-01: Single segment decays at exactly T=7000ms (half-open interval)',
      category: 'I. Exact Decay Boundary',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(DECAY_TTL_MS);
        return assert.eq(mgr.length, 0);
      },
    });

    // TC-TD-02: Multiple segments all born at T=0 all decay at T=7000
    tests.push({
      description: 'TC-TD-02: Multiple segments born at T=0 all decay at T=7000ms',
      category: 'I. Exact Decay Boundary',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        for (let i = 0; i < 10; i++) {
          mgr.addSegment(i, 0, 0);
        }
        mgr.tick(DECAY_TTL_MS);
        return assert.eq(mgr.length, 0);
      },
    });

    // TC-TD-03: Segment born at T=1000, decays at T=8000 (1000 + 7000)
    tests.push({
      description: 'TC-TD-03: Segment born at T=1000 decays at T=8000 (offset birth)',
      category: 'I. Exact Decay Boundary',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(3, 3, 1000);
        mgr.tick(7999);
        const aliveBeforeBoundary = mgr.length === 1;
        mgr.tick(8000);
        const deadAtBoundary = mgr.length === 0;
        return assert.truthy(aliveBeforeBoundary && deadAtBoundary);
      },
    });

    // TC-TD-04: Double-tick at decay boundary is idempotent
    tests.push({
      description: 'TC-TD-04: Double-tick at T=7000 is idempotent (no double-reap)',
      category: 'I. Exact Decay Boundary',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(DECAY_TTL_MS);
        mgr.tick(DECAY_TTL_MS);
        return assert.eq(mgr.length, 0);
      },
    });

    // TC-TD-05: Segment count is exactly correct across the boundary
    tests.push({
      description: 'TC-TD-05: Mixed-age segments — only expired ones are reaped',
      category: 'I. Exact Decay Boundary',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(0, 0, 0);     // born T=0, decays at T=7000
        mgr.addSegment(1, 0, 1000);  // born T=1000, decays at T=8000
        mgr.addSegment(2, 0, 3500);  // born T=3500, decays at T=10500
        mgr.tick(DECAY_TTL_MS);
        // Only the first segment (born T=0) should be reaped
        return assert.eq(mgr.length, 2);
      },
    });

    // TC-TD-06: All segments decay when clock advances far past boundary
    tests.push({
      description: 'TC-TD-06: All segments decay when clock jumps to T=100000',
      category: 'I. Exact Decay Boundary',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        for (let t = 0; t < 50; t++) {
          mgr.addSegment(t % 20, Math.floor(t / 20), t * 100);
        }
        mgr.tick(100000);
        return assert.eq(mgr.length, 0);
      },
    });

    return tests;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §5. DOMAIN II — Pre-Boundary Epsilon Band (just-before-decay)
//      T = 6999ms and T = 6999.999ms — segments MUST survive.
// ═══════════════════════════════════════════════════════════════════════════════

class PreBoundaryEpsilonBandTestCaseFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];

    // TC-TD-07: Segment survives at T=6999ms (1ms before decay)
    tests.push({
      description: 'TC-TD-07: Segment survives at T=6999ms (1ms pre-boundary)',
      category: 'II. Pre-Boundary Epsilon Band',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(6999);
        return assert.eq(mgr.length, 1);
      },
    });

    // TC-TD-08: Segment survives at T=6999.999ms (epsilon pre-boundary)
    tests.push({
      description: 'TC-TD-08: Segment survives at T=6999.999ms (ε pre-boundary)',
      category: 'II. Pre-Boundary Epsilon Band',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(6999.999);
        return assert.eq(mgr.length, 1);
      },
    });

    // TC-TD-09: Segment survives at T=7000 - TEMPORAL_EPSILON
    tests.push({
      description: 'TC-TD-09: Segment survives at T=(7000 - ε) where ε=0.001',
      category: 'II. Pre-Boundary Epsilon Band',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(DECAY_TTL_MS - TEMPORAL_EPSILON);
        return assert.eq(mgr.length, 1);
      },
    });

    // TC-TD-10: isOccupied returns true at T=6999
    tests.push({
      description: 'TC-TD-10: isOccupied(5,5) returns true at T=6999 (pre-decay)',
      category: 'II. Pre-Boundary Epsilon Band',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(6999);
        return assert.truthy(mgr.isOccupied(5, 5));
      },
    });

    // TC-TD-11: Multiple segments all survive at T=6999
    tests.push({
      description: 'TC-TD-11: 100 segments all survive at T=6999',
      category: 'II. Pre-Boundary Epsilon Band',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        for (let i = 0; i < 100; i++) {
          mgr.addSegment(i % 20, Math.floor(i / 20), 0);
        }
        mgr.tick(6999);
        return assert.eq(mgr.length, 100);
      },
    });

    return tests;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §6. DOMAIN III — Post-Boundary Epsilon Band (just-after-decay)
//      T = 7001ms and T = 7000.001ms — segments MUST be dead.
// ═══════════════════════════════════════════════════════════════════════════════

class PostBoundaryEpsilonBandTestCaseFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];

    // TC-TD-12: Segment is dead at T=7001ms (1ms post-boundary)
    tests.push({
      description: 'TC-TD-12: Segment is dead at T=7001ms (1ms post-boundary)',
      category: 'III. Post-Boundary Epsilon Band',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(7001);
        return assert.eq(mgr.length, 0);
      },
    });

    // TC-TD-13: Segment is dead at T=7000.001ms (epsilon post-boundary)
    tests.push({
      description: 'TC-TD-13: Segment is dead at T=7000.001ms (ε post-boundary)',
      category: 'III. Post-Boundary Epsilon Band',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(DECAY_TTL_MS + TEMPORAL_EPSILON);
        return assert.eq(mgr.length, 0);
      },
    });

    // TC-TD-14: isOccupied returns false at T=7001
    tests.push({
      description: 'TC-TD-14: isOccupied(5,5) returns false at T=7001 (post-decay)',
      category: 'III. Post-Boundary Epsilon Band',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(7001);
        return assert.falsy(mgr.isOccupied(5, 5));
      },
    });

    // TC-TD-15: No double-clear artifact at T=7001 after T=7000 reap
    tests.push({
      description: 'TC-TD-15: Sequential tick(7000) then tick(7001) — no residual state',
      category: 'III. Post-Boundary Epsilon Band',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(DECAY_TTL_MS);
        const afterExact = mgr.length;
        mgr.tick(7001);
        const afterPost = mgr.length;
        return assert.truthy(afterExact === 0 && afterPost === 0);
      },
    });

    // TC-TD-16: Transition across boundary — alive at 6999, dead at 7000
    tests.push({
      description: 'TC-TD-16: Boundary crossing — alive at T=6999, dead at T=7000',
      category: 'III. Post-Boundary Epsilon Band',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(6999);
        const aliveBefore = mgr.length === 1;
        mgr.tick(7000);
        const deadAfter = mgr.length === 0;
        return assert.truthy(aliveBefore && deadAfter);
      },
    });

    return tests;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §7. DOMAIN IV — Concurrent Collision-During-Decay Linearizability
//      When a collision query and a decay event coincide at the same tick,
//      the query must see the post-reap state (linearization point = reap).
// ═══════════════════════════════════════════════════════════════════════════════

class ConcurrentCollisionDuringDecayTestCaseFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];

    // TC-TD-17: Collision query after tick at decay boundary — segment gone
    tests.push({
      description: 'TC-TD-17: isOccupied after tick(7000) sees post-reap state',
      category: 'IV. Concurrent Collision-During-Decay',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(DECAY_TTL_MS);
        return assert.falsy(mgr.isOccupied(5, 5));
      },
    });

    // TC-TD-18: isOccupiedAt with decay time sees segment as dead
    tests.push({
      description: 'TC-TD-18: isOccupiedAt(5,5,7000) — temporal query at decay boundary',
      category: 'IV. Concurrent Collision-During-Decay',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        // Don't tick — query at a specific time
        return assert.falsy(mgr.isOccupiedAt(5, 5, DECAY_TTL_MS));
      },
    });

    // TC-TD-19: isOccupiedAt just before decay — segment visible
    tests.push({
      description: 'TC-TD-19: isOccupiedAt(5,5,6999) — segment visible pre-decay',
      category: 'IV. Concurrent Collision-During-Decay',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        return assert.truthy(mgr.isOccupiedAt(5, 5, 6999));
      },
    });

    // TC-TD-20: New segment added at same cell after decay — should be visible
    tests.push({
      description: 'TC-TD-20: Re-occupy cell after decay — new segment is visible',
      category: 'IV. Concurrent Collision-During-Decay',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(DECAY_TTL_MS);
        // Cell is now free — re-occupy it
        mgr.addSegment(5, 5, DECAY_TTL_MS);
        return assert.truthy(mgr.isOccupied(5, 5));
      },
    });

    // TC-TD-21: Collision with non-decayed segment while other segments decay
    tests.push({
      description: 'TC-TD-21: Partial decay — collision with surviving segment',
      category: 'IV. Concurrent Collision-During-Decay',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(0, 0, 0);     // decays at T=7000
        mgr.addSegment(1, 1, 5000);  // decays at T=12000
        mgr.tick(DECAY_TTL_MS);
        const deadCell = mgr.isOccupied(0, 0);
        const aliveCell = mgr.isOccupied(1, 1);
        return assert.truthy(!deadCell && aliveCell);
      },
    });

    // TC-TD-22: Rapid tick oscillation around boundary — collision consistency
    tests.push({
      description: 'TC-TD-22: Rapid tick oscillation [6999,7000,6999,7000] — state consistent',
      category: 'IV. Concurrent Collision-During-Decay',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(6999);
        const a1 = mgr.isOccupied(5, 5);  // true
        mgr.tick(DECAY_TTL_MS);
        const a2 = mgr.isOccupied(5, 5);  // false — segment reaped
        // Note: tick(6999) after tick(7000) does NOT resurrect the segment.
        // Once reaped, the segment is gone. The clock going "backwards"
        // does not undo the reap — this is not a time-travel system.
        mgr.tick(6999);
        const a3 = mgr.isOccupied(5, 5);  // still false
        return assert.truthy(a1 && !a2 && !a3);
      },
    });

    return tests;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §8. DOMAIN V — Unbounded Trail Array Growth Pressure
//      Verifies that the trail manager handles large segment counts without
//      pathological memory growth, and that decay properly bounds the array.
// ═══════════════════════════════════════════════════════════════════════════════

class UnboundedTrailGrowthTestCaseFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];

    // TC-TD-23: 10000 segments added at T=0, all decay at T=7000
    tests.push({
      description: 'TC-TD-23: 10000 segments born at T=0 — all decay at T=7000',
      category: 'V. Unbounded Trail Array Growth',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        for (let i = 0; i < 10000; i++) {
          mgr.addSegment(i % 100, Math.floor(i / 100), 0);
        }
        mgr.tick(DECAY_TTL_MS);
        return assert.eq(mgr.length, 0);
      },
    });

    // TC-TD-24: Steady-state growth — adding 1 segment per ms, decay bounds array
    tests.push({
      description: 'TC-TD-24: Steady-state: 1 segment/ms for 14000ms — bounded by TTL',
      category: 'V. Unbounded Trail Array Growth',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        // Simulate adding one segment per millisecond for 14 seconds
        for (let t = 0; t <= 14000; t++) {
          mgr.addSegment(t % 100, Math.floor(t / 100) % 100, t);
          mgr.tick(t);
        }
        // At T=14000, segments born before T=7000 are dead.
        // Segments from T=7001..T=14000 survive = 7000 segments
        return assert.eq(mgr.length, 7000);
      },
    });

    // TC-TD-25: Burst addition followed by single decay tick
    tests.push({
      description: 'TC-TD-25: Burst of 500 segments at T=0, tick at T=7000 clears all',
      category: 'V. Unbounded Trail Array Growth',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        for (let i = 0; i < 500; i++) {
          mgr.addSegment(i % 20, Math.floor(i / 20), 0);
        }
        mgr.tick(DECAY_TTL_MS);
        return assert.eq(mgr.length, 0);
      },
    });

    // TC-TD-26: Staggered births — partial decay leaves correct count
    tests.push({
      description: 'TC-TD-26: Staggered births every 1000ms — partial decay at T=7500',
      category: 'V. Unbounded Trail Array Growth',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        // Add segments at T=0, 1000, 2000, ..., 9000
        for (let t = 0; t <= 9000; t += 1000) {
          mgr.addSegment(t / 1000, 0, t);
        }
        mgr.tick(7500);
        // Dead: born at T=0 (age 7500 >= 7000), T=500 doesn't exist
        //       born at T=0 decays. Born at T=1000..T=9000 survive (ages 6500..0)
        // Wait: born at T=0 age=7500 >= 7000 → dead. T=1000 age=6500 < 7000 → alive
        // Survivors: T=1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000 = 9
        return assert.eq(mgr.length, 9);
      },
    });

    // TC-TD-27: Empty manager — tick does not throw
    tests.push({
      description: 'TC-TD-27: Tick on empty manager — no error, length stays 0',
      category: 'V. Unbounded Trail Array Growth',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.tick(0);
        mgr.tick(DECAY_TTL_MS);
        mgr.tick(100000);
        return assert.eq(mgr.length, 0);
      },
    });

    // TC-TD-28: Reset clears all segments and clock
    tests.push({
      description: 'TC-TD-28: reset() clears all segments — length returns to 0',
      category: 'V. Unbounded Trail Array Growth',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        for (let i = 0; i < 100; i++) {
          mgr.addSegment(i, 0, i * 10);
        }
        mgr.reset();
        return assert.eq(mgr.length, 0);
      },
    });

    return tests;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §9. DOMAIN VI — Rapid Direction Changes at Decay Boundary
//      Simulates rapid input events that produce new trail segments precisely
//      as older segments reach their decay threshold. Tests that segment
//      creation and reaping do not interfere.
// ═══════════════════════════════════════════════════════════════════════════════

class RapidDirectionChangeAtBoundaryTestCaseFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];

    const DIRECTIONS = [
      { dx: 1, dy: 0 },  // right
      { dx: 0, dy: 1 },  // down
      { dx: -1, dy: 0 }, // left
      { dx: 0, dy: -1 }, // up
    ];

    // TC-TD-29: Zig-zag path with segments decaying during creation
    tests.push({
      description: 'TC-TD-29: Zig-zag path — old segments decay while new ones are added',
      category: 'VI. Rapid Direction Changes at Boundary',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        let x = 10, y = 10;
        // Simulate 100 ticks at 100ms intervals with alternating directions
        for (let tick = 0; tick < 100; tick++) {
          const t = tick * 100;
          const dir = DIRECTIONS[tick % 4];
          x += dir.dx;
          y += dir.dy;
          mgr.addSegment(x, y, t);
          mgr.tick(t);
        }
        // At T=9900, segments born before T=2900 are dead
        // Segments from T=2900..T=9900 at 100ms intervals = 71 segments
        // But we also need to count: born at T=2900, age=7000 → dead!
        // So survivors: T=3000..T=9900 = 70 segments
        return assert.eq(mgr.length, 70);
      },
    });

    // TC-TD-30: Rapid direction reversals at exact decay tick
    tests.push({
      description: 'TC-TD-30: Direction reversal at T=7000 — new segment + decay in same tick',
      category: 'VI. Rapid Direction Changes at Boundary',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        // Old segment
        mgr.addSegment(5, 5, 0);
        // At T=7000: add new segment, then tick
        mgr.addSegment(6, 5, DECAY_TTL_MS);
        mgr.tick(DECAY_TTL_MS);
        // Old (5,5) born T=0 → age 7000 → dead
        // New (6,5) born T=7000 → age 0 → alive
        const oldDead = !mgr.isOccupied(5, 5);
        const newAlive = mgr.isOccupied(6, 5);
        return assert.truthy(oldDead && newAlive);
      },
    });

    // TC-TD-31: Spiral path with continuous decay
    tests.push({
      description: 'TC-TD-31: Spiral path over 200 ticks — decay maintains bounded length',
      category: 'VI. Rapid Direction Changes at Boundary',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        let x = 50, y = 50;
        const TICK_MS = 50;
        for (let tick = 0; tick < 200; tick++) {
          const t = tick * TICK_MS;
          const dir = DIRECTIONS[tick % 4];
          x += dir.dx;
          y += dir.dy;
          mgr.addSegment(x, y, t);
          mgr.tick(t);
        }
        // At T=9950 (199*50), segments older than T=2950 are dead
        // Segments at 50ms intervals: TTL=7000ms → max 7000/50=140 alive
        // Born at T=2950 → age=7000 → dead. T=3000..T=9950 = 140 alive
        return assert.eq(mgr.length, 140);
      },
    });

    // TC-TD-32: Single-tick burst — 50 segments added and one decays, same tick
    tests.push({
      description: 'TC-TD-32: 50 new segments + 1 decay in same tick(7000)',
      category: 'VI. Rapid Direction Changes at Boundary',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(0, 0, 0);  // will decay at T=7000
        for (let i = 1; i <= 50; i++) {
          mgr.addSegment(i, 0, DECAY_TTL_MS);  // born at T=7000
        }
        mgr.tick(DECAY_TTL_MS);
        return assert.eq(mgr.length, 50);
      },
    });

    return tests;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §10. DOMAIN VII — Multi-Segment Temporal Ordering Invariants
//       Verifies that the monotonic insertion invariant holds and that
//       segments are always reaped in FIFO order (oldest first).
// ═══════════════════════════════════════════════════════════════════════════════

class TemporalOrderingInvariantTestCaseFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];

    // TC-TD-33: Segments are reaped in FIFO order
    tests.push({
      description: 'TC-TD-33: FIFO reap — oldest segment dies first',
      category: 'VII. Temporal Ordering Invariants',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(1, 0, 0);
        mgr.addSegment(2, 0, 1000);
        mgr.addSegment(3, 0, 2000);
        mgr.tick(DECAY_TTL_MS);
        // Only (1,0) born at T=0 should be dead. (2,0) and (3,0) survive.
        const seg = mgr.segments;
        return assert.deep(
          seg.map(s => ({ x: s.x, y: s.y })),
          [{ x: 2, y: 0 }, { x: 3, y: 0 }]
        );
      },
    });

    // TC-TD-34: Progressive decay — each tick removes the next oldest
    tests.push({
      description: 'TC-TD-34: Progressive decay — 3 segments die one per second',
      category: 'VII. Temporal Ordering Invariants',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(1, 0, 0);
        mgr.addSegment(2, 0, 1000);
        mgr.addSegment(3, 0, 2000);

        mgr.tick(DECAY_TTL_MS);      // T=7000: (1,0) dies
        const after7000 = mgr.length;
        mgr.tick(8000);               // T=8000: (2,0) dies
        const after8000 = mgr.length;
        mgr.tick(9000);               // T=9000: (3,0) dies
        const after9000 = mgr.length;

        return assert.truthy(after7000 === 2 && after8000 === 1 && after9000 === 0);
      },
    });

    // TC-TD-35: Surviving segments maintain correct spatial positions
    tests.push({
      description: 'TC-TD-35: Post-reap survivors retain correct (x,y) positions',
      category: 'VII. Temporal Ordering Invariants',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(0, 0, 0);
        mgr.addSegment(1, 1, 2000);
        mgr.addSegment(2, 2, 4000);
        mgr.addSegment(3, 3, 6000);
        mgr.addSegment(4, 4, 8000);

        mgr.tick(10000);
        // Dead: T=0 (age 10000), T=2000 (age 8000), T=4000 (age 6000) — wait
        // T=0: age=10000 >= 7000 → dead
        // T=2000: age=8000 >= 7000 → dead
        // T=4000: age=6000 < 7000 → alive
        // T=6000: age=4000 < 7000 → alive
        // T=8000: age=2000 < 7000 → alive
        return assert.deep(
          mgr.segments.map(s => ({ x: s.x, y: s.y })),
          [{ x: 2, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 4 }]
        );
      },
    });

    // TC-TD-36: TemporalTrailSegment.hasDecayed boundary check
    tests.push({
      description: 'TC-TD-36: hasDecayed() — false at age 6999, true at age 7000',
      category: 'VII. Temporal Ordering Invariants',
      execute() {
        const seg = new TemporalTrailSegment(5, 5, 1000);
        const preBoundary = seg.hasDecayed(7999, DECAY_TTL_MS);  // age=6999
        const atBoundary = seg.hasDecayed(8000, DECAY_TTL_MS);   // age=7000
        return assert.truthy(!preBoundary && atBoundary);
      },
    });

    // TC-TD-37: Configuration validation — negative TTL throws
    tests.push({
      description: 'TC-TD-37: TrailDecayConfiguration(-1) throws RangeError',
      category: 'VII. Temporal Ordering Invariants',
      execute() {
        let threw = false;
        try {
          new TrailDecayConfiguration(-1);
        } catch (e) {
          threw = e instanceof RangeError;
        }
        return assert.truthy(threw);
      },
    });

    // TC-TD-38: Configuration validation — zero TTL throws
    tests.push({
      description: 'TC-TD-38: TrailDecayConfiguration(0) throws RangeError',
      category: 'VII. Temporal Ordering Invariants',
      execute() {
        let threw = false;
        try {
          new TrailDecayConfiguration(0);
        } catch (e) {
          threw = e instanceof RangeError;
        }
        return assert.truthy(threw);
      },
    });

    // TC-TD-39: Configuration validation — NaN TTL throws
    tests.push({
      description: 'TC-TD-39: TrailDecayConfiguration(NaN) throws RangeError',
      category: 'VII. Temporal Ordering Invariants',
      execute() {
        let threw = false;
        try {
          new TrailDecayConfiguration(NaN);
        } catch (e) {
          threw = e instanceof RangeError;
        }
        return assert.truthy(threw);
      },
    });

    // TC-TD-40: Configuration validation — Infinity TTL throws
    tests.push({
      description: 'TC-TD-40: TrailDecayConfiguration(Infinity) throws RangeError',
      category: 'VII. Temporal Ordering Invariants',
      execute() {
        let threw = false;
        try {
          new TrailDecayConfiguration(Infinity);
        } catch (e) {
          threw = e instanceof RangeError;
        }
        return assert.truthy(threw);
      },
    });

    // TC-TD-41: Custom TTL — decay at 3000ms instead of 7000ms
    tests.push({
      description: 'TC-TD-41: Custom TTL=3000ms — segment decays at T=3000',
      category: 'VII. Temporal Ordering Invariants',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(3000)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(2999);
        const alive = mgr.length === 1;
        mgr.tick(3000);
        const dead = mgr.length === 0;
        return assert.truthy(alive && dead);
      },
    });

    // TC-TD-42: TTL accessor returns configured value
    tests.push({
      description: 'TC-TD-42: ttlMs getter returns configured TTL value',
      category: 'VII. Temporal Ordering Invariants',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        return assert.eq(mgr.ttlMs, DECAY_TTL_MS);
      },
    });

    return tests;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §11. ORCHESTRATION — ENTRYPOINT
// ═══════════════════════════════════════════════════════════════════════════════

function main() {
  const orchestrator = new TestSuiteOrchestrator();

  orchestrator.registerFactories([
    new ExactDecayBoundaryTestCaseFactory(),
    new PreBoundaryEpsilonBandTestCaseFactory(),
    new PostBoundaryEpsilonBandTestCaseFactory(),
    new ConcurrentCollisionDuringDecayTestCaseFactory(),
    new UnboundedTrailGrowthTestCaseFactory(),
    new RapidDirectionChangeAtBoundaryTestCaseFactory(),
    new TemporalOrderingInvariantTestCaseFactory(),
  ]);

  const { total, passed, failed } = orchestrator.execute();

  if (total !== 42) {
    console.error(`\n  ⚠  INVARIANT VIOLATION: Expected 42 test cases, got ${total}.`);
    console.error('     The TestCaseFactory pipeline has a registration defect.\n');
    process.exitCode = 1;
  }

  return { total, passed, failed };
}

main();
