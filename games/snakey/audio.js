// ── SnakeY synth drone ──────────────────────────────────────────────────
// Minimal AudioContext: sine + filtered noise loop. Starts on first user
// interaction (click/key/touch) to comply with autoplay policy.
// Exposes window.snakeyAudio.toggle() for mute control.

(function () {
  'use strict';
  var ctx, started = false, muted = false;

  function boot() {
    if (started) return;
    started = true;
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Low sine drone — C2 (65 Hz)
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 65;

    // Slow LFO on pitch for movement
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 0.15;
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 3;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start();

    // Second osc — fifth above (97.5 Hz), quieter
    var osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 97.5;

    // Master gain (quiet ambient)
    var master = ctx.createGain();
    master.gain.value = 0.06;

    // Low-pass filter for warmth
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    lp.Q.value = 2;

    osc.connect(lp);
    osc2.connect(lp);
    lp.connect(master);
    master.connect(ctx.destination);

    osc.start();
    osc2.start();

    window.snakeyAudio = {
      ctx: ctx,
      master: master,
      toggle: function () {
        muted = !muted;
        master.gain.setTargetAtTime(muted ? 0 : 0.06, ctx.currentTime, 0.1);
        return !muted;
      }
    };
  }

  // Boot on first interaction
  ['click', 'keydown', 'touchstart'].forEach(function (evt) {
    document.addEventListener(evt, boot, { once: false, capture: true });
  });
}());
