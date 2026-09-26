import { BONUS, SHIP, WORLD } from '../config';
import type { Game } from '../game';
import { COLORS, drawShipIcon } from './draw';

const FONT = '"Courier New", ui-monospace, monospace';

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, weight = 'bold'): void {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillText(s, x, y);
  ctx.shadowBlur = 0;
}

const PANEL_W = 170;
const PANEL_H = 88;

/**
 * Score, level and lives: inside the inner force field, or in a panel outside
 * the arena on levels with no room there (it fades in as the score moves out).
 */
export function drawHud(ctx: CanvasRenderingContext2D, g: Game): void {
  const { x: cx, y: cy } = g.hudPos;
  const out = Math.min(1, Math.hypot(cx - WORLD.cx, cy - WORLD.cy) / 150);
  if (out > 0) {
    ctx.globalAlpha = out;
    ctx.strokeStyle = COLORS.field;
    ctx.shadowColor = COLORS.field;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - PANEL_W / 2, cy - PANEL_H / 2, PANEL_W, PANEL_H);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
  text(ctx, `LEVEL ${g.levelIndex + 1}`, cx, cy - 30, 12, COLORS.dimText);
  text(ctx, String(g.score).padStart(6, '0'), cx, cy, 26, COLORS.text);
  const shown = Math.min(g.lives - (g.ship ? 1 : 0), 6);
  ctx.strokeStyle = COLORS.text;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < shown; i++) {
    drawShipIcon(ctx, cx + (i - (shown - 1) / 2) * 18, cy + 30, -Math.PI / 2, SHIP.radius * 0.6);
  }
  // Smart bombs held, as small rings marked B (the key that fires one).
  for (let i = 0; i < g.bombs; i++) {
    const x = cx + (i - (g.bombs - 1) / 2) * 18;
    ctx.strokeStyle = BOMB_COLOR;
    ctx.beginPath();
    ctx.arc(x, cy + 47, 6, 0, Math.PI * 2);
    ctx.stroke();
    text(ctx, 'B', x, cy + 47.5, 9, BOMB_COLOR);
  }
}

const BOMB_COLOR = '#ffb070';

// The shield timer: a wide bar along the top edge, above every arena.
const BAR = { x: 362, y: 5, w: 300, h: 10 };

/**
 * While the ship is shielded, a bar across the top of the screen shows the
 * time left, with "SHIELD" and the seconds either side. Red and blinking for
 * the last few seconds.
 */
export function drawShieldBar(ctx: CanvasRenderingContext2D, g: Game): void {
  const left = g.ship?.shield ?? 0;
  if (left <= 0) return;
  const low = left <= BONUS.shieldWarn;
  const color = low ? COLORS.shieldLow : COLORS.shield;
  const lit = !low || Math.floor(g.time * 8) % 2 === 1;
  const { x, y, w, h } = BAR;
  // A black backing, so an arena corner behind it (DIAMOND's tip) doesn't show through.
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  ctx.strokeStyle = ctx.fillStyle = ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
  if (lit) ctx.fillRect(x, y, w * (left / BONUS.shieldSec), h);
  ctx.shadowBlur = 0;
  text(ctx, 'SHIELD', x - 42, y + h / 2 + 1, 13, color);
  text(ctx, String(Math.ceil(left)).padStart(2, ' '), x + w + 22, y + h / 2 + 1, 14, color);
}

/** Big messages for the title, level cards, pause and game over. */
export function drawOverlay(ctx: CanvasRenderingContext2D, g: Game): void {
  const { cx, h } = WORLD;
  const top = 150;
  const bottom = h - 150;
  const blink = Math.floor(g.time * 2) % 2 === 0;

  if (g.state === 'title') {
    text(ctx, 'OMEGA SHIFT', cx, top, 56, COLORS.field);
    if (blink) text(ctx, 'PRESS ENTER', cx, bottom - 20, 22, COLORS.text);
    text(ctx, '← → ROTATE   ↑ THRUST   SPACE FIRE   H HYPERSPACE   B BOMB   P PAUSE   M SOUND', cx, bottom + 16, 14, COLORS.dimText, 'normal');
    return;
  }
  if (g.state === 'levelClear') {
    if (g.justCleared) text(ctx, 'WAVE CLEARED', cx, top, 30, COLORS.field);
    text(ctx, `LEVEL ${g.levelIndex + 1}  ${g.levelName}`, cx, bottom, 26, COLORS.text);
  }
  if (g.state === 'gameOver') {
    text(ctx, 'GAME OVER', cx, top, 48, '#ff4040');
    if (g.stateTimer <= 0 && blink) text(ctx, 'PRESS ENTER', cx, bottom, 22, COLORS.text);
  }
  if (g.paused) text(ctx, 'PAUSED', cx, top, 40, COLORS.text);
}
