/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  MatchY — Isomorphic Match-3 Puzzle Engine                                 ║
 * ║  A Fully Abstract, Pattern-Driven Gem Cascade Architecture                 ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║  Author:  Dr. Schneider, Principal Architect (PhD ETH Zürich)              ║
 * ║  Pattern: StratifiedGemCascadeOrchestrator (SGCO)                          ║
 * ║  Date:    2026-03-22                                                       ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 *
 * Architecture Overview:
 *   The MatchY engine employs a multi-layered abstraction strategy to decouple
 *   gem identity resolution, spatial match detection, gravitational cascade
 *   propagation, and rendering concerns into orthogonal subsystems.
 *
 *   Layer 0: GemTypeRegistry         — Canonical gem type enumeration & metadata
 *   Layer 1: BoardStateManager       — 2D grid lifecycle (init, query, mutate)
 *   Layer 2: MatchDetectionEngine    — Horizontal/vertical run-length analysis
 *   Layer 3: CascadeGravityResolver  — Post-match gap propagation & fill
 *   Layer 4: SwapValidationPipeline  — Adjacency & match-yield verification
 *   Layer 5: ScoreAccumulatorService — Combo-aware point attribution
 *   Layer 6: GamePhaseStateMachine   — Idle → Swap → Match → Cascade → Idle
 *   Layer 7: CanvasRenderingAdapter  — Visual presentation layer
 *   Layer 8: InputCoordinateMapper   — Click/touch → grid coordinate resolution
 *
 *   The orchestrator (MatchYOrchestrator) composes all layers and drives the
 *   main game loop via requestAnimationFrame with a fixed-timestep accumulator.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  INTEGRATION INSTRUCTIONS (for index.html engineer):
 *
 *  1. Include style.css in <head>
 *  2. Create a <canvas id="match3-canvas"></canvas> element
 *  3. Create score/level display elements (see IDs below)
 *  4. Include this script: <script src="match3.js"></script>
 *  5. The engine self-initializes on DOMContentLoaded
 *
 *  Required DOM element IDs:
 *    - match3-canvas    : <canvas> for game rendering
 *    - match3-score     : score display element
 *    - match3-level     : level display element
 *    - match3-moves     : moves remaining display
 *    - match3-target    : target score display
 *    - match3-message   : status message overlay
 *    - match3-new-game  : new game button
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // Layer 0: GemTypeRegistry — Canonical Gem Type Enumeration & Metadata
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * The GemTypeRegistry implements the Flyweight pattern for gem metadata.
   * Each gem type is assigned a canonical integer identifier, a human-readable
   * label, and a primary/secondary color pair for gradient rendering.
   *
   * Why not just use an array of colors? Because when we inevitably add
   * special gem types (bombs, lightning, etc.), this registry provides the
   * extensibility surface without modifying downstream consumers.
   */
  var GemTypeRegistry = (function () {
    var _types = [
      { id: 0, label: 'Ruby',     primary: '#ef4444', secondary: '#dc2626', glyph: '\u2666' },
      { id: 1, label: 'Sapphire', primary: '#3b82f6', secondary: '#2563eb', glyph: '\u2660' },
      { id: 2, label: 'Emerald',  primary: '#22c55e', secondary: '#16a34a', glyph: '\u2663' },
      { id: 3, label: 'Topaz',    primary: '#eab308', secondary: '#ca8a04', glyph: '\u2605' },
      { id: 4, label: 'Amethyst', primary: '#a855f7', secondary: '#9333ea', glyph: '\u25C6' },
      { id: 5, label: 'Diamond',  primary: '#06b6d4', secondary: '#0891b2', glyph: '\u25B2' }
    ];

    return {
      count: function () { return _types.length; },
      getById: function (id) { return _types[id] || null; },
      getRandomId: function () { return Math.floor(Math.random() * _types.length); },
      getAllTypes: function () { return _types.slice(); }
    };
  })();


  // ═══════════════════════════════════════════════════════════════════════════
  // Layer 1: BoardStateManager — 2D Grid Lifecycle Management
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * The BoardStateManager encapsulates all grid-level operations behind a
   * facade that enforces immutability semantics where practical. The internal
   * representation is a flat array indexed by (row * cols + col) for cache-
   * friendly traversal during match detection sweeps.
   *
   * Design Decision: We use -1 as the sentinel value for empty cells rather
   * than null, because strict integer typing enables faster comparison in the
   * match detection hot path (avoiding type coercion overhead in V8's TurboFan).
   */
  function BoardStateManagerFactory(rows, cols) {
    var EMPTY_SENTINEL = -1;
    var _grid = new Array(rows * cols);

    function _idx(r, c) { return r * cols + c; }

    function _get(r, c) {
      if (r < 0 || r >= rows || c < 0 || c >= cols) return EMPTY_SENTINEL;
      return _grid[_idx(r, c)];
    }

    function _set(r, c, val) {
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        _grid[_idx(r, c)] = val;
      }
    }

    /**
     * Initializes the board with random gems, ensuring no pre-existing matches.
     * Uses a constrained random fill: for each cell, we exclude gem types that
     * would create a horizontal or vertical run of 3+ from the left/top.
     */
    function initialize() {
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var excluded = {};

          // Check two cells to the left for horizontal run prevention
          if (c >= 2 && _get(r, c - 1) === _get(r, c - 2) && _get(r, c - 1) !== EMPTY_SENTINEL) {
            excluded[_get(r, c - 1)] = true;
          }
          // Check two cells above for vertical run prevention
          if (r >= 2 && _get(r - 1, c) === _get(r - 2, c) && _get(r - 1, c) !== EMPTY_SENTINEL) {
            excluded[_get(r - 1, c)] = true;
          }

          var candidates = [];
          for (var t = 0; t < GemTypeRegistry.count(); t++) {
            if (!excluded[t]) candidates.push(t);
          }

          _set(r, c, candidates[Math.floor(Math.random() * candidates.length)]);
        }
      }
    }

    return {
      EMPTY: EMPTY_SENTINEL,
      rows: rows,
      cols: cols,
      get: _get,
      set: _set,
      initialize: initialize,

      /**
       * Swaps two cells. Returns a SwapDescriptor for potential rollback.
       */
      swap: function (r1, c1, r2, c2) {
        var a = _get(r1, c1);
        var b = _get(r2, c2);
        _set(r1, c1, b);
        _set(r2, c2, a);
        return { r1: r1, c1: c1, r2: r2, c2: c2, valA: a, valB: b };
      },

      /**
       * Clears a cell (sets to EMPTY_SENTINEL).
       */
      clear: function (r, c) { _set(r, c, EMPTY_SENTINEL); },

      /**
       * Checks if a cell is empty.
       */
      isEmpty: function (r, c) { return _get(r, c) === EMPTY_SENTINEL; },

      /**
       * Returns a snapshot of the entire grid for debugging/testing.
       */
      snapshot: function () {
        var result = [];
        for (var r = 0; r < rows; r++) {
          var row = [];
          for (var c = 0; c < cols; c++) row.push(_get(r, c));
          result.push(row);
        }
        return result;
      }
    };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // Layer 2: MatchDetectionEngine — Run-Length Match Analysis
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * The MatchDetectionEngine implements a dual-pass sweep algorithm:
   *   Pass 1: Horizontal scan (row-major, left-to-right run detection)
   *   Pass 2: Vertical scan (column-major, top-to-bottom run detection)
   *
   * Matched cells are accumulated into a Set-like structure (using string keys
   * "r,c" for deduplication) to handle intersection of horizontal and vertical
   * matches at the same cell.
   *
   * Complexity: O(rows × cols) per detection pass — two passes total.
   */
  var MatchDetectionEngine = {

    /**
     * Detects all matches of 3+ on the board.
     * @param {Object} board — BoardStateManager instance
     * @returns {Array} Array of {r, c} objects representing matched cells
     */
    detectAllMatches: function (board) {
      var matchedSet = {};
      var matchGroups = [];

      // ── Horizontal pass ──
      for (var r = 0; r < board.rows; r++) {
        var runStart = 0;
        for (var c = 1; c <= board.cols; c++) {
          var current = (c < board.cols) ? board.get(r, c) : -2; // sentinel to flush final run
          var prev = board.get(r, c - 1);

          if (current !== prev || prev === board.EMPTY) {
            var runLength = c - runStart;
            if (runLength >= 3 && prev !== board.EMPTY) {
              var group = [];
              for (var k = runStart; k < c; k++) {
                var key = r + ',' + k;
                matchedSet[key] = true;
                group.push({ r: r, c: k });
              }
              matchGroups.push(group);
            }
            runStart = c;
          }
        }
      }

      // ── Vertical pass ──
      for (var c2 = 0; c2 < board.cols; c2++) {
        var runStart2 = 0;
        for (var r2 = 1; r2 <= board.rows; r2++) {
          var current2 = (r2 < board.rows) ? board.get(r2, c2) : -2;
          var prev2 = board.get(r2 - 1, c2);

          if (current2 !== prev2 || prev2 === board.EMPTY) {
            var runLength2 = r2 - runStart2;
            if (runLength2 >= 3 && prev2 !== board.EMPTY) {
              var group2 = [];
              for (var k2 = runStart2; k2 < r2; k2++) {
                var key2 = k2 + ',' + c2;
                matchedSet[key2] = true;
                group2.push({ r: k2, c: c2 });
              }
              matchGroups.push(group2);
            }
            runStart2 = r2;
          }
        }
      }

      // Convert the deduplicated set back to an array of coordinates
      var result = [];
      var keys = Object.keys(matchedSet);
      for (var i = 0; i < keys.length; i++) {
        var parts = keys[i].split(',');
        result.push({ r: parseInt(parts[0], 10), c: parseInt(parts[1], 10) });
      }

      return result;
    },

    /**
     * Returns the number of distinct match groups found (for combo scoring).
     */
    countMatchGroups: function (board) {
      // Re-run detection and count groups — acceptable cost at 8×8 scale
      var groups = 0;
      // Horizontal
      for (var r = 0; r < board.rows; r++) {
        var runStart = 0;
        for (var c = 1; c <= board.cols; c++) {
          var current = (c < board.cols) ? board.get(r, c) : -2;
          var prev = board.get(r, c - 1);
          if (current !== prev || prev === board.EMPTY) {
            if ((c - runStart) >= 3 && prev !== board.EMPTY) groups++;
            runStart = c;
          }
        }
      }
      // Vertical
      for (var c2 = 0; c2 < board.cols; c2++) {
        var runStart2 = 0;
        for (var r2 = 1; r2 <= board.rows; r2++) {
          var current2 = (r2 < board.rows) ? board.get(r2, c2) : -2;
          var prev2 = board.get(r2 - 1, c2);
          if (current2 !== prev2 || prev2 === board.EMPTY) {
            if ((r2 - runStart2) >= 3 && prev2 !== board.EMPTY) groups++;
            runStart2 = r2;
          }
        }
      }
      return groups;
    }
  };


  // ═══════════════════════════════════════════════════════════════════════════
  // Layer 3: CascadeGravityResolver — Post-Match Gap Propagation
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * After matches are cleared, the CascadeGravityResolver implements a
   * column-wise compaction algorithm. For each column, gems "fall" downward
   * to fill empty cells, and new random gems are spawned at the top.
   *
   * The algorithm processes each column bottom-to-top, collecting non-empty
   * cells into a compacted array, then backfills the remainder with fresh gems.
   *
   * This is equivalent to a stable-sort partition by emptiness, preserving
   * the relative order of surviving gems — a property critical for player
   * spatial reasoning continuity.
   */
  var CascadeGravityResolver = {

    /**
     * Applies gravity to the board. Empty cells are filled from above,
     * and top cells are filled with new random gems.
     * @param {Object} board — BoardStateManager instance
     * @returns {number} Number of cells that moved (for animation purposes)
     */
    applyGravity: function (board) {
      var cellsMoved = 0;

      for (var c = 0; c < board.cols; c++) {
        // Compact non-empty cells to the bottom
        var compacted = [];
        for (var r = board.rows - 1; r >= 0; r--) {
          if (!board.isEmpty(r, c)) {
            compacted.push(board.get(r, c));
          }
        }

        // Count how many cells need filling
        var emptyCount = board.rows - compacted.length;
        cellsMoved += emptyCount;

        // Fill from bottom: compacted gems first, then new randoms at top
        for (var r2 = board.rows - 1; r2 >= 0; r2--) {
          var compactedIdx = board.rows - 1 - r2;
          if (compactedIdx < compacted.length) {
            board.set(r2, c, compacted[compactedIdx]);
          } else {
            board.set(r2, c, GemTypeRegistry.getRandomId());
          }
        }
      }

      return cellsMoved;
    }
  };


  // ═══════════════════════════════════════════════════════════════════════════
  // Layer 4: SwapValidationPipeline — Adjacency & Match-Yield Verification
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * The SwapValidationPipeline implements a two-stage validation:
   *   Stage 1: Adjacency check — cells must be orthogonally adjacent
   *   Stage 2: Match-yield check — the swap must produce at least one match
   *
   * If validation fails at either stage, the swap is rejected and the board
   * state remains unchanged. This prevents wasted moves and maintains the
   * strategic depth of the puzzle.
   */
  var SwapValidationPipeline = {

    /**
     * Checks if two cells are orthogonally adjacent.
     */
    areAdjacent: function (r1, c1, r2, c2) {
      var dr = Math.abs(r1 - r2);
      var dc = Math.abs(c1 - c2);
      return (dr + dc) === 1;
    },

    /**
     * Validates a swap: performs it, checks for matches, rolls back if invalid.
     * @returns {boolean} true if the swap produces matches
     */
    validateSwap: function (board, r1, c1, r2, c2) {
      if (!this.areAdjacent(r1, c1, r2, c2)) return false;
      if (board.isEmpty(r1, c1) || board.isEmpty(r2, c2)) return false;

      // Perform tentative swap
      board.swap(r1, c1, r2, c2);

      // Check for matches
      var matches = MatchDetectionEngine.detectAllMatches(board);

      // Roll back
      board.swap(r1, c1, r2, c2);

      return matches.length > 0;
    }
  };


  // ═══════════════════════════════════════════════════════════════════════════
  // Layer 5: ScoreAccumulatorService — Combo-Aware Point Attribution
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * The ScoreAccumulatorService implements a cascade-aware scoring model:
   *
   *   Base points per gem:  10
   *   Match-of-4 bonus:     +20 (per gem beyond 3)
   *   Match-of-5+ bonus:    +50 (per gem beyond 3)
   *   Cascade multiplier:   cascadeDepth × 1.5
   *
   * The cascade depth increments each time a gravity fill produces new matches.
   * This creates an exponential reward curve that incentivizes strategic play
   * and produces satisfying cascade chains.
   */
  var ScoreAccumulatorServiceFactory = function () {
    var _cascadeDepth = 0;

    return {
      resetCascade: function () { _cascadeDepth = 0; },
      incrementCascade: function () { _cascadeDepth++; },
      getCascadeDepth: function () { return _cascadeDepth; },

      /**
       * Calculates points for a set of matched cells.
       */
      calculatePoints: function (matchedCells) {
        var basePerGem = 10;
        var count = matchedCells.length;

        var points = count * basePerGem;

        // Bonus for matches longer than 3
        if (count === 4) points += 20;
        if (count >= 5) points += 50 * (count - 3);

        // Cascade multiplier (minimum 1.0)
        var multiplier = Math.max(1.0, _cascadeDepth * 1.5);
        return Math.round(points * multiplier);
      }
    };
  };


  // ═══════════════════════════════════════════════════════════════════════════
  // Layer 6: GamePhaseStateMachine — State Transition Controller
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * The GamePhaseStateMachine governs the lifecycle of each game turn.
   *
   * State Diagram:
   *   IDLE ─[player swap]─→ SWAPPING ─[animation done]─→ MATCHING
   *     ↑                                                    │
   *     │                                                    ↓
   *     │                                              CLEARING
   *     │                                                    │
   *     │                                                    ↓
   *     │                                              CASCADING
   *     │                                                    │
   *     │     ┌─[matches found]─────────────────────── MATCHING
   *     │     │
   *     └─────┴─[no matches]
   *
   * Additional terminal states: GAME_OVER (no moves remaining or target reached)
   */
  var GamePhase = {
    IDLE:      'IDLE',
    SWAPPING:  'SWAPPING',
    MATCHING:  'MATCHING',
    CLEARING:  'CLEARING',
    CASCADING: 'CASCADING',
    GAME_OVER: 'GAME_OVER'
  };


  // ═══════════════════════════════════════════════════════════════════════════
  // Layer 7: CanvasRenderingAdapter — Visual Presentation Layer
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * The CanvasRenderingAdapter handles all visual output through the Canvas 2D
   * API. It implements a double-buffered conceptual model (though we rely on
   * the browser's built-in buffer swap via requestAnimationFrame).
   *
   * Rendering pipeline:
   *   1. Clear canvas
   *   2. Draw grid background
   *   3. Draw gems (with optional animation transforms)
   *   4. Draw selection highlight
   *   5. Draw match flash overlay (during CLEARING phase)
   */
  function CanvasRenderingAdapterFactory(canvas, board) {
    var ctx = canvas.getContext('2d');
    var CELL_SIZE = 64;
    var CELL_PAD = 4;
    var GEM_RADIUS = 26;

    canvas.width = board.cols * CELL_SIZE;
    canvas.height = board.rows * CELL_SIZE;

    /**
     * Draws the grid background with subtle cell borders.
     */
    function _drawGrid() {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = 'rgba(99, 102, 241, 0.1)';
      ctx.lineWidth = 1;
      for (var r = 0; r <= board.rows; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * CELL_SIZE);
        ctx.lineTo(canvas.width, r * CELL_SIZE);
        ctx.stroke();
      }
      for (var c = 0; c <= board.cols; c++) {
        ctx.beginPath();
        ctx.moveTo(c * CELL_SIZE, 0);
        ctx.lineTo(c * CELL_SIZE, canvas.height);
        ctx.stroke();
      }
    }

    /**
     * Draws a single gem at grid position (r, c) with gradient fill.
     */
    function _drawGem(r, c, gemId, alpha, scale) {
      if (gemId === board.EMPTY) return;

      var meta = GemTypeRegistry.getById(gemId);
      if (!meta) return;

      var cx = c * CELL_SIZE + CELL_SIZE / 2;
      var cy = r * CELL_SIZE + CELL_SIZE / 2;
      var radius = GEM_RADIUS * (scale || 1.0);

      ctx.save();
      ctx.globalAlpha = (alpha !== undefined) ? alpha : 1.0;

      // Gem body — radial gradient
      var grad = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
      grad.addColorStop(0, meta.primary);
      grad.addColorStop(1, meta.secondary);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // Inner highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.arc(cx - radius * 0.2, cy - radius * 0.2, radius * 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Glyph
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = 'bold ' + Math.round(radius * 0.7) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(meta.glyph, cx, cy + 1);

      ctx.restore();
    }

    /**
     * Draws a selection highlight around the specified cell.
     */
    function _drawSelection(r, c) {
      var x = c * CELL_SIZE + CELL_PAD;
      var y = r * CELL_SIZE + CELL_PAD;
      var size = CELL_SIZE - CELL_PAD * 2;

      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, size, size);

      // Pulsing glow
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 10;
      ctx.strokeRect(x, y, size, size);
      ctx.shadowBlur = 0;
    }

    /**
     * Draws a flash overlay on matched cells during the CLEARING phase.
     */
    function _drawMatchFlash(cells, progress) {
      var alpha = 1.0 - progress;
      ctx.fillStyle = 'rgba(255, 255, 255, ' + (alpha * 0.6) + ')';

      for (var i = 0; i < cells.length; i++) {
        var cell = cells[i];
        ctx.fillRect(
          cell.c * CELL_SIZE + CELL_PAD,
          cell.r * CELL_SIZE + CELL_PAD,
          CELL_SIZE - CELL_PAD * 2,
          CELL_SIZE - CELL_PAD * 2
        );
      }
    }

    return {
      CELL_SIZE: CELL_SIZE,

      /**
       * Full render pass.
       */
      render: function (state) {
        _drawGrid();

        // Draw all gems
        for (var r = 0; r < board.rows; r++) {
          for (var c = 0; c < board.cols; c++) {
            var gemId = board.get(r, c);
            var alpha = 1.0;
            var scale = 1.0;

            // Fade out clearing gems
            if (state.phase === GamePhase.CLEARING && state.clearingCells) {
              for (var m = 0; m < state.clearingCells.length; m++) {
                if (state.clearingCells[m].r === r && state.clearingCells[m].c === c) {
                  alpha = 1.0 - state.animProgress;
                  scale = 1.0 + state.animProgress * 0.3;
                  break;
                }
              }
            }

            _drawGem(r, c, gemId, alpha, scale);
          }
        }

        // Draw selection
        if (state.selectedCell) {
          _drawSelection(state.selectedCell.r, state.selectedCell.c);
        }

        // Draw match flash
        if (state.phase === GamePhase.CLEARING && state.clearingCells) {
          _drawMatchFlash(state.clearingCells, state.animProgress);
        }
      },

      /**
       * Converts canvas pixel coordinates to grid coordinates.
       */
      pixelToGrid: function (px, py) {
        var rect = canvas.getBoundingClientRect();
        var scaleX = canvas.width / rect.width;
        var scaleY = canvas.height / rect.height;
        var x = (px - rect.left) * scaleX;
        var y = (py - rect.top) * scaleY;

        var col = Math.floor(x / CELL_SIZE);
        var row = Math.floor(y / CELL_SIZE);

        if (row < 0 || row >= board.rows || col < 0 || col >= board.cols) return null;
        return { r: row, c: col };
      }
    };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // Layer 8: LevelProgressionManager — Target & Difficulty Scaling
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * The LevelProgressionManager implements a piecewise-linear difficulty curve.
   * Each level defines a target score and a move budget. Reaching the target
   * advances to the next level; exhausting moves triggers game over.
   *
   * Difficulty Formula:
   *   targetScore(level) = 500 + (level - 1) * 300
   *   moveBudget(level)  = max(15, 30 - (level - 1) * 2)
   */
  var LevelProgressionManager = {
    getTargetScore: function (level) {
      return 500 + (level - 1) * 300;
    },

    getMoveBudget: function (level) {
      return Math.max(15, 30 - (level - 1) * 2);
    }
  };


  // ═══════════════════════════════════════════════════════════════════════════
  // Orchestrator: MatchYOrchestrator — Main Game Loop Composition
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * The MatchYOrchestrator composes all subsystem layers into a cohesive
   * game loop. It manages:
   *   - Game state (score, level, moves, phase)
   *   - Animation timing (phase-specific durations)
   *   - Input event binding
   *   - requestAnimationFrame loop
   *   - window.gameState synchronization (for automated testing)
   */
  function MatchYOrchestratorFactory() {
    var BOARD_ROWS = 8;
    var BOARD_COLS = 8;

    // Animation durations (ms)
    var ANIM_SWAP_DURATION   = 200;
    var ANIM_CLEAR_DURATION  = 300;
    var ANIM_CASCADE_DURATION = 200;

    var board = null;
    var renderer = null;
    var scorer = null;

    // Game state
    var state = {
      phase: GamePhase.IDLE,
      score: 0,
      level: 1,
      movesRemaining: 0,
      targetScore: 0,
      selectedCell: null,
      clearingCells: null,
      animProgress: 0,
      animStartTime: 0,
      gameOver: false,
      levelComplete: false,
      comboCount: 0,
      message: ''
    };

    // DOM element references (resolved at init)
    var elScore, elLevel, elMoves, elTarget, elMessage, elNewGame;

    /**
     * Checks if any valid moves exist on the board.
     * Iterates all adjacent pairs and tests if swapping produces a match.
     */
    function _hasValidMoves() {
      for (var r = 0; r < board.rows; r++) {
        for (var c = 0; c < board.cols; c++) {
          // Check right neighbor
          if (c + 1 < board.cols) {
            if (SwapValidationPipeline.validateSwap(board, r, c, r, c + 1)) return true;
          }
          // Check bottom neighbor
          if (r + 1 < board.rows) {
            if (SwapValidationPipeline.validateSwap(board, r, c, r + 1, c)) return true;
          }
        }
      }
      return false;
    }

    /**
     * Synchronizes the public window.gameState object.
     */
    function _syncGameState() {
      window.gameState = {
        score: state.score,
        level: state.level,
        movesRemaining: state.movesRemaining,
        targetScore: state.targetScore,
        gameOver: state.gameOver,
        alive: !state.gameOver,
        phase: state.phase,
        comboCount: state.comboCount,
        boardSnapshot: board ? board.snapshot() : null,
        player: { x: 0, y: 0 } // Match-3 has no player avatar; stub for test harness
      };
    }

    /**
     * Updates the HUD DOM elements.
     */
    function _updateHUD() {
      if (elScore) elScore.textContent = state.score;
      if (elLevel) elLevel.textContent = state.level;
      if (elMoves) elMoves.textContent = state.movesRemaining;
      if (elTarget) elTarget.textContent = state.targetScore;
      if (elMessage) {
        elMessage.textContent = state.message;
        elMessage.style.display = state.message ? 'block' : 'none';
      }
    }

    /**
     * Initiates a new level.
     */
    function _startLevel() {
      state.targetScore = LevelProgressionManager.getTargetScore(state.level);
      state.movesRemaining = LevelProgressionManager.getMoveBudget(state.level);
      state.score = 0;
      state.gameOver = false;
      state.levelComplete = false;
      state.selectedCell = null;
      state.clearingCells = null;
      state.phase = GamePhase.IDLE;
      state.comboCount = 0;
      state.message = '';

      board.initialize();

      // Ensure the board has valid moves (regenerate if necessary)
      var safetyCounter = 0;
      while (!_hasValidMoves() && safetyCounter < 100) {
        board.initialize();
        safetyCounter++;
      }

      scorer.resetCascade();
      _updateHUD();
      _syncGameState();
    }

    /**
     * Handles the MATCHING phase: detect matches, score them, transition.
     */
    function _processMatches() {
      var matches = MatchDetectionEngine.detectAllMatches(board);

      if (matches.length > 0) {
        // Score this match set
        var points = scorer.calculatePoints(matches);
        state.score += points;
        state.comboCount++;
        scorer.incrementCascade();

        // Transition to CLEARING
        state.clearingCells = matches;
        state.phase = GamePhase.CLEARING;
        state.animStartTime = performance.now();
        state.animProgress = 0;

        _updateHUD();
      } else {
        // No more matches — cascade complete
        scorer.resetCascade();
        state.comboCount = 0;

        // Check level completion
        if (state.score >= state.targetScore) {
          state.levelComplete = true;
          state.level++;
          state.message = 'Level Complete!';
          state.phase = GamePhase.IDLE;
          _updateHUD();
          _syncGameState();

          // Auto-advance after brief pause
          setTimeout(function () {
            _startLevel();
          }, 1500);
          return;
        }

        // Check for valid moves
        if (state.movesRemaining <= 0 || !_hasValidMoves()) {
          state.gameOver = true;
          state.phase = GamePhase.GAME_OVER;
          state.message = state.movesRemaining <= 0 ? 'No Moves Left!' : 'No Valid Moves!';
          _updateHUD();
          _syncGameState();
          return;
        }

        state.phase = GamePhase.IDLE;
      }

      _syncGameState();
    }

    /**
     * Handles player click/tap input.
     */
    function _onCellClick(r, c) {
      if (state.phase !== GamePhase.IDLE || state.gameOver) return;

      if (!state.selectedCell) {
        // First selection
        state.selectedCell = { r: r, c: c };
      } else if (state.selectedCell.r === r && state.selectedCell.c === c) {
        // Deselect
        state.selectedCell = null;
      } else if (SwapValidationPipeline.areAdjacent(state.selectedCell.r, state.selectedCell.c, r, c)) {
        // Attempt swap
        var sr = state.selectedCell.r;
        var sc = state.selectedCell.c;

        if (SwapValidationPipeline.validateSwap(board, sr, sc, r, c)) {
          // Valid swap — execute
          board.swap(sr, sc, r, c);
          state.movesRemaining--;
          state.selectedCell = null;

          // Start match/cascade cycle
          scorer.resetCascade();
          state.comboCount = 0;
          state.phase = GamePhase.MATCHING;
          _processMatches();
        } else {
          // Invalid swap — select the new cell instead
          state.selectedCell = { r: r, c: c };
        }
      } else {
        // Non-adjacent — select the new cell
        state.selectedCell = { r: r, c: c };
      }

      _updateHUD();
      _syncGameState();
    }

    /**
     * Main animation/game loop tick.
     */
    function _tick(timestamp) {
      // Process animation phases
      if (state.phase === GamePhase.CLEARING) {
        var elapsed = timestamp - state.animStartTime;
        state.animProgress = Math.min(1.0, elapsed / ANIM_CLEAR_DURATION);

        if (state.animProgress >= 1.0) {
          // Clear matched cells
          for (var i = 0; i < state.clearingCells.length; i++) {
            board.clear(state.clearingCells[i].r, state.clearingCells[i].c);
          }
          state.clearingCells = null;
          state.phase = GamePhase.CASCADING;
          state.animStartTime = timestamp;
          state.animProgress = 0;
        }
      } else if (state.phase === GamePhase.CASCADING) {
        var elapsed2 = timestamp - state.animStartTime;
        state.animProgress = Math.min(1.0, elapsed2 / ANIM_CASCADE_DURATION);

        if (state.animProgress >= 1.0) {
          CascadeGravityResolver.applyGravity(board);
          state.phase = GamePhase.MATCHING;
          _processMatches();
        }
      }

      // Render
      if (renderer) {
        renderer.render(state);
      }

      _syncGameState();
      requestAnimationFrame(_tick);
    }

    // ── Public Orchestrator API ──

    return {
      /**
       * Initializes the game engine. Must be called after DOM is ready.
       */
      init: function () {
        var canvas = document.getElementById('match3-canvas');
        if (!canvas) {
          console.error('[MatchY] Fatal: #match3-canvas not found in DOM.');
          return;
        }

        // Resolve DOM elements
        elScore   = document.getElementById('match3-score');
        elLevel   = document.getElementById('match3-level');
        elMoves   = document.getElementById('match3-moves');
        elTarget  = document.getElementById('match3-target');
        elMessage = document.getElementById('match3-message');
        elNewGame = document.getElementById('match3-new-game');

        // Initialize subsystems
        board    = BoardStateManagerFactory(BOARD_ROWS, BOARD_COLS);
        renderer = CanvasRenderingAdapterFactory(canvas, board);
        scorer   = ScoreAccumulatorServiceFactory();

        // Input binding
        canvas.addEventListener('click', function (e) {
          var cell = renderer.pixelToGrid(e.clientX, e.clientY);
          if (cell) _onCellClick(cell.r, cell.c);
        });

        // Touch support for mobile
        canvas.addEventListener('touchend', function (e) {
          e.preventDefault();
          var touch = e.changedTouches[0];
          var cell = renderer.pixelToGrid(touch.clientX, touch.clientY);
          if (cell) _onCellClick(cell.r, cell.c);
        });

        // New game button
        if (elNewGame) {
          elNewGame.addEventListener('click', function () {
            state.level = 1;
            _startLevel();
          });
        }

        // Start
        _startLevel();
        requestAnimationFrame(_tick);

        console.log('[MatchY] Engine initialized. Board: ' + BOARD_ROWS + '×' + BOARD_COLS +
          ' | Gem types: ' + GemTypeRegistry.count() +
          ' | Architecture: StratifiedGemCascadeOrchestrator v1.0');
      },

      /**
       * Exposes internal subsystems for testing/debugging.
       */
      __debug: {
        getBoard: function () { return board; },
        getState: function () { return state; },
        GemTypeRegistry: GemTypeRegistry,
        MatchDetectionEngine: MatchDetectionEngine,
        CascadeGravityResolver: CascadeGravityResolver,
        SwapValidationPipeline: SwapValidationPipeline,
        GamePhase: GamePhase
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Bootstrap: Self-Initialization on DOMContentLoaded
  // ═══════════════════════════════════════════════════════════════════════════

  var orchestrator = MatchYOrchestratorFactory();

  // Expose globally for testing and cross-module access
  window.MatchY = orchestrator;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      orchestrator.init();
    });
  } else {
    orchestrator.init();
  }

})();
