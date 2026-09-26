import { describe, expect, it } from 'vitest';
import { BONUS } from '../src/config';
import { pickBonusKind } from '../src/entities/bonus';
import { Bullet } from '../src/entities/bullet';
import { makeDroid, makeTanker } from '../src/entities/enemies';
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

/** A game on `name` with the wave spawned and the enemies cleared away; the ship's respawn blink is over. */
function start(name = 'CLASSIC') {
  const game = new Game(true);
  const input = new FakeInput();
  const tick = (sec: number) => {
    for (let i = 0; i < Math.round(sec * 120); i++) game.update(1 / 120, input as unknown as Input);
  };
  input.presses.add(LEVEL_KEYS[LEVELS.findIndex((l) => l.name === name)]);
  tick(4);
  expect(game.state).toBe('playing');
  const ship = game.ship!;
  ship.invuln = 0;
  // Keep one far-off droid so the wave doesn't clear.
  const keep = makeDroid(game.arena, Math.atan2(ship.y - 384, ship.x - 512) + Math.PI);
  game.enemies = [keep];
  game.enemyBullets = [];
  return { game, input, tick, ship };
}

function shield(game: Game, tick: (s: number) => void) {
  const s = game.ship!;
  game.dropBonus('shield', s.x, s.y);
  tick(1 / 120);
}

describe('shield bonus', () => {
  it('can drop from every kind of ship', () => {
    let seed = 7;
    const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (const from of ['droid', 'command', 'death', 'tanker'] as const) {
      let n = 0;
      for (let i = 0; i < 4000; i++) if (pickBonusKind(from, rng) === 'shield') n++;
      expect(n / 4000).toBeCloseTo(BONUS.weights[from].shield, 1);
    }
  });

  it('collecting one shields the ship for 15 s, and another resets the timer rather than adding to it', () => {
    const { game, tick, ship } = start();
    shield(game, tick);
    expect(ship.shield).toBeCloseTo(BONUS.shieldSec, 1);
    expect(game.events.some((e) => e.type === 'bonusCollected' && e.kind === 'shield')).toBe(true);
    expect(game.popups.at(-1)?.text).toBe('SHIELD');
    tick(5);
    expect(ship.shield).toBeCloseTo(BONUS.shieldSec - 5, 1);
    shield(game, tick);
    expect(ship.shield).toBeCloseTo(BONUS.shieldSec, 1);
  });

  it('swallows enemy shots and destroys what it rams, but passes through tankers', () => {
    const { game, tick, ship } = start();
    shield(game, tick);
    const droid = makeDroid(game.arena, Math.atan2(ship.y - 384, ship.x - 512));
    Object.assign(droid, { x: ship.x, y: ship.y, prevX: ship.x, prevY: ship.y });
    const tanker = makeTanker(game.arena, 0, 1);
    Object.assign(tanker, { x: ship.x + 5, y: ship.y, prevX: ship.x + 5, prevY: ship.y });
    game.enemies.push(droid, tanker);
    game.enemyBullets.push(new Bullet(ship.x, ship.y, 0, 0, 1));
    tick(1 / 120);
    expect(game.ship).toBe(ship);
    expect(game.enemyBullets).toHaveLength(0);
    expect(droid.dead).toBe(true);
    expect(game.enemies).toContain(tanker);
    expect(tanker.hp).toBe(tanker.maxHp);
  });

  it('beeps for each of the last 3 seconds, sounds it failing, and then the ship can die again', () => {
    const { game, tick, ship } = start();
    shield(game, tick);
    game.events.length = 0;
    tick(BONUS.shieldSec + 0.1);
    const ticks = game.events.flatMap((e) => (e.type === 'shieldTick' ? [e.left] : []));
    expect(ticks).toEqual([3, 2, 1]);
    expect(game.events.filter((e) => e.type === 'shieldDown')).toHaveLength(1);
    expect(ship.shield).toBe(0);
    ship.invuln = 0;
    game.enemyBullets.push(new Bullet(ship.x, ship.y, 0, 0, 1));
    tick(1 / 120);
    expect(game.ship).toBeNull();
  });
});
