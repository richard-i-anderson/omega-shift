import type { Arena } from '../arena/arena';
import { ENEMY } from '../config';
import { clamp, normAngle, rand, TAU } from '../math/vec';
import { collideArena, type Body } from '../physics/collide';

/**
 * Droids circle the orbit track. One at a time they are promoted to Command
 * Ships (faster, shoot, lay photon mines), which eventually become free-flying
 * Death Ships (chase the player, lay vapor mines). Mines sit where they're laid.
 */
export type EnemyKind = 'droid' | 'command' | 'death' | 'photon' | 'vapor';

export interface Enemy extends Body {
  kind: EnemyKind;
  /** Angle along the orbit track (track-following kinds only). */
  theta: number;
  /** Resting radial offset from the track centre line. */
  lane: number;
  phase: number;
  age: number;
  fireTimer: number;
  dropTimer: number;
  jitterTimer: number;
  jx: number;
  jy: number;
  spin: number;
  dead: boolean;
}

export interface EnemyWorld {
  arena: Arena;
  /** Difficulty multiplier for speeds and timers. */
  scale: number;
  target: { x: number; y: number } | null;
  fire(x: number, y: number, tx: number, ty: number): void;
  layMine(kind: 'photon' | 'vapor', x: number, y: number): void;
}

export function isHunter(e: Enemy): boolean {
  return e.kind === 'command' || e.kind === 'death';
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
    phase: rand(0, TAU),
    age: 0,
    fireTimer: 0,
    dropTimer: 0,
    jitterTimer: 0,
    jx: 0,
    jy: 0,
    spin: rand(0, TAU),
    dead: false,
  };
}

export function makeDroid(arena: Arena, theta: number, lane = 0): Enemy {
  const p = arena.trackPoint(theta, lane);
  const e = baseEnemy('droid', p.x, p.y);
  e.theta = normAngle(theta);
  e.lane = lane;
  return e;
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

/** Move counter-clockwise (on screen) along the track, staying inside the corridor. */
function followTrack(e: Enemy, dt: number, speed: number, wobble: number, arena: Arena): void {
  const rt = arena.trackRadius(e.theta);
  e.theta = normAngle(e.theta - (speed * dt) / Math.max(rt, 50));
  e.phase += dt;
  const room = Math.max(0, arena.halfGap(e.theta) - e.r - 8);
  const off = clamp(e.lane + wobble * Math.sin(e.phase * 2.2), -room, room);
  const p = arena.trackPoint(e.theta, off);
  e.vx = (p.x - e.x) / dt;
  e.vy = (p.y - e.y) / dt;
  e.x = p.x;
  e.y = p.y;
}

export function updateEnemy(e: Enemy, dt: number, w: EnemyWorld): void {
  e.age += dt;
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
        if (w.target) w.fire(e.x, e.y, w.target.x, w.target.y);
        e.fireTimer = (ENEMY.commandFireEvery / w.scale) * rand(0.7, 1.3);
      }
      e.dropTimer -= dt;
      if (e.dropTimer <= 0) {
        w.layMine('photon', e.x, e.y);
        e.dropTimer = (ENEMY.commandDropEvery / w.scale) * rand(0.7, 1.3);
      }
      if (e.age > ENEMY.commandLifetime / w.scale) promote(e, w.scale);
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
      if (w.target) {
        const dx = w.target.x - e.x;
        const dy = w.target.y - e.y;
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
      collideArena(e, w.arena, 1);
      e.dropTimer -= dt;
      if (e.dropTimer <= 0) {
        w.layMine('vapor', e.x, e.y);
        e.dropTimer = (ENEMY.deathDropEvery / w.scale) * rand(0.7, 1.3);
      }
      break;
    }

    case 'photon':
    case 'vapor':
      // Mines stay put, but a moving wall can shove them; they then drift to a stop.
      e.spin += dt * (e.kind === 'vapor' ? 1.5 : 0);
      e.vx *= Math.exp(-3 * dt);
      e.vy *= Math.exp(-3 * dt);
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      collideArena(e, w.arena, 0.3);
      break;
  }
}
