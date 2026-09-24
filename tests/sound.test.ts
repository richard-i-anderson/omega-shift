import { describe, expect, it } from 'vitest';
import { ambientDanger, dangerLevel, remainingFraction, type Ambient, type Danger } from '../src/audio/danger';
import { AudioEngine, pulseSettings } from '../src/audio/engine';
import { crushCurve } from '../src/audio/synth';
import { SOUND, WORLD } from '../src/config';
import type { EnemyKind } from '../src/entities/enemies';
import type { GameEvent } from '../src/events';
import { Game } from '../src/game';
import { LEVELS } from '../src/levels/levels';
import type { Input } from '../src/input';

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

const SIM_TIMEOUT_MS = 60_000;

/** A game on CLASSIC with its wave spawned; `tick` returns the events it produced. */
function playing() {
  const game = new Game(true);
  const input = new FakeInput();
  const tick = (sec: number): GameEvent[] => {
    const out: GameEvent[] = [];
    for (let i = 0; i < Math.round(sec * 120); i++) {
      game.update(1 / 120, input as unknown as Input);
      out.push(...game.events);
      game.events.length = 0;
    }
    return out;
  };
  input.presses.add('Digit1');
  tick(4);
  expect(game.state).toBe('playing');
  return { game, input, tick };
}

describe('game events', () => {
  it('a ship shoved into a wall emits a fieldHit from the ship', () => {
    const { game, tick } = playing();
    const ship = game.ship!;
    ship.invuln = 1e9;
    const dx = ship.x - WORLD.cx;
    const dy = ship.y - WORLD.cy;
    const d = Math.hypot(dx, dy);
    ship.vx = (dx / d) * 400;
    ship.vy = (dy / d) * 400;
    const hits = tick(1).filter((e) => e.type === 'fieldHit' && e.source === 'ship');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].type === 'fieldHit' && hits[0].impact).toBeGreaterThan(100);
  });

  it('a shot hitting a wall emits a fieldHit from a shot', () => {
    const { game, input, tick } = playing();
    const ship = game.ship!;
    ship.invuln = 1e9;
    ship.angle = Math.atan2(ship.y - WORLD.cy, ship.x - WORLD.cx);
    input.down.add('Space');
    const events = tick(1);
    expect(events.some((e) => e.type === 'shipFire')).toBe(true);
    expect(events.some((e) => e.type === 'fieldHit' && e.source === 'shot')).toBe(true);
  });

  it('random play emits promotions, enemy fire, kills and mines', () => {
    const game = new Game(false);
    const input = new FakeInput();
    input.presses.add('Enter');
    let seed = 11;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const seen = new Set<string>();
    for (let step = 0; step < 3 * 60 * 120; step++) {
      if (step % 30 === 0) {
        input.down.clear();
        for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space']) if (rand() < 0.5) input.down.add(k);
        if (rand() < 0.1) input.presses.add('KeyH');
        if (game.state === 'gameOver') input.presses.add('Enter');
      }
      game.update(1 / 120, input as unknown as Input);
      for (const e of game.events) {
        seen.add(e.type);
        if (e.type === 'promoted') seen.add(`promoted:${e.to}`);
        if (e.type === 'fieldHit') seen.add(`fieldHit:${e.source}`);
      }
      game.events.length = 0;
    }
    for (const t of ['waveStart', 'shipFire', 'promoted:command', 'enemyFire', 'mineLaid', 'enemyKilled', 'fieldHit:ship', 'fieldHit:shot']) {
      expect(seen, t).toContain(t);
    }
  }, SIM_TIMEOUT_MS);

  it('undrained events are capped', () => {
    const { game, input } = playing();
    input.down.add('Space');
    for (let i = 0; i < 120 * 60; i++) game.update(1 / 120, input as unknown as Input);
    expect(game.events.length).toBeLessThanOrEqual(256);
  });
});

