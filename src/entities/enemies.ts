import type { Arena } from '../arena/arena';
import { ENEMY } from '../config';
import { clamp, normAngle, rand, TAU } from '../math/vec';
import type { GameEvent } from '../events';
import { collideArena, type Body } from '../physics/collide';

/**
 * Droids circle the orbit track. One at a time they are promoted to Command
 * Ships (faster, shoot, lay photon mines), which eventually become free-flying
 * Death Ships (chase the player, lay vapor mines). Mines sit where they're laid.
 * Tankers crawl the track the other way, take many hits, and keep launching
 * new ships until they're destroyed.
 */
export type EnemyKind = 'droid' | 'command' | 'death' | 'tanker' | 'photon' | 'vapor';
/** What a tanker can launch. */
export type SpawnKind = 'droid' | 'command' | 'death';

export interface Enemy extends Body {
  kind: EnemyKind;
  /** Angle along the orbit track (track-following kinds only). */
  theta: number;
  /** Resting radial offset from the track centre line. */
  lane: number;
  /** Direction along the track: 1 = counter-clockwise on screen. Flips at a chamber's end walls. */
  dir: number;
  phase: number;
  age: number;
  fireTimer: number;
  dropTimer: number;
  jitterTimer: number;
  jx: number;
  jy: number;
  spin: number;
  /** Hits left (tankers; 1 for everything else). */
  hp: number;
  maxHp: number;
  /** Seconds left of the white flash after a hit that didn't kill. */
  hitFlash: number;
  /** Seconds until a tanker launches its next ship. */
  spawnTimer: number;
  dead: boolean;
  /** Position before the latest step, for drawing in between steps. */
  prevX: number;
  prevY: number;
}

export interface EnemyWorld {
  arena: Arena;
  /** Difficulty multiplier for speeds and timers. */
  scale: number;
  target: { x: number; y: number } | null;
  fire(x: number, y: number, tx: number, ty: number): void;
  layMine(kind: 'photon' | 'vapor', x: number, y: number): void;
  /** A tanker launches a ship of `kind` from where it is. */
  spawn(kind: SpawnKind, from: Enemy): void;
  /** Report something that happened (for sound). */
  emit(e: GameEvent): void;
}

export function isHunter(e: Enemy): boolean {
  return e.kind === 'command' || e.kind === 'death';
}

/** Ships the wave is made of: everything but mines. The wave clears when none are left. */
export function isShip(e: Pick<Enemy, 'kind'>): boolean {
  return e.kind !== 'photon' && e.kind !== 'vapor';
}

export function isMine(e: Enemy): boolean {
  return e.kind === 'photon' || e.kind === 'vapor';
}

function baseEnemy(kind: EnemyKind, x: number, y: number): Enemy {
  return {
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    r: ENEMY.radius[kind],
    theta: 0,
    lane: 0,
    dir: 1,
    phase: rand(0, TAU),
    age: 0,
    fireTimer: 0,
    dropTimer: 0,
    jitterTimer: 0,
    jx: 0,
    jy: 0,
    spin: rand(0, TAU),
    hp: 1,
    maxHp: 1,
    hitFlash: 0,
    spawnTimer: 0,
    dead: false,
    prevX: x,
    prevY: y,
  };
}

export function makeDroid(arena: Arena, theta: number, lane = 0): Enemy {
  const p = arena.trackPoint(theta, lane);
  const e = baseEnemy('droid', p.x, p.y);
  e.theta = normAngle(theta);
  e.lane = lane;
  return e;
}

/** A tanker on the track at `theta`, crawling clockwise (against the droids). */
export function makeTanker(arena: Arena, theta: number, scale: number): Enemy {
  const p = arena.trackPoint(theta);
  const e = baseEnemy('tanker', p.x, p.y);
  e.theta = normAngle(theta);
  e.dir = -1;
  e.hp = e.maxHp = Math.round(ENEMY.tankerHp * scale);
  e.spawnTimer = tankerSpawnDelay(scale) * rand(0.6, 1);
  return e;
}

function tankerSpawnDelay(scale: number): number {
  return rand(ENEMY.tankerSpawnEvery[0], ENEMY.tankerSpawnEvery[1]) / scale;
}

/** Which ship a tanker launches next, by `ENEMY.tankerSpawnWeights`. */
export function pickSpawnKind(rng: () => number = Math.random): SpawnKind {
  const w = ENEMY.tankerSpawnWeights;
  let roll = rng() * (w.droid + w.command + w.death);
  if ((roll -= w.death) < 0) return 'death';
  if ((roll -= w.command) < 0) return 'command';
  return 'droid';
}

export function makeMine(kind: 'photon' | 'vapor', x: number, y: number): Enemy {
  return baseEnemy(kind, x, y);
}

export function promote(e: Enemy, scale: number): void {
  if (e.kind === 'droid') {
    e.kind = 'command';
    e.age = 0;
    e.fireTimer = (ENEMY.commandFireEvery / scale) * rand(0.5, 1);
    e.dropTimer = (ENEMY.commandDropEvery / scale) * rand(0.5, 1);
  } else if (e.kind === 'command') {
    e.kind = 'death';
    e.age = 0;
    e.dropTimer = (ENEMY.deathDropEvery / scale) * rand(0.5, 1);
  }
  e.r = ENEMY.radius[e.kind];
}

