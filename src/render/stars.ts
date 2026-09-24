import { STARS, WORLD } from '../config';
import type { GameEvent } from '../events';

// The background sky: about 250 coloured, twinkling stars in three parallax
// layers that drift and wrap, occasional shooting stars, and reactions to the
// game (flare rings from explosions, a warp streak on hyperspace, every star
// flashing when the ship dies). Generated from a seed, so it is the same every run apart
// from time. Drawn with plain fillRect batched into colour × alpha buckets (no
// shadowBlur), so it costs a fraction of a millisecond.

/** 0 is the untinted pale blue-grey, 1 white; 2–5 are the strong tints. */
export const STAR_COLORS = ['#c4cfea', '#ffffff', '#6ffcff', '#ff7df0', '#ffcf6a', '#c29cff'] as const;
const WHITE = 1;
const FIRST_TINT = 2;
const TINTS = STAR_COLORS.length - FIRST_TINT;

export interface Star {
  /** Position at time 0; the layer's drift offset is added and wrapped. */
  x: number;
  y: number;
  layer: number; // 0 far … 2 near
  size: 1 | 2 | 3;
  color: number; // index into STAR_COLORS
  base: number; // base alpha
  rate: number; // flicker angular speed, rad/s
  phase: number;
  twinkleRate: number;
  twinklePhase: number;
  sparkle: boolean; // draws a four-point cross as it twinkles
}

export interface ShootingStar {
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  t0: number;
  tail: number;
  color: number;
}

interface Flare {
  x: number;
  y: number;
  t0: number;
  strength: number;
}

interface Warp {
  x: number;
  y: number;
  t0: number;
}

// Same LCG as tests/stress.test.ts.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const mod = (v: number, m: number): number => ((v % m) + m) % m;

export function makeStarfield(seed: number = STARS.seed, count: number = STARS.count): Star[] {
  const rand = rng(seed);
  const stars: Star[] = [];
  const [s0, s1] = STARS.layerShares;
  for (let i = 0; i < count; i++) {
    const l = rand();
    const layer = l < s0 ? 0 : l < s0 + s1 ? 1 : 2;
    const z = rand();
    let size: 1 | 2 | 3 = z < STARS.size3Share ? 3 : z < STARS.size3Share + STARS.size2Share ? 2 : 1;
    let color = rand() < STARS.tintShare ? WHITE + Math.floor(rand() * (TINTS + 1)) : 0;
    let base = STARS.minAlpha + rand() * (STARS.maxAlpha - STARS.minAlpha);
    const sparkle = rand() < STARS.sparkleShare;
    if (sparkle) {
      size = 2;
      color = FIRST_TINT + Math.floor(rand() * TINTS);
      base = Math.max(base, 0.7);
    }
    stars.push({
      x: rand() * WORLD.w,
      y: rand() * WORLD.h,
      layer,
      size,
      color,
      base,
      rate: STARS.minRate + rand() * (STARS.maxRate - STARS.minRate),
      phase: rand() * Math.PI * 2,
      twinkleRate: STARS.twinkleRate * (0.6 + 0.8 * rand()),
      twinklePhase: rand() * Math.PI * 2,
      sparkle,
    });
  }
  return stars;
}

/** The brightest a star may ever be drawn: white or pale stars of 2 px or more stay dim so they can't pass for bullets. */
export function starCap(s: Star): number {
  return s.color <= WHITE && s.size >= 2 ? STARS.whiteBigCap : STARS.maxDrawAlpha;
}

/** Twinkle intensity in [0, 1]: zero most of the time, a brief swell now and then. */
export function twinkleOf(s: Star, t: number): number {
  return Math.max(0, Math.sin(s.twinkleRate * t + s.twinklePhase)) ** STARS.twinklePower;
}

/** A star's own flicker and twinkle at time t, before reactions and the cap. */
export function starBaseAlpha(s: Star, t: number): number {
  const d = STARS.flickerDepth;
  return s.base * (1 - d + d * Math.sin(s.rate * t + s.phase)) + STARS.twinkleBoost * twinkleOf(s, t);
}

// Alpha is quantised into this many levels so each frame sets fillStyle and
// globalAlpha only a handful of times. A rect is drawn at level/LEVELS, never
// above its computed alpha, so the caps hold.
const LEVELS = 20;
const buckets: number[][] = Array.from({ length: STAR_COLORS.length * LEVELS }, () => []);

