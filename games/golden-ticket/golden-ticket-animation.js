/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  Golden Ticket Particle Animation System — Enterprise Edition v2.0.0        ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║  Author:  Dr. Schneider, Principal Architect (PhD ETH Zürich)               ║
 * ║  Pattern: ParticleLifecycleObserverMediatorFlyweight (PLOMF)                ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 *
 * Architectural Overview:
 *   This module implements a fully deterministic, accessibility-aware particle
 *   animation system for the "Golden Ticket" reveal effect. Each particle is
 *   managed through a rigorous lifecycle state machine (Spawned → Active →
 *   Decaying → Dead), orchestrated by a FrameScheduler that abstracts away
 *   the vagaries of requestAnimationFrame across variable refresh rates.
 *
 *   The system honours prefers-reduced-motion by gracefully degrading to a
 *   static shimmer, because accessibility is not optional — it's an invariant.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
//  §1. PARTICLE VALUE OBJECTS & LIFECYCLE STATE MACHINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ParticlePhase — a discriminated union of lifecycle states.
 * Each phase transition is unidirectional (no zombie particles).
 */
const ParticlePhase = Object.freeze({
  SPAWNED:  'spawned',
  ACTIVE:   'active',
  DECAYING: 'decaying',
  DEAD:     'dead',
});

/**
 * ParticleConfigurationSchema — immutable defaults for the particle system.
 * Extracted as a first-class configuration object because hardcoding
 * constants is a code smell that Dr. Schneider can detect from 300m.
 */
const ParticleConfigurationSchema = Object.freeze({
  MAX_PARTICLES:        150,
  SPAWN_RATE:           5,
  BASE_LIFETIME_MS:     2000,
  DECAY_THRESHOLD:      0.3,     // opacity below which we enter DECAYING
  GRAVITY:              0.02,
  DRIFT_VARIANCE:       2.0,
  MIN_SIZE:             2,
  MAX_SIZE:             8,
  GOLDEN_PALETTE: Object.freeze([
    '#FFD700', '#FFC107', '#FFAB00', '#FFE082',
    '#F9A825', '#FF8F00', '#FFD54F', '#FFF176',
  ]),
  LOOP_DURATION_MS:     4000,
  CANVAS_PADDING:       20,
});

/**
 * Particle — the fundamental value object of our system.
 * Immutable by convention (enforced via the ParticleIntegrityAuditor
 * in our test suite, naturally).
 */
