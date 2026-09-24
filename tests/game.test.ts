import { describe, expect, it } from 'vitest';
import { Game } from '../src/game';
import type { Input } from '../src/input';
import { LEVELS } from '../src/levels/levels';

/** Scripted stand-in for the keyboard. */
class FakeInput {
  down = new Set<string>();
  presses = new Set<string>();
  isDown(...codes: string[]) {
    return codes.some((c) => this.down.has(c));
  }
  wasPressed(...codes: string[]) {
    return codes.some((c) => this.presses.delete(c));
  }
  endFrame() {
    this.presses.clear();
  }
}

// Long simulation; CI runners are several times slower than a laptop.
const SIM_TIMEOUT_MS = 60_000;

describe('game loop (headless)', () => {
  it('starts, plays, and survives five minutes of random input', () => {
    const game = new Game(false);
    const input = new FakeInput();
    const dt = 1 / 120;
    input.presses.add('Enter');
    game.update(dt, input as unknown as Input);
    expect(game.state).toBe('levelClear');

    let seed = 7;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const seen = new Set<string>();
    let bestScore = 0;
    for (let step = 0; step < 5 * 60 * 120; step++) {
      if (step % 30 === 0) {
        input.down.clear();
        for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space']) if (rand() < 0.5) input.down.add(k);
        if (rand() < 0.1) input.presses.add('KeyH');
        if (game.state === 'gameOver') input.presses.add('Enter');
      }
      game.update(dt, input as unknown as Input);
      seen.add(game.state);
      bestScore = Math.max(bestScore, game.score);
      for (const e of game.enemies) seen.add(e.kind);
      for (const v of [game.ship?.x, game.ship?.y, ...game.enemies.flatMap((e) => [e.x, e.y])]) {
        if (v !== undefined) expect(Number.isFinite(v)).toBe(true);
      }
    }
    expect(seen.has('playing')).toBe(true);
    expect(seen.has('command')).toBe(true);
    expect(bestScore).toBeGreaterThan(0);
  }, SIM_TIMEOUT_MS);

  it('clearing a wave morphs the arena into the next level', () => {
    const game = new Game(false);
    const input = new FakeInput();
    const tick = (sec: number) => {
      for (let i = 0; i < sec * 120; i++) game.update(1 / 120, input as unknown as Input);
    };
    input.presses.add('Enter');
    tick(4);
    expect(game.state).toBe('playing');
    expect(game.levelIndex).toBe(0);
    const rectCorner = game.arena.outer.radii[0];

    game.enemies = game.enemies.filter((e) => e.kind !== 'droid' && e.kind !== 'command' && e.kind !== 'death');
    tick(0.1);
    expect(game.state).toBe('levelClear');
    expect(game.justCleared).toBe(true);
    expect(game.levelIndex).toBe(1);

    tick(4);
    expect(game.state).toBe('playing');
    // Level 2 is the ring: radius 365 on the x axis instead of the rectangle's 490.
    expect(rectCorner).toBeCloseTo(490);
    expect(game.arena.outer.radii[0]).toBeCloseTo(365);
    expect(game.enemies.filter((e) => e.kind === 'droid').length).toBe(6);
  });

  /** A debug-enabled game started straight on `name`, with the wave spawned. */
  function startOn(name: string) {
    const game = new Game(true);
    const input = new FakeInput();
    const tick = (sec: number) => {
      for (let i = 0; i < sec * 120; i++) game.update(1 / 120, input as unknown as Input);
    };
    input.presses.add(`Digit${LEVELS.findIndex((l) => l.name === name) + 1}`);
    tick(4);
    expect(game.state).toBe('playing');
    expect(game.levelName).toBe(name);
    return { game, input, tick };
  }

  it('on the Maltese cross, droids start in the other chambers and H cycles clockwise through them', () => {
    const { game, input, tick } = startOn('MALTESE');
    const arena = game.arena;
    expect(arena.chambers).toHaveLength(4);
    const ship = game.ship!;
    const start = arena.chamberAtPoint(ship.x, ship.y);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(game.enemies.some((e) => arena.chamberAtPoint(e.x, e.y) === start)).toBe(false);
    expect(game.enemies.length).toBe(9);

    ship.invuln = 1e9; // the other chambers are full of droids
    const visited = [start];
    for (let i = 0; i < 4; i++) {
      input.presses.add('KeyH');
      tick(2); // longer than the hyperspace cooldown
      visited.push(arena.chamberAtPoint(ship.x, ship.y));
    }
    expect(visited).toEqual([0, 1, 2, 3, 4].map((k) => (start + k) % 4));
  });

  it('on a connected level, H jumps somewhere else on the track', () => {
    const { game, input, tick } = startOn('CLASSIC');
    const ship = game.ship!;
    const before = { x: ship.x, y: ship.y };
    input.presses.add('KeyH');
    tick(1 / 120);
    expect(Math.hypot(ship.x - before.x, ship.y - before.y)).toBeGreaterThan(1);
    expect(game.arena.contains(ship.x, ship.y)).toBe(true);
    expect(ship.hyperCooldown).toBeGreaterThan(0);
  });

  it('the score moves outside the arena on the bar level, and the inner field shrinks away', () => {
    const { game } = startOn('BAR');
    const at = LEVELS.find((l) => l.name === 'BAR')!.scoreAt!;
    expect(game.hudPos.x).toBeCloseTo(at.x);
    expect(game.hudPos.y).toBeCloseTo(at.y);
    expect(Math.max(...game.arena.inner.radii)).toBeLessThan(1);
  });

  it('a ship caught where a corridor pinches shut is jumped clear', () => {
    const { game, input, tick } = startOn('RING');
    // Park the ship on a diagonal, which the Maltese cross closes off.
    const p = game.arena.trackPoint(Math.PI / 4);
    Object.assign(game.ship!, { x: p.x, y: p.y, vx: 0, vy: 0 });
    game.enemies = [];
    input.presses.add(`Digit${LEVELS.findIndex((l) => l.name === 'MALTESE') + 1}`);
    for (let i = 0; i < 4 * 120; i++) {
      tick(1 / 120);
      const s = game.ship!;
      expect(game.arena.contains(s.x, s.y, 0.5)).toBe(true);
    }
    const s = game.ship!;
    expect(game.arena.chamberAtPoint(s.x, s.y)).toBeGreaterThanOrEqual(0);
  });
});
