import { Arena } from './arena/arena';
import { validateKeyframes } from './arena/arena';
import { Bullet } from './entities/bullet';
import { isHunter, isMine, makeDroid, makeMine, promote, updateEnemy, type Enemy, type EnemyWorld } from './entities/enemies';
import { explode, updateParticles, type Particle } from './entities/particles';
import { Ship } from './entities/ship';
import { ARENA, ENEMY, LEVEL_CLEAR_SEC, LEVEL_TRANSITION_SEC, SCORE, SHIP, START_LIVES, WORLD } from './config';
import type { Input } from './input';
import { LEVELS, levelFor } from './levels/levels';
import { dist2, rand, TAU } from './math/vec';

export type GameState = 'title' | 'playing' | 'levelClear' | 'gameOver';

export const ENEMY_COLORS: Record<Enemy['kind'], string> = {
  droid: '#ff4fd8',
  command: '#ffe14f',
  death: '#ff4040',
  photon: '#6dff8a',
  vapor: '#ff9a3c',
};

/** Where the player (re)spawns and where droids start: opposite sides of the track. */
const SHIP_SPAWN_THETA = Math.PI;
const DROID_SPAWN_THETA = 0;
const DROID_SPACING = 0.2;

export class Game {
  state: GameState = 'title';
  paused = false;
  showDebug = false;
  readonly debugEnabled: boolean;

  arena: Arena;
  levelIndex = 0;
  scale = 1;
  score = 0;
  lives = START_LIVES;
  private nextExtraLife: number = SCORE.extraLifeEvery;

  ship: Ship | null = null;
  bullets: Bullet[] = [];
  enemyBullets: Bullet[] = [];
  enemies: Enemy[] = [];
  particles: Particle[] = [];

  time = 0;
  stateTimer = 0;
  /** True on the card shown after clearing a wave (vs. the start of a game). */
  justCleared = false;
  private respawnTimer = 0;
  private promoteTimer = 0;

  constructor(debugEnabled: boolean) {
    this.debugEnabled = debugEnabled;
    for (const lvl of LEVELS) {
      const errors = validateKeyframes(lvl.keyframes, ARENA.minGap, ARENA.minInnerRadius);
      if (errors.length) console.error(`Level ${lvl.name} is invalid:\n${errors.join('\n')}`);
    }
    // The title screen shows the morphing level in the background.
    const showcase = LEVELS[LEVELS.length - 1];
    this.arena = new Arena(WORLD.cx, WORLD.cy, showcase.keyframes, showcase.loop);
  }

  get levelName(): string {
    return levelFor(this.levelIndex).def.name;
  }

  update(dt: number, input: Input): void {
    if (this.debugEnabled) {
      if (input.wasPressed('Backquote')) this.showDebug = !this.showDebug;
      for (let i = 1; i <= LEVELS.length; i++) {
        if (input.wasPressed(`Digit${i}`)) {
          if (this.state === 'title' || this.state === 'gameOver') this.resetRun();
          this.beginLevel(i - 1, LEVEL_TRANSITION_SEC);
        }
      }
    }
    if ((this.state === 'playing' || this.state === 'levelClear') && input.wasPressed('KeyP', 'Escape')) {
      this.paused = !this.paused;
    }
    if (this.paused) return;

    this.time += dt;
    this.stateTimer -= dt;
    this.arena.update(dt);
    updateParticles(this.particles, dt);

    switch (this.state) {
      case 'title':
        if (input.wasPressed('Enter', 'Space')) this.startGame();
        break;
      case 'playing':
        this.updatePlay(dt, input);
        break;
      case 'levelClear':
        this.updateShipAndShots(dt, input);
        if (this.stateTimer <= 0) this.spawnWave();
        break;
      case 'gameOver':
        this.updateEnemies(dt);
        if (this.stateTimer <= 0 && input.wasPressed('Enter', 'Space')) this.startGame();
        break;
    }
  }

  private resetRun(): void {
    this.score = 0;
    this.lives = START_LIVES;
    this.nextExtraLife = SCORE.extraLifeEvery;
    this.paused = false;
  }

  private startGame(): void {
    this.resetRun();
    this.beginLevel(0, LEVEL_TRANSITION_SEC);
  }

  /** Morph the arena to level `index` and put the "get ready" card up. */
  private beginLevel(index: number, transitionSec: number): void {
    const { def, scale } = levelFor(index);
    this.levelIndex = index;
    this.scale = scale;
    this.arena.setLevel(def.keyframes, def.loop, transitionSec);
    this.enemies = [];
    this.enemyBullets = [];
    this.state = 'levelClear';
    this.stateTimer = Math.max(transitionSec, 1.2);
    this.justCleared = false;
  }

  private spawnWave(): void {
    const { def, cycle } = levelFor(this.levelIndex);
    const count = def.droids + 2 * cycle;
    this.enemies = [];
    for (let i = 0; i < count; i++) {
      const theta = DROID_SPAWN_THETA + (i - (count - 1) / 2) * DROID_SPACING;
      this.enemies.push(makeDroid(this.arena, theta));
    }
    if (!this.ship) this.spawnShip(SHIP_SPAWN_THETA);
    this.promoteTimer = ENEMY.promoteEvery / this.scale;
    this.state = 'playing';
  }

  private spawnShip(theta: number): void {
    const p = this.arena.trackPoint(theta);
    this.ship = new Ship(p.x, p.y, -Math.PI / 2);
  }

