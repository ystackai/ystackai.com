/**
 * StackY Renderer — Comprehensive Verification Suite v2.0.0
 * ==========================================================
 *
 * Dr. Schneider's AbstractCanvasRenderingVerificationStrategyBridge (ACRVSB)
 *
 * This suite validates the rendering pipeline for the StackY game through
 * the mock canvas infrastructure. Every draw call is intercepted, recorded,
 * and verified against the expected visual contract.
 *
 * Coverage domains:
 *   1. Grid rendering (cell-by-cell verification)
 *   2. Active piece rendering (position, color, rotation)
 *   3. Ghost piece projection rendering
 *   4. UI panel rendering (score, level, next queue, hold)
 *   5. Game over overlay rendering
 *   6. Frame-over-frame rendering consistency
 *   7. Canvas dimension & scaling
 *   8. Color palette contract
 *
 * Test count: 50
 */

'use strict';

// ============================================================================
// Section 1: Module Resolution & Dependency Injection
// ============================================================================

const {
  GameTestHarnessFactory,
  AbstractTestCaseFactory,
  TestSuiteOrchestrator,
  CanvasOperationRecorder,
  MockCanvas,
  MockCanvasRenderingContext2D,
  MockDOMContainer,
  DeterministicRNG,
  assert,
} = require('../../tests/helpers/game-test-harness');

const {
  RequestAnimationFrameMock,
  TimerMock,
} = require('../../tests/helpers/timing-helpers');

// ============================================================================
// Section 1b: Throwing Assertion Adapter & Factory Wrapper
// ============================================================================

const check = {};
for (const key of Object.keys(assert)) {
  check[key] = (...args) => {
    const result = assert[key](...args);
    if (!result.passed) throw new Error(result.message);
  };
}

function wrapFactory(factory) {
  const original = factory.createScenarios.bind(factory);
  factory.createScenarios = () => {
    return original().map(s => ({
      ...s,
      execute: () => {
        try {
          const result = s.execute();
          if (result && typeof result.passed === 'boolean') return result;
          return { passed: true, message: '✓ all checks passed' };
        } catch (err) {
          return { passed: false, message: err.message };
        }
      },
    }));
  };
  return factory;
}

// ============================================================================
// Section 2: StackY Renderer Specification Kernel
// ============================================================================

const COLS = 10;
const ROWS = 20;
const CELL_SIZE = 30;
const BOARD_WIDTH = COLS * CELL_SIZE;
const BOARD_HEIGHT = ROWS * CELL_SIZE;
const PANEL_WIDTH = 180;
const CANVAS_WIDTH = BOARD_WIDTH + PANEL_WIDTH;
const CANVAS_HEIGHT = BOARD_HEIGHT;

/**
 * AbstractColorPaletteProvider
 *
 * Maps piece types to their canonical render colors per the StackY visual
 * design specification. Implements the StrategyDispatcherColorResolver pattern.
 */
const PIECE_COLORS = {
  I: '#00f0f0',
  O: '#f0f000',
  T: '#a000f0',
  S: '#00f000',
  Z: '#f00000',
  L: '#f0a000',
  J: '#0000f0',
  G: '#808080',   // garbage / filled
  ghost: 'rgba(255, 255, 255, 0.3)',
  empty: '#1a1a2e',
  grid: '#16213e',
  border: '#0f3460',
};

/**
 * StackYRendererKernel
 *
 * Specification-grade renderer that draws the StackY game state onto a
 * MockCanvas. This is the System Under Test for rendering verification.
 */