function push(color: number, a: number, x: number, y: number, w: number, h: number): void {
  const level = Math.min(LEVELS, Math.floor(a * LEVELS));
  if (level <= 0) return;
  buckets[color * LEVELS + level - 1].push(x, y, w, h);
}

/** Most dashes a streak is drawn with. */
const STREAK_DASHES = 6;

/**
 * A line from (x, y) along unit (ux, uy) for `len` px, fading out, as a few
 * axis-aligned dashes (a staircase), since only fillRect is used.
 */
function streak(color: number, a: number, x: number, y: number, ux: number, uy: number, len: number, thick: number): void {
  const n = Math.min(STREAK_DASHES, Math.max(1, Math.ceil(len / 4)));
  const seg = len / n;
  const horiz = Math.abs(ux) >= Math.abs(uy);
  const w = Math.max(1, Math.abs(ux) * seg);
  const h = Math.max(1, Math.abs(uy) * seg);
  for (let k = 0; k < n; k++) {
    const f = 1 - k / n;
    const cx = x + ux * seg * (k + 0.5);
    const cy = y + uy * seg * (k + 0.5);
    if (horiz) push(color, a * f, cx - w / 2, cy, w, thick);
    else push(color, a * f, cx, cy - h / 2, thick, h);
  }
}

/**
 * The background sky. `main.ts` feeds it every game event (explosions, hyperspace,
 * ship deaths carry positions), steps it with the simulation (not while paused),
 * and draws it first each frame.
 */
export class Starfield {
  readonly stars: readonly Star[];
  /** Live shooting stars. */
  readonly shooting: ShootingStar[] = [];
  /** How many shooting stars have been launched so far. */
  shootingSpawned = 0;
  time = 0;
  private prevTime = 0;
  private readonly ox = [0, 0, 0];
  private readonly oy = [0, 0, 0];
  private readonly prevOx = [0, 0, 0];
  private readonly prevOy = [0, 0, 0];
  private readonly heading0: number;
  private readonly rand: () => number;
  private nextShoot: number;
  private readonly flares: Flare[] = [];
  private readonly warps: Warp[] = [];
  private flashT0 = -Infinity;

  constructor(seed: number = STARS.seed) {
    this.stars = makeStarfield(seed);
    this.rand = rng(seed ^ 0x5eed5);
    this.heading0 = this.rand() * Math.PI * 2;
    this.nextShoot = this.shootGap();
  }

  onEvent(e: GameEvent): void {
    if (e.type === 'enemyKilled') this.flare(e.x, e.y, STARS.flareEnemy);
    else if (e.type === 'shipKilled') {
      this.flare(e.x, e.y, STARS.flareShip);
      this.flashT0 = this.time;
    } else if (e.type === 'hyperspace') {
      this.warps.push({ x: e.toX, y: e.toY, t0: this.time });
      if (this.warps.length > 2) this.warps.shift();
    }
  }

  update(dt: number): void {
    this.prevTime = this.time;
    this.time += dt;
    const t = this.time;
    const h = this.heading0 + STARS.driftTurn * t + STARS.driftWobble * Math.sin(STARS.driftWobbleRate * t);
    const cx = Math.cos(h);
    const cy = Math.sin(h);
    for (let l = 0; l < 3; l++) {
      this.prevOx[l] = this.ox[l];
      this.prevOy[l] = this.oy[l];
      this.ox[l] += cx * STARS.layerSpeeds[l] * dt;
      this.oy[l] += cy * STARS.layerSpeeds[l] * dt;
      // Keep offsets in [0, size), shifting prev by the same amount so interpolation stays smooth.
      const wx = Math.floor(this.ox[l] / WORLD.w) * WORLD.w;
      const wy = Math.floor(this.oy[l] / WORLD.h) * WORLD.h;
      this.ox[l] -= wx;
      this.prevOx[l] -= wx;
      this.oy[l] -= wy;
      this.prevOy[l] -= wy;
    }

    while (t >= this.nextShoot) {
      this.launch(this.nextShoot);
      this.nextShoot += this.shootGap();
    }
    prune(this.shooting, (s) => t - s.t0 > STARS.shootLife);
    const flareLife = STARS.flareRadius / STARS.flareSpeed + 8 * STARS.flareDecay;
    prune(this.flares, (f) => t - f.t0 > flareLife);
    prune(this.warps, (w) => t - w.t0 > STARS.warpDuration);
  }

