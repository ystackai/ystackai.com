/**
 * SalamanderY — Co-op Health Bar System
 *
 * Each player has their own health bar, but they share a "co-op pool" that
 * either player can draw from to heal. When synced (close together), the
 * pool regenerates. When apart, it drains slowly.
 *
 * Movie mashup: health bars are styled like film reels unwinding — the more
 * damage you take, the more "frames" you lose from the reel.
 */
(function () {
  'use strict';

  var MAX_HP = 100;
  var MAX_POOL = 60;
  var POOL_REGEN_RATE = 0.4;   // per tick while synced
  var POOL_DRAIN_RATE = 0.15;  // per tick while apart
  var HEAL_AMOUNT = 15;        // drawn from pool per heal action
  var BETRAYAL_DRAIN = 35;     // HP lost when betrayed

  function HealthBarSystem() {
    this.p1 = { hp: MAX_HP, maxHp: MAX_HP };
    this.p2 = { hp: MAX_HP, maxHp: MAX_HP };
    this.coopPool = MAX_POOL;
    this.maxPool = MAX_POOL;
    this.shieldActive = { p1: false, p2: false };
    this.recentDamage = { p1: 0, p2: 0 };
    this.damageFlashTimer = { p1: 0, p2: 0 };
  }

  HealthBarSystem.prototype.reset = function () {
    this.p1.hp = MAX_HP;
    this.p2.hp = MAX_HP;
    this.coopPool = MAX_POOL;
    this.shieldActive = { p1: false, p2: false };
    this.recentDamage = { p1: 0, p2: 0 };
    this.damageFlashTimer = { p1: 0, p2: 0 };
  };

  HealthBarSystem.prototype.damage = function (playerId, amount) {
    var bar = playerId === 'p1' ? this.p1 : this.p2;
    if (this.shieldActive[playerId]) {
      // shield absorbs half
      amount = Math.floor(amount * 0.5);
      this.shieldActive[playerId] = false;
    }
    bar.hp = Math.max(0, bar.hp - amount);
    this.recentDamage[playerId] = amount;
    this.damageFlashTimer[playerId] = 12; // ticks of flash
    return bar.hp;
  };

  HealthBarSystem.prototype.heal = function (playerId) {
    var bar = playerId === 'p1' ? this.p1 : this.p2;
    if (this.coopPool <= 0 || bar.hp >= bar.maxHp) return false;
    var draw = Math.min(HEAL_AMOUNT, this.coopPool, bar.maxHp - bar.hp);
    bar.hp += draw;
    this.coopPool -= draw;
    return true;
  };

  HealthBarSystem.prototype.applyBetrayal = function (betrayerId) {
    var victimId = betrayerId === 'p1' ? 'p2' : 'p1';
    this.damage(victimId, BETRAYAL_DRAIN);
    // betrayer gets a temporary shield from the treachery
    this.shieldActive[betrayerId] = true;
  };

  HealthBarSystem.prototype.tick = function (synced) {
    // co-op pool management
    if (synced) {
      this.coopPool = Math.min(this.maxPool, this.coopPool + POOL_REGEN_RATE);
    } else {
      this.coopPool = Math.max(0, this.coopPool - POOL_DRAIN_RATE);
    }

    // decay flash timers
    if (this.damageFlashTimer.p1 > 0) this.damageFlashTimer.p1--;
    if (this.damageFlashTimer.p2 > 0) this.damageFlashTimer.p2--;
  };

  HealthBarSystem.prototype.isAlive = function (playerId) {
    var bar = playerId === 'p1' ? this.p1 : this.p2;
    return bar.hp > 0;
  };

  HealthBarSystem.prototype.bothDead = function () {
    return this.p1.hp <= 0 && this.p2.hp <= 0;
  };

  HealthBarSystem.prototype.eitherDead = function () {
    return this.p1.hp <= 0 || this.p2.hp <= 0;
  };

  /**
   * Draw both health bars and the co-op pool onto a canvas context.
   * Positioned at the top of the game canvas, film-reel style.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} canvasWidth - logical pixel width
   */
  HealthBarSystem.prototype.draw = function (ctx, canvasWidth) {
    var barW = 160;
    var barH = 12;
    var poolW = 80;
    var poolH = 8;
    var y = 8;
    var margin = 16;

    // P1 health bar (left)
    this._drawBar(ctx, margin, y, barW, barH,
      this.p1.hp, this.p1.maxHp,
      '#fb923c', '#7c2d12',
      this.damageFlashTimer.p1 > 0);

    // P2 health bar (right)
    this._drawBar(ctx, canvasWidth - margin - barW, y, barW, barH,
      this.p2.hp, this.p2.maxHp,
      '#3b82f6', '#1e3a5f',
      this.damageFlashTimer.p2 > 0);

    // Co-op pool (center)
    var poolX = (canvasWidth - poolW) / 2;
    var poolY = y + 2;
    this._drawBar(ctx, poolX, poolY, poolW, poolH,
      this.coopPool, this.maxPool,
      '#4ade80', '#14532d', false);

    // Labels
    ctx.font = '9px -apple-system, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'left';
    ctx.fillText('P1', margin, y + barH + 10);
    ctx.textAlign = 'right';
    ctx.fillText('P2', canvasWidth - margin, y + barH + 10);
    ctx.textAlign = 'center';
    ctx.fillText('CO-OP', canvasWidth / 2, poolY + poolH + 10);
    ctx.textAlign = 'left'; // reset

    // Film reel sprocket holes (decorative — movie mashup flavor)
    this._drawSprockets(ctx, margin + barW + 4, y, 3);
    this._drawSprockets(ctx, canvasWidth - margin - barW - 16, y, 3);
  };

  HealthBarSystem.prototype._drawBar = function (ctx, x, y, w, h, val, max, fgColor, bgColor, flash) {
    var pct = Math.max(0, val / max);

    // background track
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 3);
    ctx.fill();

    // fill
    if (flash && Math.floor(Date.now() / 80) % 2 === 0) {
      ctx.fillStyle = '#ef4444';
    } else {
      ctx.fillStyle = fgColor;
    }
    if (pct > 0) {
      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(3, w * pct), h, 3);
      ctx.fill();
    }

    // border
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 3);
    ctx.stroke();
  };

  HealthBarSystem.prototype._drawSprockets = function (ctx, x, y, count) {
    ctx.fillStyle = 'rgba(251, 146, 60, 0.15)';
    for (var i = 0; i < count; i++) {
      ctx.beginPath();
      ctx.arc(x + i * 5, y + 6, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  HealthBarSystem.prototype.getState = function () {
    return {
      p1Hp: this.p1.hp,
      p2Hp: this.p2.hp,
      p1MaxHp: this.p1.maxHp,
      p2MaxHp: this.p2.maxHp,
      coopPool: Math.round(this.coopPool),
      maxPool: this.maxPool,
      p1Alive: this.p1.hp > 0,
      p2Alive: this.p2.hp > 0,
    };
  };

  // Export
  window.SalamanderHealthBar = HealthBarSystem;
})();