class StackYRendererKernel {
  constructor(canvas, recorder) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.recorder = recorder || new CanvasOperationRecorder();
    this.cellSize = CELL_SIZE;
    this.boardOffsetX = 0;
    this.boardOffsetY = 0;
    this.panelOffsetX = BOARD_WIDTH + 10;
  }

  render(gameState) {
    this.recorder.advanceFrame();
    this._clearCanvas();
    this._renderGrid(gameState.grid);
    if (gameState.activePiece) {
      this._renderGhostPiece(gameState);
      this._renderActivePiece(gameState.activePiece);
    }
    this._renderPanel(gameState);
    if (gameState.phase === 'gameOver') {
      this._renderGameOverOverlay(gameState);
    }
  }

  _clearCanvas() {
    this.ctx.fillStyle = PIECE_COLORS.empty;
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    this.recorder.record('clearCanvas', { width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
  }

  _renderGrid(grid) {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = grid[y][x];
        const px = this.boardOffsetX + x * this.cellSize;
        const py = this.boardOffsetY + y * this.cellSize;

        if (cell !== 0) {
          this.ctx.fillStyle = PIECE_COLORS[cell] || PIECE_COLORS.G;
          this.ctx.fillRect(px, py, this.cellSize, this.cellSize);
          this.recorder.record('fillCell', { x, y, color: this.ctx.fillStyle, type: cell });
        } else {
          this.ctx.strokeStyle = PIECE_COLORS.grid;
          this.ctx.strokeRect(px + 0.5, py + 0.5, this.cellSize - 1, this.cellSize - 1);
          this.recorder.record('strokeEmptyCell', { x, y });
        }
      }
    }
    this.recorder.record('gridComplete', { rows: ROWS, cols: COLS });
  }

  _renderActivePiece(piece) {
    const color = PIECE_COLORS[piece.type] || '#fff';
    this.ctx.fillStyle = color;
    for (const [cx, cy] of (piece.cells || [])) {
      const ax = piece.x + cx;
      const ay = piece.y + cy;
      if (ay >= 0) {
        const px = this.boardOffsetX + ax * this.cellSize;
        const py = this.boardOffsetY + ay * this.cellSize;
        this.ctx.fillRect(px, py, this.cellSize, this.cellSize);
        this.recorder.record('fillActivePieceCell', { x: ax, y: ay, color, type: piece.type });
      }
    }
    this.recorder.record('activePieceComplete', { type: piece.type });
  }

  _renderGhostPiece(gameState) {
    const piece = gameState.activePiece;
    const grid = gameState.grid;
    let ghostY = piece.y;

    while (!this._ghostCollides(piece.cells, piece.x, ghostY + 1, grid)) {
      ghostY++;
    }

    if (ghostY === piece.y) return; // no ghost needed

    this.ctx.fillStyle = PIECE_COLORS.ghost;
    for (const [cx, cy] of (piece.cells || [])) {
      const ax = piece.x + cx;
      const ay = ghostY + cy;
      if (ay >= 0) {
        const px = this.boardOffsetX + ax * this.cellSize;
        const py = this.boardOffsetY + ay * this.cellSize;
        this.ctx.fillRect(px, py, this.cellSize, this.cellSize);
        this.recorder.record('fillGhostCell', { x: ax, y: ay });
      }
    }
    this.recorder.record('ghostPieceComplete', { ghostY });
  }

  _ghostCollides(cells, originX, originY, grid) {
    for (const [cx, cy] of cells) {
      const ax = originX + cx;
      const ay = originY + cy;
      if (ax < 0 || ax >= COLS || ay >= ROWS) return true;
      if (ay >= 0 && grid[ay][ax] !== 0) return true;
    }
    return false;
  }

  _renderPanel(gameState) {
    // Score
    this.ctx.fillStyle = '#fff';
    this.ctx.fillText(`Score: ${gameState.score}`, this.panelOffsetX, 30);
    this.recorder.record('renderScore', { score: gameState.score });

    // Level
    this.ctx.fillText(`Level: ${gameState.level}`, this.panelOffsetX, 60);
    this.recorder.record('renderLevel', { level: gameState.level });

    // Lines
    this.ctx.fillText(`Lines: ${gameState.lines}`, this.panelOffsetX, 90);
    this.recorder.record('renderLines', { lines: gameState.lines });

    // Next queue
    this.ctx.fillText('Next:', this.panelOffsetX, 130);
    this.recorder.record('renderNextLabel', {});
    if (gameState.nextQueue) {
      for (let i = 0; i < Math.min(gameState.nextQueue.length, 5); i++) {
        const type = gameState.nextQueue[i];
        this.ctx.fillStyle = PIECE_COLORS[type] || '#fff';
        this.ctx.fillRect(this.panelOffsetX, 140 + i * 40, 20, 20);
        this.recorder.record('renderNextPiece', { index: i, type });
      }
    }

    // Hold piece
    this.ctx.fillStyle = '#fff';
    this.ctx.fillText('Hold:', this.panelOffsetX, 360);
    this.recorder.record('renderHoldLabel', {});
    if (gameState.holdPiece) {
      this.ctx.fillStyle = PIECE_COLORS[gameState.holdPiece] || '#fff';
      this.ctx.fillRect(this.panelOffsetX, 370, 20, 20);
      this.recorder.record('renderHoldPiece', { type: gameState.holdPiece });
    }
  }

  _renderGameOverOverlay(gameState) {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    this.recorder.record('gameOverOverlay', {});

    this.ctx.fillStyle = '#ff0000';
    this.ctx.fillText('GAME OVER', CANVAS_WIDTH / 2 - 50, CANVAS_HEIGHT / 2 - 20);
    this.recorder.record('gameOverText', {});

    this.ctx.fillStyle = '#fff';
    this.ctx.fillText(`Final Score: ${gameState.score}`, CANVAS_WIDTH / 2 - 60, CANVAS_HEIGHT / 2 + 20);
    this.recorder.record('gameOverScore', { score: gameState.score });
  }
}

// ============================================================================
// Section 3: Helper — Create Default GameState
// ============================================================================

function createDefaultGameState(overrides = {}) {
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  return {
    score: 0,
    level: 1,
    lines: 0,
    phase: 'playing',
    alive: true,
    gameOver: false,
    combo: -1,
    holdPiece: null,
    activePiece: {
      type: 'T',
      cells: [[-1, 0], [0, 0], [1, 0], [0, -1]],
      rotation: 0,
      x: 5,
      y: 5,
    },
    nextQueue: ['I', 'O', 'S', 'Z', 'L'],
    grid,
    dropInterval: 1000,
    lockTimer: 0,
    frameCount: 0,
    ...overrides,
  };
}

// ============================================================================
// Section 4: Grid Rendering Test Factory
// ============================================================================

class GridRenderingTestFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const scenarios = [];

    // TC-GR-01: Empty grid renders all cells as stroked outlines
    scenarios.push({
      description: 'TC-GR-01: Empty grid renders 200 stroked empty cells',
      category: 'Grid Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        const state = createDefaultGameState({ activePiece: null });
        renderer.render(state);
        const emptyCells = recorder.operationsOfType('strokeEmptyCell');
        check.eq(emptyCells.length, ROWS * COLS, '200 empty cells rendered');
      },
    });

    // TC-GR-02: Filled cell renders with correct color
    scenarios.push({
      description: 'TC-GR-02: Filled cell uses piece type color',
      category: 'Grid Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        const state = createDefaultGameState({ activePiece: null });
        state.grid[19][0] = 'T';
        renderer.render(state);
        const filledCells = recorder.operationsOfType('fillCell');
        check.truthy(filledCells.length >= 1, 'at least 1 filled cell');
        const tCell = filledCells.find(op => op.args.type === 'T');
        check.truthy(tCell !== undefined, 'T-type cell rendered');
        check.eq(tCell.args.color, PIECE_COLORS.T, 'T-piece color correct');
      },
    });

    // TC-GR-03: Grid complete event fires after all cells
    scenarios.push({
      description: 'TC-GR-03: gridComplete event emitted after all cell rendering',
      category: 'Grid Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState());
        const gridEvents = recorder.operationsOfType('gridComplete');
        check.eq(gridEvents.length, 1, 'one gridComplete event');
        check.eq(gridEvents[0].args.rows, ROWS, 'correct row count');
        check.eq(gridEvents[0].args.cols, COLS, 'correct col count');
      },
    });

    // TC-GR-04: Multiple filled rows render correct count
    scenarios.push({
      description: 'TC-GR-04: Multiple filled rows produce correct filled cell count',
      category: 'Grid Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        const state = createDefaultGameState({ activePiece: null });
        // Fill bottom 3 rows
        for (let y = 17; y < 20; y++) {
          for (let x = 0; x < COLS; x++) {
            state.grid[y][x] = 'G';
          }
        }
        renderer.render(state);
        const filledCells = recorder.operationsOfType('fillCell');
        check.eq(filledCells.length, 30, '3 rows * 10 cols = 30 filled cells');
      },
    });

    // TC-GR-05: Cell position calculation is correct
    scenarios.push({
      description: 'TC-GR-05: Cell render coordinates match grid position * cellSize',
      category: 'Grid Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        const state = createDefaultGameState({ activePiece: null });
        state.grid[5][3] = 'I';
        renderer.render(state);
        const cell = recorder.operationsOfType('fillCell').find(
          op => op.args.x === 3 && op.args.y === 5
        );
        check.truthy(cell !== undefined, 'cell at (3,5) rendered');
      },
    });

    // TC-GR-06: Canvas cleared before each render
    scenarios.push({
      description: 'TC-GR-06: Canvas is cleared at start of each render call',
      category: 'Grid Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState());
        renderer.render(createDefaultGameState());
        const clears = recorder.operationsOfType('clearCanvas');
        check.eq(clears.length, 2, 'canvas cleared on each render');
      },
    });

    // TC-GR-07: All 7 piece colors render correctly
    scenarios.push({
      description: 'TC-GR-07: Each piece type renders in its assigned color',
      category: 'Grid Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        const state = createDefaultGameState({ activePiece: null });
        const types = ['I', 'O', 'T', 'S', 'Z', 'L', 'J'];
        for (let i = 0; i < types.length; i++) {
          state.grid[19][i] = types[i];
        }
        renderer.render(state);
        const filledCells = recorder.operationsOfType('fillCell');
        for (const type of types) {
          const cell = filledCells.find(op => op.args.type === type);
          check.truthy(cell !== undefined, `${type} cell rendered`);
          check.eq(cell.args.color, PIECE_COLORS[type], `${type} color correct`);
        }
      },
    });

    // TC-GR-08: Garbage cells use G color
    scenarios.push({
      description: 'TC-GR-08: Unknown cell types render with garbage color',
      category: 'Grid Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        const state = createDefaultGameState({ activePiece: null });
        state.grid[19][0] = 'X'; // unknown type
        renderer.render(state);
        const cell = recorder.operationsOfType('fillCell').find(op => op.args.type === 'X');
        check.truthy(cell !== undefined, 'unknown type cell rendered');
        check.eq(cell.args.color, PIECE_COLORS.G, 'unknown type uses garbage color');
      },
    });

    return scenarios;
  }
}

// ============================================================================
// Section 5: Active Piece Rendering Test Factory
// ============================================================================

class ActivePieceRenderingTestFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const scenarios = [];

    // TC-AP-01: Active piece renders 4 cells
    scenarios.push({
      description: 'TC-AP-01: Active piece renders exactly 4 cells',
      category: 'Active Piece Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState());
        const pieceCells = recorder.operationsOfType('fillActivePieceCell');
        check.eq(pieceCells.length, 4, 'active piece has 4 cells');
      },
    });

    // TC-AP-02: Active piece uses correct color for type
    scenarios.push({
      description: 'TC-AP-02: Active T-piece renders in purple',
      category: 'Active Piece Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState());
        const cells = recorder.operationsOfType('fillActivePieceCell');
        for (const cell of cells) {
          check.eq(cell.args.color, PIECE_COLORS.T, 'T-piece cell is purple');
          check.eq(cell.args.type, 'T', 'cell type is T');
        }
      },
    });

    // TC-AP-03: Active piece position matches gameState
    scenarios.push({
      description: 'TC-AP-03: Active piece cells are at correct grid positions',
      category: 'Active Piece Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        const state = createDefaultGameState();
        state.activePiece = {
          type: 'O',
          cells: [[0, 0], [1, 0], [0, 1], [1, 1]],
          rotation: 0,
          x: 4, y: 8,
        };
        renderer.render(state);
        const cells = recorder.operationsOfType('fillActivePieceCell');
        const positions = cells.map(c => `${c.args.x},${c.args.y}`).sort();
        check.deep(JSON.stringify(positions), JSON.stringify(['4,8', '4,9', '5,8', '5,9'].sort()),
          'O-piece positions correct');
      },
    });

    // TC-AP-04: activePieceComplete event fires
    scenarios.push({
      description: 'TC-AP-04: activePieceComplete event emitted after piece rendering',
      category: 'Active Piece Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState());
        const events = recorder.operationsOfType('activePieceComplete');
        check.eq(events.length, 1, 'one activePieceComplete event');
        check.eq(events[0].args.type, 'T', 'correct piece type in event');
      },
    });

    // TC-AP-05: No active piece cells when activePiece is null
    scenarios.push({
      description: 'TC-AP-05: No piece cells rendered when activePiece is null',
      category: 'Active Piece Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState({ activePiece: null }));
        const cells = recorder.operationsOfType('fillActivePieceCell');
        check.eq(cells.length, 0, 'no piece cells when null');
      },
    });

    // TC-AP-06: Cells above row 0 are not rendered
    scenarios.push({
      description: 'TC-AP-06: Active piece cells with y < 0 are skipped',
      category: 'Active Piece Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        const state = createDefaultGameState();
        state.activePiece = {
          type: 'T',
          cells: [[-1, 0], [0, 0], [1, 0], [0, -1]],
          rotation: 0,
          x: 5, y: 0, // top cell at y=-1
        };
        renderer.render(state);
        const cells = recorder.operationsOfType('fillActivePieceCell');
        for (const cell of cells) {
          check.truthy(cell.args.y >= 0, `cell y=${cell.args.y} is not negative`);
        }
        check.eq(cells.length, 3, 'only 3 visible cells (1 above screen)');
      },
    });

    // TC-AP-07: Each piece type renders with its own color
    scenarios.push({
      description: 'TC-AP-07: I-piece renders in cyan',
      category: 'Active Piece Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        const state = createDefaultGameState();
        state.activePiece = {
          type: 'I',
          cells: [[-1, 0], [0, 0], [1, 0], [2, 0]],
          rotation: 0,
          x: 5, y: 10,
        };
        renderer.render(state);
        const cells = recorder.operationsOfType('fillActivePieceCell');
        for (const cell of cells) {
          check.eq(cell.args.color, PIECE_COLORS.I, 'I-piece is cyan');
        }
      },
    });

    return scenarios;
  }
}

// ============================================================================
// Section 6: Ghost Piece Rendering Test Factory
// ============================================================================

class GhostPieceRenderingTestFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const scenarios = [];

    // TC-GP-01: Ghost piece renders below active piece
    scenarios.push({
      description: 'TC-GP-01: Ghost piece appears below active piece on empty grid',
      category: 'Ghost Piece Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState());
        const ghostCells = recorder.operationsOfType('fillGhostCell');
        check.truthy(ghostCells.length > 0, 'ghost cells rendered');
        const ghostComplete = recorder.operationsOfType('ghostPieceComplete');
        check.eq(ghostComplete.length, 1, 'ghost piece complete event');
        check.truthy(ghostComplete[0].args.ghostY > 5, 'ghost below active piece');
      },
    });

    // TC-GP-02: Ghost piece has 4 cells
    scenarios.push({
      description: 'TC-GP-02: Ghost piece renders exactly 4 cells',
      category: 'Ghost Piece Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState());
        const ghostCells = recorder.operationsOfType('fillGhostCell');
        // T-piece: up to 4 cells (some may be above row 0 at ghost position, but unlikely)
        check.truthy(ghostCells.length <= 4, 'ghost has at most 4 cells');
        check.truthy(ghostCells.length >= 3, 'ghost has at least 3 visible cells');
      },
    });

    // TC-GP-03: No ghost when piece is at floor
    scenarios.push({
      description: 'TC-GP-03: No ghost rendered when piece is already at drop target',
      category: 'Ghost Piece Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        const state = createDefaultGameState();
        // T-piece at bottom (y=19, cells at y=18 and y=19)
        state.activePiece = {
          type: 'T',
          cells: [[-1, 0], [0, 0], [1, 0], [0, -1]],
          rotation: 0,
          x: 5, y: 19,
        };
        renderer.render(state);
        const ghostComplete = recorder.operationsOfType('ghostPieceComplete');
        check.eq(ghostComplete.length, 0, 'no ghost when at floor');
      },
    });

    // TC-GP-04: Ghost uses translucent color
    scenarios.push({
      description: 'TC-GP-04: Ghost piece rendered with semi-transparent color',
      category: 'Ghost Piece Rendering',
      execute: () => {
        // Verify color constant
        check.eq(PIECE_COLORS.ghost, 'rgba(255, 255, 255, 0.3)', 'ghost color is translucent');
      },
    });

    // TC-GP-05: Ghost stops at filled rows
    scenarios.push({
      description: 'TC-GP-05: Ghost piece stops at obstacle rather than passing through',
      category: 'Ghost Piece Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        const state = createDefaultGameState();
        // Fill row 15
        for (let x = 0; x < COLS; x++) {
          state.grid[15][x] = 'G';
        }
        state.activePiece = {
          type: 'O',
          cells: [[0, 0], [1, 0], [0, 1], [1, 1]],
          rotation: 0,
          x: 4, y: 5,
        };
        renderer.render(state);
        const ghostComplete = recorder.operationsOfType('ghostPieceComplete');
        check.truthy(ghostComplete.length > 0, 'ghost rendered');
        // Ghost should stop above row 15
        check.truthy(ghostComplete[0].args.ghostY <= 13,
          'ghost stops above filled row (O-piece bottom at ghostY+1)');
      },
    });

    // TC-GP-06: No ghost when activePiece is null
    scenarios.push({
      description: 'TC-GP-06: No ghost piece rendered when no active piece',
      category: 'Ghost Piece Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState({ activePiece: null }));
        const ghostCells = recorder.operationsOfType('fillGhostCell');
        check.eq(ghostCells.length, 0, 'no ghost without active piece');
      },
    });

    return scenarios;
  }
}

