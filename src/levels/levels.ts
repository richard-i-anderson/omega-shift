import { validateKeyframes, type Keyframe, type Motion } from '../arena/arena';
import type { ShapeSpec } from '../arena/shapes';
import { ARENA, WORLD } from '../config';

export interface LevelDef {
  name: string;
  keyframes: Keyframe[];
  /** Loop the keyframes forever (morphing levels). */
  loop: boolean;
  droids: number;
  speedScale: number;
  /**
   * Where the score is drawn, when the play area leaves no room for it inside
   * the inner field. It moves there (and the inner field shrinks away) as the
   * arena morphs into the level. Default: the arena centre.
   */
  scoreAt?: { x: number; y: number };
  /** Spinning and breathing on top of the keyframes (see `Motion`). */
  motion?: Motion;
}

// Shapes are in the 1024×768 world, centred on (512, 384).
const OUTER_RECT: ShapeSpec = { kind: 'rect', hw: 490, hh: 360 };
const INNER_RECT: ShapeSpec = { kind: 'rect', hw: 150, hh: 75 };
const OUTER_RING: ShapeSpec = { kind: 'circle', r: 365 };
const INNER_RING: ShapeSpec = { kind: 'circle', r: 110 };
const OUTER_CROSS: ShapeSpec = { kind: 'cross', armX: 490, armY: 360, halfWidth: 170 };
const INNER_SQUARE: ShapeSpec = { kind: 'rect', hw: 75, hh: 75 };
const OUTER_DIAMOND: ShapeSpec = { kind: 'diamond', rx: 500, ry: 375 };
const INNER_HEX: ShapeSpec = { kind: 'ngon', sides: 6, r: 110 };
const OUTER_BAR: ShapeSpec = { kind: 'rect', hw: 490, hh: 125 };
const OUTER_PILLAR: ShapeSpec = { kind: 'rect', hw: 125, hh: 360 };
const NO_INNER: ShapeSpec = { kind: 'circle', r: 0 };
const UP = -Math.PI / 2;
const OUTER_STAR: ShapeSpec = { kind: 'star', points: 5, rx: 470, ry: 375, valley: 0.5, rot: UP };
const INNER_STAR: ShapeSpec = { kind: 'star', points: 5, rx: 170, ry: 150, valley: 0.5, rot: UP };
const OUTER_MALTESE: ShapeSpec = { kind: 'maltese', armX: 520, armY: 420, halfAngle: (28 * Math.PI) / 180, notch: 60, hub: 40 };
// Bigger than the Maltese hub, so it seals each arm off into its own chamber.
const INNER_HUB: ShapeSpec = { kind: 'circle', r: 90 };
// Spinning outers must fit inside the screen's half-height (384) at every angle.
const SPIN_STAR: ShapeSpec = { kind: 'star', points: 5, rx: 360, ry: 360, valley: 0.66, rot: UP };
const SPIN_HEX: ShapeSpec = { kind: 'ngon', sides: 6, r: 92 };
const VORTEX_CROSS: ShapeSpec = { kind: 'cross', armX: 330, armY: 330, halfWidth: 180 };
const VORTEX_SQUARE: ShapeSpec = { kind: 'rect', hw: 78, hh: 78 };
const VORTEX_OCTAGON: ShapeSpec = { kind: 'ngon', sides: 8, r: 370, rot: Math.PI / 8 };
const VORTEX_STAR: ShapeSpec = { kind: 'star', points: 4, rx: 115, ry: 115, valley: 0.65 };

const still = (outer: ShapeSpec, inner: ShapeSpec): Keyframe[] => [{ outer, inner, holdSec: 0, morphSec: 0 }];

export const LEVELS: LevelDef[] = [
  { name: 'CLASSIC', keyframes: still(OUTER_RECT, INNER_RECT), loop: false, droids: 5, speedScale: 1 },
  { name: 'RING', keyframes: still(OUTER_RING, INNER_RING), loop: false, droids: 6, speedScale: 1.05 },
  { name: 'CROSS', keyframes: still(OUTER_CROSS, INNER_SQUARE), loop: false, droids: 6, speedScale: 1.1 },
  { name: 'DIAMOND', keyframes: still(OUTER_DIAMOND, INNER_HEX), loop: false, droids: 7, speedScale: 1.15 },
  // A turning star around a counter-turning, breathing hexagon.
  {
    name: 'SPIN',
    keyframes: still(SPIN_STAR, SPIN_HEX),
    loop: false,
    droids: 7,
    speedScale: 1.15,
    motion: { outerSpin: 0.25, innerSpin: -0.4, breathe: { outer: 0.04, inner: -0.1, period: 6 } },
  },
  {
    name: 'BAR',
    keyframes: still(OUTER_BAR, NO_INNER),
    loop: false,
    droids: 6,
    speedScale: 1.15,
    scoreAt: { x: 512, y: 92 },
  },
  {
    name: 'PILLAR',
    keyframes: still(OUTER_PILLAR, NO_INNER),
    loop: false,
    droids: 6,
    speedScale: 1.2,
    scoreAt: { x: 196, y: 384 },
  },
  { name: 'STAR', keyframes: still(OUTER_STAR, INNER_STAR), loop: false, droids: 7, speedScale: 1.2 },
  // Four chambers: hyperspace (H) is the only way between them.
  { name: 'MALTESE', keyframes: still(OUTER_MALTESE, INNER_HUB), loop: false, droids: 9, speedScale: 1.25 },
  // Spinning, breathing and changing shape at once: a cross that becomes an octagon.
  {
    name: 'VORTEX',
    keyframes: [
      { outer: VORTEX_CROSS, inner: VORTEX_SQUARE, holdSec: 4, morphSec: 3 },
      { outer: VORTEX_OCTAGON, inner: VORTEX_STAR, holdSec: 4, morphSec: 3 },
    ],
    loop: true,
    droids: 9,
    speedScale: 1.3,
    motion: { outerSpin: 0.45, innerSpin: -0.6, breathe: { outer: 0.02, inner: -0.08, period: 4 } },
  },
  {
    name: 'SHIFT',
    keyframes: [
      { outer: OUTER_RECT, inner: INNER_RECT, holdSec: 5, morphSec: 3 },
      { outer: OUTER_RING, inner: INNER_RING, holdSec: 4, morphSec: 3 },
      { outer: OUTER_CROSS, inner: INNER_SQUARE, holdSec: 5, morphSec: 3 },
      { outer: OUTER_RING, inner: INNER_HEX, holdSec: 4, morphSec: 3 },
    ],
    loop: true,
    droids: 8,
    speedScale: 1.35,
  },
];

/** Level `index` counts from 0 and keeps going; the list repeats faster each cycle. */
export function levelFor(index: number): { def: LevelDef; scale: number; cycle: number } {
  const cycle = Math.floor(index / LEVELS.length);
  const def = LEVELS[index % LEVELS.length];
  return { def, scale: def.speedScale * (1 + 0.25 * cycle), cycle };
}

/** Problems with a level's shapes (empty if it's playable). */
export function validateLevel(def: LevelDef): string[] {
  return validateKeyframes(def.keyframes, ARENA.minGap, ARENA.minInnerRadius, {
    scoreOutside: !!def.scoreAt,
    motion: def.motion,
    fit: { hw: WORLD.w / 2, hh: WORLD.h / 2 },
  });
}
