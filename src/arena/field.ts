import { N } from './shapes';
import { TAU } from '../math/vec';

export const DTHETA = TAU / N;
export const COS = new Float32Array(N);
export const SIN = new Float32Array(N);
for (let i = 0; i < N; i++) {
  COS[i] = Math.cos(i * DTHETA);
  SIN[i] = Math.sin(i * DTHETA);
}

/** An outer field keeps things inside it; an inner field keeps things outside it. */
export type FieldSide = 'outer' | 'inner';

const FLASH_DECAY = 3.5; // flash intensity lost per second
const FLASH_MIN_SPAN = Math.round(N / 40); // edges lit either side of a hit on curved walls
// Radians; below this, neighbouring edges count as one straight side. Must stay
// well under DTHETA, the per-edge turn of a circle.
const STRAIGHT_TURN = DTHETA / 4;

/**
 * One force field: a closed polygon through N points at fixed angles, with a
 * per-vertex radial velocity so moving walls can push things.
 */
export class ForceField {
  readonly radii = new Float32Array(N);
  /** Radial velocity of each vertex, px/s (positive = moving outward). */
  readonly vel = new Float32Array(N);
  readonly xs = new Float32Array(N);
  readonly ys = new Float32Array(N);
  /** Flash intensity per edge (edge i runs from vertex i to i+1). */
  readonly flash = new Float32Array(N);

  constructor(
    readonly side: FieldSide,
    readonly cx: number,
    readonly cy: number,
  ) {}

  /** Replace the radii. With dt > 0 the change is recorded as wall velocity. */
  setRadii(r: ArrayLike<number>, dt = 0): void {
    for (let i = 0; i < N; i++) {
      this.vel[i] = dt > 0 ? (r[i] - this.radii[i]) / dt : 0;
      this.radii[i] = r[i];
      this.xs[i] = this.cx + r[i] * COS[i];
      this.ys[i] = this.cy + r[i] * SIN[i];
    }
  }

  /** Exact distance from the centre to the polygon along angle θ (θ in [0, 2π)). */
  polyRadiusAt(theta: number): number {
    const i = Math.floor(theta / DTHETA) % N;
    const j = (i + 1) % N;
    const ra = this.radii[i];
    const rb = this.radii[j];
    const phi = theta - i * DTHETA;
    return (ra * rb * Math.sin(DTHETA)) / (ra * Math.sin(phi) + rb * Math.sin(DTHETA - phi));
  }

  minRadius(): number {
    let m = Infinity;
    for (let i = 0; i < N; i++) m = Math.min(m, this.radii[i]);
    return m;
  }

  /** Light up the straight side containing edge i (or a short arc on curves). */
  flashEdge(i: number): void {
    const dir = (e: number) => {
      const a = ((e % N) + N) % N;
      const b = (a + 1) % N;
      return Math.atan2(this.ys[b] - this.ys[a], this.xs[b] - this.xs[a]);
    };
    const turn = (e: number) => {
      let d = Math.abs(dir(e + 1) - dir(e));
      if (d > Math.PI) d = TAU - d;
      return d;
    };
    let lo = 0;
    while (lo < N / 2 && turn(i - lo - 1) < STRAIGHT_TURN) lo++;
    let hi = 0;
    while (hi < N / 2 && turn(i + hi) < STRAIGHT_TURN) hi++;
    if (lo === 0 && hi === 0) lo = hi = FLASH_MIN_SPAN; // curved wall
    for (let k = -lo; k <= hi; k++) this.flash[(((i + k) % N) + N) % N] = 1;
  }

  update(dt: number): void {
    for (let i = 0; i < N; i++) {
      if (this.flash[i] > 0) this.flash[i] = Math.max(0, this.flash[i] - FLASH_DECAY * dt);
    }
  }
}