describe('danger level', () => {
  const es = (...kinds: EnemyKind[]) => kinds.map((kind) => ({ kind, dead: false }));

  it('is set by the most dangerous enemy alive, ignoring mines', () => {
    expect(dangerLevel([])).toBe('none');
    expect(dangerLevel(es('photon', 'vapor'))).toBe('none');
    expect(dangerLevel(es('droid', 'photon'))).toBe('droid');
    expect(dangerLevel(es('droid', 'command', 'droid'))).toBe('command');
    expect(dangerLevel(es('command', 'death', 'droid'))).toBe('death');
    expect(dangerLevel([...es('droid'), { kind: 'death', dead: true }])).toBe('droid');
  });

  it('is silent outside a live wave', () => {
    const enemies = es('death');
    const at = (state: Game['state'], paused = false) => ambientDanger({ state, paused, enemies, levelIndex: 0 });
    expect(at('playing').danger).toBe('death');
    expect(at('playing', true).danger).toBe('none');
    for (const state of ['title', 'levelClear', 'gameOver'] as const) expect(at(state).danger).toBe('none');
  });

  it('drones during the wave and the level cards, and goes quiet on pause, title and game over', () => {
    const at = (state: Game['state'], paused = false) => ambientDanger({ state, paused, enemies: [], levelIndex: 0 }).bed;
    expect(at('playing')).toBe('play');
    expect(at('levelClear')).toBe('play');
    expect(at('playing', true)).toBe('off');
    expect(at('gameOver')).toBe('off');
    expect(at('title')).toBe('title');
  });

  it('counts the fraction of the wave still alive, ignoring mines and the dead', () => {
    const n = LEVELS[0].droids;
    expect(remainingFraction(es(...Array<EnemyKind>(n).fill('droid')), 0)).toBe(1);
    expect(remainingFraction([...es('droid', 'command', 'photon', 'vapor'), { kind: 'death', dead: true }], 0)).toBeCloseTo(2 / n);
    expect(remainingFraction([], 0)).toBe(0);
    // Later cycles have bigger waves (def.droids + 2 per cycle).
    expect(remainingFraction(es('droid'), LEVELS.length)).toBeCloseTo(1 / (n + 2));
  });
});

describe('danger pulse', () => {
  const kinds = ['droid', 'command', 'death'] as const;
  const fractions = [1, 0.75, 0.5, 0.25, 0];

  it('gets louder, higher and faster with danger', () => {
    for (const r of fractions) {
      for (let i = 1; i < kinds.length; i++) {
        const lo = pulseSettings(kinds[i - 1], r);
        const hi = pulseSettings(kinds[i], r);
        expect(hi.gain, `${kinds[i]} gain at ${r}`).toBeGreaterThan(lo.gain);
        expect(hi.rate, `${kinds[i]} rate at ${r}`).toBeGreaterThan(lo.rate);
        expect(hi.freq).toBeGreaterThan(lo.freq);
      }
    }
  });

  it('a lower danger never outdoes a higher one, however thin the wave', () => {
    for (let i = 1; i < kinds.length; i++) {
      const loMax = pulseSettings(kinds[i - 1], 0);
      const hiMin = pulseSettings(kinds[i], 1);
      expect(hiMin.gain).toBeGreaterThan(loMax.gain);
      expect(hiMin.rate).toBeGreaterThan(loMax.rate);
    }
  });

  it('speeds up and gets louder as the wave thins out', () => {
    for (const k of kinds) {
      for (let i = 1; i < fractions.length; i++) {
        const before = pulseSettings(k, fractions[i - 1]);
        const after = pulseSettings(k, fractions[i]);
        expect(after.rate).toBeGreaterThan(before.rate);
        expect(after.gain).toBeGreaterThanOrEqual(before.gain);
      }
    }
  });
});

describe('bit-crush curve', () => {
  it('is odd, monotone, clipped to ±1 and quantised to the bit depth', () => {
    const bits = SOUND.crush.bits;
    const c = crushCurve(bits, 1025);
    const step = 1 / 2 ** (bits - 1);
    expect(c[0]).toBe(-1);
    expect(c[c.length - 1]).toBe(1);
    expect(c[512]).toBe(0);
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]);
    for (const v of c) expect(Math.abs(v / step - Math.round(v / step))).toBeLessThan(1e-6);
    expect(new Set(c).size).toBe(2 ** bits + 1);
  });
});

