import type { EnemyKind } from './entities/enemies';

/** What hit a force field. */
export type HitSource = 'ship' | 'shot' | 'enemy' | 'mine';

/** A force-field hit hard enough to flash, recorded by `collideArena`. */
export interface ArenaHit {
  impact: number;
  source: HitSource;
}

/**
 * Things that happened during a `Game.update`, for the browser layer (sound)
 * to react to. `Game` only records them; it never plays anything itself, so
 * it stays free of DOM and audio APIs and tests can check what fired.
 */
export type GameEvent =
  | ({ type: 'fieldHit' } & ArenaHit)
  | { type: 'shipFire' }
  | { type: 'shipKilled' }
  | { type: 'hyperspace' }
  | { type: 'enemyFire'; kind: EnemyKind }
  | { type: 'mineLaid'; kind: 'photon' | 'vapor' }
  | { type: 'promoted'; to: 'command' | 'death' }
  | { type: 'enemyKilled'; kind: EnemyKind }
  | { type: 'extraLife' }
  | { type: 'waveStart' }
  | { type: 'waveCleared' }
  | { type: 'gameOver' };

/**
 * Events are dropped past this many, so a caller that never drains them
 * (a headless test, say) doesn't grow the list forever.
 */
export const MAX_PENDING_EVENTS = 256;
