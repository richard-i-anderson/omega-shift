export const TAU = Math.PI * 2;

export function normAngle(t: number): number {
  t %= TAU;
  return t < 0 ? t + TAU : t;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}
