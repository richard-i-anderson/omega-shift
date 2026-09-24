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
  | { kind: 'ngon'; sides: number; r: number; rot?: number }
  /**
   * Star with `points` tips. Tips sit on the ellipse (rx, ry), inner corners at
   * `valley` times that; one tip points along `rot`.
   */
  | { kind: 'star'; points: number; rx: number; ry: number; valley: number; rot?: number }
  /**
   * Maltese cross: four wedge-shaped arms that meet at a small hub, each ending
   * in a V notch. An arm's outer corners are `armX` (left/right arms) or `armY`
   * (up/down arms) from the centre, `halfAngle` either side of the arm's axis.
   * The arm sides are radial, so an inner field bigger than `hub` seals each
   * arm off into its own chamber.
   */
  | { kind: 'maltese'; armX: number; armY: number; halfAngle: number; notch: number; hub: number };

function rectRadius(c: number, s: number, hw: number, hh: number): number {
  const ac = Math.abs(c);
  const as = Math.abs(s);
  return Math.min(ac > 1e-9 ? hw / ac : Infinity, as > 1e-9 ? hh / as : Infinity);
}

const polar = (r: number, a: number): [number, number] => [r * Math.cos(a), r * Math.sin(a)];

function starPoints(s: Extract<ShapeSpec, { kind: 'star' }>): [number, number][] {
  return Array.from({ length: 2 * s.points }, (_, i) => {
    const a = (s.rot ?? 0) + (i * Math.PI) / s.points;
    const k = i % 2 === 0 ? 1 : s.valley;
    return [s.rx * k * Math.cos(a), s.ry * k * Math.sin(a)];
  });
}

function maltesePoints(s: Extract<ShapeSpec, { kind: 'maltese' }>): [number, number][] {
  const pts: [number, number][] = [];
  for (let arm = 0; arm < 4; arm++) {
    const axis = (arm * Math.PI) / 2;
    const len = arm % 2 === 0 ? s.armX : s.armY;
    const w = s.halfAngle;
    pts.push(
      polar(s.hub, axis - w),
      polar(len, axis - w),
      polar(len * Math.cos(w) - s.notch, axis),
      polar(len, axis + w),
      polar(s.hub, axis + w),
    );
  }
  return pts;
}

/** Distance along θ from the origin to a polygon that is star-shaped around it. */
function polygonRadius(pts: [number, number][], theta: number): number {
  const dx = Math.cos(theta);
  const dy = Math.sin(theta);
  let best = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    const ex = bx - ax;
    const ey = by - ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue; // edge lies along the ray
    const t = (ax * ey - ay * ex) / den;
    const u = (ax * dy - ay * dx) / den;
    if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.max(best, t);
  }
  return best;
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
    case 'star':
      return polygonRadius(starPoints(spec), theta);
    case 'maltese':
      return polygonRadius(maltesePoints(spec), theta);
  }
}

/** Sample a shape at N evenly spaced angles, starting at θ = 0. */
export function sampleShape(spec: ShapeSpec, n = N): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = radiusAt(spec, (i / n) * TAU);
  return out;
}
