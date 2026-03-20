/* ============================================================
   StackY × Wonka — Golden Ticket Floating Animation Engine
   Spawns tickets that fall from the sky with random trails.
   Drop this on any page, it handles itself.
   ============================================================ */

(function () {
  'use strict';

  var CONFIG = {
    spawnInterval: 1800,   // ms between new tickets
    maxTickets: 25,        // cap so we don't melt phones
    fallDurationMin: 8,    // seconds — fastest fall
    fallDurationMax: 16,   // seconds — slowest fall
    trailChance: 0.6,      // probability a ticket leaves a trail
    sparkleCount: 4,       // sparkles per ticket spawn
    icons: ['🎫', '🎟️', '✨', '🏭']
  };

  // --- helpers ---
  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // --- build the canvas layer ---
  var canvas = document.createElement('div');
  canvas.className = 'golden-ticket-canvas';
  document.body.appendChild(canvas);

  var liveCount = 0;

  // --- spawn a single ticket ---
  function spawnTicket() {
    if (liveCount >= CONFIG.maxTickets) return;

    var ticket = document.createElement('div');
    ticket.className = 'golden-ticket-particle';

    // random size class for depth
    var sizes = ['size-sm', 'size-md', 'size-lg'];
    var weights = [0.4, 0.4, 0.2]; // small & medium more common
    var r = Math.random();
    var sizeClass = r < weights[0] ? sizes[0] : r < weights[0] + weights[1] ? sizes[1] : sizes[2];
    ticket.classList.add(sizeClass);

    // random position & physics
    var startX = rand(2, 95);
    var driftX = rand(-80, 80);
    var spin = rand(-540, 540);
    var duration = rand(CONFIG.fallDurationMin, CONFIG.fallDurationMax);

    ticket.textContent = pick(CONFIG.icons);
    ticket.style.left = startX + '%';
    ticket.style.setProperty('--drift-x', driftX + 'px');
    ticket.style.setProperty('--spin', spin + 'deg');
    ticket.style.animationDuration = duration + 's';

    canvas.appendChild(ticket);
    liveCount++;

    // sparkle burst at spawn point
    spawnSparkles(startX);

    // optional trail
    if (Math.random() < CONFIG.trailChance) {
      spawnTrail(startX, duration);
    }

    // clean up when done
    ticket.addEventListener('animationend', function () {
      ticket.remove();
      liveCount--;
    });
  }

  // --- sparkle burst ---
  function spawnSparkles(x) {
    for (var i = 0; i < CONFIG.sparkleCount; i++) {
      var spark = document.createElement('div');
      spark.className = 'golden-ticket-sparkle';
      spark.style.left = x + '%';
      spark.style.top = '0';
      spark.style.setProperty('--spark-x', rand(-30, 30) + 'px');
      spark.style.setProperty('--spark-y', rand(-30, 10) + 'px');
      spark.style.animationDelay = (i * 0.08) + 's';
      canvas.appendChild(spark);

      spark.addEventListener('animationend', function () {
        this.remove();
      });
    }
  }

  // --- random trail behind a ticket ---
  function spawnTrail(x, fallDuration) {
    var trailLen = rand(60, 150);
    var trail = document.createElement('div');
    trail.className = 'golden-ticket-trail';

    // offset slightly so the trail doesn't sit right on the ticket
    trail.style.left = 'calc(' + x + '% + ' + rand(-10, 10) + 'px)';
    trail.style.top = rand(5, 30) + '%';
    trail.style.setProperty('--trail-len', trailLen + 'px');
    trail.style.animationDuration = (fallDuration * 0.6) + 's';

    canvas.appendChild(trail);

    trail.addEventListener('animationend', function () {
      trail.remove();
    });
  }

  // --- main loop ---
  var timer = setInterval(function () {
    spawnTicket();
  }, CONFIG.spawnInterval);

  // spawn a few immediately so the page isn't empty on load
  for (var i = 0; i < 5; i++) {
    setTimeout(spawnTicket, i * 300);
  }

  // ============================================================
  //  GOLDEN TICKET EXPLOSION — triggered on 4-line clear
  //  Dispatch: document.dispatchEvent(new CustomEvent('golden-ticket-clear'))
  // ============================================================

  var EXPLOSION = {
    particleCount: 35,      // total burst particles
    ticketCount: 6,         // golden tickets flying out
    starCount: 8,           // star sparkles
    flyDistMin: 80,         // min px from center
    flyDistMax: 350,        // max px from center
    duration: 1.2,          // seconds for particles
    shardColors: ['#f5d060', '#d4af37', '#fff6d5', '#ffec99', '#b8860b']
  };

  function triggerGoldenExplosion() {
    // 1. screen flash
    var flash = document.createElement('div');
    flash.className = 'golden-screen-flash';
    document.body.appendChild(flash);
    flash.addEventListener('animationend', function () { flash.remove(); });

    // 2. glow burst ring
    var glow = document.createElement('div');
    glow.className = 'golden-glow-burst';
    document.body.appendChild(glow);
    glow.addEventListener('animationend', function () { glow.remove(); });

    // 3. explosion particles — shards
    var shardCount = EXPLOSION.particleCount;
    for (var i = 0; i < shardCount; i++) {
      spawnExplosionParticle('shard', i, shardCount);
    }

    // 4. tickets flying outward
    for (var t = 0; t < EXPLOSION.ticketCount; t++) {
      spawnExplosionParticle('ticket', t, EXPLOSION.ticketCount);
    }

    // 5. star sparkles
    for (var s = 0; s < EXPLOSION.starCount; s++) {
      spawnExplosionParticle('star', s, EXPLOSION.starCount);
    }
  }

  function spawnExplosionParticle(type, index, total) {
    var el = document.createElement('div');
    el.className = 'golden-explosion-particle type-' + type;

    // spread evenly around 360° with some jitter
    var baseAngle = (360 / total) * index;
    var angle = baseAngle + rand(-15, 15);
    var rad = angle * (Math.PI / 180);
    var dist = rand(EXPLOSION.flyDistMin, EXPLOSION.flyDistMax);
    var flyX = Math.cos(rad) * dist;
    var flyY = Math.sin(rad) * dist;

    el.style.left = '50%';
    el.style.top = '50%';
    el.style.setProperty('--fly-x', flyX + 'px');
    el.style.setProperty('--fly-y', flyY + 'px');
    el.style.setProperty('--fly-spin', rand(-540, 540) + 'deg');
    el.style.setProperty('--fly-scale', rand(0.1, 0.5));
    el.style.animationDuration = rand(EXPLOSION.duration * 0.7, EXPLOSION.duration * 1.3) + 's';
    el.style.animationDelay = rand(0, 0.15) + 's';

    if (type === 'shard') {
      el.style.setProperty('--shard-size', rand(3, 10) + 'px');
      el.style.setProperty('--shard-color', pick(EXPLOSION.shardColors));
    } else if (type === 'ticket') {
      el.textContent = pick(['🎫', '🎟️', '🏭']);
    } else if (type === 'star') {
      el.textContent = pick(['✨', '⭐', '💫']);
    }

    canvas.appendChild(el);
    el.addEventListener('animationend', function () { el.remove(); });
  }

  // listen for 4-line clear event from the game
  document.addEventListener('golden-ticket-clear', function () {
    triggerGoldenExplosion();
  });

  // expose globally so game code can call it directly too
  window.triggerGoldenExplosion = triggerGoldenExplosion;

  // pause when tab is hidden to save battery
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      clearInterval(timer);
    } else {
      timer = setInterval(function () {
        spawnTicket();
      }, CONFIG.spawnInterval);
    }
  });
})();
