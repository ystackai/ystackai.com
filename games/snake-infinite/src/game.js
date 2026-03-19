const CELL = 20;
const COLS = 20;
const ROWS = 20;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');

let snake, dir, nextDir, food, score, level, paused, dead, loopId;

function init() {
    snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    food = spawnFood();
    score = 0;
    level = 1;
    paused = false;
    dead = false;
    scoreEl.textContent = 0;
    levelEl.textContent = 1;
    clearTimeout(loopId);
    loop();
}

function spawnFood() {
    let pos;
    do {
        pos = {
            x: Math.floor(Math.random() * COLS),
            y: Math.floor(Math.random() * ROWS)
        };
    } while (snake.some(s => s.x === pos.x && s.y === pos.y));
    return pos;
}

function loop() {
    if (!paused && !dead) tick();
    const speed = Math.max(80, 200 - (level - 1) * 20);
    loopId = setTimeout(loop, speed);
}

function tick() {
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
        return endGame();
    }
    if (snake.some(s => s.x === head.x && s.y === head.y)) {
        return endGame();
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
        score += level * 10;
        scoreEl.textContent = score;
        if (score >= level * 100) {
            level++;
            levelEl.textContent = level;
        }
        food = spawnFood();
    } else {
        snake.pop();
    }

    draw();
}

function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // food
    ctx.fillStyle = '#ff4d4d';
    ctx.fillRect(food.x * CELL + 2, food.y * CELL + 2, CELL - 4, CELL - 4);

    // snake
    snake.forEach((s, i) => {
        ctx.fillStyle = i === 0 ? '#4a9eff' : '#1a6abf';
        ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
    });

    if (dead) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 28px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 20);
        ctx.font = '18px -apple-system, sans-serif';
        ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2 + 10);
        ctx.fillText('Press Space or New Game', canvas.width / 2, canvas.height / 2 + 36);
    }

    if (paused && !dead) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 28px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Paused', canvas.width / 2, canvas.height / 2);
    }
}

function endGame() {
    dead = true;
    draw();
}

document.addEventListener('keydown', e => {
    switch (e.key) {
        case 'ArrowUp':    if (dir.y !== 1)  nextDir = { x: 0, y: -1 }; break;
        case 'ArrowDown':  if (dir.y !== -1) nextDir = { x: 0, y: 1 };  break;
        case 'ArrowLeft':  if (dir.x !== 1)  nextDir = { x: -1, y: 0 }; break;
        case 'ArrowRight': if (dir.x !== -1) nextDir = { x: 1, y: 0 };  break;
        case ' ':
            if (dead) init();
            else { paused = !paused; draw(); }
            break;
    }
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
        e.preventDefault();
    }
});

document.getElementById('restartBtn').addEventListener('click', init);

init();
