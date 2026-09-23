import { rand, TAU } from '../math/vec';

/** A spinning line fragment, for vector-style explosions. */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  len: number;
  life: number;
  maxLife: number;
  color: string;
}

export function explode(out: Particle[], x: number, y: number, color: string, count = 14, speed = 160): void {
  for (let i = 0; i < count; i++) {
    const a = rand(0, TAU);
    const s = rand(0.3, 1) * speed;
    const life = rand(0.5, 1.1);
    out.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      angle: rand(0, TAU),
      spin: rand(-10, 10),
      len: rand(3, 9),
      life,
      maxLife: life,
      color,
    });
  }
}

export function updateParticles(ps: Particle[], dt: number): void {
  let w = 0;
  for (const p of ps) {
    p.life -= dt;
    if (p.life <= 0) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.exp(-1.5 * dt);
    p.vy *= Math.exp(-1.5 * dt);
    p.angle += p.spin * dt;
    ps[w++] = p;
  }
  ps.length = w;
}
