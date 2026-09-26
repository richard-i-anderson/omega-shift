import type { Arena } from '../arena/arena';
import { BONUS } from '../config';
import { collideArena, type Body } from '../physics/collide';
import type { EnemyKind } from './enemies';

/** An extra life, a points bonus, a smart bomb (B kills every enemy), or a shield (invincible for a while). */
export type BonusKind = 'life' | 'points' | 'bomb' | 'shield';

export interface Bonus extends Body {
  kind: BonusKind;
  prevX: number;
  prevY: number;
  /** Seconds since it was dropped. */
  age: number;
  dead: boolean;
}

export function makeBonus(kind: BonusKind, x: number, y: number): Bonus {
  return { kind, x, y, prevX: x, prevY: y, vx: 0, vy: 0, r: BONUS.radius, age: 0, dead: false };
}

/** Which bonus a ship of this kind leaves, by the weights in `BONUS`. */
export function pickBonusKind(from: keyof typeof BONUS.weights, rand: () => number = Math.random): BonusKind {
  const w = BONUS.weights[from];
  let roll = rand() * (w.points + w.bomb + w.life + w.shield);
  if ((roll -= w.life) < 0) return 'life';
  if ((roll -= w.bomb) < 0) return 'bomb';
  if ((roll -= w.shield) < 0) return 'shield';
  return 'points';
}

export function isBonusDropper(kind: EnemyKind): kind is 'droid' | 'command' | 'death' {
  return kind === 'droid' || kind === 'command' || kind === 'death';
}

/** Bonuses sit where they're dropped, but moving walls shove them; they then drift to a stop. */
export function updateBonus(b: Bonus, dt: number, arena: Arena): void {
  b.age += dt;
  if (b.age >= BONUS.life) b.dead = true;
  b.vx *= Math.exp(-3 * dt);
  b.vy *= Math.exp(-3 * dt);
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  collideArena(b, arena, 0.3);
}
