import { describe, expect, it } from 'vitest';
import { STARS, WORLD } from '../src/config';
import { makeStarfield, starBaseAlpha, starCap, Starfield } from '../src/render/stars';

const DT = 1 / 120;

function run(sf: Starfield, seconds: number): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) sf.update(DT);
}

describe('starfield', () => {
  it('is deterministic for a seed', () => {
    expect(makeStarfield(7)).toEqual(makeStarfield(7));
    expect(makeStarfield(7)).not.toEqual(makeStarfield(8));
    const a = new Starfield(7);
    const b = new Starfield(7);
    run(a, 30);
    run(b, 30);
    expect(a.shootingSpawned).toBe(b.shootingSpawned);
    for (let i = 0; i < a.stars.length; i++) {
      expect(a.starPosition(i, 0.3)).toEqual(b.starPosition(i, 0.3));
      expect(a.starAlpha(i)).toBe(b.starAlpha(i));
    }
  });

  it('has the configured mix: count, sizes, tinted share, some sparklers', () => {
    const stars = makeStarfield(STARS.seed);
    expect(stars).toHaveLength(STARS.count);
    const tinted = stars.filter((s) => s.color !== 0).length;
    expect(tinted).toBeGreaterThan(stars.length * (STARS.tintShare - 0.15));
    expect(tinted).toBeLessThan(stars.length * (STARS.tintShare + 0.15));
    expect(stars.some((s) => s.sparkle)).toBe(true);
    expect(new Set(stars.map((s) => s.layer))).toEqual(new Set([0, 1, 2]));
    for (const s of stars) {
      expect([1, 2, 3]).toContain(s.size);
      expect(s.base).toBeGreaterThanOrEqual(STARS.minAlpha);
      expect(s.base).toBeLessThanOrEqual(STARS.maxAlpha);
    }
  });

  it('keeps stars on screen while drifting and wrapping, and actually drifts', () => {
    const sf = new Starfield();
    const start = sf.stars.map((_, i) => sf.starPosition(i));
    for (let step = 0; step < 10; step++) {
      run(sf, 60);
      for (let i = 0; i < sf.stars.length; i++) {
        for (const alpha of [0, 0.5, 1]) {
          const p = sf.starPosition(i, alpha);
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThan(WORLD.w);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThan(WORLD.h);
        }
      }
    }
    // Ten minutes at ≥ 4 px/s: every star has moved (and near ones have wrapped many times).
    const moved = sf.stars.filter((_, i) => {
      const p = sf.starPosition(i);
      return Math.hypot(p.x - start[i].x, p.y - start[i].y) > 1;
    }).length;
    expect(moved).toBe(sf.stars.length);
  });

  it('interpolates drift smoothly between steps', () => {
    const sf = new Starfield();
    run(sf, 5);
    for (let i = 0; i < sf.stars.length; i++) {
      const a = sf.starPosition(i, 0);
      const b = sf.starPosition(i, 1);
      const m = sf.starPosition(i, 0.5);
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d > 10) continue; // wrapped this step
      expect(d).toBeLessThan(STARS.layerSpeeds[2] * DT + 1e-9);
      expect(m.x).toBeCloseTo((a.x + b.x) / 2, 9);
      expect(m.y).toBeCloseTo((a.y + b.y) / 2, 9);
    }
  });

  it('keeps alpha within bounds, even through flares, warps and the sky flash', () => {
    const sf = new Starfield();
    let twinkled = false;
    for (let t = 0; t < 40; t += 0.05) {
      if (Math.abs(t % 5) < 0.05) sf.onEvent({ type: 'enemyKilled', kind: 'droid', x: 300, y: 300 });
      if (Math.abs(t % 7) < 0.05) sf.onEvent({ type: 'shipKilled', x: 700, y: 400 });
      if (Math.abs(t % 3) < 0.05) sf.onEvent({ type: 'hyperspace', fromX: 100, fromY: 100, toX: 512, toY: 600 });
      run(sf, 0.05);
      for (let i = 0; i < sf.stars.length; i++) {
        const s = sf.stars[i];
        const a = sf.starAlpha(i);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(STARS.maxDrawAlpha);
        expect(a).toBeLessThanOrEqual(starCap(s));
        if (s.color <= 1 && s.size >= 2) expect(a).toBeLessThanOrEqual(STARS.whiteBigCap);
        if (starBaseAlpha(s, sf.time) > s.base + 0.2) twinkled = true;
      }
    }
    expect(twinkled).toBe(true);
  });

  it('brightens stars as a flare ring reaches them, then decays back to base', () => {
    const quiet = new Starfield();
    const lit = new Starfield();
    run(quiet, 1);
    run(lit, 1);
    lit.onEvent({ type: 'enemyKilled', kind: 'command', x: WORLD.cx, y: WORLD.cy });
    const brighter = new Set<number>();
    for (let k = 0; k < 60; k++) {
      run(quiet, 0.02);
      run(lit, 0.02);
      for (let i = 0; i < lit.stars.length; i++) {
        const diff = lit.starAlpha(i) - quiet.starAlpha(i);
        expect(diff).toBeGreaterThanOrEqual(-1e-12);
        if (diff > 0.1) brighter.add(i);
      }
    }
    expect(brighter.size).toBeGreaterThan(10);
    run(quiet, 6);
    run(lit, 6);
    for (let i = 0; i < lit.stars.length; i++) expect(lit.starAlpha(i)).toBeCloseTo(quiet.starAlpha(i), 9);
  });

  it('reaches near stars before far ones', () => {
    const sf = new Starfield();
    const ref = new Starfield();
    sf.onEvent({ type: 'enemyKilled', kind: 'droid', x: WORLD.cx, y: WORLD.cy });
    const firstLit = new Map<number, number>();
    const roomy = new Set(sf.stars.map((_, i) => i)); // stars never near their cap, so they can visibly brighten
    for (let k = 0; k < 120; k++) {
      sf.update(DT);
      ref.update(DT);
      for (let i = 0; i < sf.stars.length; i++) {
        if (ref.starAlpha(i) > starCap(sf.stars[i]) - 0.15) roomy.delete(i);
        if (!firstLit.has(i) && sf.starAlpha(i) - ref.starAlpha(i) > 0.02) firstLit.set(i, sf.time);
      }
    }
    const pts = [...firstLit]
      .filter(([i]) => roomy.has(i))
      .map(([i, t]) => {
        const p = sf.starPosition(i);
        return { d: Math.hypot(p.x - WORLD.cx, p.y - WORLD.cy), t };
      });
    const near = pts.filter((p) => p.d < 100);
    const far = pts.filter((p) => p.d > 250);
    expect(near.length).toBeGreaterThan(0);
    expect(far.length).toBeGreaterThan(0);
    expect(Math.max(...near.map((p) => p.t))).toBeLessThan(Math.min(...far.map((p) => p.t)));
  });

  it('launches shooting stars at the configured rate', () => {
    const sf = new Starfield();
    const seconds = 1200;
    let live = 0;
    for (let k = 0; k < seconds * 10; k++) {
      run(sf, 0.1);
      live = Math.max(live, sf.shooting.length);
    }
    const mean = (STARS.shootMin + STARS.shootMax) / 2;
    expect(sf.shootingSpawned).toBeGreaterThanOrEqual(Math.floor(seconds / STARS.shootMax));
    expect(sf.shootingSpawned).toBeLessThanOrEqual(Math.ceil(seconds / STARS.shootMin));
    expect(Math.abs(sf.shootingSpawned - seconds / mean)).toBeLessThan((seconds / mean) * 0.15);
    expect(live).toBeGreaterThan(0);
    expect(live).toBeLessThanOrEqual(1); // life < minimum gap, so never two at once
  });
});
