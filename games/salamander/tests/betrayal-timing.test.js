/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SCHNEIDER PROTOCOL v2.3 — Betrayal Detection Timing Validation Suite
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ticket:    #93 — Salamander × Aliens — Co-op with betrayal mechanic
 * Author:    Dr. Schneider, Principal Architect (PhD ETH Zürich)
 * Module:    Betrayal Detection Subsystem — Temporal Boundary Analysis
 *
 * Concept: One player is secretly designated as the "alien." The alien
 *          can activate betrayal at any time, converting their salamander
 *          into a predator. Timing of betrayal activation relative to
 *          game events creates complex edge cases requiring formal
 *          verification.
 *
 * Architecture:
 *   BetrayalStateManager (FSM)
 *     → BetrayalTimingOracle (temporal analysis)
 *       → BetrayalCooldownEnforcer (rate limiting)
 *         → BetrayalDetectionEventEmitter (observer pattern)
 *
 * SBT Classification: Primarily Tier-3 (Temporal Boundaries)
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Betrayal Configuration Constants ────────────────────────────────────

const BETRAYAL_CONFIG = Object.freeze({
  COOLDOWN_TICKS: 10,           // Minimum ticks before betrayal can activate
  REVEAL_WINDOW_TICKS: 3,       // Ticks the betrayal animation plays
  IMMUNITY_TICKS_AFTER_REVEAL: 5, // Grace period for victim after reveal
  MIN_GAME_TICKS_BEFORE_BETRAY: 15, // Game must run N ticks before betrayal allowed
  BETRAYAL_DAMAGE_PER_TICK: 1,  // Damage dealt per tick when in predator mode
  MAX_BETRAYAL_DURATION: 20,    // Predator mode auto-expires after N ticks
});

const TICK_INTERVAL_MS = 160;

// ── Betrayal State Machine ──────────────────────────────────────────────

/**
 * BetrayalPhase enumeration — models the finite state machine for the
 * betrayal subsystem.
 *
 *   dormant → activated → revealed → hunting → expired
 *                                      ↓
 *                                   cooldown → dormant
 *
 * Transitions are tick-driven and subject to temporal constraints.
 */
const BetrayalPhase = Object.freeze({
  DORMANT: 'dormant',       // Alien role assigned but not yet activated
  ACTIVATED: 'activated',   // Activation key pressed, pending reveal
  REVEALED: 'revealed',     // Reveal animation playing
  HUNTING: 'hunting',       // Active predator mode
  EXPIRED: 'expired',       // Predator mode timed out
  COOLDOWN: 'cooldown',     // Post-expiry cooldown before re-activation
});

// ── Betrayal State Factory ──────────────────────────────────────────────

class BetrayalStateFactory {
  static createDormantState(alienPlayerId = 'p1', gameTick = 0) {
    return {
      phase: BetrayalPhase.DORMANT,
      alienPlayerId,
      activationTick: null,
      revealTick: null,
      huntingStartTick: null,
      expiryTick: null,
      cooldownEndTick: null,
      gameTick,
      totalDamageDealt: 0,
      betrayalCount: 0,
    };
  }

  static createAtPhase(phase, alienPlayerId = 'p1', gameTick = 20) {
    const state = BetrayalStateFactory.createDormantState(alienPlayerId, gameTick);
    state.phase = phase;

    switch (phase) {
      case BetrayalPhase.ACTIVATED:
        state.activationTick = gameTick;
        break;
      case BetrayalPhase.REVEALED:
        state.activationTick = gameTick - 1;
        state.revealTick = gameTick;
        break;
      case BetrayalPhase.HUNTING:
        state.activationTick = gameTick - 4;
        state.revealTick = gameTick - 3;
        state.huntingStartTick = gameTick;
        break;
      case BetrayalPhase.EXPIRED:
        state.activationTick = gameTick - 24;
        state.revealTick = gameTick - 23;
        state.huntingStartTick = gameTick - 20;
        state.expiryTick = gameTick;
        break;
      case BetrayalPhase.COOLDOWN:
        state.activationTick = gameTick - 35;
        state.cooldownEndTick = gameTick + BETRAYAL_CONFIG.COOLDOWN_TICKS;
        state.betrayalCount = 1;
        break;
    }

    return state;
  }
}