// ---- A minimal stand-in for Web Audio that checks the scheduling is legal. ----

function checkTime(t: number) {
  if (!Number.isFinite(t) || t < 0) throw new RangeError(`bad time ${t}`);
}

class FakeParam {
  value = 0;
  setValueAtTime(v: number, t: number) {
    if (!Number.isFinite(v)) throw new RangeError(`bad value ${v}`);
    checkTime(t);
    this.value = v;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.setValueAtTime(v, t);
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    // Real browsers throw for a target of zero or below.
    if (!(v > 0)) throw new RangeError(`exponential ramp to ${v}`);
    this.setValueAtTime(v, t);
  }
  setTargetAtTime(v: number, t: number, c: number) {
    if (!(c > 0)) throw new RangeError(`bad time constant ${c}`);
    this.setValueAtTime(v, t);
  }
  cancelScheduledValues(t: number) {
    checkTime(t);
  }
}

class FakeNode {
  connect<T>(n: T): T {
    return n;
  }
  disconnect() {}
}

class FakeSource extends FakeNode {
  started = -1;
  start(t = 0) {
    checkTime(t);
    this.started = t;
  }
  stop(t = 0) {
    checkTime(t);
    if (t < this.started) throw new RangeError('stop before start');
  }
}

class FakeContext {
  currentTime = 0;
  sampleRate = 8000;
  state = 'running';
  destination = new FakeNode();
  oscillators = 0;
  sources = 0;
  createOscillator() {
    this.oscillators++;
    this.sources++;
    return Object.assign(new FakeSource(), { type: 'sine', frequency: new FakeParam() });
  }
  createBufferSource() {
    this.sources++;
    return Object.assign(new FakeSource(), { buffer: null, loop: false });
  }
  createGain() {
    return Object.assign(new FakeNode(), { gain: new FakeParam() });
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode(), { type: 'lowpass', frequency: new FakeParam(), Q: new FakeParam() });
  }
  createWaveShaper() {
    return Object.assign(new FakeNode(), { curve: null as Float32Array | null, oversample: 'none' });
  }
  createDynamicsCompressor() {
    return Object.assign(new FakeNode(), { threshold: new FakeParam(), ratio: new FakeParam() });
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    return Promise.resolve();
  }
}

function fakeEngine(storage = new Map<string, string>()) {
  const ctx = new FakeContext();
  const engine = new AudioEngine({
    createContext: () => ctx as unknown as AudioContext,
    storage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v) },
  });
  return { ctx, engine, storage };
}

const ALL_EVENTS: GameEvent[] = [
  ...(['ship', 'shot', 'enemy', 'mine'] as const).flatMap((source) =>
    [40, 200, 5000].map((impact) => ({ type: 'fieldHit', impact, source }) as const),
  ),
  { type: 'shipFire' },
  { type: 'shipKilled', x: 100, y: 100 },
  { type: 'hyperspace', fromX: 100, fromY: 100, toX: 400, toY: 300 },
  { type: 'enemyFire', kind: 'command' },
  { type: 'mineLaid', kind: 'photon' },
  { type: 'mineLaid', kind: 'vapor' },
  { type: 'promoted', to: 'command' },
  { type: 'promoted', to: 'death' },
  ...(['droid', 'command', 'death', 'photon', 'vapor'] as const).map((kind) => ({ type: 'enemyKilled', kind, x: 200, y: 200 }) as const),
  { type: 'extraLife' },
  { type: 'waveStart' },
  { type: 'waveCleared' },
  { type: 'gameOver' },
];

