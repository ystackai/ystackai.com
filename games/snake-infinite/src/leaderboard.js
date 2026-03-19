// Snake Infinite — Leaderboard Manager
// Persists to localStorage. No server required for Friday demo.

const LEADERBOARD_KEY   = 'snake_infinite_scores';
const MAX_SCORES_STORED = 10;

class LeaderboardManager {
    constructor() {
        this._scores = this._load();
    }

    submit(score) {
        if (typeof score !== 'number' || score < 0) return;
        this._scores.push(score);
        this._scores.sort((a, b) => b - a);
        this._scores = this._scores.slice(0, MAX_SCORES_STORED);
        this._persist();
    }

    topScores(n = 5) {
        return this._scores.slice(0, n);
    }

    highScore() {
        return this._scores[0] ?? 0;
    }

    clear() {
        this._scores = [];
        this._persist();
    }

    _load() {
        try {
            const raw = localStorage.getItem(LEADERBOARD_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    _persist() {
        try {
            localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(this._scores));
        } catch (_) {
            // localStorage unavailable — graceful degradation
        }
    }
}