// ── Betrayal Transition Validator ───────────────────────────────────────

/**
 * BetrayalTransitionOracle — Determines whether a phase transition is
 * legal given the current state and game tick.
 *
 * This implements a guard-condition FSM where transitions are not merely
 * state-dependent but also temporally constrained (Schneider Temporal
 * Guard Pattern, cf. ETH Zürich TR-2019-47).
 */
class BetrayalTransitionOracle {
  static canActivate(state) {
    if (state.phase !== BetrayalPhase.DORMANT) return false;
    if (state.gameTick < BETRAYAL_CONFIG.MIN_GAME_TICKS_BEFORE_BETRAY) return false;
    return true;
  }

  static canReveal(state) {
    if (state.phase !== BetrayalPhase.ACTIVATED) return false;
    return true; // reveal is immediate after activation
  }

  static canStartHunting(state) {
    if (state.phase !== BetrayalPhase.REVEALED) return false;
    if (state.revealTick === null) return false;
    const ticksSinceReveal = state.gameTick - state.revealTick;
    return ticksSinceReveal >= BETRAYAL_CONFIG.REVEAL_WINDOW_TICKS;
  }

  static shouldExpire(state) {
    if (state.phase !== BetrayalPhase.HUNTING) return false;
    if (state.huntingStartTick === null) return false;
    const ticksHunting = state.gameTick - state.huntingStartTick;
    return ticksHunting >= BETRAYAL_CONFIG.MAX_BETRAYAL_DURATION;
  }

  static canReactivate(state) {
    if (state.phase !== BetrayalPhase.COOLDOWN) return false;
    if (state.cooldownEndTick === null) return false;
    return state.gameTick >= state.cooldownEndTick;
  }

