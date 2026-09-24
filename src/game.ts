import { Arena } from './arena/arena';
import { DTHETA } from './arena/field';
import { Bullet } from './entities/bullet';
import { isHunter, isMine, makeDroid, makeMine, promote, updateEnemy, type Enemy, type EnemyWorld } from './entities/enemies';
import { spawnBlast, updateParticles, type Particle } from './entities/particles';
import { Ship } from './entities/ship';
import {
  ENEMY,
  EXPLOSION,
  HYPERSPACE,
  LEVEL_CLEAR_SEC,
  LEVEL_TRANSITION_SEC,
  SCORE,
  SHIP,
  START_LIVES,
  WORLD,
  type BlastKind,
} from './config';
import { MAX_PENDING_EVENTS, type GameEvent } from './events';
import type { Input } from './input';
import { LEVELS, levelFor, validateLevel } from './levels/levels';
import { dist2, rand, smoothstep, TAU } from './math/vec';

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
/** Pixels between droids along the track when a wave spawns. */
const DROID_SPACING = 50;
const HYPER_COLOR = '#35e0ff';
/** The ship's blast cools from white-hot to fiery orange. */
const SHIP_BLAST_COLOR = '#ff9a3c';
/** Which explosion preset each enemy gets. */
const ENEMY_BLAST: Record<Enemy['kind'], BlastKind> = {
  droid: 'droid',
  command: 'command',
  death: 'death',
  photon: 'mine',
  vapor: 'mine',
};

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
  /** Screen-shake amplitude in px, decaying; render-only (see `shakeOffset`). */
  shake = 0;
  /** What happened since the browser layer last drained this (it plays sounds for them). */
  events: GameEvent[] = [];

  time = 0;
  stateTimer = 0;
  /** True on the card shown after clearing a wave (vs. the start of a game). */
  justCleared = false;
  /** Ships in the current wave when it spawned (the sound speeds up as they fall). */
  waveSize = 0;
  private respawnTimer = 0;
  private promoteTimer = 0;
  /** The score readout glides between levels' score positions. */
  private hudFrom: { x: number; y: number } = { x: WORLD.cx, y: WORLD.cy };
  private hudTo: { x: number; y: number } = { x: WORLD.cx, y: WORLD.cy };
  private hudT = 0;
  private hudDur = 0;

  constructor(debugEnabled: boolean) {
    this.debugEnabled = debugEnabled;
    for (const lvl of LEVELS) {
      const errors = validateLevel(lvl);
      if (errors.length) console.error(`Level ${lvl.name} is invalid:\n${errors.join('\n')}`);
    }
    // The title screen shows the morphing level in the background.
    const showcase = LEVELS[LEVELS.length - 1];
    this.arena = new Arena(WORLD.cx, WORLD.cy, showcase.keyframes, showcase.loop);
  }

  get levelName(): string {
    return levelFor(this.levelIndex).def.name;
  }

  /** Where the score readout is drawn. */
  get hudPos(): { x: number; y: number } {
    const s = this.hudDur > 0 ? smoothstep(this.hudT / this.hudDur) : 1;
    return {
      x: this.hudFrom.x + (this.hudTo.x - this.hudFrom.x) * s,
      y: this.hudFrom.y + (this.hudTo.y - this.hudFrom.y) * s,
    };
  }

  /**
   * How far to offset the whole picture for screen shake. A render-only
   * wobble from a few sines of game time; nothing in the simulation moves.
   */
  get shakeOffset(): { x: number; y: number } {
    if (!this.shake || this.paused || !EXPLOSION.shake.enabled) return { x: 0, y: 0 };
    const t = this.time;
    return {
      x: this.shake * (0.6 * Math.sin(t * 97) + 0.4 * Math.sin(t * 151 + 1)),
      y: this.shake * (0.6 * Math.sin(t * 89 + 2) + 0.4 * Math.sin(t * 137 + 3)),
    };
  }

  /**
   * Remember every moving thing's current position as its previous one. Called
   * before each step, so the renderer can draw in between the last two states.
   */
  snapshot(): void {
    this.ship?.snapshot();
    for (const list of [this.bullets, this.enemyBullets, this.enemies, this.particles]) {
      for (const o of list) {
        o.prevX = o.x;
        o.prevY = o.y;
      }
    }
    this.arena.outer.snapshot();
    this.arena.inner.snapshot();
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
    this.hudT += dt;
    updateParticles(this.particles, dt);
    this.shake = this.shake > 0.05 ? this.shake * Math.exp(-EXPLOSION.shake.decay * dt) : 0;

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
    for (const h of this.arena.hits) this.emit({ type: 'fieldHit', impact: h.impact, source: h.source });
    this.arena.hits.length = 0;
  }

  private emit(e: GameEvent): void {
    if (this.events.length < MAX_PENDING_EVENTS) this.events.push(e);
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
    this.hudFrom = this.hudPos;
    this.hudTo = def.scoreAt ?? { x: WORLD.cx, y: WORLD.cy };
    this.hudT = 0;
    this.hudDur = transitionSec;
    this.enemies = [];
    this.enemyBullets = [];
    this.state = 'levelClear';
    this.stateTimer = Math.max(transitionSec, 1.2);
    this.justCleared = false;
  }

  private spawnWave(): void {
    const { def, cycle } = levelFor(this.levelIndex);
    const count = def.droids + 2 * cycle;
    this.waveSize = count;
    const arena = this.arena;
    if (!this.ship) this.spawnShip(arena.openAngle(SHIP_SPAWN_THETA, SHIP.radius + 10));
    this.enemies = [];
    if (arena.isRing) {
      for (const theta of this.trackSpread(DROID_SPAWN_THETA, count, DROID_SPACING)) {
        this.enemies.push(makeDroid(arena, theta));
      }
    } else {
      // Share the droids between the chambers the ship isn't in, so the player
      // has to hyperspace to reach them.
      const here = arena.chamberAtPoint(this.ship!.x, this.ship!.y);
      let targets = arena.chambers.map((_, i) => i).filter((i) => i !== here);
      if (!targets.length) targets = [0];
      targets.forEach((c, ti) => {
        const n = Math.floor(count / targets.length) + (ti < count % targets.length ? 1 : 0);
        const mid = arena.chamberAngle(c);
        const width = arena.chambers[c].len * DTHETA * arena.trackRadius(mid);
        const spacing = Math.min(DROID_SPACING, (width * 0.6) / Math.max(n, 1));
        for (const theta of this.trackSpread(mid, n, spacing)) this.enemies.push(makeDroid(this.arena, theta));
      });
    }
    this.promoteTimer = ENEMY.promoteEvery / this.scale;
    this.state = 'playing';
    this.emit({ type: 'waveStart' });
  }

  /** `n` track angles centred on `theta`, `gap` pixels apart along the track. */
  private trackSpread(theta: number, n: number, gap: number): number[] {
    const half: number[] = [];
    const walk = (dir: number, count: number, first: number) => {
      const out: number[] = [];
      let t = theta;
      let p = this.arena.trackPoint(t);
      let want = first;
      while (out.length < count) {
        t += dir * 0.002;
        const q = this.arena.trackPoint(t);
        want -= Math.hypot(q.x - p.x, q.y - p.y);
        p = q;
        if (want <= 0) {
          out.push(t);
          want = gap;
        }
      }
      return out;
    };
    // Odd counts put one droid on `theta`; even counts straddle it.
    const odd = n % 2 === 1;
    if (odd) half.push(theta);
    const side = Math.floor(n / 2);
    const first = odd ? gap : gap / 2;
    return [...walk(-1, side, first).reverse(), ...half, ...walk(1, side, first)];
  }

  private spawnShip(theta: number): void {
    const p = this.arena.trackPoint(theta);
    this.ship = new Ship(p.x, p.y, -Math.PI / 2);
  }

  /** Respawn on the track wherever is furthest from anything dangerous. */
  private respawnShip(): void {
    this.spawnShip(this.safestAngle(Array.from({ length: 16 }, (_, i) => (i / 16) * TAU)));
  }

  /** Of the candidate track angles with room for the ship, the one furthest from any danger. */
  private safestAngle(thetas: number[]): number {
    let bestTheta = this.arena.openAngle(thetas[0], SHIP.radius + 10);
    let bestD = -1;
    for (const theta of thetas) {
      if (this.arena.halfGap(theta) < SHIP.radius + 10) continue;
      const p = this.arena.trackPoint(theta);
      let d = Infinity;
      for (const e of this.enemies) d = Math.min(d, dist2(p.x, p.y, e.x, e.y));
      for (const b of this.enemyBullets) d = Math.min(d, dist2(p.x, p.y, b.x, b.y));
      if (d > bestD) {
        bestD = d;
        bestTheta = theta;
      }
    }
    return bestTheta;
  }

  /**
   * Hyperspace: to the next chamber clockwise on a chambered level (landing on
   * its safest stretch), otherwise to a random spot on the track.
   */
  private hyperspace(ship: Ship): void {
    const arena = this.arena;
    let p: { x: number; y: number };
    if (arena.isRing) {
      const theta = arena.openAngle(rand(0, TAU), ship.r + 10);
      const room = Math.max(0, arena.halfGap(theta) - ship.r - 8);
      p = arena.trackPoint(theta, rand(-room, room));
    } else {
      const here = arena.chamberAtPoint(ship.x, ship.y);
      const next = (Math.max(here, -1) + 1) % arena.chambers.length;
      p = arena.trackPoint(this.safestAngle([0.25, 0.5, 0.75].map((f) => arena.chamberAngle(next, f))));
    }
    const fromX = ship.x;
    const fromY = ship.y;
    this.jumpShip(ship, p.x, p.y);
    ship.hyperCooldown = HYPERSPACE.cooldown;
    this.emit({ type: 'hyperspace', fromX, fromY, toX: p.x, toY: p.y });
  }

  private jumpShip(ship: Ship, x: number, y: number): void {
    this.blast('hyper', ship.x, ship.y, HYPER_COLOR);
    ship.x = x;
    ship.y = y;
    ship.vx = 0;
    ship.vy = 0;
    ship.snapshot(); // don't draw it streaking across the arena
    ship.invuln = Math.max(ship.invuln, HYPERSPACE.invuln);
    this.blast('hyper', x, y, HYPER_COLOR);
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
      if (input.wasPressed('KeyH') && ship.hyperCooldown <= 0) this.hyperspace(ship);
      // A corridor pinching shut as the arena morphs into a chambered level
      // would crush the ship; jump it clear instead.
      const theta = Math.atan2(ship.y - this.arena.cy, ship.x - this.arena.cx);
      if (this.arena.moving && this.arena.halfGap(theta) < ship.r + 2) {
        const p = this.arena.trackPoint(this.arena.openAngle(theta, ship.r + 10));
        this.jumpShip(ship, p.x, p.y);
      }
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
        this.emit({ type: 'shipFire' });
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
        if (this.enemies.filter(isMine).length < ENEMY.maxMines) {
          this.enemies.push(makeMine(kind, x, y));
          this.emit({ type: 'mineLaid', kind });
        }
      },
      emit: (e) => this.emit(e),
    };
    const dirs = this.enemies.map((e) => e.dir);
    for (const e of [...this.enemies]) updateEnemy(e, dt, world);
    // Droids in a chamber move as a formation: when one turns back at an end
    // wall, the rest of its chamber turns with it.
    if (!this.arena.isRing) {
      const turned = new Map<number, number>();
      this.enemies.forEach((e, i) => {
        if (e.kind === 'droid' && i < dirs.length && e.dir !== dirs[i]) turned.set(this.arena.chamberAt(e.theta), e.dir);
      });
      for (const e of this.enemies) {
        const dir = e.kind === 'droid' ? turned.get(this.arena.chamberAt(e.theta)) : undefined;
        if (dir !== undefined) e.dir = dir;
      }
    }
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
        this.emit({ type: 'promoted', to: 'command' });
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
    this.blast(ENEMY_BLAST[e.kind], e.x, e.y, ENEMY_COLORS[e.kind]);
    this.addScore(SCORE[e.kind]);
    this.emit({ type: 'enemyKilled', kind: e.kind, x: e.x, y: e.y });
  }

  /** An explosion of preset `kind` at (x, y), cooling to `color`; big ones shake the screen. */
  private blast(kind: BlastKind, x: number, y: number, color: string): void {
    spawnBlast(this.particles, kind, x, y, color);
    const shake = EXPLOSION.presets[kind].shake;
    if (shake > 0) this.shake = Math.min(EXPLOSION.shake.max, Math.max(this.shake, shake) + shake * 0.25);
  }

  private addScore(points: number): void {
    this.score += points;
    while (this.score >= this.nextExtraLife) {
      this.lives++;
      this.nextExtraLife += SCORE.extraLifeEvery;
      this.emit({ type: 'extraLife' });
    }
  }

  private killShip(): void {
    const ship = this.ship!;
    this.blast('ship', ship.x, ship.y, SHIP_BLAST_COLOR);
    this.ship = null;
    this.bullets = [];
    this.lives--;
    this.emit({ type: 'shipKilled', x: ship.x, y: ship.y });
    if (this.lives <= 0) {
      this.state = 'gameOver';
      this.stateTimer = 1.5;
      this.emit({ type: 'gameOver' });
    } else {
      this.respawnTimer = SHIP.respawnDelay;
    }
  }

  private levelCleared(): void {
    for (const e of this.enemies) this.blast(ENEMY_BLAST[e.kind], e.x, e.y, ENEMY_COLORS[e.kind]);
    this.enemies = [];
    this.enemyBullets = [];
    const next = this.levelIndex + 1;
    this.beginLevel(next, LEVEL_TRANSITION_SEC);
    this.stateTimer = Math.max(LEVEL_CLEAR_SEC, LEVEL_TRANSITION_SEC);
    this.justCleared = true;
    this.emit({ type: 'waveCleared' });
  }
}
