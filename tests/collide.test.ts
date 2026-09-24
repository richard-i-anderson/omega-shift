import { describe, expect, it } from 'vitest';
import { Arena } from '../src/arena/arena';
import { ForceField } from '../src/arena/field';
import { sampleShape } from '../src/arena/shapes';
import { collideArena, collideField, type Body } from '../src/physics/collide';

function field(side: 'outer' | 'inner', spec: Parameters<typeof sampleShape>[0]): ForceField {
  const f = new ForceField(side, 0, 0);
  f.setRadii(sampleShape(spec));
  return f;
}

const body = (x: number, y: number, vx: number, vy: number, r = 10): Body => ({ x, y, vx, vy, r });

describe('collideField', () => {
  it('bounces off a flat outer wall', () => {
    const f = field('outer', { kind: 'rect', hw: 400, hh: 300 });
    const b = body(395, 20, 200, 50);
    const hit = collideField(b, f, 1);
    expect(hit).not.toBeNull();
    expect(b.vx).toBeCloseTo(-200);
    expect(b.vy).toBeCloseTo(50);
    expect(b.x).toBeCloseTo(390);
  });

  it('ignores a body moving away from the wall', () => {
    const f = field('outer', { kind: 'rect', hw: 400, hh: 300 });
    const b = body(395, 0, -200, 0);
    expect(collideField(b, f, 1)).toBeNull();
    expect(b.vx).toBe(-200);
  });

  it('bounces off the outside of an inner field', () => {
    const f = field('inner', { kind: 'rect', hw: 100, hh: 50 });
    const b = body(0, -55, 0, 100);
    expect(collideField(b, f, 1)).not.toBeNull();
    expect(b.vy).toBeCloseTo(-100);
    expect(b.y).toBeCloseTo(-60);
  });

  it('puts an escaped body back inside the outer field', () => {
    const f = field('outer', { kind: 'circle', r: 300 });
    const b = body(320, 0, 500, 0);
    collideField(b, f, 1);
    expect(Math.hypot(b.x, b.y)).toBeLessThanOrEqual(290.5);
    expect(b.vx).toBeLessThan(0);
  });

  it('puts a body back outside an inner field it ended up inside', () => {
    const f = field('inner', { kind: 'circle', r: 100 });
    const b = body(50, 0, 0, 0);
    collideField(b, f, 1);
    expect(Math.hypot(b.x, b.y)).toBeGreaterThanOrEqual(109.5);
  });

  it('a wall moving inward shoves a resting body along with it', () => {
    const dt = 1 / 120;
    const f = field('outer', { kind: 'circle', r: 310 });
    f.setRadii(sampleShape({ kind: 'circle', r: 300 }), dt); // 1200 px/s inward
    const b = body(295, 0, 0, 0);
    collideField(b, f, 0.5);
    // Relative bounce: the body leaves at (1 + e) × wall speed.
    expect(b.vx).toBeCloseTo(-1800, 0);
  });

  it('bounces out of the concave corner of a cross', () => {
    const f = field('outer', { kind: 'cross', armX: 400, armY: 400, halfWidth: 100 });
    // Just inside the horizontal arm, under the notch, moving up into the arm's top wall.
    const b = body(200, -95, 0, -150, 10);
    collideField(b, f, 1);
    expect(b.vy).toBeGreaterThan(0);
    expect(b.y).toBeGreaterThanOrEqual(-90.5);
  });

  it('a fast body crossing a radial chamber wall is pushed back sideways, not along its ray', () => {
    const w = Math.PI / 6;
    const arena = new Arena(0, 0, [
      {
        outer: { kind: 'maltese', armX: 400, armY: 300, halfAngle: w, notch: 50, hub: 40 },
        inner: { kind: 'circle', r: 80 },
        holdSec: 0,
        morphSec: 0,
      },
    ], false);
    // Just past the right arm's lower wall (at angle w), heading further out of it.
    const r = 250;
    const b = body(r * Math.cos(w + 0.01), r * Math.sin(w + 0.01), -300, 500, 2);
    collideArena(b, arena, 1);
    const theta = Math.atan2(b.y, b.x);
    expect(arena.chamberAt(theta)).toBe(arena.chamberAt(0));
    expect(Math.hypot(b.x, b.y)).toBeCloseTo(r, -1);
    expect(arena.contains(b.x, b.y)).toBe(true);
  });
});
