/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  TRON LIGHT CYCLES — Core Engine                               ║
 * ║  Architecture: NeonTrailPhysicsRendererComposite (NTPRC)       ║
 * ║                                                                ║
 * ║  Abstract game engine for Light Cycle arena combat.            ║
 * ║  Handles cycle state, trail management, collision geometry,    ║
 * ║  and neon rendering hooks for the glow pipeline.               ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GRID_COLS = 64;
export const GRID_ROWS = 48;
export const CELL_PX = 10;
export const CANVAS_W = GRID_COLS * CELL_PX;
export const CANVAS_H = GRID_ROWS * CELL_PX;
export const TICK_MS = 80;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Direction = 'up' | 'down' | 'left' | 'right';

export type CyclePhase = 'idle' | 'racing' | 'boosting' | 'derezzing' | 'dead';

export interface Vec2 {
  x: number;
  y: number;
}

export interface NeonColor {
  core: string;
  glow: string;
  trail: string;
}

export const NEON_PALETTE: Record<string, NeonColor> = {
  cyan: { core: '#ffffff', glow: '#00ffff', trail: '#005f6f' },
  orange: { core: '#ffffff', glow: '#ff6600', trail: '#6f2a00' },
  magenta: { core: '#ffffff', glow: '#ff00ff', trail: '#5f005f' },
  green: { core: '#ffffff', glow: '#00ff66', trail: '#005f2a' },
};

// ---------------------------------------------------------------------------
// Trail Segment
// ---------------------------------------------------------------------------

export interface TrailSegment {
  readonly pos: Vec2;
  readonly age: number;
  readonly intensity: number;
}

// ---------------------------------------------------------------------------
// Light Cycle
// ---------------------------------------------------------------------------

export class LightCycle {
  readonly id: string;
  readonly color: NeonColor;

  phase: CyclePhase = 'idle';
  pos: Vec2;
  dir: Direction;
  trail: TrailSegment[] = [];
  speed: number = 1;
  boostFuel: number = 100;

  private _dirQueue: Direction[] = [];

  constructor(id: string, color: NeonColor, spawn: Vec2, facing: Direction) {
    this.id = id;
    this.color = color;
    this.pos = { ...spawn };
    this.dir = facing;
  }

  /** Queue a direction change; rejects 180° reversals. */
  queueDirection(next: Direction): void {
    const current = this._dirQueue.length > 0
      ? this._dirQueue[this._dirQueue.length - 1]
      : this.dir;

    if (isOpposite(current, next)) return;
    if (this._dirQueue.length < 2) {
      this._dirQueue.push(next);
    }
  }

  /** Advance the cycle by one tick. Returns the new position. */
  tick(): Vec2 {
    if (this.phase !== 'racing' && this.phase !== 'boosting') return this.pos;

    if (this._dirQueue.length > 0) {
      this.dir = this._dirQueue.shift()!;
    }

    this.trail.push({
      pos: { ...this.pos },
      age: 0,
      intensity: this.phase === 'boosting' ? 1.0 : 0.7,
    });

    const delta = directionDelta(this.dir);
    this.pos = {
      x: this.pos.x + delta.x * this.speed,
      y: this.pos.y + delta.y * this.speed,
    };

    if (this.phase === 'boosting') {
      this.boostFuel = Math.max(0, this.boostFuel - 2);
      if (this.boostFuel <= 0) this.phase = 'racing';
    }

    return this.pos;
  }

  /** Trigger the derez (death) animation sequence. */
  derez(): void {
    this.phase = 'derezzing';
  }

  /** Reset the cycle to a fresh spawn state. */
  reset(spawn: Vec2, facing: Direction): void {
    this.pos = { ...spawn };
    this.dir = facing;
    this.phase = 'idle';
    this.trail = [];
    this.speed = 1;
    this.boostFuel = 100;
    this._dirQueue = [];
  }
}

// ---------------------------------------------------------------------------
// Collision Detection (abstract geometry — no DOM)
// ---------------------------------------------------------------------------

export function checkWallCollision(pos: Vec2): boolean {
  return pos.x < 0 || pos.x >= GRID_COLS || pos.y < 0 || pos.y >= GRID_ROWS;
}

/**
 * Wrap a position using toroidal topology (modular arithmetic on the grid).
 * Used when wall-wraparound mode is enabled instead of wall-death.
 */
export function wrapPosition(pos: Vec2): Vec2 {
  return {
    x: ((pos.x % GRID_COLS) + GRID_COLS) % GRID_COLS,
    y: ((pos.y % GRID_ROWS) + GRID_ROWS) % GRID_ROWS,
  };
}

/**
 * Detect simultaneous cell occupation — returns the contested cell
 * if two or more cycles occupy the same position on the same tick,
 * or null if no collision occurred.
 */
