// Schneider Protocol Test Suite - Tron Trail Decay
// Issue: #95 | Author: Dr. Klaus Schneider

import { describe, it, expect } from 'vitest';
import { TrailManager } from './trail-manager.js';

describe('Trail Decay Boundary Conditions', () => {
  const DECAY_MS = 7000;

  it('trail should persist at 6999ms', () => {
    const trail = new TrailManager();
    trail.addSegment();
    trail.tick(6999);
    expect(trail.segments.length).toBeGreaterThan(0);
  });

  it('trail should clear at exactly 7000ms', () => {
    const trail = new TrailManager();
    trail.addSegment();
    trail.tick(7000);
    expect(trail.segments.length).toBe(0);
  });

  it('trail should not double-clear at 7001ms', () => {
    const trail = new TrailManager();
    trail.addSegment();
    trail.tick(7001);
    expect(trail.segments.length).toBe(0);
  });

  it('rapid decay calls should not cause race condition', () => {
    const trail = new TrailManager();
    trail.addSegment();
    for (let i = 0; i < 100; i++) {
      trail.tick(6999);
      trail.tick(7000);
    }
    expect(trail.segments.length).toBe(0);
  });
});
