import type { EnemyKind, SpawnKind } from './entities/enemies';
import type { BonusKind } from './entities/bonus';

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
  | { type: 'shipKilled'; x: number; y: number }
  | { type: 'hyperspace'; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'enemyFire'; kind: EnemyKind }
  | { type: 'mineLaid'; kind: 'photon' | 'vapor' }
  | { type: 'promoted'; to: 'command' | 'death' }
  /** A tanker took a hit and survived, with `hp` hits left. */
  | { type: 'tankerHit'; x: number; y: number; hp: number }
  /** A tanker launched a ship. */
  | { type: 'tankerSpawn'; kind: SpawnKind; x: number; y: number }
  /** `bombed`: killed by a smart bomb, which has its own sound. */
  | { type: 'enemyKilled'; kind: EnemyKind; x: number; y: number; bombed?: boolean }
  | { type: 'bonusDropped'; kind: BonusKind; x: number; y: number }
  | { type: 'bonusCollected'; kind: BonusKind; x: number; y: number }
  | { type: 'smartBomb'; x: number; y: number }
  /** The shield has `left` whole seconds to go (the last few only). */
  | { type: 'shieldTick'; left: number }
  | { type: 'shieldDown' }
  | { type: 'extraLife' }
  | { type: 'waveStart' }
  | { type: 'waveCleared' }
  | { type: 'gameOver' };

/**
 * Events are dropped past this many, so a caller that never drains them
 * (a headless test, say) doesn't grow the list forever.
 */
export const MAX_PENDING_EVENTS = 256;