  /** Respawn on the track wherever is furthest from anything dangerous. */
  private respawnShip(): void {
    let bestTheta = SHIP_SPAWN_THETA;
    let bestD = -1;
    for (let i = 0; i < 16; i++) {
      const theta = (i / 16) * TAU;
      const p = this.arena.trackPoint(theta);
      let d = Infinity;
      for (const e of this.enemies) d = Math.min(d, dist2(p.x, p.y, e.x, e.y));
      for (const b of this.enemyBullets) d = Math.min(d, dist2(p.x, p.y, b.x, b.y));
      if (d > bestD) {
        bestD = d;
        bestTheta = theta;
      }
    }
    this.spawnShip(bestTheta);
  }

  private updateShipAndShots(dt: number, input: Input): void {
    const ship = this.ship;
    if (ship) {
      ship.update(
        dt,
        {
          left: input.isDown('ArrowLeft', 'KeyA'),
          right: input.isDown('ArrowRight', 'KeyD'),
          thrust: input.isDown('ArrowUp', 'KeyW'),
        },
        this.arena,
      );
      if (input.isDown('Space') && ship.cooldown <= 0 && this.bullets.length < SHIP.maxBullets) {
        const n = ship.nose();
        this.bullets.push(
          new Bullet(
            n.x,
            n.y,
            ship.vx + Math.cos(ship.angle) * SHIP.bulletSpeed,
            ship.vy + Math.sin(ship.angle) * SHIP.bulletSpeed,
            SHIP.bulletLife,
          ),
        );
        ship.cooldown = SHIP.fireCooldown;
      }
    }
    for (const b of this.bullets) b.update(dt, this.arena);
    this.bullets = this.bullets.filter((b) => !b.dead);
  }

  private updateEnemies(dt: number): void {
    const world: EnemyWorld = {
      arena: this.arena,
      scale: this.scale,
      target: this.ship,
      fire: (x, y, tx, ty) => {
        const a = Math.atan2(ty - y, tx - x) + rand(-0.08, 0.08);
        const s = ENEMY.bulletSpeed * this.scale;
        this.enemyBullets.push(new Bullet(x, y, Math.cos(a) * s, Math.sin(a) * s, ENEMY.bulletLife));
      },
      layMine: (kind, x, y) => {
        if (this.enemies.filter(isMine).length < ENEMY.maxMines) this.enemies.push(makeMine(kind, x, y));
      },
    };
    for (const e of [...this.enemies]) updateEnemy(e, dt, world);
    for (const b of this.enemyBullets) b.update(dt, this.arena);
    this.enemyBullets = this.enemyBullets.filter((b) => !b.dead);
  }

  private updatePlay(dt: number, input: Input): void {
    this.updateShipAndShots(dt, input);
    this.updateEnemies(dt);

    // Promote a droid to a command ship every so often.
    this.promoteTimer -= dt;
    if (this.promoteTimer <= 0) {
      this.promoteTimer = ENEMY.promoteEvery / this.scale;
      const droids = this.enemies.filter((e) => e.kind === 'droid');
      if (droids.length && this.enemies.filter(isHunter).length < ENEMY.maxHunters) {
        promote(droids[Math.floor(Math.random() * droids.length)], this.scale);
      }
    }

    // Player shots vs enemies.
    for (const b of this.bullets) {
      for (const e of this.enemies) {
        if (e.dead || b.dead) continue;
        const rr = e.r + b.r + 2;
        if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
          b.dead = true;
          this.killEnemy(e);
        }
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);

    // Anything vs the ship.
    const ship = this.ship;
    if (ship && ship.invuln <= 0) {
      const hit =
        this.enemies.some((e) => !e.dead && dist2(ship.x, ship.y, e.x, e.y) < (e.r + ship.r * 0.8) ** 2) ||
        this.enemyBullets.some((b) => dist2(ship.x, ship.y, b.x, b.y) < (b.r + ship.r * 0.8) ** 2);
      if (hit) this.killShip();
    }
    this.enemies = this.enemies.filter((e) => !e.dead);

    if (!this.ship && this.state === 'playing') {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawnShip();
    }

    if (this.state === 'playing' && !this.enemies.some((e) => e.kind === 'droid' || isHunter(e))) {
      this.levelCleared();
    }
  }

  private killEnemy(e: Enemy): void {
    e.dead = true;
    explode(this.particles, e.x, e.y, ENEMY_COLORS[e.kind], isMine(e) ? 8 : 16);
    this.addScore(SCORE[e.kind]);
  }

  private addScore(points: number): void {
    this.score += points;
    while (this.score >= this.nextExtraLife) {
      this.lives++;
      this.nextExtraLife += SCORE.extraLifeEvery;
    }
  }

  private killShip(): void {
    const ship = this.ship!;
    explode(this.particles, ship.x, ship.y, '#ffffff', 30, 220);
    this.ship = null;
    this.bullets = [];
    this.lives--;
    if (this.lives <= 0) {
      this.state = 'gameOver';
      this.stateTimer = 1.5;
    } else {
      this.respawnTimer = SHIP.respawnDelay;
    }
  }

  private levelCleared(): void {
    for (const e of this.enemies) explode(this.particles, e.x, e.y, ENEMY_COLORS[e.kind], 6);
    this.enemies = [];
    this.enemyBullets = [];
    const next = this.levelIndex + 1;
    this.beginLevel(next, LEVEL_TRANSITION_SEC);
    this.stateTimer = Math.max(LEVEL_CLEAR_SEC, LEVEL_TRANSITION_SEC);
    this.justCleared = true;
  }
}
