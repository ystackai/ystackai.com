/**
 * StackY Input Handler — keyboard (arrows + WASD) and touch/swipe controls.
 *
 * Depends on: game.js (StackyGame)
 */
'use strict';

var StackyInput = (function () {
  var SWIPE_THRESHOLD = 30;  // min px for a swipe
  var TAP_THRESHOLD = 10;    // max movement for a tap
  var DAS_DELAY = 170;       // ms before auto-repeat starts
  var DAS_RATE = 50;         // ms between auto-repeat moves
  var HARD_DROP_VELOCITY = 0.8; // px/ms — swipe faster than this = hard drop

  /**
   * Attach all input handlers. Returns a cleanup function.
   * @param {object} state - StackyGame state
   * @param {object} callbacks - { onStart, onRestart, onStateChange }
   */
  function attach(state, callbacks) {
    var touchStartX = 0;
    var touchStartY = 0;
    var touchStartTime = 0;

    // DAS (delayed auto-shift) state
    var dasKey = null;
    var dasTimer = null;
    var dasRepeatTimer = null;

    /** Normalize key to lowercase for consistent DAS tracking. */
    function normalizeKey(key) {
      if (key.length === 1) return key.toLowerCase();
      return key;
    }

    function clearDAS() {
      dasKey = null;
      if (dasTimer) { clearTimeout(dasTimer); dasTimer = null; }
      if (dasRepeatTimer) { clearInterval(dasRepeatTimer); dasRepeatTimer = null; }
    }

    function startDAS(key) {
      clearDAS();
      dasKey = normalizeKey(key);
      dasTimer = setTimeout(function () {
        dasRepeatTimer = setInterval(function () {
          StackyGame.processInput(state, key);
          if (callbacks.onStateChange) callbacks.onStateChange();
        }, DAS_RATE);
      }, DAS_DELAY);
    }

    function handleKeydown(e) {
      var key = e.key;

      // Prevent page scroll for game keys
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].indexOf(key) !== -1) {
        e.preventDefault();
      }

      // Start/restart on Space when not playing
      if (state.phase === 'idle' || state.phase === 'gameOver') {
        if (key === ' ' || key === 'Enter') {
          e.preventDefault();
          if (state.phase === 'idle' && callbacks.onStart) callbacks.onStart();
          else if (callbacks.onRestart) callbacks.onRestart();
          return;
        }
      }

      // DAS for horizontal movement and soft drop
      if (key === 'ArrowLeft' || key === 'a' || key === 'A' ||
          key === 'ArrowRight' || key === 'd' || key === 'D' ||
          key === 'ArrowDown' || key === 's' || key === 'S') {
        if (!e.repeat) {
          StackyGame.processInput(state, key);
          startDAS(key);
        }
      } else {
        StackyGame.processInput(state, key);
      }

      if (callbacks.onStateChange) callbacks.onStateChange();
    }

    function handleKeyup(e) {
      var key = normalizeKey(e.key);
      // Stop DAS when the key is released
      if (dasKey === key) {
        clearDAS();
      }
    }

    function handleTouchStart(e) {
      if (e.touches.length !== 1) return;
      var touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchStartTime = Date.now();
      e.preventDefault();
    }

    function handleTouchEnd(e) {
      if (e.changedTouches.length !== 1) return;
      var touch = e.changedTouches[0];
      var dx = touch.clientX - touchStartX;
      var dy = touch.clientY - touchStartY;
      var elapsed = Date.now() - touchStartTime;
      var absDx = Math.abs(dx);
      var absDy = Math.abs(dy);

      e.preventDefault();

      // Start/restart on tap when not playing
      if (state.phase === 'idle' || state.phase === 'gameOver') {
        if (state.phase === 'idle' && callbacks.onStart) callbacks.onStart();
        else if (callbacks.onRestart) callbacks.onRestart();
        return;
      }

      if (state.phase !== 'playing') return;

      if (absDx < TAP_THRESHOLD && absDy < TAP_THRESHOLD) {
        // Tap → rotate
        StackyGame.rotateCW(state);
      } else if (absDx > absDy && absDx > SWIPE_THRESHOLD) {
        // Horizontal swipe
        if (dx > 0) StackyGame.moveRight(state);
        else StackyGame.moveLeft(state);
      } else if (absDy > SWIPE_THRESHOLD) {
        if (dy > 0) {
          // Swipe down — velocity determines soft vs hard drop
          var velocity = elapsed > 0 ? absDy / elapsed : 0;
          if (velocity >= HARD_DROP_VELOCITY) {
            StackyGame.hardDrop(state);
          } else {
            StackyGame.softDrop(state);
          }
        } else {
          // Swipe up — hold
          StackyGame.hold(state);
        }
      }

      if (callbacks.onStateChange) callbacks.onStateChange();
    }

    // Prevent touch scrolling on the game area
    function handleTouchMove(e) {
      e.preventDefault();
    }

    function handleVisibility() {
      if (document.hidden && state.phase === 'playing') {
        StackyGame.pause(state);
        if (callbacks.onStateChange) callbacks.onStateChange();
      }
    }

    // Attach
    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('keyup', handleKeyup);
    document.addEventListener('visibilitychange', handleVisibility);

    var canvas = document.getElementById('game-canvas');
    if (canvas) {
      canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
      canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
      canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    }

    // Return cleanup function
    return function cleanup() {
      clearDAS();
      document.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('keyup', handleKeyup);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (canvas) {
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchend', handleTouchEnd);
        canvas.removeEventListener('touchmove', handleTouchMove);
      }
    };
  }

  return { attach: attach };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StackyInput;
}
