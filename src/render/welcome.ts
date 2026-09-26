import { ENEMY, WORLD } from '../config';
import { makeBonus } from '../entities/bonus';
import { makeMine, type Enemy, type EnemyKind } from '../entities/enemies';
import { ENEMY_COLORS, type Board } from '../game';
import { welcomeView, WELCOME_PAGES, type EnemyPage, type StoryPage } from '../welcome';
import { drawBonuses } from './bonus';
import { COLORS, drawEnemy } from './draw';
import { drawPanel, PANEL, typed } from './panel';
import { drawBoard } from './scores';
import { textWidth } from './vectorFont';

const TITLE_SIZE = 18;
const STORY_SIZE = 13;
const STORY_LINE = 24;
const NAME_SIZE = 13;
const TEXT_SIZE = 11;
const ROW = 50;
const ICON_X = 150;
const TEXT_X = 190;
const POINTS_RIGHT = 880;

/** A stand-in enemy for the icon beside a row, turning slowly. */
function icon(kind: EnemyKind, x: number, y: number, time: number): Enemy {
  const e = makeMine('photon', x, y);
  e.kind = kind;
  e.r = ENEMY.radius[kind];
  e.spin = time * (kind === 'death' ? 4 : 1.5);
  e.vx = 1; // the command ship faces the way it's going
  return e;
}

function drawPage(ctx: CanvasRenderingContext2D, page: StoryPage | EnemyPage, chars: number, alpha: number, time: number): void {
  let left = typed(
    ctx,
    page.title,
    WORLD.cx - textWidth(page.title, TITLE_SIZE) / 2,
    PANEL.y + 22,
    TITLE_SIZE,
    COLORS.field,
    alpha,
    chars,
  );
  if (page.kind === 'story') {
    const width = Math.max(...page.lines.map((l) => textWidth(l, STORY_SIZE)));
    const x = WORLD.cx - width / 2;
    page.lines.forEach((line, i) => {
      left = typed(ctx, line, x, PANEL.y + 62 + i * STORY_LINE, STORY_SIZE, COLORS.text, alpha, left);
    });
    return;
  }
  page.rows.forEach((row, i) => {
    const y = PANEL.y + 62 + i * ROW;
    if (left > 0) {
      ctx.globalAlpha = alpha;
      if (row.icon === 'bonus') {
        const b = makeBonus('life', ICON_X, y + 10);
        b.age = 1; // past its pop-in
        drawBonuses(ctx, [b], time);
      } else if (row.icon === 'photon') {
        // Both kinds of mine.
        drawEnemy(ctx, icon('photon', ICON_X - 10, y + 10, time), ENEMY_COLORS.photon, time);
        drawEnemy(ctx, icon('vapor', ICON_X + 10, y + 10, time), ENEMY_COLORS.vapor, time);
      } else {
        drawEnemy(ctx, icon(row.icon, ICON_X, y + 10, time), ENEMY_COLORS[row.icon], time);
      }
      ctx.globalAlpha = 1;
    }
    const color = row.icon === 'bonus' ? COLORS.text : ENEMY_COLORS[row.icon];
    left = typed(ctx, row.name, TEXT_X, y, NAME_SIZE, color, alpha, left);
    left = typed(ctx, row.points, POINTS_RIGHT - textWidth(row.points, NAME_SIZE), y, NAME_SIZE, COLORS.text, alpha, left);
    left = typed(ctx, row.text, TEXT_X, y + 21, TEXT_SIZE, COLORS.dimText, alpha, left);
  });
}

/**
 * The welcome text over the title screen, once the game has sat there
 * untouched for a while (see `welcomeView`).
 */
export function drawWelcome(ctx: CanvasRenderingContext2D, idle: number, time: number, board: Board): void {
  const view = welcomeView(idle);
  if (!view) return;
  drawPanel(ctx, view.alpha);
  const page = WELCOME_PAGES[view.page];
  if (page.kind === 'scores') drawBoard(ctx, board, null, view.alpha);
  else drawPage(ctx, page, view.chars, view.alpha, time);
  ctx.globalAlpha = 1;
}
