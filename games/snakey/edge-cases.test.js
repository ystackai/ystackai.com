/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  Tron Trail Decay — Pathological Temporal Edge-Case Verification Suite      ║
 * ║  Schneider Test Protocol v2.1 — Degenerate Boundary Conditions Edition     ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║  Author:  Dr. Schneider, Principal Architect (PhD ETH Zürich)              ║
 * ║  Pattern: DegenerateTemporalBoundaryExhaustionStrategyOracle (DTBESO)      ║
 * ║  Tests:   34 deterministic pathological edge-case verification scenarios   ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 *
 * Architectural Note:
 *   This suite complements trail.test.js (TENBOSF pattern) by probing the
 *   *pathological* edge cases that emerge at the intersection of temporal
 *   decay boundaries and degenerate game states. Where trail.test.js
 *   exercises the epsilon-neighbourhood of the 7000ms boundary with surgical
 *   precision, this suite explores the combinatorial space of:
 *
 *     XVI.   Simultaneous Birth-and-Death at the Same Cell
 *     XVII.  Zero-Width Temporal Window (add + immediate tick at boundary)
 *     XVIII. Non-Monotonic Clock Regression Resilience
 *     XIX.   Extreme Precision Boundary — 6.999s vs 7.000s vs 7.001s
 *     XX.    Collision Ghost Detection (query during reap window)
 *     XXI.   Reset-During-Wavefront Atomicity
 *
 *   These are the edge cases that emerge in production when the game loop
 *   timer stutters, when requestAnimationFrame delivers non-monotonic
 *   timestamps, and when collision detection races against decay reaping.
 *
 *   "The edge case that crashes production is never the one you tested —
 *    it's the one you assumed couldn't happen." — Dr. Schneider, SREcon 2025
 *
 * Run:  node games/snakey/edge-cases.test.js
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
//  §1. MICRO-ASSERTION FRAMEWORK (Pathological Edge-Case Edition)
//      Derived from the trail.test.js temporal assertion hierarchy with
//      additional support for exception-boundary verification strategies.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * AbstractPathologicalAssertionStrategyBase — root of the assertion
 * hierarchy for degenerate boundary condition verification.
 */
class AbstractPathologicalAssertionStrategyBase {
  evaluate(actual, expected) {
    throw new Error(
      'AbstractPathologicalAssertionStrategyBase.evaluate() is abstract'
    );
  }
}

class StrictEqualityPathologicalStrategy extends AbstractPathologicalAssertionStrategyBase {
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

class DeepStructuralPathologicalStrategy extends AbstractPathologicalAssertionStrategyBase {
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

class TruthyPathologicalStrategy extends AbstractPathologicalAssertionStrategyBase {
  evaluate(actual) {
    const passed = !!actual;
    return {
      passed,
      message: passed ? `✓ truthy` : `✗ Expected truthy, got ${JSON.stringify(actual)}`,
    };
  }
}

class FalsyPathologicalStrategy extends AbstractPathologicalAssertionStrategyBase {
  evaluate(actual) {
    const passed = !actual;
    return {
      passed,
      message: passed ? `✓ falsy` : `✗ Expected falsy, got ${JSON.stringify(actual)}`,
    };
  }
}

/**
 * PathologicalAssertionStrategyFactoryProvider — resolves assertion strategies
 * via tag-based discriminated union lookup. Implements the Service Locator
 * pattern (Fowler, PoEAA §18) for maximum decoupling of assertion semantics
 * from test scenario execution.
 */
class PathologicalAssertionStrategyFactoryProvider {
  #registry = new Map();

  constructor() {
    this.#registry.set('eq', new StrictEqualityPathologicalStrategy());
    this.#registry.set('deep', new DeepStructuralPathologicalStrategy());
    this.#registry.set('truthy', new TruthyPathologicalStrategy());
    this.#registry.set('falsy', new FalsyPathologicalStrategy());
  }

