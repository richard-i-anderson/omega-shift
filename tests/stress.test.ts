import { describe, expect, it } from 'vitest';
import { Arena } from '../src/arena/arena';
import { normAngle } from '../src/math/vec';
import { LEVELS } from '../src/levels/levels';
import { collideArena, type Body } from '../src/physics/collide';

// Seeded PRNG so failures reproduce.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

describe('bodies stay in the corridor', () => {
  it.each(LEVELS.map((l) => [l.name, l] as const))('%s: 200 fast bodies for 60 simulated seconds', (_, lvl) => {
    const rand = rng(42);
    const arena = new Arena(512, 384, lvl.keyframes, lvl.loop);
    const dt = 1 / 120;
    const bodies: Body[] = [];
    for (let i = 0; i < 200; i++) {
      const theta = rand() * Math.PI * 2;
      const p = arena.trackPoint(theta, (rand() - 0.5) * 40);
      const a = rand() * Math.PI * 2;
      const s = 100 + rand() * 600;
      bodies.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 2 + rand() * 10 });
    }
    let worst = 0;
    for (let step = 0; step < 60 * 120; step++) {
      arena.update(dt);
      for (const b of bodies) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        collideArena(b, arena, 1);
        const theta = normAngle(Math.atan2(b.y - 384, b.x - 512));
        const d = Math.hypot(b.x - 512, b.y - 384);
        // How far the centre sits past either wall (0 when properly inside).
        const out = Math.max(d - arena.outer.polyRadiusAt(theta), arena.inner.polyRadiusAt(theta) - d, 0);
        worst = Math.max(worst, out);
      }
    }
    expect(worst).toBeLessThan(0.5);
  });
});
