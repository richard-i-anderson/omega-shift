import type { Arena } from '../arena/arena';
import type { ForceField } from '../arena/field';
import { N } from '../arena/shapes';
import type { Bullet } from '../entities/bullet';
import type { Enemy } from '../entities/enemies';
import type { Particle } from '../entities/particles';
import type { Ship } from '../entities/ship';
import { TAU } from '../math/vec';

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

export function drawField(ctx: CanvasRenderingContext2D, f: ForceField): void {
  glow(ctx, COLORS.field, 10);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(f.xs[0], f.ys[0]);
  for (let i = 1; i < N; i++) ctx.lineTo(f.xs[i], f.ys[i]);
  ctx.closePath();
  ctx.stroke();

  // Segments that were just hit flash white.
  glow(ctx, COLORS.fieldFlash, 16);
  ctx.lineWidth = 3;
  for (let i = 0; i < N; i++) {
    const a = f.flash[i];
    if (a <= 0) continue;
    const j = (i + 1) % N;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.moveTo(f.xs[i], f.ys[i]);
    ctx.lineTo(f.xs[j], f.ys[j]);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  noGlow(ctx);
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

export function drawShip(ctx: CanvasRenderingContext2D, ship: Ship, time: number): void {
  if (ship.invuln > 0 && Math.floor(time * 12) % 2 === 0) return;
  ctx.lineWidth = 2;
  if (ship.thrusting && Math.floor(time * 30) % 2 === 0) {
    glow(ctx, COLORS.thrust);
    poly(ctx, ship.x, ship.y, ship.angle, ship.r, [
      [-0.7, 0.4],
      [-1.6, 0],
      [-0.7, -0.4],
    ], false);
  }
  glow(ctx, COLORS.ship);
  drawShipIcon(ctx, ship.x, ship.y, ship.angle, ship.r);
  noGlow(ctx);
}

const STAR8 = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * TAU;
  const r = i % 2 === 0 ? 1 : 0.45;
  return [Math.cos(a) * r, Math.sin(a) * r];
});

export function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, color: string, time: number): void {
  ctx.lineWidth = 2;
  glow(ctx, color);
  switch (e.kind) {
    case 'droid':
      poly(ctx, e.x, e.y, e.spin, e.r, [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]);
      poly(ctx, e.x, e.y, e.spin, e.r * 0.45, [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]);
      break;
    case 'command': {
      const heading = Math.atan2(e.vy, e.vx);
      poly(ctx, e.x, e.y, heading, e.r, [
        [1.1, 0],
        [0.3, 0.8],
        [-0.9, 0.8],
        [-0.5, 0],
        [-0.9, -0.8],
        [0.3, -0.8],
      ]);
      poly(ctx, e.x, e.y, e.spin, e.r * 0.35, [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]);
      break;
    }
    case 'death':
      poly(ctx, e.x, e.y, e.spin, e.r, [
        [1, 0],
        [-0.5, 0.87],
        [-0.5, -0.87],
      ]);
      poly(ctx, e.x, e.y, -e.spin, e.r, [
        [1, 0],
        [-0.5, 0.87],
        [-0.5, -0.87],
      ]);
      break;
    case 'photon': {
      const pulse = 0.6 + 0.4 * Math.sin(time * 8 + e.phase);
      ctx.globalAlpha = pulse;
      poly(ctx, e.x, e.y, Math.PI / 4, e.r, [
        [1, 0],
        [-1, 0],
      ], false);
      poly(ctx, e.x, e.y, -Math.PI / 4, e.r, [
        [1, 0],
        [-1, 0],
      ], false);
      ctx.beginPath();
      ctx.arc(e.x, e.y, 1.5, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 'vapor':
      poly(ctx, e.x, e.y, e.spin, e.r, STAR8);
      break;
  }
  noGlow(ctx);
}

export function drawBullets(ctx: CanvasRenderingContext2D, bullets: Bullet[], color: string): void {
  glow(ctx, color, 6);
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fill();
  }
  noGlow(ctx);
}

export function drawParticles(ctx: CanvasRenderingContext2D, ps: Particle[]): void {
  ctx.lineWidth = 1.5;
  for (const p of ps) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.strokeStyle = p.color;
    const dx = Math.cos(p.angle) * p.len * 0.5;
    const dy = Math.sin(p.angle) * p.len * 0.5;
    ctx.beginPath();
    ctx.moveTo(p.x - dx, p.y - dy);
    ctx.lineTo(p.x + dx, p.y + dy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Debug overlay: the orbit track and wall normals (with wall velocity in orange). */
export function drawDebug(ctx: CanvasRenderingContext2D, arena: Arena): void {
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLORS.debug;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  for (let i = 0; i <= 128; i++) {
    const p = arena.trackPoint((i / 128) * TAU);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
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
