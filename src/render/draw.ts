import type { Arena } from '../arena/arena';
import type { ForceField } from '../arena/field';
import { N } from '../arena/shapes';
import type { Bullet } from '../entities/bullet';
import type { Enemy } from '../entities/enemies';
import { COOL_STEPS, coolStep, paletteList, type Particle } from '../entities/particles';
import type { Ship } from '../entities/ship';
import { WORLD } from '../config';
import { lerp, TAU } from '../math/vec';

export const COLORS = {
  field: '#35e0ff',
  fieldFlash: '#ffffff',
  ship: '#ffffff',
  thrust: '#ff9a3c',
  bullet: '#ffffff',
  enemyBullet: '#ffe14f',
  text: '#d8f6ff',
  dimText: '#6aa9bb',
  debug: '#ff4fd8',
};

function glow(ctx: CanvasRenderingContext2D, color: string, blur = 8): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

function noGlow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowBlur = 0;
}

/**
 * A cheap stand-in for shadowBlur on long paths: the current path stroked wide
 * and faint, then narrower, then at full width and brightness. Blurring a path
 * costs in proportion to its bounding box, which for a force field is most of
 * the screen.
 */
const HALO = [
  { extra: 10, alpha: 0.05 },
  { extra: 6, alpha: 0.1 },
  { extra: 3, alpha: 0.22 },
];

export function haloStroke(ctx: CanvasRenderingContext2D, color: string, width: number, alpha = 1, strength = 1): void {
  ctx.shadowBlur = 0;
  ctx.strokeStyle = color;
  for (const h of HALO) {
    ctx.globalAlpha = alpha * Math.min(1, h.alpha * strength);
    ctx.lineWidth = width + h.extra;
    ctx.stroke();
  }
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.stroke();
}

/** Flash brightness is drawn in this many steps (one path each). */
const FLASH_LEVELS = 16;
const flashBucket = new Uint8Array(N);

/** A field's vertices drawn `alpha` of the way from the previous step to the current one. */
interface FieldPoints {
  xs: Float32Array;
  ys: Float32Array;
}

const outerPts: FieldPoints = { xs: new Float32Array(N), ys: new Float32Array(N) };
const innerPts: FieldPoints = { xs: new Float32Array(N), ys: new Float32Array(N) };

function fieldPoints(f: ForceField, alpha: number, out: FieldPoints): FieldPoints {
  for (let i = 0; i < N; i++) {
    out.xs[i] = lerp(f.prevXs[i], f.xs[i], alpha);
    out.ys[i] = lerp(f.prevYs[i], f.ys[i], alpha);
  }
  return out;
}

export function drawField(ctx: CanvasRenderingContext2D, f: ForceField, alpha = 1): void {
  drawFieldPoints(ctx, f, fieldPoints(f, alpha, f.side === 'outer' ? outerPts : innerPts));
}

function drawFieldPoints(ctx: CanvasRenderingContext2D, f: ForceField, p: FieldPoints): void {
  ctx.beginPath();
  tracePolygon(ctx, p);
  haloStroke(ctx, COLORS.field, 2);

  // Segments that were just hit flash white. Lit edges are grouped by
  // brightness into one path per level, so a hit costs a few strokes rather
  // than one blurred stroke per edge.
  let lit = 0;
  for (let i = 0; i < N; i++) {
    const a = f.flash[i];
    const b = a > 0 ? Math.ceil(a * FLASH_LEVELS) : 0;
    flashBucket[i] = b;
    if (b) lit |= 1 << b;
  }
  for (let b = 1; b <= FLASH_LEVELS; b++) {
    if (!(lit & (1 << b))) continue;
    ctx.beginPath();
    let open = false;
    for (let i = 0; i < N; i++) {
      if (flashBucket[i] !== b) {
        open = false;
        continue;
      }
      const j = (i + 1) % N;
      if (!open) ctx.moveTo(p.xs[i], p.ys[i]);
      ctx.lineTo(p.xs[j], p.ys[j]);
      open = true;
    }
    haloStroke(ctx, COLORS.fieldFlash, 3, b / FLASH_LEVELS, 1.6);
  }
  ctx.globalAlpha = 1;
}

