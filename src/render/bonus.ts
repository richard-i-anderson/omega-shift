import { BONUS } from '../config';
import type { Bonus } from '../entities/bonus';
import type { Popup } from '../game';
import { lerp, TAU } from '../math/vec';
import { drawShipIcon } from './draw';

// Bonuses must read as "collect me" at a glance, so they're the only round,
// rainbow-cycling things in the game: enemies are angular and one colour each.

const GLYPH_COLOR = { life: '#eaffd0', points: '#ffe9a0', bomb: '#ffd0c0' } as const;
const FONT = '"Courier New", ui-monospace, monospace';

const hue = (time: number, offset: number) => `hsl(${(time * 220 + offset) % 360}, 100%, 62%)`;

export function drawBonuses(ctx: CanvasRenderingContext2D, bonuses: Bonus[], time: number, alpha = 1): void {
  bonuses.forEach((b, i) => {
    const expiring = b.age > BONUS.life - BONUS.blinkLast;
    if (expiring && Math.floor(time * 8) % 2 === 0) return;
    const x = lerp(b.prevX, b.x, alpha);
    const y = lerp(b.prevY, b.y, alpha);
    // Pop in with a little overshoot, then pulse.
    const t = Math.min(1, b.age / 0.25);
    const pop = t < 1 ? t * (1 + 0.5 * Math.sin(t * Math.PI)) : 1;
    const r = b.r * pop * (1 + 0.12 * Math.sin(time * 8 + i));
    const off = i * 97;

    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = ctx.shadowColor = hue(time, off);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    // A faint outer ring in the complementary hue.
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = ctx.shadowColor = hue(time, off + 180);
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Three sparks orbiting.
    for (let k = 0; k < 3; k++) {
      const a = time * 4 + (k * TAU) / 3 + i;
      ctx.fillStyle = ctx.shadowColor = hue(time, off + k * 120);
      ctx.fillRect(x + Math.cos(a) * (r + 9) - 1.5, y + Math.sin(a) * (r + 9) - 1.5, 3, 3);
    }

    // What it is.
    ctx.shadowBlur = 8;
    const color = GLYPH_COLOR[b.kind];
    ctx.strokeStyle = ctx.fillStyle = ctx.shadowColor = color;
    if (b.kind === 'life') {
      ctx.lineWidth = 1.6;
      drawShipIcon(ctx, x, y + 1, -Math.PI / 2, r * 0.55);
    } else {
      ctx.font = `bold ${Math.round(r * 1.3)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.kind === 'points' ? '$' : 'B', x, y + 1);
    }
    ctx.shadowBlur = 0;
  });
}

/** "1UP", "+5000", "SMART BOMB" floating up from where a bonus was collected. */
export function drawPopups(ctx: CanvasRenderingContext2D, popups: Popup[], time: number): void {
  ctx.font = `bold 18px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of popups) {
    const k = p.age / BONUS.popupLife;
    ctx.globalAlpha = Math.max(0, 1 - k * k);
    ctx.fillStyle = ctx.shadowColor = hue(time, p.x);
    ctx.shadowBlur = 10;
    ctx.fillText(p.text, p.x, p.y - 22 - 40 * k);
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}
