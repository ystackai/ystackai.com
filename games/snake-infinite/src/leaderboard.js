/**
 * Leaderboard — local high score persistence via localStorage
 *
 * Stores the top 5 scores. Each entry is { score, length, level, date }.
 * Scores are sorted descending by score value.
 */
class Leaderboard {
    /**
     * @param {string} storageKey - localStorage key to use
     * @param {number} maxEntries - number of scores to retain
     */
    constructor(storageKey = 'snakeInfinite_leaderboard', maxEntries = 5) {
        this.storageKey  = storageKey;
        this.maxEntries  = maxEntries;
        this._scores     = this._load();
    }

    // ─── Public API ─────────────────────────────────────────────────────────────

    /**
     * Submit a score. Adds to the list if it qualifies for the top N.
     *
     * @param {{ score: number, length: number, level: number }} result
     * @returns {boolean} true if the score made the leaderboard
     */
    submit(result) {
        const entry = {
            score:  result.score,
            length: result.length,
            level:  result.level,
            date:   new Date().toLocaleDateString()
        };

        this._scores.push(entry);
        this._scores.sort((a, b) => b.score - a.score);
        this._scores = this._scores.slice(0, this.maxEntries);
        this._save();

        return this._scores.some(s =>
            s.score === entry.score &&
            s.length === entry.length &&
            s.date === entry.date
        );
    }

    /**
     * Get all stored scores (sorted descending by score)
     * @returns {Array<{ score: number, length: number, level: number, date: string }>}
     */
    getScores() {
        return this._scores.map(s => ({ ...s }));
    }

    /**
     * Returns the current high score, or 0 if no scores exist
     * @returns {number}
     */
    getHighScore() {
        return this._scores.length > 0 ? this._scores[0].score : 0;
    }

    /**
     * Clear all scores
     */
    clear() {
        this._scores = [];
        this._save();
    }

    // ─── Private ────────────────────────────────────────────────────────────────

    _load() {
        try {
            const raw = localStorage.getItem(this.storageKey);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed;
        } catch (_) {
            return [];
        }
    }

    _save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this._scores));
        } catch (_) {
            // Fail silently — leaderboard is a nice-to-have
        }
    }
}
