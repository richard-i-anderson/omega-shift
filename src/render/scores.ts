import { WORLD } from '../config';
import type { Board, Game } from '../game';
import { NAME_LEN, type ScoreEntry } from '../../shared/scores';
import { COLORS } from './draw';
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

/** Arcade-style name entry: the score, five big letter slots and how to use them. */
export function drawNameEntry(ctx: CanvasRenderingContext2D, g: Game): void {
  drawPanel(ctx, 1, 1);
  const top = PANEL.y;
  centred(ctx, 'NEW HIGH SCORE', top + 26, 22, COLORS.field, 1);
  centred(ctx, String(g.score), top + 74, 26, COLORS.text, 1);
  centred(ctx, 'ENTER YOUR NAME', top + 126, ROW_SIZE, COLORS.dimText, 1);
  const width = NAME_LEN * SLOT_PITCH - (SLOT_PITCH - textWidth('W', SLOT_SIZE));
  const x0 = WORLD.cx - width / 2;
  const blink = Math.floor(g.time * 4) % 2 === 0;
  for (let i = 0; i < NAME_LEN; i++) {
    const x = x0 + i * SLOT_PITCH;
    const current = i === g.nameCursor;
    const color = current ? HIGHLIGHT : COLORS.text;
    if (!current || blink) typed(ctx, g.nameSlots[i] ?? ' ', x, top + 162, SLOT_SIZE, color, 1);
    ctx.beginPath();
    ctx.moveTo(x - 4, top + 214);
    ctx.lineTo(x + textWidth('W', SLOT_SIZE) + 4, top + 214);
    ctx.strokeStyle = color;
    ctx.globalAlpha = current ? 1 : 0.5;
    ctx.lineWidth = current ? 3 : 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  centred(ctx, 'UP/DOWN: LETTER    LEFT/RIGHT: MOVE    ENTER: DONE', top + 250, 11, COLORS.dimText, 1);
  if (g.nameRejected) centred(ctx, REJECT_TEXT[g.nameRejected.reason], top + 296, 15, REJECT, 1);
}
