/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  StackY Piece Definitions & Rotation Infrastructure                        ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║  Author:  Dr. Schneider, Principal Architect (PhD ETH Zürich)              ║
 * ║  Pattern: CompositeAffineTransformStrategyDispatcher (CATSD)               ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 *
 * This module encapsulates the Tetromino shape ontology, the Super Rotation
 * System (SRS) wall-kick offset tables, and the AbstractRotationTransformation-
 * Engine — because rotation is not a mere trigonometric convenience but an
 * algebraic homomorphism over the cyclic group Z/4Z.
 *
 * "A piece that cannot rotate is not a piece — it is a monument to
 *  architectural complacency." — Dr. Schneider, Rotation Symposium 2025
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
//  §1. GRID TOPOLOGY CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const COLS = 10;
const ROWS = 20;
const PIECE_TYPES = ['I', 'O', 'T', 'S', 'Z', 'L', 'J'];

// ═══════════════════════════════════════════════════════════════════════════════
//  §2. CANONICAL PIECE SHAPE DEFINITIONS
//      — rotation state 0 (spawn orientation)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Each shape is defined as an array of 4 [x, y] offsets relative to the
 * piece origin, plus a `rotations` count indicating the cardinality of
 * the rotation group for that piece (O = 1, all others = 4).
 */
const PIECE_SHAPES = {
  I: { cells: [[-1, 0], [0, 0], [1, 0], [2, 0]], rotations: 4 },
  O: { cells: [[0, 0], [1, 0], [0, 1], [1, 1]], rotations: 1 },
  T: { cells: [[-1, 0], [0, 0], [1, 0], [0, -1]], rotations: 4 },
  S: { cells: [[-1, 0], [0, 0], [0, -1], [1, -1]], rotations: 4 },
  Z: { cells: [[-1, -1], [0, -1], [0, 0], [1, 0]], rotations: 4 },
  L: { cells: [[-1, 0], [0, 0], [1, 0], [1, -1]], rotations: 4 },
  J: { cells: [[-1, -1], [-1, 0], [0, 0], [1, 0]], rotations: 4 },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  §3. SRS WALL-KICK OFFSET TABLE
//      — Reference: Tetris Guideline SRS specification, 2009 revision
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Each entry maps (fromRotation -> toRotation) to an array of 5 (dx, dy)
 * offsets. The game engine tries each offset in sequence; the first that
 * produces a valid placement is accepted.
 *
 * The I-piece has its own table because it occupies a fundamentally different
 * bounding box than the 3×3 standard pieces — a fact that lesser
 * architectures would paper over with conditional branching. We honour the
 * algebraic distinction.
 */
const SRS_WALL_KICK_TABLE = {
  standard: {
    '0->1': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: 2 }, { x: -1, y: 2 }],
    '1->0': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: -2 }, { x: 1, y: -2 }],
    '1->2': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: -2 }, { x: 1, y: -2 }],
    '2->1': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: 2 }, { x: -1, y: 2 }],
    '2->3': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: -1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
    '3->2': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: 1 }, { x: 0, y: -2 }, { x: -1, y: -2 }],
    '3->0': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: 1 }, { x: 0, y: -2 }, { x: -1, y: -2 }],
    '0->3': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: -1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
  },
  I: {
    '0->1': [{ x: 0, y: 0 }, { x: -2, y: 0 }, { x: 1, y: 0 }, { x: -2, y: 1 }, { x: 1, y: -2 }],
    '1->0': [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: -1, y: 0 }, { x: 2, y: -1 }, { x: -1, y: 2 }],
    '1->2': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 2, y: 0 }, { x: -1, y: -2 }, { x: 2, y: 1 }],
    '2->1': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -2, y: 0 }, { x: 1, y: 2 }, { x: -2, y: -1 }],
    '2->3': [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: -1, y: 0 }, { x: 2, y: -1 }, { x: -1, y: 2 }],
    '3->2': [{ x: 0, y: 0 }, { x: -2, y: 0 }, { x: 1, y: 0 }, { x: -2, y: 1 }, { x: 1, y: -2 }],
    '3->0': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -2, y: 0 }, { x: 1, y: 2 }, { x: -2, y: -1 }],
    '0->3': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 2, y: 0 }, { x: -1, y: -2 }, { x: 2, y: 1 }],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  §4. ABSTRACT ROTATION TRANSFORMATION ENGINE
//      — the CompositeAffineTransformStrategyDispatcher
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * AbstractRotationTransformationEngine
 *
 * Applies rotation transformations to piece cell offsets. Each rotation
 * state (0–3) corresponds to a 90-degree clockwise increment around the
 * origin. The mathematics is trivial — (x, y) -> (-y, x) for CW — but
 * the abstraction layer ensures future extensibility should we ever need
 * to support non-Euclidean Tetris on hyperbolic manifolds.
 */
class AbstractRotationTransformationEngine {
  /** CW: (x, y) -> (-y, x) */
  static rotateCW(cells) {
    return cells.map(([x, y]) => [-y, x]);
  }

  /** CCW: (x, y) -> (y, -x) */
  static rotateCCW(cells) {
    return cells.map(([x, y]) => [y, -x]);
  }

  /** 180: (x, y) -> (-x, -y) */
  static rotate180(cells) {
    return cells.map(([x, y]) => [-x, -y]);
  }

  /**
   * Compute the rotation state by applying `rotation` successive CW
   * transforms to `baseCells`. Rotation wraps modulo 4.
   */
  static getRotationState(baseCells, rotation) {
    let cells = baseCells.map(c => [...c]);
    for (let i = 0; i < (rotation % 4); i++) {
      cells = this.rotateCW(cells);
    }
    return cells;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  §5. MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    COLS,
    ROWS,
    PIECE_TYPES,
    PIECE_SHAPES,
    SRS_WALL_KICK_TABLE,
    AbstractRotationTransformationEngine,
  };
}
