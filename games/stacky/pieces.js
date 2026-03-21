// StackY piece definitions — standard 7 tetrominoes
// Each piece: { shapes: [rotations], color: 1-7 }
// color is 1-based index into renderer's CANDY palette

export const PIECES = [
  { shapes: [[[1,1,1,1]], [[1],[1],[1],[1]]], color: 1 },                          // I
  { shapes: [[[1,0],[1,0],[1,1]], [[1,1,1],[1,0,0]], [[1,1],[0,1],[0,1]], [[0,0,1],[1,1,1]]], color: 2 }, // J
  { shapes: [[[0,1],[0,1],[1,1]], [[1,0,0],[1,1,1]], [[1,1],[1,0],[1,0]], [[1,1,1],[0,0,1]]], color: 3 }, // L
  { shapes: [[[1,1],[1,1]]], color: 4 },                                            // O
  { shapes: [[[0,1,1],[1,1,0]], [[1,0],[1,1],[0,1]]], color: 5 },                  // S
  { shapes: [[[0,1,0],[1,1,1]], [[1,0],[1,1],[1,0]], [[1,1,1],[0,1,0]], [[0,1],[1,1],[0,1]]], color: 6 }, // T
  { shapes: [[[1,1,0],[0,1,1]], [[0,1],[1,1],[1,0]]], color: 7 },                  // Z
];