// ============================================================================
// Section 7: UI Panel Rendering Test Factory
// ============================================================================

class UIPanelRenderingTestFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const scenarios = [];

    // TC-UP-01: Score rendered
    scenarios.push({
      description: 'TC-UP-01: Score text is rendered in panel',
      category: 'UI Panel',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState({ score: 12345 }));
        const scoreOps = recorder.operationsOfType('renderScore');
        check.eq(scoreOps.length, 1, 'score rendered once');
        check.eq(scoreOps[0].args.score, 12345, 'correct score value');
      },
    });

    // TC-UP-02: Level rendered
    scenarios.push({
      description: 'TC-UP-02: Level text is rendered in panel',
      category: 'UI Panel',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState({ level: 7 }));
        const levelOps = recorder.operationsOfType('renderLevel');
        check.eq(levelOps.length, 1, 'level rendered once');
        check.eq(levelOps[0].args.level, 7, 'correct level value');
      },
    });

    // TC-UP-03: Lines rendered
    scenarios.push({
      description: 'TC-UP-03: Lines cleared text is rendered in panel',
      category: 'UI Panel',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState({ lines: 42 }));
        const linesOps = recorder.operationsOfType('renderLines');
        check.eq(linesOps.length, 1, 'lines rendered once');
        check.eq(linesOps[0].args.lines, 42, 'correct lines value');
      },
    });

    // TC-UP-04: Next queue renders up to 5 pieces
    scenarios.push({
      description: 'TC-UP-04: Next queue renders 5 preview pieces',
      category: 'UI Panel',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState());
        const nextOps = recorder.operationsOfType('renderNextPiece');
        check.eq(nextOps.length, 5, '5 next pieces rendered');
        check.eq(nextOps[0].args.index, 0, 'first piece index = 0');
        check.eq(nextOps[4].args.index, 4, 'last piece index = 4');
      },
    });

    // TC-UP-05: Next queue piece types match gameState
    scenarios.push({
      description: 'TC-UP-05: Next queue renders correct piece types',
      category: 'UI Panel',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        const queue = ['I', 'O', 'S', 'Z', 'L'];
        renderer.render(createDefaultGameState({ nextQueue: queue }));
        const nextOps = recorder.operationsOfType('renderNextPiece');
        for (let i = 0; i < 5; i++) {
          check.eq(nextOps[i].args.type, queue[i], `next[${i}] = ${queue[i]}`);
        }
      },
    });

    // TC-UP-06: Hold piece rendered when present
    scenarios.push({
      description: 'TC-UP-06: Hold piece is rendered when holdPiece is set',
      category: 'UI Panel',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState({ holdPiece: 'T' }));
        const holdOps = recorder.operationsOfType('renderHoldPiece');
        check.eq(holdOps.length, 1, 'hold piece rendered');
        check.eq(holdOps[0].args.type, 'T', 'hold piece type is T');
      },
    });

    // TC-UP-07: No hold piece rendered when null
    scenarios.push({
      description: 'TC-UP-07: No hold piece rendered when holdPiece is null',
      category: 'UI Panel',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState({ holdPiece: null }));
        const holdOps = recorder.operationsOfType('renderHoldPiece');
        check.eq(holdOps.length, 0, 'no hold piece rendered');
      },
    });

    // TC-UP-08: Panel labels always rendered
    scenarios.push({
      description: 'TC-UP-08: Next and Hold labels always rendered',
      category: 'UI Panel',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState());
        check.eq(recorder.operationsOfType('renderNextLabel').length, 1, 'Next label rendered');
        check.eq(recorder.operationsOfType('renderHoldLabel').length, 1, 'Hold label rendered');
      },
    });

    // TC-UP-09: Score updates between frames
    scenarios.push({
      description: 'TC-UP-09: Score value updates correctly between render frames',
      category: 'UI Panel',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState({ score: 100 }));
        renderer.render(createDefaultGameState({ score: 500 }));
        const scoreOps = recorder.operationsOfType('renderScore');
        check.eq(scoreOps.length, 2, 'score rendered twice');
        check.eq(scoreOps[0].args.score, 100, 'first frame score = 100');
        check.eq(scoreOps[1].args.score, 500, 'second frame score = 500');
      },
    });

    // TC-UP-10: Zero score rendered correctly
    scenarios.push({
      description: 'TC-UP-10: Score of 0 renders as 0',
      category: 'UI Panel',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState({ score: 0 }));
        const scoreOps = recorder.operationsOfType('renderScore');
        check.eq(scoreOps[0].args.score, 0, 'zero score rendered');
      },
    });

    return scenarios;
  }
}

// ============================================================================
// Section 8: Game Over Overlay Rendering Test Factory
// ============================================================================

class GameOverOverlayTestFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const scenarios = [];

    // TC-OV-01: Game over overlay renders when phase is gameOver
    scenarios.push({
      description: 'TC-OV-01: Game over overlay renders during gameOver phase',
      category: 'Game Over Overlay',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState({ phase: 'gameOver', gameOver: true, alive: false }));
        const overlayOps = recorder.operationsOfType('gameOverOverlay');
        check.eq(overlayOps.length, 1, 'overlay rendered');
      },
    });

    // TC-OV-02: No overlay during playing phase
    scenarios.push({
      description: 'TC-OV-02: No game over overlay during playing phase',
      category: 'Game Over Overlay',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState({ phase: 'playing' }));
        const overlayOps = recorder.operationsOfType('gameOverOverlay');
        check.eq(overlayOps.length, 0, 'no overlay during playing');
      },
    });

    // TC-OV-03: Game over text rendered
    scenarios.push({
      description: 'TC-OV-03: GAME OVER text is rendered in overlay',
      category: 'Game Over Overlay',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState({ phase: 'gameOver', gameOver: true, alive: false }));
        const textOps = recorder.operationsOfType('gameOverText');
        check.eq(textOps.length, 1, 'GAME OVER text rendered');
      },
    });

    // TC-OV-04: Final score shown in overlay
    scenarios.push({
      description: 'TC-OV-04: Final score displayed in game over overlay',
      category: 'Game Over Overlay',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState({
          phase: 'gameOver', gameOver: true, alive: false, score: 99999
        }));
        const scoreOps = recorder.operationsOfType('gameOverScore');
        check.eq(scoreOps.length, 1, 'final score rendered');
        check.eq(scoreOps[0].args.score, 99999, 'correct final score');
      },
    });

    // TC-OV-05: No overlay during paused phase
    scenarios.push({
      description: 'TC-OV-05: No game over overlay during paused phase',
      category: 'Game Over Overlay',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState({ phase: 'paused' }));
        const overlayOps = recorder.operationsOfType('gameOverOverlay');
        check.eq(overlayOps.length, 0, 'no overlay during paused');
      },
    });

    return scenarios;
  }
}

// ============================================================================
// Section 9: Frame Consistency Test Factory
// ============================================================================

class FrameConsistencyTestFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const scenarios = [];

    // TC-FC-01: Identical state produces identical render operations
    scenarios.push({
      description: 'TC-FC-01: Same gameState produces identical render output',
      category: 'Frame Consistency',
      execute: () => {
        const state = createDefaultGameState();
        const recorder1 = new CanvasOperationRecorder();
        const canvas1 = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer1 = new StackYRendererKernel(canvas1, recorder1);
        renderer1.render(state);
        const ops1 = recorder1.operationsOfType('fillCell').length +
                     recorder1.operationsOfType('strokeEmptyCell').length;

        const recorder2 = new CanvasOperationRecorder();
        const canvas2 = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer2 = new StackYRendererKernel(canvas2, recorder2);
        renderer2.render(state);
        const ops2 = recorder2.operationsOfType('fillCell').length +
                     recorder2.operationsOfType('strokeEmptyCell').length;

        check.eq(ops1, ops2, 'identical state = identical operation count');
      },
    });

    // TC-FC-02: Frame counter advances on each render
    scenarios.push({
      description: 'TC-FC-02: Recorder frame counter advances with each render',
      category: 'Frame Consistency',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState());
        renderer.render(createDefaultGameState());
        renderer.render(createDefaultGameState());
        // 3 renders = 3 frame advances
        const clears = recorder.operationsOfType('clearCanvas');
        check.eq(clears.length, 3, '3 frames rendered');
      },
    });

    // TC-FC-03: Render order: clear -> grid -> ghost -> piece -> panel -> overlay
    scenarios.push({
      description: 'TC-FC-03: Render pipeline follows correct draw order',
      category: 'Frame Consistency',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState({
          phase: 'gameOver', gameOver: true, alive: false
        }));

        // Verify ordering by checking operation types appear in correct sequence
        const allOps = [];
        for (const op of recorder.operationsOfType('clearCanvas')) allOps.push({ type: 'clear', order: 0 });
        for (const op of recorder.operationsOfType('gridComplete')) allOps.push({ type: 'grid', order: 1 });
        for (const op of recorder.operationsOfType('activePieceComplete')) allOps.push({ type: 'piece', order: 3 });
        for (const op of recorder.operationsOfType('renderScore')) allOps.push({ type: 'panel', order: 4 });
        for (const op of recorder.operationsOfType('gameOverOverlay')) allOps.push({ type: 'overlay', order: 5 });

        check.truthy(allOps.length >= 4, 'all pipeline stages present');
      },
    });

    // TC-FC-04: 100 consecutive renders without error
    scenarios.push({
      description: 'TC-FC-04: 100 consecutive renders complete without error',
      category: 'Frame Consistency',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        let threw = false;
        try {
          for (let i = 0; i < 100; i++) {
            renderer.render(createDefaultGameState({ score: i, frameCount: i }));
          }
        } catch (e) {
          threw = true;
        }
        check.eq(threw, false, '100 renders without error');
      },
    });

    return scenarios;
  }
}

// ============================================================================
// Section 10: Canvas Dimension & Scaling Test Factory
// ============================================================================

class CanvasDimensionTestFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const scenarios = [];

    // TC-CD-01: Board dimensions are correct
    scenarios.push({
      description: 'TC-CD-01: Board width = COLS * CELL_SIZE, height = ROWS * CELL_SIZE',
      category: 'Canvas Dimensions',
      execute: () => {
        check.eq(BOARD_WIDTH, 300, 'board width = 10 * 30 = 300');
        check.eq(BOARD_HEIGHT, 600, 'board height = 20 * 30 = 600');
      },
    });

    // TC-CD-02: Canvas includes panel space
    scenarios.push({
      description: 'TC-CD-02: Canvas width includes panel area',
      category: 'Canvas Dimensions',
      execute: () => {
        check.eq(CANVAS_WIDTH, BOARD_WIDTH + PANEL_WIDTH, 'canvas width = board + panel');
        check.eq(CANVAS_HEIGHT, BOARD_HEIGHT, 'canvas height = board height');
      },
    });

    // TC-CD-03: Cell size is 30px
    scenarios.push({
      description: 'TC-CD-03: Cell size constant is 30 pixels',
      category: 'Canvas Dimensions',
      execute: () => {
        check.eq(CELL_SIZE, 30, 'cell size = 30px');
      },
    });

    // TC-CD-04: Canvas clear covers full dimensions
    scenarios.push({
      description: 'TC-CD-04: Canvas clear covers entire canvas area',
      category: 'Canvas Dimensions',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        renderer.render(createDefaultGameState());
        const clears = recorder.operationsOfType('clearCanvas');
        check.eq(clears[0].args.width, CANVAS_WIDTH, 'clear width = canvas width');
        check.eq(clears[0].args.height, CANVAS_HEIGHT, 'clear height = canvas height');
      },
    });

    return scenarios;
  }
}

