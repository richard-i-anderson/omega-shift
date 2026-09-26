import { describe, expect, it } from 'vitest';
import { GAME_OVER_SEC, SCORES } from '../src/config';
import { Bullet } from '../src/entities/bullet';
import { Game, LEVEL_KEYS } from '../src/game';
import type { Input } from '../src/input';
import { LEVELS } from '../src/levels/levels';
import type { ScoreEntry } from '../shared/scores';

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

/** A game that has just ended with `score` points, with the given board. */
function endWith(score: number, board: { global?: ScoreEntry[] | null; best?: ScoreEntry | null } = {}) {
  const game = new Game(true);
  const input = new FakeInput();
  const tick = (sec: number) => {
    for (let i = 0; i < Math.round(sec * 120); i++) game.update(1 / 120, input as unknown as Input);
  };
  input.presses.add(LEVEL_KEYS[LEVELS.findIndex((l) => l.name === 'RING')]);
  tick(4);
  game.board = { global: board.global ?? null, best: board.best ?? null };
  game.score = score;
  game.lives = 1;
  const s = game.ship!;
  s.invuln = 0;
  s.shield = 0;
  game.enemyBullets.push(new Bullet(s.x, s.y, 0, 0, 1));
  tick(1 / 120);
  expect(game.state).toBe('gameOver');
  game.events.length = 0;
  return { game, input, tick };
}

const press = (input: FakeInput, tick: (s: number) => void, ...keys: string[]) => {
  for (const k of keys) {
    input.presses.add(k);
    tick(1 / 120);
  }
};

const e = (name: string, score: number): ScoreEntry => ({ name, score, level: 1 });
const fullBoard = Array.from({ length: 10 }, (_, i) => e('AAA', 100_000 - i * 5000));

describe('high-score entry', () => {
  it('a new device best asks for a name after the game-over banner', () => {
    const { game, tick } = endWith(5000);
    tick(1);
    expect(game.state).toBe('gameOver');
    tick(1);
    expect(game.state).toBe('enterName');
    expect(game.nameSlots).toEqual(['A', ' ', ' ', ' ', ' ']);
  });

  it("scores that make neither the device best nor the top 10 don't ask", () => {
    const { game, tick } = endWith(5000, { best: e('ME', 9000), global: fullBoard });
    tick(2);
    expect(game.state).toBe('gameOver');
    expect(game.qualifies()).toBe(false);
  });

  it('making the global top 10 asks, even below the device best', () => {
    const { game, tick } = endWith(80_000, { best: e('ME', 200_000), global: fullBoard });
    tick(2);
    expect(game.state).toBe('enterName');
  });

  it('with the global board offline, only a new device best asks', () => {
    expect(endWith(5000, { best: e('ME', 9000), global: null }).game.qualifies()).toBe(false);
    expect(endWith(9050, { best: e('ME', 9000), global: null }).game.qualifies()).toBe(true);
  });

  it('arrow keys spell the name, wrapping A-Z and blank, and Enter submits it', () => {
    const { game, input, tick } = endWith(5000);
    tick(2);
    // A -> C in slot 1; slot 2 starts blank: up to A, then down wraps back to blank, then to Z.
    press(input, tick, 'ArrowUp', 'ArrowUp', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'ArrowDown');
    expect(game.nameSlots.slice(0, 2)).toEqual(['C', 'Z']);
    press(input, tick, 'ArrowRight', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp');
    expect(game.nameSlots.join('')).toBe('CZE  ');
    expect(game.events.filter((ev) => ev.type === 'nameEdit').length).toBeGreaterThan(0);
    press(input, tick, 'Enter');
    const entered = game.events.find((ev) => ev.type === 'scoreEntered');
    expect(entered).toMatchObject({ name: 'CZE', score: 5000, level: 2 });
    expect(game.state).toBe('gameOver');
    expect(game.board.best).toEqual({ name: 'CZE', score: 5000, level: 2 });
    expect(game.lastEntry).toEqual(game.board.best);
  });

  it('refuses a rude name or a gap, and keeps asking', () => {
    const { game, input, tick } = endWith(5000);
    tick(2);
    game.nameSlots = 'FUCK '.split('');
    press(input, tick, 'Enter');
    expect(game.state).toBe('enterName');
    expect(game.nameRejected?.reason).toBe('rude');
    expect(game.events.some((ev) => ev.type === 'scoreEntered')).toBe(false);
    game.nameSlots = 'A B  '.split('');
    press(input, tick, 'Enter');
    expect(game.nameRejected?.reason).toBe('invalid');
    game.nameSlots = 'ACE  '.split('');
    press(input, tick, 'Enter');
    expect(game.state).toBe('gameOver');
  });

  it('starts from the name last used on this device', () => {
    const { game, tick } = endWith(9500, { best: e('ZED', 9000) });
    tick(2);
    expect(game.nameSlots.join('')).toBe('ZED  ');
  });

  it('gives up after a while with no key pressed, and still returns to the title', () => {
    const { game, tick } = endWith(5000);
    tick(2);
    tick(SCORES.nameEntryTimeout + 0.1);
    expect(game.state).toBe('gameOver');
    expect(game.events.some((ev) => ev.type === 'scoreEntered')).toBe(false);
    tick(GAME_OVER_SEC + 0.1);
    expect(game.state).toBe('title');
  });

  it("the Enter that accepts the name doesn't also start a new game, but a later one does", () => {
    const { game, input, tick } = endWith(5000);
    tick(2);
    press(input, tick, 'Enter');
    expect(game.state).toBe('gameOver');
    tick(1.1);
    press(input, tick, 'Enter');
    expect(game.state).toBe('levelClear');
    expect(game.score).toBe(0);
  });
});
