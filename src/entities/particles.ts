import { EXPLOSION, type BlastKind } from '../config';
import { rand, TAU } from '../math/vec';

/**
 * One piece of an explosion.
 * - `shard`: a long tumbling line.
 * - `spark`: a short bright streak along its direction of travel.
 * - `ring`: an expanding shockwave circle; `len` is its final radius.
 * - `flash`: a brief bright disc at the centre; `len` is its radius.
 */
export type ParticleKind = 'shard' | 'spark' | 'ring' | 'flash';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  /** Position before the latest step, for drawing in between steps. */
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  /** Turns the velocity, rad/s (the hyperspace swirl). */
  curl: number;
  /** Velocity decay rate, 1/s. */
  drag: number;
  len: number;
  life: number;
  maxLife: number;
  /** The colour it cools to; drawn white-hot first (see `Palette`). */
  color: string;
  palette: Palette;
}

/** Steps from white-hot (0) to the base colour (COOL_STEPS − 1). */
export const COOL_STEPS = 5;

/** A colour's white-hot → base ramp, shared by every particle of that colour. */
export interface Palette {
  id: number;
  steps: string[];
}

const palettes = new Map<string, Palette>();
export const paletteList: Palette[] = [];

function hex(c: string): [number, number, number] {
  const h = c.replace('#', '');
  const full = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function paletteFor(color: string): Palette {
  let p = palettes.get(color);
  if (!p) {
    const [r, g, b] = hex(color);
    const steps: string[] = [];
    for (let k = 0; k < COOL_STEPS; k++) {
      const f = k / (COOL_STEPS - 1);
      const mix = (c: number) => Math.round(255 + (c - 255) * f);
      steps.push(`rgb(${mix(r)},${mix(g)},${mix(b)})`);
    }
    p = { id: paletteList.length, steps };
    palettes.set(color, p);
    paletteList.push(p);
  }
  return p;
}

/** Which step of its palette a particle is at: white while hot, then cooling. */
export function coolStep(p: Particle): number {
  const t = 1 - p.life / p.maxLife;
  const hot = EXPLOSION.hotShare;
  if (t < hot) return 0;
  return Math.min(COOL_STEPS - 1, 1 + Math.floor(((t - hot) / (1 - hot)) * (COOL_STEPS - 1)));
}

function add(out: Particle[], p: Omit<Particle, 'prevX' | 'prevY' | 'maxLife'>): void {
  out.push({ ...p, prevX: p.x, prevY: p.y, maxLife: p.life });
}

/** Total particles one blast of `kind` spawns. */
export function blastSize(kind: BlastKind): number {
  const b = EXPLOSION.presets[kind];
  return b.shards + b.sparks + 2;
}

/** Spawn a whole explosion of `kind` at (x, y), cooling to `color`. Keeps `out` under the cap. */
export function spawnBlast(out: Particle[], kind: BlastKind, x: number, y: number, color: string): void {
  const b = EXPLOSION.presets[kind];
  const palette = paletteFor(color);
  const common = { x, y, color, palette, drag: b.drag };
  const curl = () => (b.curl ? b.curl * rand(0.6, 1.2) : 0);
  // Flash first, so it draws under the fragments.
  add(out, { ...common, kind: 'flash', vx: 0, vy: 0, angle: 0, spin: 0, curl: 0, len: b.flash.radius, life: b.flash.life });
  add(out, { ...common, kind: 'ring', vx: 0, vy: 0, angle: 0, spin: 0, curl: 0, len: b.ring.radius, life: b.ring.life });
  for (let i = 0; i < b.shards; i++) {
    const a = rand(0, TAU);
    // Biased towards full speed so the blast has a clear expanding front.
    const s = Math.sqrt(rand(0.1, 1)) * b.speed;
    add(out, {
      ...common,
      kind: 'shard',
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      angle: rand(0, TAU),
      spin: rand(-b.spin, b.spin),
      curl: curl(),
      len: rand(b.len[0], b.len[1]),
      life: rand(b.life[0], b.life[1]),
    });
  }
  for (let i = 0; i < b.sparks; i++) {
    const a = rand(0, TAU);
    const s = rand(0.55, 1) * b.sparkSpeed;
    add(out, {
      ...common,
      kind: 'spark',
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      angle: a,
      spin: 0,
      curl: curl(),
      len: rand(b.sparkLen[0], b.sparkLen[1]),
      // Sparks burn out quicker than shards.
      life: rand(b.life[0], b.life[1]) * 0.6,
    });
  }
  if (out.length > EXPLOSION.maxParticles) out.splice(0, out.length - EXPLOSION.maxParticles);
}

export function updateParticles(ps: Particle[], dt: number): void {
  let w = 0;
  for (const p of ps) {
    p.life -= dt;
    if (p.life <= 0) continue;
    if (p.curl) {
      const c = Math.cos(p.curl * dt);
      const s = Math.sin(p.curl * dt);
      const vx = p.vx * c - p.vy * s;
      p.vy = p.vx * s + p.vy * c;
      p.vx = vx;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const k = Math.exp(-p.drag * dt);
    p.vx *= k;
    p.vy *= k;
    p.angle += p.spin * dt;
    ps[w++] = p;
  }
  ps.length = w;
}