  /** Where star i is drawn, `alpha` of the way from the previous step to the current one. Always inside the world. */
  starPosition(i: number, alpha = 1): { x: number; y: number } {
    const s = this.stars[i];
    const l = s.layer;
    return {
      x: mod(s.x + this.prevOx[l] + (this.ox[l] - this.prevOx[l]) * alpha, WORLD.w),
      y: mod(s.y + this.prevOy[l] + (this.oy[l] - this.prevOy[l]) * alpha, WORLD.h),
    };
  }

  /** Star i's drawn alpha at the current time, reactions included. */
  starAlpha(i: number): number {
    const p = this.starPosition(i);
    return this.alphaAt(this.stars[i], p.x, p.y, this.time);
  }

  /** `alpha` is the interpolation fraction between simulation steps. */
  draw(ctx: CanvasRenderingContext2D, alpha = 1): void {
    const t = this.prevTime + (this.time - this.prevTime) * alpha;
    for (const b of buckets) b.length = 0;
    ctx.shadowBlur = 0;

    const lx = [0, 0, 0];
    const ly = [0, 0, 0];
    for (let l = 0; l < 3; l++) {
      lx[l] = this.prevOx[l] + (this.ox[l] - this.prevOx[l]) * alpha;
      ly[l] = this.prevOy[l] + (this.oy[l] - this.prevOy[l]) * alpha;
    }

    for (const s of this.stars) {
      let x = mod(s.x + lx[s.layer], WORLD.w);
      let y = mod(s.y + ly[s.layer], WORLD.h);
      const a = this.alphaAt(s, x, y, t);
      const size = s.size;

      // Warp: pull the star towards the landing spot and trail a streak behind it.
      for (const w of this.warps) {
        const p = (t - w.t0) / STARS.warpDuration;
        if (p < 0 || p >= 1) continue;
        const dx = w.x - x;
        const dy = w.y - y;
        const d = Math.hypot(dx, dy);
        if (d < 2 || d >= STARS.warpRadius) continue;
        const env = Math.sin(Math.PI * p);
        const len = STARS.warpStreak * env * (1 - d / STARS.warpRadius) * d;
        const ux = dx / d;
        const uy = dy / d;
        x += ux * len * STARS.warpPull;
        y += uy * len * STARS.warpPull;
        if (len >= 2) streak(s.color, a * 0.8, x, y, -ux, -uy, len, 1);
        break;
      }

      // A tinted star lit by a flare or the flash grows a pixel (not white
      // ones: a bigger white dot would read as a bullet).
      const lift = a - Math.min(starCap(s), starBaseAlpha(s, t));
      const lit = s.color > WHITE && lift > STARS.flareGrow;
      const grow = lit && size < 3 ? 1 : 0;
      push(s.color, a, x - grow / 2, y - grow / 2, size + grow, size + grow);

      // Crosses come from flares only: the ship-death flash lifts every star,
      // and crossing them all would cost more than the rest of the sky.
      const flareLift = lift - STARS.flashBoost * this.flashLevel(t);
      if (s.sparkle || (lit && flareLift > STARS.flareGrow)) {
        const arm = Math.round(STARS.sparkleArm * Math.min(1, (s.sparkle ? twinkleOf(s, t) : 0) + Math.max(0, flareLift) * 2));
        if (arm >= 1) {
          const sz = size + grow;
          const x0 = x - grow / 2;
          const y0 = y - grow / 2;
          const inner = Math.ceil(arm / 2);
          const mx = x0 + sz / 2 - 0.5;
          const my = y0 + sz / 2 - 0.5;
          push(s.color, a * 0.6, x0 - inner, my, sz + 2 * inner, 1);
          push(s.color, a * 0.6, mx, y0 - inner, 1, sz + 2 * inner);
          if (arm > inner) {
            push(s.color, a * 0.3, x0 - arm, my, arm - inner, 1);
            push(s.color, a * 0.3, x0 + sz + inner, my, arm - inner, 1);
            push(s.color, a * 0.3, mx, y0 - arm, 1, arm - inner);
            push(s.color, a * 0.3, mx, y0 + sz + inner, 1, arm - inner);
          }
        }
      }
    }

    for (const sh of this.shooting) {
      const age = t - sh.t0;
      if (age < 0 || age > STARS.shootLife) continue;
      const fade = Math.min(1, age / 0.08) * Math.min(1, (STARS.shootLife - age) / (0.4 * STARS.shootLife));
      const a = STARS.shootAlpha * fade;
      const hx = sh.x0 + sh.vx * age;
      const hy = sh.y0 + sh.vy * age;
      const speed = Math.hypot(sh.vx, sh.vy);
      const ux = sh.vx / speed;
      const uy = sh.vy / speed;
      const tail = Math.max(2, Math.min(sh.tail, speed * age));
      streak(sh.color, a, hx, hy - 0.5, -ux, -uy, tail * 0.35, 1.5);
      streak(sh.color, a * 0.45, hx - ux * tail * 0.35, hy - uy * tail * 0.35, -ux, -uy, tail * 0.65, 1);
      push(sh.color, a, hx - 1, hy - 1, 2, 2);
    }

    for (let c = 0; c < STAR_COLORS.length; c++) {
      ctx.fillStyle = STAR_COLORS[c];
      for (let l = 0; l < LEVELS; l++) {
        const list = buckets[c * LEVELS + l];
        if (list.length === 0) continue;
        ctx.globalAlpha = (l + 1) / LEVELS;
        for (let i = 0; i < list.length; i += 4) ctx.fillRect(list[i], list[i + 1], list[i + 2], list[i + 3]);
      }
    }
    ctx.globalAlpha = 1;
  }

