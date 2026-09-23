import { describe, expect, it } from 'vitest';
import { N, radiusAt, sampleShape } from '../src/arena/shapes';

describe('shape radius functions', () => {
  it('rectangle: half-width on the x axis, corner distance on the diagonal', () => {
    const rect = { kind: 'rect', hw: 400, hh: 300 } as const;
    expect(radiusAt(rect, 0)).toBeCloseTo(400);
    expect(radiusAt(rect, Math.PI / 2)).toBeCloseTo(300);
    expect(radiusAt(rect, Math.atan2(300, 400))).toBeCloseTo(500);
  });

  it('circle is constant', () => {
    const s = sampleShape({ kind: 'circle', r: 123 });
    expect(s.length).toBe(N);
    expect(Math.min(...s)).toBeCloseTo(123);
    expect(Math.max(...s)).toBeCloseTo(123);
  });

  it('cross reaches its arms on the axes and its notch on the diagonal', () => {
    const cross = { kind: 'cross', armX: 490, armY: 360, halfWidth: 170 } as const;
    expect(radiusAt(cross, 0)).toBeCloseTo(490);
    expect(radiusAt(cross, Math.PI / 2)).toBeCloseTo(360);
    expect(radiusAt(cross, Math.PI / 4)).toBeCloseTo(170 * Math.SQRT2);
  });

  it('diamond and n-gon hit their vertices', () => {
    expect(radiusAt({ kind: 'diamond', rx: 500, ry: 375 }, 0)).toBeCloseTo(500);
    expect(radiusAt({ kind: 'diamond', rx: 500, ry: 375 }, Math.PI / 2)).toBeCloseTo(375);
    const hex = { kind: 'ngon', sides: 6, r: 100 } as const;
    expect(radiusAt(hex, 0)).toBeCloseTo(100);
    expect(radiusAt(hex, Math.PI / 6)).toBeCloseTo(100 * Math.cos(Math.PI / 6));
  });
});
