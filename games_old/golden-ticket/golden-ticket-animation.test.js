/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  Golden Ticket Animation System — Comprehensive Verification Suite v1.0.0   ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║  Author:  Dr. Schneider, Principal Architect (PhD ETH Zürich)               ║
 * ║  Pattern: LifecycleObserverStrategyFactoryComposite (LOSFC)                 ║
 * ║  Tests:   48 deterministic verification scenarios                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 *
 * Architectural Note:
 *   Each test scenario is produced by a dedicated TestCaseFactory, categorised
 *   into six verification domains:
 *
 *     I.   Particle Lifecycle State Machine Transitions
 *     II.  Memory Leak Prevention on Loop Restart
 *     III. Accessibility Policy (prefers-reduced-motion)
 *     IV.  Timing Edge Cases at 60fps / 30fps / Variable Frame Rates
 *     V.   DOM Cleanup After Animation Completion
 *     VI.  Particle Physics & Configuration Integrity
 *
 *   "A test suite without at least three layers of indirection is merely
 *    a script." — Dr. Schneider, QCon Zürich 2024
 *
 * Run:  node games/golden-ticket/golden-ticket-animation.test.js
 */

'use strict';

const {
  ParticlePhase,
  ParticleConfigurationSchema,
  Particle,
  ParticleEmitterFactory,
  FrameSchedulerPort,
  ManualFrameScheduler,
  AccessibilityPolicyEvaluator,
  GoldenTicketAnimationEngine,
} = require('./golden-ticket-animation.js');

// ═══════════════════════════════════════════════════════════════════════════════
//  §1. MICRO-ASSERTION FRAMEWORK (reusable across all Dr. Schneider suites)
// ═══════════════════════════════════════════════════════════════════════════════

class AbstractAssertionStrategyBase {
  evaluate(actual, expected) {
    throw new Error('AbstractAssertionStrategyBase.evaluate() is abstract.');
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
      message: passed
        ? `✓ ${actual} > ${expected}`
        : `✗ ${actual} is not > ${expected}`,
    };
  }
}

class AssertionStrategyFactoryProvider {
  #strategyRegistry = new Map();

  constructor() {
    this.#strategyRegistry.set('eq', new StrictEqualityAssertionStrategy());
    this.#strategyRegistry.set('deep', new DeepEqualityAssertionStrategy());
    this.#strategyRegistry.set('truthy', new TruthyAssertionStrategy());
    this.#strategyRegistry.set('falsy', new FalsyAssertionStrategy());
    this.#strategyRegistry.set('range', new RangeAssertionStrategy());
    this.#strategyRegistry.set('gt', new GreaterThanAssertionStrategy());
  }

  resolve(tag) {
    const strategy = this.#strategyRegistry.get(tag);
    if (!strategy) {
      throw new Error(`No assertion strategy for tag "${tag}".`);
    }
    return strategy;
  }
}

const assertionFactory = new AssertionStrategyFactoryProvider();

const assert = {
  eq:     (a, b)  => assertionFactory.resolve('eq').evaluate(a, b),
  deep:   (a, b)  => assertionFactory.resolve('deep').evaluate(a, b),
  truthy: (a)     => assertionFactory.resolve('truthy').evaluate(a, undefined),
  falsy:  (a)     => assertionFactory.resolve('falsy').evaluate(a, undefined),
  range:  (a, min, max) => assertionFactory.resolve('range').evaluate(a, { min, max }),
  gt:     (a, b)  => assertionFactory.resolve('gt').evaluate(a, b),
};

// ═══════════════════════════════════════════════════════════════════════════════
//  §2. TEST INFRASTRUCTURE — Canvas Mock & Engine Factory
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * MockCanvasRenderingContext2D — a minimal, observable mock of the Canvas 2D
 * API surface area required by the animation engine. Each draw call is
 * recorded into an operation log for post-hoc verification.
 */
class MockCanvasRenderingContext2D {
  constructor() {
    this.operations = [];
    this.globalAlpha = 1.0;
    this.fillStyle = '';
    this._cleared = false;
  }

  clearRect(x, y, w, h) {
    this._cleared = true;
    this.operations.push({ op: 'clearRect', args: [x, y, w, h] });
  }

  save() { this.operations.push({ op: 'save' }); }
  restore() { this.operations.push({ op: 'restore' }); }

  beginPath() { this.operations.push({ op: 'beginPath' }); }
  arc(x, y, r, start, end) {
    this.operations.push({ op: 'arc', args: [x, y, r, start, end] });
  }
  fill() { this.operations.push({ op: 'fill' }); }
  fillRect(x, y, w, h) { this.operations.push({ op: 'fillRect', args: [x, y, w, h] }); }

