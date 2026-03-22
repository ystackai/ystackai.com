/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SCHNEIDER PROTOCOL v2.3 — Shared Health Bar Validation Suite
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ticket:    #93 — Salamander × Top Gun — Wingman mode, shared health bar
 * Author:    Dr. Schneider, Principal Architect (PhD ETH Zürich)
 * Module:    SharedHealthPool — Formal Verification of Health Invariants
 *
 * Concept: In Top Gun mode, both players share a single health bar.
 *          Damage from either player depletes the same pool. Healing
 *          (via ember collection) restores the shared pool. Game over
 *          when the shared pool reaches zero.
 *
 * Architecture:
 *   SharedHealthPoolManager (Strategy Pattern)
 *     → HealthDecrementPolicy (damage calculation)
 *     → HealthIncrementPolicy (healing calculation)
 *     → HealthBoundaryEnforcer (clamping)
 *       → HealthEventAuditor (logging/replay)
 *
 * Key Invariant: ∀t: 0 ≤ health(t) ≤ MAX_HEALTH
 *
 * SBT Classification: Tier-0 (bounds), Tier-1 (transitions), Tier-2 (convergence)
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Shared Health Configuration ─────────────────────────────────────────

const HEALTH_CONFIG = Object.freeze({
  MAX_HEALTH: 100,
  INITIAL_HEALTH: 100,
  VOID_DAMAGE: 25,
  SELF_COLLISION_DAMAGE: 50,
  CROSS_COLLISION_DAMAGE: 35,
  HEAD_ON_DAMAGE: 100,        // Instant death — both heads collide
  EMBER_HEAL: 10,
  SYNC_HEAL_BONUS: 5,        // Extra healing when synced
  REGEN_PER_TICK: 0,         // No passive regen (design decision)
  CRITICAL_THRESHOLD: 20,    // Below this, screen flashes red
  OVERHEAL_ALLOWED: false,
});

// ── Shared Health Pool Manager ──────────────────────────────────────────

/**
 * SharedHealthPoolManager — Encapsulates the shared health bar with
 * immutable configuration and deterministic state transitions.
 *
 * Design Pattern: Strategy (damage/heal policies) + Command (audit log)
 *
 * Per Schneider Principle #12: "A health bar is a bounded monotonic
 * sequence with intermittent positive perturbations. Model it as such."
 */
class SharedHealthPoolManager {
  constructor(config = HEALTH_CONFIG) {
    this._config = config;
    this._health = config.INITIAL_HEALTH;
    this._auditLog = [];
    this._isDead = false;
  }

  get health() { return this._health; }
  get isDead() { return this._isDead; }
  get isCritical() { return this._health <= this._config.CRITICAL_THRESHOLD && this._health > 0; }
  get healthPercent() { return (this._health / this._config.MAX_HEALTH) * 100; }
  get auditLog() { return [...this._auditLog]; }

  /**
   * applyDamage — Reduces health by the specified amount, clamped to [0, MAX].
   *
   * @param {number} amount — Raw damage before any modifiers
   * @param {string} source — Damage source identifier for audit
   * @returns {{ newHealth: number, isDead: boolean, overkill: number }}
   */
  applyDamage(amount, source = 'unknown') {
    if (this._isDead) {
      return { newHealth: 0, isDead: true, overkill: amount };
    }

    const priorHealth = this._health;
    const effectiveDamage = Math.max(0, amount); // No negative damage
    this._health = Math.max(0, this._health - effectiveDamage);
    const overkill = Math.max(0, effectiveDamage - priorHealth);

    if (this._health === 0) {
      this._isDead = true;
    }

    this._auditLog.push({
      type: 'damage',
      amount: effectiveDamage,
      source,
      priorHealth,
      newHealth: this._health,
      overkill,
    });

    return {
      newHealth: this._health,
      isDead: this._isDead,
      overkill,
    };
  }

  /**
   * applyHeal — Increases health by the specified amount, clamped to MAX.
   *
   * @param {number} amount — Raw heal before modifiers
   * @param {boolean} synced — Whether players are synced (bonus heal)
   * @returns {{ newHealth: number, overheal: number }}
   */
  applyHeal(amount, synced = false) {
    if (this._isDead) {
      return { newHealth: 0, overheal: 0 };
    }

    const priorHealth = this._health;
    const bonus = synced ? this._config.SYNC_HEAL_BONUS : 0;
    const totalHeal = Math.max(0, amount + bonus);

    if (this._config.OVERHEAL_ALLOWED) {
      this._health += totalHeal;
    } else {
      this._health = Math.min(this._config.MAX_HEALTH, this._health + totalHeal);
    }

    const overheal = Math.max(0, (priorHealth + totalHeal) - this._config.MAX_HEALTH);

    this._auditLog.push({
      type: 'heal',
      amount: totalHeal,
      synced,
      priorHealth,
      newHealth: this._health,
      overheal,
    });

    return {
      newHealth: this._health,
      overheal,
    };
  }