export function checkSimultaneousCellEntry(cycles: LightCycle[]): { cell: Vec2; cycleIds: string[] } | null {
  const occupied = new Map<string, string[]>();
  for (const cycle of cycles) {
    if (cycle.phase !== 'racing' && cycle.phase !== 'boosting') continue;
    const key = `${cycle.pos.x},${cycle.pos.y}`;
    const ids = occupied.get(key) || [];
    ids.push(cycle.id);
    occupied.set(key, ids);
  }
  for (const [key, ids] of occupied) {
    if (ids.length > 1) {
      const [x, y] = key.split(',').map(Number);
      return { cell: { x, y }, cycleIds: ids };
    }
  }
  return null;
}

export function checkTrailCollision(pos: Vec2, trails: TrailSegment[]): boolean {
  return trails.some((seg) => seg.pos.x === pos.x && seg.pos.y === pos.y);
}

// ---------------------------------------------------------------------------
// Neon Rendering Hooks
// ---------------------------------------------------------------------------

/**
 * Abstract rendering port — implement to plug into Canvas, WebGL, etc.
 * The engine calls these hooks each frame; the concrete renderer decides
 * how to paint the neon glow.
 */
export interface NeonRenderer {
  /** Clear the arena for a new frame. */
  clearArena(): void;

  /** Draw the grid floor with subtle line work. */
  drawGrid(): void;

  /** Draw a single trail segment with glow and fade based on age. */
  drawTrailSegment(seg: TrailSegment, color: NeonColor): void;

  /** Draw the cycle head with bright core and outer glow. */
  drawCycleHead(pos: Vec2, dir: Direction, color: NeonColor): void;

  /** Draw the derez particle burst when a cycle dies. */
  drawDerezEffect(pos: Vec2, color: NeonColor, progress: number): void;

  /** Apply a full-screen bloom / glow composite pass. */
  applyBloom(intensity: number): void;
}

/**
 * Canvas2D reference implementation of the neon rendering hooks.
 * Uses layered shadowBlur for the characteristic Tron glow.
 */
export class Canvas2DNeonRenderer implements NeonRenderer {
  private ctx: CanvasRenderingContext2D | null = null;

  attach(ctx: CanvasRenderingContext2D): void {
    this.ctx = ctx;
  }

  clearArena(): void {
    if (!this.ctx) return;
    this.ctx.fillStyle = '#0a0a12';
    this.ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  drawGrid(): void {
    if (!this.ctx) return;
    this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.04)';
    this.ctx.lineWidth = 0.5;

    for (let x = 0; x <= GRID_COLS; x++) {
      this.ctx.beginPath();
      this.ctx.moveTo(x * CELL_PX, 0);
      this.ctx.lineTo(x * CELL_PX, CANVAS_H);
      this.ctx.stroke();
    }
    for (let y = 0; y <= GRID_ROWS; y++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y * CELL_PX);
      this.ctx.lineTo(CANVAS_W, y * CELL_PX);
      this.ctx.stroke();
    }
  }

  drawTrailSegment(seg: TrailSegment, color: NeonColor): void {
    if (!this.ctx) return;
    const fade = Math.max(0, seg.intensity - seg.age * 0.002);

    this.ctx.shadowColor = color.glow;
    this.ctx.shadowBlur = 8 * fade;
    this.ctx.fillStyle = color.trail;
    this.ctx.globalAlpha = fade;
    this.ctx.fillRect(
      seg.pos.x * CELL_PX + 1,
      seg.pos.y * CELL_PX + 1,
      CELL_PX - 2,
      CELL_PX - 2,
    );
    this.ctx.globalAlpha = 1;
    this.ctx.shadowBlur = 0;
  }

  drawCycleHead(pos: Vec2, dir: Direction, color: NeonColor): void {
    if (!this.ctx) return;
    const cx = pos.x * CELL_PX + CELL_PX / 2;
    const cy = pos.y * CELL_PX + CELL_PX / 2;

    // Outer glow
    this.ctx.shadowColor = color.glow;
    this.ctx.shadowBlur = 16;
    this.ctx.fillStyle = color.glow;
    this.ctx.fillRect(pos.x * CELL_PX, pos.y * CELL_PX, CELL_PX, CELL_PX);

    // Bright core
    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = color.core;
    this.ctx.fillRect(
      pos.x * CELL_PX + 2,
      pos.y * CELL_PX + 2,
      CELL_PX - 4,
      CELL_PX - 4,
    );

    // Direction indicator
    this.ctx.fillStyle = color.glow;
    const d = directionDelta(dir);
    this.ctx.fillRect(
      cx + d.x * 3 - 1,
      cy + d.y * 3 - 1,
      2,
      2,
    );
  }

  drawDerezEffect(pos: Vec2, color: NeonColor, progress: number): void {
    if (!this.ctx) return;
    const cx = pos.x * CELL_PX + CELL_PX / 2;
    const cy = pos.y * CELL_PX + CELL_PX / 2;
    const radius = progress * CELL_PX * 3;

    this.ctx.shadowColor = color.glow;
    this.ctx.shadowBlur = 20;
    this.ctx.strokeStyle = color.glow;
    this.ctx.globalAlpha = 1 - progress;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.globalAlpha = 1;
    this.ctx.shadowBlur = 0;
  }

  applyBloom(_intensity: number): void {
    // Bloom composite pass — placeholder for multi-layer glow pipeline.
    // Full implementation will use off-screen canvas + additive blending.
  }
}

