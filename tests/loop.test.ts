import { describe, expect, it } from 'vitest';
import { Game, LEVEL_KEYS } from '../src/game';
import type { Input } from '../src/input';
import { LEVELS } from '../src/levels/levels';
import { advance, MAX_FRAME_GAP } from '../src/loop';
import { lerp } from '../src/math/vec';

const STEP = 1 / 120;

describe('fixed-timestep stepping', () => {
  it('runs whole steps and carries the remainder', () => {
    const a = advance(0, 2.5 * STEP, STEP);
    expect(a.steps).toBe(2);
    expect(a.acc).toBeCloseTo(0.5 * STEP, 12);
    expect(a.alpha).toBeCloseTo(0.5, 9);
    const b = advance(a.acc, 0.6 * STEP, STEP);
    expect(b.steps).toBe(1);
    expect(b.alpha).toBeCloseTo(0.1, 9);
  });

  it('runs no step when less than one is due', () => {
    const a = advance(0, 0.4 * STEP, STEP);
    expect(a.steps).toBe(0);
    expect(a.alpha).toBeCloseTo(0.4, 9);
  });

  it('clamps long gaps and ignores negative ones', () => {
    const long = advance(0, 10, STEP);
    expect(long.steps).toBe(Math.floor(MAX_FRAME_GAP / STEP + 1e-9));
    expect(advance(0, -1, STEP).steps).toBe(0);
  });

  it('keeps alpha in [0, 1) and the total simulated time in step with the clock', () => {
    let seed = 3;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    let acc = 0;
    let clock = 0;
    let steps = 0;
    for (let f = 0; f < 20_000; f++) {
      // Frame gaps around 60, 120 and 144 Hz, with jitter.
      const dt = [1 / 60, 1 / 120, 1 / 144][f % 3] * (0.8 + 0.4 * rand());
      clock += dt;
      const a = advance(acc, dt, STEP);
      acc = a.acc;
      steps += a.steps;
      expect(a.alpha).toBeGreaterThanOrEqual(0);
      expect(a.alpha).toBeLessThan(1);
      expect(a.acc).toBeGreaterThanOrEqual(-1e-12);
      expect(a.acc).toBeLessThan(STEP);
    }
    expect(Math.abs(steps * STEP + acc - clock)).toBeLessThan(1e-6);
  });
});

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

function startOn(name: string) {
  const game = new Game(true);
  const input = new FakeInput();
  const step = () => {
    game.snapshot();
    game.update(STEP, input as unknown as Input);
  };
  input.presses.add(LEVEL_KEYS[LEVELS.findIndex((l) => l.name === name)]);
  for (let i = 0; i < 4 * 120; i++) step();
  expect(game.state).toBe('playing');
  return { game, input, step };
}

describe('render interpolation', () => {
  it('lerping at alpha 0 gives the state before the step and at 1 the state after it', () => {
    const { game, input, step } = startOn('SHIFT');
    game.ship!.invuln = 1e9; // so a droid can't end the test early
    input.down.add('ArrowUp');
    input.down.add('ArrowLeft');
    input.down.add('Space');
    // Into SHIFT's first morph, so the walls are moving too.
    while (!game.arena.moving) step();
    for (let i = 0; i < 30; i++) step();

    const ship = game.ship!;
    const before = {
      ship: { x: ship.x, y: ship.y, angle: ship.angle },
      enemies: game.enemies.map((e) => ({ x: e.x, y: e.y })),
      wall: { x: game.arena.outer.xs[100], y: game.arena.outer.ys[100] },
    };
    step();
    expect(game.bullets.length).toBeGreaterThan(0);
    expect(Math.hypot(ship.x - before.ship.x, ship.y - before.ship.y)).toBeGreaterThan(0);
    expect(lerp(ship.prevX, ship.x, 0)).toBe(before.ship.x);
    expect(lerp(ship.prevY, ship.y, 0)).toBe(before.ship.y);
    expect(lerp(ship.prevAngle, ship.angle, 0)).toBe(before.ship.angle);
    expect(lerp(ship.prevX, ship.x, 1)).toBeCloseTo(ship.x, 9);
    expect(lerp(ship.prevAngle, ship.angle, 1)).toBeCloseTo(ship.angle, 9);
    game.enemies.forEach((e, i) => {
      expect(lerp(e.prevX, e.x, 0)).toBe(before.enemies[i].x);
      expect(lerp(e.prevY, e.y, 1)).toBeCloseTo(e.y, 9);
    });
    const f = game.arena.outer;
    expect(f.prevXs[100]).toBe(before.wall.x);
    expect(f.prevYs[100]).toBe(before.wall.y);
    expect(f.xs[100]).not.toBe(before.wall.x);
    for (const b of game.bullets) {
      expect(lerp(b.prevX, b.x, 1)).toBeCloseTo(b.x, 9);
      expect(Math.hypot(b.x - b.prevX, b.y - b.prevY)).toBeLessThan(20); // one step's travel, not a streak
    }
  });

  it('a hyperspace jump leaves nothing to interpolate, so the ship does not streak', () => {
    const { game, input, step } = startOn('CLASSIC');
    const ship = game.ship!;
    const before = { x: ship.x, y: ship.y };
    input.presses.add('KeyH');
    step();
    expect(Math.hypot(ship.x - before.x, ship.y - before.y)).toBeGreaterThan(1);
    expect(ship.prevX).toBe(ship.x);
    expect(ship.prevY).toBe(ship.y);
  });

  it('a newly spawned ship starts with its previous position equal to its current one', () => {
    const game = new Game(true);
    const input = new FakeInput();
    input.presses.add('Digit2');
    let steps = 0;
    while (!game.ship && steps++ < 10 * 120) {
      game.snapshot();
      game.update(STEP, input as unknown as Input);
    }
    const ship = game.ship!;
    expect(ship).not.toBeNull();
    expect(ship.prevX).toBe(ship.x);
    expect(ship.prevY).toBe(ship.y);
    expect(ship.prevAngle).toBe(ship.angle);
  });
});
