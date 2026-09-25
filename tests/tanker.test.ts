import { describe, expect, it } from 'vitest';
import { dangerLevel } from '../src/audio/danger';
import { ENEMY, SCORE } from '../src/config';
import { Bullet } from '../src/entities/bullet';
import { isHunter, isShip, pickSpawnKind, type Enemy } from '../src/entities/enemies';
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
function startOn(name: string) {
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

const tankers = (game: Game) => game.enemies.filter((e) => e.kind === 'tanker');

/** Put a motionless player shot on `e` and step once. */
function shoot(game: Game, tick: (s: number) => void, e: Enemy) {
  game.bullets.push(new Bullet(e.x, e.y, 0, 0, 1));
  tick(1 / 120);
}

describe('tankers', () => {
  it('first appear on level 5', () => {
    for (const def of LEVELS.slice(0, 4)) expect(def.tankers).toBe(0);
    for (const def of LEVELS.slice(4)) expect(def.tankers).toBeGreaterThanOrEqual(1);
  });

  it('take many hits, flash and clank on each, then blow up, score and leave a bonus', () => {
    const { game, tick } = startOn('BAR');
    const [t] = tankers(game);
    expect(t.maxHp).toBeGreaterThanOrEqual(ENEMY.tankerHp);
    const hits = t.maxHp;
    for (let i = 1; i < hits; i++) {
      shoot(game, tick, t);
      expect(t.dead).toBe(false);
      expect(t.hp).toBe(hits - i);
    }
    expect(game.events.filter((e) => e.type === 'tankerHit')).toHaveLength(hits - 1);
    const score = game.score;
    const bonuses = game.bonuses.length;
    shoot(game, tick, t);
    expect(tankers(game)).toHaveLength(0);
    expect(game.score - score).toBeGreaterThanOrEqual(SCORE.tanker);
    expect(game.bonuses.length).toBe(bonuses + 1);
    expect(game.events.some((e) => e.type === 'enemyKilled' && e.kind === 'tanker')).toBe(true);
  });

  it('keep launching ships, which count towards the wave, within the ship and hunter caps', () => {
    const { game, tick } = startOn('BAR');
    const start = game.waveSize;
    let launches = 0;
    let maxShips = 0;
    let maxHunters = 0;
    for (let s = 0; s < 60; s++) {
      tick(1);
      launches += game.events.filter((e) => e.type === 'tankerSpawn').length;
      game.events.length = 0;
      maxShips = Math.max(maxShips, game.enemies.filter(isShip).length);
      maxHunters = Math.max(maxHunters, game.enemies.filter(isHunter).length);
    }
    expect(launches).toBeGreaterThan(5);
    expect(game.waveSize).toBe(start + launches);
    expect(maxShips).toBeLessThanOrEqual(ENEMY.maxShips);
    expect(maxHunters).toBeLessThanOrEqual(ENEMY.maxHunters);
  });

  it('the wave does not clear while a tanker is alive', () => {
    const { game, tick } = startOn('BAR');
    game.enemies = tankers(game);
    tick(0.5);
    expect(game.state).toBe('playing');
    game.enemies = [];
    tick(1 / 120);
    expect(game.state).toBe('levelClear');
  });

  it('on the Maltese cross they start outside the ship\'s chamber, and what they launch lands inside a chamber', () => {
    const { game, tick } = startOn('MALTESE');
    const arena = game.arena;
    const here = arena.chamberAtPoint(game.ship!.x, game.ship!.y);
    for (const t of tankers(game)) expect(arena.chamberAtPoint(t.x, t.y)).not.toBe(here);
    tick(20);
    for (const e of game.enemies) {
      if (e.kind === 'droid' || e.kind === 'command') expect(arena.chamberAtPoint(e.x, e.y)).toBeGreaterThanOrEqual(0);
    }
  });

  it('launch mostly droids, sometimes hunters', () => {
    const counts = { droid: 0, command: 0, death: 0 };
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 10000; i++) counts[pickSpawnKind(rng)]++;
    const w = ENEMY.tankerSpawnWeights;
    const total = w.droid + w.command + w.death;
    expect(counts.droid / 10000).toBeCloseTo(w.droid / total, 1);
    expect(counts.command / 10000).toBeCloseTo(w.command / total, 1);
    expect(counts.death / 10000).toBeCloseTo(w.death / total, 1);
  });

  it('raise the danger pulse like a command ship', () => {
    expect(dangerLevel([{ kind: 'tanker', dead: false }])).toBe('command');
    expect(dangerLevel([{ kind: 'tanker', dead: false }, { kind: 'death', dead: false }])).toBe('death');
  });

  it('take the damage of 4 hits from a smart bomb, but always survive one', () => {
    const { game, input, tick } = startOn('BAR');
    const [t] = tankers(game);
    const hp = t.hp;
    game.bombs = 2;
    input.presses.add('KeyB');
    tick(1 / 120);
    expect(game.enemies).toEqual([t]); // everything else is gone
    expect(t.hp).toBe(hp - ENEMY.tankerBombHits);
    expect(game.state).toBe('playing');

    t.hp = 2;
    input.presses.add('KeyB');
    tick(1 / 120);
    expect(t.dead).toBe(false);
    expect(t.hp).toBe(1);
  });
});