  private alphaAt(s: Star, x: number, y: number, t: number): number {
    let boost = STARS.flashBoost * this.flashLevel(t);
    for (const f of this.flares) {
      const age = t - f.t0;
      if (age <= 0) continue;
      const d = Math.hypot(x - f.x, y - f.y);
      if (d >= STARS.flareRadius) continue;
      const since = age - d / STARS.flareSpeed;
      if (since <= 0) continue;
      boost += f.strength * (1 - d / STARS.flareRadius) * Math.exp(-since / STARS.flareDecay) * Math.min(1, since / 0.04);
    }
    for (const w of this.warps) {
      const p = (t - w.t0) / STARS.warpDuration;
      if (p < 0 || p >= 1) continue;
      const d = Math.hypot(x - w.x, y - w.y);
      if (d < STARS.warpRadius) boost += 0.4 * Math.sin(Math.PI * p) * (1 - d / STARS.warpRadius);
    }
    return Math.max(0, Math.min(starCap(s), starBaseAlpha(s, t) + boost));
  }

  private flashLevel(t: number): number {
    const age = t - this.flashT0;
    return age >= 0 ? Math.exp(-age / STARS.flashDecay) : 0;
  }

  private flare(x: number, y: number, strength: number): void {
    this.flares.push({ x, y, t0: this.time, strength });
    if (this.flares.length > STARS.maxFlares) this.flares.shift();
  }

  private shootGap(): number {
    return STARS.shootMin + this.rand() * (STARS.shootMax - STARS.shootMin);
  }

  /** Launch a shooting star so it crosses a random point halfway through its flight. */
  private launch(t0: number): void {
    const r = this.rand;
    const px = WORLD.w * (0.15 + 0.7 * r());
    const py = WORLD.h * (0.15 + 0.7 * r());
    const ang = r() * Math.PI * 2;
    const speed = STARS.shootSpeedMin + r() * (STARS.shootSpeedMax - STARS.shootSpeedMin);
    const vx = Math.cos(ang) * speed;
    const vy = Math.sin(ang) * speed;
    const half = STARS.shootLife / 2;
    this.shooting.push({
      x0: px - vx * half,
      y0: py - vy * half,
      vx,
      vy,
      t0,
      tail: STARS.shootTailMin + r() * (STARS.shootTailMax - STARS.shootTailMin),
      color: FIRST_TINT + Math.floor(r() * TINTS),
    });
    this.shootingSpawned++;
  }
}

function prune<T>(list: T[], dead: (x: T) => boolean): void {
  let j = 0;
  for (const x of list) if (!dead(x)) list[j++] = x;
  list.length = j;
}
