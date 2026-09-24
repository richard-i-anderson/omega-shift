import { describe, expect, it } from 'vitest';
import { BONUS, MAX_LIVES, SCORE } from '../src/config';
import { makeBonus, pickBonusKind, updateBonus } from '../src/entities/bonus';
import { Game, LEVEL_KEYS } from '../src/game';
import type { Input } from '../src/input';
import { LEVELS } from '../src/levels/levels';

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

/** A debug game started on `name` with its wave spawned; the ship can't die. */
function startOn(name = 'CLASSIC') {
  const game = new Game(true);
  const input = new FakeInput();
  const tick = (sec: number) => {
    for (let i = 0; i < Math.round(sec * 120); i++) {
      if (game.ship) game.ship.invuln = 1;
      game.update(1 / 120, input as unknown as Input);
    }
  };
  input.presses.add(LEVEL_KEYS[LEVELS.findIndex((l) => l.name === name)]);
  tick(4);
  expect(game.state).toBe('playing');
  return { game, input, tick };
}

/** Drop a bonus right on the ship and step once, so it's collected. */
function collectOnShip(game: Game, tick: (s: number) => void, kind: 'life' | 'points' | 'bomb') {
  const s = game.ship!;
  game.dropBonus(kind, s.x, s.y);
  tick(1 / 120);
}

