// Force-field shapes are star-shaped curves around the arena centre, described
// as a radius function r(θ). Angles use screen coordinates: x = cos θ, y = sin θ.

import { TAU } from '../math/vec';

/** Number of radius samples per force field. */
export const N = 720;

export type ShapeSpec =
  | { kind: 'circle'; r: number }
  | { kind: 'ellipse'; rx: number; ry: number }
  /** Axis-aligned rectangle given by half-extents, optionally rotated. */
  | { kind: 'rect'; hw: number; hh: number; rot?: number }
  /** Rhombus with vertices on the (rotated) axes at ±rx and ±ry. */
  | { kind: 'diamond'; rx: number; ry: number; rot?: number }
  /** Plus sign: a horizontal bar reaching ±armX and a vertical bar reaching ±armY. */
  | { kind: 'cross'; armX: number; armY: number; halfWidth: number; rot?: number }
  /** Regular polygon with circumradius r; one vertex points along `rot`. */
  | { kind: 'ngon'; sides: number; r: number; rot?: number };

function rectRadius(c: number, s: number, hw: number, hh: number): number {
  const ac = Math.abs(c);
  const as = Math.abs(s);
  return Math.min(ac > 1e-9 ? hw / ac : Infinity, as > 1e-9 ? hh / as : Infinity);
}

export function radiusAt(spec: ShapeSpec, theta: number): number {
  switch (spec.kind) {
    case 'circle':
      return spec.r;
    case 'ellipse': {
      const c = Math.cos(theta) / spec.rx;
      const s = Math.sin(theta) / spec.ry;
      return 1 / Math.sqrt(c * c + s * s);
    }
    case 'rect': {
      const a = theta - (spec.rot ?? 0);
      return rectRadius(Math.cos(a), Math.sin(a), spec.hw, spec.hh);
    }
    case 'diamond': {
      const a = theta - (spec.rot ?? 0);
      return 1 / (Math.abs(Math.cos(a)) / spec.rx + Math.abs(Math.sin(a)) / spec.ry);
    }
    case 'cross': {
      const a = theta - (spec.rot ?? 0);
      const c = Math.cos(a);
      const s = Math.sin(a);
      return Math.max(
        rectRadius(c, s, spec.armX, spec.halfWidth),
        rectRadius(c, s, spec.halfWidth, spec.armY),
      );
    }
    case 'ngon': {
      const seg = TAU / spec.sides;
      let local = (theta - (spec.rot ?? 0)) % seg;
      if (local < 0) local += seg;
      const apothem = spec.r * Math.cos(Math.PI / spec.sides);
      return apothem / Math.cos(local - Math.PI / spec.sides);
    }
  }
}

/** Sample a shape at N evenly spaced angles, starting at θ = 0. */
export function sampleShape(spec: ShapeSpec, n = N): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = radiusAt(spec, (i / n) * TAU);
  return out;
}