// ---------------------------------------------------------------------------
// Arena State Manager (exposes window.gameState for Schneider Test Protocol)
// ---------------------------------------------------------------------------

/**
 * TronArenaState — manages the full arena lifecycle: cycle registration,
 * tick orchestration, collision resolution, WASM memory tracking, and
 * the window.gameState contract.
 */
export class TronArenaState {
  cycles: LightCycle[] = [];
  tick_count: number = 0;
  gameOver: boolean = false;
  winnerId: string | null = null;
  wrapMode: boolean = false;

  /** Simulated WASM heap — tracks allocated trail buffer bytes. */
  private _wasmTrailBufferBytes: number = 0;
  private _wasmAllocations: number = 0;

  addCycle(cycle: LightCycle): void {
    this.cycles.push(cycle);
  }

  /** Advance all cycles by one tick, applying collision and wrap logic. */
  tickAll(): void {
    if (this.gameOver) return;
    this.tick_count++;

    for (const cycle of this.cycles) {
      cycle.tick();
      if (this.wrapMode) {
        cycle.pos = wrapPosition(cycle.pos);
      }
      // Track WASM-simulated trail allocation
      this._wasmTrailBufferBytes += 16; // 2× f64 per segment
      this._wasmAllocations++;
    }

    // Check wall collisions (only in non-wrap mode)
    if (!this.wrapMode) {
      for (const cycle of this.cycles) {
        if (checkWallCollision(cycle.pos)) {
          cycle.derez();
        }
      }
    }

    // Check trail collisions for each cycle against all trails
    const allTrails = this.cycles.flatMap((c) => c.trail);
    for (const cycle of this.cycles) {
      if (cycle.phase === 'derezzing' || cycle.phase === 'dead') continue;
      if (checkTrailCollision(cycle.pos, allTrails)) {
        cycle.derez();
      }
    }

    // Simultaneous cell entry
    const simul = checkSimultaneousCellEntry(this.cycles);
    if (simul) {
      for (const id of simul.cycleIds) {
        const cycle = this.cycles.find((c) => c.id === id);
        if (cycle) cycle.derez();
      }
    }

    // Check for game over
    const alive = this.cycles.filter(
      (c) => c.phase === 'racing' || c.phase === 'boosting',
    );
    if (alive.length <= 1 && this.cycles.length > 1) {
      this.gameOver = true;
      this.winnerId = alive.length === 1 ? alive[0].id : null;
    }

    this._updateWindowGameState();
  }

  /** Reset the arena and free simulated WASM memory. */
  reset(): void {
    for (const cycle of this.cycles) {
      cycle.reset({ x: 0, y: 0 }, 'right');
    }
    this.cycles = [];
    this.tick_count = 0;
    this.gameOver = false;
    this.winnerId = null;
    this._wasmTrailBufferBytes = 0;
    this._wasmAllocations = 0;
    this._updateWindowGameState();
  }

  get wasmTrailBufferBytes(): number {
    return this._wasmTrailBufferBytes;
  }

  get wasmAllocations(): number {
    return this._wasmAllocations;
  }

  /** Free simulated WASM trail buffer memory (called on reset). */
  freeWasmTrailBuffers(): void {
    this._wasmTrailBufferBytes = 0;
    this._wasmAllocations = 0;
  }

  private _updateWindowGameState(): void {
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).gameState = {
        score: 0,
        alive: !this.gameOver,
        gameOver: this.gameOver,
        level: 1,
        tick: this.tick_count,
        winnerId: this.winnerId,
        players: this.cycles.map((c) => ({
          id: c.id,
          x: c.pos.x,
          y: c.pos.y,
          phase: c.phase,
          dir: c.dir,
          trailLength: c.trail.length,
          boostFuel: c.boostFuel,
        })),
        wasmMemory: {
          trailBufferBytes: this._wasmTrailBufferBytes,
          allocations: this._wasmAllocations,
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isOpposite(a: Direction, b: Direction): boolean {
  return (
    (a === 'up' && b === 'down') ||
    (a === 'down' && b === 'up') ||
    (a === 'left' && b === 'right') ||
    (a === 'right' && b === 'left')
  );
}

function directionDelta(dir: Direction): Vec2 {
  switch (dir) {
    case 'up':    return { x:  0, y: -1 };
    case 'down':  return { x:  0, y:  1 };
    case 'left':  return { x: -1, y:  0 };
    case 'right': return { x:  1, y:  0 };
  }
}
