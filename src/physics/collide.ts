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

/**
 * Keeps a circular body on the allowed side of a force field and bounces it.
 *
 * 1. If the centre has crossed the polygon (fast body, or a wall moved over it),
 *    snap it back onto the boundary along its ray from the arena centre.
 * 2. Test edges in a small angular window around the body. For each touching
 *    edge, push the body out and reflect its velocity relative to the wall's
 *    velocity at the contact, so moving walls shove things along.
 *
 * Returns the hardest impact, or null if the body wasn't moving into a wall.
 */
export function collideField(b: Body, f: ForceField, restitution: number): FieldHit | null {
  const outer = f.side === 'outer';
  let dx = b.x - f.cx;
  let dy = b.y - f.cy;
  let dist = Math.hypot(dx, dy);
  const theta = normAngle(Math.atan2(dy, dx));
  const i0 = Math.floor(theta / DTHETA) % N;
  const rPoly = f.polyRadiusAt(theta);

  if (outer ? dist > rPoly : dist < rPoly) {
    const ux = dist > 1e-6 ? dx / dist : 1;
    const uy = dist > 1e-6 ? dy / dist : 0;
    dist = outer ? rPoly - 0.01 : rPoly + 0.01;
    b.x = f.cx + ux * dist;
    b.y = f.cy + uy * dist;
  }

  const span = Math.asin(Math.min(1, (b.r + 1) / Math.max(dist, 1)));
  const k = Math.min(N >> 1, Math.ceil(span / DTHETA) + 2);
  let best: FieldHit | null = null;

  // Resolve the deepest contact first (the true closest point on the polygon),
  // then re-check, so corners touching two edges get both pushes.
  for (let iter = 0; iter < 3; iter++) {
    let minD = b.r;
    let ca = -1;
    let ct = 0;
    let cnx = 0;
    let cny = 0;
    for (let o = -k; o <= k; o++) {
      const a = (((i0 + o) % N) + N) % N;
      const c = (a + 1) % N;
      const ax = f.xs[a];
      const ay = f.ys[a];
      const ex = f.xs[c] - ax;
      const ey = f.ys[c] - ay;
      const len2 = ex * ex + ey * ey;
      if (len2 < 1e-9) continue;
      let t = ((b.x - ax) * ex + (b.y - ay) * ey) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = b.x - (ax + ex * t);
      const py = b.y - (ay + ey * t);
      const d = Math.hypot(px, py);
      if (d >= minD) continue;
      minD = d;
      ca = a;
      ct = t;
      if (d > 1e-4) {
        cnx = px / d;
        cny = py / d;
      } else {
        // Centre is on the edge: use the edge normal pointing to the allowed side.
        // Vertices run counter-clockwise in math orientation, so the interior is on the left.
        const len = Math.sqrt(len2);
        cnx = outer ? -ey / len : ey / len;
        cny = outer ? ex / len : -ex / len;
      }
    }
    if (ca < 0) break;

    const push = b.r - minD;
    b.x += cnx * push;
    b.y += cny * push;

    const cc = (ca + 1) % N;
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

/** Collide against both fields, flashing any wall hit hard enough. */
export function collideArena(b: Body, arena: Arena, restitution: number = ARENA.restitution): FieldHit | null {
  const h1 = collideField(b, arena.outer, restitution);
  const h2 = collideField(b, arena.inner, restitution);
  for (const h of [h1, h2]) {
    if (h && h.impact >= ARENA.flashImpact) h.field.flashEdge(h.edge);
  }
  if (h1 && h2) return h1.impact >= h2.impact ? h1 : h2;
  return h1 ?? h2;
}
