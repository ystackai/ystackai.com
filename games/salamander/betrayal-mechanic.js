/**
 * SalamanderY — Betrayal Timing Mechanic
 *
 * Based on the classic movie mid-film character switch: at a dramatic moment,
 * one player can "betray" the other — stealing their score and health.
 *
 * The betrayal window opens once the game reaches a threshold (the "mid-film
 * moment"). Either player can trigger it, but timing matters:
 *   - Betray too early → penalty (you lose HP)
 *   - Betray in the window → you steal score + damage partner
 *   - Betray too late → window closes, both get a loyalty bonus
 *
 * Only one betrayal per game. After it fires (or the window expires), the
 * mechanic locks and the game continues as pure co-op.
 */
(function () {
  'use strict';

  var WINDOW_OPEN_SCORE = 20;     // total score to trigger the mid-film moment
  var WINDOW_DURATION_TICKS = 60; // how long the window stays open (~10s at 160ms tick)
  var SCORE_STEAL_PCT = 0.5;      // 50% of victim's score stolen
  var EARLY_PENALTY_HP = 20;      // HP penalty for premature betrayal
  var LOYALTY_BONUS = 10;         // score bonus if nobody betrays

  // Phases: dormant → warning → open → resolved
  var PHASE_DORMANT  = 'dormant';
  var PHASE_WARNING  = 'warning';
  var PHASE_OPEN     = 'open';
  var PHASE_RESOLVED = 'resolved';

  var WARNING_TICKS = 20; // flashing warning before window opens

  function BetrayalMechanic() {
    this.phase = PHASE_DORMANT;
    this.ticksInPhase = 0;
    this.betrayer = null;       // 'p1' or 'p2' or null
    this.stolenScore = 0;
    this.loyaltyAwarded = false;
    this.result = null;         // 'betrayed', 'loyal', 'premature', or null
  }

  BetrayalMechanic.prototype.reset = function () {
    this.phase = PHASE_DORMANT;
    this.ticksInPhase = 0;
    this.betrayer = null;
    this.stolenScore = 0;
    this.loyaltyAwarded = false;
    this.result = null;
  };

  /**
   * Called every game tick. Returns an event object if something happened,
   * or null otherwise.
   *
   * @param {number} totalScore - combined p1 + p2 score
   * @returns {{ type: string, data: object }|null}
   */
  BetrayalMechanic.prototype.tick = function (totalScore) {
    this.ticksInPhase++;

    switch (this.phase) {
      case PHASE_DORMANT:
        if (totalScore >= WINDOW_OPEN_SCORE) {
          this.phase = PHASE_WARNING;
          this.ticksInPhase = 0;
          return { type: 'betrayal_warning', data: {} };
        }
        break;

      case PHASE_WARNING:
        if (this.ticksInPhase >= WARNING_TICKS) {
          this.phase = PHASE_OPEN;
          this.ticksInPhase = 0;
          return { type: 'betrayal_window_open', data: {} };
        }
        break;

      case PHASE_OPEN:
        if (this.ticksInPhase >= WINDOW_DURATION_TICKS) {
          // nobody betrayed — loyalty bonus
          this.phase = PHASE_RESOLVED;
          this.loyaltyAwarded = true;
          this.result = 'loyal';
          return {
            type: 'loyalty_bonus',
            data: { bonus: LOYALTY_BONUS },
          };
        }
        break;

      case PHASE_RESOLVED:
        // nothing to do
        break;
    }

    return null;
  };

  /**
   * Attempt a betrayal. Can be called at any time but results depend on phase.
   *
   * @param {string} playerId - 'p1' or 'p2'
   * @param {number} victimScore - the victim's current score
   * @returns {{ type: string, data: object }}
   */
  BetrayalMechanic.prototype.attemptBetrayal = function (playerId, victimScore) {
    if (this.phase === PHASE_RESOLVED) {
      return { type: 'betrayal_locked', data: {} };
    }

    if (this.phase === PHASE_DORMANT || this.phase === PHASE_WARNING) {
      // premature — penalty
      this.phase = PHASE_RESOLVED;
      this.result = 'premature';
      this.betrayer = playerId;
      return {
        type: 'premature_betrayal',
        data: {
          betrayer: playerId,
          hpPenalty: EARLY_PENALTY_HP,
        },
      };
    }

    if (this.phase === PHASE_OPEN) {
      // successful betrayal!
      this.phase = PHASE_RESOLVED;
      this.betrayer = playerId;
      this.stolenScore = Math.floor(victimScore * SCORE_STEAL_PCT);
      this.result = 'betrayed';
      return {
        type: 'betrayal',
        data: {
          betrayer: playerId,
          victim: playerId === 'p1' ? 'p2' : 'p1',
          stolenScore: this.stolenScore,
        },
      };
    }

    return { type: 'betrayal_locked', data: {} };
  };

  /**
   * Draw the betrayal UI overlay elements.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} canvasWidth
   * @param {number} canvasHeight
   */
  BetrayalMechanic.prototype.draw = function (ctx, canvasWidth, canvasHeight) {
    switch (this.phase) {
      case PHASE_WARNING:
        this._drawWarning(ctx, canvasWidth, canvasHeight);
        break;
      case PHASE_OPEN:
        this._drawOpenWindow(ctx, canvasWidth, canvasHeight);
        break;
      case PHASE_RESOLVED:
        if (this.ticksInPhase < 40) {
          this._drawResult(ctx, canvasWidth, canvasHeight);
        }
        break;
    }
  };

  BetrayalMechanic.prototype._drawWarning = function (ctx, w, h) {
    // pulsing "MID-FILM TWIST INCOMING" text
    var flash = Math.sin(this.ticksInPhase * 0.5) > 0;
    if (!flash) return;

    ctx.save();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
    ctx.fillRect(0, h / 2 - 20, w, 40);

    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'center';
    ctx.fillText('MID-FILM TWIST INCOMING', w / 2, h / 2 + 5);
    ctx.restore();
  };

  BetrayalMechanic.prototype._drawOpenWindow = function (ctx, w, h) {
    // betrayal window indicator — dramatic red border pulse
    var pulse = 0.3 + 0.2 * Math.sin(this.ticksInPhase * 0.3);
    ctx.save();

    // border glow
    ctx.strokeStyle = 'rgba(239, 68, 68, ' + pulse + ')';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, w - 4, h - 4);

    // timer bar at bottom showing remaining time
    var pct = 1 - (this.ticksInPhase / WINDOW_DURATION_TICKS);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
    ctx.fillRect(0, h - 4, w * pct, 4);

    // text
    ctx.fillStyle = 'rgba(10, 10, 15, 0.7)';
    ctx.fillRect(0, h / 2 - 22, w, 44);
    ctx.font = 'bold 13px -apple-system, sans-serif';
    ctx.fillStyle = '#fca5a5';
    ctx.textAlign = 'center';
    ctx.fillText('BETRAYAL WINDOW OPEN', w / 2, h / 2 - 3);
    ctx.font = '10px -apple-system, sans-serif';
    ctx.fillStyle = '#ef4444';
    ctx.fillText('P1: Q to betray  |  P2: / to betray', w / 2, h / 2 + 14);

    ctx.restore();
  };

  BetrayalMechanic.prototype._drawResult = function (ctx, w, h) {
    var alpha = Math.max(0, 1 - this.ticksInPhase / 40);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(10, 10, 15, 0.75)';
    ctx.fillRect(0, h / 2 - 25, w, 50);

    ctx.font = 'bold 16px -apple-system, sans-serif';
    ctx.textAlign = 'center';

    if (this.result === 'betrayed') {
      ctx.fillStyle = '#ef4444';
      ctx.fillText('BETRAYAL! ' + this.betrayer.toUpperCase() + ' switches sides!', w / 2, h / 2 + 6);
    } else if (this.result === 'loyal') {
      ctx.fillStyle = '#4ade80';
      ctx.fillText('LOYALTY HOLDS — +' + LOYALTY_BONUS + ' bonus!', w / 2, h / 2 + 6);
    } else if (this.result === 'premature') {
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('TOO EARLY! ' + this.betrayer.toUpperCase() + ' takes penalty!', w / 2, h / 2 + 6);
    }

    ctx.restore();
  };

  BetrayalMechanic.prototype.getState = function () {
    return {
      phase: this.phase,
      betrayer: this.betrayer,
      stolenScore: this.stolenScore,
      result: this.result,
      windowOpen: this.phase === PHASE_OPEN,
      ticksInPhase: this.ticksInPhase,
    };
  };

  // Export
  window.SalamanderBetrayal = BetrayalMechanic;
})();
