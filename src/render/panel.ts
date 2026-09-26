import { COLORS, haloStroke } from './draw';
import { vectorTextPath } from './vectorFont';

/**
 * The boxed panel that welcome pages, name entry and the high-score board
 * are drawn in: between the big title or banner (y 150) and "PRESS ENTER"
 * (y 598), dark enough to read over the arena.
 */
export const PANEL = { x: 92, y: 196, w: 840, h: 366 };

/** `fill`: how opaque the backing is (1 hides the score box behind, for the game-over screens). */
export function drawPanel(ctx: CanvasRenderingContext2D, alpha = 1, fill = 0.85): void {
  const { x, y, w, h } = PANEL;
  ctx.globalAlpha = alpha * fill;
  ctx.fillStyle = '#000';
  ctx.fillRect(x, y, w, h);
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  haloStroke(ctx, COLORS.field, 2, alpha);
  ctx.globalAlpha = 1;
}

/**
 * Types up to `budget` characters of `text` in the vector font, top-left at
 * (x, y) with cap height `size`, and returns what's left of the budget.
 * Pass `Infinity` to draw it all.
 */
export function typed(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  alpha: number,
  budget = Infinity,
): number {
  if (budget <= 0 || !text) return budget;
  const shown = budget >= text.length ? text : text.slice(0, budget);
  ctx.beginPath();
  vectorTextPath(ctx, shown, x, y, size);
  haloStroke(ctx, color, size > 20 ? 2.2 : size > 12 ? 1.6 : 1.3, alpha, 0.8);
  return budget - text.length;
}
