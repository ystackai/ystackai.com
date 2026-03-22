/**
 * SalamanderY — Twin Shooter + Movie Mashup Extension
 *
 * Adds shooting mechanics to the base salamander co-op game:
 *   - Both players can fire projectiles in their facing direction
 *   - Projectiles destroy void zones and enemy spawns
 *   - Co-op "sync shot" when both fire simultaneously while synced = big blast
 *   - Integrates health-bar.js and betrayal-mechanic.js
 *
 * This file is the integration layer. Load after health-bar.js and
 * betrayal-mechanic.js, and before the inline game script (or patch it in).
 *
 * Required script load order in index.html:
 *   <script src="health-bar.js"></script>
 *   <script src="betrayal-mechanic.js"></script>
 *   <script src="salamander.js"></script>
 */
(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────
  var COLS = 20;
  var ROWS = 20;
  var CELL = 24;
  var CANVAS_PX = 480;
  var PROJECTILE_SPEED = 2;       // cells per tick
  var SHOOT_COOLDOWN = 4;         // ticks between shots
  var PROJECTILE_DAMAGE = 10;     // damage to enemies
  var SYNC_SHOT_RADIUS = 2;       // blast radius for sync shot (cells)
  var ENEMY_SPAWN_INTERVAL = 40;  // ticks between enemy spawns
  var ENEMY_HP = 20;
  var MAX_ENEMIES = 6;
  var ENEMY_DAMAGE = 15;          // damage enemies deal on contact
  var ENEMY_KILL_SCORE = 3;

  var DELTA = {
    up:    { x:  0, y: -1 },
    down:  { x:  0, y:  1 },
    left:  { x: -1, y:  0 },
    right: { x:  1, y:  0 },
  };

  // ── Shooter System ────────────────────────────────────────────────────

  function ShooterSystem() {
    this.projectiles = [];  // { x, y, dx, dy, owner, syncShot }
    this.enemies = [];      // { x, y, hp, dir, moveCooldown }
    this.cooldown = { p1: 0, p2: 0 };
    this.enemySpawnTimer = ENEMY_SPAWN_INTERVAL;

    // Track simultaneous fire for sync shot
    this._firedThisTick = { p1: false, p2: false };
  }

  ShooterSystem.prototype.reset = function () {
    this.projectiles = [];
    this.enemies = [];
    this.cooldown = { p1: 0, p2: 0 };
    this.enemySpawnTimer = ENEMY_SPAWN_INTERVAL;
    this._firedThisTick = { p1: false, p2: false };
  };

  ShooterSystem.prototype.shoot = function (playerId, pos, dir) {
    if (this.cooldown[playerId] > 0) return false;

    var d = DELTA[dir];
    if (!d) return false;

    this.projectiles.push({
      x: pos.x + d.x,
      y: pos.y + d.y,
      dx: d.x * PROJECTILE_SPEED,
      dy: d.y * PROJECTILE_SPEED,
      owner: playerId,
      syncShot: false,
      age: 0,
    });

    this.cooldown[playerId] = SHOOT_COOLDOWN;
    this._firedThisTick[playerId] = true;
    return true;
  };

  /**
   * Tick the shooter system. Returns events array.
   *
   * @param {object} gameState - { p1Pos, p2Pos, synced, voids, level }
   * @returns {Array<{ type: string, data: object }>}
   */
  ShooterSystem.prototype.tick = function (gameState) {
    var events = [];

    // Cooldowns
    if (this.cooldown.p1 > 0) this.cooldown.p1--;
    if (this.cooldown.p2 > 0) this.cooldown.p2--;

    // Check for sync shot (both fired this tick while synced)
    if (this._firedThisTick.p1 && this._firedThisTick.p2 && gameState.synced) {
      // Upgrade the last two projectiles to sync shots
      for (var i = this.projectiles.length - 1; i >= 0 && i >= this.projectiles.length - 2; i--) {
        this.projectiles[i].syncShot = true;
      }
      events.push({ type: 'sync_shot', data: {} });
    }
    this._firedThisTick = { p1: false, p2: false };

    // Move projectiles
    for (var pi = this.projectiles.length - 1; pi >= 0; pi--) {
      var p = this.projectiles[pi];
      p.x += p.dx;
      p.y += p.dy;
      p.age++;

      // Out of bounds → remove
      if (p.x < -1 || p.x > COLS || p.y < -1 || p.y > ROWS || p.age > 25) {
        this.projectiles.splice(pi, 1);
        continue;
      }

      // Hit void zone → destroy both
      var rx = Math.round(p.x);
      var ry = Math.round(p.y);
      for (var vi = gameState.voids.length - 1; vi >= 0; vi--) {
        var v = gameState.voids[vi];
        if (v.x === rx && v.y === ry) {
          gameState.voids.splice(vi, 1);
          this.projectiles.splice(pi, 1);
          events.push({ type: 'void_destroyed', data: { x: rx, y: ry } });
          break;
        }
      }
    }

    // Hit enemies
    for (var pi = this.projectiles.length - 1; pi >= 0; pi--) {
      var p = this.projectiles[pi];
      var rx = Math.round(p.x);
      var ry = Math.round(p.y);

      for (var ei = this.enemies.length - 1; ei >= 0; ei--) {
        var e = this.enemies[ei];
        var hitDist = p.syncShot ? SYNC_SHOT_RADIUS : 0;
        if (Math.abs(e.x - rx) <= hitDist && Math.abs(e.y - ry) <= hitDist) {
          var dmg = p.syncShot ? PROJECTILE_DAMAGE * 3 : PROJECTILE_DAMAGE;
          e.hp -= dmg;
          if (e.hp <= 0) {
            this.enemies.splice(ei, 1);
            events.push({
              type: 'enemy_killed',
              data: { x: e.x, y: e.y, killer: p.owner, score: ENEMY_KILL_SCORE },
            });
          }
          this.projectiles.splice(pi, 1);
          break;
        }
      }
    }

    // Enemy spawning
    this.enemySpawnTimer--;
    if (this.enemySpawnTimer <= 0 && this.enemies.length < MAX_ENEMIES) {
      this._spawnEnemy(gameState);
      // Spawn rate increases with level
      this.enemySpawnTimer = Math.max(15, ENEMY_SPAWN_INTERVAL - gameState.level * 3);
    }

    // Move enemies toward nearest player
    for (var ei = 0; ei < this.enemies.length; ei++) {
      var e = this.enemies[ei];
      e.moveCooldown--;
      if (e.moveCooldown > 0) continue;
      e.moveCooldown = 3; // enemies move every 3 ticks

      // Pick closer player
      var d1 = Math.abs(e.x - gameState.p1Pos.x) + Math.abs(e.y - gameState.p1Pos.y);
      var d2 = Math.abs(e.x - gameState.p2Pos.x) + Math.abs(e.y - gameState.p2Pos.y);
      var target = d1 <= d2 ? gameState.p1Pos : gameState.p2Pos;

      // Move one step toward target
      var dx = target.x - e.x;
      var dy = target.y - e.y;
      if (Math.abs(dx) >= Math.abs(dy)) {
        e.x += dx > 0 ? 1 : -1;
      } else {
        e.y += dy > 0 ? 1 : -1;
      }

      // Clamp
      e.x = Math.max(0, Math.min(COLS - 1, e.x));
      e.y = Math.max(0, Math.min(ROWS - 1, e.y));

      // Check contact with players
      if (e.x === gameState.p1Pos.x && e.y === gameState.p1Pos.y) {
        events.push({ type: 'enemy_contact', data: { victim: 'p1', damage: ENEMY_DAMAGE } });
        this.enemies.splice(ei, 1);
        ei--;
      } else if (e.x === gameState.p2Pos.x && e.y === gameState.p2Pos.y) {
        events.push({ type: 'enemy_contact', data: { victim: 'p2', damage: ENEMY_DAMAGE } });
        this.enemies.splice(ei, 1);
        ei--;
      }
    }

    return events;
  };

  ShooterSystem.prototype._spawnEnemy = function (gameState) {
    // Spawn on a random edge
    var side = Math.floor(Math.random() * 4);
    var x, y;
    switch (side) {
      case 0: x = 0;          y = Math.floor(Math.random() * ROWS); break;
      case 1: x = COLS - 1;   y = Math.floor(Math.random() * ROWS); break;
      case 2: x = Math.floor(Math.random() * COLS); y = 0;          break;
      case 3: x = Math.floor(Math.random() * COLS); y = ROWS - 1;   break;
    }
    this.enemies.push({
      x: x,
      y: y,
      hp: ENEMY_HP + gameState.level * 2,
      moveCooldown: 3,
    });
  };

  /**
   * Draw projectiles and enemies.
   */
  ShooterSystem.prototype.draw = function (ctx) {
    // Projectiles
    for (var i = 0; i < this.projectiles.length; i++) {
      var p = this.projectiles[i];
      var px = p.x * CELL + CELL / 2;
      var py = p.y * CELL + CELL / 2;

      if (p.syncShot) {
        // Sync shot — larger, white-hot
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        // Normal shot — colored by owner
        ctx.fillStyle = p.owner === 'p1' ? '#fdba74' : '#93c5fd';
        ctx.shadowColor = p.owner === 'p1' ? '#fb923c' : '#3b82f6';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Enemies — red hostile creatures
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      var ex = e.x * CELL;
      var ey = e.y * CELL;

      // Body
      ctx.fillStyle = '#dc2626';
      ctx.shadowColor = '#dc2626';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.roundRect(ex + 3, ey + 3, CELL - 6, CELL - 6, 4);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Eyes
      ctx.fillStyle = '#fef2f2';
      ctx.beginPath();
      ctx.arc(ex + CELL / 3, ey + CELL / 2.5, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + 2 * CELL / 3, ey + CELL / 2.5, 2, 0, Math.PI * 2);
      ctx.fill();

      // HP indicator (small bar above enemy)
      var hpPct = e.hp / (ENEMY_HP + 2); // approximate
      ctx.fillStyle = 'rgba(220, 38, 38, 0.5)';
      ctx.fillRect(ex + 3, ey, CELL - 6, 2);
      ctx.fillStyle = '#fca5a5';
      ctx.fillRect(ex + 3, ey, (CELL - 6) * Math.min(1, hpPct), 2);
    }
  };

  ShooterSystem.prototype.getState = function () {
    return {
      projectileCount: this.projectiles.length,
      enemyCount: this.enemies.length,
      p1Cooldown: this.cooldown.p1,
      p2Cooldown: this.cooldown.p2,
    };
  };

  // ── SalamanderGame — Full integration wrapper ─────────────────────────
  //
  // This wires together the base co-op mechanics, the shooter system,
  // health bars, and betrayal mechanic into one cohesive game controller
  // that the index.html inline script can delegate to.
  //
  // Usage from index.html:
  //   var game = new window.SalamanderGame(ctx, canvas);
  //   // in tick(): game.tick(state);
  //   // in draw(): game.draw();
  //   // in input handler: game.handleShoot('p1', pos, dir);
  //   //                    game.handleBetrayal('p1', victimScore);

  function SalamanderGame(ctx, canvasSize) {
    this.ctx = ctx;
    this.canvasSize = canvasSize || CANVAS_PX;
    this.shooter = new ShooterSystem();
    this.healthBar = new (window.SalamanderHealthBar || function(){})();
    this.betrayal = new (window.SalamanderBetrayal || function(){})();
  }

  SalamanderGame.prototype.reset = function () {
    this.shooter.reset();
    if (this.healthBar.reset) this.healthBar.reset();
    if (this.betrayal.reset) this.betrayal.reset();
  };

  /**
   * Main tick — call from the game loop after moving players.
   *
   * @param {object} state - full game state from inline script
   * @returns {object} result with events and status
   */
  SalamanderGame.prototype.tick = function (state) {
    var totalScore = state.p1.score + state.p2.score;
    var result = { events: [], dead: false };

    // Shooter tick
    var shooterEvents = this.shooter.tick({
      p1Pos: state.p1.pos,
      p2Pos: state.p2.pos,
      synced: state.synced,
      voids: state.voids,
      level: state.level,
    });

    // Process shooter events
    for (var i = 0; i < shooterEvents.length; i++) {
      var ev = shooterEvents[i];
      result.events.push(ev);

      if (ev.type === 'enemy_killed') {
        state[ev.data.killer].score += ev.data.score;
      }
      if (ev.type === 'enemy_contact' && this.healthBar.damage) {
        this.healthBar.damage(ev.data.victim, ev.data.damage);
      }
    }

    // Health bar tick
    if (this.healthBar.tick) {
      this.healthBar.tick(state.synced);
    }

    // Betrayal tick
    if (this.betrayal.tick) {
      var betrayalEvent = this.betrayal.tick(totalScore);
      if (betrayalEvent) {
        result.events.push(betrayalEvent);

        if (betrayalEvent.type === 'loyalty_bonus') {
          state.p1.score += betrayalEvent.data.bonus;
          state.p2.score += betrayalEvent.data.bonus;
        }
      }
    }

    // Check health death
    if (this.healthBar.eitherDead && this.healthBar.eitherDead()) {
      result.dead = true;
    }

    // Sync gameState for automated testing
    this._syncTestState(state);

    return result;
  };

  SalamanderGame.prototype.handleShoot = function (playerId, pos, dir) {
    return this.shooter.shoot(playerId, pos, dir);
  };

  SalamanderGame.prototype.handleBetrayal = function (playerId, victimScore) {
    if (!this.betrayal.attemptBetrayal) return null;
    var result = this.betrayal.attemptBetrayal(playerId, victimScore);

    if (result.type === 'betrayal') {
      // Steal score
      var victimId = result.data.victim;
      // The caller should adjust scores: state[betrayer].score += stolenScore; state[victim].score -= stolenScore;
      if (this.healthBar.applyBetrayal) {
        this.healthBar.applyBetrayal(playerId);
      }
    } else if (result.type === 'premature_betrayal') {
      if (this.healthBar.damage) {
        this.healthBar.damage(playerId, result.data.hpPenalty);
      }
    }

    return result;
  };

  SalamanderGame.prototype.draw = function () {
    this.shooter.draw(this.ctx);
    if (this.healthBar.draw) {
      this.healthBar.draw(this.ctx, this.canvasSize);
    }
    if (this.betrayal.draw) {
      this.betrayal.draw(this.ctx, this.canvasSize, this.canvasSize);
    }
  };

  SalamanderGame.prototype._syncTestState = function (state) {
    if (!window.gameState) return;
    var gs = window.gameState;

    // Extend with new mechanics
    gs.health = this.healthBar.getState ? this.healthBar.getState() : {};
    gs.betrayal = this.betrayal.getState ? this.betrayal.getState() : {};
    gs.shooter = this.shooter.getState();
    gs.enemies = this.shooter.enemies.length;
    gs.projectiles = this.shooter.projectiles.length;
  };

  // ── Input binding helper ──────────────────────────────────────────────
  // Call SalamanderGame.bindInputs(gameInstance, stateRef) to wire up
  // shoot and betray keys.
  SalamanderGame.bindInputs = function (game, getState) {
    document.addEventListener('keydown', function (e) {
      var state = getState();
      if (!state || state.phase !== 'playing') return;

      // P1 shoot: E key
      if (e.code === 'KeyE') {
        e.preventDefault();
        game.handleShoot('p1', state.p1.pos, state.p1.dir);
      }
      // P2 shoot: Numpad0 or Period (.)
      if (e.code === 'Numpad0' || e.code === 'Period') {
        e.preventDefault();
        game.handleShoot('p2', state.p2.pos, state.p2.dir);
      }
      // P1 betray: Q
      if (e.code === 'KeyQ') {
        e.preventDefault();
        var result = game.handleBetrayal('p1', state.p2.score);
        if (result && result.type === 'betrayal') {
          state.p1.score += result.data.stolenScore;
          state.p2.score = Math.max(0, state.p2.score - result.data.stolenScore);
        }
      }
      // P2 betray: Slash (/)
      if (e.code === 'Slash') {
        e.preventDefault();
        var result = game.handleBetrayal('p2', state.p1.score);
        if (result && result.type === 'betrayal') {
          state.p2.score += result.data.stolenScore;
          state.p1.score = Math.max(0, state.p1.score - result.data.stolenScore);
        }
      }
    });
  };

  // Export
  window.SalamanderGame = SalamanderGame;

})();
