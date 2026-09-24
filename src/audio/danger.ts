import type { Enemy } from '../entities/enemies';
import type { GameState } from '../game';

/** How threatening the arena is right now; sets the background pulse. */
export type Danger = 'none' | 'droid' | 'command' | 'death';

export const DANGER_ORDER: readonly Danger[] = ['none', 'droid', 'command', 'death'];

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

/** The pulse only plays during a live wave: silent on the title, level cards, pause and game over. */
export function ambientDanger(g: { state: GameState; paused: boolean; enemies: readonly Enemy[] }): Danger {
  return g.state === 'playing' && !g.paused ? dangerLevel(g.enemies) : 'none';
}
