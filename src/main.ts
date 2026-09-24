import { PHYSICS_HZ, WORLD } from './config';
import { ENEMY_COLORS, Game } from './game';
import { Input } from './input';
import { startLoop } from './loop';
import { COLORS, drawArena, drawBullets, drawDebug, drawEnemy, drawParticles, drawShip } from './render/draw';
import { drawHud, drawOverlay } from './render/hud';
import { drawStars, makeStarfield } from './render/stars';
import { PerfOverlay } from './render/perf';

const canvas = document.getElementById('game') as HTMLCanvasElement;
// Opaque: the compositor needn't blend the canvas with the page behind it.
const ctx = canvas.getContext('2d', { alpha: false })!;
const input = new Input(window);
const game = new Game(new URLSearchParams(location.search).has('debug'));
const stars = makeStarfield();
const perf = new PerfOverlay();

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
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  drawStars(ctx, stars, game.time);
  drawArena(ctx, game.arena, alpha);
  for (const e of game.enemies) drawEnemy(ctx, e, ENEMY_COLORS[e.kind], game.time, alpha);
  drawBullets(ctx, game.enemyBullets, COLORS.enemyBullet, alpha);
  drawBullets(ctx, game.bullets, COLORS.bullet, alpha);
  if (game.ship) drawShip(ctx, game.ship, game.time, alpha);
  drawParticles(ctx, game.particles, alpha);
  if (game.state !== 'title') drawHud(ctx, game);
  drawOverlay(ctx, game);
  if (game.showDebug) drawDebug(ctx, game.arena);
  perf.draw(ctx);
}

let stepped = false;
startLoop(
  (dt) => {
    if (game.debugEnabled && input.wasPressed('KeyF')) perf.visible = !perf.visible;
    game.snapshot();
    game.update(dt, input);
    stepped = true;
  },
  (alpha) => {
    // Only drop unhandled key presses once the simulation has seen them.
    if (stepped) input.endFrame();
    stepped = false;
    render(alpha);
  },
  PHYSICS_HZ,
  (stats) => perf.record(stats),
);
