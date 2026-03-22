// Snakest — Snake × Inception
// Dream layers with shifting rules and visuals
// Self-bootstraps: just include this script with a <canvas id="game">

(function () {
  'use strict';

  const CELL = 20, W = 30, H = 20, PX = W * CELL, PY = H * CELL;
  const TICK_BASE = 120;

  // ── Dream layers ────────────────────────────────────────────────────
  const LAYERS = [
    { name: 'Reality',    threshold: 0,  bg: '#0a0a12', grid: '#14142a', snake: '#60a5fa', food: '#f472b6', wrap: false, gravity: false, foodMoves: false, speedMul: 1.0 },
    { name: 'Dream',      threshold: 5,  bg: '#0c0818', grid: '#1a1040', snake: '#a78bfa', food: '#34d399', wrap: true,  gravity: false, foodMoves: false, speedMul: 1.1 },
    { name: 'Deep Dream', threshold: 12, bg: '#10060e', grid: '#2a1028', snake: '#f0abfc', food: '#fbbf24', wrap: true,  gravity: false, foodMoves: true,  speedMul: 1.25 },
    { name: 'Limbo',      threshold: 20, bg: '#020204', grid: '#0a0a10', snake: '#e2e8f0', food: '#ef4444', wrap: false, gravity: true,  foodMoves: false, speedMul: 1.4 },
  ];

  function layerFor(score) {
    for (let i = LAYERS.length - 1; i >= 0; i--)
      if (score >= LAYERS[i].threshold) return i;
    return 0;
  }

  // ── Audio ───────────────────────────────────────────────────────────
  let actx;
  function audio() { return actx || (actx = new (window.AudioContext || window.webkitAudioContext)()); }

  function beep(freq, dur, type = 'sine', vol = 0.15) {
    const a = audio(), o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    o.connect(g).connect(a.destination);
    o.start(); o.stop(a.currentTime + dur);
  }

  function sndEat()   { beep(520, 0.1); beep(780, 0.1, 'sine', 0.1); }
  function sndDeath() { beep(180, 0.4, 'sawtooth', 0.2); beep(90, 0.6, 'square', 0.1); }
  function sndLayer() { beep(330, 0.2, 'triangle'); setTimeout(() => beep(440, 0.2, 'triangle'), 100); setTimeout(() => beep(660, 0.3, 'triangle'), 200); }

  // ── Drone (ambient for deeper layers) ───────────────────────────────
  let drone = null;
  function startDrone(layerIdx) {
    stopDrone();
    if (layerIdx < 1) return;
    const a = audio(), o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.value = 55 + layerIdx * 15;
    g.gain.value = 0.04 + layerIdx * 0.015;
    const lfo = a.createOscillator(), lfoG = a.createGain();
    lfo.frequency.value = 0.5 + layerIdx * 0.3; lfoG.gain.value = 0.02;
    lfo.connect(lfoG).connect(g.gain);
    o.connect(g).connect(a.destination);
    o.start(); lfo.start();
    drone = { o, g, lfo };
  }
  function stopDrone() {
    if (!drone) return;
    try { drone.o.stop(); drone.lfo.stop(); } catch (_) {}
    drone = null;
  }

  // ── State ───────────────────────────────────────────────────────────
  let snake, dir, nextDir, food, score, alive, level, kickTimer, prevLayer;

  function reset() {
    const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
    snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
    dir = { x: 1, y: 0 }; nextDir = { ...dir };
    score = 0; alive = true; level = 0; kickTimer = 0; prevLayer = 0;
    placeFood();
    stopDrone();
    updateGameState();
  }

  function placeFood() {
    const occupied = new Set(snake.map(s => s.x + ',' + s.y));
    let x, y;
    do { x = Math.floor(Math.random() * W); y = Math.floor(Math.random() * H); }
    while (occupied.has(x + ',' + y));
    food = { x, y };
  }

  // ── Game state exposure ─────────────────────────────────────────────
  function updateGameState() {
    window.gameState = {
      score, alive, gameOver: !alive,
      level: level + 1, layerName: LAYERS[level].name,
      player: { x: snake[0].x, y: snake[0].y },
      snakeLength: snake.length,
      food: { x: food?.x, y: food?.y }
    };
  }

  // ── Update ──────────────────────────────────────────────────────────
  function step() {
    if (!alive) return;

    dir = { ...nextDir };
    const L = LAYERS[level];
    let head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // Gravity: drift down when moving horizontally in Limbo
    if (L.gravity && dir.y === 0) head.y += 1;

    // Wrap or die
    if (L.wrap) {
      head.x = ((head.x % W) + W) % W;
      head.y = ((head.y % H) + H) % H;
    } else if (head.x < 0 || head.x >= W || head.y < 0 || head.y >= H) {
      alive = false; sndDeath(); stopDrone(); updateGameState(); return;
    }

    // Self collision
    if (snake.some(s => s.x === head.x && s.y === head.y)) {
      alive = false; sndDeath(); stopDrone(); updateGameState(); return;
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
      score++; sndEat(); placeFood();
      const newLevel = layerFor(score);
      if (newLevel !== level) {
        level = newLevel; kickTimer = 30; sndLayer(); startDrone(level);
      }
    } else {
      snake.pop();
    }

    // Food moves in Deep Dream
    if (L.foodMoves && Math.random() < 0.15) {
      food.x = ((food.x + (Math.random() < 0.5 ? 1 : -1)) % W + W) % W;
      food.y = ((food.y + (Math.random() < 0.5 ? 1 : -1)) % H + H) % H;
    }

    updateGameState();
  }

  // ── Render ──────────────────────────────────────────────────────────
  function draw(ctx, t) {
    const L = LAYERS[level];
    const pulse = Math.sin(t / 600) * 0.3 + 0.7;

    // Kick flash on layer transition
    if (kickTimer > 0) {
      kickTimer--;
      ctx.fillStyle = `rgba(255,255,255,${kickTimer / 30 * 0.4})`;
      ctx.fillRect(0, 0, PX, PY);
      if (kickTimer > 20) return; // white flash
    }

    // Background
    ctx.fillStyle = L.bg;
    ctx.fillRect(0, 0, PX, PY);

    // Grid
    ctx.strokeStyle = L.grid;
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= W; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, PY); ctx.stroke(); }
    for (let y = 0; y <= H; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(PX, y * CELL); ctx.stroke(); }

    // Food
    const fr = CELL / 2 - 2 + Math.sin(t / 200) * 2;
    ctx.fillStyle = L.food;
    ctx.shadowColor = L.food; ctx.shadowBlur = 12 * pulse;
    ctx.beginPath();
    ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, fr, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Snake
    for (let i = 0; i < snake.length; i++) {
      const s = snake[i];
      const alpha = 1 - (i / snake.length) * 0.5;
      ctx.fillStyle = L.snake;
      ctx.globalAlpha = alpha;
      ctx.shadowColor = L.snake; ctx.shadowBlur = i === 0 ? 10 : 4;
      ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;

    // HUD
    ctx.fillStyle = '#fff'; ctx.font = '14px monospace'; ctx.textAlign = 'left';
    ctx.fillText(`Score: ${score}`, 10, PY - 10);
    ctx.textAlign = 'center';
    ctx.fillStyle = L.snake;
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`[ ${L.name} ]`, PX / 2, PY - 10);
    ctx.textAlign = 'right'; ctx.fillStyle = '#64748b'; ctx.font = '12px monospace';
    ctx.fillText(L.wrap ? 'WRAP' : 'WALLS', PX - 10, PY - 10);

    // Game over overlay
    if (!alive) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, PX, PY);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 28px monospace'; ctx.textAlign = 'center';
      ctx.fillText('YOU WOKE UP', PX / 2, PY / 2 - 20);
      ctx.font = '16px monospace'; ctx.fillStyle = '#94a3b8';
      ctx.fillText(`Score: ${score} — Layer: ${L.name}`, PX / 2, PY / 2 + 15);
      ctx.font = '13px monospace'; ctx.fillStyle = '#64748b';
      ctx.fillText('[ SPACE to dream again ]', PX / 2, PY / 2 + 50);
    }
  }

  // ── Input ───────────────────────────────────────────────────────────
  const DIRS = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
                 w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 } };

  document.addEventListener('keydown', e => {
    if (e.key === ' ' && !alive) { reset(); return; }
    const d = DIRS[e.key];
    if (d && (d.x + dir.x !== 0 || d.y + dir.y !== 0)) { nextDir = d; e.preventDefault(); }
  });

  // ── Bootstrap ───────────────────────────────────────────────────────
  let canvas = document.getElementById('game');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'game';
    document.body.appendChild(canvas);
  }
  canvas.width = PX; canvas.height = PY;
  canvas.style.display = 'block'; canvas.style.margin = '0 auto';
  const ctx = canvas.getContext('2d');

  reset();

  let lastTick = 0;
  function loop(t) {
    const interval = TICK_BASE / LAYERS[level].speedMul;
    if (t - lastTick >= interval) { step(); lastTick = t; }
    draw(ctx, t);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