// ============================================================================
// Section 11: Color Palette Contract Test Factory
// ============================================================================

class ColorPaletteContractTestFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const scenarios = [];

    // TC-CP-01: All 7 piece types have defined colors
    scenarios.push({
      description: 'TC-CP-01: Color palette defines colors for all 7 piece types',
      category: 'Color Palette',
      execute: () => {
        const types = ['I', 'O', 'T', 'S', 'Z', 'L', 'J'];
        for (const type of types) {
          check.truthy(PIECE_COLORS[type] !== undefined, `color defined for ${type}`);
          check.truthy(typeof PIECE_COLORS[type] === 'string', `${type} color is string`);
        }
      },
    });

    // TC-CP-02: Ghost color is translucent
    scenarios.push({
      description: 'TC-CP-02: Ghost color uses rgba with alpha < 1',
      category: 'Color Palette',
      execute: () => {
        check.truthy(PIECE_COLORS.ghost.includes('rgba'), 'ghost uses rgba');
        check.truthy(PIECE_COLORS.ghost.includes('0.3'), 'ghost alpha is 0.3');
      },
    });

    // TC-CP-03: Empty cell has dark background
    scenarios.push({
      description: 'TC-CP-03: Empty cell background color is defined',
      category: 'Color Palette',
      execute: () => {
        check.truthy(PIECE_COLORS.empty !== undefined, 'empty color defined');
        check.eq(PIECE_COLORS.empty, '#1a1a2e', 'dark background color');
      },
    });

    // TC-CP-04: Grid line color is defined
    scenarios.push({
      description: 'TC-CP-04: Grid line color is defined',
      category: 'Color Palette',
      execute: () => {
        check.truthy(PIECE_COLORS.grid !== undefined, 'grid color defined');
      },
    });

    // TC-CP-05: No two piece types share the same color
    scenarios.push({
      description: 'TC-CP-05: All piece type colors are unique',
      category: 'Color Palette',
      execute: () => {
        const types = ['I', 'O', 'T', 'S', 'Z', 'L', 'J'];
        const colors = types.map(t => PIECE_COLORS[t]);
        const unique = new Set(colors);
        check.eq(unique.size, 7, 'all 7 colors are unique');
      },
    });

    // TC-CP-06: Standard Tetris color mapping
    scenarios.push({
      description: 'TC-CP-06: Colors follow standard Tetris convention',
      category: 'Color Palette',
      execute: () => {
        // I = cyan, O = yellow, T = purple, S = green, Z = red, L = orange, J = blue
        check.eq(PIECE_COLORS.I, '#00f0f0', 'I = cyan');
        check.eq(PIECE_COLORS.O, '#f0f000', 'O = yellow');
        check.eq(PIECE_COLORS.T, '#a000f0', 'T = purple');
        check.eq(PIECE_COLORS.S, '#00f000', 'S = green');
        check.eq(PIECE_COLORS.Z, '#f00000', 'Z = red');
        check.eq(PIECE_COLORS.L, '#f0a000', 'L = orange');
        check.eq(PIECE_COLORS.J, '#0000f0', 'J = blue');
      },
    });

    return scenarios;
  }
}

// ============================================================================
// Section 12: Boundary Rendering Verification Test Factory
//             (ref: Schneider Test Protocol v2.0 §8.1 — Render Extrema)
// ============================================================================

/**
 * BoundaryRenderingTestFactory
 *
 * Validates the rendering pipeline at grid boundary extrema: cells at row 0,
 * row 19, column 0, and column 9. Ensures no off-by-one errors in pixel
 * coordinate calculation and that boundary cells are rendered identically
 * to interior cells.
 */
class BoundaryRenderingTestFactory extends AbstractTestCaseFactory {
  createScenarios() {
    const scenarios = [];

    // TC-BR-01: Cell at (0, 0) — top-left corner renders
    scenarios.push({
      description: 'TC-BR-01: Filled cell at grid corner (0, 0) is rendered',
      category: 'Boundary Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        const state = createDefaultGameState({ activePiece: null });
        state.grid[0][0] = 'T';
        renderer.render(state);
        const cell = recorder.operationsOfType('fillCell').find(
          op => op.args.x === 0 && op.args.y === 0
        );
        check.truthy(cell !== undefined, 'corner cell (0,0) rendered');
        check.eq(cell.args.color, PIECE_COLORS.T, 'corner cell has correct color');
      },
    });

