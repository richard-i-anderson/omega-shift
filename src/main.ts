import { ambientDanger } from './audio/danger';
import { AudioEngine } from './audio/engine';
import { PHYSICS_HZ, WORLD } from './config';
import { ENEMY_COLORS, Game } from './game';
import { Input } from './input';
import { startLoop } from './loop';
import { COLORS, drawArena, drawBullets, drawDebug, drawEnemy, drawParticles, drawShip } from './render/draw';
import { drawHud, drawOverlay } from './render/hud';
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
  drawOverlay(ctx, game);
  if (game.showDebug) drawDebug(ctx, game.arena);
  perf.draw(ctx);
}

/** Hand what happened since the last frame to sound and the starfield; set the background pulse and thrust rumble. */
function drainEvents(): void {
  for (const e of game.events) {
    audio.play(e);
    stars.onEvent(e);
  }
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
