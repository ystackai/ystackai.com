// ═══════════════════════════════════════════════════════════════════════════
//  TrailSystem — persistent trail wall for SnakeY Light Cycle (Tron) mode
//  ─────────────────────────────────────────────────────────────────────────
//  Manages trail segment lifecycle: placement, age-based expiry, collision
//  detection, and rendering with cyan→dim→gone fade effect.
//
//  Usage:
//    const trail = new TrailSystem({ lifetimeMs: 7000 });
//    trail.place(x, y);            // drop a wall segment
//    trail.expire();               // remove segments older than lifetimeMs
//    if (trail.collides(x, y)) …   // check if cell is blocked
//    trail.draw(ctx, cellSize);    // render with glow + fade
//    trail.clear();                // reset for new game
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

/**
 * @typedef {Object} TrailSegment
 * @property {number} x       - Grid column
 * @property {number} y       - Grid row
 * @property {number} placedAt - Timestamp (ms) when the segment was placed
 */

class TrailSystem {
  /**
   * @param {Object} opts
   * @param {number} [opts.lifetimeMs=7000] - How long (ms) a trail segment persists
   *   before fading out. Ticket spec: 5–10 seconds; 7s is the sweet spot.
   */
  constructor(opts = {}) {
    /** @type {number} */
    this.lifetimeMs = opts.lifetimeMs ?? 7000;

    /**
     * Trail segments ordered by placement time (oldest first).
     * Oldest-first ordering enables O(1) expiry from the front.
     * @type {TrailSegment[]}
     */
    this.segments = [];
  }

  /**
   * Place a new trail segment at grid position (x, y).
   * Called when the light cycle moves — the vacated head position becomes trail.
   * @param {number} x - Grid column
   * @param {number} y - Grid row
   * @param {number} [now=Date.now()] - Timestamp override (useful for testing)
   */
  place(x, y, now) {
    this.segments.push({ x, y, placedAt: now ?? Date.now() });
  }

  /**
   * Remove trail segments that have exceeded their lifetime.
   * Since segments are ordered oldest-first, we shift from the front
   * until we hit a segment that's still alive — O(k) where k = expired count.
   * @param {number} [now=Date.now()] - Timestamp override (useful for testing)
   */
  expire(now) {
    const t = now ?? Date.now();
    while (this.segments.length > 0 && t - this.segments[0].placedAt > this.lifetimeMs) {
      this.segments.shift();
    }
  }

  /**
   * Check whether grid cell (x, y) is occupied by a trail segment.
   * Used for collision detection before the light cycle commits a move.
   * @param {number} x - Grid column
   * @param {number} y - Grid row
   * @returns {boolean} true if the cell is blocked by trail
   */
  collides(x, y) {
    for (let i = 0; i < this.segments.length; i++) {
      if (this.segments[i].x === x && this.segments[i].y === y) return true;
    }
    return false;
  }

  /**
   * Seed trail with initial body segments (e.g. at game start when the
   * snake body converts to trail).
   * @param {Array<{x: number, y: number}>} cells - Cells to add as trail (oldest first)
   * @param {number} [now=Date.now()] - Timestamp override
   */
  seed(cells, now) {
    const t = now ?? Date.now();
    for (let i = 0; i < cells.length; i++) {
      this.segments.push({ x: cells[i].x, y: cells[i].y, placedAt: t });
    }
  }

  /**
   * Draw all trail segments with age-based cyan fade effect.
   *
   * Visual layers per segment:
   *   1. Outer fill — dark teal, opacity scales with remaining life
   *   2. Inner core — bright cyan, opacity scales quadratically (fades faster)
   *   3. Shadow glow — cyan shadowBlur scales with life
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cellSize - Pixel size of one grid cell
   * @param {number} [now=Date.now()] - Timestamp override
   */
  draw(ctx, cellSize, now) {
    const t = now ?? Date.now();
    const pad = 1;
    const size = cellSize - pad * 2;

    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      const age = t - seg.placedAt;
      const life = Math.max(0, 1 - age / this.lifetimeMs); // 1 = fresh, 0 = expired
      if (life <= 0) continue;

      const px = seg.x * cellSize + pad;
      const py = seg.y * cellSize + pad;

      // Outer glow — fades with age
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 8 * life;
      ctx.fillStyle = 'rgba(0, 95, 111, ' + (life * 0.85) + ')';
      ctx.fillRect(px, py, size, size);

      // Inner bright core — fades faster (quadratic)
      ctx.fillStyle = 'rgba(0, 255, 255, ' + (life * life * 0.6) + ')';
      ctx.fillRect(px + 3, py + 3, size - 6, size - 6);
      ctx.shadowBlur = 0;
    }
  }

  /** Reset all trail data for a new game. */
  clear() {
    this.segments.length = 0;
  }

  /** @returns {number} Current number of active trail segments. */
  get length() {
    return this.segments.length;
  }

  /**
   * Export trail data for window.gameState exposure.
   * @returns {Array<{x: number, y: number, placedAt: number}>}
   */
  toJSON() {
    return this.segments.map(s => ({ x: s.x, y: s.y, placedAt: s.placedAt }));
  }
}

// Export as global for script-tag inclusion (no bundler)
window.TrailSystem = TrailSystem;
