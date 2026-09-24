// All gameplay tuning lives here. Units are pixels and seconds in the fixed
// 1024×768 logical world.

export const WORLD = { w: 1024, h: 768, cx: 512, cy: 384 } as const;

export const PHYSICS_HZ = 120;

export const SHIP = {
  radius: 10,
  turnRate: 4.8,
  thrust: 420,
  maxSpeed: 430,
  drag: 0.35,
  restitution: 0.9,
  fireCooldown: 0.16,
  maxBullets: 4,
  bulletSpeed: 640,
  bulletLife: 1.0,
  respawnDelay: 2,
  invulnTime: 2.5,
} as const;

export const ENEMY = {
  droidSpeed: 55,
  commandSpeed: 105,
  deathSpeed: 185,
  deathAccel: 260,
  promoteEvery: 6,
  commandLifetime: 14,
  maxHunters: 2,
  commandFireEvery: 2.4,
  commandDropEvery: 4.5,
  deathDropEvery: 3.2,
  maxMines: 12,
  bulletSpeed: 250,
  bulletLife: 2.6,
  radius: { droid: 11, command: 12, death: 11, photon: 6, vapor: 9 },
} as const;

export const SCORE = {
  droid: 1000,
  command: 1500,
  death: 2500,
  photon: 350,
  vapor: 500,
  extraLifeEvery: 40000,
} as const;

// H jumps the ship: to the next chamber clockwise on chambered levels,
// otherwise to a random spot on the track.
export const HYPERSPACE = {
  cooldown: 1.5,
  // Invulnerability on arrival, seconds.
  invuln: 0.75,
} as const;

export const START_LIVES = 3;

export const ARENA = {
  // Minimum radial distance between the inner and outer force fields.
  minGap: 100,
  // The score is drawn inside the inner field, so it must be at least this big.
  minInnerRadius: 60,
  // Minimum wall-normal speed that makes a force-field segment flash.
  flashImpact: 40,
  restitution: 0.9,
} as const;

export const LEVEL_CLEAR_SEC = 3;
export const LEVEL_TRANSITION_SEC = 2.5;
