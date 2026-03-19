// Snake Infinite — AI Opponent
// Pattern-learning AI with bounded event memory (rolling window of 50).
// Does not affect player game — visualized as a ghost/hint overlay.

const AI_MEMORY_LIMIT = 50;

const Heuristic = {
    MANHATTAN: (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
};

class AIOpponent {
    constructor(gridCells) {
        this.cells   = gridCells;
        this.events  = [];           // rolling window
        this.pattern = {};           // learned move frequency
    }

    recordEvent(type, data = {}) {
        this.events.push({ type, data, ts: Date.now() });
        if (this.events.length > AI_MEMORY_LIMIT) {
            this.events.shift();     // maintain rolling window
        }
        if (type === 'eat') {
            this._learnFromHistory();
        }
    }

    /**
     * Returns the AI's suggested next head position (ghost indicator).
     * Uses greedy Manhattan with collision avoidance.
     */
    getMove(snake, food, currentDir) {
        const head = snake[0];
        const occupied = new Set(snake.map(s => `${s.x},${s.y}`));

        const candidates = Object.values({
            UP:    { x: head.x,     y: head.y - 1 },
            DOWN:  { x: head.x,     y: head.y + 1 },
            LEFT:  { x: head.x - 1, y: head.y     },
            RIGHT: { x: head.x + 1, y: head.y     }
        }).filter(p =>
            p.x >= 0 && p.x < this.cells &&
            p.y >= 0 && p.y < this.cells &&
            !occupied.has(`${p.x},${p.y}`)
        );

        if (!candidates.length) return null;

        // Pick the candidate closest to food, weighted by learned pattern
        candidates.sort((a, b) => {
            const scoreA = Heuristic.MANHATTAN(a, food) - this._patternBonus(a);
            const scoreB = Heuristic.MANHATTAN(b, food) - this._patternBonus(b);
            return scoreA - scoreB;
        });

        return candidates[0];
    }

    _learnFromHistory() {
        // Simple frequency map: which positions preceded an eat event?
        const eatEvents = this.events.filter(e => e.type === 'eat');
        eatEvents.forEach(e => {
            const key = `${e.data.score % this.cells},${e.data.score % this.cells}`;
            this.pattern[key] = (this.pattern[key] || 0) + 1;
        });
    }

    _patternBonus(pos) {
        const key = `${pos.x},${pos.y}`;
        return (this.pattern[key] || 0) * 0.5;
    }

    memorySize() {
        return this.events.length;
    }
}
