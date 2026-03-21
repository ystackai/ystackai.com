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