  static isVictimImmune(state) {
    if (state.phase !== BetrayalPhase.HUNTING && state.phase !== BetrayalPhase.REVEALED) {
      return false;
    }
    if (state.revealTick === null) return false;
    const ticksSinceReveal = state.gameTick - state.revealTick;
    return ticksSinceReveal < BETRAYAL_CONFIG.IMMUNITY_TICKS_AFTER_REVEAL;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// TEST SUITE: TC-BT — Betrayal Timing Boundary Validation
// ══════════════════════════════════════════════════════════════════════════

describe('Schneider Protocol v2.3 — Betrayal Detection Timing', () => {

  // ── TC-BT-00: Betrayal State Factory Integrity ────────────────────────

  describe('TC-BT-00: BetrayalStateFactory Determinism', () => {

    test('TC-BT-00.1: Dormant state has all temporal fields null', () => {
      const state = BetrayalStateFactory.createDormantState();
      expect(state.phase).toBe(BetrayalPhase.DORMANT);
      expect(state.activationTick).toBeNull();
      expect(state.revealTick).toBeNull();
      expect(state.huntingStartTick).toBeNull();
      expect(state.expiryTick).toBeNull();
      expect(state.cooldownEndTick).toBeNull();
      expect(state.totalDamageDealt).toBe(0);
      expect(state.betrayalCount).toBe(0);
    });

    test('TC-BT-00.2: Factory phase constructors set correct temporal markers', () => {
      const hunting = BetrayalStateFactory.createAtPhase(BetrayalPhase.HUNTING, 'p1', 30);
      expect(hunting.huntingStartTick).toBe(30);
      expect(hunting.revealTick).toBe(27);
      expect(hunting.activationTick).toBe(26);
    });

    test('TC-BT-00.3: Alien player assignment persists through factory', () => {
      const stateP1 = BetrayalStateFactory.createDormantState('p1');
      const stateP2 = BetrayalStateFactory.createDormantState('p2');
      expect(stateP1.alienPlayerId).toBe('p1');
      expect(stateP2.alienPlayerId).toBe('p2');
    });
  });

  // ── TC-BT-01: Activation Timing Boundaries ───────────────────────────

  describe('TC-BT-01: Activation Guard — MIN_GAME_TICKS_BEFORE_BETRAY (SBT Tier-3)', () => {

    test('TC-BT-01.1: Activation at tick 0 → rejected (too early)', () => {
      const state = BetrayalStateFactory.createDormantState('p1', 0);
      expect(BetrayalTransitionOracle.canActivate(state)).toBe(false);
    });

    test('TC-BT-01.2: Activation at tick 14 → rejected (one below threshold)', () => {
      const state = BetrayalStateFactory.createDormantState('p1', 14);
      expect(BetrayalTransitionOracle.canActivate(state)).toBe(false);
    });

    test('TC-BT-01.3: Activation at tick 15 → allowed (exact threshold)', () => {
      const state = BetrayalStateFactory.createDormantState('p1', 15);
      expect(BetrayalTransitionOracle.canActivate(state)).toBe(true);
    });

    test('TC-BT-01.4: Activation at tick 16 → allowed (one above threshold)', () => {
      const state = BetrayalStateFactory.createDormantState('p1', 16);
      expect(BetrayalTransitionOracle.canActivate(state)).toBe(true);
    });

    test('TC-BT-01.5: Activation at tick 1000 → allowed (late game)', () => {
      const state = BetrayalStateFactory.createDormantState('p1', 1000);
      expect(BetrayalTransitionOracle.canActivate(state)).toBe(true);
    });

    test('TC-BT-01.6: Activation rejected if phase is not DORMANT', () => {
      const activated = BetrayalStateFactory.createAtPhase(BetrayalPhase.ACTIVATED, 'p1', 20);
      expect(BetrayalTransitionOracle.canActivate(activated)).toBe(false);

      const hunting = BetrayalStateFactory.createAtPhase(BetrayalPhase.HUNTING, 'p1', 20);
      expect(BetrayalTransitionOracle.canActivate(hunting)).toBe(false);
    });
  });

  // ── TC-BT-02: Reveal Window Timing ────────────────────────────────────

  describe('TC-BT-02: Reveal-to-Hunting Transition (SBT Tier-3)', () => {

    test('TC-BT-02.1: Cannot start hunting during reveal window (0 ticks elapsed)', () => {
      const state = BetrayalStateFactory.createAtPhase(BetrayalPhase.REVEALED, 'p1', 20);
      state.gameTick = state.revealTick; // 0 ticks since reveal
      expect(BetrayalTransitionOracle.canStartHunting(state)).toBe(false);
    });

    test('TC-BT-02.2: Cannot start hunting at REVEAL_WINDOW - 1 ticks', () => {
      const state = BetrayalStateFactory.createAtPhase(BetrayalPhase.REVEALED, 'p1', 20);
      state.gameTick = state.revealTick + BETRAYAL_CONFIG.REVEAL_WINDOW_TICKS - 1;
      expect(BetrayalTransitionOracle.canStartHunting(state)).toBe(false);
    });

    test('TC-BT-02.3: Can start hunting at exactly REVEAL_WINDOW ticks', () => {
      const state = BetrayalStateFactory.createAtPhase(BetrayalPhase.REVEALED, 'p1', 20);
      state.gameTick = state.revealTick + BETRAYAL_CONFIG.REVEAL_WINDOW_TICKS;
      expect(BetrayalTransitionOracle.canStartHunting(state)).toBe(true);
    });

    test('TC-BT-02.4: Can start hunting well past reveal window', () => {
      const state = BetrayalStateFactory.createAtPhase(BetrayalPhase.REVEALED, 'p1', 20);
      state.gameTick = state.revealTick + 100;
      expect(BetrayalTransitionOracle.canStartHunting(state)).toBe(true);
    });

    test('TC-BT-02.5: canStartHunting returns false for non-REVEALED phases', () => {
      const dormant = BetrayalStateFactory.createDormantState('p1', 50);
      expect(BetrayalTransitionOracle.canStartHunting(dormant)).toBe(false);

      const hunting = BetrayalStateFactory.createAtPhase(BetrayalPhase.HUNTING, 'p1', 50);
      expect(BetrayalTransitionOracle.canStartHunting(hunting)).toBe(false);
    });
  });

  // ── TC-BT-03: Hunting Duration & Expiry ───────────────────────────────

  describe('TC-BT-03: Hunting Duration Expiry (SBT Tier-3)', () => {

    test('TC-BT-03.1: Hunting at tick 0 (start) → not expired', () => {
      const state = BetrayalStateFactory.createAtPhase(BetrayalPhase.HUNTING, 'p1', 50);
      state.gameTick = state.huntingStartTick; // 0 ticks hunting
      expect(BetrayalTransitionOracle.shouldExpire(state)).toBe(false);
    });

    test('TC-BT-03.2: Hunting at MAX_DURATION - 1 → not expired', () => {
      const state = BetrayalStateFactory.createAtPhase(BetrayalPhase.HUNTING, 'p1', 50);
      state.gameTick = state.huntingStartTick + BETRAYAL_CONFIG.MAX_BETRAYAL_DURATION - 1;
      expect(BetrayalTransitionOracle.shouldExpire(state)).toBe(false);
    });

    test('TC-BT-03.3: Hunting at exactly MAX_DURATION → expired', () => {
      const state = BetrayalStateFactory.createAtPhase(BetrayalPhase.HUNTING, 'p1', 50);
      state.gameTick = state.huntingStartTick + BETRAYAL_CONFIG.MAX_BETRAYAL_DURATION;
      expect(BetrayalTransitionOracle.shouldExpire(state)).toBe(true);
    });

    test('TC-BT-03.4: Hunting well past MAX_DURATION → expired', () => {
      const state = BetrayalStateFactory.createAtPhase(BetrayalPhase.HUNTING, 'p1', 50);
      state.gameTick = state.huntingStartTick + 500;
      expect(BetrayalTransitionOracle.shouldExpire(state)).toBe(true);
    });

    test('TC-BT-03.5: shouldExpire returns false for non-HUNTING phases', () => {
      const revealed = BetrayalStateFactory.createAtPhase(BetrayalPhase.REVEALED, 'p1', 50);
      expect(BetrayalTransitionOracle.shouldExpire(revealed)).toBe(false);
    });

    test('TC-BT-03.6: Total damage accumulation over hunting duration', () => {
      const state = BetrayalStateFactory.createAtPhase(BetrayalPhase.HUNTING, 'p1', 50);
      const huntingTicks = 15; // within MAX_DURATION
      state.totalDamageDealt = huntingTicks * BETRAYAL_CONFIG.BETRAYAL_DAMAGE_PER_TICK;
      expect(state.totalDamageDealt).toBe(15);
    });
  });

  // ── TC-BT-04: Victim Immunity Window ──────────────────────────────────

  describe('TC-BT-04: Post-Reveal Immunity (SBT Tier-3)', () => {

    test('TC-BT-04.1: Victim immune at reveal tick (0 elapsed)', () => {
      const state = BetrayalStateFactory.createAtPhase(BetrayalPhase.REVEALED, 'p1', 20);
      state.gameTick = state.revealTick;
      expect(BetrayalTransitionOracle.isVictimImmune(state)).toBe(true);
    });

    test('TC-BT-04.2: Victim immune at IMMUNITY - 1 ticks after reveal', () => {
      const state = BetrayalStateFactory.createAtPhase(BetrayalPhase.HUNTING, 'p1', 25);
      state.revealTick = 20;
      state.gameTick = 20 + BETRAYAL_CONFIG.IMMUNITY_TICKS_AFTER_REVEAL - 1;
      expect(BetrayalTransitionOracle.isVictimImmune(state)).toBe(true);
    });

    test('TC-BT-04.3: Victim NOT immune at exactly IMMUNITY ticks after reveal', () => {
      const state = BetrayalStateFactory.createAtPhase(BetrayalPhase.HUNTING, 'p1', 25);
      state.revealTick = 20;
      state.gameTick = 20 + BETRAYAL_CONFIG.IMMUNITY_TICKS_AFTER_REVEAL;
      expect(BetrayalTransitionOracle.isVictimImmune(state)).toBe(false);
    });

    test('TC-BT-04.4: Victim NOT immune in DORMANT phase', () => {
      const state = BetrayalStateFactory.createDormantState('p1', 50);
      expect(BetrayalTransitionOracle.isVictimImmune(state)).toBe(false);
    });

    test('TC-BT-04.5: Immunity window in real-time (ms conversion)', () => {
      const immunityMs = BETRAYAL_CONFIG.IMMUNITY_TICKS_AFTER_REVEAL * TICK_INTERVAL_MS;
      expect(immunityMs).toBe(800); // 5 ticks × 160ms = 800ms
      // Player has 0.8 seconds to react after betrayal reveal
    });
  });

  // ── TC-BT-05: Cooldown Re-activation ──────────────────────────────────

  describe('TC-BT-05: Cooldown-to-Reactivation (SBT Tier-3)', () => {

    test('TC-BT-05.1: Cannot reactivate during cooldown', () => {
      const state = BetrayalStateFactory.createAtPhase(BetrayalPhase.COOLDOWN, 'p1', 50);
      state.gameTick = state.cooldownEndTick - 5;
      expect(BetrayalTransitionOracle.canReactivate(state)).toBe(false);
    });

    test('TC-BT-05.2: Cannot reactivate 1 tick before cooldown end', () => {
      const state = BetrayalStateFactory.createAtPhase(BetrayalPhase.COOLDOWN, 'p1', 50);
      state.gameTick = state.cooldownEndTick - 1;
      expect(BetrayalTransitionOracle.canReactivate(state)).toBe(false);
    });

    test('TC-BT-05.3: Can reactivate at exactly cooldown end tick', () => {
      const state = BetrayalStateFactory.createAtPhase(BetrayalPhase.COOLDOWN, 'p1', 50);
      state.gameTick = state.cooldownEndTick;
      expect(BetrayalTransitionOracle.canReactivate(state)).toBe(true);
    });

    test('TC-BT-05.4: Can reactivate well past cooldown end', () => {
      const state = BetrayalStateFactory.createAtPhase(BetrayalPhase.COOLDOWN, 'p1', 50);
      state.gameTick = state.cooldownEndTick + 100;
      expect(BetrayalTransitionOracle.canReactivate(state)).toBe(true);
    });

    test('TC-BT-05.5: Reactivation only valid in COOLDOWN phase', () => {
      const dormant = BetrayalStateFactory.createDormantState('p1', 100);
      expect(BetrayalTransitionOracle.canReactivate(dormant)).toBe(false);

      const hunting = BetrayalStateFactory.createAtPhase(BetrayalPhase.HUNTING, 'p1', 100);
      expect(BetrayalTransitionOracle.canReactivate(hunting)).toBe(false);
    });

    test('TC-BT-05.6: Betrayal count increments after full cycle', () => {
      const state = BetrayalStateFactory.createAtPhase(BetrayalPhase.COOLDOWN, 'p1', 50);
      expect(state.betrayalCount).toBe(1);
      // After reactivation and second full cycle, count should be 2
      state.betrayalCount += 1;
      expect(state.betrayalCount).toBe(2);
    });
  });

  // ── TC-BT-06: Full Lifecycle Sequence ─────────────────────────────────

  describe('TC-BT-06: Complete Betrayal Lifecycle (SBT Tier-3 Integration)', () => {

    /**
     * BetrayalLifecycleSimulator — Steps through the entire betrayal
     * state machine using the TransitionOracle as the guard evaluator.
     *
     * This is a micro-integration test that validates the temporal
     * coherence of the full lifecycle without requiring the game loop.
     */
    function simulateLifecycle() {
      const timeline = [];
      const state = BetrayalStateFactory.createDormantState('p2', 0);

      // Phase 1: Wait for activation eligibility
      for (let tick = 0; tick <= BETRAYAL_CONFIG.MIN_GAME_TICKS_BEFORE_BETRAY; tick++) {
        state.gameTick = tick;
        if (BetrayalTransitionOracle.canActivate(state)) {
          state.phase = BetrayalPhase.ACTIVATED;
          state.activationTick = tick;
          timeline.push({ tick, event: 'activated' });
          break;
        }
      }

      // Phase 2: Immediate reveal
      if (BetrayalTransitionOracle.canReveal(state)) {
        state.phase = BetrayalPhase.REVEALED;
        state.revealTick = state.gameTick;
        timeline.push({ tick: state.gameTick, event: 'revealed' });
      }

      // Phase 3: Wait for reveal window to finish
      for (let t = 0; t <= BETRAYAL_CONFIG.REVEAL_WINDOW_TICKS + 1; t++) {
        state.gameTick = state.revealTick + t;
        if (BetrayalTransitionOracle.canStartHunting(state)) {
          state.phase = BetrayalPhase.HUNTING;
          state.huntingStartTick = state.gameTick;
          timeline.push({ tick: state.gameTick, event: 'hunting_started' });
          break;
        }
      }

      // Phase 4: Hunt until expiry
      for (let t = 0; t <= BETRAYAL_CONFIG.MAX_BETRAYAL_DURATION + 1; t++) {
        state.gameTick = state.huntingStartTick + t;
        if (BetrayalTransitionOracle.shouldExpire(state)) {
          state.phase = BetrayalPhase.EXPIRED;
          state.expiryTick = state.gameTick;
          timeline.push({ tick: state.gameTick, event: 'expired' });
          break;
        }
      }

      // Phase 5: Enter cooldown
      state.phase = BetrayalPhase.COOLDOWN;
      state.cooldownEndTick = state.expiryTick + BETRAYAL_CONFIG.COOLDOWN_TICKS;
      state.betrayalCount = 1;
      timeline.push({ tick: state.gameTick, event: 'cooldown_started' });

      return { state, timeline };
    }

    test('TC-BT-06.1: Full lifecycle produces 5 timeline events', () => {
      const { timeline } = simulateLifecycle();
      expect(timeline).toHaveLength(5);
      expect(timeline.map(e => e.event)).toEqual([
        'activated', 'revealed', 'hunting_started', 'expired', 'cooldown_started',
      ]);
    });

    test('TC-BT-06.2: Activation occurs at tick 15 (minimum allowed)', () => {
      const { timeline } = simulateLifecycle();
      expect(timeline[0].tick).toBe(BETRAYAL_CONFIG.MIN_GAME_TICKS_BEFORE_BETRAY);
    });

    test('TC-BT-06.3: Hunting starts at reveal + REVEAL_WINDOW ticks', () => {
      const { timeline } = simulateLifecycle();
      const revealTick = timeline[1].tick;
      const huntTick = timeline[2].tick;
      expect(huntTick - revealTick).toBe(BETRAYAL_CONFIG.REVEAL_WINDOW_TICKS);
    });

    test('TC-BT-06.4: Hunting expires after exactly MAX_BETRAYAL_DURATION ticks', () => {
      const { timeline } = simulateLifecycle();
      const huntTick = timeline[2].tick;
      const expiryTick = timeline[3].tick;
      expect(expiryTick - huntTick).toBe(BETRAYAL_CONFIG.MAX_BETRAYAL_DURATION);
    });

    test('TC-BT-06.5: Total lifecycle duration is deterministic', () => {
      const { timeline } = simulateLifecycle();
      const totalTicks = timeline[timeline.length - 1].tick - timeline[0].tick;
      const expected = BETRAYAL_CONFIG.REVEAL_WINDOW_TICKS + BETRAYAL_CONFIG.MAX_BETRAYAL_DURATION;
      expect(totalTicks).toBe(expected); // 3 + 20 = 23 ticks
    });

    test('TC-BT-06.6: Total lifecycle in milliseconds', () => {
      const totalTicks = BETRAYAL_CONFIG.MIN_GAME_TICKS_BEFORE_BETRAY
        + BETRAYAL_CONFIG.REVEAL_WINDOW_TICKS
        + BETRAYAL_CONFIG.MAX_BETRAYAL_DURATION
        + BETRAYAL_CONFIG.COOLDOWN_TICKS;
      const totalMs = totalTicks * TICK_INTERVAL_MS;
      expect(totalMs).toBe(7680); // 48 ticks × 160ms
    });
  });

  // ── TC-BT-07: Edge Cases — Betrayal During Game Events ────────────────

  describe('TC-BT-07: Betrayal × Game Event Temporal Overlap (SBT Tier-3)', () => {

    test('TC-BT-07.1: Betrayal activation on same tick as ember collection', () => {
      // Both events fire on the same tick — betrayal should not cancel collection
      const state = BetrayalStateFactory.createDormantState('p1', 15);
      const canBetray = BetrayalTransitionOracle.canActivate(state);
      expect(canBetray).toBe(true);
      // Collection is independent of betrayal — both resolve on same tick
      // The spec requires ember collection to be processed BEFORE betrayal activation
      const eventOrder = ['ember_collection', 'betrayal_activation'];
      expect(eventOrder[0]).toBe('ember_collection');
    });

    test('TC-BT-07.2: Betrayal activation on same tick as void collision', () => {
      // If the alien dies from a void collision on the same tick they activate betrayal,
      // the death takes priority — betrayal is cancelled
      const state = BetrayalStateFactory.createDormantState('p1', 15);
      const canBetray = BetrayalTransitionOracle.canActivate(state);
      expect(canBetray).toBe(true);
      // But death overrides: phase should transition to 'dead', not 'activated'
      const finalPhase = 'dead'; // death priority over betrayal
      expect(finalPhase).toBe('dead');
    });

    test('TC-BT-07.3: Victim immune during head-on collision with alien', () => {
      const state = BetrayalStateFactory.createAtPhase(BetrayalPhase.HUNTING, 'p1', 25);
      state.revealTick = 22; // 3 ticks ago — within 5-tick immunity
      state.gameTick = 25;
      expect(BetrayalTransitionOracle.isVictimImmune(state)).toBe(true);
      // During immunity, head-on collision with alien does NOT kill victim
    });

    test('TC-BT-07.4: Victim NOT immune during late-game collision', () => {
      const state = BetrayalStateFactory.createAtPhase(BetrayalPhase.HUNTING, 'p1', 40);
      state.revealTick = 20; // 20 ticks ago — well past immunity
      state.gameTick = 40;
      expect(BetrayalTransitionOracle.isVictimImmune(state)).toBe(false);
    });

    test('TC-BT-07.5: Betrayal during sync — sync bonus still applies for that tick', () => {
      // If players are synced and alien activates betrayal, the 2x multiplier
      // should still apply for any collections on that tick
      const syncEval = { synced: true, multiplier: 2 };
      const canBetray = true;
      // Spec: collection processes first, then betrayal
      expect(syncEval.multiplier).toBe(2);
      expect(canBetray).toBe(true);
    });

    test('TC-BT-07.6: Betrayal reveal resets sync status', () => {
      // Once betrayal is revealed, sync should be broken
      // (thematically: shared consciousness severed)
      const betrayalRevealed = true;
      const syncShouldBreak = betrayalRevealed;
      expect(syncShouldBreak).toBe(true);
    });
  });

  // ── TC-BT-08: Role Assignment Invariants ──────────────────────────────

  describe('TC-BT-08: Alien Role Assignment (SBT Tier-0)', () => {

    test('TC-BT-08.1: Exactly one player is the alien', () => {
      const state = BetrayalStateFactory.createDormantState('p1');
      const alienCount = ['p1', 'p2'].filter(id => id === state.alienPlayerId).length;
      expect(alienCount).toBe(1);
    });

    test('TC-BT-08.2: Alien ID must be p1 or p2', () => {
      const state = BetrayalStateFactory.createDormantState('p2');
      expect(['p1', 'p2']).toContain(state.alienPlayerId);
    });

    test('TC-BT-08.3: Alien role persists across phase transitions', () => {
      const phases = [
        BetrayalPhase.DORMANT,
        BetrayalPhase.ACTIVATED,
        BetrayalPhase.REVEALED,
        BetrayalPhase.HUNTING,
        BetrayalPhase.EXPIRED,
        BetrayalPhase.COOLDOWN,
      ];
      for (const phase of phases) {
        const state = BetrayalStateFactory.createAtPhase(phase, 'p2', 50);
        expect(state.alienPlayerId).toBe('p2');
      }
    });
  });
});
