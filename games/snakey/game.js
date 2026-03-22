/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  SnakeY Tron Trail Decay Integration Layer                                 ║
 * ║  Bridges TemporalTrailSegmentManager ↔ Game Loop Tick Cycle                ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║  Author:  Dr. Schneider, Principal Architect (PhD ETH Zürich)              ║
 * ║  Pattern: AdaptiveTrailCollisionMediator (ATCM)                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 *
 * Problem Statement:
 *   The Tron Light Cycle mode suffers from premature derezzing because the trail
 *   (state.snake) grows monotonically without decay. On a 20×20 grid at 100ms
 *   tick intervals, the trail saturates ~400 cells in ≈40s, guaranteeing a
 *   self-collision long before the player's skill ceiling is reached.
 *
 * Solution Architecture:
 *   This module instantiates a TemporalTrailSegmentManager (from tron.js) and
 *   exposes a TrailDecayGameAdapter on window.SnakeyTrailDecay. The adapter
 *   provides two critical operations:
 *
 *     1. processTronTick(state, newHead, gameClockMs)
 *        → Advances the decay clock, adds the new head segment, reaps expired
 *          trail segments, synchronizes state.snake with the live segment set,
 *          and returns { wallDeath, trailDeath } collision flags.
 *
 *     2. reset()
 *        → Clears all temporal state for a fresh game round.
 *
 *   The game loop in index.html replaces its inline Tron collision block with
 *   a single call to this adapter. See INTEGRATION INSTRUCTIONS below.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  INTEGRATION INSTRUCTIONS (for index.html engineer):
 *
 *  1. Add script tags BEFORE the main <script> block:
 *       <script src="tron.js"></script>
 *       <script src="game.js"></script>
 *
 *  2. In initGame(), after dirQueue.length = 0, add:
 *       if (typeof window.SnakeyTrailDecay !== 'undefined') {
 *         window.SnakeyTrailDecay.reset();
 *       }
 *
 *  3. Replace the Tron mode block in tick() (lines 794–817):
 *
 *     OLD:
 *       if (tronMode) {
 *         // Wall collision
 *         if (newHead.x < 0 || newHead.x >= COLS || ...) { die(); return; }
 *         // Trail collision
 *         for (let i = 1; i < state.snake.length; i++) { ... die(); ... }
 *         // Survival score
 *         state.score += 1; ...
 *       }
 *
 *     NEW:
 *       if (tronMode) {
 *         var trailAdapter = window.SnakeyTrailDecay;
 *         if (trailAdapter) {
 *           var result = trailAdapter.processTronTick(state, newHead, COLS, ROWS, performance.now());
 *           if (result.wallDeath || result.trailDeath) { die(); return; }
 *         } else {
 *           // Fallback: original logic (no decay)
 *           if (newHead.x < 0 || newHead.x >= COLS || newHead.y < 0 || newHead.y >= ROWS) { die(); return; }
 *           for (var i = 1; i < state.snake.length; i++) {
 *             if (state.snake[i].x === newHead.x && state.snake[i].y === newHead.y) { die(); return; }
 *           }
 *         }
 *         state.score += 1;
 *         if (state.score > state.hi) { state.hi = state.score; saveHi(state.hi); }
 *         updateScoreUI();
 *       }
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
//  §1. TRAIL DECAY GAME ADAPTER — the mediating facade
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TrailDecayGameAdapter — mediates between the TemporalTrailSegmentManager's
 * temporal decay semantics and the game loop's state.snake array contract.
 *
 * The adapter maintains a parallel representation: the authoritative trail lives
 * in the TemporalTrailSegmentManager (with timestamped decay), while state.snake
 * is rebuilt each tick from the live segment set plus the current head position.
 * This dual-source reconciliation ensures the renderer (which reads state.snake)
 * and the collision engine (which queries the manager) remain consistent.
 *
 * Design Pattern: Adapter + Mediator hybrid (cf. GoF, Chapter 4/5).
 */
class TrailDecayGameAdapter {
  /**
   * @param {object} [options]
   * @param {number} [options.trailTtlMs=7000] — trail segment time-to-live
   */
  constructor(options) {
    var opts = options || {};
    var ttlMs = typeof opts.trailTtlMs === 'number' ? opts.trailTtlMs : 7000;

    // Instantiate the temporal manager from tron.js globals
    if (typeof TemporalTrailSegmentManager === 'undefined') {
      throw new Error(
        'TrailDecayGameAdapter: TemporalTrailSegmentManager not found. ' +
        'Ensure tron.js is loaded before game.js.'
      );
    }

    /** @private */
    this._manager = new TemporalTrailSegmentManager(
      new TrailDecayConfiguration(ttlMs)
    );

    /** @private — tracks whether the adapter has been initialized this round */
    this._initialized = false;

    /** @private — game clock baseline for first tick */
    this._baseTimeMs = 0;
  }

