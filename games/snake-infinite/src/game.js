// Snake Infinite — Game Logic
// Zero dependencies. Open index.html and play.

const GRID_SIZE = 20;
const CANVAS_SIZE = 400;
const CELLS = CANVAS_SIZE / GRID_SIZE;
const BASE_INTERVAL = 150;

const Direction = {
    UP:    { x: 0,  y: -1 },
    DOWN:  { x: 0,  y:  1 },
    LEFT:  { x: -1, y:  0 },
    RIGHT: { x: 1,  y:  0 }
};

const GameState = {
    IDLE:     'IDLE',
    RUNNING:  'RUNNING',
    PAUSED:   'PAUSED',
    GAMEOVER: 'GAMEOVER'
};

class SnakeGame {
    constructor(canvasId, scoreId) {
        this.canvas   = document.getElementById(canvasId);
        this.scoreEl  = document.getElementById(scoreId);
        this.ctx      = this.canvas.getContext('2d');
        this.renderer = new Renderer(this.ctx, GRID_SIZE, CELLS);
        this.board    = new LeaderboardManager();
        this.ai       = new AIOpponent(CELLS);

        this.state = GameState.IDLE;
        this._bindKeys();
        this.reset();
    }

    reset() {
        const mid = Math.floor(CELLS / 2);
        this.snake     = [{ x: mid, y: mid }, { x: mid - 1, y: mid }];
        this.dir       = Direction.RIGHT;
        this.nextDir   = Direction.RIGHT;
        this.food      = this._spawnFood();
        this.score     = 0;
        this.tick      = 0;
        this.interval  = BASE_INTERVAL;
        this._updateScore();
        this.state     = GameState.RUNNING;
        if (this._timer) clearInterval(this._timer);
        this._timer    = setInterval(() => this._step(), this.interval);
    }

    _step() {
        if (this.state !== GameState.RUNNING) return;

        this.tick++;
        this.dir = this.nextDir;

        const head = {
            x: this.snake[0].x + this.dir.x,
            y: this.snake[0].y + this.dir.y
        };

        // Wall collision
        if (head.x < 0 || head.x >= CELLS || head.y < 0 || head.y >= CELLS) {
            return this._end();
        }

        // Self collision
        if (this.snake.some(s => s.x === head.x && s.y === head.y)) {
            return this._end();
        }

        this.snake.unshift(head);

        if (head.x === this.food.x && head.y === this.food.y) {
            this.score++;
            this._updateScore();
            this.food = this._spawnFood();
            this.ai.recordEvent('eat', { score: this.score });
            this._maybeSpeedUp();
        } else {
            this.snake.pop();
        }

        const aiMove = this.ai.getMove(this.snake, this.food, this.dir);
        this.renderer.draw(this.snake, this.food, aiMove);
    }

    _maybeSpeedUp() {
        // Progressive difficulty: speed increases every 5 points
        if (this.score % 5 === 0 && this.interval > 60) {
            this.interval = Math.max(60, this.interval - 15);
            clearInterval(this._timer);
            this._timer = setInterval(() => this._step(), this.interval);
        }
    }

    _end() {
        this.state = GameState.GAMEOVER;
        clearInterval(this._timer);
        this.board.submit(this.score);
        this.renderer.drawGameOver(this.score, this.board.topScores());
        this.ai.recordEvent('gameover', { score: this.score, ticks: this.tick });
    }

    _spawnFood() {
        let pos;
        do {
            pos = {
                x: Math.floor(Math.random() * CELLS),
                y: Math.floor(Math.random() * CELLS)
            };
        } while (this.snake.some(s => s.x === pos.x && s.y === pos.y));
        return pos;
    }

    _updateScore() {
        this.scoreEl.textContent = `Score: ${this.score}`;
    }

    _bindKeys() {
        const keyMap = {
            ArrowUp:    Direction.UP,
            ArrowDown:  Direction.DOWN,
            ArrowLeft:  Direction.LEFT,
            ArrowRight: Direction.RIGHT
        };

        document.addEventListener('keydown', e => {
            if (e.key === ' ') {
                if (this.state === GameState.GAMEOVER) this.reset();
                return;
            }
            const d = keyMap[e.key];
            if (!d) return;

            // Prevent 180-degree reversal
            const opp = { x: -this.dir.x, y: -this.dir.y };
            if (d.x === opp.x && d.y === opp.y) return;

            this.nextDir = d;
            e.preventDefault();
        });
    }
}

// Boot
window.addEventListener('DOMContentLoaded', () => {
    window.game = new SnakeGame('gameCanvas', 'score');
});