function tracePolygon(ctx: CanvasRenderingContext2D, p: FieldPoints): void {
  ctx.moveTo(p.xs[0], p.ys[0]);
  for (let i = 1; i < N; i++) ctx.lineTo(p.xs[i], p.ys[i]);
  ctx.closePath();
}

/**
 * Both force fields. The outer one is clipped to outside the inner one: on a
 * chambered level its hub sits inside the score circle and shouldn't show.
 * (On a connected level the fields never cross, so the clip is skipped.)
 * An inner field shrunk to nothing (score shown outside) isn't drawn.
 */
export function drawArena(ctx: CanvasRenderingContext2D, arena: Arena, alpha = 1): void {
  const outer = fieldPoints(arena.outer, alpha, outerPts);
  const inner = fieldPoints(arena.inner, alpha, innerPts);
  if (arena.isRing) {
    drawFieldPoints(ctx, arena.outer, outer);
  } else {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, WORLD.w, WORLD.h);
    tracePolygon(ctx, inner);
    ctx.clip('evenodd');
    drawFieldPoints(ctx, arena.outer, outer);
    ctx.restore();
  }
  let innerSize = 0;
  for (let i = 0; i < N; i++) innerSize = Math.max(innerSize, arena.inner.radii[i]);
  if (innerSize >= 1) drawFieldPoints(ctx, arena.inner, inner);
}

/** Draws `points` (unit-scale polygon) at (x, y), rotated and scaled. */
function poly(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, scale: number, points: number[][], close = true): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  ctx.beginPath();
  points.forEach(([px, py], i) => {
    const X = x + (px * c - py * s) * scale;
    const Y = y + (px * s + py * c) * scale;
    if (i === 0) ctx.moveTo(X, Y);
    else ctx.lineTo(X, Y);
  });
  if (close) ctx.closePath();
  ctx.stroke();
}

const SHIP_SHAPE = [
  [1.5, 0],
  [-1, 0.9],
  [-0.5, 0],
  [-1, -0.9],
];

export function drawShipIcon(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, r: number): void {
  poly(ctx, x, y, angle, r, SHIP_SHAPE);
}

export function drawShip(ctx: CanvasRenderingContext2D, ship: Ship, time: number, alpha = 1): void {
  if (ship.invuln > 0 && Math.floor(time * 12) % 2 === 0) return;
  const x = lerp(ship.prevX, ship.x, alpha);
  const y = lerp(ship.prevY, ship.y, alpha);
  const angle = lerp(ship.prevAngle, ship.angle, alpha);
  ctx.lineWidth = 2;
  if (ship.thrusting && Math.floor(time * 30) % 2 === 0) {
    glow(ctx, COLORS.thrust);
    poly(ctx, x, y, angle, ship.r, [
      [-0.7, 0.4],
      [-1.6, 0],
      [-0.7, -0.4],
    ], false);
  }
  glow(ctx, COLORS.ship);
  drawShipIcon(ctx, x, y, angle, ship.r);
  noGlow(ctx);
}

const STAR8 = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * TAU;
  const r = i % 2 === 0 ? 1 : 0.45;
  return [Math.cos(a) * r, Math.sin(a) * r];
});

const OCTAGON = Array.from({ length: 8 }, (_, i) => {
  const a = ((i + 0.5) / 8) * TAU;
  return [Math.cos(a), Math.sin(a)];
});

