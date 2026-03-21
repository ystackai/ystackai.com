/**
 * game-tracker.js — Client-side game analytics collection.
 *
 * Tracks active players, session duration, and game events using
 * localStorage for persistence and BroadcastChannel for real-time
 * cross-tab communication with the analytics dashboard.
 *
 * Usage (in a game page):
 *   <script src="/src/lib/analytics/game-tracker.js"></script>
 *   <script>
 *     const tracker = GameTracker.init({ game: 'snakey' });
 *     // tracker.event('food_eaten', { score: 5 });
 *     // tracker.event('game_over', { score: 12, duration: 45.2 });
 *   </script>
 *
 * The dashboard page reads from the same localStorage keys and listens
 * on the BroadcastChannel for live updates.
 */
(function (root) {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────

  /** localStorage key prefix for analytics data. */
  const LS_PREFIX = 'ystackai_analytics_';

  /** BroadcastChannel name for real-time dashboard updates. */
  const CHANNEL_NAME = 'ystackai_game_analytics';

  /** Heartbeat interval (ms) — active sessions send a pulse this often. */
  const HEARTBEAT_MS = 3000;

  /** Session is considered stale after this many ms without a heartbeat. */
  const SESSION_STALE_MS = 10000;

  /** Max event log entries stored in localStorage. */
  const MAX_EVENT_LOG = 200;

  // ── Helpers ────────────────────────────────────────────────────────────

  /** @returns {string} A short random session ID. */
  function generateSessionId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /** Safe localStorage read with JSON parse. */
  function lsGet(key, fallback) {
    try {
      const raw = localStorage.getItem(LS_PREFIX + key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  /** Safe localStorage write with JSON stringify. */
  function lsSet(key, value) {
    try {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
    } catch (_) {
      // Storage full or unavailable — silently degrade.
    }
  }

  // ── Tracker class ──────────────────────────────────────────────────────

  /**
   * @typedef {Object} TrackerOptions
   * @property {string} game - Game identifier (e.g. 'snakey', 'stacky').
   */

  /**
   * @typedef {Object} GameEvent
   * @property {string}  sessionId - Session that generated the event.
   * @property {string}  game      - Game identifier.
   * @property {string}  type      - Event type (e.g. 'game_start', 'food_eaten').
   * @property {number}  ts        - Unix timestamp (ms).
   * @property {Object=} data      - Optional event payload.
   */

  /**
   * @typedef {Object} ActiveSession
   * @property {string} sessionId
   * @property {string} game
   * @property {number} startedAt  - Unix timestamp (ms).
   * @property {number} lastPulse  - Unix timestamp (ms) of last heartbeat.
   * @property {number} eventCount - Number of events fired this session.
   */

  function GameTracker(options) {
    this.game = options.game;
    this.sessionId = generateSessionId();
    this.startedAt = Date.now();
    this.eventCount = 0;
    this._heartbeatId = null;
    this._channel = null;
    this._destroyed = false;

    // Set up BroadcastChannel (if supported)
    try {
      this._channel = new BroadcastChannel(CHANNEL_NAME);
    } catch (_) {
      // BroadcastChannel not supported — dashboard won't get live updates.
    }
  }

  /** Start tracking — registers the session, begins heartbeat. */
  GameTracker.prototype.start = function () {
    this._registerSession();
    this._startHeartbeat();
    this.event('session_start');
    return this;
  };

  /** Record a game event. */
  GameTracker.prototype.event = function (type, data) {
    if (this._destroyed) return;

    this.eventCount++;

    /** @type {GameEvent} */
    var evt = {
      sessionId: this.sessionId,
      game: this.game,
      type: type,
      ts: Date.now(),
    };
    if (data !== undefined) {
      evt.data = data;
    }

    // Append to event log in localStorage
    var log = lsGet('events', []);
    log.push(evt);
    // Trim to max size (keep most recent)
    if (log.length > MAX_EVENT_LOG) {
      log = log.slice(log.length - MAX_EVENT_LOG);
    }
    lsSet('events', log);

    // Update session event count
    this._updateSession();

    // Broadcast to dashboard
    this._broadcast({ action: 'event', event: evt });
  };

  /** Stop tracking — removes session, clears heartbeat. */
  GameTracker.prototype.destroy = function () {
    if (this._destroyed) return;
    this._destroyed = true;

    // Record session end duration
    var duration = (Date.now() - this.startedAt) / 1000;
    this.event('session_end', { durationSec: Math.round(duration * 10) / 10 });

    // Clear heartbeat
    if (this._heartbeatId !== null) {
      clearInterval(this._heartbeatId);
      this._heartbeatId = null;
    }

    // Remove session from active sessions
    this._removeSession();

    // Close channel
    if (this._channel) {
      try { this._channel.close(); } catch (_) {}
      this._channel = null;
    }
  };

  /** Register this session in the active sessions list. */
  GameTracker.prototype._registerSession = function () {
    var sessions = lsGet('sessions', []);

    // Prune stale sessions while we're here
    var now = Date.now();
    sessions = sessions.filter(function (s) {
      return now - s.lastPulse < SESSION_STALE_MS;
    });

    sessions.push({
      sessionId: this.sessionId,
      game: this.game,
      startedAt: this.startedAt,
      lastPulse: now,
      eventCount: 0,
    });

    lsSet('sessions', sessions);
    this._broadcast({ action: 'session_start', sessionId: this.sessionId, game: this.game });
  };

  /** Update this session's heartbeat and event count. */
  GameTracker.prototype._updateSession = function () {
    var sessions = lsGet('sessions', []);
    var now = Date.now();
    var self = this;

    // Prune stale + update ours
    sessions = sessions.filter(function (s) {
      return now - s.lastPulse < SESSION_STALE_MS;
    });

    var found = false;
    for (var i = 0; i < sessions.length; i++) {
      if (sessions[i].sessionId === self.sessionId) {
        sessions[i].lastPulse = now;
        sessions[i].eventCount = self.eventCount;
        found = true;
        break;
      }
    }

    if (!found) {
      sessions.push({
        sessionId: this.sessionId,
        game: this.game,
        startedAt: this.startedAt,
        lastPulse: now,
        eventCount: this.eventCount,
      });
    }

    lsSet('sessions', sessions);
  };

  /** Remove this session from the active sessions list. */
  GameTracker.prototype._removeSession = function () {
    var sessions = lsGet('sessions', []);
    var self = this;
    sessions = sessions.filter(function (s) {
      return s.sessionId !== self.sessionId;
    });
    lsSet('sessions', sessions);
    this._broadcast({ action: 'session_end', sessionId: this.sessionId, game: this.game });
  };

  /** Start periodic heartbeat to keep session alive. */
  GameTracker.prototype._startHeartbeat = function () {
    var self = this;
    this._heartbeatId = setInterval(function () {
      if (self._destroyed) return;
      self._updateSession();
      self._broadcast({ action: 'heartbeat', sessionId: self.sessionId, game: self.game });
    }, HEARTBEAT_MS);
  };

  /** Send a message over BroadcastChannel. */
  GameTracker.prototype._broadcast = function (msg) {
    if (this._channel) {
      try { this._channel.postMessage(msg); } catch (_) {}
    }
  };

  // ── Static API ─────────────────────────────────────────────────────────

  /**
   * Create and start a new tracker instance.
   * @param {TrackerOptions} options
   * @returns {GameTracker}
   */
  GameTracker.init = function (options) {
    var tracker = new GameTracker(options);
    tracker.start();
    return tracker;
  };

  /**
   * Read current analytics snapshot from localStorage.
   * Used by the dashboard to get initial state.
   *
   * @returns {{ sessions: ActiveSession[], events: GameEvent[], stats: Object }}
   */
  GameTracker.getSnapshot = function () {
    var now = Date.now();
    var sessions = lsGet('sessions', []);
    var events = lsGet('events', []);

    // Prune stale sessions
    var activeSessions = sessions.filter(function (s) {
      return now - s.lastPulse < SESSION_STALE_MS;
    });

    // Compute aggregate stats
    var totalEvents = events.length;
    var gameBreakdown = {};
    var eventTypeBreakdown = {};

    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      gameBreakdown[e.game] = (gameBreakdown[e.game] || 0) + 1;
      eventTypeBreakdown[e.type] = (eventTypeBreakdown[e.type] || 0) + 1;
    }

    // Session duration stats
    var durations = [];
    for (var j = 0; j < events.length; j++) {
      if (events[j].type === 'session_end' && events[j].data && events[j].data.durationSec) {
        durations.push(events[j].data.durationSec);
      }
    }

    var avgDuration = durations.length > 0
      ? Math.round((durations.reduce(function (a, b) { return a + b; }, 0) / durations.length) * 10) / 10
      : 0;

    // Recent high scores
    var highScores = [];
    for (var k = events.length - 1; k >= 0 && highScores.length < 10; k--) {
      var ev = events[k];
      if (ev.type === 'game_over' && ev.data && typeof ev.data.score === 'number') {
        highScores.push({ game: ev.game, score: ev.data.score, ts: ev.ts });
      }
    }

    return {
      sessions: activeSessions,
      events: events,
      stats: {
        activePlayers: activeSessions.length,
        totalEvents: totalEvents,
        avgSessionDurationSec: avgDuration,
        gameBreakdown: gameBreakdown,
        eventTypeBreakdown: eventTypeBreakdown,
        recentHighScores: highScores,
        completedSessions: durations.length,
      },
    };
  };

  /**
   * Clear all stored analytics data.
   * Intended for testing / dashboard reset.
   */
  GameTracker.clearAll = function () {
    try {
      var keysToRemove = [];
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.startsWith(LS_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      for (var j = 0; j < keysToRemove.length; j++) {
        localStorage.removeItem(keysToRemove[j]);
      }
    } catch (_) {}
  };

  /** BroadcastChannel name — exposed so the dashboard can subscribe. */
  GameTracker.CHANNEL_NAME = CHANNEL_NAME;

  // ── Export ─────────────────────────────────────────────────────────────

  root.GameTracker = GameTracker;

}(typeof window !== 'undefined' ? window : this));
