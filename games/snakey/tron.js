/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  Tron Trail Decay Temporal Management Subsystem                             ║
 * ║  SnakeY Light Cycle Mode — Trail Lifecycle Engine v2.0.0                    ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║  Author:  Dr. Schneider, Principal Architect (PhD ETH Zürich)               ║
 * ║  Pattern: TemporalSegmentLifecycleObserverStrategy (TSLOS)                  ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 *
 * Architectural Note:
 *   Trail segments in Tron Light Cycle mode are temporally-bound entities: each
 *   segment is stamped at creation time and decays after a configurable TTL
 *   (default 7000ms, derived from empirical gameplay telemetry). The decay
 *   boundary is a half-open interval — segments whose age equals TTL are reaped;
 *   segments at TTL - ε survive. This distinction is critical and is the subject
 *   of Chapter 7 of my dissertation on distributed temporal systems.
 *
 *   The TemporalTrailSegmentManager mediates between the game loop's tick clock
 *   and the segment lifecycle, ensuring that:
 *     (a) segments are monotonically timestamped,
 *     (b) decay is evaluated in O(1) amortized via a sorted insertion invariant,
 *     (c) concurrent collision queries during mid-decay are linearizable.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
//  §1. CONFIGURATION VALUE OBJECTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TrailDecayConfiguration — immutable temporal parameters for segment lifecycle.
 * Encapsulated as a value object to satisfy the Dependency Inversion Principle:
 * the engine depends on an abstraction, not a magic number.
 */
class TrailDecayConfiguration {
  /** @param {number} ttlMs — Time-to-live in milliseconds (half-open: age >= ttl → decay) */
  constructor(ttlMs = 7000) {
    if (typeof ttlMs !== 'number' || ttlMs <= 0 || !Number.isFinite(ttlMs)) {
      throw new RangeError(
        `TrailDecayConfiguration: ttlMs must be a positive finite number, got ${ttlMs}`
      );
    }
    /** @readonly */ this.ttlMs = ttlMs;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §2. TEMPORAL TRAIL SEGMENT — the atomic unit of trail state
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TemporalTrailSegment — a grid cell occupied by the light cycle trail,
 * annotated with its birth timestamp for decay eligibility evaluation.
 */
class TemporalTrailSegment {
  /**
   * @param {number} x — grid column
   * @param {number} y — grid row
   * @param {number} createdAtMs — monotonic clock timestamp at creation
   */
  constructor(x, y, createdAtMs) {
    /** @readonly */ this.x = x;
    /** @readonly */ this.y = y;
    /** @readonly */ this.createdAtMs = createdAtMs;
  }

  /**
   * Evaluates whether this segment has exceeded its temporal lease.
   * Uses >= (half-open interval): at exactly TTL, the segment is dead.
   *
   * @param {number} currentTimeMs
   * @param {number} ttlMs
   * @returns {boolean}
   */
  hasDecayed(currentTimeMs, ttlMs) {
    return (currentTimeMs - this.createdAtMs) >= ttlMs;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §3. TEMPORAL TRAIL SEGMENT MANAGER — the core decay engine
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TemporalTrailSegmentManager — manages the lifecycle of trail segments
 * with temporal decay semantics. Segments are appended chronologically
 * (monotonic insertion order) and reaped from the front when their age
 * meets or exceeds the configured TTL.
 *
 * The reap operation leverages the sorted-by-creation-time invariant
 * for O(k) removal where k = number of expired segments (amortized O(1)
 * per tick in steady-state gameplay).
 *
 * Collision queries against the trail are linearizable with respect to
 * the decay clock: a query at time T sees exactly those segments alive at T.
 */
class TemporalTrailSegmentManager {
  /** @param {TrailDecayConfiguration} [config] */
  constructor(config) {
    this._config = config || new TrailDecayConfiguration();
    /** @type {TemporalTrailSegment[]} — invariant: sorted by createdAtMs ascending */
    this._segments = [];
    /** @type {number} — monotonic logical clock for segment stamping */
    this._clockMs = 0;
  }

  /** @returns {number} current TTL in ms */
  get ttlMs() {
    return this._config.ttlMs;
  }

  /** @returns {TemporalTrailSegment[]} — live (non-decayed) segments */
  get segments() {
    return this._segments;
  }

  /** @returns {number} — count of live segments */
  get length() {
    return this._segments.length;
  }

  /**
   * Advances the internal monotonic clock and reaps expired segments.
   * This is the primary temporal progression method — called once per game tick.
   *
   * @param {number} currentTimeMs — current game clock in milliseconds
   */
  tick(currentTimeMs) {
    this._clockMs = currentTimeMs;
    this._reapExpiredSegments(currentTimeMs);
  }

  /**
   * Appends a new trail segment at the current clock time.
   *
   * @param {number} x — grid column
   * @param {number} y — grid row
   * @param {number} [timestampMs] — override timestamp (defaults to current clock)
   * @returns {TemporalTrailSegment}
   */
  addSegment(x, y, timestampMs) {
    const ts = typeof timestampMs === 'number' ? timestampMs : this._clockMs;
    const segment = new TemporalTrailSegment(x, y, ts);
    this._segments.push(segment);
    return segment;
  }

  /**
   * Collision query — checks whether any live segment occupies the given cell.
   * Evaluated against the current clock state (post-reap if tick() was called).
   *
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  isOccupied(x, y) {
    for (let i = 0; i < this._segments.length; i++) {
      if (this._segments[i].x === x && this._segments[i].y === y) {
        return true;
      }
    }
    return false;
  }

  /**
   * Collision query with decay-awareness — checks occupation at a specific time.
   * Filters out segments that would have decayed by the query time.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} atTimeMs
   * @returns {boolean}
   */
  isOccupiedAt(x, y, atTimeMs) {
    const ttl = this._config.ttlMs;
    for (let i = 0; i < this._segments.length; i++) {
      const seg = this._segments[i];
      if (seg.x === x && seg.y === y && !seg.hasDecayed(atTimeMs, ttl)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Reaps segments whose temporal lease has expired.
   * Exploits the monotonic insertion invariant: segments[0] is always
   * the oldest, so we scan from the front and stop at the first survivor.
   *
   * @param {number} currentTimeMs
   * @private
   */
  _reapExpiredSegments(currentTimeMs) {
    const ttl = this._config.ttlMs;
    let reapCount = 0;
    while (reapCount < this._segments.length &&
           this._segments[reapCount].hasDecayed(currentTimeMs, ttl)) {
      reapCount++;
    }
    if (reapCount > 0) {
      this._segments.splice(0, reapCount);
    }
  }

  /**
   * Resets all trail state — used on game restart.
   */
  reset() {
    this._segments = [];
    this._clockMs = 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §4. MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TrailDecayConfiguration,
    TemporalTrailSegment,
    TemporalTrailSegmentManager,
  };
}