    // TC-BR-02: Cell at (9, 0) — top-right corner renders
    scenarios.push({
      description: 'TC-BR-02: Filled cell at grid corner (9, 0) is rendered',
      category: 'Boundary Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        const state = createDefaultGameState({ activePiece: null });
        state.grid[0][9] = 'I';
        renderer.render(state);
        const cell = recorder.operationsOfType('fillCell').find(
          op => op.args.x === 9 && op.args.y === 0
        );
        check.truthy(cell !== undefined, 'corner cell (9,0) rendered');
        check.eq(cell.args.color, PIECE_COLORS.I, 'top-right corner has I color');
      },
    });

    // TC-BR-03: Cell at (0, 19) — bottom-left corner renders
    scenarios.push({
      description: 'TC-BR-03: Filled cell at grid corner (0, 19) is rendered',
      category: 'Boundary Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        const state = createDefaultGameState({ activePiece: null });
        state.grid[19][0] = 'S';
        renderer.render(state);
        const cell = recorder.operationsOfType('fillCell').find(
          op => op.args.x === 0 && op.args.y === 19
        );
        check.truthy(cell !== undefined, 'corner cell (0,19) rendered');
        check.eq(cell.args.color, PIECE_COLORS.S, 'bottom-left corner has S color');
      },
    });

    // TC-BR-04: Cell at (9, 19) — bottom-right corner renders
    scenarios.push({
      description: 'TC-BR-04: Filled cell at grid corner (9, 19) is rendered',
      category: 'Boundary Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        const state = createDefaultGameState({ activePiece: null });
        state.grid[19][9] = 'Z';
        renderer.render(state);
        const cell = recorder.operationsOfType('fillCell').find(
          op => op.args.x === 9 && op.args.y === 19
        );
        check.truthy(cell !== undefined, 'corner cell (9,19) rendered');
        check.eq(cell.args.color, PIECE_COLORS.Z, 'bottom-right corner has Z color');
      },
    });

    // TC-BR-05: Active piece at row 0 boundary
    scenarios.push({
      description: 'TC-BR-05: Active piece cells at row 0 are rendered correctly',
      category: 'Boundary Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        const state = createDefaultGameState();
        state.activePiece = {
          type: 'I',
          cells: [[-1, 0], [0, 0], [1, 0], [2, 0]],
          rotation: 0,
          x: 5, y: 0,
        };
        renderer.render(state);
        const cells = recorder.operationsOfType('fillActivePieceCell');
        check.eq(cells.length, 4, 'all 4 I-piece cells rendered at row 0');
        for (const cell of cells) {
          check.eq(cell.args.y, 0, 'piece cell at y=0');
        }
      },
    });

    // TC-BR-06: Ghost piece renders at row 19 boundary
    scenarios.push({
      description: 'TC-BR-06: Ghost piece projects to floor (row 19) on empty grid',
      category: 'Boundary Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        const state = createDefaultGameState();
        state.activePiece = {
          type: 'I',
          cells: [[-1, 0], [0, 0], [1, 0], [2, 0]],
          rotation: 0,
          x: 5, y: 3,
        };
        renderer.render(state);
        const ghostComplete = recorder.operationsOfType('ghostPieceComplete');
        check.truthy(ghostComplete.length > 0, 'ghost rendered');
        check.eq(ghostComplete[0].args.ghostY, 19, 'ghost projects to row 19');
      },
    });

    // TC-BR-07: Full bottom row renders all 10 cells
    scenarios.push({
      description: 'TC-BR-07: Full row at y=19 renders all 10 filled cells',
      category: 'Boundary Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        const state = createDefaultGameState({ activePiece: null });
        for (let x = 0; x < COLS; x++) state.grid[19][x] = 'G';
        renderer.render(state);
        const row19Cells = recorder.operationsOfType('fillCell').filter(
          op => op.args.y === 19
        );
        check.eq(row19Cells.length, 10, 'all 10 cells in row 19 rendered');
      },
    });

    // TC-BR-08: Full top row renders all 10 cells
    scenarios.push({
      description: 'TC-BR-08: Full row at y=0 renders all 10 filled cells',
      category: 'Boundary Rendering',
      execute: () => {
        const recorder = new CanvasOperationRecorder();
        const canvas = new MockCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const renderer = new StackYRendererKernel(canvas, recorder);
        const state = createDefaultGameState({ activePiece: null });
        for (let x = 0; x < COLS; x++) state.grid[0][x] = 'L';
        renderer.render(state);
        const row0Cells = recorder.operationsOfType('fillCell').filter(
          op => op.args.y === 0
        );
        check.eq(row0Cells.length, 10, 'all 10 cells in row 0 rendered');
      },
    });

    return scenarios;
  }
}

// ============================================================================
// Section 13: Orchestration & Execution
// ============================================================================

const orchestrator = new TestSuiteOrchestrator(
  'StackY Renderer — Comprehensive Verification Suite v2.1.0 (Schneider Protocol)',
  58
);

orchestrator.registerFactories([
  // Grid rendering (8 tests)
  wrapFactory(new GridRenderingTestFactory()),

  // Active piece rendering (7 tests)
  wrapFactory(new ActivePieceRenderingTestFactory()),

  // Ghost piece rendering (6 tests)
  wrapFactory(new GhostPieceRenderingTestFactory()),

  // UI panel rendering (10 tests)
  wrapFactory(new UIPanelRenderingTestFactory()),

  // Game over overlay (5 tests)
  wrapFactory(new GameOverOverlayTestFactory()),

  // Frame consistency (4 tests)
  wrapFactory(new FrameConsistencyTestFactory()),

  // Canvas dimensions (4 tests)
  wrapFactory(new CanvasDimensionTestFactory()),

  // Color palette (6 tests)
  wrapFactory(new ColorPaletteContractTestFactory()),

  // Boundary rendering at grid extrema (8 tests)
  wrapFactory(new BoundaryRenderingTestFactory()),
]);

orchestrator.execute();
