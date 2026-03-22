// Stacky audio — Web Audio API, no external files
var _ctx;
var _active = [];

function ctx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  return _ctx;
}

function osc(freq, type, dur, t) {
  var o = ctx().createOscillator();
  var g = ctx().createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.3, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ctx().destination);
  o.start(t); o.stop(t + dur);
  _active.push(o);
  o.onended = function() { _active = _active.filter(function(x) { return x !== o; }); };
  return o;
}

function playLineClear() {
  var t = ctx().currentTime;
  [523, 659, 784, 1047].forEach(function(f, i) { osc(f, 'sine', 0.15, t + i * 0.06); });
}

function playPieceLock() {
  var t = ctx().currentTime;
  var buf = ctx().createBuffer(1, 441, ctx().sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  var s = ctx().createBufferSource();
  s.buffer = buf; s.connect(ctx().destination); s.start(t);
}

function playChocolateRiver() {
  var o = ctx().createOscillator();
  var g = ctx().createGain();
  var f = ctx().createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.value = 55;
  f.type = 'lowpass'; f.frequency.value = 120;
  g.gain.setValueAtTime(0.25, ctx().currentTime);
  o.connect(f).connect(g).connect(ctx().destination);
  o.start(); _active.push(o);
  return { stop: function() { g.gain.exponentialRampToValueAtTime(0.001, ctx().currentTime + 0.3); o.stop(ctx().currentTime + 0.3); } };
}

function playGameOver() {
  var t = ctx().currentTime;
  [784, 659, 523, 392, 262].forEach(function(f, i) { osc(f, 'triangle', 0.25, t + i * 0.12); });
}

function stopAll() {
  _active.forEach(function(o) { try { o.stop(); } catch(e) {} });
  _active = [];
}

function initAudio() { ctx(); }

window.StackyAudio = { initAudio: initAudio, playLineClear: playLineClear, playPieceLock: playPieceLock, playChocolateRiver: playChocolateRiver, playGameOver: playGameOver, stopAll: stopAll };
