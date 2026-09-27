import { WORLD } from '../config';
import type { Board, Game } from '../game';
import { NAME_LEN, type ScoreEntry } from '../../shared/scores';
import { COLORS, haloStroke } from './draw';
import { drawPanel, PANEL, typed } from './panel';
import { textWidth } from './vectorFont';

const HIGHLIGHT = '#ffe14f';
const REJECT = '#ff5a5a';
const TITLE_SIZE = 18;
const ROW_SIZE = 13;
const ROW = 22;
// Board columns: rank (right-aligned), name, score (right-aligned), level.
const RANK_RIGHT = 372;
const NAME_X = 392;
const SCORE_RIGHT = 622;
const LEVEL_X = 652;

/** Text centred on the screen. */
function centred(ctx: CanvasRenderingContext2D, s: string, y: number, size: number, color: string, alpha: number): void {
  typed(ctx, s, WORLD.cx - textWidth(s, size) / 2, y, size, color, alpha);
}

function right(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, alpha: number): void {
  typed(ctx, s, x - textWidth(s, size), y, size, color, alpha);
}

const same = (a: ScoreEntry, b: ScoreEntry | null) => !!b && a.name === b.name && a.score === b.score && a.level === b.level;

/**
 * The high-score board inside the panel: the global top 10 (or why it isn't
 * there), with `highlight` picked out, and this device's best underneath.
 */
export function drawBoard(ctx: CanvasRenderingContext2D, board: Board, highlight: ScoreEntry | null, alpha: number): void {
  const top = PANEL.y;
  centred(ctx, 'HIGH SCORES', top + 22, TITLE_SIZE, COLORS.field, alpha);
  const { global, best } = board;
  if (!global) {
    centred(ctx, 'GLOBAL SCORES OFFLINE', top + 140, ROW_SIZE, COLORS.dimText, alpha);
  } else if (!global.length) {
    centred(ctx, 'NO SCORES YET. BE THE FIRST!', top + 140, ROW_SIZE, COLORS.dimText, alpha);
  } else {
    let marked = false;
    global.slice(0, 10).forEach((e, i) => {
      const y = top + 62 + i * ROW;
      const hit = !marked && same(e, highlight);
      marked ||= hit;
      const color = hit ? HIGHLIGHT : COLORS.text;
      right(ctx, `${i + 1}.`, RANK_RIGHT, y, ROW_SIZE, hit ? HIGHLIGHT : COLORS.dimText, alpha);
      typed(ctx, e.name, NAME_X, y, ROW_SIZE, color, alpha);
      right(ctx, String(e.score), SCORE_RIGHT, y, ROW_SIZE, color, alpha);
      typed(ctx, `LV ${e.level}`, LEVEL_X, y + 2, 11, hit ? HIGHLIGHT : COLORS.dimText, alpha);
    });
  }
  const mine = best ? `YOUR BEST   ${best.name}   ${best.score}` : 'YOUR BEST   NONE YET';
  centred(ctx, mine, top + 306, ROW_SIZE, best && same(best, highlight) ? HIGHLIGHT : COLORS.field, alpha);
}

const REJECT_TEXT = {
  rude: 'NAME NOT ALLOWED',
  empty: 'ENTER AT LEAST ONE LETTER',
  invalid: 'NO GAPS INSIDE THE NAME',
} as const;

const SLOT_SIZE = 40;
const SLOT_PITCH = 64;
const SLOT_W = textWidth('W', SLOT_SIZE);
const SLOTS_X0 = WORLD.cx - (NAME_LEN * SLOT_PITCH - (SLOT_PITCH - SLOT_W)) / 2;
// Touch screens: arrows above and below each slot, and an OK button.
const ARROW_UP_Y = PANEL.y + 142;
const ARROW_DOWN_Y = PANEL.y + 232;
const OK = { x: WORLD.cx - 50, y: PANEL.y + 276, w: 100, h: 38 };

/**
 * What a tap at world point (x, y) on the name-entry screen means: a slot's
 * up or down arrow (the upper or lower half of its column), or OK.
 */
export function nameHit(x: number, y: number): { slot: number; dir: 1 | -1 } | 'ok' | null {
  if (x >= OK.x - 20 && x <= OK.x + OK.w + 20 && y >= OK.y - 10 && y <= OK.y + OK.h + 14) return 'ok';
  if (y < PANEL.y + 110 || y > PANEL.y + 256) return null;
  const slot = Math.floor((x - SLOTS_X0 + (SLOT_PITCH - SLOT_W) / 2) / SLOT_PITCH);
  if (slot < 0 || slot >= NAME_LEN) return null;
  return { slot, dir: y < PANEL.y + 188 ? 1 : -1 };
}

function arrow(ctx: CanvasRenderingContext2D, cx: number, y: number, up: boolean, color: string): void {
  const w = 12;
  const h = up ? -10 : 10;
  ctx.beginPath();
  ctx.moveTo(cx - w, y - h / 2);
  ctx.lineTo(cx, y + h / 2);
  ctx.lineTo(cx + w, y - h / 2);
  haloStroke(ctx, color, 2.2, 1, 0.8);
}

/**
 * Arcade-style name entry: the score, five big letter slots and how to use
 * them. With `touch`, arrows above and below each slot and an OK button
 * replace the keyboard hint.
 */
export function drawNameEntry(ctx: CanvasRenderingContext2D, g: Game, touch = false): void {
  drawPanel(ctx, 1, 1);
  const top = PANEL.y;
  centred(ctx, 'NEW HIGH SCORE', top + 26, 22, COLORS.field, 1);
  centred(ctx, String(g.score), top + 74, 26, COLORS.text, 1);
  if (!touch) centred(ctx, 'ENTER YOUR NAME', top + 126, ROW_SIZE, COLORS.dimText, 1);
  const x0 = SLOTS_X0;
  const blink = Math.floor(g.time * 4) % 2 === 0;
  for (let i = 0; i < NAME_LEN; i++) {
    const x = x0 + i * SLOT_PITCH;
    const current = i === g.nameCursor;
    const color = current ? HIGHLIGHT : COLORS.text;
    if (!current || blink) typed(ctx, g.nameSlots[i] ?? ' ', x, top + 162, SLOT_SIZE, color, 1);
    ctx.beginPath();
    ctx.moveTo(x - 4, top + 214);
    ctx.lineTo(x + SLOT_W + 4, top + 214);
    ctx.strokeStyle = color;
    ctx.globalAlpha = current ? 1 : 0.5;
    ctx.lineWidth = current ? 3 : 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (touch) {
      arrow(ctx, x + SLOT_W / 2, ARROW_UP_Y, true, color);
      arrow(ctx, x + SLOT_W / 2, ARROW_DOWN_Y, false, color);
    }
  }
  if (touch) {
    ctx.beginPath();
    ctx.rect(OK.x, OK.y, OK.w, OK.h);
    haloStroke(ctx, HIGHLIGHT, 2, 1);
    centred(ctx, 'OK', OK.y + 11, 16, HIGHLIGHT, 1);
    if (g.nameRejected) centred(ctx, REJECT_TEXT[g.nameRejected.reason], top + 330, 15, REJECT, 1);
  } else {
    centred(ctx, 'UP/DOWN: LETTER    LEFT/RIGHT: MOVE    ENTER: DONE', top + 250, 11, COLORS.dimText, 1);
    if (g.nameRejected) centred(ctx, REJECT_TEXT[g.nameRejected.reason], top + 296, 15, REJECT, 1);
  }
}
