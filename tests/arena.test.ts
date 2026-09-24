import { describe, expect, it } from 'vitest';
import { Arena, validateKeyframes, type Keyframe } from '../src/arena/arena';
import { LEVELS, validateLevel } from '../src/levels/levels';

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

  it('allows no inner field when the score is shown outside', () => {
    const kf = [{ outer: CIRCLE, inner: { kind: 'circle', r: 0 } as const, holdSec: 0, morphSec: 0 }];
    expect(validateKeyframes(kf, 100, 60)).toHaveLength(1);
    expect(validateKeyframes(kf, 100, 60, { scoreOutside: true })).toEqual([]);
  });

  it('rejects a chambered keyframe in a morph', () => {
    const chambered = { outer: MALTESE, inner: HUB, holdSec: 1, morphSec: 1 };
    expect(validateKeyframes([chambered], 100, 60)).toEqual([]);
    expect(validateKeyframes([chambered, { outer: CIRCLE, inner: SMALL, holdSec: 1, morphSec: 1 }], 100, 60)).toHaveLength(1);
  });

  it('rejects a chamber too narrow to fly in', () => {
    const thin = { ...MALTESE, halfAngle: 0.1 };
    const errors = validateKeyframes([{ outer: thin, inner: HUB, holdSec: 0, morphSec: 0 }], 100, 60);
    expect(errors.some((e) => e.includes('chamber'))).toBe(true);
  });

  it.each(LEVELS.map((l) => [l.name, l] as const))('built-in level %s is valid', (_, lvl) => {
    expect(validateLevel(lvl)).toEqual([]);
  });
});

const MALTESE = { kind: 'maltese', armX: 400, armY: 300, halfAngle: Math.PI / 6, notch: 50, hub: 40 } as const;
const HUB = { kind: 'circle', r: 80 } as const;

describe('chambers', () => {
  it('a connected corridor is one ring', () => {
    const a = new Arena(0, 0, [{ outer: RECT, inner: SMALL, holdSec: 0, morphSec: 0 }], false);
    expect(a.isRing).toBe(true);
    expect(a.chamberAt(1.234)).toBe(0);
  });

  it('an inner field past the Maltese hub seals off four arms, in clockwise order', () => {
    const a = new Arena(0, 0, [{ outer: MALTESE, inner: HUB, holdSec: 0, morphSec: 0 }], false);
    expect(a.isRing).toBe(false);
    expect(a.chambers).toHaveLength(4);
    expect(a.chamberAt(Math.PI / 4)).toBe(-1);
    const arms = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((t) => a.chamberAt(t));
    expect(new Set(arms).size).toBe(4);
    // Next chamber clockwise on screen = next index (mod 4).
    for (let i = 0; i < 4; i++) expect(arms[(i + 1) % 4]).toBe((arms[i] + 1) % 4);
    expect(a.chamberAt(a.chamberAngle(arms[2]))).toBe(arms[2]);
  });

  it('openAngle finds the nearest arm from a closed angle', () => {
    const a = new Arena(0, 0, [{ outer: MALTESE, inner: HUB, holdSec: 0, morphSec: 0 }], false);
    const theta = a.openAngle(Math.PI / 4 - 0.1, 20);
    expect(a.chamberAt(theta)).toBe(a.chamberAt(0));
    expect(a.halfGap(theta)).toBeGreaterThanOrEqual(20);
  });
});
