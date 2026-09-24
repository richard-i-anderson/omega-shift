import type { Arena } from '../arena/arena';
import { SHIP } from '../config';
import { collideArena, type Body } from '../physics/collide';

export interface ShipControls {
  left: boolean;
  right: boolean;
  thrust: boolean;
}

export class Ship implements Body {
  vx = 0;
  vy = 0;
  readonly r = SHIP.radius;
  thrusting = false;
  cooldown = 0;
  hyperCooldown = 0;
  /** Position and heading before the latest step, for drawing in between steps. */
  prevX: number;
  prevY: number;
  prevAngle: number;

  constructor(
    public x: number,
    public y: number,
    public angle: number,
    public invuln: number = SHIP.invulnTime,
  ) {
    this.prevX = x;
    this.prevY = y;
    this.prevAngle = angle;
  }

  /** Remember the current state as the previous one (before a step, or after a jump so it doesn't streak). */
  snapshot(): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevAngle = this.angle;
  }

  update(dt: number, c: ShipControls, arena: Arena): void {
    if (c.left) this.angle -= SHIP.turnRate * dt;
    if (c.right) this.angle += SHIP.turnRate * dt;
    this.thrusting = c.thrust;
    if (c.thrust) {
      this.vx += Math.cos(this.angle) * SHIP.thrust * dt;
      this.vy += Math.sin(this.angle) * SHIP.thrust * dt;
    }
    const damp = Math.exp(-SHIP.drag * dt);
    this.vx *= damp;
    this.vy *= damp;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > SHIP.maxSpeed) {
      this.vx *= SHIP.maxSpeed / speed;
      this.vy *= SHIP.maxSpeed / speed;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    collideArena(this, arena, SHIP.restitution, 'ship');
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.hyperCooldown = Math.max(0, this.hyperCooldown - dt);
    this.invuln = Math.max(0, this.invuln - dt);
  }

  /** Nose position, where bullets spawn. */
  nose(): { x: number; y: number } {
    return { x: this.x + Math.cos(this.angle) * this.r * 1.5, y: this.y + Math.sin(this.angle) * this.r * 1.5 };
  }
}