  resolve(tag) {
    const strategy = this.#registry.get(tag);
    if (!strategy) {
      throw new Error(`No pathological assertion strategy for tag "${tag}"`);
    }
    return strategy;
  }
}

const assertionFactory = new PathologicalAssertionStrategyFactoryProvider();

const check = {
  eq(actual, expected) { return assertionFactory.resolve('eq').evaluate(actual, expected); },
  deep(actual, expected) { return assertionFactory.resolve('deep').evaluate(actual, expected); },
  truthy(actual) { return assertionFactory.resolve('truthy').evaluate(actual); },
  falsy(actual) { return assertionFactory.resolve('falsy').evaluate(actual); },
};


// ═══════════════════════════════════════════════════════════════════════════════
//  §2. TEST INFRASTRUCTURE
// ═══════════════════════════════════════════════════════════════════════════════

class AbstractTestCaseFactory {
  createScenarios() {
    throw new Error('Subclasses must implement createScenarios()');
  }
}

class PathologicalEdgeCaseTestSuiteOrchestrator {
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
    console.log('║  Trail Decay Pathological Edge Cases — Schneider Protocol v2.1  ║');
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
//  §3. SYSTEM UNDER TEST
// ═══════════════════════════════════════════════════════════════════════════════

const {
  TrailDecayConfiguration,
  TemporalTrailSegment,
  TemporalTrailSegmentManager,
} = require('./tron.js');

const DECAY_TTL_MS    = 7000;
const TEMPORAL_EPSILON = 0.001;


// ═══════════════════════════════════════════════════════════════════════════════
//  §4. DOMAIN XVI — Simultaneous Birth-and-Death at the Same Cell
//      A new segment is born at a cell at the exact moment a previous segment
//      at that cell decays. This tests the atomicity of the reap-then-add
//      sequence and whether the collision query sees the correct state.
// ═══════════════════════════════════════════════════════════════════════════════

class SimultaneousBirthDeathTestCaseFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];

    // TC-EC-01: Same cell, old segment decays, new segment born at same tick
    tests.push({
      description: 'TC-EC-01: Cell (5,5) — old segment decays, new born at T=7000',
      category: 'XVI. Simultaneous Birth-and-Death',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);       // decays at T=7000
        mgr.addSegment(5, 5, 7000);    // born at T=7000
        mgr.tick(7000);
        // Old reaped, new survives → cell is occupied
        return check.truthy(mgr.isOccupied(5, 5));
      },
    });

    // TC-EC-02: Verify segment count is 1 (not 0 or 2)
    tests.push({
      description: 'TC-EC-02: After birth-death at same cell, exactly 1 segment remains',
      category: 'XVI. Simultaneous Birth-and-Death',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.addSegment(5, 5, DECAY_TTL_MS);
        mgr.tick(DECAY_TTL_MS);
        return check.eq(mgr.length, 1);
      },
    });

    // TC-EC-03: The surviving segment has the correct birth timestamp
    tests.push({
      description: 'TC-EC-03: Surviving segment has createdAtMs = 7000 (not 0)',
      category: 'XVI. Simultaneous Birth-and-Death',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.addSegment(5, 5, DECAY_TTL_MS);
        mgr.tick(DECAY_TTL_MS);
        return check.eq(mgr.segments[0].createdAtMs, DECAY_TTL_MS);
      },
    });

    // TC-EC-04: Triple overlap — two old segments decay, one new born
    tests.push({
      description: 'TC-EC-04: Two old segments at (5,5) decay, one new born — count = 1',
      category: 'XVI. Simultaneous Birth-and-Death',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.addSegment(5, 5, 500);     // also decays by T=7500
        mgr.addSegment(5, 5, 7500);    // new segment
        mgr.tick(7500);
        return check.eq(mgr.length, 1);
      },
    });

    // TC-EC-05: isOccupiedAt at exact death-birth moment
    tests.push({
      description: 'TC-EC-05: isOccupiedAt(5,5, 7000) — sees new segment, not old',
      category: 'XVI. Simultaneous Birth-and-Death',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);       // decayed at query time
        mgr.addSegment(5, 5, 7000);    // age 0 at query time → alive
        // isOccupiedAt checks liveness without ticking
        return check.truthy(mgr.isOccupiedAt(5, 5, 7000));
      },
    });

    return tests;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §5. DOMAIN XVII — Zero-Width Temporal Window
