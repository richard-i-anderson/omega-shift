import { COS, DTHETA, ForceField, SIN } from '../arena/field';
import { N } from '../arena/shapes';
import type { Arena } from '../arena/arena';
import { ARENA } from '../config';
import { normAngle } from '../math/vec';

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface FieldHit {
  field: ForceField;
  edge: number;
  /** Speed into the wall (relative to the wall) at impact, px/s. */
  impact: number;
}

interface Closest {
  d: number;
  edge: number;
  /** Position along the edge, 0..1. */
  t: number;
  qx: number;
  qy: number;
  /** Unit normal of the edge, pointing to the allowed side. */
  sx: number;
  sy: number;
}

/** The closest point to (x, y) on edges i0-k .. i0+k of `f`, if nearer than `maxD`. */
function closestOnField(f: ForceField, x: number, y: number, i0: number, k: number, maxD: number): Closest | null {
  let best: Closest | null = null;
  let minD = maxD;
  for (let o = -k; o <= k; o++) {
    const a = (((i0 + o) % N) + N) % N;
    const c = (a + 1) % N;
    const ax = f.xs[a];
    const ay = f.ys[a];
    const ex = f.xs[c] - ax;
    const ey = f.ys[c] - ay;
    const len2 = ex * ex + ey * ey;
    if (len2 < 1e-9) continue;
    let t = ((x - ax) * ex + (y - ay) * ey) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + ex * t;
    const qy = ay + ey * t;
    const d = Math.hypot(x - qx, y - qy);
    if (d >= minD) continue;
    minD = d;
    // Vertices run counter-clockwise in math orientation, so the interior is on the left.
    const len = Math.sqrt(len2);
    const outer = f.side === 'outer';
    best = { d, edge: a, t, qx, qy, sx: outer ? -ey / len : ey / len, sy: outer ? ex / len : -ex / len };
  }
  return best;
}

/** How many edges either side of the body's angle to search to reach `reach` pixels away. */
function windowFor(reach: number, dist: number): number {
  const span = Math.asin(Math.min(1, reach / Math.max(dist, 1)));
  return Math.min(N >> 1, Math.ceil(span / DTHETA) + 2);
}

/**
 * Keeps a circular body on the allowed side of a force field and bounces it.
 *
 * 1. If the centre has crossed the polygon (fast body, or a wall moved over it),
 *    move it to the nearest point on the boundary, just on the allowed side.
 *    Nearest point rather than along the ray from the centre, because a
 *    chamber's dividing walls are radial and must push bodies sideways.
 * 2. Find the deepest contact among edges in a small angular window around the
 *    body, push the body out, and reflect its velocity relative to the wall's
 *    velocity there, so moving walls shove things along. Repeat (up to 3 times)
 *    so corners that touch two edges get both pushes.
 *
 * Returns the hardest impact, or null if the body wasn't moving into a wall.
 */
export function collideField(b: Body, f: ForceField, restitution: number): FieldHit | null {
  const outer = f.side === 'outer';
  let dist = Math.hypot(b.x - f.cx, b.y - f.cy);
  let i0 = Math.floor(normAngle(Math.atan2(b.y - f.cy, b.x - f.cx)) / DTHETA) % N;
  const rPoly = f.polyRadiusAt(normAngle(Math.atan2(b.y - f.cy, b.x - f.cx)));

  if (outer ? dist > rPoly : dist < rPoly) {
    // Search wide enough to reach the wall along the ray, which bounds the true distance.
    const pen = Math.abs(dist - rPoly);
    const c = closestOnField(f, b.x, b.y, i0, windowFor(b.r + pen + 1, dist), Infinity);
    if (c) {
      const ux = c.d > 1e-4 ? (c.qx - b.x) / c.d : c.sx;
      const uy = c.d > 1e-4 ? (c.qy - b.y) / c.d : c.sy;
      b.x = c.qx + ux * 0.01;
      b.y = c.qy + uy * 0.01;
      dist = Math.hypot(b.x - f.cx, b.y - f.cy);
      i0 = Math.floor(normAngle(Math.atan2(b.y - f.cy, b.x - f.cx)) / DTHETA) % N;
    }
  }

  const k = windowFor(b.r + 1, dist);
  let best: FieldHit | null = null;

  // Resolve the deepest contact first (the true closest point on the polygon),
  // then re-check, so corners touching two edges get both pushes.
  for (let iter = 0; iter < 3; iter++) {
    const c = closestOnField(f, b.x, b.y, i0, k, b.r);
    if (!c) break;
    // Centre on the edge: use the edge normal pointing to the allowed side.
    const cnx = c.d > 1e-4 ? (b.x - c.qx) / c.d : c.sx;
    const cny = c.d > 1e-4 ? (b.y - c.qy) / c.d : c.sy;
    const push = b.r - c.d;
    b.x += cnx * push;
    b.y += cny * push;

    const ca = c.edge;
    const cc = (ca + 1) % N;
    const ct = c.t;
    const wx = (1 - ct) * f.vel[ca] * COS[ca] + ct * f.vel[cc] * COS[cc];
    const wy = (1 - ct) * f.vel[ca] * SIN[ca] + ct * f.vel[cc] * SIN[cc];
    const vn = (b.vx - wx) * cnx + (b.vy - wy) * cny;
    if (vn < 0) {
      b.vx -= (1 + restitution) * vn * cnx;
      b.vy -= (1 + restitution) * vn * cny;
      if (!best || -vn > best.impact) best = { field: f, edge: ca, impact: -vn };
    }
  }
  return best;
}

const harder = (a: FieldHit | null, b: FieldHit | null): FieldHit | null =>
  a && b ? (a.impact >= b.impact ? a : b) : (a ?? b);

/**
 * Collide against both fields, flashing any wall hit hard enough. Where the two
 * fields meet (chamber corners, or a corridor pinching shut mid-morph) one
 * field's push can land the body in the other, so it retries once, and as a
 * last resort moves the body to the nearest open stretch of track.
 */
export function collideArena(b: Body, arena: Arena, restitution: number = ARENA.restitution): FieldHit | null {
  let best: FieldHit | null = null;
  for (let pass = 0; pass < 2; pass++) {
    const h1 = collideField(b, arena.outer, restitution);
    const h2 = collideField(b, arena.inner, restitution);
    for (const h of [h1, h2]) {
      if (h && h.impact >= ARENA.flashImpact) h.field.flashEdge(h.edge);
    }
    best = harder(best, harder(h1, h2));
    if (arena.contains(b.x, b.y)) return best;
  }
  const theta = arena.openAngle(Math.atan2(b.y - arena.cy, b.x - arena.cx), b.r + 2);
  const p = arena.trackPoint(theta);
  b.x = p.x;
  b.y = p.y;
  return best;
}