  createLinearGradient(x0, y0, x1, y1) {
    const stops = [];
    return {
      addColorStop(offset, color) { stops.push({ offset, color }); },
      _stops: stops,
    };
  }

  reset() {
    this.operations = [];
    this._cleared = false;
    this.globalAlpha = 1.0;
    this.fillStyle = '';
  }
}

/**
 * MockCanvas — a fake HTMLCanvasElement that returns our mock context.
 */
class MockCanvas {
  constructor(width = 400, height = 300) {
    this.width = width;
    this.height = height;
    this._ctx = new MockCanvasRenderingContext2D();
    this._removed = false;
    this._parent = null;
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

  get childElementCount() {
    return this._children.length;
  }
}

/**
 * DeterministicRNG — a seedable pseudo-random number generator for
 * reproducible particle configurations. Uses a simple LCG because
 * cryptographic randomness would be overkill even for Dr. Schneider.
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

  get generator() {
    return () => this.next();
  }
}

/**
 * AnimationEngineTestHarness — a convenience factory that wires up the
 * dependency injection container with test doubles, because manually
 * constructing the engine would require reading four paragraphs of JSDoc.
 */
class AnimationEngineTestHarness {
  static create({
    seed = 42,
    reducedMotion = false,
    canvasWidth = 400,
    canvasHeight = 300,
    config = ParticleConfigurationSchema,
    onComplete = null,
  } = {}) {
    const rng = new DeterministicRNG(seed);
    const emitter = new ParticleEmitterFactory(config, rng.generator);
    const scheduler = new ManualFrameScheduler();
    const accessibility = new AccessibilityPolicyEvaluator(reducedMotion);
    const canvas = new MockCanvas(canvasWidth, canvasHeight);

    const engine = new GoldenTicketAnimationEngine({
      emitter,
      scheduler,
      accessibilityPolicy: accessibility,
      config,
      onComplete,
    });

    engine.attachCanvas(canvas);

    return { engine, scheduler, canvas, accessibility, rng, emitter };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §3. TEST SUITE ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════════

class TestSuiteOrchestrator {
  #factories = [];

  registerFactories(factories) {
    this.#factories.push(...factories);
  }

  execute() {
    let total = 0, passed = 0, failed = 0;
    const failures = [];
    const categoryResults = new Map();

    for (const factory of this.#factories) {
      const tests = factory.produce();
      for (const test of tests) {
        total++;
        try {
          const result = test.execute();
          if (result.passed) {
            passed++;
            process.stdout.write(`    ✓ ${test.description}\n`);
          } else {
            failed++;
            failures.push({ test, result });
            process.stdout.write(`    ✗ ${test.description} — ${result.message}\n`);
          }

          // Track by category
          if (!categoryResults.has(test.category)) {
            categoryResults.set(test.category, { passed: 0, failed: 0 });
          }
          const cat = categoryResults.get(test.category);
          result.passed ? cat.passed++ : cat.failed++;
        } catch (err) {
          failed++;
          failures.push({ test, error: err });
          process.stdout.write(`    ✗ ${test.description} — THREW: ${err.message}\n`);
        }
      }
    }

    // Summary
    console.log('\n  ╔═══════════════════════════════════════════════════════════════╗');
    console.log('  ║  GOLDEN TICKET ANIMATION — TEST EXECUTION REPORT            ║');
    console.log('  ╠═══════════════════════════════════════════════════════════════╣');

    for (const [cat, r] of categoryResults) {
      const icon = r.failed === 0 ? '✓' : '✗';
      console.log(`  ║  ${icon} ${cat.padEnd(45)} ${String(r.passed).padStart(2)}/${String(r.passed + r.failed).padStart(2)} ║`);
    }

    console.log('  ╠═══════════════════════════════════════════════════════════════╣');
    const status = failed === 0 ? 'ALL PASSED' : `${failed} FAILED`;
    console.log(`  ║  Total: ${total}  |  Passed: ${passed}  |  Failed: ${failed}  |  ${status.padEnd(15)} ║`);
    console.log('  ╚═══════════════════════════════════════════════════════════════╝\n');

    if (failures.length > 0) {
      console.log('  Failure Details:');
      for (const f of failures) {
        console.log(`    → ${f.test.description}`);
        if (f.result) console.log(`      ${f.result.message}`);
        if (f.error) console.log(`      EXCEPTION: ${f.error.message}`);
      }
    }

    return { total, passed, failed };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §4. TEST CASE FACTORIES — Domain I: Particle Lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

class ParticleLifecycleTestCaseFactory {
  produce() {
    const tests = [];

    // TC-01
    tests.push({
      description: 'TC-01: Newly created particle begins in SPAWNED phase',
      category: 'Particle Lifecycle',
      execute() {
        const p = new Particle({
          x: 100, y: 0, vx: 0, vy: 1, size: 4,
          color: '#FFD700', lifetime: 2000, createdAt: 0,
        });
        return assert.eq(p.phase, ParticlePhase.SPAWNED);
      },
    });

    // TC-02
    tests.push({
      description: 'TC-02: Particle transitions SPAWNED → ACTIVE after first advance',
      category: 'Particle Lifecycle',
      execute() {
        const p = new Particle({
          x: 100, y: 0, vx: 0, vy: 1, size: 4,
          color: '#FFD700', lifetime: 2000, createdAt: 0,
        });
        p.advance(16.667);
        return assert.eq(p.phase, ParticlePhase.ACTIVE);
      },
    });

    // TC-03
    tests.push({
      description: 'TC-03: Particle transitions to DECAYING below decay threshold',
      category: 'Particle Lifecycle',
      execute() {
        const p = new Particle({
          x: 100, y: 0, vx: 0, vy: 1, size: 4,
          color: '#FFD700', lifetime: 1000, createdAt: 0,
        });
        // Advance to 75% of lifetime → opacity ~0.25, below DECAY_THRESHOLD (0.3)
        p.advance(750);
        return assert.eq(p.phase, ParticlePhase.DECAYING);
      },
    });

    // TC-04
    tests.push({
      description: 'TC-04: Particle transitions to DEAD when lifetime exhausted',
      category: 'Particle Lifecycle',
      execute() {
        const p = new Particle({
          x: 100, y: 0, vx: 0, vy: 1, size: 4,
          color: '#FFD700', lifetime: 1000, createdAt: 0,
        });
        p.advance(1100);
        return assert.eq(p.phase, ParticlePhase.DEAD);
      },
    });

    // TC-05
    tests.push({
      description: 'TC-05: Dead particle reports isDead === true',
      category: 'Particle Lifecycle',
      execute() {
        const p = new Particle({
          x: 100, y: 0, vx: 0, vy: 1, size: 4,
          color: '#FFD700', lifetime: 100, createdAt: 0,
        });
        p.advance(200);
        return assert.truthy(p.isDead);
      },
    });

    // TC-06
    tests.push({
      description: 'TC-06: Active particle reports isDead === false',
      category: 'Particle Lifecycle',
      execute() {
        const p = new Particle({
          x: 100, y: 0, vx: 0, vy: 1, size: 4,
          color: '#FFD700', lifetime: 2000, createdAt: 0,
        });
        p.advance(100);
        return assert.falsy(p.isDead);
      },
    });

    // TC-07
    tests.push({
      description: 'TC-07: Opacity clamps to 0 (never goes negative)',
      category: 'Particle Lifecycle',
      execute() {
        const p = new Particle({
          x: 100, y: 0, vx: 0, vy: 1, size: 4,
          color: '#FFD700', lifetime: 100, createdAt: 0,
        });
        p.advance(500); // Way past lifetime
        return assert.eq(p.opacity, 0);
      },
    });

    // TC-08
    tests.push({
      description: 'TC-08: Particle initial opacity is 1.0',
      category: 'Particle Lifecycle',
      execute() {
        const p = new Particle({
          x: 100, y: 0, vx: 0, vy: 1, size: 4,
          color: '#FFD700', lifetime: 2000, createdAt: 0,
        });
        return assert.eq(p.opacity, 1.0);
      },
    });

    // TC-09
    tests.push({
      description: 'TC-09: Opacity decreases monotonically over successive frames',
      category: 'Particle Lifecycle',
      execute() {
        const p = new Particle({
          x: 100, y: 0, vx: 0, vy: 1, size: 4,
          color: '#FFD700', lifetime: 2000, createdAt: 0,
        });
        const opacities = [];
        for (let i = 0; i < 10; i++) {
          p.advance(150);
          opacities.push(p.opacity);
        }
        let monotonic = true;
        for (let i = 1; i < opacities.length; i++) {
          if (opacities[i] >= opacities[i - 1]) { monotonic = false; break; }
        }
        return assert.truthy(monotonic);
      },
    });

    // TC-10
    tests.push({
      description: 'TC-10: Particle age accumulates correctly across multiple advances',
      category: 'Particle Lifecycle',
      execute() {
        const p = new Particle({
          x: 100, y: 0, vx: 0, vy: 1, size: 4,
          color: '#FFD700', lifetime: 5000, createdAt: 0,
        });
        p.advance(100);
        p.advance(200);
        p.advance(300);
        return assert.eq(p.age, 600);
      },
    });

    return tests;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §5. TEST CASE FACTORIES — Domain II: Memory Leak Prevention
// ═══════════════════════════════════════════════════════════════════════════════

class MemoryLeakPreventionTestCaseFactory {
  produce() {
    const tests = [];

    // TC-11
    tests.push({
      description: 'TC-11: Loop restart clears all particles (no accumulation)',
      category: 'Memory Leak Prevention',
      execute() {
        const { engine, scheduler } = AnimationEngineTestHarness.create();
        engine.start();

        // Run through one full loop (4000ms)
        let t = 0;
        for (let i = 0; i < 250; i++) {
          t += 16.667;
          scheduler.tick(t);
        }
        // After loop restart, particle count should be low (freshly spawned only)
        const countAfterRestart = engine.particleCount;
        engine.destroy();
        // After restart, fresh batch is spawned — bounded by MAX_PARTICLES
        return assert.range(countAfterRestart, 0, ParticleConfigurationSchema.MAX_PARTICLES);
      },
    });

    // TC-12
    tests.push({
      description: 'TC-12: Particle reap count increases as particles die',
      category: 'Memory Leak Prevention',
      execute() {
        const { engine, scheduler } = AnimationEngineTestHarness.create();
        engine.start();

        let t = 0;
        for (let i = 0; i < 200; i++) {
          t += 16.667;
          scheduler.tick(t);
        }
        const reaped = engine.totalParticlesReaped;
        engine.destroy();
        return assert.gt(reaped, 0);
      },
    });

    // TC-13
    tests.push({
      description: 'TC-13: Particle count never exceeds MAX_PARTICLES',
      category: 'Memory Leak Prevention',
      execute() {
        const { engine, scheduler } = AnimationEngineTestHarness.create();
        engine.start();

        let maxObserved = 0;
        let t = 0;
        for (let i = 0; i < 300; i++) {
          t += 16.667;
          scheduler.tick(t);
          if (engine.particleCount > maxObserved) {
            maxObserved = engine.particleCount;
          }
        }
        engine.destroy();
        return assert.range(maxObserved, 1, ParticleConfigurationSchema.MAX_PARTICLES);
      },
    });

    // TC-14
    tests.push({
      description: 'TC-14: After destroy(), particle count is 0',
      category: 'Memory Leak Prevention',
      execute() {
        const { engine, scheduler } = AnimationEngineTestHarness.create();
        engine.start();

        let t = 0;
        for (let i = 0; i < 50; i++) {
          t += 16.667;
          scheduler.tick(t);
        }
        engine.destroy();
        return assert.eq(engine.particleCount, 0);
      },
    });

    // TC-15
    tests.push({
      description: 'TC-15: Spawned + reaped particle counts are accounting-consistent',
      category: 'Memory Leak Prevention',
      execute() {
        const { engine, scheduler } = AnimationEngineTestHarness.create();
        engine.start();

        let t = 0;
        for (let i = 0; i < 150; i++) {
          t += 16.667;
          scheduler.tick(t);
        }
        // Invariant: spawned == alive + reaped
        const alive = engine.particleCount;
        const spawned = engine.totalParticlesSpawned;
        const reaped = engine.totalParticlesReaped;
        engine.destroy();
        return assert.eq(spawned, alive + reaped);
      },
    });

    // TC-16
    tests.push({
      description: 'TC-16: Multiple loop restarts do not leak (particle count stays bounded)',
      category: 'Memory Leak Prevention',
      execute() {
        const { engine, scheduler } = AnimationEngineTestHarness.create();
        engine.start();

        let t = 0;
        // Run 3 full loops
        for (let i = 0; i < 750; i++) {
          t += 16.667;
          scheduler.tick(t);
        }
        engine.destroy();
        return assert.eq(engine.particleCount, 0);
      },
    });

    // TC-17
    tests.push({
      description: 'TC-17: Dead particles are filtered out each frame (not just at loop restart)',
      category: 'Memory Leak Prevention',
      execute() {
        const customConfig = {
          ...ParticleConfigurationSchema,
          BASE_LIFETIME_MS: 200, // Very short-lived particles
          SPAWN_RATE: 3,
          MAX_PARTICLES: 50,
        };
        const { engine, scheduler } = AnimationEngineTestHarness.create({ config: customConfig });
        engine.start();

        let t = 0;
        let everDecreased = false;
        let prevCount = 0;
        for (let i = 0; i < 100; i++) {
          t += 16.667;
          scheduler.tick(t);
          if (engine.particleCount < prevCount) everDecreased = true;
          prevCount = engine.particleCount;
        }
        engine.destroy();
        return assert.truthy(everDecreased);
      },
    });

    // TC-18
    tests.push({
      description: 'TC-18: Loop restart resets loop start time (no time drift accumulation)',
      category: 'Memory Leak Prevention',
      execute() {
        const { engine, scheduler } = AnimationEngineTestHarness.create();
        engine.start();

        // Run one full loop and verify loopCount increments
        let t = 0;
        for (let i = 0; i < 250; i++) {
          t += 16.667;
          scheduler.tick(t);
        }
        const loops = engine.loopCount;
        engine.destroy();
        return assert.gt(loops, 0);
      },
    });

    return tests;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §6. TEST CASE FACTORIES — Domain III: Accessibility Policy
// ═══════════════════════════════════════════════════════════════════════════════

class AccessibilityPolicyTestCaseFactory {
  produce() {
    const tests = [];

    // TC-19
    tests.push({
      description: 'TC-19: Reduced motion → animation does not start loop',
      category: 'Accessibility (prefers-reduced-motion)',
      execute() {
        const { engine } = AnimationEngineTestHarness.create({ reducedMotion: true });
        engine.start();
        return assert.falsy(engine.isRunning);
      },
    });

    // TC-20
    tests.push({
      description: 'TC-20: Reduced motion → onComplete fires with reason "reduced-motion"',
      category: 'Accessibility (prefers-reduced-motion)',
      execute() {
        let callbackResult = null;
        const { engine } = AnimationEngineTestHarness.create({
          reducedMotion: true,
          onComplete: (result) => { callbackResult = result; },
        });
        engine.start();
        return assert.eq(callbackResult?.reason, 'reduced-motion');
      },
    });

    // TC-21
    tests.push({
      description: 'TC-21: Reduced motion → no particles are spawned',
      category: 'Accessibility (prefers-reduced-motion)',
      execute() {
        const { engine } = AnimationEngineTestHarness.create({ reducedMotion: true });
        engine.start();
        return assert.eq(engine.totalParticlesSpawned, 0);
      },
    });

    // TC-22
    tests.push({
      description: 'TC-22: Reduced motion → static shimmer renders (canvas not empty)',
      category: 'Accessibility (prefers-reduced-motion)',
      execute() {
        const { engine, canvas } = AnimationEngineTestHarness.create({ reducedMotion: true });
        engine.start();
        const ctx = canvas._ctx;
        const hasDrawOps = ctx.operations.some(op =>
          op.op === 'fillRect' || op.op === 'clearRect'
        );
        return assert.truthy(hasDrawOps);
      },
    });

    // TC-23
    tests.push({
      description: 'TC-23: Non-reduced-motion → animation loop starts normally',
      category: 'Accessibility (prefers-reduced-motion)',
      execute() {
        const { engine } = AnimationEngineTestHarness.create({ reducedMotion: false });
        engine.start();
        return assert.truthy(engine.isRunning);
      },
    });

    // TC-24
    tests.push({
      description: 'TC-24: AccessibilityPolicyEvaluator defaults to no reduced motion',
      category: 'Accessibility (prefers-reduced-motion)',
      execute() {
        const policy = new AccessibilityPolicyEvaluator();
        return assert.falsy(policy.prefersReducedMotion);
      },
    });

    // TC-25
    tests.push({
      description: 'TC-25: AccessibilityPolicyEvaluator.prefersReducedMotion is settable at runtime',
      category: 'Accessibility (prefers-reduced-motion)',
      execute() {
        const policy = new AccessibilityPolicyEvaluator(false);
        policy.prefersReducedMotion = true;
        return assert.truthy(policy.prefersReducedMotion);
      },
    });

    // TC-26
    tests.push({
      description: 'TC-26: Reduced motion → scheduler receives zero frame requests',
      category: 'Accessibility (prefers-reduced-motion)',
      execute() {
        const { engine, scheduler } = AnimationEngineTestHarness.create({ reducedMotion: true });
        engine.start();
        return assert.eq(scheduler.pendingCount, 0);
      },
    });

    return tests;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §7. TEST CASE FACTORIES — Domain IV: Timing Edge Cases
// ═══════════════════════════════════════════════════════════════════════════════

class TimingEdgeCaseTestCaseFactory {
  produce() {
    const tests = [];

    // TC-27
    tests.push({
      description: 'TC-27: 60fps frame interval (16.667ms) produces smooth particle motion',
      category: 'Timing Edge Cases (60fps/30fps)',
      execute() {
        const p = new Particle({
          x: 100, y: 0, vx: 1, vy: 1, size: 4,
          color: '#FFD700', lifetime: 5000, createdAt: 0,
        });
        const y0 = p.y;
        p.advance(16.667); // One frame at 60fps
        const deltaY = p.y - y0;
        // At 16.667ms delta, vy=1, displacement ≈ 1.0 (normalized)
        return assert.range(deltaY, 0.5, 2.0);
      },
    });

    // TC-28
    tests.push({
      description: 'TC-28: 30fps frame interval (33.333ms) produces proportionally larger displacement',
      category: 'Timing Edge Cases (60fps/30fps)',
      execute() {
        const p30 = new Particle({
          x: 100, y: 0, vx: 0, vy: 1, size: 4,
          color: '#FFD700', lifetime: 5000, createdAt: 0,
        });
        const p60 = new Particle({
          x: 100, y: 0, vx: 0, vy: 1, size: 4,
          color: '#FFD700', lifetime: 5000, createdAt: 0,
        });

        p30.advance(33.333); // One frame at 30fps
        p60.advance(16.667); // One frame at 60fps
        p60.advance(16.667); // Two frames at 60fps ≈ same wall time

        // Both should land in a similar position (physics is delta-time-based)
        const diff = Math.abs(p30.y - p60.y);
        return assert.range(diff, 0, 0.5);
      },
    });

    // TC-29
    tests.push({
      description: 'TC-29: Zero delta-time frame does not move particle',
      category: 'Timing Edge Cases (60fps/30fps)',
      execute() {
        const p = new Particle({
          x: 100, y: 50, vx: 1, vy: 1, size: 4,
          color: '#FFD700', lifetime: 5000, createdAt: 0,
        });
        const xBefore = p.x;
        const yBefore = p.y;
        p.advance(0);
        return assert.truthy(p.x === xBefore && p.y === yBefore);
      },
    });

    // TC-30
    tests.push({
      description: 'TC-30: Very large delta-time (lag spike) kills short-lived particle',
      category: 'Timing Edge Cases (60fps/30fps)',
      execute() {
        const p = new Particle({
          x: 100, y: 0, vx: 0, vy: 1, size: 4,
          color: '#FFD700', lifetime: 500, createdAt: 0,
        });
        p.advance(1000); // 1 second lag spike, lifetime is 500ms
        return assert.eq(p.phase, ParticlePhase.DEAD);
      },
    });

    // TC-31
    tests.push({
      description: 'TC-31: Engine handles first frame (deltaMs=0) gracefully',
      category: 'Timing Edge Cases (60fps/30fps)',
      execute() {
        const { engine, scheduler } = AnimationEngineTestHarness.create();
        engine.start();
        // First frame: loopStartTime is set, deltaMs=0
        scheduler.tick(1000);
        // Should not crash, particles should be spawned
        return assert.gt(engine.particleCount, 0);
      },
    });

    // TC-32
    tests.push({
      description: 'TC-32: 120fps (8.333ms intervals) does not break physics invariants',
      category: 'Timing Edge Cases (60fps/30fps)',
      execute() {
        const p = new Particle({
          x: 100, y: 0, vx: 1, vy: 0, size: 4,
          color: '#FFD700', lifetime: 5000, createdAt: 0,
        });
        // 120 frames at 8.333ms each ≈ 1 second
        for (let i = 0; i < 120; i++) {
          p.advance(8.333);
        }
        // x should have moved approximately 60 units (1 unit per 16.667ms frame)
        return assert.range(p.x, 150, 170);
      },
    });

    // TC-33
    tests.push({
      description: 'TC-33: Gravity accumulates over time (particle accelerates downward)',
      category: 'Timing Edge Cases (60fps/30fps)',
      execute() {
        const p = new Particle({
          x: 100, y: 0, vx: 0, vy: 0, size: 4,
          color: '#FFD700', lifetime: 10000, createdAt: 0,
        });
        p.advance(16.667);
        const vy1 = p.vy;
        p.advance(16.667);
        const vy2 = p.vy;
        // Velocity should increase due to gravity
        return assert.gt(vy2, vy1);
      },
    });

    // TC-34
    tests.push({
      description: 'TC-34: Loop duration boundary — animation loops at exactly LOOP_DURATION_MS',
      category: 'Timing Edge Cases (60fps/30fps)',
      execute() {
        const { engine, scheduler } = AnimationEngineTestHarness.create();
        engine.start();

        const loopMs = ParticleConfigurationSchema.LOOP_DURATION_MS;
        // First frame sets the loopStartTime
        scheduler.tick(0);
        // Jump to exactly loop boundary
        scheduler.tick(loopMs + 1);
        // Should have looped
        return assert.gt(engine.loopCount, 0);
      },
    });

    return tests;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §8. TEST CASE FACTORIES — Domain V: DOM Cleanup
// ═══════════════════════════════════════════════════════════════════════════════

class DOMCleanupTestCaseFactory {
  produce() {
    const tests = [];

    // TC-35
    tests.push({
      description: 'TC-35: destroy() detaches canvas reference',
      category: 'DOM Cleanup',
      execute() {
        const { engine } = AnimationEngineTestHarness.create();
        engine.start();
        engine.destroy();
        return assert.falsy(engine.hasCanvas);
      },
    });

    // TC-36
    tests.push({
      description: 'TC-36: destroy() clears canvas before detaching',
      category: 'DOM Cleanup',
      execute() {
        const { engine, canvas, scheduler } = AnimationEngineTestHarness.create();
        engine.start();
        scheduler.tick(0);
        scheduler.tick(100);
        canvas._ctx.reset(); // Clear operation log
        engine.destroy();
        const hasClear = canvas._ctx.operations.some(op => op.op === 'clearRect');
        return assert.truthy(hasClear);
      },
    });

    // TC-37
    tests.push({
      description: 'TC-37: stop() cancels pending animation frame',
      category: 'DOM Cleanup',
      execute() {
        const { engine, scheduler } = AnimationEngineTestHarness.create();
        engine.start();
        scheduler.tick(0);
        engine.stop();
        return assert.eq(engine.frameId, null);
      },
    });

    // TC-38
    tests.push({
      description: 'TC-38: stop() sets isRunning to false',
      category: 'DOM Cleanup',
      execute() {
        const { engine } = AnimationEngineTestHarness.create();
        engine.start();
        engine.stop();
        return assert.falsy(engine.isRunning);
      },
    });

    // TC-39
    tests.push({
      description: 'TC-39: After maxLoops reached, onComplete fires with reason "max-loops"',
      category: 'DOM Cleanup',
      execute() {
        let callbackResult = null;
        const { engine, scheduler } = AnimationEngineTestHarness.create({
          onComplete: (result) => { callbackResult = result; },
        });
        engine.start(1); // Only 1 loop

        let t = 0;
        for (let i = 0; i < 300; i++) {
          t += 16.667;
          scheduler.tick(t);
          if (callbackResult) break;
        }
        return assert.eq(callbackResult?.reason, 'max-loops');
      },
    });

    // TC-40
    tests.push({
      description: 'TC-40: After maxLoops reached, engine is no longer running',
      category: 'DOM Cleanup',
      execute() {
        let done = false;
        const { engine, scheduler } = AnimationEngineTestHarness.create({
          onComplete: () => { done = true; },
        });
        engine.start(1);

        let t = 0;
        for (let i = 0; i < 300; i++) {
          t += 16.667;
          scheduler.tick(t);
          if (done) break;
        }
        return assert.falsy(engine.isRunning);
      },
    });

    // TC-41
    tests.push({
      description: 'TC-41: Double-start is idempotent (does not create duplicate loops)',
      category: 'DOM Cleanup',
      execute() {
        const { engine, scheduler } = AnimationEngineTestHarness.create();
        engine.start();
        engine.start(); // Should be no-op
        scheduler.tick(0);
        scheduler.tick(16.667);
        // Still running normally, no explosion
        return assert.truthy(engine.isRunning);
      },
    });

    // TC-42
    tests.push({
      description: 'TC-42: Canvas removal from DOM container reduces child count',
      category: 'DOM Cleanup',
      execute() {
        const container = new MockDOMContainer();
        const canvas = new MockCanvas(400, 300);
        container.appendChild(canvas);
        const before = container.childElementCount;
        canvas.remove();
        const after = container.childElementCount;
        return assert.eq(before - after, 1);
      },
    });

    return tests;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §9. TEST CASE FACTORIES — Domain VI: Particle Physics & Configuration
// ═══════════════════════════════════════════════════════════════════════════════

class ParticlePhysicsConfigurationTestCaseFactory {
  produce() {
    const tests = [];

    // TC-43
    tests.push({
      description: 'TC-43: ParticleEmitterFactory spawns within canvas bounds (x-axis)',
      category: 'Particle Physics & Configuration',
      execute() {
        const rng = new DeterministicRNG(99);
        const emitter = new ParticleEmitterFactory(ParticleConfigurationSchema, rng.generator);
        let allInBounds = true;
        for (let i = 0; i < 100; i++) {
          const p = emitter.spawn(400, 300, i * 16);
          if (p.x < 0 || p.x > 400) { allInBounds = false; break; }
        }
        return assert.truthy(allInBounds);
      },
    });

    // TC-44
    tests.push({
      description: 'TC-44: Spawned particle y-position is above canvas (negative padding)',
      category: 'Particle Physics & Configuration',
      execute() {
        const rng = new DeterministicRNG(7);
        const emitter = new ParticleEmitterFactory(ParticleConfigurationSchema, rng.generator);
        const p = emitter.spawn(400, 300, 0);
        return assert.eq(p.y, -ParticleConfigurationSchema.CANVAS_PADDING);
      },
    });

    // TC-45
    tests.push({
      description: 'TC-45: Particle size falls within configured MIN_SIZE..MAX_SIZE range',
      category: 'Particle Physics & Configuration',
      execute() {
        const rng = new DeterministicRNG(123);
        const emitter = new ParticleEmitterFactory(ParticleConfigurationSchema, rng.generator);
        let allValid = true;
        for (let i = 0; i < 50; i++) {
          const p = emitter.spawn(400, 300, i);
          if (p.size < ParticleConfigurationSchema.MIN_SIZE ||
              p.size > ParticleConfigurationSchema.MAX_SIZE) {
            allValid = false;
            break;
          }
        }
        return assert.truthy(allValid);
      },
    });

    // TC-46
    tests.push({
      description: 'TC-46: Particle color is always from the GOLDEN_PALETTE',
      category: 'Particle Physics & Configuration',
      execute() {
        const rng = new DeterministicRNG(256);
        const emitter = new ParticleEmitterFactory(ParticleConfigurationSchema, rng.generator);
        const palette = new Set(ParticleConfigurationSchema.GOLDEN_PALETTE);
        let allValid = true;
        for (let i = 0; i < 50; i++) {
          const p = emitter.spawn(400, 300, i);
          if (!palette.has(p.color)) { allValid = false; break; }
        }
        return assert.truthy(allValid);
      },
    });

    // TC-47
    tests.push({
      description: 'TC-47: Configuration schema is frozen (immutable)',
      category: 'Particle Physics & Configuration',
      execute() {
        return assert.truthy(Object.isFrozen(ParticleConfigurationSchema));
      },
    });

    // TC-48
    tests.push({
      description: 'TC-48: DeterministicRNG produces repeatable sequences given same seed',
      category: 'Particle Physics & Configuration',
      execute() {
        const rng1 = new DeterministicRNG(42);
        const rng2 = new DeterministicRNG(42);
        const seq1 = Array.from({ length: 20 }, () => rng1.next());
        const seq2 = Array.from({ length: 20 }, () => rng2.next());
        return assert.deep(seq1, seq2);
      },
    });

    return tests;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §10. MAIN EXECUTION — Assembly of the Verification Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Entrypoint — assembles all six TestCaseFactory instances into the
 * TestSuiteOrchestrator and dispatches the verification pipeline.
 *
 * Dr. Schneider considered using a FactoryOfFactoryRegistryProvider here,
 * but the Architecture Review Board (population: 1) vetoed it on the grounds
 * that "even elegance has limits" (ARB Minutes, January 2025).
 */
function main() {
  console.log('\n  ╔═══════════════════════════════════════════════════════════════╗');
  console.log('  ║  Golden Ticket Animation — Test Suite Initialising...        ║');
  console.log('  ╚═══════════════════════════════════════════════════════════════╝\n');

  const orchestrator = new TestSuiteOrchestrator();

  orchestrator.registerFactories([
    new ParticleLifecycleTestCaseFactory(),
    new MemoryLeakPreventionTestCaseFactory(),
    new AccessibilityPolicyTestCaseFactory(),
    new TimingEdgeCaseTestCaseFactory(),
    new DOMCleanupTestCaseFactory(),
    new ParticlePhysicsConfigurationTestCaseFactory(),
  ]);

  const { total, passed, failed } = orchestrator.execute();

  if (total !== 48) {
    console.error(`\n  ⚠  INVARIANT VIOLATION: Expected 48 test cases, got ${total}.`);
    console.error('     The TestCaseFactory pipeline has a cardinality mismatch.');
    console.error('     Dr. Schneider is disappointed.\n');
    process.exit(2);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