//      A segment is added and the clock immediately ticks to its exact decay
//      boundary in the same logical frame. This tests whether add+tick is
//      atomic or whether the segment can exist for zero time.
// ═══════════════════════════════════════════════════════════════════════════════

class ZeroWidthTemporalWindowTestCaseFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];

    // TC-EC-06: Add at T=0, immediately tick to T=7000 — zero-lifetime segment
    tests.push({
      description: 'TC-EC-06: Add at T=0, tick(7000) — segment has zero effective lifetime',
      category: 'XVII. Zero-Width Temporal Window',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(DECAY_TTL_MS);  // age = 7000 >= 7000 → immediate death
        return check.eq(mgr.length, 0);
      },
    });

    // TC-EC-07: Add and tick in same call — segment never visible to collision
    tests.push({
      description: 'TC-EC-07: Segment added and decayed in same tick — not visible to isOccupied',
      category: 'XVII. Zero-Width Temporal Window',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(DECAY_TTL_MS);
        return check.falsy(mgr.isOccupied(5, 5));
      },
    });

    // TC-EC-08: Add at T=7000 with TTL=0.001 — decays at T=7000.001
    tests.push({
      description: 'TC-EC-08: Born T=7000, TTL=0.001 — alive at T=7000, dead at T=7000.001',
      category: 'XVII. Zero-Width Temporal Window',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(0.001)
        );
        mgr.addSegment(5, 5, 7000);
        mgr.tick(7000);           // age = 0 < 0.001 → alive
        const alive = mgr.length === 1;
        mgr.tick(7000.001);       // age = 0.001 >= 0.001 → dead
        const dead = mgr.length === 0;
        return check.truthy(alive && dead);
      },
    });

    // TC-EC-09: 100 segments added and all die in the same tick
    tests.push({
      description: 'TC-EC-09: 100 segments born T=0, all die at single tick(7000)',
      category: 'XVII. Zero-Width Temporal Window',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        for (let i = 0; i < 100; i++) {
          mgr.addSegment(i % 10, Math.floor(i / 10), 0);
        }
        mgr.tick(DECAY_TTL_MS);
        return check.eq(mgr.length, 0);
      },
    });

    return tests;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §6. DOMAIN XVIII — Non-Monotonic Clock Regression Resilience
//      In real game loops, requestAnimationFrame can deliver non-monotonic
//      timestamps (browser tab switching, system sleep, timer coalescing).
//      The decay engine must handle clock regression gracefully — once a
//      segment is reaped, it stays reaped even if the clock goes backwards.
// ═══════════════════════════════════════════════════════════════════════════════

class NonMonotonicClockRegressionTestCaseFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];

    // TC-EC-10: Clock advances to 7000 (reap), then regresses to 6999
    tests.push({
      description: 'TC-EC-10: tick(7000) then tick(6999) — reaped segment stays dead',
      category: 'XVIII. Non-Monotonic Clock Regression',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(DECAY_TTL_MS);   // segment reaped
        mgr.tick(6999);            // clock regresses — reap is permanent
        return check.eq(mgr.length, 0);
      },
    });

    // TC-EC-11: Clock oscillation around boundary — segment dies and stays dead
    tests.push({
      description: 'TC-EC-11: Clock oscillation [6999, 7000, 6999.5, 7000.5] — dead after first 7000',
      category: 'XVIII. Non-Monotonic Clock Regression',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(6999);
        const a1 = mgr.length;  // 1 — alive
        mgr.tick(7000);
        const a2 = mgr.length;  // 0 — dead
        mgr.tick(6999.5);
        const a3 = mgr.length;  // 0 — still dead
        mgr.tick(7000.5);
        const a4 = mgr.length;  // 0 — still dead
        return check.truthy(a1 === 1 && a2 === 0 && a3 === 0 && a4 === 0);
      },
    });

    // TC-EC-12: New segment added during clock regression — survives correctly
    tests.push({
      description: 'TC-EC-12: New segment added after clock regression — not affected by old reap',
      category: 'XVIII. Non-Monotonic Clock Regression',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(DECAY_TTL_MS);      // old segment dies
        mgr.tick(6500);               // clock regresses
        mgr.addSegment(5, 5, 6500);   // new segment born during regression
        // The new segment has age = 6500 - 6500 = 0 at this tick,
        // so it should survive
        return check.eq(mgr.length, 1);
      },
    });

    // TC-EC-13: Clock regression to T=0 after T=7000 — empty trail stays empty
    tests.push({
      description: 'TC-EC-13: tick(7000) then tick(0) — reaped trail remains empty',
      category: 'XVIII. Non-Monotonic Clock Regression',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(DECAY_TTL_MS);
        mgr.tick(0);
        return check.eq(mgr.length, 0);
      },
    });

    return tests;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §7. DOMAIN XIX — Extreme Precision Boundary: 6.999s vs 7.000s vs 7.001s