/**
 * Move along the track (counter-clockwise on screen unless turned back),
 * staying inside the corridor. In a chamber, turn back before the end wall.
 */
function followTrack(e: Enemy, dt: number, speed: number, wobble: number, arena: Arena): void {
  // Track length per radian here, so the speed is constant along the track
  // (long flat walls far from the centre would otherwise bunch enemies up).
  const p0 = arena.trackPoint(e.theta - 0.01);
  const p1 = arena.trackPoint(e.theta + 0.01);
  const perRad = Math.max(Math.hypot(p1.x - p0.x, p1.y - p0.y) / 0.02, 50);
  const ahead = e.theta - e.dir * ((e.r + 14) / perRad);
  if (arena.halfGap(ahead) < e.r + 4) e.dir = -e.dir;
  e.theta = normAngle(e.theta - e.dir * ((speed * dt) / perRad));
  e.phase += dt;
  const room = Math.max(0, arena.halfGap(e.theta) - e.r - 8);
  const off = clamp(e.lane + wobble * Math.sin(e.phase * 2.2), -room, room);
  const p = arena.trackPoint(e.theta, off);
  e.vx = (p.x - e.x) / dt;
  e.vy = (p.y - e.y) / dt;
  e.x = p.x;
  e.y = p.y;
}

/** The target, if it's in the same chamber as the enemy (always, on a connected level). */
function visibleTarget(e: Enemy, w: EnemyWorld): { x: number; y: number } | null {
  const t = w.target;
  if (!t || w.arena.isRing) return t;
  return w.arena.chamberAtPoint(e.x, e.y) === w.arena.chamberAtPoint(t.x, t.y) ? t : null;
}

export function updateEnemy(e: Enemy, dt: number, w: EnemyWorld): void {
  e.age += dt;
  e.hitFlash = Math.max(0, e.hitFlash - dt);
  const target = visibleTarget(e, w);
  switch (e.kind) {
    case 'droid':
      e.spin += dt * 2;
      followTrack(e, dt, ENEMY.droidSpeed * w.scale, 0, w.arena);
      break;

    case 'command':
      e.spin += dt * 3;
      followTrack(e, dt, ENEMY.commandSpeed * w.scale, 30, w.arena);
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) {
        if (target) {
          w.fire(e.x, e.y, target.x, target.y);
          w.emit({ type: 'enemyFire', kind: e.kind });
        }
        e.fireTimer = (ENEMY.commandFireEvery / w.scale) * rand(0.7, 1.3);
      }
      e.dropTimer -= dt;
      if (e.dropTimer <= 0) {
        w.layMine('photon', e.x, e.y);
        e.dropTimer = (ENEMY.commandDropEvery / w.scale) * rand(0.7, 1.3);
      }
      if (e.age > ENEMY.commandLifetime / w.scale) {
        promote(e, w.scale);
        w.emit({ type: 'promoted', to: 'death' });
      }
      break;

    case 'death': {
      e.spin += dt * 8;
      e.jitterTimer -= dt;
      if (e.jitterTimer <= 0) {
        const a = rand(0, TAU);
        e.jx = Math.cos(a);
        e.jy = Math.sin(a);
        e.jitterTimer = rand(0.25, 0.6);
      }
      let ax = e.jx * 0.9;
      let ay = e.jy * 0.9;
      if (target) {
        const dx = target.x - e.x;
        const dy = target.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        ax += dx / d;
        ay += dy / d;
      }
      const accel = ENEMY.deathAccel * w.scale;
      e.vx += ax * accel * dt;
      e.vy += ay * accel * dt;
      const max = ENEMY.deathSpeed * w.scale;
      const s = Math.hypot(e.vx, e.vy);
      if (s > max) {
        e.vx *= max / s;
        e.vy *= max / s;
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      collideArena(e, w.arena, 1, 'enemy');
      e.dropTimer -= dt;
      if (e.dropTimer <= 0) {
        w.layMine('vapor', e.x, e.y);
        e.dropTimer = (ENEMY.deathDropEvery / w.scale) * rand(0.7, 1.3);
      }
      break;
    }

    case 'tanker':
      e.spin += dt * 0.8;
      followTrack(e, dt, ENEMY.tankerSpeed * w.scale, 12, w.arena);
      e.spawnTimer -= dt;
      if (e.spawnTimer <= 0) {
        w.spawn(pickSpawnKind(), e);
        e.spawnTimer = tankerSpawnDelay(w.scale);
      }
      break;

    case 'photon':
    case 'vapor':
      // Mines stay put, but a moving wall can shove them; they then drift to a stop.
      e.spin += dt * (e.kind === 'vapor' ? 1.5 : 0);
      e.vx *= Math.exp(-3 * dt);
      e.vy *= Math.exp(-3 * dt);
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      collideArena(e, w.arena, 0.3, 'mine');
      break;
  }
}
