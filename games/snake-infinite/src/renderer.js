/**
 * SnakeRenderer — canvas rendering for Snake Infinite
 *
 * Decoupled from game logic. Receives state snapshot from SnakeGame.getState()
 * and renders it onto a 2D canvas context.
 *
 * Color palette:
 *   Background: #0a1628  (dark navy)
 *   Grid lines:  subtle, low-opacity
 *   Snake head:  #00ff88 (bright green)
 *   Snake body:  gradient from #00cc66 to #006633 (head to tail)
 *   Food:        #ff4757 with pulse animation
 */
class SnakeRenderer {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {number} gridSize - Must match SnakeGame gridSize
     */
    constructor(canvas, gridSize = 20) {
        this.canvas   = canvas;
        this.ctx      = canvas.getContext('2d');
        this.gridSize = gridSize;
        this.cols     = Math.floor(canvas.width / gridSize);
        this.rows     = Math.floor(canvas.height / gridSize);

        // Food pulse animation state
        this._foodPulse = 0;
        this._foodPulseDir = 1;
    }

    /**
     * Render one frame from a game state snapshot.
     *
     * @param {{
     *   snake: Array<{x: number, y: number}>,
     *   food:  {x: number, y: number},
     *   gameOver: boolean
     * }} state
     */
    render(state) {
        this._clearBackground();
        this._drawGrid();
        this._advanceFoodPulse();
        this._drawFood(state.food);
        this._drawSnake(state.snake);
    }

    // ─── Private ────────────────────────────────────────────────────────────────

    _clearBackground() {
        this.ctx.fillStyle = '#0a1628';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    _drawGrid() {
        this.ctx.strokeStyle = 'rgba(0, 255, 136, 0.05)';
        this.ctx.lineWidth = 0.5;

        for (let x = 0; x <= this.cols; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(x * this.gridSize, 0);
            this.ctx.lineTo(x * this.gridSize, this.canvas.height);
            this.ctx.stroke();
        }

        for (let y = 0; y <= this.rows; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y * this.gridSize);
            this.ctx.lineTo(this.canvas.width, y * this.gridSize);
            this.ctx.stroke();
        }
    }

    /**
     * Advance the food pulse oscillator (0→1→0, loops continuously)
     */
    _advanceFoodPulse() {
        this._foodPulse += 0.05 * this._foodPulseDir;
        if (this._foodPulse >= 1) { this._foodPulse = 1; this._foodPulseDir = -1; }
        if (this._foodPulse <= 0) { this._foodPulse = 0; this._foodPulseDir =  1; }
    }

    /**
     * Draw food with a pulsing glow effect
     * @param {{x: number, y: number}} food
     */
    _drawFood(food) {
        const gs  = this.gridSize;
        const px  = food.x * gs;
        const py  = food.y * gs;
        const pad = 3;
        const sz  = gs - pad * 2;

        // Outer glow
        const glowSize = 4 + this._foodPulse * 6;
        this.ctx.shadowColor = '#ff4757';
        this.ctx.shadowBlur  = glowSize;

        this.ctx.fillStyle = '#ff4757';
        this._roundRect(px + pad, py + pad, sz, sz, 4);

        // Inner highlight
        this.ctx.shadowBlur = 0;
        this.ctx.fillStyle  = 'rgba(255, 255, 255, 0.3)';
        this.ctx.fillRect(px + pad + 2, py + pad + 2, sz / 3, sz / 3);
    }

    /**
     * Draw the snake with a color gradient from head (bright) to tail (dark)
     * @param {Array<{x: number, y: number}>} snake
     */
    _drawSnake(snake) {
        const gs     = this.gridSize;
        const length = snake.length;

        snake.forEach((seg, index) => {
            const isHead = index === 0;
            const t      = length > 1 ? index / (length - 1) : 0; // 0 at head, 1 at tail

            // Interpolate green: bright at head → dark at tail
            const green = Math.floor(255 - t * 150);  // 255 → 105
            const color = isHead ? '#00ff88' : `rgb(0, ${green}, ${Math.floor(green * 0.5)})`;

            const pad = isHead ? 1 : 2;
            const sz  = gs - pad * 2;

            this.ctx.shadowColor = isHead ? 'rgba(0, 255, 136, 0.6)' : 'transparent';
            this.ctx.shadowBlur  = isHead ? 8 : 0;
            this.ctx.fillStyle   = color;

            this._roundRect(seg.x * gs + pad, seg.y * gs + pad, sz, sz, isHead ? 5 : 3);
        });

        // Reset shadow after drawing
        this.ctx.shadowBlur = 0;

        // Draw eyes on the head
        if (snake.length > 0) {
            this._drawEyes(snake[0], snake.length > 1 ? snake[1] : null);
        }
    }

    /**
     * Draw eyes on the snake head based on movement direction
     * @param {{x: number, y: number}} head
     * @param {{x: number, y: number}|null} neck - second segment, used to infer direction
     */
    _drawEyes(head, neck) {
        const gs = this.gridSize;
        const cx = head.x * gs + gs / 2;
        const cy = head.y * gs + gs / 2;

        // Infer direction from head-neck relationship
        let dx = 0, dy = 0;
        if (neck) {
            dx = head.x - neck.x;
            dy = head.y - neck.y;
        }

        // Place eyes perpendicular to movement direction
        const eyeRadius = 2;
        const eyeOffset = 4;
        const eyeForward = 3;

        let eye1, eye2;

        if (dy === 0) {
            // Moving horizontally
            eye1 = { x: cx + dx * eyeForward, y: cy - eyeOffset };
            eye2 = { x: cx + dx * eyeForward, y: cy + eyeOffset };
        } else {
            // Moving vertically
            eye1 = { x: cx - eyeOffset, y: cy + dy * eyeForward };
            eye2 = { x: cx + eyeOffset, y: cy + dy * eyeForward };
        }

        [eye1, eye2].forEach(eye => {
            this.ctx.fillStyle = '#0a1628';
            this.ctx.beginPath();
            this.ctx.arc(eye.x, eye.y, eyeRadius, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    /**
     * Draw a filled rounded rectangle (polyfill for older environments)
     */
    _roundRect(x, y, w, h, r) {
        this.ctx.beginPath();
        if (typeof this.ctx.roundRect === 'function') {
            this.ctx.roundRect(x, y, w, h, r);
        } else {
            // Fallback for older browsers
            this.ctx.moveTo(x + r, y);
            this.ctx.lineTo(x + w - r, y);
            this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            this.ctx.lineTo(x + w, y + h - r);
            this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            this.ctx.lineTo(x + r, y + h);
            this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            this.ctx.lineTo(x, y + r);
            this.ctx.quadraticCurveTo(x, y, x + r, y);
            this.ctx.closePath();
        }
        this.ctx.fill();
    }
}
