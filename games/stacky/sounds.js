/**
 * StackY Sound Manager
 * Handles all game audio including sound effects and background music
 */
(function() {
  'use strict';
  
  if (typeof window.StackyAudio === 'undefined') {
    window.StackyAudio = {
      // Audio context and buffers
      ctx: null,
      buffers: {},
      masterVolume: 0.7,
      
      init: function() {
        // Create audio context
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create sound effect buffers
        this.createSoundEffects();
      },
      
      createSoundEffects: function() {
        // Piece placement sound (simple tone)
        this.buffers.place = this.createToneSound(220, 0.1);
        
        // Line clear sound (chime)
        this.buffers.clear = this.createChimeSound(330, 0.3);
        
        // Level up sound (ascending tone)
        this.buffers.levelUp = this.createToneSound(440, 0.5);
        
        // Game over sound (descending tone)
        this.buffers.gameOver = this.createToneSound(220, 0.8);
        
        // Background music (will be implemented as a loop)
        this.buffers.background = this.createBackgroundMusic();
      },
      
      createToneSound: function(frequency, duration) {
        var oscillator = this.ctx.createOscillator();
        var gainNode = this.ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.ctx.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = 'square';
        
        gainNode.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        
        oscillator.start(this.ctx.currentTime);
        oscillator.stop(this.ctx.currentTime + duration);
        
        return { oscillator: oscillator, gainNode: gainNode };
      },
      
      createChimeSound: function(frequency, duration) {
        var oscillator = this.ctx.createOscillator();
        var gainNode = this.ctx.createGain();
        var oscillator2 = this.ctx.createOscillator();
        var gainNode2 = this.ctx.createGain();
        
        oscillator.connect(gainNode);
        oscillator2.connect(gainNode2);
        gainNode.connect(this.ctx.destination);
        gainNode2.connect(this.ctx.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        oscillator2.frequency.value = frequency * 1.5;
        oscillator2.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        gainNode2.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gainNode2.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        
        oscillator.start(this.ctx.currentTime);
        oscillator.stop(this.ctx.currentTime + duration);
        oscillator2.start(this.ctx.currentTime);
        oscillator2.stop(this.ctx.currentTime + duration);
        
        return { oscillator: oscillator, gainNode: gainNode };
      },
      
      createBackgroundMusic: function() {
        // Simple background music generator
        return {
          play: function() {
            // Placeholder for background music playback
            // This would be replaced with actual audio file
          }
        };
      },
      
      playSound: function(soundName) {
        if (this.ctx && this.buffers[soundName]) {
          // Create new oscillator for each sound
          var oscillator = this.ctx.createOscillator();
          var gainNode = this.ctx.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(this.ctx.destination);
          
          // Use appropriate frequency and duration based on sound type
          switch(soundName) {
            case 'place':
              oscillator.frequency.value = 220;
              oscillator.type = 'square';
              gainNode.gain.setValueAtTime(0.3, this.ctx.currentTime);
              gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
              break;
            case 'clear':
              oscillator.frequency.value = 330;
              oscillator.type = 'sine';
              gainNode.gain.setValueAtTime(0.2, this.ctx.currentTime);
              gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
              break;
            case 'levelUp':
              oscillator.frequency.value = 440;
              oscillator.type = 'sine';
              gainNode.gain.setValueAtTime(0.3, this.ctx.currentTime);
              gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
              break;
            case 'gameOver':
              oscillator.frequency.value = 220;
              oscillator.type = 'square';
              gainNode.gain.setValueAtTime(0.3, this.ctx.currentTime);
              gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.8);
              break;
          }
          
          oscillator.start(this.ctx.currentTime);
          oscillator.stop(this.ctx.currentTime + (soundName === 'gameOver' ? 0.8 : 
                                soundName === 'clear' ? 0.3 : 
                                soundName === 'levelUp' ? 0.5 : 0.1));
        }
      },
      
      playPlace: function() {
        this.playSound('place');
      },
      
      playClear: function() {
        this.playSound('clear');
      },
      
      playLevelUp: function() {
        this.playSound('levelUp');
      },
      
      playGameOver: function() {
        this.playSound('gameOver');
      },
      
      playBackground: function() {
        // Placeholder for background music
        // In a real implementation this would play actual background tracks
      }
    };
    
    // Initialize audio on first user interaction
    window.addEventListener('click', function() {
      if (!window.StackyAudio.ctx) {
        window.StackyAudio.init();
      }
    }, { once: true });
  }
})();