/**
 * StackY Pieces — 7 standard tetrominoes with SRS rotation and wall kick data.
 *
 * Exposes: StackyPieces.{COLS, ROWS, TYPES, getCells, getKicks}
 *
 * Each piece shape is defined as a 4×4 grid for each of 4 rotation states.
 * Wall kick offsets follow the Super Rotation System (SRS) specification.
 */
'use strict';

var StackyPieces = (function () {
  var COLS = 10;
  var ROWS = 20;
  var TYPES = ['I', 'O', 'T', 'S', 'Z', 'L', 'J'];

  /**
   * Piece shapes — each type has 4 rotation states (0–3, clockwise).
   * Each state is an array of [row, col] offsets relative to the piece origin.
   */
  var SHAPES = {
    I: [
      [[0,0],[0,1],[0,2],[0,3]],  // 0: horizontal
      [[0,2],[1,2],[2,2],[3,2]],  // 1: vertical
      [[2,0],[2,1],[2,2],[2,3]],  // 2: horizontal (flipped)
      [[0,1],[1,1],[2,1],[3,1]],  // 3: vertical (flipped)
    ],
    O: [
      [[0,1],[0,2],[1,1],[1,2]],
      [[0,1],[0,2],[1,1],[1,2]],
      [[0,1],[0,2],[1,1],[1,2]],
      [[0,1],[0,2],[1,1],[1,2]],
    ],
    T: [
      [[0,1],[1,0],[1,1],[1,2]],
      [[0,1],[1,1],[1,2],[2,1]],
      [[1,0],[1,1],[1,2],[2,1]],
      [[0,1],[1,0],[1,1],[2,1]],
    ],
    S: [
      [[0,1],[0,2],[1,0],[1,1]],
      [[0,1],[1,1],[1,2],[2,2]],
      [[1,1],[1,2],[2,0],[2,1]],
      [[0,0],[1,0],[1,1],[2,1]],
    ],
    Z: [
      [[0,0],[0,1],[1,1],[1,2]],
      [[0,2],[1,1],[1,2],[2,1]],
      [[1,0],[1,1],[2,1],[2,2]],
      [[0,1],[1,0],[1,1],[2,0]],
    ],
    L: [
      [[0,2],[1,0],[1,1],[1,2]],
      [[0,1],[1,1],[2,1],[2,2]],
      [[1,0],[1,1],[1,2],[2,0]],
      [[0,0],[0,1],[1,1],[2,1]],
    ],
    J: [
      [[0,0],[1,0],[1,1],[1,2]],
      [[0,1],[0,2],[1,1],[2,1]],
      [[1,0],[1,1],[1,2],[2,2]],
      [[0,1],[1,1],[2,0],[2,1]],
    ],
  };

  /**
   * SRS wall kick data.
   * Key format: "fromRot>toRot" — each entry is an array of [dx, dy] offsets.
   * dy follows SRS convention (positive = up in SRS, but we negate in game.js).
   */
  var KICKS_JLSTZ = {
    '0>1': [[ 0, 0],[-1, 0],[-1, 1],[ 0,-2],[-1,-2]],
    '1>0': [[ 0, 0],[ 1, 0],[ 1,-1],[ 0, 2],[ 1, 2]],
    '1>2': [[ 0, 0],[ 1, 0],[ 1,-1],[ 0, 2],[ 1, 2]],
    '2>1': [[ 0, 0],[-1, 0],[-1, 1],[ 0,-2],[-1,-2]],
    '2>3': [[ 0, 0],[ 1, 0],[ 1, 1],[ 0,-2],[ 1,-2]],
    '3>2': [[ 0, 0],[-1, 0],[-1,-1],[ 0, 2],[-1, 2]],
    '3>0': [[ 0, 0],[-1, 0],[-1,-1],[ 0, 2],[-1, 2]],
    '0>3': [[ 0, 0],[ 1, 0],[ 1, 1],[ 0,-2],[ 1,-2]],
  };

  var KICKS_I = {
    '0>1': [[ 0, 0],[-2, 0],[ 1, 0],[-2,-1],[ 1, 2]],
    '1>0': [[ 0, 0],[ 2, 0],[-1, 0],[ 2, 1],[-1,-2]],
    '1>2': [[ 0, 0],[-1, 0],[ 2, 0],[-1, 2],[ 2,-1]],
    '2>1': [[ 0, 0],[ 1, 0],[-2, 0],[ 1,-2],[-2, 1]],
    '2>3': [[ 0, 0],[ 2, 0],[-1, 0],[ 2, 1],[-1,-2]],
    '3>2': [[ 0, 0],[-2, 0],[ 1, 0],[-2,-1],[ 1, 2]],
    '3>0': [[ 0, 0],[ 1, 0],[-2, 0],[ 1,-2],[-2, 1]],
    '0>3': [[ 0, 0],[-1, 0],[ 2, 0],[-1, 2],[ 2,-1]],
  };

  /**
   * Get the absolute cell positions for a piece placement.
   * @param {{ type: string, rotation: number, x: number, y: number }} piece
   * @returns {{ x: number, y: number }[]}
   */
  function getCells(piece) {
    var shape = SHAPES[piece.type][piece.rotation];
    var cells = [];
    for (var i = 0; i < shape.length; i++) {
      cells.push({
        y: piece.y + shape[i][0],
        x: piece.x + shape[i][1],
      });
    }
    return cells;
  }

  /**
   * Get wall kick offsets for a rotation transition.
   * @param {string} type - Piece type
   * @param {number} fromRot - Starting rotation (0–3)
   * @param {number} toRot - Target rotation (0–3)
   * @returns {number[][]} Array of [dx, dy] kick offsets
   */
  function getKicks(type, fromRot, toRot) {
    var key = fromRot + '>' + toRot;
    if (type === 'I') {
      return KICKS_I[key] || [[0, 0]];
    }
    if (type === 'O') {
      return [[0, 0]];
    }
    return KICKS_JLSTZ[key] || [[0, 0]];
  }

  return {
    COLS: COLS,
    ROWS: ROWS,
    TYPES: TYPES,
    SHAPES: SHAPES,
    getCells: getCells,
    getKicks: getKicks,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StackyPieces;
}
