import { WORLD } from '../config';
import type { Game } from '../game';
import type { Input } from '../input';
import { COLORS, haloStroke } from '../render/draw';
import { nameHit } from '../render/scores';
import { textWidth, vectorTextPath } from '../render/vectorFont';
import type { ButtonId, ButtonSpot, Layout } from './layout';

/**
 * On-screen controls for touch screens, drawn on their own full-window
 * canvas over the game.
 *
 * The stick appears where the left thumb lands. Inside the inner ring it only
 * aims: the ship turns to face the thumb at its normal turning rate. Pushed
 * into the outer ring it also thrusts, at full power. The buttons (fire, held
 * for auto-fire; hyperspace; smart bomb; pause; sound) sit in a column on the
 * other side. Everything is fed into `Input` as the same key codes the
 * keyboard uses, so `Game` can't tell touch from keys.
 */

/** The stick's rings, as fractions of its outer radius. */
export const STICK = { dead: 0.2, thrust: 0.6 };

const BOMB_COLOR = '#ffb070';
const HOLD: Partial<Record<ButtonId, string>> = { fire: 'Space' };
const PRESS: Partial<Record<ButtonId, string>> = { hyper: 'KeyH', bomb: 'KeyB', pause: 'KeyP' };

interface Stick {
  pointer: number;
  bx: number;
  by: number;
  x: number;
  y: number;
  thrusting: boolean;
}

/** What a stick at offset (dx, dy) from its base does: an aim (or none, in the dead zone) and whether it thrusts. */
export function stickState(dx: number, dy: number, r: number): { aim: number | null; thrust: boolean } {
  const d = Math.hypot(dx, dy);
  if (d < STICK.dead * r) return { aim: null, thrust: false };
  return { aim: Math.atan2(dy, dx), thrust: d >= STICK.thrust * r };
}

export class TouchControls {
  layout: Layout | null = null;
  private stick: Stick | null = null;
  /** Which button each finger is holding. */
  private buttons = new Map<number, ButtonId>();

  constructor(
    private readonly input: Input,
    private readonly game: Game,
    private readonly toggleSound: () => void,
    private readonly muted: () => boolean,
  ) {}

  private get flying(): boolean {
    return (this.game.state === 'playing' || this.game.state === 'levelClear') && !this.game.paused;
  }

  private buttonAt(x: number, y: number): ButtonSpot | undefined {
    // A little bigger than drawn: fingers are blunt.
    return this.layout?.touch?.buttons.find((b) => Math.hypot(x - b.x, y - b.y) <= b.r * 1.25);
  }

  down(id: number, x: number, y: number): void {
    const t = this.layout?.touch;
    if (!t) return;
    const b = this.buttonAt(x, y);
    if (b?.id === 'sound') return this.toggleSound();
    if (this.game.paused) return this.input.press('KeyP'); // any tap resumes
    if (b) {
      // The flying buttons only work in play; a tap on one otherwise does nothing.
      if (!this.flying) return;
      const hold = HOLD[b.id];
      if (hold) {
        this.buttons.set(id, b.id);
        this.input.hold(hold, true);
      }
      const press = PRESS[b.id];
      if (press) this.input.press(press);
      return;
    }
    const z = t.stickZone;
    if (this.flying && !this.stick && x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) {
      this.stick = { pointer: id, bx: x, by: y, x, y, thrusting: false };
      return;
    }
    this.tapGame(x, y);
  }

  move(id: number, x: number, y: number): void {
    const s = this.stick;
    if (!s || s.pointer !== id || !this.layout?.touch) return;
    s.x = x;
    s.y = y;
    const { aim, thrust } = stickState(x - s.bx, y - s.by, this.layout.touch.stickR);
    if (aim !== null) this.input.aim = aim;
    if (thrust && !s.thrusting) navigator.vibrate?.(8);
    s.thrusting = thrust;
    this.input.hold('ArrowUp', thrust);
  }

  up(id: number): void {
    if (this.stick?.pointer === id) this.endStick();
    const b = this.buttons.get(id);
    if (b) {
      this.buttons.delete(id);
      const hold = HOLD[b];
      if (hold && ![...this.buttons.values()].includes(b)) this.input.hold(hold, false);
    }
  }

  private endStick(): void {
    this.stick = null;
    this.input.aim = null;
    this.input.hold('ArrowUp', false);
  }

  /** Let go of everything (the controls were hidden, or the game left play). */
  release(): void {
    this.endStick();
    this.buttons.clear();
    this.input.releaseAll();
  }

  /** A tap outside the flying controls: start, restart, or spell a name. */
  private tapGame(x: number, y: number): void {
    const g = this.layout!.game;
    const wx = ((x - g.x) / g.w) * WORLD.w;
    const wy = ((y - g.y) / g.h) * WORLD.h;
    switch (this.game.state) {
      case 'title':
      case 'gameOver':
        this.input.press('Enter');
        break;
      case 'enterName': {
        const hit = nameHit(wx, wy);
        if (hit === 'ok') this.input.press('Enter');
        else if (hit) this.game.nameTap(hit.slot, hit.dir);
        break;
      }
    }
  }

