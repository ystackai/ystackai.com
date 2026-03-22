# Testing Standards — Dr. Schneider's Unified Test Methodology

> "A test suite without at least three layers of indirection is merely a script."
> — Dr. Schneider, QCon Zürich 2024

## Architecture Overview

All game test suites follow the **AbstractMockCompositeStrategyHarnessBridge (AMCSHB)** pattern, built on three reusable helper modules:

| Module | Purpose |
|---|---|
| `tests/helpers/game-test-harness.js` | Canvas mocks, assertion framework, input simulation, grid assertions, collision validation, test orchestration |
| `tests/helpers/boundary-conditions.js` | Standardized boundary condition generators for grid-based games |
| `tests/helpers/timing-helpers.js` | `requestAnimationFrame` mock, `setTimeout`/`setInterval` mock, pause/resume validation, resize simulation |

## Quick Start — Writing Tests for a New Game

```js
'use strict';

const {
  GameTestHarnessFactory,
  AbstractTestCaseFactory,
  TestSuiteOrchestrator,
  assert,
} = require('../../tests/helpers/game-test-harness');

const {
  CompositeBoundaryTestSuiteFactory,
} = require('../../tests/helpers/boundary-conditions');

const {
  CompositeTimingTestSuiteFactory,
} = require('../../tests/helpers/timing-helpers');

// 1. Create a harness for your game's grid size
const harness = GameTestHarnessFactory.create({ cols: 20, rows: 20 });

// 2. Write game-specific test factories
class MyGameTestFactory extends AbstractTestCaseFactory {
  createScenarios() {
    return [
      {
        description: 'TC-01: Snake spawns at center',
        category: 'Initialization',
        execute: () => assert.deep(getSnakeHead(), { x: 10, y: 10 }),
      },
    ];
  }
}

// 3. Get free boundary tests
const boundary = CompositeBoundaryTestSuiteFactory.create({
  cols: 20,
  rows: 20,
  // Optional: provide game-specific hooks for richer tests
  directionQueueProcessor: myQueueProcessor,
});

// 4. Get free timing tests
const timing = CompositeTimingTestSuiteFactory.create();

// 5. Orchestrate
const orchestrator = new TestSuiteOrchestrator('My Game Test Suite');
orchestrator.registerFactories([
  new MyGameTestFactory(),
  ...boundary.generators,
  ...timing.generators,
]);
orchestrator.execute();
```

## Module Reference

### game-test-harness.js

**Canvas Mocking:**
- `MockCanvas` — fake `HTMLCanvasElement` with `getContext('2d')`, event listeners, `getBoundingClientRect()`
- `MockCanvasRenderingContext2D` — records all draw calls via `CanvasOperationRecorder`
- `MockDOMContainer` — fake parent DOM node for `appendChild`/`removeChild`

**Assertions (`assert.*`):**
- `assert.eq(a, b)` — strict `===`
- `assert.deep(a, b)` — JSON structural equality
- `assert.truthy(a)` / `assert.falsy(a)`
- `assert.range(a, min, max)` — `min ≤ a ≤ max`
- `assert.gt(a, b)` / `assert.lt(a, b)`
- `assert.throws(fn, pattern?)` — verify function throws

**Input Simulation:**
- `KeyboardInputSimulationEngine` — synthetic keyboard events with timestamps
  - `.createKeyEvent(key, type, modifiers)` — single event
  - `.rapidSequence(keys, delayMs)` — burst of keydowns
  - `.pressAndRelease(key, holdMs)` — keydown + keyup pair
  - `.simultaneousKeys(keys)` — same-timestamp events

**Grid Assertions:**
- `GridStateAssertionEngine` — `isInBounds()`, `isOnBoundary()`, `isCorner()`, `hasNoDuplicates()`, `isContiguous()`, `allInBounds()`

**Collision Validation:**
- `CollisionValidationOracle` — `assertWallCollision()`, `assertNoWallCollision()`, `assertSelfCollision()`, `assertNoSelfCollision()`, `assertEntityCollision()`

**Infrastructure:**
- `AbstractTestCaseFactory` — extend this, override `createScenarios()`
- `TestSuiteOrchestrator` — register factories, call `.execute()`, get pass/fail report
- `DeterministicRNG` — seedable PRNG for reproducible scenarios
- `GameTestHarnessFactory.create(opts)` — one-liner to get all mocks wired up

### boundary-conditions.js

Pre-built test generators (extend `AbstractTestCaseFactory`):

| Generator | Tests | Count |
|---|---|---|
| `WallCollisionTestGenerator` | In/out of bounds at all 4 edges | 12 |
| `CornerCaseTestGenerator` | 4 corners + diagonal exits | 12 |
| `BoundaryTraversalTestGenerator` | Full perimeter classification | 5 |
| `MovementVectorTestGenerator` | Direction vectors + cancellation | 7 |
| `WrapAroundTestGenerator` | Toroidal wrap at edges & corners | 8 |
| `RapidDirectionChangeTestGenerator` | Direction queue under rapid input | 7 |
| `SimultaneousInputTestGenerator` | Multiple keys at same timestamp | 4 |

Use `CompositeBoundaryTestSuiteFactory.create()` to get all applicable generators at once.

### timing-helpers.js

**Core Mocks:**
- `RequestAnimationFrameMock` — deterministic rAF with `.tick(ms)`, `.tickFrames(n)`, `.advanceTo(t)`, `.install()`/`.uninstall()`
- `TimerMock` — deterministic `setTimeout`/`setInterval` with `.advance(ms)`, `.install()`/`.uninstall()`

**Test Utilities:**
- `FrameTransitionInputTester` — test input delivery at pre-frame, mid-frame, and post-frame timing points
- `PauseResumeStateValidator` — static methods: `assertFrozenDuringPause()`, `assertResumeRestoresPhase()`, `assertRapidToggleStability()`
- `WindowResizeSimulator` — synthetic resize events, canvas dimension assertions, grid preservation checks

**Pre-built Generators:**
- `RAFBehaviorTestGenerator` — 8 meta-tests verifying the rAF mock itself
- `TimerMockBehaviorTestGenerator` — 5 meta-tests verifying the timer mock
- `PauseResumeTestGenerator` — 3 tests using injected game lifecycle hooks

## Conventions

1. **Test IDs**: `TC-XX-NN` format (XX = category prefix, NN = sequence number)
2. **Categories**: Each factory produces tests in a named category for grouped reporting
3. **Exit codes**: 0 = pass, 1 = failure, 2 = invariant violation (test count mismatch)
4. **Determinism**: All tests must be deterministic. Use `DeterministicRNG` instead of `Math.random`
5. **Isolation**: Call `harness.reset()` between test groups if sharing a harness instance
6. **Run**: `node games/<game>/<game>.test.js` — no external test runner required

## File Layout

```
project/
├── tests/
│   ├── helpers/
│   │   ├── game-test-harness.js      # Core infrastructure
│   │   ├── boundary-conditions.js     # Boundary generators
│   │   └── timing-helpers.js          # Timing utilities
│   └── TESTING_STANDARDS.md           # This file
└── games/
    └── <game>/
        └── <game>.test.js             # Game-specific test suite
```