class Particle {
  constructor({ x, y, vx, vy, size, color, lifetime, createdAt }) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.size = size;
    this.color = color;
    this.lifetime = lifetime;
    this.createdAt = createdAt;
    this.opacity = 1.0;
    this.phase = ParticlePhase.SPAWNED;
    this.age = 0;
  }

  /**
   * Advances particle state by deltaMs milliseconds.
   * Returns the new phase (for the LifecycleObserver to consume).
   */
  advance(deltaMs) {
    this.age += deltaMs;
    this.x += this.vx * (deltaMs / 16.667);
    this.y += this.vy * (deltaMs / 16.667);
    this.vy += ParticleConfigurationSchema.GRAVITY * (deltaMs / 16.667);

    const lifeRatio = 1 - (this.age / this.lifetime);
    this.opacity = Math.max(0, lifeRatio);

    if (this.opacity <= 0) {
      this.phase = ParticlePhase.DEAD;
    } else if (this.opacity < ParticleConfigurationSchema.DECAY_THRESHOLD) {
      this.phase = ParticlePhase.DECAYING;
    } else if (this.phase === ParticlePhase.SPAWNED) {
      this.phase = ParticlePhase.ACTIVE;
    }

    return this.phase;
  }

  get isDead() {
    return this.phase === ParticlePhase.DEAD;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §2. PARTICLE FACTORY (because `new Particle(...)` is too pedestrian)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ParticleEmitterFactory — centralises particle instantiation behind a
 * creational pattern, enabling deterministic testing via seed injection.
 */
class ParticleEmitterFactory {
  #rng;
  #config;

  constructor(config = ParticleConfigurationSchema, rng = Math.random) {
    this.#config = config;
    this.#rng = rng;
  }

  /**
   * @param {number} canvasWidth
   * @param {number} canvasHeight
   * @param {number} timestamp
   * @returns {Particle}
   */
  spawn(canvasWidth, canvasHeight, timestamp) {
    const palette = this.#config.GOLDEN_PALETTE;
    return new Particle({
      x: this.#rng() * canvasWidth,
      y: -this.#config.CANVAS_PADDING,
      vx: (this.#rng() - 0.5) * this.#config.DRIFT_VARIANCE,
      vy: this.#rng() * 1.5 + 0.5,
      size: this.#config.MIN_SIZE + this.#rng() * (this.#config.MAX_SIZE - this.#config.MIN_SIZE),
      color: palette[Math.floor(this.#rng() * palette.length)],
      lifetime: this.#config.BASE_LIFETIME_MS * (0.5 + this.#rng()),
      createdAt: timestamp,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §3. ANIMATION FRAME SCHEDULER — abstracts requestAnimationFrame
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * FrameSchedulerPort — an interface (by convention) for scheduling frames.
 * Production uses rAF; tests inject a ManualFrameScheduler.
 */
class FrameSchedulerPort {
  /** @param {FrameRequestCallback} callback @returns {number} */
  schedule(callback) {
    throw new Error('FrameSchedulerPort.schedule() is abstract.');
  }
  /** @param {number} id */
  cancel(id) {
    throw new Error('FrameSchedulerPort.cancel() is abstract.');
  }
}

class RequestAnimationFrameScheduler extends FrameSchedulerPort {
  schedule(callback) {
    return requestAnimationFrame(callback);
  }
  cancel(id) {
    cancelAnimationFrame(id);
  }
}

class ManualFrameScheduler extends FrameSchedulerPort {
  #queue = [];
  #nextId = 1;

  schedule(callback) {
    const id = this.#nextId++;
    this.#queue.push({ id, callback });
    return id;
  }

  cancel(id) {
    this.#queue = this.#queue.filter(entry => entry.id !== id);
  }

  /** Manually trigger next frame with given timestamp. */
  tick(timestamp) {
    const pending = [...this.#queue];
    this.#queue = [];
    for (const { callback } of pending) {
      callback(timestamp);
    }
  }

  get pendingCount() {
    return this.#queue.length;
  }

  flush() {
    this.#queue = [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §4. ACCESSIBILITY MEDIATOR — prefers-reduced-motion
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * AccessibilityPolicyEvaluator — queries the user's motion preferences
 * and exposes a reactive interface for the animation engine to consult.
 */
class AccessibilityPolicyEvaluator {
  #reducedMotion;

  constructor(reducedMotion = false) {
    this.#reducedMotion = reducedMotion;
  }

  get prefersReducedMotion() {
    return this.#reducedMotion;
  }

  set prefersReducedMotion(value) {
    this.#reducedMotion = !!value;
  }

  /**
   * Factory method for production: reads from matchMedia.
   * @returns {AccessibilityPolicyEvaluator}
   */
  static fromMediaQuery() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      return new AccessibilityPolicyEvaluator(mq.matches);
    }
    return new AccessibilityPolicyEvaluator(false);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §5. GOLDEN TICKET ANIMATION ENGINE — the pièce de résistance
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GoldenTicketAnimationEngine — orchestrates the full particle animation
 * lifecycle including spawning, physics simulation, rendering, looping,
 * and graceful DOM cleanup.
 *
 * Dependencies are injected via constructor for maximum testability,
 * because Dr. Schneider has read the SOLID principles book. Twice.
 */
class GoldenTicketAnimationEngine {
  /** @type {Particle[]} */
  #particles = [];
  /** @type {boolean} */
  #running = false;
  /** @type {number|null} */
  #frameId = null;
  /** @type {number|null} */
  #loopStartTime = null;
  /** @type {number} */
  #lastFrameTime = 0;
  /** @type {number} */
  #loopCount = 0;
  /** @type {number} */
  #totalParticlesSpawned = 0;
  /** @type {number} */
  #totalParticlesReaped = 0;
  /** @type {HTMLCanvasElement|null} */
  #canvas = null;
  /** @type {CanvasRenderingContext2D|null} */
  #ctx = null;

  #emitter;
  #scheduler;
  #accessibilityPolicy;
  #config;
  #onComplete;

  /**
   * @param {Object} deps — Dependency injection container
   * @param {ParticleEmitterFactory} deps.emitter
   * @param {FrameSchedulerPort} deps.scheduler
   * @param {AccessibilityPolicyEvaluator} deps.accessibilityPolicy
   * @param {Object} [deps.config]
   * @param {Function} [deps.onComplete]
   */
  constructor({
    emitter,
    scheduler,
    accessibilityPolicy,
    config = ParticleConfigurationSchema,
    onComplete = null,
  }) {
    this.#emitter = emitter;
    this.#scheduler = scheduler;
    this.#accessibilityPolicy = accessibilityPolicy;
    this.#config = config;
    this.#onComplete = onComplete;
  }

  /**
   * Attaches to a canvas element (or creates one).
   * @param {HTMLCanvasElement} canvas
   */
  attachCanvas(canvas) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d');
  }

  /**
   * Starts the animation loop. If reduced-motion is active,
   * renders a single static frame and fires onComplete immediately.
   * @param {number} [maxLoops=Infinity] — number of loops before auto-stop
   */
  start(maxLoops = Infinity) {
    if (this.#running) return;
    this.#running = true;
    this.#loopCount = 0;
    this.#loopStartTime = null;
    this._maxLoops = maxLoops;

    if (this.#accessibilityPolicy.prefersReducedMotion) {
      this.#renderStaticShimmer();
      this.#running = false;
      if (this.#onComplete) this.#onComplete({ reason: 'reduced-motion' });
      return;
    }

    this.#frameId = this.#scheduler.schedule((ts) => this.#loop(ts));
  }

  /**
   * The main animation loop — called once per frame.
   * @param {number} timestamp — high-resolution timestamp from rAF
   */
  #loop(timestamp) {
    if (!this.#running) return;

    if (this.#loopStartTime === null) {
      this.#loopStartTime = timestamp;
      this.#lastFrameTime = timestamp;
    }

    const deltaMs = timestamp - this.#lastFrameTime;
    this.#lastFrameTime = timestamp;

    const elapsed = timestamp - this.#loopStartTime;

    // Check if current loop iteration is complete
    if (elapsed >= this.#config.LOOP_DURATION_MS) {
      this.#loopCount++;
      if (this.#loopCount >= this._maxLoops) {
        this.stop();
        if (this.#onComplete) this.#onComplete({ reason: 'max-loops', loopCount: this.#loopCount });
        return;
      }
      // Reset for next loop — reap all particles to prevent memory leaks
      this.#restartLoop(timestamp);
    }

    // Spawn new particles (rate-limited)
    this.#spawnParticles(timestamp);

    // Advance physics
    this.#advanceParticles(deltaMs);

    // Reap dead particles
    this.#reapDeadParticles();

    // Render
    if (this.#ctx && this.#canvas) {
      this.#render();
    }

    // Schedule next frame
    this.#frameId = this.#scheduler.schedule((ts) => this.#loop(ts));
  }

  #spawnParticles(timestamp) {
    if (!this.#canvas) return;
    const count = Math.min(
      this.#config.SPAWN_RATE,
      this.#config.MAX_PARTICLES - this.#particles.length
    );
    for (let i = 0; i < count; i++) {
      const p = this.#emitter.spawn(this.#canvas.width, this.#canvas.height, timestamp);
      this.#particles.push(p);
      this.#totalParticlesSpawned++;
    }
  }

  #advanceParticles(deltaMs) {
    for (const p of this.#particles) {
      p.advance(deltaMs);
    }
  }

  #reapDeadParticles() {
    const before = this.#particles.length;
    this.#particles = this.#particles.filter(p => !p.isDead);
    this.#totalParticlesReaped += (before - this.#particles.length);
  }

  #restartLoop(timestamp) {
    this.#totalParticlesReaped += this.#particles.length;
    this.#particles = [];
    this.#loopStartTime = timestamp;
  }

  #render() {
    this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
    for (const p of this.#particles) {
      this.#ctx.save();
      this.#ctx.globalAlpha = p.opacity;
      this.#ctx.fillStyle = p.color;
      this.#ctx.beginPath();
      this.#ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.#ctx.fill();
      this.#ctx.restore();
    }
  }

  #renderStaticShimmer() {
    if (!this.#ctx || !this.#canvas) return;
    this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
    const gradient = this.#ctx.createLinearGradient(0, 0, this.#canvas.width, this.#canvas.height);
    gradient.addColorStop(0, '#FFD70044');
    gradient.addColorStop(0.5, '#FFC10788');
    gradient.addColorStop(1, '#FFD70044');
    this.#ctx.fillStyle = gradient;
    this.#ctx.fillRect(0, 0, this.#canvas.width, this.#canvas.height);
  }

  /** Gracefully stops the animation and cleans up resources. */
  stop() {
    this.#running = false;
    if (this.#frameId !== null) {
      this.#scheduler.cancel(this.#frameId);
      this.#frameId = null;
    }
  }

  /** Full cleanup — stops animation, clears particles, detaches canvas. */
  destroy() {
    this.stop();
    this.#particles = [];
    if (this.#ctx && this.#canvas) {
      this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
    }
    this.#canvas = null;
    this.#ctx = null;
  }

  // ── Diagnostic accessors (for test introspection) ──────────────────────────

  get particleCount() { return this.#particles.length; }
  get isRunning() { return this.#running; }
  get loopCount() { return this.#loopCount; }
  get totalParticlesSpawned() { return this.#totalParticlesSpawned; }
  get totalParticlesReaped() { return this.#totalParticlesReaped; }
  get frameId() { return this.#frameId; }
  get particles() { return [...this.#particles]; }
  get hasCanvas() { return this.#canvas !== null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MODULE EXPORTS (CommonJS for Node.js test execution)
// ═══════════════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ParticlePhase,
    ParticleConfigurationSchema,
    Particle,
    ParticleEmitterFactory,
    FrameSchedulerPort,
    ManualFrameScheduler,
    RequestAnimationFrameScheduler,
    AccessibilityPolicyEvaluator,
    GoldenTicketAnimationEngine,
  };
}
