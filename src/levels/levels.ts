import type { Keyframe } from '../arena/arena';
import type { ShapeSpec } from '../arena/shapes';

export interface LevelDef {
  name: string;
  keyframes: Keyframe[];
  /** Loop the keyframes forever (morphing levels). */
  loop: boolean;
  droids: number;
  speedScale: number;
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

const still = (outer: ShapeSpec, inner: ShapeSpec): Keyframe[] => [{ outer, inner, holdSec: 0, morphSec: 0 }];

export const LEVELS: LevelDef[] = [
  { name: 'CLASSIC', keyframes: still(OUTER_RECT, INNER_RECT), loop: false, droids: 5, speedScale: 1 },
  { name: 'RING', keyframes: still(OUTER_RING, INNER_RING), loop: false, droids: 6, speedScale: 1.05 },
  { name: 'CROSS', keyframes: still(OUTER_CROSS, INNER_SQUARE), loop: false, droids: 6, speedScale: 1.1 },
  { name: 'DIAMOND', keyframes: still(OUTER_DIAMOND, INNER_HEX), loop: false, droids: 7, speedScale: 1.15 },
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
    speedScale: 1.2,
  },
];

/** Level `index` counts from 0 and keeps going; the list repeats faster each cycle. */
export function levelFor(index: number): { def: LevelDef; scale: number; cycle: number } {
  const cycle = Math.floor(index / LEVELS.length);
  const def = LEVELS[index % LEVELS.length];
  return { def, scale: def.speedScale * (1 + 0.25 * cycle), cycle };
}
