/**
 * main.js — entry point for Snake Infinite
 *
 * Wires together SnakeGame, SnakeRenderer, and Leaderboard.
 * Owns the game loop (requestAnimationFrame-based with frame throttling),
 * input handling, and UI updates.
 *
 * Game loop design:
 *   - requestAnimationFrame drives the render at 60fps
 *   - Snake logic updates are throttled to `game.currentSpeed` ticks/sec
 *   - This decouples render framerate from game speed, avoiding speed changes
 *     when the browser throttles rAF
 */
(function () {
    'use strict';

    // ─── DOM references ──────────────────────────────────────────────────────────
    const canvas      = document.getElementById('gameCanvas');
    const overlay     = document.getElementById('overlay');
    const restartBtn  = document.getElementById('restartBtn');

    const elScore     = document.getElementById('score');
    const elLength    = document.getElementById('length');
    const elLevel     = document.getElementById('level');
    const elFood      = document.getElementById('foodEaten');
    const elSpeed     = document.getElementById('speed');

    const elFinalScore  = document.getElementById('finalScore');
    const elFinalLength = document.getElementById('finalLength');
    const elFinalLevel  = document.getElementById('finalLevel');

    const elLbList      = document.getElementById('leaderboardList');

    // ─── Module instances ────────────────────────────────────────────────────────
    const GRID_SIZE  = 20;
    const game       = new SnakeGame(canvas.width, canvas.height, GRID_SIZE);
    const renderer   = new SnakeRenderer(canvas, GRID_SIZE);
    const leaderboard = new Leaderboard();

    // ─── Game loop state ─────────────────────────────────────────────────────────
    let lastTimestamp    = 0;
    let accumulatedTime  = 0;
    let animFrameId      = null;

    // ─── Directions map ──────────────────────────────────────────────────────────
    const DIRECTIONS = {
        ArrowUp:    { x:  0, y: -1 },
        ArrowDown:  { x:  0, y:  1 },
        ArrowLeft:  { x: -1, y:  0 },
        ArrowRight: { x:  1, y:  0 },
        w:          { x:  0, y: -1 },
        s:          { x:  0, y:  1 },
        a:          { x: -1, y:  0 },
        d:          { x:  1, y:  0 },
        W:          { x:  0, y: -1 },
        S:          { x:  0, y:  1 },
        A:          { x: -1, y:  0 },
        D:          { x:  1, y:  0 },
    };

    // ─── Input ───────────────────────────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        if (e.key === ' ') {
            e.preventDefault();
            if (game.gameOver) {
                startNewGame();
            }
            return;
        }

        const dir = DIRECTIONS[e.key];
        if (dir) {
            e.preventDefault();
            game.setDirection(dir);
        }
    });

    restartBtn.addEventListener('click', startNewGame);

    // ─── Game loop ───────────────────────────────────────────────────────────────

    /**
     * Main loop. Called by requestAnimationFrame.
     * Uses a fixed-timestep accumulator to decouple game speed from render rate.
     *
     * @param {DOMHighResTimeStamp} timestamp
     */
    function loop(timestamp) {
        const delta = timestamp - lastTimestamp;
        lastTimestamp = timestamp;

        // Clamp delta to avoid spiral of death after tab inactivity
        const clampedDelta = Math.min(delta, 100);
        accumulatedTime += clampedDelta;

        // ms per game tick at current speed
        const msPerTick = 1000 / game.currentSpeed;

        while (accumulatedTime >= msPerTick) {
            accumulatedTime -= msPerTick;
            const stillRunning = game.update();

            if (!stillRunning) {
                handleGameOver();
                return; // Stop the loop
            }
        }

        const state = game.getState();
        renderer.render(state);
        updateHUD(state);

        animFrameId = requestAnimationFrame(loop);
    }

    /**
     * Start (or restart) the game
     */
    function startNewGame() {
        if (animFrameId !== null) {
            cancelAnimationFrame(animFrameId);
        }

        game.reset();
        overlay.classList.remove('show');
        accumulatedTime = 0;
        lastTimestamp   = 0;
        animFrameId = requestAnimationFrame(loop);
    }

    /**
     * Called when the game ends
     */
    function handleGameOver() {
        const state = game.getState();

        // Final render so the player can see where they died
        renderer.render(state);

        // Submit score
        leaderboard.submit({
            score:  state.score,
            length: state.length,
            level:  state.level
        });

        // Update overlay
        elFinalScore.textContent  = state.score;
        elFinalLength.textContent = state.length;
        elFinalLevel.textContent  = state.level;

        overlay.classList.add('show');

        // Refresh leaderboard display
        renderLeaderboard();
    }

    // ─── HUD ─────────────────────────────────────────────────────────────────────

    function updateHUD(state) {
        elScore.textContent  = state.score;
        elLength.textContent = state.length;
        elLevel.textContent  = state.level;
        elFood.textContent   = state.foodEaten;
        elSpeed.textContent  = state.speed;
    }

    function renderLeaderboard() {
        const scores = leaderboard.getScores();

        if (scores.length === 0) {
            elLbList.innerHTML = '<div class="empty-lb">No scores yet</div>';
            return;
        }

        elLbList.innerHTML = scores
            .map((entry, i) => `
                <div class="leaderboard-entry">
                    <span class="rank">#${i + 1}</span>
                    <span class="lb-score">${entry.score}</span>
                    <span class="lb-meta">L${entry.level} · ${entry.date}</span>
                </div>
            `)
            .join('');
    }

    // ─── Boot ────────────────────────────────────────────────────────────────────
    renderLeaderboard();
    animFrameId = requestAnimationFrame(loop);

}());
