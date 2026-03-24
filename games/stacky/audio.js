const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function playSound(frequency, duration, type = 'sine') {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gainNode.gain.value = 0.3;
  
  oscillator.start(0);
  oscillator.stop(audioContext.currentTime + duration);
}

function playPiecePlacement() {
  playSound(220, 0.1, 'square');
}

function playLineClear() {
  playSound(330, 0.2, 'sine');
}

function playLevelUp() {
  playSound(440, 0.3, 'triangle');
}

function playGameOver() {
  playSound(110, 0.5, 'sawtooth');
}

function playBackgroundMusic() {
  // Simple background music loop
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.type = 'sine';
  oscillator.frequency.value = 110;
  gainNode.gain.value = 0.1;
  
  oscillator.start(0);
  
  // Increase pitch over time
  let time = 0;
  const interval = setInterval(() => {
    time += 0.1;
    oscillator.frequency.value = 110 + Math.sin(time) * 55;
  }, 100);
  
  return () => clearInterval(interval);
}

module.exports = {
  playPiecePlacement,
  playLineClear,
  playLevelUp,
  playGameOver,
  playBackgroundMusic
};