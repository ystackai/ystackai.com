// Snake Infinite — Canvas Renderer

class Renderer {
    constructor(ctx, cellSize, gridCells) {
        this.ctx       = ctx;
        this.cellSize  = cellSize;
        this.gridCells = gridCells;
        this.W         = cellSize * gridCells;
    }

    draw(snake, food, aiHint) {
        const { ctx, cellSize: C } = this;

        // Background
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, this.W, this.W);

        // Grid (subtle)
        ctx.strokeStyle = '#0a0a0a';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= this.gridCells; i++) {
            ctx.beginPath();
            ctx.moveTo(i * C, 0);
            ctx.lineTo(i * C, this.W);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * C);
            ctx.lineTo(this.W, i * C);
            ctx.stroke();
        }

        // AI hint (ghost square)
        if (aiHint) {
            ctx.fillStyle = 'rgba(0, 150, 255, 0.25)';
            ctx.fillRect(aiHint.x * C + 2, aiHint.y * C + 2, C - 4, C - 4);
        }

        // Food
        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.arc(
            food.x * C + C / 2,
            food.y * C + C / 2,
            C / 2 - 2,
            0, Math.PI * 2
        );
        ctx.fill();

        // Snake body
        snake.forEach((seg, i) => {
            const ratio = 1 - (i / snake.length) * 0.5;
            const green = Math.floor(255 * ratio);
            ctx.fillStyle = i === 0
                ? '#00ff00'
                : `rgb(0, ${green}, 0)`;
            ctx.fillRect(seg.x * C + 1, seg.y * C + 1, C - 2, C - 2);
        });
    }

    drawGameOver(score, topScores) {
        const { ctx } = this;
        const W = this.W;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, W, W);

        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 32px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', W / 2, W / 2 - 60);

        ctx.fillStyle = '#00ff00';
        ctx.font = '20px monospace';
        ctx.fillText(`Score: ${score}`, W / 2, W / 2 - 20);

        ctx.fillStyle = '#aaa';
        ctx.font = '14px monospace';
        ctx.fillText('SPACE to restart', W / 2, W / 2 + 10);

        if (topScores.length) {
            ctx.fillStyle = '#ffff00';
            ctx.font = 'bold 14px monospace';
            ctx.fillText('— TOP SCORES —', W / 2, W / 2 + 50);
            topScores.slice(0, 3).forEach((s, i) => {
                ctx.fillStyle = '#ccc';
                ctx.fillText(`${i + 1}. ${s}`, W / 2, W / 2 + 70 + i * 20);
            });
        }
    }
}
