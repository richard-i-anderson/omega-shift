import { STARS, WORLD } from '../config';

// A dim, gently flickering background starfield. Generated once from a seed,
// drawn with plain fillRect (no shadowBlur) so it costs next to nothing.

export const STAR_COLORS = ['#ffffff', '#a8c8ff', '#ffd49a'] as const; // white, faint blue, faint amber

export interface Star {
  x: number;
  y: number;
  size: 1 | 2;
  color: number; // index into STAR_COLORS
  base: number; // base alpha
  rate: number; // flicker angular speed, rad/s
  phase: number;
  twinkleRate: number;
  twinklePhase: number;
}

// Same LCG as tests/stress.test.ts.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function makeStarfield(seed: number = STARS.seed, count: number = STARS.count): Star[] {
  const rand = rng(seed);
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const size = rand() < STARS.bigShare ? 2 : 1;
    const t = rand();
    const color = t < STARS.tintShare / 2 ? 1 : t < STARS.tintShare ? 2 : 0;
    stars.push({
      x: Math.floor(rand() * (WORLD.w - size)),
      y: Math.floor(rand() * (WORLD.h - size)),
      size,
      color,
      base: STARS.minAlpha + rand() * (STARS.maxAlpha - STARS.minAlpha),
      rate: STARS.minRate + rand() * (STARS.maxRate - STARS.minRate),
      phase: rand() * Math.PI * 2,
      twinkleRate: STARS.twinkleRate * (0.7 + 0.6 * rand()),
      twinklePhase: rand() * Math.PI * 2,
    });
  }
  return stars;
}

/** Alpha of a star at time t: never below base × (1 − 2·depth), never above base + twinkleBoost. */
export function starAlpha(s: Star, t: number): number {
  const d = STARS.flickerDepth;
  const flicker = s.base * (1 - d + d * Math.sin(s.rate * t + s.phase));
  // A slow sine raised to a high power: zero most of the time, a brief swell now and then.
  const tw = Math.max(0, Math.sin(s.twinkleRate * t + s.twinklePhase));
  const twinkle = STARS.twinkleBoost * tw ** 16;
  return Math.min(1, flicker + twinkle);
}

// Alpha is quantised into this many levels so each frame sets fillStyle and
// globalAlpha only a handful of times.
const BUCKETS = 16;
const buckets: Star[][] = Array.from({ length: STAR_COLORS.length * BUCKETS }, () => []);

export function drawStars(ctx: CanvasRenderingContext2D, stars: Star[], time: number): void {
  for (const b of buckets) b.length = 0;
  for (const s of stars) {
    const level = Math.min(BUCKETS - 1, Math.floor(starAlpha(s, time) * BUCKETS));
    buckets[s.color * BUCKETS + level].push(s);
  }
  ctx.shadowBlur = 0;
  for (let c = 0; c < STAR_COLORS.length; c++) {
    ctx.fillStyle = STAR_COLORS[c];
    for (let l = 0; l < BUCKETS; l++) {
      const list = buckets[c * BUCKETS + l];
      if (list.length === 0) continue;
      ctx.globalAlpha = (l + 0.5) / BUCKETS;
      for (const s of list) ctx.fillRect(s.x, s.y, s.size, s.size);
    }
  }
  ctx.globalAlpha = 1;
}
