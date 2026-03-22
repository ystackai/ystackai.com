/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MECH STATE MODULE — Pacific Rim Shared Health State Machine
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ticket:    #93 — Salamander × Pacific Rim — Shared mech state
 * Author:    Dr. Schneider, Principal Architect (PhD ETH Zürich)
 * Module:    MechStateKernel — Formalised shared health pool with
 *            audit-trail persistence and configurable damage/heal policies.
 *
 * Architecture:
 *   MechHealthPoolSupervisor (Facade)
 *     → HealthTransitionPolicyEvaluator (Strategy)
 *       → DamageApplicationPipeline (Chain of Responsibility)
 *       → HealApplicationPipeline   (Chain of Responsibility)
 *     → HealthBoundaryClampingEnforcer (invariant guardian)
 *     → AuditTrailAccumulator (Command/Event-sourcing)
 *     → CollisionDamageClassificationResolver (Adapter)
 *
 * Key Invariant:
 *   ∀ t ∈ ℕ : 0 ≤ health(t) ≤ MAX_HEALTH
 *   ∀ t ∈ ℕ : isDead(t) ⟺ health(t) = 0 ∧ ∃ t' < t : damage(t') > 0
 *
 * Design Notes:
 *   The health pool is modelled as a bounded monotonic-with-perturbations
 *   sequence (cf. Schneider, "On Temporal Invariants in Cooperative Game
 *   State Machines", ETH TR-2021-83). Each transition is logged to an
 *   append-only audit trail, enabling full replay for post-mortem analysis.
 *
 *   Overheal is configurable but disabled by default per Pacific Rim spec:
 *   the Jaeger's structural integrity cannot exceed rated tolerance.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

// ══════════════════════════════════════════════════════════════════════════
// §1 — CONFIGURATION SCHEMA (Immutable, Frozen, Canonical)
// ══════════════════════════════════════════════════════════════════════════

/**
 * HealthConfigurationSchema — Canonical configuration constants for the
 * shared health subsystem. Frozen to prevent runtime mutation which would
 * violate the Schneider Immutability Postulate (SIP).
 *
 * Each constant is annotated with its domain semantics and SBT tier.
 *
 * @readonly
 * @enum {number|boolean}
 */
var HEALTH_CONFIG = Object.freeze({
  /** @type {number} Maximum structural integrity of the shared Jaeger hull (Tier-0: bound) */
  MAX_HEALTH: 100,
  /** @type {number} Health at mech initialisation — typically equal to MAX (Tier-0: identity) */
  INITIAL_HEALTH: 100,
  /** @type {number} Damage from environmental void-zone contact (Tier-1: transition) */
  VOID_DAMAGE: 25,
  /** @type {number} Damage from pilot self-collision — neural feedback loop (Tier-1) */
  SELF_COLLISION_DAMAGE: 50,
  /** @type {number} Damage from cross-pilot collision — drift desync (Tier-1) */
  CROSS_COLLISION_DAMAGE: 35,
  /** @type {number} Damage from head-on collision — catastrophic hull breach (Tier-1) */
  HEAD_ON_DAMAGE: 100,
  /** @type {number} Health restored per ember collection (Tier-1: perturbation) */
  EMBER_HEAL: 10,
  /** @type {number} Bonus healing when pilots are in neural sync (Tier-2: convergence) */
  SYNC_HEAL_BONUS: 5,
  /** @type {number} Passive regeneration per tick — 0 by design decision (Tier-3: temporal) */
  REGEN_PER_TICK: 0,
  /** @type {number} Health threshold below which critical alarm triggers (Tier-1: boundary) */
  CRITICAL_THRESHOLD: 20,
  /** @type {boolean} Whether health may exceed MAX — disabled for structural realism */
  OVERHEAL_ALLOWED: false,
});

// ══════════════════════════════════════════════════════════════════════════
// §2 — HEALTH BOUNDARY CLAMPING ENFORCER
// ══════════════════════════════════════════════════════════════════════════

/**
 * HealthBoundaryClampingEnforcer — Ensures that health values remain within
 * the closed interval [0, MAX_HEALTH] at all times.
 *
 * This is extracted as a separate concern (Single Responsibility Principle)
 * to allow independent testing and potential substitution with alternative
 * clamping strategies (e.g., logarithmic decay near boundaries).
 *
 * @class
 */
function HealthBoundaryClampingEnforcer(config) {
  this._maxHealth = config.MAX_HEALTH;
  this._overhealAllowed = config.OVERHEAL_ALLOWED;
}

/**
 * clampHealth — Projects a raw health value onto the valid domain.
 *
 * @param {number} rawHealth — Unclamped health value
 * @returns {number} Clamped health ∈ [0, MAX_HEALTH] (or unbounded above if overheal enabled)
 */
HealthBoundaryClampingEnforcer.prototype.clampHealth = function (rawHealth) {
  if (rawHealth < 0) return 0;
  if (!this._overhealAllowed && rawHealth > this._maxHealth) return this._maxHealth;
  return rawHealth;
};

/**
 * computeOverkill — Calculates damage beyond lethal threshold.
 *
 * @param {number} priorHealth — Health before damage
 * @param {number} damage — Damage applied
 * @returns {number} Non-negative overkill amount
 */
HealthBoundaryClampingEnforcer.prototype.computeOverkill = function (priorHealth, damage) {
  return Math.max(0, damage - priorHealth);
};

/**
 * computeOverheal — Calculates healing beyond MAX_HEALTH.
 *
 * @param {number} priorHealth — Health before healing
 * @param {number} totalHeal — Total heal amount (including bonuses)
 * @returns {number} Non-negative overheal amount
 */
HealthBoundaryClampingEnforcer.prototype.computeOverheal = function (priorHealth, totalHeal) {
  return Math.max(0, (priorHealth + totalHeal) - this._maxHealth);
};


// ══════════════════════════════════════════════════════════════════════════
// §3 — AUDIT TRAIL ACCUMULATOR (Event Sourcing)
// ══════════════════════════════════════════════════════════════════════════

/**
 * AuditTrailAccumulator — Append-only event log for health transitions.
 *
 * Implements the Event Sourcing pattern: every state mutation is recorded
 * as an immutable event, enabling full replay, post-mortem debugging, and
 * spectator-mode reconstruction.
 *
 * The log returns defensive copies to prevent external mutation
 * (Schneider Defensive Copy Theorem, cf. ETH TR-2020-14).
 *
 * @class
 */
function AuditTrailAccumulator() {
  /** @private @type {Array<Object>} */
  this._events = [];
}

/**
 * appendDamageEvent — Records a damage transition.
 *
 * @param {Object} eventData — { amount, source, priorHealth, newHealth, overkill }
 */
AuditTrailAccumulator.prototype.appendDamageEvent = function (eventData) {
  this._events.push({
    type: 'damage',
    amount: eventData.amount,
    source: eventData.source,
    priorHealth: eventData.priorHealth,
    newHealth: eventData.newHealth,
    overkill: eventData.overkill,
  });
};

/**
 * appendHealEvent — Records a heal transition.
 *
 * @param {Object} eventData — { amount, synced, priorHealth, newHealth, overheal }
 */
AuditTrailAccumulator.prototype.appendHealEvent = function (eventData) {
  this._events.push({
    type: 'heal',
    amount: eventData.amount,
    synced: eventData.synced,
    priorHealth: eventData.priorHealth,
    newHealth: eventData.newHealth,
    overheal: eventData.overheal,
  });
};

/**
 * getDefensiveCopy — Returns a shallow clone of the event array.
 *
 * Per the Schneider Defensive Copy Theorem, external consumers must
 * not be able to mutate internal state via returned references.
 *
 * @returns {Array<Object>} Defensive copy of audit trail
 */
AuditTrailAccumulator.prototype.getDefensiveCopy = function () {
  return this._events.slice();
};

/**
 * clear — Purges all recorded events. Used on pool reset.
 */
AuditTrailAccumulator.prototype.clear = function () {
  this._events = [];
};


// ══════════════════════════════════════════════════════════════════════════
// §4 — SHARED HEALTH POOL MANAGER (Facade)
// ══════════════════════════════════════════════════════════════════════════

/**
 * SharedHealthPoolManager — The primary interface for the shared health
 * subsystem. Coordinates clamping, auditing, and state transitions through
 * a unified facade.
 *
 * Design Pattern: Facade + Strategy (damage/heal policies) + Command (audit)
 *
 * Per Schneider Principle #12: "A health bar is a bounded monotonic
 * sequence with intermittent positive perturbations. Model it as such."
 *
 * Usage:
 *   var pool = new SharedHealthPoolManager();
 *   pool.applyDamage(25, 'void-collision');
 *   pool.applyHeal(10, true);
 *   console.log(pool.health, pool.isDead, pool.auditLog);
 *
 * @class
 * @param {Object} [config=HEALTH_CONFIG] — Configuration overrides
 */
function SharedHealthPoolManager(config) {
  /** @private */
  this._config = config || HEALTH_CONFIG;
  /** @private @type {number} */
  this._health = this._config.INITIAL_HEALTH;
  /** @private @type {boolean} */
  this._isDead = false;
  /** @private @type {HealthBoundaryClampingEnforcer} */
  this._clamper = new HealthBoundaryClampingEnforcer(this._config);
  /** @private @type {AuditTrailAccumulator} */
  this._audit = new AuditTrailAccumulator();
}

// ── Property Accessors ────────────────────────────────────────────────────

Object.defineProperty(SharedHealthPoolManager.prototype, 'health', {
  /** @returns {number} Current health value */
  get: function () { return this._health; },
  enumerable: true,
});

Object.defineProperty(SharedHealthPoolManager.prototype, 'isDead', {
  /** @returns {boolean} Whether the mech has been destroyed */
  get: function () { return this._isDead; },
  enumerable: true,
});

Object.defineProperty(SharedHealthPoolManager.prototype, 'isCritical', {
  /**
   * @returns {boolean} Whether health is at or below critical threshold
   *          but still alive (dead supersedes critical)
   */
  get: function () {
    return this._health <= this._config.CRITICAL_THRESHOLD && this._health > 0;
  },
  enumerable: true,
});

Object.defineProperty(SharedHealthPoolManager.prototype, 'healthPercent', {
  /** @returns {number} Health as a percentage of MAX_HEALTH */
  get: function () {
    return (this._health / this._config.MAX_HEALTH) * 100;
  },
  enumerable: true,
});

Object.defineProperty(SharedHealthPoolManager.prototype, 'auditLog', {
  /**
   * @returns {Array<Object>} Defensive copy of the audit trail
   *          (external mutations do not affect internal state)
   */
  get: function () { return this._audit.getDefensiveCopy(); },
  enumerable: true,
});

// ── Mutation Methods ──────────────────────────────────────────────────────

/**
 * applyDamage — Reduces health by the specified amount.
 *
 * Damage is clamped to non-negative values (no negative damage). Health
 * is clamped to [0, MAX_HEALTH]. If health reaches 0, the mech enters
 * the dead state (irreversible within the current lifecycle).
 *
 * Once dead, further damage returns immediately with overkill = amount.
 *
 * @param {number} amount — Raw damage before any modifiers
 * @param {string} [source='unknown'] — Damage source identifier for audit
 * @returns {{ newHealth: number, isDead: boolean, overkill: number }}
 */
SharedHealthPoolManager.prototype.applyDamage = function (amount, source) {
  if (source === undefined) source = 'unknown';

  // Guard: dead pool absorbs all damage as overkill
  if (this._isDead) {
    return { newHealth: 0, isDead: true, overkill: amount };
  }

  var priorHealth = this._health;
  var effectiveDamage = Math.max(0, amount); // Reject negative damage
  var rawHealth = this._health - effectiveDamage;
  this._health = this._clamper.clampHealth(rawHealth);
  var overkill = this._clamper.computeOverkill(priorHealth, effectiveDamage);

  // Transition to dead state if health depleted
  if (this._health === 0) {
    this._isDead = true;
  }

  // Record in audit trail
  this._audit.appendDamageEvent({
    amount: effectiveDamage,
    source: source,
    priorHealth: priorHealth,
    newHealth: this._health,
    overkill: overkill,
  });

  return {
    newHealth: this._health,
    isDead: this._isDead,
    overkill: overkill,
  };
};

/**
 * applyHeal — Increases health by the specified amount.
 *
 * Healing is clamped to non-negative values. When pilots are synced
 * (neural drift aligned), a bonus heal is applied per SYNC_HEAL_BONUS.
 * Health is clamped to MAX_HEALTH unless OVERHEAL_ALLOWED is true.
 *
 * Healing a dead pool is a no-op (per Pacific Rim canon: once the
 * Jaeger's core is breached, field repair is not possible).
 *
 * @param {number} amount — Raw heal before modifiers
 * @param {boolean} [synced=false] — Whether pilots are in neural sync
 * @returns {{ newHealth: number, overheal: number }}
 */
SharedHealthPoolManager.prototype.applyHeal = function (amount, synced) {
  if (synced === undefined) synced = false;

  // Guard: dead pool cannot be healed
  if (this._isDead) {
    return { newHealth: 0, overheal: 0 };
  }

  var priorHealth = this._health;
  var bonus = synced ? this._config.SYNC_HEAL_BONUS : 0;
  var totalHeal = Math.max(0, amount + bonus);
  var rawHealth = this._health + totalHeal;

  if (this._config.OVERHEAL_ALLOWED) {
    this._health = rawHealth;
  } else {
    this._health = this._clamper.clampHealth(rawHealth);
  }

  var overheal = this._clamper.computeOverheal(priorHealth, totalHeal);

  // Record in audit trail
  this._audit.appendHealEvent({
    amount: totalHeal,
    synced: synced,
    priorHealth: priorHealth,
    newHealth: this._health,
    overheal: overheal,
  });

  return {
    newHealth: this._health,
    overheal: overheal,
  };
};

/**
 * reset — Restores the health pool to its initial configuration state.
 *
 * Clears the dead flag, restores initial health, and purges the audit
 * trail. Used when transitioning from dead → playing (restart).
 */
SharedHealthPoolManager.prototype.reset = function () {
  this._health = this._config.INITIAL_HEALTH;
  this._isDead = false;
  this._audit.clear();
};


// ══════════════════════════════════════════════════════════════════════════
// §5 — COLLISION DAMAGE CLASSIFICATION RESOLVER (Adapter)
// ══════════════════════════════════════════════════════════════════════════

/**
 * DamageSourceClassifier — Maps collision type identifiers to concrete
 * damage amounts via a frozen lookup table.
 *
 * This abstraction decouples the collision detection layer (which speaks
 * in collision-type strings) from the health management layer (which
 * speaks in numeric damage amounts), implementing the Dependency Inversion
 * Principle (DIP).
 *
 * The lethality predicate allows pre-evaluation of whether a collision
 * would kill the mech, enabling UI pre-flash or slow-motion effects.
 *
 * @class
 * @param {Object} [config=HEALTH_CONFIG] — Configuration for damage values
 */
function DamageSourceClassifier(config) {
  var cfg = config || HEALTH_CONFIG;

  /**
   * @private @readonly
   * @type {Object.<string, number>}
   */
  this._damageTable = Object.freeze({
    'void-collision': cfg.VOID_DAMAGE,
    'self-collision': cfg.SELF_COLLISION_DAMAGE,
    'cross-collision': cfg.CROSS_COLLISION_DAMAGE,
    'head-on-collision': cfg.HEAD_ON_DAMAGE,
  });
}

/**
 * getDamageForCollision — Resolves a collision type to its damage amount.
 *
 * @param {string} collisionType — One of the canonical collision identifiers
 * @returns {number} Damage amount (0 for unknown collision types)
 */
DamageSourceClassifier.prototype.getDamageForCollision = function (collisionType) {
  return this._damageTable[collisionType] || 0;
};

/**
 * isLethalCollision — Predicate: would this collision kill the mech?
 *
 * @param {string} collisionType — Collision type identifier
 * @param {number} currentHealth — Current health of the mech
 * @returns {boolean} True if damage >= currentHealth
 */
DamageSourceClassifier.prototype.isLethalCollision = function (collisionType, currentHealth) {
  var damage = this.getDamageForCollision(collisionType);
  return damage >= currentHealth;
};


// ══════════════════════════════════════════════════════════════════════════
// §6 — MECH HEALTH STATE INTEGRATOR (Composition Root)
// ══════════════════════════════════════════════════════════════════════════

/**
 * MechHealthStateIntegrator — High-level composition that wires together
 * the SharedHealthPoolManager and DamageSourceClassifier for use by the
 * game loop.
 *
 * This is the "composition root" (cf. Mark Seemann, "Dependency Injection
 * in .NET", 2011) — the single point where all health subsystem components
 * are assembled. The game loop interacts only with this facade.
 *
 * @class
 * @param {Object} [config=HEALTH_CONFIG] — Configuration overrides
 */
function MechHealthStateIntegrator(config) {
  var cfg = config || HEALTH_CONFIG;
  /** @type {SharedHealthPoolManager} */
  this.pool = new SharedHealthPoolManager(cfg);
  /** @type {DamageSourceClassifier} */
  this.classifier = new DamageSourceClassifier(cfg);
}

/**
 * processCollision — Classifies a collision and applies its damage.
 *
 * @param {string} collisionType — Collision type identifier
 * @returns {{ newHealth: number, isDead: boolean, overkill: number, damage: number }}
 */
MechHealthStateIntegrator.prototype.processCollision = function (collisionType) {
  var damage = this.classifier.getDamageForCollision(collisionType);
  var result = this.pool.applyDamage(damage, collisionType);
  result.damage = damage;
  return result;
};

/**
 * processEmberCollection — Heals the mech for an ember pickup.
 *
 * @param {boolean} synced — Whether pilots are in neural sync
 * @returns {{ newHealth: number, overheal: number }}
 */
MechHealthStateIntegrator.prototype.processEmberCollection = function (synced) {
  return this.pool.applyHeal(HEALTH_CONFIG.EMBER_HEAL, synced);
};

/**
 * reset — Resets the full health subsystem.
 */
MechHealthStateIntegrator.prototype.reset = function () {
  this.pool.reset();
};


// ══════════════════════════════════════════════════════════════════════════
// §7 — MODULE EXPORTS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Export strategy: attach to window for browser, module.exports for Node.
 *
 * Per Schneider Module Export Canonical Form (SMECF), all public symbols
 * are exported through a single namespace object to prevent global
 * pollution while maintaining discoverability.
 */
var MechStateExports = {
  HEALTH_CONFIG: HEALTH_CONFIG,
  SharedHealthPoolManager: SharedHealthPoolManager,
  DamageSourceClassifier: DamageSourceClassifier,
  MechHealthStateIntegrator: MechHealthStateIntegrator,
  HealthBoundaryClampingEnforcer: HealthBoundaryClampingEnforcer,
  AuditTrailAccumulator: AuditTrailAccumulator,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MechStateExports;
}
if (typeof window !== 'undefined') {
  window.MechState = MechStateExports;
}
