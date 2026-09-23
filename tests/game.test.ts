import { describe, expect, it } from 'vitest';
import { Game } from '../src/game';
import type { Input } from '../src/input';

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
  });

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
});