  /**
   * Process one Tron mode game tick.
   *
   * Execution order:
   *   1. Wall boundary check (pure geometry, no temporal state)
   *   2. Advance decay clock → reap expired segments
   *   3. Check trail collision at new head position (only live segments)
   *   4. Add new head to trail manager
   *   5. Rebuild state.snake from [head] + live trail segments
   *
   * @param {object} state — the game state object (must have .snake array)
   * @param {{ x: number, y: number }} newHead — computed head position (already unshifted)
   * @param {number} cols — grid columns
   * @param {number} rows — grid rows
   * @param {number} gameClockMs — current time from performance.now()
   * @returns {{ wallDeath: boolean, trailDeath: boolean }}
   */
  processTronTick(state, newHead, cols, rows, gameClockMs) {
    // Establish baseline on first tick of a round
    if (!this._initialized) {
      this._baseTimeMs = gameClockMs;
      this._initialized = true;
      // Seed initial snake body (segments 1..n) into the manager at t=0
      for (var i = 1; i < state.snake.length; i++) {
        this._manager.addSegment(state.snake[i].x, state.snake[i].y, 0);
      }
    }

    var relativeTimeMs = gameClockMs - this._baseTimeMs;

    // ── Step 1: Wall collision ──────────────────────────────────────────
    if (newHead.x < 0 || newHead.x >= cols ||
        newHead.y < 0 || newHead.y >= rows) {
      return { wallDeath: true, trailDeath: false };
    }

    // ── Step 2: Advance decay clock (reaps expired segments) ────────────
    this._manager.tick(relativeTimeMs);

    // ── Step 3: Trail collision against live segments ────────────────────
    if (this._manager.isOccupied(newHead.x, newHead.y)) {
      return { wallDeath: false, trailDeath: true };
    }

    // ── Step 4: Register new head position in trail ─────────────────────
    this._manager.addSegment(newHead.x, newHead.y, relativeTimeMs);

    // ── Step 5: Rebuild state.snake from live segments ──────────────────
    //   state.snake[0] = newHead (already there from the unshift in tick())
    //   state.snake[1..n] = live trail segments in reverse chronological order
    //   (newest first, matching the existing snake array convention)
    var liveSegs = this._manager.segments;
    var rebuilt = [newHead];
    // Trail segments are stored oldest-first; we want newest-first (after head)
    // but the last segment is the one we just added (the head), so skip it
    for (var s = liveSegs.length - 2; s >= 0; s--) {
      rebuilt.push({ x: liveSegs[s].x, y: liveSegs[s].y });
    }
    state.snake.length = 0;
    for (var r = 0; r < rebuilt.length; r++) {
      state.snake.push(rebuilt[r]);
    }

    return { wallDeath: false, trailDeath: false };
  }

  /**
   * Reset all trail state for a new game round.
   */
  reset() {
    this._manager.reset();
    this._initialized = false;
    this._baseTimeMs = 0;
  }

  /**
   * @returns {number} count of live (non-decayed) trail segments
   */
  get liveSegmentCount() {
    return this._manager.length;
  }

  /**
   * @returns {number} configured TTL in milliseconds
   */
  get ttlMs() {
    return this._manager.ttlMs;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §2. GLOBAL REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Expose the adapter instance on window so the IIFE in index.html can access it.
 * Guarded construction: if tron.js isn't loaded, we log a warning and skip.
 */
(function () {
  if (typeof TemporalTrailSegmentManager !== 'undefined' &&
      typeof TrailDecayConfiguration !== 'undefined') {
    window.SnakeyTrailDecay = new TrailDecayGameAdapter({ trailTtlMs: 7000 });
  } else {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(
        '[game.js] tron.js not loaded — SnakeyTrailDecay adapter unavailable. ' +
        'Tron mode will use legacy non-decay collision (premature death likely).'
      );
    }
  }
}());

// ═══════════════════════════════════════════════════════════════════════════════
//  §3. MODULE EXPORTS (Node.js / test environments)
// ═══════════════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TrailDecayGameAdapter };
}
