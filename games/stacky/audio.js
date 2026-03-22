/**
 * StackY Audio — Web Audio API sound effects.
 *
 * Effects: line clear chime, piece lock click, chocolate river rumble,
 * game over descending tone.
 *
 * No dependencies. Exposes: StackyAudio.{init, playLineClear, playLock, playChocolateRumble, playGameOver}
 */
'use strict';

var StackyAudio = (function () {
  var ctx = null;
  var initialized = false;
  var masterGain = null;

  /**
   * Initialize the AudioContext. Must be called from a user gesture
   * (click/keydown) to satisfy browser autoplay policies.
   */
  function init() {
    if (initialized) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.3;
      masterGain.connect(ctx.destination);
      initialized = true;
    } catch (_) {
      // Web Audio not available — degrade silently
    }
  }

  /** Resume context if suspended (needed after tab switch). */
  function ensureRunning() {
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
  }

  /**
   * Line clear chime — ascending two-note arpeggio.
   */
  function playLineClear() {
    if (!ctx) return;
    ensureRunning();
    var now = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now);       // C5
    osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  /**
   * Piece lock click — short noise burst.
   */
  function playLock() {
    if (!ctx) return;
    ensureRunning();
    var now = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, now);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  /**
   * Chocolate river rumble — low frequency tremor.
   */
  function playChocolateRumble() {
    if (!ctx) return;
    ensureRunning();
    var now = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    var lfo = ctx.createOscillator();
    var lfoGain = ctx.createGain();

    // Low rumble tone
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(55, now);
    osc.frequency.linearRampToValueAtTime(40, now + 0.5);

    // LFO for tremor effect
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(12, now);
    lfoGain.gain.setValueAtTime(0.1, now);

    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    gain.connect(masterGain);
    lfo.start(now);
    osc.start(now);
    lfo.stop(now + 0.5);
    osc.stop(now + 0.5);
  }

  /**
   * Game over — descending tone sweep.
   */
  function playGameOver() {
    if (!ctx) return;
    ensureRunning();
    var now = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.8);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.8);
  }

  return {
    init: init,
    playLineClear: playLineClear,
    playLock: playLock,
    playChocolateRumble: playChocolateRumble,
    playGameOver: playGameOver,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StackyAudio;
}
