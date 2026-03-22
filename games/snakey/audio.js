// ═══════════════════════════════════════════════════════════════════════════
//  SnakeYAudio — Web Audio API sound effects for SnakeY
//  ─────────────────────────────────────────────────────────────────────────
//  Public API (all safe to call before init or if AudioContext is blocked):
//    SnakeYAudio.init()        — create AudioContext (call on first user gesture)
//    SnakeYAudio.playEat()     — ascending beep on food pickup
//    SnakeYAudio.playDeath()   — crash noise on collision
//    SnakeYAudio.playStart()   — arpeggio on game start
//    SnakeYAudio.startDrone()  — continuous low synth drone (Tron mode)
//    SnakeYAudio.stopDrone()   — stop the drone
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var ctx = null;       // AudioContext — created lazily on init()
  var droneOsc = null;  // OscillatorNode for Tron drone
  var droneGain = null; // GainNode for drone fade-out

  /** Ensure AudioContext is running (handles browser autoplay policy). */
  function ensureCtx() {
    if (!ctx) return false;
    if (ctx.state === 'suspended') ctx.resume();
    return ctx.state !== 'closed';
  }

  /**
   * Create the AudioContext. Safe to call multiple times — only the first
   * call allocates. Must be triggered from a user gesture to satisfy
   * browser autoplay policies.
   */
  function init() {
    if (ctx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    } catch (_) {
      // Audio not supported — all play* calls become no-ops
    }
  }

  /**
   * Ascending two-tone beep — food pickup.
   * Two short sine tones: base → base×1.5 (perfect fifth up).
   */
  function playEat() {
    if (!ensureCtx()) return;
    var now = ctx.currentTime;
    var base = 440;

    // Tone 1
    var o1 = ctx.createOscillator();
    var g1 = ctx.createGain();
    o1.type = 'sine';
    o1.frequency.value = base;
    g1.gain.setValueAtTime(0.18, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    o1.connect(g1).connect(ctx.destination);
    o1.start(now);
    o1.stop(now + 0.1);

    // Tone 2 — higher, slight delay
    var o2 = ctx.createOscillator();
    var g2 = ctx.createGain();
    o2.type = 'sine';
    o2.frequency.value = base * 1.5;
    g2.gain.setValueAtTime(0.18, now + 0.06);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    o2.connect(g2).connect(ctx.destination);
    o2.start(now + 0.06);
    o2.stop(now + 0.18);
  }

  /**
   * Crash noise — death / collision.
   * Short burst of filtered white noise with rapid decay.
   */
  function playDeath() {
    if (!ensureCtx()) return;
    var now = ctx.currentTime;
    var duration = 0.3;
    var sampleRate = ctx.sampleRate;
    var len = Math.floor(sampleRate * duration);
    var buffer = ctx.createBuffer(1, len, sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len); // decaying noise
    }

    var src = ctx.createBufferSource();
    src.buffer = buffer;

    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + duration);

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(now);
    src.stop(now + duration);
  }

  /**
   * Game-start arpeggio — three quick ascending tones (C5-E5-G5).
   */
  function playStart() {
    if (!ensureCtx()) return;
    var now = ctx.currentTime;
    var notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    var noteLen = 0.08;
    var gap = 0.07;

    for (var i = 0; i < notes.length; i++) {
      var t = now + i * (noteLen + gap);
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = notes[i];
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + noteLen + 0.04);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + noteLen + 0.04);
    }
  }

  /**
   * Start a continuous low synth drone for Tron mode.
   * Sawtooth wave at ~55 Hz (A1) with subtle LFO tremolo.
   */
  function startDrone() {
    if (!ensureCtx()) return;
    stopDrone(); // ensure no duplicate drone

    var now = ctx.currentTime;

    droneOsc = ctx.createOscillator();
    droneOsc.type = 'sawtooth';
    droneOsc.frequency.value = 55; // A1

    // Tremolo via LFO → gain modulation
    var lfo = ctx.createOscillator();
    var lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 3; // 3 Hz wobble
    lfoGain.gain.value = 0.03;

    droneGain = ctx.createGain();
    droneGain.gain.setValueAtTime(0, now);
    droneGain.gain.linearRampToValueAtTime(0.08, now + 0.5); // fade in

    // Low-pass to keep it dark
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;

    lfo.connect(lfoGain).connect(droneGain.gain);
    droneOsc.connect(filter).connect(droneGain).connect(ctx.destination);

    droneOsc.start(now);
    lfo.start(now);

    // Store lfo ref for cleanup
    droneOsc._lfo = lfo;
  }

  /**
   * Stop the Tron drone with a short fade-out.
   */
  function stopDrone() {
    if (!ctx || !droneOsc) return;
    var now = ctx.currentTime;
    try {
      droneGain.gain.cancelScheduledValues(now);
      droneGain.gain.setValueAtTime(droneGain.gain.value, now);
      droneGain.gain.linearRampToValueAtTime(0, now + 0.15);
      droneOsc.stop(now + 0.2);
      if (droneOsc._lfo) droneOsc._lfo.stop(now + 0.2);
    } catch (_) {
      // Already stopped — safe to ignore
    }
    droneOsc = null;
    droneGain = null;
  }

  // ── Export ───────────────────────────────────────────────────────────────

  window.SnakeYAudio = {
    init: init,
    playEat: playEat,
    playDeath: playDeath,
    playStart: playStart,
    startDrone: startDrone,
    stopDrone: stopDrone
  };
})();
