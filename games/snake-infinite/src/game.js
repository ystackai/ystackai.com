/**
 * SnakeGame — core state machine and game logic
 *
 * Responsibilities:
 *   - Snake position and movement
 *   - Collision detection (boundary + self)
 *   - Food spawning (never on snake body)
 *   - Score tracking
 *   - Progressive difficulty scaling
 *
 * No DOM or canvas dependencies. Pure logic only.
 */
class SnakeGame {
    /**
     * @param {number} canvasWidth  - Canvas width in pixels
     * @param {number} canvasHeight - Canvas height in pixels
     * @param {number} gridSize     - Size of one grid cell in pixels
     */
    constructor(canvasWidth = 400, canvasHeight = 400, gridSize = 20) {
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.gridSize = gridSize;

        // Grid dimensions (number of cells)
        this.cols = Math.floor(canvasWidth / gridSize);
        this.rows = Math.floor(canvasHeight / gridSize);

        // Score and difficulty state
        this.score = 0;
        this.foodEaten = 0;
        this.level = 1;

        // Speed in "frames per second equivalent" — higher = faster snake
        // The main loop uses this to throttle update frequency
        this.baseSpeed = 60;
        this.currentSpeed = this.baseSpeed;

        this._init();
    }

    // ─── Private ────────────────────────────────────────────────────────────────

    _init() {
        // Start snake at grid center, length 1
        this.snake = [
            { x: Math.floor(this.cols / 2), y: Math.floor(this.rows / 2) }
        ];

        // Initial direction: moving right
        this.direction     = { x: 1, y: 0 };
        this.nextDirection = { x: 1, y: 0 };

        this.running  = true;
        this.gameOver = false;

        this._spawnFood();
    }

    /**
     * Spawn food at a random empty cell.
     * Retries until a cell not occupied by the snake is found.
     * In the degenerate case (snake fills the board), this will loop forever —
     * but that's a win condition the UI should handle before it happens.
     */
    _spawnFood() {
        let candidate;
        do {
            candidate = {
                x: Math.floor(Math.random() * this.cols),
                y: Math.floor(Math.random() * this.rows)
            };
        } while (this._cellOccupied(candidate));

        this.food = candidate;
    }

    /**
     * @param {{x: number, y: number}} cell
     * @returns {boolean}
     */
    _cellOccupied(cell) {
        return this.snake.some(seg => seg.x === cell.x && seg.y === cell.y);
    }

    // ─── Public API ─────────────────────────────────────────────────────────────

    /**
     * Queue a direction change. Silently ignores:
     *   - 180-degree reversals (snake can't turn into itself)
     *   - No-ops (same direction queued twice)
     *
     * @param {{x: number, y: number}} dir
     */
    setDirection(dir) {
        const reversing =
            this.direction.x === -dir.x &&
            this.direction.y === -dir.y;

        if (!reversing) {
            this.nextDirection = dir;
        }
    }

    /**
     * Advance the game by one tick.
     *
     * @returns {boolean} true if game is still running after this tick
     */
    update() {
        if (!this.running) return false;

        // Commit queued direction
        this.direction = this.nextDirection;

        const head = this.snake[0];
        const newHead = {
            x: head.x + this.direction.x,
            y: head.y + this.direction.y
        };

        // Boundary check — must happen before self-collision check
        if (this._hitsBoundary(newHead)) {
            this._triggerGameOver();
            return false;
        }

        // Self collision — check against current body (before the new head is added)
        if (this._hitsSelf(newHead)) {
            this._triggerGameOver();
            return false;
        }

        // Move: prepend new head
        this.snake.unshift(newHead);

        // Food check
        if (newHead.x === this.food.x && newHead.y === this.food.y) {
            this._eatFood();
            // Snake grows: don't pop the tail
        } else {
            // Normal move: pop tail to maintain length
            this.snake.pop();
        }

        return true;
    }

    /**
     * @param {{x: number, y: number}} head
     * @returns {boolean}
     */
    _hitsBoundary(head) {
        return head.x < 0 || head.x >= this.cols ||
               head.y < 0 || head.y >= this.rows;
    }

    /**
     * Check the new head against the full current snake body.
     * The tail is still present at this point (before pop), which is correct:
     * the tail moves away on the same tick, so it's not actually a collision.
     * We exclude the last segment to match classic snake collision rules.
     *
     * @param {{x: number, y: number}} head
     * @returns {boolean}
     */
    _hitsSelf(head) {
        // Exclude the last segment — it vacates this tick
        const bodyToCheck = this.snake.slice(0, this.snake.length - 1);
        return bodyToCheck.some(seg => seg.x === head.x && seg.y === head.y);
    }

    _eatFood() {
        this.foodEaten += 1;
        this.score += 10 * this.level;
        this._updateDifficulty();
        this._spawnFood();
    }

    /**
     * Progressive difficulty: every 5 food eaten → level up → speed increase.
     * Speed caps at 200 fps to keep the game winnable.
     */
    _updateDifficulty() {
        const newLevel = Math.floor(this.foodEaten / 5) + 1;
        if (newLevel > this.level) {
            this.level = newLevel;
            this.currentSpeed = Math.min(this.baseSpeed + (this.level - 1) * 5, 200);
        }
    }

    _triggerGameOver() {
        this.running  = false;
        this.gameOver = true;
    }

    /**
     * Full reset — score, level, snake, everything.
     */
    reset() {
        this.score       = 0;
        this.foodEaten   = 0;
        this.level       = 1;
        this.currentSpeed = this.baseSpeed;
        this._init();
    }

    /**
     * Snapshot of current state for the renderer and UI.
     * Returns a plain object (not a reference to internals).
     *
     * @returns {{
     *   snake: Array<{x: number, y: number}>,
     *   food:  {x: number, y: number},
     *   score: number,
     *   foodEaten: number,
     *   level: number,
     *   speed: number,
     *   length: number,
     *   gameOver: boolean,
     *   running: boolean
     * }}
     */
    getState() {
        return {
            snake:     this.snake.map(s => ({ ...s })),   // shallow copy each cell
            food:      { ...this.food },
            score:     this.score,
            foodEaten: this.foodEaten,
            level:     this.level,
            speed:     Math.round(this.currentSpeed),
            length:    this.snake.length,
            gameOver:  this.gameOver,
            running:   this.running
        };
    }
}