//      The canonical temporal triplet. This domain exhaustively verifies the
//      three critical second-resolution boundary points with all possible
//      combinations of segment state, collision queries, and multi-segment
//      interactions.
// ═══════════════════════════════════════════════════════════════════════════════

class ExtremePrecisionBoundaryTestCaseFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];

    // TC-EC-14: Single segment — alive at 6999, dead at 7000, dead at 7001
    tests.push({
      description: 'TC-EC-14: Canonical triplet — alive@6999, dead@7000, dead@7001',
      category: 'XIX. Extreme Precision Boundary (6.999s/7.000s/7.001s)',
      execute() {
        const results = [6999, 7000, 7001].map(t => {
          const mgr = new TemporalTrailSegmentManager(
            new TrailDecayConfiguration(DECAY_TTL_MS)
          );
          mgr.addSegment(5, 5, 0);
          mgr.tick(t);
          return mgr.length;
        });
        return check.deep(results, [1, 0, 0]);
      },
    });

    // TC-EC-15: Sub-ms triplet — alive@6999.999, dead@7000.000, dead@7000.001
    tests.push({
      description: 'TC-EC-15: Sub-ms triplet — alive@6999.999, dead@7000.000, dead@7000.001',
      category: 'XIX. Extreme Precision Boundary (6.999s/7.000s/7.001s)',
      execute() {
        const results = [6999.999, 7000.000, 7000.001].map(t => {
          const mgr = new TemporalTrailSegmentManager(
            new TrailDecayConfiguration(DECAY_TTL_MS)
          );
          mgr.addSegment(5, 5, 0);
          mgr.tick(t);
          return mgr.length;
        });
        return check.deep(results, [1, 0, 0]);
      },
    });

    // TC-EC-16: Collision query triplet via isOccupied
    tests.push({
      description: 'TC-EC-16: isOccupied triplet — true@6999, false@7000, false@7001',
      category: 'XIX. Extreme Precision Boundary (6.999s/7.000s/7.001s)',
      execute() {
        const results = [6999, 7000, 7001].map(t => {
          const mgr = new TemporalTrailSegmentManager(
            new TrailDecayConfiguration(DECAY_TTL_MS)
          );
          mgr.addSegment(5, 5, 0);
          mgr.tick(t);
          return mgr.isOccupied(5, 5);
        });
        return check.deep(results, [true, false, false]);
      },
    });

    // TC-EC-17: isOccupiedAt triplet — no tick required
    tests.push({
      description: 'TC-EC-17: isOccupiedAt triplet — true@6999, false@7000, false@7001',
      category: 'XIX. Extreme Precision Boundary (6.999s/7.000s/7.001s)',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        const results = [6999, 7000, 7001].map(t =>
          mgr.isOccupiedAt(5, 5, t)
        );
        return check.deep(results, [true, false, false]);
      },
    });

    // TC-EC-18: Multi-segment boundary — 3 segments, one at each triplet point
    tests.push({
      description: 'TC-EC-18: 3 segments born at T=0,1,2 — triplet decay at T=7000,7001,7002',
      category: 'XIX. Extreme Precision Boundary (6.999s/7.000s/7.001s)',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(0, 0, 0);
        mgr.addSegment(1, 0, 1);
        mgr.addSegment(2, 0, 2);

        mgr.tick(6999);  // all alive (max age 6999)
        const at6999 = mgr.length;

        mgr.tick(7000);  // segment born T=0 dies (age 7000)
        const at7000 = mgr.length;

        mgr.tick(7001);  // segment born T=1 dies (age 7000)
        const at7001 = mgr.length;

        return check.truthy(at6999 === 3 && at7000 === 2 && at7001 === 1);
      },
    });

    // TC-EC-19: hasDecayed triplet — direct method verification
    tests.push({
      description: 'TC-EC-19: hasDecayed triplet — false@6999, true@7000, true@7001',
      category: 'XIX. Extreme Precision Boundary (6.999s/7.000s/7.001s)',
      execute() {
        const seg = new TemporalTrailSegment(5, 5, 0);
        const results = [6999, 7000, 7001].map(t =>
          seg.hasDecayed(t, DECAY_TTL_MS)
        );
        return check.deep(results, [false, true, true]);
      },
    });

    // TC-EC-20: Sub-ms hasDecayed triplet
    tests.push({
      description: 'TC-EC-20: hasDecayed sub-ms — false@6999.999, true@7000.000, true@7000.001',
      category: 'XIX. Extreme Precision Boundary (6.999s/7.000s/7.001s)',
      execute() {
        const seg = new TemporalTrailSegment(5, 5, 0);
        const results = [6999.999, 7000.000, 7000.001].map(t =>
          seg.hasDecayed(t, DECAY_TTL_MS)
        );
        return check.deep(results, [false, true, true]);
      },
    });

    return tests;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §8. DOMAIN XX — Collision Ghost Detection
