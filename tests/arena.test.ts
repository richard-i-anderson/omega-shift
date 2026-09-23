import { describe, expect, it } from 'vitest';
import { Arena, validateKeyframes, type Keyframe } from '../src/arena/arena';
import { ARENA } from '../src/config';
import { LEVELS } from '../src/levels/levels';

const RECT = { kind: 'rect', hw: 400, hh: 300 } as const;
const CIRCLE = { kind: 'circle', r: 300 } as const;
const SMALL = { kind: 'circle', r: 80 } as const;

describe('arena timeline', () => {
  const kfs: Keyframe[] = [
    { outer: RECT, inner: SMALL, holdSec: 1, morphSec: 2 },
    { outer: CIRCLE, inner: SMALL, holdSec: 1, morphSec: 2 },
  ];

  it('holds the first keyframe, then morphs to the second', () => {
    const a = new Arena(0, 0, kfs, true);
    expect(a.outer.radii[0]).toBeCloseTo(400);
    a.update(0.5);
    expect(a.outer.radii[0]).toBeCloseTo(400);
    expect(a.moving).toBe(false);
    a.update(1.5); // t = 2: halfway through the morph
    expect(a.moving).toBe(true);
    expect(a.outer.radii[0]).toBeCloseTo(350);
    expect(a.outer.vel[0]).toBeLessThan(0);
    a.update(1.0); // t = 3: morph complete
    expect(a.outer.radii[0]).toBeCloseTo(300);
  });

  it('loops back to the first keyframe', () => {
    const a = new Arena(0, 0, kfs, true);
    a.update(6); // one full cycle
    expect(a.outer.radii[0]).toBeCloseTo(400);
  });

  it('track sits halfway between the fields', () => {
    const a = new Arena(0, 0, kfs, false);
    expect(a.trackRadius(0)).toBeCloseTo(240);
    expect(a.halfGap(0)).toBeCloseTo(160);
  });

  it('transition blends from the old shape to the new level', () => {
    const a = new Arena(0, 0, [{ outer: RECT, inner: SMALL, holdSec: 0, morphSec: 0 }], false);
    a.setLevel([{ outer: CIRCLE, inner: SMALL, holdSec: 0, morphSec: 0 }], false, 2);
    a.update(1);
    expect(a.outer.radii[0]).toBeCloseTo(350);
    a.update(1.5);
    expect(a.outer.radii[0]).toBeCloseTo(300);
  });
});

describe('level validation', () => {
  it('rejects a corridor that is too narrow', () => {
    const bad = [{ outer: CIRCLE, inner: { kind: 'circle', r: 250 } as const, holdSec: 0, morphSec: 0 }];
    expect(validateKeyframes(bad, 100, 60)).toHaveLength(1);
  });

  it('rejects an inner field too small for the score', () => {
    const bad = [{ outer: CIRCLE, inner: { kind: 'circle', r: 30 } as const, holdSec: 0, morphSec: 0 }];
    expect(validateKeyframes(bad, 100, 60)).toHaveLength(1);
  });

  it.each(LEVELS.map((l) => [l.name, l] as const))('built-in level %s is valid', (_, lvl) => {
    expect(validateKeyframes(lvl.keyframes, ARENA.minGap, ARENA.minInnerRadius)).toEqual([]);
  });
});