describe('bonuses', () => {
  it('enemy ships leave bonuses behind during a wave', () => {
    const { game, tick } = startOn();
    const dropped = new Set<string>();
    for (let i = 0; i < 40 && dropped.size === 0; i++) {
      tick(1);
      for (const e of game.events) if (e.type === 'bonusDropped') dropped.add(e.kind);
      game.events.length = 0;
    }
    expect(dropped.size).toBeGreaterThan(0);
    expect(game.bonuses.length).toBeLessThanOrEqual(BONUS.maxLive);
  });

  it('picks kinds by weight, with the best bonuses likeliest from the most dangerous ships', () => {
    let seed = 3;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const share = (from: 'droid' | 'death', kind: string) => {
      let n = 0;
      for (let i = 0; i < 4000; i++) if (pickBonusKind(from, rand) === kind) n++;
      return n / 4000;
    };
    expect(share('droid', 'points')).toBeCloseTo(BONUS.weights.droid.points, 1);
    expect(share('death', 'life')).toBeGreaterThan(share('droid', 'life'));
    expect(share('death', 'bomb')).toBeGreaterThan(share('droid', 'bomb'));
  });

  it('flying through a points bonus adds points and shows a popup', () => {
    const { game, tick } = startOn();
    const before = game.score;
    collectOnShip(game, tick, 'points');
    expect(game.score - before).toBeGreaterThanOrEqual(BONUS.points);
    expect(game.bonuses).toHaveLength(0);
    expect(game.popups.some((p) => p.text === `+${BONUS.points}`)).toBe(true);
    expect(game.events.some((e) => e.type === 'bonusCollected' && e.kind === 'points')).toBe(true);
  });

  it('an extra life bonus adds a life, up to the maximum; past it, points instead', () => {
    const { game, tick } = startOn();
    const lives = game.lives;
    collectOnShip(game, tick, 'life');
    expect(game.lives).toBe(lives + 1);
    game.lives = MAX_LIVES;
    const score = game.score;
    collectOnShip(game, tick, 'life');
    expect(game.lives).toBe(MAX_LIVES);
    expect(game.score - score).toBeGreaterThanOrEqual(BONUS.points);
  });

  it('score extra lives stop at the maximum too', () => {
    const { game, tick } = startOn();
    game.lives = MAX_LIVES;
    for (let i = 0; i < 25; i++) collectOnShip(game, tick, 'points'); // past several extraLifeEvery marks
    expect(game.score).toBeGreaterThan(SCORE.extraLifeEvery * 2);
    expect(game.lives).toBe(MAX_LIVES);
  });

  it('B sets off a smart bomb: every enemy dies (mines too), with its points, and the wave clears', () => {
    const { game, input, tick } = startOn();
    input.presses.add('KeyB');
    tick(1 / 120);
    expect(game.enemies.length).toBeGreaterThan(0); // no bomb held: nothing happens
    collectOnShip(game, tick, 'bomb');
    expect(game.bombs).toBe(1);
    game.enemyBullets = [];
    const before = game.score;
    const count = game.enemies.length;
    input.presses.add('KeyB');
    tick(1 / 120);
    expect(game.bombs).toBe(0);
    expect(game.enemies).toHaveLength(0);
    expect(game.score - before).toBeGreaterThanOrEqual(count * SCORE.droid);
    expect(game.events.filter((e) => e.type === 'enemyKilled' && e.bombed).length).toBe(count);
    expect(game.events.some((e) => e.type === 'smartBomb')).toBe(true);
    expect(game.state).toBe('levelClear');
  });

  it('a smart bomb reaches every chamber', () => {
    const { game, input, tick } = startOn('MALTESE');
    const chambers = new Set(game.enemies.map((e) => game.arena.chamberAtPoint(e.x, e.y)));
    expect(chambers.size).toBe(3);
    collectOnShip(game, tick, 'bomb');
    input.presses.add('KeyB');
    tick(1 / 120);
    expect(game.enemies).toHaveLength(0);
  });

  it('bombs held stop at the maximum; extras score points', () => {
    const { game, tick } = startOn();
    for (let i = 0; i < BONUS.maxBombs + 2; i++) collectOnShip(game, tick, 'bomb');
    expect(game.bombs).toBe(BONUS.maxBombs);
  });

  it('an uncollected bonus disappears after its lifetime', () => {
    const { game } = startOn();
    const p = game.arena.trackPoint(0);
    const b = makeBonus('points', p.x, p.y);
    for (let t = 0; t < BONUS.life - 0.05; t += 1 / 120) updateBonus(b, 1 / 120, game.arena);
    expect(b.dead).toBe(false);
    for (let t = 0; t < 0.1; t += 1 / 120) updateBonus(b, 1 / 120, game.arena);
    expect(b.dead).toBe(true);
  });

  it('spinning walls shove a bonus but never push it out of the arena', () => {
    const { game, tick } = startOn('VORTEX');
    for (let k = 0; k < 16; k++) {
      const p = game.arena.trackPoint((k / 16) * Math.PI * 2, 30);
      game.dropBonus('points', p.x, p.y);
    }
    for (let i = 0; i < 8 * 120; i++) {
      tick(1 / 120);
      for (const b of game.bonuses) expect(game.arena.contains(b.x, b.y, 0.5)).toBe(true);
    }
  });

  it('a new game starts with no bombs and no bonuses', () => {
    const { game, tick } = startOn();
    collectOnShip(game, tick, 'bomb');
    game.dropBonus('points', 0, 0);
    game.lives = 1;
    game.state = 'gameOver';
    const input = new FakeInput();
    game.stateTimer = 0;
    input.presses.add('Enter');
    game.update(1 / 120, input as unknown as Input);
    expect(game.bombs).toBe(0);
    expect(game.bonuses).toHaveLength(0);
  });

  it('uncollected bonuses can still be fetched during the level card, then fizzle when the next wave arrives', () => {
    const { game, input, tick } = startOn();
    collectOnShip(game, tick, 'bomb');
    const p = game.arena.trackPoint(0);
    game.dropBonus('points', p.x, p.y);
    input.presses.add('KeyB');
    tick(1 / 120);
    expect(game.state).toBe('levelClear');
    expect(game.bonuses).toHaveLength(1);
    const s = game.ship!;
    const before = game.score;
    game.dropBonus('life', s.x, s.y);
    tick(1 / 120);
    expect(game.lives).toBeGreaterThan(0);
    expect(game.events.some((e) => e.type === 'bonusCollected' && e.kind === 'life')).toBe(true);
    expect(game.score).toBeGreaterThanOrEqual(before);
    tick(5);
    expect(game.state).toBe('playing');
    expect(game.bonuses).toHaveLength(0);
  });
});
