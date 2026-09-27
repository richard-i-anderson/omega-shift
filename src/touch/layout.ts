import { WORLD } from '../config';

/**
 * Where the game and the on-screen controls go in the window, in CSS pixels.
 * Without touch controls the game is letterboxed in the middle, as it always
 * was. With them, the game shrinks to leave room: in landscape the stick goes
 * in a band on the left and the buttons in a band on the right; in portrait
 * the game sits at the top and the controls go underneath it.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ButtonId = 'fire' | 'hyper' | 'bomb' | 'pause' | 'sound';

export interface ButtonSpot {
  id: ButtonId;
  x: number;
  y: number;
  r: number;
}

export interface Layout {
  /** The game canvas: the 1024×768 world scaled uniformly into it. */
  game: Rect;
  /** Present when touch controls are on. */
  touch?: {
    /** Where a thumb can land to start the stick. */
    stickZone: Rect;
    /** Where the stick rests (drawn faintly) before a thumb lands. */
    stickHome: { x: number; y: number };
    /** The stick's outer radius. */
    stickR: number;
    buttons: ButtonSpot[];
  };
}

/** The largest 4:3 rectangle inside `area`, placed by `alignY` (0 top, 0.5 centre). */
function fit(area: Rect, alignY = 0.5): Rect {
  const s = Math.min(area.w / WORLD.w, area.h / WORLD.h);
  const w = WORLD.w * s;
  const h = WORLD.h * s;
  return { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) * alignY, w, h };
}

export function computeLayout(width: number, height: number, touch: boolean): Layout {
  if (!touch) return { game: fit({ x: 0, y: 0, w: width, h: height }) };

  // One size for the controls, from the short side of the screen.
  const unit = Math.min(Math.max(Math.min(width, height) * 0.32, 120), 220);
  const stickR = unit * 0.48;

  if (width >= height) {
    // Landscape: controls in bands either side of the game.
    const game = fit({ x: unit, y: 0, w: width - 2 * unit, h: height });
    const band = Math.max(game.x, unit);
    const rightX = width - band / 2;
    return {
      game,
      touch: {
        stickZone: { x: 0, y: 0, w: game.x + game.w * 0.25, h: height },
        stickHome: { x: band / 2, y: height * 0.68 },
        stickR,
        buttons: [
          { id: 'fire', x: rightX, y: height * 0.7, r: unit * 0.34 },
          { id: 'hyper', x: rightX, y: height * 0.42, r: unit * 0.2 },
          { id: 'bomb', x: rightX, y: height * 0.22, r: unit * 0.2 },
          { id: 'pause', x: width - unit * 0.22, y: unit * 0.22, r: unit * 0.14 },
          { id: 'sound', x: unit * 0.22, y: unit * 0.22, r: unit * 0.14 },
        ],
      },
    };
  }

  // Portrait: the game at the top, controls in the space below.
  const controlsH = Math.max(unit * 1.6, height * 0.3);
  const game = fit({ x: 0, y: 0, w: width, h: height - controlsH }, 0);
  const top = game.y + game.h;
  const below = height - top;
  const midY = top + below * 0.55;
  const colX = width * 0.8;
  return {
    game,
    touch: {
      stickZone: { x: 0, y: top, w: width * 0.62, h: below },
      stickHome: { x: width * 0.3, y: midY },
      stickR,
      buttons: [
        { id: 'fire', x: colX, y: midY + unit * 0.32, r: unit * 0.34 },
        { id: 'hyper', x: colX, y: midY - unit * 0.35, r: unit * 0.2 },
        { id: 'bomb', x: colX, y: midY - unit * 0.8, r: unit * 0.2 },
        { id: 'pause', x: width - unit * 0.22, y: top + unit * 0.22, r: unit * 0.14 },
        { id: 'sound', x: unit * 0.22, y: top + unit * 0.22, r: unit * 0.14 },
      ],
    },
  };
}
