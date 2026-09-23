import type { Arena } from '../arena/arena';
import { collideArena, type Body } from '../physics/collide';

export class Bullet implements Body {
  readonly r = 2;
  dead = false;

  constructor(
    public x: number,
    public y: number,
    public vx: number,
    public vy: number,
    public life: number,
  ) {}

  update(dt: number, arena: Arena): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    // Shots are absorbed by the force fields.
    if (this.life <= 0 || collideArena(this, arena, 0)) this.dead = true;
  }
}