  /** Draw the controls on the overlay canvas (CSS pixels; the caller has scaled for the device). */
  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.clearRect(0, 0, width, height);
    const t = this.layout?.touch;
    if (!t) return;
    // Out of play, let go of anything still held.
    if (!this.flying && (this.stick || this.buttons.size)) this.release();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const live = this.flying ? 1 : 0.35;

    // The stick: dead zone, the inner (aim) ring, the outer (thrust) ring and the thumb.
    const s = this.stick;
    const bx = s?.bx ?? t.stickHome.x;
    const by = s?.by ?? t.stickHome.y;
    const r = t.stickR;
    const thrustColor = s?.thrusting ? COLORS.thrust : COLORS.field;
    ring(ctx, bx, by, r, thrustColor, (s ? 0.9 : 0.4) * live, s?.thrusting ? 3 : 2);
    ring(ctx, bx, by, r * STICK.thrust, COLORS.field, (s ? 0.7 : 0.3) * live, 1.5);
    if (s) {
      const dx = s.x - bx;
      const dy = s.y - by;
      const d = Math.hypot(dx, dy);
      const k = d > r ? r / d : 1;
      ctx.beginPath();
      ctx.arc(bx + dx * k, by + dy * k, r * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = s.thrusting ? COLORS.thrust : COLORS.field;
      ctx.globalAlpha = 0.35;
      ctx.fill();
      haloStroke(ctx, s.thrusting ? COLORS.thrust : COLORS.field, 2, 0.9);
      ctx.globalAlpha = 1;
    } else {
      label(ctx, 'MOVE', bx, by, r * 0.18, COLORS.dimText, 0.6 * live);
    }

    for (const b of t.buttons) {
      const pressed = [...this.buttons.values()].includes(b.id);
      let alpha = live;
      let color: string = COLORS.field;
      if (b.id === 'bomb') {
        color = BOMB_COLOR;
        if (this.game.bombs <= 0) alpha *= 0.4;
      } else if (b.id === 'hyper' && (this.game.ship?.hyperCooldown ?? 0) > 0) alpha *= 0.4;
      else if (b.id === 'fire') color = COLORS.text;
      if (b.id === 'sound' || (b.id === 'pause' && this.game.paused)) alpha = 1;
      if (pressed) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.25;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ring(ctx, b.x, b.y, b.r, color, 0.85 * alpha, b.id === 'fire' ? 3 : 2);
      const size = b.r * 0.32;
      if (b.id === 'fire') label(ctx, 'FIRE', b.x, b.y, size, color, alpha);
      else if (b.id === 'hyper') label(ctx, 'HYPER', b.x, b.y, b.r * 0.22, color, alpha);
      else if (b.id === 'bomb') label(ctx, this.game.bombs > 0 ? `BOMB ${this.game.bombs}` : 'BOMB', b.x, b.y, b.r * 0.2, color, alpha);
      else if (b.id === 'pause') pauseIcon(ctx, b.x, b.y, b.r, this.game.paused, alpha);
      else soundIcon(ctx, b.x, b.y, b.r, this.muted());
    }
  }
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number, width: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  haloStroke(ctx, color, width, alpha);
  ctx.globalAlpha = 1;
}

function label(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, alpha: number): void {
  ctx.beginPath();
  vectorTextPath(ctx, s, x - textWidth(s, size) / 2, y - size / 2, size);
  haloStroke(ctx, color, Math.max(1.2, size / 9), alpha, 0.8);
  ctx.globalAlpha = 1;
}

/** Two bars, or a play triangle while paused. */
function pauseIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, paused: boolean, alpha: number): void {
  const k = r * 0.4;
  ctx.beginPath();
  if (paused) {
    ctx.moveTo(x - k * 0.6, y - k);
    ctx.lineTo(x + k, y);
    ctx.lineTo(x - k * 0.6, y + k);
    ctx.closePath();
  } else {
    ctx.moveTo(x - k * 0.45, y - k);
    ctx.lineTo(x - k * 0.45, y + k);
    ctx.moveTo(x + k * 0.45, y - k);
    ctx.lineTo(x + k * 0.45, y + k);
  }
  haloStroke(ctx, COLORS.field, 2, alpha);
  ctx.globalAlpha = 1;
}

/** A speaker, with sound waves, or crossed out when muted. */
function soundIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, muted: boolean): void {
  const k = r * 0.4;
  ctx.beginPath();
  ctx.moveTo(x - k, y - k * 0.4);
  ctx.lineTo(x - k * 0.4, y - k * 0.4);
  ctx.lineTo(x + k * 0.2, y - k);
  ctx.lineTo(x + k * 0.2, y + k);
  ctx.lineTo(x - k * 0.4, y + k * 0.4);
  ctx.lineTo(x - k, y + k * 0.4);
  ctx.closePath();
  if (muted) {
    ctx.moveTo(x + k * 0.5, y - k * 0.5);
    ctx.lineTo(x + k * 1.1, y + k * 0.5);
    ctx.moveTo(x + k * 1.1, y - k * 0.5);
    ctx.lineTo(x + k * 0.5, y + k * 0.5);
  } else {
    ctx.moveTo(x + k * 0.55, y - k * 0.45);
    ctx.quadraticCurveTo(x + k * 0.9, y, x + k * 0.55, y + k * 0.45);
  }
  haloStroke(ctx, muted ? COLORS.dimText : COLORS.field, 2, 1);
  ctx.globalAlpha = 1;
}