export function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, color: string, time: number, alpha = 1): void {
  const x = lerp(e.prevX, e.x, alpha);
  const y = lerp(e.prevY, e.y, alpha);
  // Partial alphas below are relative to this, so a caller can fade the sprite.
  const base = ctx.globalAlpha;
  ctx.lineWidth = 2;
  glow(ctx, color);
  switch (e.kind) {
    case 'droid':
      poly(ctx, x, y, e.spin, e.r, [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]);
      poly(ctx, x, y, e.spin, e.r * 0.45, [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]);
      break;
    case 'command': {
      const heading = Math.atan2(e.vy, e.vx);
      poly(ctx, x, y, heading, e.r, [
        [1.1, 0],
        [0.3, 0.8],
        [-0.9, 0.8],
        [-0.5, 0],
        [-0.9, -0.8],
        [0.3, -0.8],
      ]);
      poly(ctx, x, y, e.spin, e.r * 0.35, [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]);
      break;
    }
    case 'death':
      poly(ctx, x, y, e.spin, e.r, [
        [1, 0],
        [-0.5, 0.87],
        [-0.5, -0.87],
      ]);
      poly(ctx, x, y, -e.spin, e.r, [
        [1, 0],
        [-0.5, 0.87],
        [-0.5, -0.87],
      ]);
      break;
    case 'tanker': {
      // A heavy octagonal hull around a slowly turning core, with an arc of
      // armour that shrinks as it takes hits. It flashes white when hit.
      if (e.hitFlash > 0) glow(ctx, '#ffffff');
      poly(ctx, x, y, e.spin * 0.25, e.r, OCTAGON);
      poly(ctx, x, y, -e.spin, e.r * 0.5, [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]);
      const armour = e.hp / e.maxHp;
      ctx.globalAlpha = base * 0.8;
      ctx.beginPath();
      ctx.arc(x, y, e.r + 6, -Math.PI / 2, -Math.PI / 2 + armour * TAU);
      ctx.stroke();
      ctx.globalAlpha = base;
      break;
    }
    case 'photon': {
      const pulse = 0.6 + 0.4 * Math.sin(time * 8 + e.phase);
      ctx.globalAlpha = base * pulse;
      poly(ctx, x, y, Math.PI / 4, e.r, [
        [1, 0],
        [-1, 0],
      ], false);
      poly(ctx, x, y, -Math.PI / 4, e.r, [
        [1, 0],
        [-1, 0],
      ], false);
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = base;
      break;
    }
    case 'vapor':
      poly(ctx, x, y, e.spin, e.r, STAR8);
      break;
  }
  noGlow(ctx);
}

export function drawBullets(ctx: CanvasRenderingContext2D, bullets: Bullet[], color: string, alpha = 1): void {
  glow(ctx, color, 6);
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(lerp(b.prevX, b.x, alpha), lerp(b.prevY, b.y, alpha), b.r, 0, TAU);
    ctx.fill();
  }
  noGlow(ctx);
}

/**
 * Explosion fragments are batched: one path per (colour, cooling step, alpha
 * level, shard or spark), stroked with a small halo instead of shadowBlur, so a
 * screen full of blasts costs a few dozen strokes rather than one per fragment.
 * One halo pass only: on the software rasteriser each extra pass over ~400
 * fragments cost about 1 ms at 2048×1536.
 */
const PARTICLE_ALPHA_LEVELS = 8;
const PARTICLE_HALO = [{ extra: 4, alpha: 0.2 }];
const particleBuckets = new Map<number, Particle[]>();
/** A flash is three nested discs: [radius share, alpha]. */
const FLASH_DISCS = [
  [1, 0.16],
  [0.62, 0.3],
  [0.32, 0.9],
] as const;

