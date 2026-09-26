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

// Letterbox the fixed logical world into the window, at device resolution.
let scale = 1;
function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  scale = Math.min(window.innerWidth / WORLD.w, window.innerHeight / WORLD.h);
  canvas.style.width = `${Math.floor(WORLD.w * scale)}px`;
  canvas.style.height = `${Math.floor(WORLD.h * scale)}px`;
  canvas.width = Math.floor(WORLD.w * scale * dpr);
  canvas.height = Math.floor(WORLD.h * scale * dpr);
  scale *= dpr;
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
  drawOverlay(ctx, game);
  if (game.state === 'title') drawWelcome(ctx, game.idle, game.time, game.board);
  if (game.showDebug) drawDebug(ctx, game.arena);
  perf.draw(ctx);
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
