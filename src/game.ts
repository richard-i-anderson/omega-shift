import { Arena } from './arena/arena';
import { DTHETA } from './arena/field';
import { Bullet } from './entities/bullet';
import { isBonusDropper, makeBonus, pickBonusKind, updateBonus, type Bonus, type BonusKind } from './entities/bonus';
import {
  isHunter,
  isMine,
  isShip,
  makeDroid,
  makeMine,
  makeTanker,
  promote,
  updateEnemy,
  type Enemy,
  type EnemyWorld,
  type SpawnKind,
} from './entities/enemies';
import { spawnBlast, updateParticles, type Particle } from './entities/particles';
import { Ship } from './entities/ship';
import {
  BONUS,
  ENEMY,
  EXPLOSION,
  HYPERSPACE,
  LEVEL_CLEAR_SEC,
  LEVEL_TRANSITION_SEC,
  MAX_LIVES,
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

/** Text that floats up from a collected bonus. */
export interface Popup {
  text: string;
  x: number;
  y: number;
  age: number;
}

export const ENEMY_COLORS: Record<Enemy['kind'], string> = {
  droid: '#ff4fd8',
  command: '#ffe14f',
  death: '#ff4040',
  tanker: '#9a7bff',
  photon: '#6dff8a',
  vapor: '#ff9a3c',
};

/** Where the player (re)spawns and where droids start: opposite sides of the track. */
const SHIP_SPAWN_THETA = Math.PI;
const DROID_SPAWN_THETA = 0;
/**
 * Where tankers start on a connected level: a quarter turn from both the ship
 * and the droids, then between them.
 */
const TANKER_SPAWN_THETAS = [Math.PI / 2, (3 * Math.PI) / 2, (7 * Math.PI) / 4];
/** Pixels between droids along the track when a wave spawns. */
const DROID_SPACING = 50;
/** Debug keys that jump to levels 1–9, 10 (`0`) and 11 (`-`). */
export const LEVEL_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus'];
const HYPER_COLOR = '#35e0ff';
/** The ship's blast cools from white-hot to fiery orange. */
const SHIP_BLAST_COLOR = '#ff9a3c';
/** Which explosion preset each enemy gets. */
const ENEMY_BLAST: Record<Enemy['kind'], BlastKind> = {
  droid: 'droid',
  command: 'command',
  death: 'death',
  tanker: 'tanker',
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
  bonuses: Bonus[] = [];
  popups: Popup[] = [];
  /** Smart bombs held; B sets one off. */
  bombs = 0;
  /** Screen-shake amplitude in px, decaying; render-only (see `shakeOffset`). */
  shake = 0;
  /** What happened since the browser layer last drained this (it plays sounds for them). */
  events: GameEvent[] = [];

  time = 0;
  stateTimer = 0;
  /** True on the card shown after clearing a wave (vs. the start of a game). */
  justCleared = false;
  /** Seconds on the title screen since a key was last pressed (the welcome text waits for it). */
  idle = 0;
  /** Ships in the current wave: those it spawned with plus any tankers launched (the sound speeds up as they fall). */
  waveSize = 0;
  private respawnTimer = 0;
  private promoteTimer = 0;
  private bonusTimer = 0;
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
    this.arena = new Arena(WORLD.cx, WORLD.cy, showcase.keyframes, showcase.loop, showcase.motion);
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
    for (const list of [this.bullets, this.enemyBullets, this.enemies, this.particles, this.bonuses]) {
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
      LEVEL_KEYS.slice(0, LEVELS.length).forEach((key, i) => {
        if (input.wasPressed(key)) {
          if (this.state === 'title' || this.state === 'gameOver') this.resetRun();
          this.beginLevel(i, LEVEL_TRANSITION_SEC);
        }
      });
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
    for (const p of this.popups) p.age += dt;
    this.popups = this.popups.filter((p) => p.age < BONUS.popupLife);
    this.shake = this.shake > 0.05 ? this.shake * Math.exp(-EXPLOSION.shake.decay * dt) : 0;

    switch (this.state) {
      case 'title':
        this.idle += dt;
        if (input.wasPressed('Enter', 'Space')) this.startGame();
        break;
      case 'playing':
        this.updatePlay(dt, input);
        break;
      case 'levelClear':
        this.updateShipAndShots(dt, input);
        this.updateBonuses(dt, false); // still collectable while the arena changes shape
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

  /** Someone pressed a key or clicked: restart the wait before the welcome text. */
  wake(): void {
    this.idle = 0;
  }

  private emit(e: GameEvent): void {
    if (this.events.length < MAX_PENDING_EVENTS) this.events.push(e);
  }

  private resetRun(): void {
    this.score = 0;
    this.lives = START_LIVES;
    this.bombs = 0;
    this.bonuses = [];
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
    this.arena.setLevel(def.keyframes, def.loop, transitionSec, def.motion);
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
    const tankers = Math.min(def.tankers + cycle, TANKER_SPAWN_THETAS.length);
    this.waveSize = count + tankers;
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
    // Tankers start away from the droids: a quarter turn round a connected
    // level, or near the end of the droids' chambers.
    const clearance = ENEMY.radius.tanker + 10;
    for (let i = 0; i < tankers; i++) {
      let theta = TANKER_SPAWN_THETAS[i];
      if (!arena.isRing) {
        const here = arena.chamberAtPoint(this.ship!.x, this.ship!.y);
        const others = arena.chambers.map((_, c) => c).filter((c) => c !== here);
        const c = others.length ? others[i % others.length] : 0;
        theta = arena.chamberAngle(c, 0.85);
      }
      this.enemies.push(makeTanker(arena, arena.openAngle(theta, clearance), this.scale));
    }
    this.promoteTimer = ENEMY.promoteEvery / this.scale;
    this.bonusTimer = rand(BONUS.dropEvery[0], BONUS.dropEvery[1]);
    // Bonuses left over from the last wave fizzle out as the new one arrives.
    for (const b of this.bonuses) this.blast('mine', b.x, b.y, '#ffffff');
    this.bonuses = [];
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
      spawn: (kind, from) => this.launch(kind, from),
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

  /**
   * A tanker launches a ship where it is. Hunters past `maxHunters` come out
   * as droids, and nothing comes out while `maxShips` are alive.
   */
  private launch(kind: SpawnKind, from: Enemy): void {
    if (this.enemies.filter((e) => !e.dead && isShip(e)).length >= ENEMY.maxShips) return;
    if (kind !== 'droid' && this.enemies.filter(isHunter).length >= ENEMY.maxHunters) kind = 'droid';
    const arena = this.arena;
    const e = makeDroid(arena, from.theta);
    // In a chamber, join the droids' formation so they don't pass through each other.
    if (!arena.isRing) {
      const c = arena.chamberAt(e.theta);
      e.dir = this.enemies.find((o) => o.kind === 'droid' && arena.chamberAt(o.theta) === c)?.dir ?? 1;
    }
    if (kind !== 'droid') promote(e, this.scale);
    if (kind === 'death') promote(e, this.scale);
    this.enemies.push(e);
    this.waveSize++;
    this.blast('hyper', e.x, e.y, ENEMY_COLORS[kind]);
    this.emit({ type: 'tankerSpawn', kind, x: e.x, y: e.y });
  }

  private updatePlay(dt: number, input: Input): void {
    this.updateShipAndShots(dt, input);
    this.updateEnemies(dt);
    this.updateBonuses(dt);
    if (input.wasPressed('KeyB') && this.ship && this.bombs > 0) this.smartBomb(this.ship);

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
          this.hitEnemy(e, b.x, b.y);
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

    if (this.state === 'playing' && !this.enemies.some(isShip)) {
      this.levelCleared();
    }
  }

  /** A player's shot hit `e` at (x, y). Tankers take several hits, and may shed a droid when hit. */
  private hitEnemy(e: Enemy, x: number, y: number): void {
    if (e.hp <= 1) return this.killEnemy(e);
    e.hp--;
    e.hitFlash = 0.08;
    this.blast('mine', x, y, ENEMY_COLORS[e.kind]);
    this.emit({ type: 'tankerHit', x: e.x, y: e.y, hp: e.hp });
    if (Math.random() < ENEMY.tankerHitSpawnChance) this.launch('droid', e);
  }

  private killEnemy(e: Enemy, bombed = false): void {
    e.dead = true;
    this.blast(ENEMY_BLAST[e.kind], e.x, e.y, ENEMY_COLORS[e.kind]);
    this.addScore(SCORE[e.kind]);
    this.emit({ type: 'enemyKilled', kind: e.kind, x: e.x, y: e.y, bombed });
    // A destroyed tanker always leaves a bonus, even past `BONUS.maxLive`.
    if (e.kind === 'tanker') this.dropBonus(pickBonusKind('tanker'), e.x, e.y);
  }

  /**
   * Every so often a random ship leaves a bonus where it is; the player
   * collects one by flying through it.
   */
  private updateBonuses(dt: number, drops = true): void {
    this.bonusTimer -= dt;
    if (drops && this.bonusTimer <= 0) {
      this.bonusTimer = rand(BONUS.dropEvery[0], BONUS.dropEvery[1]);
      const droppers = this.enemies.filter((e) => !e.dead && isBonusDropper(e.kind));
      if (droppers.length && this.bonuses.length < BONUS.maxLive) {
        const e = droppers[Math.floor(Math.random() * droppers.length)];
        if (isBonusDropper(e.kind)) this.dropBonus(pickBonusKind(e.kind), e.x, e.y);
      }
    }
    for (const b of this.bonuses) updateBonus(b, dt, this.arena);
    const ship = this.ship;
    if (ship) {
      for (const b of this.bonuses) {
        if (!b.dead && dist2(ship.x, ship.y, b.x, b.y) < (b.r + ship.r) ** 2) this.collect(b);
      }
    }
    this.bonuses = this.bonuses.filter((b) => !b.dead);
  }

  dropBonus(kind: BonusKind, x: number, y: number): void {
    this.bonuses.push(makeBonus(kind, x, y));
    this.emit({ type: 'bonusDropped', kind, x, y });
  }

  private collect(b: Bonus): void {
    b.dead = true;
    let text: string;
    if (b.kind === 'life' && this.lives < MAX_LIVES) {
      this.lives++;
      text = '1UP';
    } else if (b.kind === 'bomb' && this.bombs < BONUS.maxBombs) {
      this.bombs++;
      text = 'SMART BOMB';
    } else {
      // Points, or a life or bomb the player has no room for.
      this.addScore(BONUS.points);
      text = `+${BONUS.points}`;
    }
    this.popups.push({ text, x: b.x, y: b.y, age: 0 });
    this.blast('hyper', b.x, b.y, '#ffffff');
    this.emit({ type: 'bonusCollected', kind: b.kind, x: b.x, y: b.y });
  }

  /**
   * Kill every enemy in the arena (all chambers), mines included, and their
   * shots. Tankers only take damage, and are always left with a hit to spare.
   */
  private smartBomb(ship: Ship): void {
    this.bombs--;
    this.blast('bomb', ship.x, ship.y, '#ffffff');
    this.emit({ type: 'smartBomb', x: ship.x, y: ship.y });
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.kind === 'tanker') {
        e.hp = Math.max(1, e.hp - ENEMY.tankerBombHits);
        e.hitFlash = 0.08;
      } else {
        this.killEnemy(e, true);
      }
    }
    this.enemyBullets = [];
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
      this.nextExtraLife += SCORE.extraLifeEvery;
      if (this.lives >= MAX_LIVES) continue;
      this.lives++;
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
