// ═══════════════════════════════════════════════════════════════════════════
//  SnakeY — engine.js
//  RAF loop, rendering, input handling, UI wiring.
//  Depends on: game.js (SnakeyGame global)
// ═══════════════════════════════════════════════════════════════════════════

var SnakeyEngine = (function (G) {
  'use strict';

  var state    = G.state;
  var COLS     = G.COLS;
  var ROWS     = G.ROWS;
  var CELL     = G.CELL;
  var CANVAS_PX = G.CANVAS_PX;
  var DELTA    = G.DELTA;
  var TRAIL_LIFETIME_MS = G.TRAIL_LIFETIME_MS;

  // ── Canvas / HiDPI setup ───────────────────────────────────────────────

  var canvas = document.getElementById('game-canvas');
  var ctx    = canvas.getContext('2d');

  var dpr = window.devicePixelRatio || 1;
  canvas.width        = CANVAS_PX * dpr;
  canvas.height       = CANVAS_PX * dpr;
  canvas.style.width  = CANVAS_PX + 'px';
  canvas.style.height = CANVAS_PX + 'px';
  ctx.scale(dpr, dpr);

  // ── Responsive scaling ─────────────────────────────────────────────────

  var wrapper = document.getElementById('canvas-wrapper');

  function applyResponsiveScale() {
    var available = window.innerWidth * 0.95;
    var scale = available < CANVAS_PX ? available / CANVAS_PX : 1;
    wrapper.style.transform    = scale < 1 ? 'scale(' + scale + ')' : '';
    wrapper.style.marginBottom = scale < 1 ? (CANVAS_PX * scale - CANVAS_PX) + 'px' : '';
  }
  applyResponsiveScale();
  window.addEventListener('resize', applyResponsiveScale);

  // ── Tron Mode toggle ───────────────────────────────────────────────────

  var tronToggleEl = document.getElementById('tron-toggle');
  var splashSubEl  = document.querySelector('#overlay-splash .overlay-sub');
  var splashTitleEl = document.querySelector('#overlay-splash .overlay-title');
  var splashEmojiEl = document.querySelector('#overlay-splash .overlay-emoji');
  var heroTitleEl  = document.querySelector('.hero h1');
  var heroSubEl    = document.querySelector('.hero p');

  function updateModeUI() {
    var scoreLabelEl = document.querySelector('.score-bar .score-label');
    if (G.tronMode) {
      if (splashEmojiEl) splashEmojiEl.textContent = '\u26A1';
      if (splashTitleEl) splashTitleEl.textContent = 'Light Cycle';
      if (splashSubEl) splashSubEl.innerHTML = 'Ride the grid. Your trail persists as a wall.<br>It fades after a few seconds \u2014 but hit it and you derez.';
      if (heroTitleEl) heroTitleEl.textContent = 'Light Cycle \u26A1';
      if (heroSubEl) heroSubEl.textContent = 'Survive the grid. Don\'t hit your own trail.';
      if (scoreLabelEl) scoreLabelEl.textContent = 'Survived';
    } else {
      if (splashEmojiEl) splashEmojiEl.textContent = '\uD83D\uDC0D';
      if (splashTitleEl) splashTitleEl.textContent = 'SnakeY';
      if (splashSubEl) splashSubEl.innerHTML = 'Eat the food. Grow longer.<br>Don\'t hit walls or yourself.';
      if (heroTitleEl) heroTitleEl.textContent = 'SnakeY \uD83D\uDC0D';
      if (heroSubEl) heroSubEl.textContent = 'Eat the food. Grow longer. Don\'t hit walls or yourself.';
      if (scoreLabelEl) scoreLabelEl.textContent = 'Score';
    }
  }

  if (tronToggleEl) {
    tronToggleEl.addEventListener('click', function (e) {
      e.stopPropagation();
      G.tronMode = !G.tronMode;
      tronToggleEl.classList.toggle('active', G.tronMode);
      wrapper.style.borderColor = G.tronMode ? 'rgba(0, 255, 255, 0.4)' : '';
      wrapper.style.boxShadow = G.tronMode
        ? '0 0 0 1px rgba(0,255,255,0.15), 0 20px 60px rgba(0,0,0,0.6), 0 0 80px rgba(0,255,255,0.12)'
        : '';
      updateModeUI();
      if (state.phase === 'idle') initialDraw();
    });
  }

  // ── UI element references ──────────────────────────────────────────────

  var scoreEl    = document.getElementById('score-display');
  var hiEl       = document.getElementById('hi-display');
  var splashEl   = document.getElementById('overlay-splash');
  var gameoverEl = document.getElementById('overlay-gameover');
  var goScoreEl  = document.getElementById('go-score');
  var goHiEl     = document.getElementById('go-hi');
  var goEmojiEl  = document.querySelector('#overlay-gameover .overlay-emoji');
  var goTitleEl  = document.querySelector('#overlay-gameover .overlay-title');

  if (hiEl) hiEl.textContent = String(state.hi);

  function updateScoreUI() {
    if (scoreEl) scoreEl.textContent = String(state.score);
    if (hiEl)    hiEl.textContent    = String(state.hi);
  }

  // ── RAF loop ───────────────────────────────────────────────────────────

  var rafId       = null;
  var lastTs      = null;
  var accumulated = 0;

  function startLoop() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    lastTs      = null;
    accumulated = 0;
    rafId = requestAnimationFrame(loop);
  }

  function loop(ts) {
    if (lastTs !== null) accumulated += Math.min(ts - lastTs, 250);
    lastTs = ts;

    var tickInterval = G.tronMode ? G.TRON_TICK_MS : G.TICK_MS;
    while (accumulated >= tickInterval) {
      accumulated -= tickInterval;
      G.tick();
      updateScoreUI();
      if (state.phase !== 'playing') break;
    }

    draw(ts);
    G.syncGameState();
    if (state.phase === 'playing') rafId = requestAnimationFrame(loop);
  }

  // ── Death callback ─────────────────────────────────────────────────────

  G.onDie = function () {
    G.trackGameEnd();
    if (goEmojiEl) goEmojiEl.textContent = G.tronMode ? '\u26A1' : '\uD83D\uDC80';
    if (goTitleEl) goTitleEl.textContent = G.tronMode ? 'Derezzed' : 'Game Over';
    if (goScoreEl) goScoreEl.textContent = String(state.score);
    if (goHiEl) goHiEl.textContent = String(state.hi);
    if (hiEl) hiEl.textContent = String(state.hi);
    var goScoreLabelEl = document.querySelector('#overlay-gameover .overlay-score-label');
    if (goScoreLabelEl) goScoreLabelEl.textContent = G.tronMode ? 'Survived' : 'Score';
    if (gameoverEl) gameoverEl.classList.remove('hidden');
    G.syncGameState();
  };

  // ── State transitions ──────────────────────────────────────────────────

  function startGame() {
    if (splashEl) splashEl.classList.add('hidden');
    if (gameoverEl) gameoverEl.classList.add('hidden');
    updateModeUI();
    G.initGame();
    updateScoreUI();
    state.phase = 'playing';
    G.syncGameState();
    G.trackGameStart();
    startLoop();
  }

  function togglePause() {
    if (state.phase === 'playing') {
      state.phase = 'paused';
    } else if (state.phase === 'paused') {
      state.phase = 'playing';
      startLoop();
    }
    G.syncGameState();
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  function draw(ts) {
    drawBg();
    if (!G.tronMode) drawFood(ts);
    drawSnake();
    if (state.phase === 'paused') drawPauseOverlay();
  }

  function drawBg() {
    if (G.tronMode) {
      ctx.fillStyle = '#0a0a12';
      ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.07)';
      ctx.lineWidth = 0.5;
      for (var i = 1; i < COLS; i++) {
        ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, CANVAS_PX); ctx.stroke();
      }
      for (var j = 1; j < ROWS; j++) {
        ctx.beginPath(); ctx.moveTo(0, j * CELL); ctx.lineTo(CANVAS_PX, j * CELL); ctx.stroke();
      }
      ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 12;
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)'; ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, CANVAS_PX - 2, CANVAS_PX - 2);
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = '#0d0d14';
      ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
      ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 0.5;
      for (var i2 = 1; i2 < COLS; i2++) {
        ctx.beginPath(); ctx.moveTo(i2 * CELL, 0); ctx.lineTo(i2 * CELL, CANVAS_PX); ctx.stroke();
      }
      for (var j2 = 1; j2 < ROWS; j2++) {
        ctx.beginPath(); ctx.moveTo(0, j2 * CELL); ctx.lineTo(CANVAS_PX, j2 * CELL); ctx.stroke();
      }
    }
  }

  function drawFood(ts) {
    var fx = state.food.x, fy = state.food.y;
    var cx = fx * CELL + CELL / 2;
    var cy = fy * CELL + CELL / 2;
    var pulse = 1 + 0.12 * Math.sin(ts / 320);
    var r     = (CELL / 2 - 3) * pulse;
    var glowR = r + 7 * pulse;

    var grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    grd.addColorStop(0, 'rgba(244,114,182,0.55)');
    grd.addColorStop(1, 'rgba(244,114,182,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(cx, cy, glowR, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#f472b6';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.beginPath(); ctx.arc(cx - r * 0.28, cy - r * 0.28, r * 0.32, 0, Math.PI * 2); ctx.fill();
  }

  function drawSnake() {
    var snake = state.snake;
    var dir   = state.dir;
    var len   = snake.length;
    var pad   = 1;
    var size  = CELL - pad * 2;

    if (G.tronMode) {
      var trail = state.tronTrail;
      for (var i = 0; i < trail.length; i++) {
        var seg = trail[i];
        var age = Date.now() - seg.placedAt;
        var life = Math.max(0, 1 - age / TRAIL_LIFETIME_MS);
        if (life <= 0) continue;
        var px = seg.x * CELL + pad;
        var py = seg.y * CELL + pad;
        ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 8 * life;
        ctx.fillStyle = 'rgba(0, 95, 111, ' + (life * 0.85) + ')';
        ctx.fillRect(px, py, size, size);
        ctx.fillStyle = 'rgba(0, 255, 255, ' + (life * life * 0.6) + ')';
        ctx.fillRect(px + 3, py + 3, size - 6, size - 6);
        ctx.shadowBlur = 0;
      }
      if (len > 0) {
        var head = snake[0];
        var hx = head.x * CELL, hy = head.y * CELL;
        ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 20;
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(hx, hy, CELL, CELL);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(hx + 3, hy + 3, CELL - 6, CELL - 6);
        var cxH = hx + CELL / 2, cyH = hy + CELL / 2;
        var dd = DELTA[dir];
        ctx.fillStyle = '#00ffff';
        ctx.beginPath(); ctx.arc(cxH + dd.x * 5, cyH + dd.y * 5, 2, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      for (var si = len - 1; si >= 0; si--) {
        var s = snake[si];
        var spx = s.x * CELL + pad;
        var spy = s.y * CELL + pad;
        var t = len > 1 ? si / (len - 1) : 0;

        if (si === 0) {
          ctx.fillStyle = '#818cf8';
        } else {
          var cr = Math.round(99  + (49  - 99)  * t);
          var cg = Math.round(102 + (46  - 102) * t);
          var cb = Math.round(241 + (129 - 241) * t);
          ctx.fillStyle = 'rgb(' + cr + ',' + cg + ',' + cb + ')';
        }
        roundRect(spx, spy, size, size, si === 0 ? 5 : 3);
        ctx.fill();
        if (si === 0) {
          ctx.strokeStyle = '#a5b4fc'; ctx.lineWidth = 1;
          roundRect(spx, spy, size, size, 5);
          ctx.stroke();
          drawEyes(s, dir);
        }
      }
    }
  }

  function drawEyes(seg, dir) {
    var cx     = seg.x * CELL + CELL / 2;
    var cy     = seg.y * CELL + CELL / 2;
    var eyeR   = 2;
    var offset = 4;
    var eyes;
    if      (dir === 'ArrowRight') { eyes = [{ x: cx + offset, y: cy - 3 }, { x: cx + offset, y: cy + 3 }]; }
    else if (dir === 'ArrowLeft')  { eyes = [{ x: cx - offset, y: cy - 3 }, { x: cx - offset, y: cy + 3 }]; }
    else if (dir === 'ArrowUp')    { eyes = [{ x: cx - 3, y: cy - offset }, { x: cx + 3, y: cy - offset }]; }
    else                           { eyes = [{ x: cx - 3, y: cy + offset }, { x: cx + 3, y: cy + offset }]; }
    ctx.fillStyle = '#ffffff';
    for (var i = 0; i < eyes.length; i++) {
      ctx.beginPath(); ctx.arc(eyes[i].x, eyes[i].y, eyeR, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#1e1b4b';
    for (var j = 0; j < eyes.length; j++) {
      ctx.beginPath(); ctx.arc(eyes[j].x, eyes[j].y, eyeR - 0.8, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawPauseOverlay() {
    ctx.fillStyle = 'rgba(10,10,20,0.55)';
    ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = G.tronMode ? '#00ffff' : '#a5b4fc';
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    if (G.tronMode) { ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 12; }
    ctx.fillText('PAUSED', CANVAS_PX / 2, CANVAS_PX / 2);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#64748b';
    ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('Press P or Space to resume', CANVAS_PX / 2, CANVAS_PX / 2 + 34);
  }

  function roundRect(x, y, w, h, r) {
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return;
    }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── Input: keyboard ────────────────────────────────────────────────────

  var KEY_DIR = {
    ArrowUp: 'ArrowUp', KeyW: 'ArrowUp',
    ArrowDown: 'ArrowDown', KeyS: 'ArrowDown',
    ArrowLeft: 'ArrowLeft', KeyA: 'ArrowLeft',
    ArrowRight: 'ArrowRight', KeyD: 'ArrowRight',
  };

  document.addEventListener('keydown', function (e) {
    var code = e.code;
    if (code.startsWith('Arrow')) e.preventDefault();

    switch (state.phase) {
      case 'idle':
        if (code === 'Space' || code === 'Enter' || KEY_DIR[code]) {
          e.preventDefault(); startGame();
        }
        break;
      case 'dead':
        if (code === 'Space' || code === 'Enter') {
          e.preventDefault(); startGame();
        }
        break;
      case 'playing':
        if (code === 'KeyP' || code === 'Space') {
          e.preventDefault(); togglePause();
        } else {
          var d = KEY_DIR[code];
          if (d) G.queueDir(d);
        }
        break;
      case 'paused':
        if (code === 'KeyP' || code === 'Space') {
          e.preventDefault(); togglePause();
        }
        break;
    }
  });

  // ── Auto-pause on tab hide ─────────────────────────────────────────────

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state.phase === 'playing') togglePause();
  });

  // ── Input: touch / swipe ───────────────────────────────────────────────

  var touchStart = null;

  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    var t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: false });

  canvas.addEventListener('touchend', function (e) {
    e.preventDefault();
    if (!touchStart) return;
    var t  = e.changedTouches[0];
    var dx = t.clientX - touchStart.x;
    var dy = t.clientY - touchStart.y;
    touchStart = null;

    var isTap = Math.abs(dx) < G.SWIPE_MIN && Math.abs(dy) < G.SWIPE_MIN;

    if (state.phase === 'idle' || state.phase === 'dead') { startGame(); return; }
    if (state.phase === 'paused') { if (isTap) togglePause(); return; }
    if (state.phase === 'playing') {
      if (isTap) return;
      var dir = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft')
        : (dy > 0 ? 'ArrowDown'  : 'ArrowUp');
      G.queueDir(dir);
    }
  }, { passive: false });

  // ── Button listeners ───────────────────────────────────────────────────

  var btnStart   = document.getElementById('btn-start');
  var btnRestart = document.getElementById('btn-restart');
  if (btnStart)   btnStart.addEventListener('click', startGame);
  if (btnRestart) btnRestart.addEventListener('click', startGame);

  // ── Initial draw ───────────────────────────────────────────────────────

  function initialDraw() {
    drawBg();
    var pad = 1, size = CELL - pad * 2;
    var demoSegs = [
      { x: 12, y: 10 }, { x: 11, y: 10 }, { x: 10, y: 10 },
      { x:  9, y: 10 }, { x:  8, y: 10 }, { x:  7, y: 10 },
      { x:  7, y: 11 }, { x:  7, y: 12 }, { x:  8, y: 12 },
      { x:  9, y: 12 },
    ];
    var dLen = demoSegs.length;

    if (G.tronMode) {
      for (var i = dLen - 1; i >= 1; i--) {
        var seg = demoSegs[i];
        var fade = 1 - (i / dLen) * 0.6;
        ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 6 * fade;
        ctx.fillStyle = 'rgba(0, 95, 111, ' + (fade * 0.8) + ')';
        ctx.fillRect(seg.x * CELL + pad, seg.y * CELL + pad, size, size);
        ctx.fillStyle = 'rgba(0, 255, 255, ' + (fade * 0.5) + ')';
        ctx.fillRect(seg.x * CELL + pad + 3, seg.y * CELL + pad + 3, size - 6, size - 6);
        ctx.shadowBlur = 0;
      }
      var headT = demoSegs[0];
      ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 20;
      ctx.fillStyle = '#00ffff';
      ctx.fillRect(headT.x * CELL, headT.y * CELL, CELL, CELL);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(headT.x * CELL + 3, headT.y * CELL + 3, CELL - 6, CELL - 6);
    } else {
      for (var j = 0; j < demoSegs.length; j++) {
        var ds = demoSegs[j];
        var dt = dLen > 1 ? j / (dLen - 1) : 0;
        if (j === 0) {
          ctx.fillStyle = '#818cf8';
        } else {
          var cr = Math.round(99  + (49  - 99)  * dt);
          var cg = Math.round(102 + (46  - 102) * dt);
          var cb = Math.round(241 + (129 - 241) * dt);
          ctx.fillStyle = 'rgb(' + cr + ',' + cg + ',' + cb + ')';
        }
        roundRect(ds.x * CELL + pad, ds.y * CELL + pad, size, size, j === 0 ? 5 : 3);
        ctx.fill();
        if (j === 0) {
          ctx.strokeStyle = '#a5b4fc'; ctx.lineWidth = 1;
          roundRect(ds.x * CELL + pad, ds.y * CELL + pad, size, size, 5);
          ctx.stroke();
        }
      }

      var fc  = { x: 13, y: 10 };
      var fcx = fc.x * CELL + CELL / 2;
      var fcy = fc.y * CELL + CELL / 2;
      var fr  = CELL / 2 - 3;
      var grd = ctx.createRadialGradient(fcx, fcy, 0, fcx, fcy, fr + 6);
      grd.addColorStop(0, 'rgba(244,114,182,0.55)');
      grd.addColorStop(1, 'rgba(244,114,182,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(fcx, fcy, fr + 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f472b6';
      ctx.beginPath(); ctx.arc(fcx, fcy, fr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.38)';
      ctx.beginPath(); ctx.arc(fcx - fr * 0.28, fcy - fr * 0.28, fr * 0.32, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Boot ───────────────────────────────────────────────────────────────

  G.initGame();
  G.syncGameState();
  initialDraw();

  return {
    startGame: startGame,
    togglePause: togglePause,
  };

}(SnakeyGame));