  reset() {
    this._health = this._config.INITIAL_HEALTH;
    this._isDead = false;
    this._auditLog = [];
  }
}

// ── Damage Source Classifier ────────────────────────────────────────────

/**
 * DamageSourceClassifier — Maps collision types to damage amounts.
 *
 * This abstraction decouples the collision detection layer from the
 * health management layer (Dependency Inversion Principle).
 */
class DamageSourceClassifier {
  constructor(config = HEALTH_CONFIG) {
    this._damageTable = Object.freeze({
      'void-collision': config.VOID_DAMAGE,
      'self-collision': config.SELF_COLLISION_DAMAGE,
      'cross-collision': config.CROSS_COLLISION_DAMAGE,
      'head-on-collision': config.HEAD_ON_DAMAGE,
    });
  }

  getDamageForCollision(collisionType) {
    return this._damageTable[collisionType] || 0;
  }

  isLethalCollision(collisionType, currentHealth) {
    const damage = this.getDamageForCollision(collisionType);
    return damage >= currentHealth;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// TEST SUITE: TC-SH — Shared Health Pool Validation
// ══════════════════════════════════════════════════════════════════════════

describe('Schneider Protocol v2.3 — Shared Health Bar Validation', () => {

  let pool;
  let classifier;

  beforeEach(() => {
    pool = new SharedHealthPoolManager();
    classifier = new DamageSourceClassifier();
  });

  // ── TC-SH-00: Initial State Verification ──────────────────────────────

  describe('TC-SH-00: Initial State (SBT Tier-0)', () => {

    test('TC-SH-00.1: Health initializes to MAX_HEALTH', () => {
      expect(pool.health).toBe(HEALTH_CONFIG.MAX_HEALTH);
      expect(pool.health).toBe(100);
    });

    test('TC-SH-00.2: Not dead on init', () => {
      expect(pool.isDead).toBe(false);
    });

    test('TC-SH-00.3: Not critical on init', () => {
      expect(pool.isCritical).toBe(false);
    });

    test('TC-SH-00.4: Health percent is 100% on init', () => {
      expect(pool.healthPercent).toBe(100);
    });

    test('TC-SH-00.5: Audit log is empty on init', () => {
      expect(pool.auditLog).toEqual([]);
    });
  });

  // ── TC-SH-01: Damage Application Boundaries ──────────────────────────

  describe('TC-SH-01: Damage Application (SBT Tier-1)', () => {

    test('TC-SH-01.1: Void collision deals 25 damage', () => {
      const result = pool.applyDamage(HEALTH_CONFIG.VOID_DAMAGE, 'void-collision');
      expect(result.newHealth).toBe(75);
      expect(result.isDead).toBe(false);
      expect(result.overkill).toBe(0);
    });

    test('TC-SH-01.2: Self-collision deals 50 damage', () => {
      const result = pool.applyDamage(HEALTH_CONFIG.SELF_COLLISION_DAMAGE, 'self-collision');
      expect(result.newHealth).toBe(50);
      expect(result.isDead).toBe(false);
    });

    test('TC-SH-01.3: Cross-collision deals 35 damage', () => {
      const result = pool.applyDamage(HEALTH_CONFIG.CROSS_COLLISION_DAMAGE, 'cross-collision');
      expect(result.newHealth).toBe(65);
      expect(result.isDead).toBe(false);
    });

    test('TC-SH-01.4: Head-on collision deals 100 damage → instant death', () => {
      const result = pool.applyDamage(HEALTH_CONFIG.HEAD_ON_DAMAGE, 'head-on-collision');
      expect(result.newHealth).toBe(0);
      expect(result.isDead).toBe(true);
      expect(result.overkill).toBe(0);
    });

    test('TC-SH-01.5: Damage cannot bring health below 0 (clamping)', () => {
      pool.applyDamage(80);
      const result = pool.applyDamage(50); // 20 health, 50 damage → 0, not -30
      expect(result.newHealth).toBe(0);
      expect(result.overkill).toBe(30);
    });

    test('TC-SH-01.6: Zero damage is a no-op', () => {
      const result = pool.applyDamage(0);
      expect(result.newHealth).toBe(100);
      expect(result.isDead).toBe(false);
    });

    test('TC-SH-01.7: Negative damage is treated as 0 (no negative damage)', () => {
      const result = pool.applyDamage(-10);
      expect(result.newHealth).toBe(100);
    });

    test('TC-SH-01.8: Damage to dead pool returns immediately', () => {
      pool.applyDamage(100);
      expect(pool.isDead).toBe(true);
      const result = pool.applyDamage(50);
      expect(result.newHealth).toBe(0);
      expect(result.isDead).toBe(true);
      expect(result.overkill).toBe(50);
    });
  });

  // ── TC-SH-02: Healing Boundaries ─────────────────────────────────────

  describe('TC-SH-02: Healing Application (SBT Tier-1)', () => {

    test('TC-SH-02.1: Ember collection heals 10 HP', () => {
      pool.applyDamage(30);
      const result = pool.applyHeal(HEALTH_CONFIG.EMBER_HEAL);
      expect(result.newHealth).toBe(80);
    });

    test('TC-SH-02.2: Synced ember collection heals 15 HP (10 base + 5 bonus)', () => {
      pool.applyDamage(30);
      const result = pool.applyHeal(HEALTH_CONFIG.EMBER_HEAL, true);
      expect(result.newHealth).toBe(85);
    });

    test('TC-SH-02.3: Heal cannot exceed MAX_HEALTH (no overheal)', () => {
      pool.applyDamage(5);
      const result = pool.applyHeal(HEALTH_CONFIG.EMBER_HEAL);
      expect(result.newHealth).toBe(100); // capped at 100, not 105
      expect(result.overheal).toBe(5);
    });

    test('TC-SH-02.4: Heal at full health → overheal reported', () => {
      const result = pool.applyHeal(10);
      expect(result.newHealth).toBe(100);
      expect(result.overheal).toBe(10);
    });

    test('TC-SH-02.5: Heal does nothing when dead', () => {
      pool.applyDamage(100);
      const result = pool.applyHeal(50);
      expect(result.newHealth).toBe(0);
      expect(result.overheal).toBe(0);
    });

    test('TC-SH-02.6: Zero heal is valid', () => {
      pool.applyDamage(20);
      const result = pool.applyHeal(0);
      expect(result.newHealth).toBe(80);
    });

    test('TC-SH-02.7: Negative heal treated as 0', () => {
      pool.applyDamage(20);
      const result = pool.applyHeal(-5);
      expect(result.newHealth).toBe(80);
    });
  });

  // ── TC-SH-03: Critical Threshold ─────────────────────────────────────

  describe('TC-SH-03: Critical Health Threshold (SBT Tier-1)', () => {

    test('TC-SH-03.1: Health at 21 → not critical', () => {
      pool.applyDamage(79);
      expect(pool.health).toBe(21);
      expect(pool.isCritical).toBe(false);
    });

    test('TC-SH-03.2: Health at 20 → critical (exact boundary)', () => {
      pool.applyDamage(80);
      expect(pool.health).toBe(20);
      expect(pool.isCritical).toBe(true);
    });

    test('TC-SH-03.3: Health at 1 → critical', () => {
      pool.applyDamage(99);
      expect(pool.health).toBe(1);
      expect(pool.isCritical).toBe(true);
    });

    test('TC-SH-03.4: Health at 0 → NOT critical (dead, not critical)', () => {
      pool.applyDamage(100);
      expect(pool.health).toBe(0);
      expect(pool.isCritical).toBe(false); // dead takes precedence
    });

    test('TC-SH-03.5: Heal from critical to non-critical', () => {
      pool.applyDamage(85);
      expect(pool.isCritical).toBe(true); // health = 15
      pool.applyHeal(10);
      expect(pool.health).toBe(25);
      expect(pool.isCritical).toBe(false);
    });
  });

  // ── TC-SH-04: Health Percent Calculation ──────────────────────────────

  describe('TC-SH-04: Health Percentage (SBT Tier-0)', () => {

    test('TC-SH-04.1: Full health = 100%', () => {
      expect(pool.healthPercent).toBe(100);
    });

    test('TC-SH-04.2: Half health = 50%', () => {
      pool.applyDamage(50);
      expect(pool.healthPercent).toBe(50);
    });

    test('TC-SH-04.3: Zero health = 0%', () => {
      pool.applyDamage(100);
      expect(pool.healthPercent).toBe(0);
    });

    test('TC-SH-04.4: Quarter health = 25%', () => {
      pool.applyDamage(75);
      expect(pool.healthPercent).toBe(25);
    });

    test('TC-SH-04.5: Health = 1 → 1%', () => {
      pool.applyDamage(99);
      expect(pool.healthPercent).toBe(1);
    });
  });

  // ── TC-SH-05: Audit Log Integrity ────────────────────────────────────

  describe('TC-SH-05: Audit Log (SBT Tier-0)', () => {

    test('TC-SH-05.1: Damage events are logged', () => {
      pool.applyDamage(25, 'void-collision');
      const log = pool.auditLog;
      expect(log).toHaveLength(1);
      expect(log[0]).toEqual({
        type: 'damage',
        amount: 25,
        source: 'void-collision',
        priorHealth: 100,
        newHealth: 75,
        overkill: 0,
      });
    });

    test('TC-SH-05.2: Heal events are logged', () => {
      pool.applyDamage(30);
      pool.applyHeal(10, true);
      const log = pool.auditLog;
      expect(log).toHaveLength(2);
      expect(log[1].type).toBe('heal');
      expect(log[1].synced).toBe(true);
      expect(log[1].amount).toBe(15); // 10 + 5 sync bonus
    });

    test('TC-SH-05.3: Audit log preserves chronological order', () => {
      pool.applyDamage(10, 'hit-1');
      pool.applyDamage(20, 'hit-2');
      pool.applyHeal(5);
      pool.applyDamage(15, 'hit-3');
      const log = pool.auditLog;
      expect(log.map(e => e.type)).toEqual(['damage', 'damage', 'heal', 'damage']);
      expect(log.map(e => e.priorHealth)).toEqual([100, 90, 70, 75]);
    });

    test('TC-SH-05.4: Audit log is a defensive copy (immutable externally)', () => {
      pool.applyDamage(10);
      const log1 = pool.auditLog;
      log1.push({ fake: true });
      const log2 = pool.auditLog;
      expect(log2).toHaveLength(1); // push to copy did not affect internal
    });

    test('TC-SH-05.5: Reset clears audit log', () => {
      pool.applyDamage(10);
      pool.applyDamage(20);
      expect(pool.auditLog).toHaveLength(2);
      pool.reset();
      expect(pool.auditLog).toEqual([]);
      expect(pool.health).toBe(100);
      expect(pool.isDead).toBe(false);
    });
  });

  // ── TC-SH-06: Damage Source Classifier ────────────────────────────────

  describe('TC-SH-06: Damage Source Classification (SBT Tier-0)', () => {

    test('TC-SH-06.1: Void collision → 25 damage', () => {
      expect(classifier.getDamageForCollision('void-collision')).toBe(25);
    });

    test('TC-SH-06.2: Self-collision → 50 damage', () => {
      expect(classifier.getDamageForCollision('self-collision')).toBe(50);
    });

    test('TC-SH-06.3: Cross-collision → 35 damage', () => {
      expect(classifier.getDamageForCollision('cross-collision')).toBe(35);
    });

    test('TC-SH-06.4: Head-on → 100 damage', () => {
      expect(classifier.getDamageForCollision('head-on-collision')).toBe(100);
    });

    test('TC-SH-06.5: Unknown collision type → 0 damage', () => {
      expect(classifier.getDamageForCollision('unknown')).toBe(0);
    });

    test('TC-SH-06.6: isLethalCollision — head-on at full health is lethal', () => {
      expect(classifier.isLethalCollision('head-on-collision', 100)).toBe(true);
    });

    test('TC-SH-06.7: isLethalCollision — void at full health is NOT lethal', () => {
      expect(classifier.isLethalCollision('void-collision', 100)).toBe(false);
    });

    test('TC-SH-06.8: isLethalCollision — void at 25 health IS lethal', () => {
      expect(classifier.isLethalCollision('void-collision', 25)).toBe(true);
    });

    test('TC-SH-06.9: isLethalCollision — void at 26 health is NOT lethal', () => {
      expect(classifier.isLethalCollision('void-collision', 26)).toBe(false);
    });
  });

  // ── TC-SH-07: Multi-Hit Scenarios ────────────────────────────────────

  describe('TC-SH-07: Sequential Damage Scenarios (SBT Tier-2)', () => {

    test('TC-SH-07.1: Four void hits → death (4 × 25 = 100)', () => {
      for (let i = 0; i < 4; i++) {
        pool.applyDamage(HEALTH_CONFIG.VOID_DAMAGE, `void-${i}`);
      }
      expect(pool.health).toBe(0);
      expect(pool.isDead).toBe(true);
    });

    test('TC-SH-07.2: Three void hits → alive at 25 HP', () => {
      for (let i = 0; i < 3; i++) {
        pool.applyDamage(HEALTH_CONFIG.VOID_DAMAGE);
      }
      expect(pool.health).toBe(25);
      expect(pool.isDead).toBe(false);
      expect(pool.isCritical).toBe(false); // 25 > 20 threshold
    });

    test('TC-SH-07.3: Damage-heal-damage sequence', () => {
      pool.applyDamage(50);   // 100 → 50
      pool.applyHeal(10);     // 50 → 60
      pool.applyDamage(35);   // 60 → 25
      pool.applyHeal(10, true); // 25 → 40 (10 + 5 sync)
      pool.applyDamage(25);   // 40 → 15

      expect(pool.health).toBe(15);
      expect(pool.isCritical).toBe(true);
      expect(pool.isDead).toBe(false);
    });

    test('TC-SH-07.4: Both players take damage on same tick → additive', () => {
      // P1 hits a void, P2 self-collides — both deplete shared pool
      const dmg1 = classifier.getDamageForCollision('void-collision');
      const dmg2 = classifier.getDamageForCollision('self-collision');
      pool.applyDamage(dmg1, 'p1-void');
      pool.applyDamage(dmg2, 'p2-self');
      expect(pool.health).toBe(100 - 25 - 50); // = 25
    });

    test('TC-SH-07.5: P1 heals while P2 takes damage on same tick', () => {
      pool.applyDamage(50); // bring to 50
      // Order matters: heal first, then damage (per spec)
      pool.applyHeal(HEALTH_CONFIG.EMBER_HEAL); // 50 → 60
      pool.applyDamage(HEALTH_CONFIG.VOID_DAMAGE); // 60 → 35
      expect(pool.health).toBe(35);
    });
  });

  // ── TC-SH-08: Edge Case — Exact Death Boundary ───────────────────────

  describe('TC-SH-08: Exact Death Boundary (SBT Tier-1)', () => {

    test('TC-SH-08.1: Damage exactly equal to remaining health → dead, overkill=0', () => {
      pool.applyDamage(75);
      const result = pool.applyDamage(25);
      expect(result.newHealth).toBe(0);
      expect(result.isDead).toBe(true);
      expect(result.overkill).toBe(0);
    });

    test('TC-SH-08.2: Damage one more than remaining → dead, overkill=1', () => {
      pool.applyDamage(75);
      const result = pool.applyDamage(26);
      expect(result.newHealth).toBe(0);
      expect(result.isDead).toBe(true);
      expect(result.overkill).toBe(1);
    });

    test('TC-SH-08.3: Damage one less than remaining → alive at 1 HP', () => {
      pool.applyDamage(75);
      const result = pool.applyDamage(24);
      expect(result.newHealth).toBe(1);
      expect(result.isDead).toBe(false);
    });

    test('TC-SH-08.4: Health = 1, void damage (25) → dead, overkill=24', () => {
      pool.applyDamage(99);
      expect(pool.health).toBe(1);
      const result = pool.applyDamage(HEALTH_CONFIG.VOID_DAMAGE);
      expect(result.newHealth).toBe(0);
      expect(result.isDead).toBe(true);
      expect(result.overkill).toBe(24);
    });
  });

  // ── TC-SH-09: Custom Config Scenarios ─────────────────────────────────

  describe('TC-SH-09: Custom Configuration (SBT Tier-0)', () => {

    test('TC-SH-09.1: Low-health mode (MAX_HEALTH=20) — faster death', () => {
      const lowPool = new SharedHealthPoolManager({
        ...HEALTH_CONFIG,
        MAX_HEALTH: 20,
        INITIAL_HEALTH: 20,
      });
      expect(lowPool.health).toBe(20);
      lowPool.applyDamage(25);
      expect(lowPool.health).toBe(0);
      expect(lowPool.isDead).toBe(true);
    });

    test('TC-SH-09.2: Overheal mode enabled', () => {
      const overhealPool = new SharedHealthPoolManager({
        ...HEALTH_CONFIG,
        OVERHEAL_ALLOWED: true,
      });
      overhealPool.applyHeal(50);
      expect(overhealPool.health).toBe(150); // exceeds MAX
    });

    test('TC-SH-09.3: Zero initial health → immediately dead on first damage', () => {
      const zeroPool = new SharedHealthPoolManager({
        ...HEALTH_CONFIG,
        INITIAL_HEALTH: 0,
        MAX_HEALTH: 100,
      });
      expect(zeroPool.health).toBe(0);
      expect(zeroPool.isDead).toBe(false); // not dead until damage applied
      const result = zeroPool.applyDamage(1);
      expect(result.isDead).toBe(true);
    });
  });
});
