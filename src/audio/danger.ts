import type { Enemy } from '../entities/enemies';
import type { GameState } from '../game';

/** How threatening the arena is right now; sets the background pulse. */
export type Danger = 'none' | 'droid' | 'command' | 'death';

export const DANGER_ORDER: readonly Danger[] = ['none', 'droid', 'command', 'death'];

/** Which background bed plays: the drone during play, the attract jingle on the title, or nothing. */
export type Bed = 'off' | 'title' | 'play';

/** Everything the background sound follows, worked out from the `Game` once per frame. */
export interface Ambient {
  danger: Danger;
  /** Fraction of the wave's ships still alive, 0..1; the pulse speeds up as it falls. */
  remaining: number;
  bed: Bed;
}

/** The most dangerous enemy alive. Mines don't count: they don't move. */
export function dangerLevel(enemies: readonly Pick<Enemy, 'kind' | 'dead'>[]): Danger {
  let rank = 0;
  for (const e of enemies) {
    if (e.dead) continue;
    const r = DANGER_ORDER.indexOf(e.kind as Danger);
    if (r > rank) rank = r;
  }
  return DANGER_ORDER[rank];
}

/** Live droids, command and death ships as a fraction of the wave's size (`Game.waveSize`). */
export function remainingFraction(enemies: readonly Pick<Enemy, 'kind' | 'dead'>[], wave: number): number {
  let alive = 0;
  for (const e of enemies) if (!e.dead && DANGER_ORDER.includes(e.kind as Danger)) alive++;
  return wave > 0 ? Math.min(1, alive / wave) : 0;
}

interface AmbientSource {
  state: GameState;
  paused: boolean;
  /** Ships in the current wave when it spawned. */
  waveSize: number;
  enemies: readonly Pick<Enemy, 'kind' | 'dead'>[];
}

/**
 * The background sound for this frame. The pulse only plays during a live wave
 * (silent on the title, level cards, pause and game over); the drone plays
 * during the wave and the level cards; the title gets the attract jingle.
 */
export function ambientDanger(g: AmbientSource): Ambient {
  const live = g.state === 'playing' && !g.paused;
  const bed: Bed = g.paused ? 'off' : g.state === 'title' ? 'title' : g.state === 'gameOver' ? 'off' : 'play';
  return {
    danger: live ? dangerLevel(g.enemies) : 'none',
    remaining: live ? remainingFraction(g.enemies, g.waveSize) : 1,
    bed,
  };
}
