import { describe, expect, it } from 'vitest';
import { EXPLOSION, type BlastKind } from '../src/config';
import { blastSize, coolStep, COOL_STEPS, spawnBlast, updateParticles, type Particle } from '../src/entities/particles';
import { Game } from '../src/game';

const BY_DANGER: BlastKind[] = ['mine', 'droid', 'command', 'death', 'ship'];

describe('explosions', () => {
  it('presets grow with danger: mine < droid < command < death < ship', () => {
    for (let i = 1; i < BY_DANGER.length; i++) {
      const a = EXPLOSION.presets[BY_DANGER[i - 1]];
      const b = EXPLOSION.presets[BY_DANGER[i]];
      expect(blastSize(BY_DANGER[i])).toBeGreaterThan(blastSize(BY_DANGER[i - 1]));
      expect(b.shards).toBeGreaterThan(a.shards);
      expect(b.sparks).toBeGreaterThan(a.sparks);
      expect(b.speed).toBeGreaterThan(a.speed);
      expect(b.sparkSpeed).toBeGreaterThan(a.sparkSpeed);
      expect(b.len[1]).toBeGreaterThan(a.len[1]);
      expect(b.life[1]).toBeGreaterThan(a.life[1]);
      expect(b.ring.radius).toBeGreaterThan(a.ring.radius);
      expect(b.flash.radius).toBeGreaterThan(a.flash.radius);
      expect(b.shake).toBeGreaterThanOrEqual(a.shake);
    }
    // Lines are 6–24 px; only the ship, death ships and the smart bomb shake the screen.
    for (const p of Object.values(EXPLOSION.presets)) {
      expect(p.len[0]).toBeGreaterThanOrEqual(6);
      expect(p.len[1]).toBeLessThanOrEqual(24);
    }
    const shakers = (Object.keys(EXPLOSION.presets) as BlastKind[]).filter((k) => EXPLOSION.presets[k].shake > 0);
    expect(shakers.sort()).toEqual(['bomb', 'death', 'ship']);
  });

  it('spawns every part of a blast at rest in place, so interpolation does not streak', () => {
    const ps: Particle[] = [];
    spawnBlast(ps, 'death', 100, 200, '#ff4040');
    expect(ps.length).toBe(blastSize('death'));
    const kinds = new Set(ps.map((p) => p.kind));
    expect([...kinds].sort()).toEqual(['flash', 'ring', 'shard', 'spark']);
    for (const p of ps) {
      expect([p.x, p.y, p.prevX, p.prevY]).toEqual([100, 200, 100, 200]);
      expect(coolStep(p)).toBe(0); // white-hot
    }
  });

  it('fragments cool from white to their colour', () => {
    const ps: Particle[] = [];
    spawnBlast(ps, 'droid', 0, 0, '#ff4fd8');
    const shard = ps.find((p) => p.kind === 'shard')!;
    expect(shard.palette.steps[0]).toBe('rgb(255,255,255)');
    expect(shard.palette.steps[COOL_STEPS - 1]).toBe('rgb(255,79,216)');
    shard.life = shard.maxLife * 0.01;
    expect(coolStep(shard)).toBe(COOL_STEPS - 1);
  });

  it('caps live particles, dropping the oldest', () => {
    const ps: Particle[] = [];
    for (let i = 0; i < 40; i++) spawnBlast(ps, 'ship', i, 0, '#ffffff');
    expect(ps.length).toBe(EXPLOSION.maxParticles);
    // The newest blast is intact.
    expect(ps.filter((p) => p.x === 39 && p.prevX === 39).length).toBe(blastSize('ship'));
  });

  it('dies out', () => {
    const ps: Particle[] = [];
    for (const k of Object.keys(EXPLOSION.presets) as BlastKind[]) spawnBlast(ps, k, 0, 0, '#35e0ff');
    const longest = Math.max(...Object.values(EXPLOSION.presets).map((p) => p.life[1]));
    let t = 0;
    while (ps.length && t < 10) {
      updateParticles(ps, 1 / 120);
      t += 1 / 120;
    }
    expect(ps.length).toBe(0);
    expect(t).toBeLessThanOrEqual(longest + 0.01);
  });

  it('screen shake is bounded and off at rest', () => {
    const game = new Game(false);
    expect(game.shakeOffset).toEqual({ x: 0, y: 0 });
    game.shake = 5;
    for (let i = 0; i < 50; i++) {
      game.time = i * 0.013;
      const o = game.shakeOffset;
      expect(Math.hypot(o.x, o.y)).toBeLessThanOrEqual(5 * Math.SQRT2 + 1e-9);
    }
  });
});