describe('audio engine (fake Web Audio)', () => {
  const amb = (danger: Danger, bed: Ambient['bed'] = 'play', remaining = 1): Ambient => ({ danger, remaining, bed });

  it('builds its voices and plays every event without illegal scheduling', () => {
    const { ctx, engine } = fakeEngine();
    engine.updateAmbient(amb('droid'), false); // before the context exists
    engine.unlock();
    for (const e of ALL_EVENTS) {
      ctx.currentTime += 0.1; // past the field-hit throttle
      const n = ctx.sources;
      engine.play(e);
      expect(ctx.sources - n, JSON.stringify(e)).toBeGreaterThan(0);
    }
    for (const d of ['none', 'droid', 'command', 'death', 'none'] as const) {
      for (const r of [1, 0.5, 0]) {
        ctx.currentTime += 0.5;
        engine.updateAmbient(amb(d, 'play', r), d === 'command');
      }
    }
    for (const bed of ['off', 'title', 'play', 'off'] as const) {
      ctx.currentTime += 0.5;
      engine.updateAmbient(amb('none', bed), false);
    }
  });

  it('ambient voices run continuously and are not rebuilt per frame', () => {
    const { ctx, engine } = fakeEngine();
    engine.unlock();
    const n = ctx.sources;
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < 100; i++) {
      ctx.currentTime += 1 / 60;
      engine.updateAmbient(amb(i < 50 ? 'droid' : 'death', i % 20 < 10 ? 'play' : 'off', 1 - i / 100), i % 2 === 0);
    }
    expect(ctx.sources).toBe(n);
  });

  it('plays the attract jingle on the title, soon after unlocking and then every 20 s', () => {
    const { ctx, engine } = fakeEngine();
    engine.unlock();
    const jingles: number[] = [];
    let n = ctx.sources;
    for (let t = 0; t < 45; t += 0.05) {
      ctx.currentTime = t;
      engine.updateAmbient(amb('none', 'title'), false);
      if (ctx.sources > n) jingles.push(t);
      n = ctx.sources;
    }
    expect(jingles.length).toBe(3);
    expect(jingles[0]).toBeCloseTo(SOUND.attract.first, 1);
    expect(jingles[1] - jingles[0]).toBeCloseTo(SOUND.attract.every, 1);
    // Not while playing, and not while muted.
    for (let t = 45; t < 90; t += 0.05) {
      ctx.currentTime = t;
      engine.updateAmbient(amb('droid', 'play'), false);
    }
    expect(ctx.sources).toBe(n);
    engine.setMuted(true);
    for (let t = 90; t < 130; t += 0.05) {
      ctx.currentTime = t;
      engine.updateAmbient(amb('none', 'title'), false);
    }
    expect(ctx.sources).toBe(n);
  });

  it('throttles field hits per source', () => {
    const { ctx, engine } = fakeEngine();
    engine.unlock();
    ctx.currentTime = 1;
    const hit = (source: 'ship' | 'shot') => engine.play({ type: 'fieldHit', impact: 300, source });
    const n0 = ctx.oscillators;
    hit('ship');
    const perShip = ctx.oscillators - n0;
    expect(perShip).toBeGreaterThan(0);
    hit('ship');
    expect(ctx.oscillators - n0).toBe(perShip);
    hit('shot'); // a different source isn't throttled
    const n1 = ctx.oscillators;
    expect(n1 - n0).toBeGreaterThan(perShip);
    ctx.currentTime += SOUND.hitThrottle + 0.001;
    hit('ship');
    expect(ctx.oscillators - n1).toBe(perShip);
  });

  it('M mutes, and the setting is remembered', () => {
    const { ctx, engine, storage } = fakeEngine();
    engine.unlock();
    engine.toggleMute();
    expect(engine.muted).toBe(true);
    const n = ctx.oscillators;
    engine.play({ type: 'shipFire' });
    expect(ctx.oscillators).toBe(n);
    expect(fakeEngine(storage).engine.muted).toBe(true);
    engine.toggleMute();
    expect(fakeEngine(storage).engine.muted).toBe(false);
  });

  it('survives storage that throws', () => {
    const bad = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const engine = new AudioEngine({ createContext: () => new FakeContext() as unknown as AudioContext, storage: bad });
    expect(engine.muted).toBe(false);
    engine.toggleMute();
    expect(engine.muted).toBe(true);
  });
});