//      A "ghost" is a segment that has been reaped but whose cell appears
//      occupied due to a query-reap race condition. This domain verifies
//      that no ghosts can exist after a tick() call — the post-tick state
//      is always consistent.
// ═══════════════════════════════════════════════════════════════════════════════

class CollisionGhostDetectionTestCaseFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];

    // TC-EC-21: After tick(7000), no ghost at decayed cell
    tests.push({
      description: 'TC-EC-21: No ghost — isOccupied(5,5) false after tick(7000)',
      category: 'XX. Collision Ghost Detection',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(DECAY_TTL_MS);
        return check.falsy(mgr.isOccupied(5, 5));
      },
    });

    // TC-EC-22: No ghost after mass decay — 1000 segments
    tests.push({
      description: 'TC-EC-22: No ghosts — 1000 segments reaped, random cell queries all false',
      category: 'XX. Collision Ghost Detection',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        for (let i = 0; i < 1000; i++) {
          mgr.addSegment(i % 50, Math.floor(i / 50), 0);
        }
        mgr.tick(DECAY_TTL_MS);

        // Query a sampling of cells that were occupied
        let ghostFound = false;
        for (let x = 0; x < 50; x++) {
          for (let y = 0; y < 20; y++) {
            if (mgr.isOccupied(x, y)) {
              ghostFound = true;
              break;
            }
          }
          if (ghostFound) break;
        }
        return check.falsy(ghostFound);
      },
    });

    // TC-EC-23: Ghost check during partial decay — only correct cells occupied
    tests.push({
      description: 'TC-EC-23: Partial decay — dead cells empty, alive cells occupied',
      category: 'XX. Collision Ghost Detection',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(0, 0, 0);      // decays at T=7000
        mgr.addSegment(1, 0, 3500);   // decays at T=10500
        mgr.addSegment(2, 0, 7000);   // decays at T=14000

        mgr.tick(7000);
        const deadCorrect = !mgr.isOccupied(0, 0);
        const alive1 = mgr.isOccupied(1, 0);
        const alive2 = mgr.isOccupied(2, 0);

        return check.truthy(deadCorrect && alive1 && alive2);
      },
    });

    // TC-EC-24: isOccupiedAt ghost check — no ghost at decay boundary
    tests.push({
      description: 'TC-EC-24: isOccupiedAt — no ghost at T=7000 for segment born T=0',
      category: 'XX. Collision Ghost Detection',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        // Don't tick — pure temporal query
        return check.falsy(mgr.isOccupiedAt(5, 5, DECAY_TTL_MS));
      },
    });

    return tests;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §9. DOMAIN XXI — Reset-During-Wavefront Atomicity
