import { describe, expect, it } from 'vitest';
import { STARS, WORLD } from '../src/config';
import { makeStarfield, starAlpha } from '../src/render/stars';

describe('starfield', () => {
  it('is deterministic for a seed', () => {
    expect(makeStarfield(7)).toEqual(makeStarfield(7));
    expect(makeStarfield(7)).not.toEqual(makeStarfield(8));
  });

  it('has the configured number of stars, all on-screen', () => {
    const stars = makeStarfield(STARS.seed);
    expect(stars).toHaveLength(STARS.count);
    for (const s of stars) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.x + s.size).toBeLessThanOrEqual(WORLD.w);
      expect(s.y + s.size).toBeLessThanOrEqual(WORLD.h);
      expect(s.base).toBeGreaterThanOrEqual(STARS.minAlpha);
      expect(s.base).toBeLessThanOrEqual(STARS.maxAlpha);
    }
  });

  it('includes a few tinted stars', () => {
    const stars = makeStarfield(STARS.seed);
    const tinted = stars.filter((s) => s.color !== 0).length;
    expect(tinted).toBeGreaterThan(0);
    expect(tinted).toBeLessThan(stars.length / 3);
  });

  it('flickers gently: never out, never much brighter than its base', () => {
    const stars = makeStarfield(STARS.seed);
    const lo = 1 - 2 * STARS.flickerDepth;
    let twinkled = false;
    for (const s of stars) {
      for (let t = 0; t < 120; t += 0.1) {
        const a = starAlpha(s, t);
        expect(a).toBeGreaterThanOrEqual(s.base * lo - 1e-9);
        expect(a).toBeLessThanOrEqual(Math.min(1, s.base + STARS.twinkleBoost) + 1e-9);
        if (a > s.base + 0.1) twinkled = true;
      }
    }
    expect(twinkled).toBe(true);
  });
});
