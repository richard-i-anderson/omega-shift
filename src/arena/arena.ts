import { ForceField } from './field';
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
 * Checks that every keyframe leaves a corridor of at least `minGap` between the
 * fields and an inner field big enough for the score. Because morphs are linear
 * blends of the radius arrays, keyframes passing this check means every
 * in-between shape passes too.
 */
export function validateKeyframes(keyframes: Keyframe[], minGap: number, minInnerRadius: number): string[] {
  const errors: string[] = [];
  sampleKeyframes(keyframes).forEach((k, idx) => {
    let gap = Infinity;
    let inner = Infinity;
    for (let i = 0; i < N; i++) {
      gap = Math.min(gap, k.outer[i] - k.inner[i]);
      inner = Math.min(inner, k.inner[i]);
    }
    if (gap < minGap) errors.push(`keyframe ${idx}: corridor ${gap.toFixed(1)} < ${minGap}`);
    if (inner < minInnerRadius) errors.push(`keyframe ${idx}: inner radius ${inner.toFixed(1)} < ${minInnerRadius}`);
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
}
