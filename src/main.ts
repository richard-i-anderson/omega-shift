import { ambientDanger } from './audio/danger';
import { AudioEngine } from './audio/engine';
import { PHYSICS_HZ, WORLD } from './config';
import { ENEMY_COLORS, Game } from './game';
import { Input } from './input';
import { startLoop } from './loop';
import { COLORS, drawArena, drawBullets, drawDebug, drawEnemy, drawParticles, drawShip } from './render/draw';
import { drawHud, drawOverlay, drawShieldBar } from './render/hud';
import { drawWelcome } from './render/welcome';
import { fetchTop, loadBest, saveBest, scoresUrl, submitScore } from './scores/client';
import { drawBonuses, drawPopups } from './render/bonus';
import { Starfield } from './render/stars';
import { TouchControls } from './touch/controls';
import { computeLayout } from './touch/layout';
import { PerfOverlay } from './render/perf';

const canvas = document.getElementById('game') as HTMLCanvasElement;
// Opaque: the compositor needn't blend the canvas with the page behind it.
const ctx = canvas.getContext('2d', { alpha: false })!;
const input = new Input(window);
const game = new Game(new URLSearchParams(location.search).has('debug'));
const stars = new Starfield();
const perf = new PerfOverlay();
const audio = new AudioEngine();
audio.attach(window);
// High scores: this device's best now, the global board when it arrives.
game.board.best = loadBest();
function refreshBoard(): void {
  if (!scoresUrl()) return;
  fetchTop()
    .then((top) => (game.board.global = top))
    .catch(() => (game.board.global = null));
}
refreshBoard();
let lastState = game.state;

// Any key or click puts off the welcome text on the title screen.
window.addEventListener('keydown', () => game.wake());
window.addEventListener('pointerdown', () => game.wake());

// On-screen controls: off until the screen is touched, off again if a key is pressed.
const touchCanvas = document.getElementById('touch') as HTMLCanvasElement;
const touchCtx = touchCanvas.getContext('2d')!;
const touch = new TouchControls(
  input,
  game,
  () => audio.toggleMute(),
  () => audio.muted,
);
let touchMode = false;
function setTouchMode(on: boolean): void {
  if (on === touchMode) return;
  touchMode = on;
  document.body.classList.toggle('touch', on);
  if (!on) touch.release();
  resize();
}
window.addEventListener(
  'pointerdown',
  (e) => {
    if (e.pointerType !== 'touch' || touchMode) return;
    setTouchMode(true);
    touch.down(e.pointerId, e.clientX, e.clientY); // the first touch counts too
  },
  true,
);
window.addEventListener('keydown', (e) => {
  if (touchMode && !e.repeat && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'Enter'].includes(e.code)) setTouchMode(false);
});
touchCanvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  touchCanvas.setPointerCapture(e.pointerId);
  touch.down(e.pointerId, e.clientX, e.clientY);
});
touchCanvas.addEventListener('pointermove', (e) => touch.move(e.pointerId, e.clientX, e.clientY));
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
  touchCanvas.addEventListener(type, (e) => touch.up(e.pointerId));
}
touchCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Letterbox the fixed logical world into the window at device resolution,
// leaving room for the on-screen controls when they're showing.
let scale = 1;
let dpr = 1;
function resize(): void {
  dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const layout = computeLayout(w, h, touchMode);
  touch.layout = layout;
  const g = layout.game;
  canvas.style.left = `${Math.round(g.x)}px`;
  canvas.style.top = `${Math.round(g.y)}px`;
  canvas.style.width = `${Math.floor(g.w)}px`;
  canvas.style.height = `${Math.floor(g.h)}px`;
  canvas.width = Math.floor(g.w * dpr);
  canvas.height = Math.floor(g.h * dpr);
  scale = (Math.floor(g.w) / WORLD.w) * dpr;
  touchCanvas.style.width = `${w}px`;
  touchCanvas.style.height = `${h}px`;
  touchCanvas.width = Math.floor(w * dpr);
  touchCanvas.height = Math.floor(h * dpr);
}
window.addEventListener('resize', resize);
resize();

/** `alpha`: how far between the previous and the current simulation state to draw, in [0, 1). */
function render(alpha: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const shake = game.shakeOffset; // render-only; physics never sees it
  ctx.setTransform(scale, 0, 0, scale, shake.x * scale, shake.y * scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  stars.draw(ctx, alpha);
  drawArena(ctx, game.arena, alpha);
  drawBonuses(ctx, game.bonuses, game.time, alpha);
  for (const e of game.enemies) drawEnemy(ctx, e, ENEMY_COLORS[e.kind], game.time, alpha);
  drawBullets(ctx, game.enemyBullets, COLORS.enemyBullet, alpha);
  drawBullets(ctx, game.bullets, COLORS.bullet, alpha);
  if (game.ship) drawShip(ctx, game.ship, game.time, alpha);
  drawParticles(ctx, game.particles, alpha);
  drawPopups(ctx, game.popups, game.time);
  if (game.state !== 'title') drawHud(ctx, game);
  drawShieldBar(ctx, game);
  drawOverlay(ctx, game, touchMode);
  if (game.state === 'title') drawWelcome(ctx, game.idle, game.time, game.board);
  if (game.showDebug) drawDebug(ctx, game.arena);
  perf.draw(ctx);
  if (touchMode) {
    touchCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    touch.draw(touchCtx, window.innerWidth, window.innerHeight);
  }
}

/** Hand what happened since the last frame to sound and the starfield; set the background pulse and thrust rumble. */
function drainEvents(): void {
  for (const e of game.events) {
    audio.play(e);
    stars.onEvent(e);
    if (e.type === 'scoreEntered') {
      // Game has already made it this device's best if it is.
      if (game.board.best && game.board.best.score === e.score) saveBest(game.board.best);
      if (scoresUrl()) {
        submitScore(e)
          .then((top) => (game.board.global = top))
          .catch(() => {}); // the board keeps what it had
      }
    }
  }
  // Back on the title: fetch the board again, so the attract loop is current.
  if (game.state === 'title' && lastState !== 'title') refreshBoard();
  lastState = game.state;
  game.events.length = 0;
  const flying = !game.paused && (game.state === 'playing' || game.state === 'levelClear');
  audio.updateAmbient(ambientDanger(game), flying && !!game.ship?.thrusting);
}

let stepped = false;
startLoop(
  (dt) => {
    if (input.wasPressed('KeyM')) audio.toggleMute();
    if (game.debugEnabled && input.wasPressed('KeyF')) perf.visible = !perf.visible;
    game.snapshot();
    game.update(dt, input);
    if (!game.paused) stars.update(dt);
    stepped = true;
  },
  (alpha) => {
    drainEvents();
    // Only drop unhandled key presses once the simulation has seen them.
    if (stepped) input.endFrame();
    stepped = false;
    render(alpha);
  },
  PHYSICS_HZ,
  (stats) => perf.record(stats),
);