//      The reset() method clears all trail state. This domain verifies that
//      calling reset() during an active decay wavefront produces a clean
//      state with no residual segments or corrupted internal pointers.
// ═══════════════════════════════════════════════════════════════════════════════

class ResetDuringWavefrontAtomicityTestCaseFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];

    // TC-EC-25: Reset during active trail — all segments gone
    tests.push({
      description: 'TC-EC-25: reset() during active trail — length = 0',
      category: 'XXI. Reset-During-Wavefront Atomicity',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        for (let i = 0; i < 50; i++) {
          mgr.addSegment(i % 10, Math.floor(i / 10), i * 100);
        }
        mgr.tick(3000);
        mgr.reset();
        return check.eq(mgr.length, 0);
      },
    });

    // TC-EC-26: After reset, new segments work correctly
    tests.push({
      description: 'TC-EC-26: After reset(), new segments obey normal lifecycle',
      category: 'XXI. Reset-During-Wavefront Atomicity',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(3000);
        mgr.reset();

        // Start fresh
        mgr.addSegment(1, 1, 10000);
        mgr.tick(16999);  // age = 6999 < 7000 → alive
        const alive = mgr.length === 1;
        mgr.tick(17000);  // age = 7000 >= 7000 → dead
        const dead = mgr.length === 0;
        return check.truthy(alive && dead);
      },
    });

    // TC-EC-27: Reset at exact decay boundary — no partial reap leakage
    tests.push({
      description: 'TC-EC-27: reset() at T=7000 — no residual state from pre-reset segments',
      category: 'XXI. Reset-During-Wavefront Atomicity',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.addSegment(6, 6, 3500);
        mgr.reset();
        // After reset, no queries should find old segments
        const noGhost1 = !mgr.isOccupied(5, 5);
        const noGhost2 = !mgr.isOccupied(6, 6);
        const emptyLength = mgr.length === 0;
        return check.truthy(noGhost1 && noGhost2 && emptyLength);
      },
    });

    // TC-EC-28: Double reset — idempotent
    tests.push({
      description: 'TC-EC-28: Double reset() — idempotent, length stays 0',
      category: 'XXI. Reset-During-Wavefront Atomicity',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.reset();
        mgr.reset();
        return check.eq(mgr.length, 0);
      },
    });

    // TC-EC-29: Reset on empty manager — no error
    tests.push({
      description: 'TC-EC-29: reset() on empty manager — no error, length = 0',
      category: 'XXI. Reset-During-Wavefront Atomicity',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.reset();
        return check.eq(mgr.length, 0);
      },
    });

    // TC-EC-30: isOccupiedAt after reset with historical time — no ghost
    tests.push({
      description: 'TC-EC-30: isOccupiedAt(5,5, 3000) after reset — false (no historical ghost)',
      category: 'XXI. Reset-During-Wavefront Atomicity',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 0);
        mgr.tick(3000);
        // Before reset, the segment is alive at T=3000
        const aliveBeforeReset = mgr.isOccupiedAt(5, 5, 3000);
        mgr.reset();
        // After reset, no segment exists — even temporal queries return false
        const deadAfterReset = !mgr.isOccupiedAt(5, 5, 3000);
        return check.truthy(aliveBeforeReset && deadAfterReset);
      },
    });

    return tests;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §10. DOMAIN XXII — Boundary Arithmetic Edge Cases
//       Additional arithmetic edge cases that probe the >= comparison
//       with values constructed through operations that may introduce
//       floating-point representation artifacts.
// ═══════════════════════════════════════════════════════════════════════════════

