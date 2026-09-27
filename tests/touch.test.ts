import { describe, expect, it } from 'vitest';
import { SHIP, WORLD } from '../src/config';
import { Ship } from '../src/entities/ship';
import { Game, LEVEL_KEYS } from '../src/game';
import { Input } from '../src/input';
import { LEVELS } from '../src/levels/levels';
import { nameHit } from '../src/render/scores';
import { STICK, stickState, TouchControls } from '../src/touch/controls';
import { computeLayout, type Layout, type Rect } from '../src/touch/layout';
import { Arena } from '../src/arena/arena';

/** An Input without a window (the constructor only adds listeners). */
function fakeInput(): Input {
  return new Input({ addEventListener: () => {} } as unknown as Window);
}

const inside = (r: Rect, w: number, h: number) => r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= w + 0.5 && r.y + r.h <= h + 0.5;
const overlaps = (r: Rect, x: number, y: number, rad: number) =>
  x + rad > r.x && x - rad < r.x + r.w && y + rad > r.y && y - rad < r.y + r.h;

describe('touch layout', () => {
  it('without touch, letterboxes the game in the middle as before', () => {
    const { game, touch } = computeLayout(1600, 900, false);
    expect(touch).toBeUndefined();
    expect(game.h).toBeCloseTo(900);
    expect(game.w / game.h).toBeCloseTo(WORLD.w / WORLD.h);
    expect(game.x).toBeCloseTo((1600 - game.w) / 2);
  });

  const screens: [string, number, number][] = [
    ['phone landscape', 844, 390],
    ['phone portrait', 390, 844],
    ['tablet landscape', 1024, 768],
    ['tablet portrait', 768, 1024],
    ['small phone portrait', 320, 568],
  ];
  for (const [name, w, h] of screens) {
    it(`${name}: the game keeps 4:3, and the controls fit on screen without covering it`, () => {
      const l: Layout = computeLayout(w, h, true);
      const t = l.touch!;
      expect(l.game.w / l.game.h).toBeCloseTo(4 / 3);
      expect(inside(l.game, w, h)).toBe(true);
      for (const b of t.buttons) {
        expect(b.x - b.r, `${b.id} left`).toBeGreaterThanOrEqual(0);
        expect(b.x + b.r, `${b.id} right`).toBeLessThanOrEqual(w);
        expect(b.y - b.r, `${b.id} top`).toBeGreaterThanOrEqual(0);
        expect(b.y + b.r, `${b.id} bottom`).toBeLessThanOrEqual(h);
        expect(overlaps(l.game, b.x, b.y, b.r), `${b.id} covers the game`).toBe(false);
      }
      expect(overlaps(l.game, t.stickHome.x, t.stickHome.y, t.stickR * STICK.thrust)).toBe(false);
      // No two buttons on top of each other.
      for (const a of t.buttons) for (const b of t.buttons) {
        if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.id}/${b.id}`).toBeGreaterThan(a.r + b.r);
      }
    });
  }

  it('landscape puts the stick left and the buttons right; portrait puts the controls below the game', () => {
    const land = computeLayout(844, 390, true);
    expect(land.touch!.stickHome.x).toBeLessThan(land.game.x);
    expect(land.touch!.buttons.find((b) => b.id === 'fire')!.x).toBeGreaterThan(land.game.x + land.game.w);
    const port = computeLayout(390, 844, true);
    expect(port.game.y).toBe(0);
    expect(port.touch!.stickHome.y).toBeGreaterThan(port.game.y + port.game.h);
    expect(port.touch!.buttons.find((b) => b.id === 'fire')!.y).toBeGreaterThan(port.game.y + port.game.h);
  });
});

describe('the stick', () => {
  it('does nothing in the dead zone, aims in the inner ring, and thrusts in the outer ring', () => {
    const r = 60;
    expect(stickState(2, 3, r)).toEqual({ aim: null, thrust: false });
    const aimOnly = stickState(0, -r * 0.4, r);
    expect(aimOnly.thrust).toBe(false);
    expect(aimOnly.aim).toBeCloseTo(-Math.PI / 2); // up the screen
    expect(stickState(r * 0.8, 0, r)).toEqual({ aim: 0, thrust: true });
    expect(stickState(r * 3, 0, r).thrust).toBe(true); // past the edge still thrusts
  });

  it('turns the ship towards its aim at the keyboard rate, the short way round, without overshooting', () => {
    const arena = new Arena(512, 384, LEVELS[0].keyframes, false);
    const ship = new Ship(200, 384, 0);
    const dt = 1 / 120;
    ship.update(dt, { left: false, right: false, thrust: false, aim: Math.PI / 2 }, arena);
    expect(ship.angle).toBeCloseTo(SHIP.turnRate * dt);
    // Aiming just anticlockwise of the heading turns anticlockwise.
    const s2 = new Ship(200, 384, 0.1);
    s2.update(dt, { left: false, right: false, thrust: false, aim: -0.1 }, arena);
    expect(s2.angle).toBeLessThan(0.1);
    // A small turn lands exactly on the aim.
    const s3 = new Ship(200, 384, 0);
    s3.update(dt, { left: false, right: false, thrust: false, aim: 0.01 }, arena);
    expect(s3.angle).toBeCloseTo(0.01);
  });
});

describe('touch controls', () => {
  function setup(state: 'title' | 'playing' = 'playing') {
    const game = new Game(true);
    const input = fakeInput();
    let muted = false;
    const tc = new TouchControls(input, game, () => (muted = !muted), () => muted);
    tc.layout = computeLayout(844, 390, true);
    if (state === 'playing') {
      input.press(LEVEL_KEYS[0]);
      for (let i = 0; i < 480; i++) game.update(1 / 120, input);
      expect(game.state).toBe('playing');
    }
    return { game, input, tc, t: tc.layout.touch!, isMuted: () => muted };
  }

  it('the stick aims, then thrusts once pushed into the outer ring, and lets go on release', () => {
    const { input, tc, t } = setup();
    const x = t.stickHome.x;
    const y = t.stickHome.y;
    tc.down(1, x, y);
    tc.move(1, x + t.stickR * 0.4, y);
    expect(input.aim).toBeCloseTo(0);
    expect(input.isDown('ArrowUp')).toBe(false);
    tc.move(1, x, y - t.stickR * 0.9);
    expect(input.aim).toBeCloseTo(-Math.PI / 2);
    expect(input.isDown('ArrowUp')).toBe(true);
    tc.up(1);
    expect(input.aim).toBeNull();
    expect(input.isDown('ArrowUp')).toBe(false);
  });

  it('fire holds Space while pressed; hyper, bomb and pause press their keys; sound toggles', () => {
    const { input, tc, t, isMuted } = setup();
    const at = (id: string) => t.buttons.find((b) => b.id === id)!;
    tc.down(2, at('fire').x, at('fire').y);
    expect(input.isDown('Space')).toBe(true);
    tc.up(2);
    expect(input.isDown('Space')).toBe(false);
    for (const [id, code] of [['hyper', 'KeyH'], ['bomb', 'KeyB'], ['pause', 'KeyP']] as const) {
      tc.down(3, at(id).x, at(id).y);
      tc.up(3);
      expect(input.wasPressed(code), id).toBe(true);
    }
    tc.down(4, at('sound').x, at('sound').y);
    expect(isMuted()).toBe(true);
  });

  it('on the title, a tap starts the game (Enter); the flying buttons do nothing', () => {
    const { input, tc, t } = setup('title');
    const fire = t.buttons.find((b) => b.id === 'fire')!;
    tc.down(1, fire.x, fire.y);
    expect(input.wasPressed('Enter')).toBe(false);
    expect(input.isDown('Space')).toBe(false);
    tc.down(2, 422, 195);
    expect(input.wasPressed('Enter')).toBe(true);
  });

  it('Input: held codes read as down until released, and releaseAll clears the stick', () => {
    const input = fakeInput();
    input.hold('ArrowUp', true);
    input.aim = 1;
    expect(input.isDown('ArrowUp')).toBe(true);
    input.releaseAll();
    expect(input.isDown('ArrowUp')).toBe(false);
    expect(input.aim).toBeNull();
  });
});

describe('touch name entry', () => {
  it('maps taps to a slot\'s up or down arrow, and OK', () => {
    const up = nameHit(512, 196 + 150);
    const down = nameHit(512, 196 + 225);
    expect(up).toEqual({ slot: 2, dir: 1 });
    expect(down).toEqual({ slot: 2, dir: -1 });
    expect(nameHit(512, 196 + 295)).toBe('ok');
    expect(nameHit(100, 196 + 150)).toBeNull();
    expect(nameHit(512, 20)).toBeNull();
  });

  it('nameTap selects the slot and steps its letter, only during name entry', () => {
    const game = new Game(false);
    game.nameTap(0, 1);
    expect(game.nameSlots).toEqual([]);
    game.state = 'enterName';
    game.nameSlots = 'A    '.split('');
    game.nameTap(1, 1);
    game.nameTap(1, 1);
    game.nameTap(0, -1);
    expect(game.nameSlots.join('')).toBe(' B   ');
    expect(game.nameCursor).toBe(0);
  });
});
