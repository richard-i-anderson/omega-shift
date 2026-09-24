import { PHYSICS_HZ, WORLD } from './config';
import { ENEMY_COLORS, Game } from './game';
import { Input } from './input';
import { startLoop } from './loop';
import { COLORS, drawArena, drawBullets, drawDebug, drawEnemy, drawParticles, drawShip } from './render/draw';
import { drawHud, drawOverlay } from './render/hud';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const input = new Input(window);
const game = new Game(new URLSearchParams(location.search).has('debug'));

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

function render(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  drawArena(ctx, game.arena);
  for (const e of game.enemies) drawEnemy(ctx, e, ENEMY_COLORS[e.kind], game.time);
  drawBullets(ctx, game.enemyBullets, COLORS.enemyBullet);
  drawBullets(ctx, game.bullets, COLORS.bullet);
  if (game.ship) drawShip(ctx, game.ship, game.time);
  drawParticles(ctx, game.particles);
  if (game.state !== 'title') drawHud(ctx, game);
  drawOverlay(ctx, game);
  if (game.showDebug) drawDebug(ctx, game.arena);
}

let stepped = false;
startLoop(
  (dt) => {
    game.update(dt, input);
    stepped = true;
  },
  () => {
    // Only drop unhandled key presses once the simulation has seen them.
    if (stepped) input.endFrame();
    stepped = false;
    render();
  },
  PHYSICS_HZ,
);
