import { DTHETA, ForceField } from './field';
import { N, sampleShape, type ShapeSpec } from './shapes';
import { normAngle, smoothstep } from '../math/vec';

export interface Keyframe {
  outer: ShapeSpec;
  inner: ShapeSpec;
  /** Seconds to hold this shape before morphing to the next keyframe. */
  holdSec: number;
  /** Seconds spent morphing from this keyframe to the next one. */
  morphSec: number;
}

interface SampledKeyframe {
  outer: Float32Array;
  inner: Float32Array;
  holdSec: number;
  morphSec: number;
}

function sampleKeyframes(keyframes: Keyframe[]): SampledKeyframe[] {
  return keyframes.map((k) => ({
    outer: sampleShape(k.outer),
    inner: sampleShape(k.inner),
    holdSec: k.holdSec,
    morphSec: k.morphSec,
  }));
}

function blend(a: ArrayLike<number>, b: ArrayLike<number>, t: number, out: Float32Array): void {
  for (let i = 0; i < N; i++) out[i] = a[i] + (b[i] - a[i]) * t;
}

/**
 * A stretch of open corridor: `len` samples from sample index `start`, going
 * clockwise on screen (increasing θ). Where the inner field reaches past the
 * outer one the corridor is closed, which splits the arena into chambers.
 */
export interface Chamber {
  start: number;
  len: number;
}

/** The open stretches of corridor, in clockwise order. Fills `chamberOf` (sample → chamber, -1 if closed). */
export function findChambers(outer: ArrayLike<number>, inner: ArrayLike<number>, chamberOf?: Int16Array): Chamber[] {
  let closed = -1;
  for (let i = 0; i < N && closed < 0; i++) if (outer[i] - inner[i] <= 0) closed = i;
  if (closed < 0) {
    chamberOf?.fill(0);
    return [{ start: 0, len: N }];
  }
  const chambers: Chamber[] = [];
  let cur: Chamber | null = null;
  for (let k = 1; k <= N; k++) {
    const i = (closed + k) % N;
    if (outer[i] - inner[i] > 0) {
      if (!cur) chambers.push((cur = { start: i, len: 0 }));
      cur.len++;
      if (chamberOf) chamberOf[i] = chambers.length - 1;
    } else {
      cur = null;
      if (chamberOf) chamberOf[i] = -1;
    }
  }
  return chambers;
}

export interface ValidateOptions {
  /** The level shows the score outside the outer field, so the inner field may be tiny or absent. */
  scoreOutside?: boolean;
}

/**
 * Checks that every keyframe leaves a corridor of at least `minGap` between the
 * fields and an inner field big enough for the score. Because morphs are linear
 * blends of the radius arrays, keyframes passing this check means every
 * in-between shape passes too.
 *
 * Chambered keyframes (the inner field reaches past the outer one somewhere)
 * must have steep dividing walls: every sample is either open by `minGap` or
 * closed, and each chamber is at least `minGap` wide along the track. They can't
 * be part of a morphing level, since blending would pinch corridors shut mid-play.
 */
export function validateKeyframes(
  keyframes: Keyframe[],
  minGap: number,
  minInnerRadius: number,
  opts: ValidateOptions = {},
): string[] {
  const errors: string[] = [];
  sampleKeyframes(keyframes).forEach((k, idx) => {
    let gap = Infinity;
    let inner = Infinity;
    for (let i = 0; i < N; i++) {
      const g = k.outer[i] - k.inner[i];
      if (g > 0) gap = Math.min(gap, g);
      inner = Math.min(inner, k.inner[i]);
    }
    if (gap < minGap) errors.push(`keyframe ${idx}: corridor ${gap.toFixed(1)} < ${minGap}`);
    if (!opts.scoreOutside && inner < minInnerRadius) {
      errors.push(`keyframe ${idx}: inner radius ${inner.toFixed(1)} < ${minInnerRadius}`);
    }
    const chambers = findChambers(k.outer, k.inner);
    if (chambers.length === 1 && chambers[0].len === N) return;
    if (keyframes.length > 1) errors.push(`keyframe ${idx}: chambered keyframes can't be part of a morph`);
    chambers.forEach((c, ci) => {
      const mid = (c.start + (c.len >> 1)) % N;
      const width = c.len * DTHETA * ((k.outer[mid] + k.inner[mid]) / 2);
      if (width < minGap) errors.push(`keyframe ${idx}: chamber ${ci} is ${width.toFixed(1)} wide < ${minGap}`);
    });
  });
  return errors;
}

/** The playfield: an outer and an inner force field driven by a keyframe timeline. */
export class Arena {
  readonly outer: ForceField;
  readonly inner: ForceField;
  private keyframes: SampledKeyframe[] = [];
  private loop = false;
  private t = 0;
  private transition: { outer: Float32Array; inner: Float32Array; t: number; dur: number } | null = null;
  private readonly bufOuter = new Float32Array(N);
  private readonly bufInner = new Float32Array(N);
  /** Open stretches of corridor; a single chamber of length N when it's one connected ring. */
  chambers: Chamber[] = [];
  private readonly chamberOf = new Int16Array(N);

  constructor(
    readonly cx: number,
    readonly cy: number,
    keyframes: Keyframe[],
    loop: boolean,
  ) {
    this.outer = new ForceField('outer', cx, cy);
    this.inner = new ForceField('inner', cx, cy);
    this.setLevel(keyframes, loop, 0);
  }