class BoundaryArithmeticEdgeCaseTestCaseFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const tests = [];

    // TC-EC-31: Large birth timestamp — T=1e12, decay at T=1e12+7000
    tests.push({
      description: 'TC-EC-31: Large timestamps — born T=1e12, decay at T=1e12+7000',
      category: 'XXII. Boundary Arithmetic Edge Cases',
      execute() {
        const bigT = 1e12;
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, bigT);
        mgr.tick(bigT + 6999);
        const alive = mgr.length === 1;
        mgr.tick(bigT + 7000);
        const dead = mgr.length === 0;
        return check.truthy(alive && dead);
      },
    });

    // TC-EC-32: Very small TTL (0.01ms) — sub-ms lifecycle
    tests.push({
      description: 'TC-EC-32: TTL=0.01ms — alive at age 0.009, dead at age 0.010',
      category: 'XXII. Boundary Arithmetic Edge Cases',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(0.01)
        );
        mgr.addSegment(5, 5, 100);
        mgr.tick(100.009);  // age 0.009 < 0.01 → alive
        const alive = mgr.length === 1;
        mgr.tick(100.010);  // age 0.010 >= 0.01 → dead
        const dead = mgr.length === 0;
        return check.truthy(alive && dead);
      },
    });

    // TC-EC-33: Boundary via modular arithmetic — T = (7000 % 7001) + 6999
    tests.push({
      description: 'TC-EC-33: Boundary via modular arithmetic — (7000%7001)+6999 = 13999',
      category: 'XXII. Boundary Arithmetic Edge Cases',
      execute() {
        const constructedTime = (7000 % 7001) + 6999;  // 7000 + 6999 = 13999
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        mgr.addSegment(5, 5, 7000);   // born at T=7000
        mgr.tick(constructedTime);     // age = 13999 - 7000 = 6999 < 7000 → alive
        const alive = mgr.length === 1;
        mgr.tick(14000);               // age = 7000 >= 7000 → dead
        const dead = mgr.length === 0;
        return check.truthy(alive && dead);
      },
    });

    // TC-EC-34: Boundary crossing detection — segment count transition function
    tests.push({
      description: 'TC-EC-34: Segment count transition: 10→9→8→...→0 as segments cascade-decay',
      category: 'XXII. Boundary Arithmetic Edge Cases',
      execute() {
        const mgr = new TemporalTrailSegmentManager(
          new TrailDecayConfiguration(DECAY_TTL_MS)
        );
        // 10 segments born at T=0, 1000, 2000, ..., 9000
        for (let i = 0; i < 10; i++) {
          mgr.addSegment(i, 0, i * 1000);
        }

        // Verify count at each death boundary
        const expectedCounts = [];
        for (let i = 0; i < 10; i++) {
          mgr.tick(i * 1000 + DECAY_TTL_MS);
          expectedCounts.push(mgr.length);
        }
        // After T=7000: 9, T=8000: 8, ..., T=16000: 0
        return check.deep(expectedCounts, [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
      },
    });

    return tests;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  §11. ORCHESTRATION — ENTRYPOINT
// ═══════════════════════════════════════════════════════════════════════════════

function main() {
  const orchestrator = new PathologicalEdgeCaseTestSuiteOrchestrator();

  orchestrator.registerFactories([
    new SimultaneousBirthDeathTestCaseFactory(),
    new ZeroWidthTemporalWindowTestCaseFactory(),
    new NonMonotonicClockRegressionTestCaseFactory(),
    new ExtremePrecisionBoundaryTestCaseFactory(),
    new CollisionGhostDetectionTestCaseFactory(),
    new ResetDuringWavefrontAtomicityTestCaseFactory(),
    new BoundaryArithmeticEdgeCaseTestCaseFactory(),
  ]);

  const { total, passed, failed } = orchestrator.execute();

  if (total !== 34) {
    console.error(`\n  ⚠  INVARIANT VIOLATION: Expected 34 test cases, got ${total}.`);
    console.error('     The TestCaseFactory pipeline has a registration defect.\n');
    process.exitCode = 1;
  }

  return { total, passed, failed };
}

main();