function particleHalo(ctx: CanvasRenderingContext2D, width: number, alpha: number): void {
  for (const h of PARTICLE_HALO) {
    ctx.globalAlpha = alpha * h.alpha;
    ctx.lineWidth = width + h.extra;
    ctx.stroke();
  }
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function drawParticles(ctx: CanvasRenderingContext2D, ps: Particle[], alpha = 1): void {
  ctx.shadowBlur = 0;
  for (const b of particleBuckets.values()) b.length = 0;
  for (const p of ps) {
    const f = Math.max(0, p.life / p.maxLife);
    const x = lerp(p.prevX, p.x, alpha);
    const y = lerp(p.prevY, p.y, alpha);
    if (p.kind === 'flash') {
      // A white disc with a soft edge, swelling slightly as it fades.
      const a = f * f;
      const r = p.len * (0.7 + 0.3 * (1 - f));
      // A coloured bloom behind the white core.
      ctx.fillStyle = p.palette.steps[COOL_STEPS - 1];
      ctx.globalAlpha = a * 0.22;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.35, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      for (const [rs, as] of FLASH_DISCS) {
        ctx.globalAlpha = a * as;
        ctx.beginPath();
        ctx.arc(x, y, r * rs, 0, TAU);
        ctx.fill();
      }
      continue;
    }
    if (p.kind === 'ring') {
      // Fast out, easing to its full radius; thins and fades as it goes.
      const t = 1 - f;
      const r = p.len * (1 - (1 - t) ** 3);
      ctx.strokeStyle = p.palette.steps[coolStep(p)];
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.5, r), 0, TAU);
      particleHalo(ctx, 1 + 2.5 * f, f ** 1.5);
      continue;
    }
    const spark = p.kind === 'spark';
    // Fragments hold their brightness, then fade out late in life.
    const level = Math.ceil(Math.min(1, f * 1.5) * PARTICLE_ALPHA_LEVELS);
    if (level <= 0) continue;
    // Sparks run one step hotter than shards.
    const step = spark ? Math.max(0, coolStep(p) - 1) : coolStep(p);
    const key = (((p.palette.id * COOL_STEPS + step) * (PARTICLE_ALPHA_LEVELS + 1) + level) << 1) | (spark ? 1 : 0);
    let list = particleBuckets.get(key);
    if (!list) particleBuckets.set(key, (list = []));
    list.push(p);
  }
  // Butt caps: round ones cost noticeably more on hundreds of tiny segments.
  const cap = ctx.lineCap;
  ctx.lineCap = 'butt';
  for (const [key, list] of particleBuckets) {
    if (!list.length) continue;
    const spark = (key & 1) === 1;
    const rest = key >> 1;
    const level = rest % (PARTICLE_ALPHA_LEVELS + 1);
    const cs = Math.floor(rest / (PARTICLE_ALPHA_LEVELS + 1));
    const palette = paletteList[Math.floor(cs / COOL_STEPS)];
    ctx.strokeStyle = palette.steps[cs % COOL_STEPS];
    ctx.beginPath();
    for (const p of list) {
      const x = lerp(p.prevX, p.x, alpha);
      const y = lerp(p.prevY, p.y, alpha);
      if (spark) {
        // A streak trailing behind the spark, shrinking as it slows and burns out.
        const v = Math.hypot(p.vx, p.vy) || 1;
        const l = p.len * (0.35 + 0.65 * (p.life / p.maxLife));
        ctx.moveTo(x, y);
        ctx.lineTo(x - (p.vx / v) * l, y - (p.vy / v) * l);
      } else {
        const dx = Math.cos(p.angle) * p.len * 0.5;
        const dy = Math.sin(p.angle) * p.len * 0.5;
        ctx.moveTo(x - dx, y - dy);
        ctx.lineTo(x + dx, y + dy);
      }
    }
    particleHalo(ctx, spark ? 1.5 : 2, level / PARTICLE_ALPHA_LEVELS);
  }
  ctx.lineCap = cap;
  ctx.globalAlpha = 1;
}

/** Debug overlay: the orbit track (where open) and wall normals (with wall velocity in orange). */
export function drawDebug(ctx: CanvasRenderingContext2D, arena: Arena): void {
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLORS.debug;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  let drawing = false;
  for (let i = 0; i <= 256; i++) {
    const theta = (i / 256) * TAU;
    if (arena.chamberAt(theta) < 0) {
      drawing = false;
      continue;
    }
    const p = arena.trackPoint(theta);
    if (!drawing) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
    drawing = true;
  }
  ctx.stroke();
  ctx.setLineDash([]);
  for (const f of [arena.outer, arena.inner]) {
    for (let i = 0; i < N; i += Math.round(N / 64)) {
      const j = (i + 1) % N;
      const mx = (f.xs[i] + f.xs[j]) / 2;
      const my = (f.ys[i] + f.ys[j]) / 2;
      const ex = f.xs[j] - f.xs[i];
      const ey = f.ys[j] - f.ys[i];
      const len = Math.hypot(ex, ey) || 1;
      const sign = f.side === 'outer' ? 1 : -1;
      ctx.strokeStyle = COLORS.debug;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + ((-ey / len) * 14) * sign, my + ((ex / len) * 14) * sign);
      ctx.stroke();
      const v = f.vel[i] * 0.1;
      if (Math.abs(v) > 0.5) {
        const a = (i / N) * TAU;
        ctx.strokeStyle = COLORS.thrust;
        ctx.beginPath();
        ctx.moveTo(f.xs[i], f.ys[i]);
        ctx.lineTo(f.xs[i] + Math.cos(a) * v, f.ys[i] + Math.sin(a) * v);
        ctx.stroke();
      }
    }
  }
}