  /** Switch to a new timeline, morphing from the current shape over `transitionSec`. */
  setLevel(keyframes: Keyframe[], loop: boolean, transitionSec: number): void {
    this.keyframes = sampleKeyframes(keyframes);
    this.loop = loop;
    this.t = 0;
    if (transitionSec > 0) {
      this.transition = {
        outer: Float32Array.from(this.outer.radii),
        inner: Float32Array.from(this.inner.radii),
        t: 0,
        dur: transitionSec,
      };
    } else {
      this.transition = null;
      this.timelineAt(0, this.bufOuter, this.bufInner);
      this.outer.setRadii(this.bufOuter);
      this.inner.setRadii(this.bufInner);
      this.chambers = findChambers(this.outer.radii, this.inner.radii, this.chamberOf);
    }
  }

  /** True while the walls are changing shape. */
  get moving(): boolean {
    return this.transition !== null || this.segmentAt(this.t).morph >= 0;
  }

  update(dt: number): void {
    this.t += dt;
    this.timelineAt(this.t, this.bufOuter, this.bufInner);
    const tr = this.transition;
    if (tr) {
      tr.t += dt;
      const s = smoothstep(tr.t / tr.dur);
      blend(tr.outer, this.bufOuter, s, this.bufOuter);
      blend(tr.inner, this.bufInner, s, this.bufInner);
      if (tr.t >= tr.dur) this.transition = null;
    }
    this.outer.setRadii(this.bufOuter, dt);
    this.inner.setRadii(this.bufInner, dt);
    this.chambers = findChambers(this.outer.radii, this.inner.radii, this.chamberOf);
    this.outer.update(dt);
    this.inner.update(dt);
  }

  /** Which keyframe is active at `time`, and how far through its morph (-1 while holding). */
  private segmentAt(time: number): { k: number; morph: number } {
    const kfs = this.keyframes;
    const n = kfs.length;
    let t = time;
    if (this.loop && n > 1) t %= kfs.reduce((s, k) => s + k.holdSec + k.morphSec, 0);
    for (let k = 0; k < n; k++) {
      const kf = kfs[k];
      const morphs = n > 1 && (this.loop || k < n - 1);
      if (t < kf.holdSec || !morphs) return { k, morph: -1 };
      t -= kf.holdSec;
      if (t < kf.morphSec) return { k, morph: t / kf.morphSec };
      t -= kf.morphSec;
    }
    return { k: 0, morph: -1 }; // float rounding at the very end of a loop
  }

  private timelineAt(time: number, outO: Float32Array, outI: Float32Array): void {
    const { k, morph } = this.segmentAt(time);
    const kf = this.keyframes[k];
    if (morph < 0) {
      outO.set(kf.outer);
      outI.set(kf.inner);
      return;
    }
    const next = this.keyframes[(k + 1) % this.keyframes.length];
    const s = smoothstep(morph);
    blend(kf.outer, next.outer, s, outO);
    blend(kf.inner, next.inner, s, outI);
  }

  /** Radius of the enemy orbit track: halfway between the two fields. */
  trackRadius(theta: number): number {
    const a = normAngle(theta);
    return (this.inner.polyRadiusAt(a) + this.outer.polyRadiusAt(a)) / 2;
  }

  /** Half the radial corridor width at θ. */
  halfGap(theta: number): number {
    const a = normAngle(theta);
    return (this.outer.polyRadiusAt(a) - this.inner.polyRadiusAt(a)) / 2;
  }

  /** Point on the track at θ, pushed `offset` pixels outward along the ray. */
  trackPoint(theta: number, offset = 0): { x: number; y: number } {
    const r = this.trackRadius(theta) + offset;
    return { x: this.cx + r * Math.cos(theta), y: this.cy + r * Math.sin(theta) };
  }

  /** True when the corridor is one connected ring (no isolated chambers). */
  get isRing(): boolean {
    return this.chambers.length === 1 && this.chambers[0].len === N;
  }

  /** Index into `chambers` of the corridor at θ, or -1 where it's closed. */
  chamberAt(theta: number): number {
    // The edge between a closed and an open sample is a dividing wall, and the
    // part of that interval in front of it belongs to the open side's chamber.
    const i = Math.floor(normAngle(theta) / DTHETA) % N;
    const c = this.chamberOf[i];
    return c >= 0 ? c : this.chamberOf[(i + 1) % N];
  }

  chamberAtPoint(x: number, y: number): number {
    return this.chamberAt(Math.atan2(y - this.cy, x - this.cx));
  }

  /** Angle `frac` of the way through chamber `c` (0.5 = its middle). */
  chamberAngle(c: number, frac = 0.5): number {
    const ch = this.chambers[c];
    return normAngle((ch.start + frac * (ch.len - 1)) * DTHETA);
  }

  /** True if (x, y) is inside the outer field and outside the inner one. */
  contains(x: number, y: number, tolerance = 0.05): boolean {
    const dx = x - this.cx;
    const dy = y - this.cy;
    const d = Math.hypot(dx, dy);
    const a = normAngle(Math.atan2(dy, dx));
    return d <= this.outer.polyRadiusAt(a) + tolerance && d >= this.inner.polyRadiusAt(a) - tolerance;
  }

  /** The angle nearest θ where the corridor's half-width is at least `clearance`. */
  openAngle(theta: number, clearance: number): number {
    const a0 = normAngle(theta);
    if (this.halfGap(a0) >= clearance) return a0;
    let best = a0;
    let bestGap = -Infinity;
    for (let k = 1; k <= N >> 1; k++) {
      for (const a of [a0 + k * DTHETA, a0 - k * DTHETA]) {
        const g = this.halfGap(a);
        if (g >= clearance) return normAngle(a);
        if (g > bestGap) {
          bestGap = g;
          best = a;
        }
      }
    }
    return normAngle(best);
  }
}
