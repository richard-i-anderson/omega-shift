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

// Background starfield: dim, seeded, drawn under everything.
export const STARS = {
  count: 250,
  seed: 1981,
  // Base alpha range, before twinkle and reactions.
  minAlpha: 0.35,
  maxAlpha: 0.8,
  // Nothing is ever drawn brighter than this, so stars stay below bullets.
  maxDrawAlpha: 0.85,
  // Cap for untinted/white stars of 2 px or more: a bright white 2 px dot
  // reads as a bullet.
  whiteBigCap: 0.55,
  // Size shares: the rest are 1 px.
  size2Share: 0.32,
  size3Share: 0.08,
  // Share of stars tinted (cyan, magenta, amber, violet, white); the rest are pale blue-grey.
  tintShare: 0.5,
  // Flicker: alpha = base × (1 − depth + depth·sin(rate·t + phase)).
  flickerDepth: 0.3,
  minRate: 1.5,
  maxRate: 5,
  // Twinkle: extra brightness of boost·max(0, sin(rate·t + phase))^power, a
  // brief swell every several seconds.
  twinkleBoost: 0.45,
  twinkleRate: 0.8,
  twinklePower: 8,
  // Share of stars that are bright sparklers: 2 px, tinted, base ≥ 0.7, and a
  // four-point cross whose arms (up to `sparkleArm` px) grow as they twinkle.
  sparkleShare: 0.07,
  sparkleArm: 5,
  // Parallax layers, far to near: drift speed (px/s) and share of stars.
  layerSpeeds: [4, 9, 18],
  layerShares: [0.5, 0.32, 0.18],
  // Drift heading = start + turn·t + wobble·sin(wobbleRate·t), radians.
  driftTurn: 0.012,
  driftWobble: 0.8,
  driftWobbleRate: 0.045,
  // Shooting stars: one every min–max seconds.
  shootMin: 4,
  shootMax: 10,
  shootSpeedMin: 650,
  shootSpeedMax: 950,
  shootLife: 0.75, // seconds the head flies
  shootTailMin: 90,
  shootTailMax: 150,
  shootAlpha: 0.85,
  // Flare ring from an explosion: expands at `speed` px/s out to `radius`;
  // each star brightens as it arrives, then decays with time constant `decay`.
  flareSpeed: 520,
  flareRadius: 420,
  flareDecay: 0.55,
  flareEnemy: 0.55,
  flareShip: 0.8,
  // A tinted star brightened by more than this (flare or flash) is drawn 1 px bigger.
  flareGrow: 0.2,
  maxFlares: 8,
  // Hyperspace warp: stars within `radius` of the landing spot streak towards
  // it for `duration` s. Streak length = streak·env·(1 − d/radius)·d.
  warpDuration: 0.4,
  warpRadius: 280,
  warpStreak: 0.7,
  warpPull: 0.35,
  // Ship death: every star flashes brighter by `flashBoost`, decaying with time
  // constant `flashDecay`. (No full-screen wash: a 2048×1536 blend costs more
  // than the whole starfield on a software rasteriser.)
  flashDecay: 0.25,
  flashBoost: 0.5,
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

// Sound: synthesised with Web Audio (src/audio/). Frequencies in Hz, times in
// seconds, gains 0..1 before the master volume. A patch is a list of layers
// played together: `wave` is an oscillator shape or 'noise'; the pitch (and a
// filter's cutoff) sweeps exponentially from `freq` to `freqEnd` over the
// layer's `decay`; `delay` offsets a layer, which is how arpeggios are made.
export const SOUND = {
  master: 0.5,
  storageKey: 'omegaShift.muted',
  // A force-field hit from the same kind of source plays at most this often.
  hitThrottle: 0.04,
  // Field hits scale from their quietest/lowest at ARENA.flashImpact to their
  // loudest/highest at this impact speed (px/s).
  hitImpactFull: 450,
  hitGainRange: [0.35, 1],
  hitPitchRange: [0.8, 1.3],
  fieldHit: {
    // An electric "bzzt": a buzzy square through a bandpass, pitch dropping fast.
    ship: [
      { wave: 'square', freq: 220, freqEnd: 70, decay: 0.13, gain: 0.4, filter: { type: 'bandpass', freq: 1000, freqEnd: 300, q: 3 } },
      { wave: 'noise', decay: 0.05, gain: 0.12, filter: { type: 'bandpass', freq: 2600, q: 2 } },
    ],
    // Thin and quiet.
    shot: [{ wave: 'square', freq: 700, freqEnd: 260, decay: 0.035, gain: 0.12, filter: { type: 'bandpass', freq: 1800, q: 4 } }],
    enemy: [
      { wave: 'square', freq: 160, freqEnd: 55, decay: 0.1, gain: 0.3, filter: { type: 'bandpass', freq: 700, freqEnd: 250, q: 3 } },
    ],
    // A soft thud.
    mine: [{ wave: 'triangle', freq: 110, freqEnd: 45, decay: 0.09, gain: 0.3, filter: { type: 'lowpass', freq: 400 } }],
  },
  // Background pulse, set by the most dangerous enemy alive. One LFO drives
  // both pitch (±pitchDepth Hz around freq) and volume (ampDepth 0..1).
  // Voices crossfade over `ambientFade` seconds when the danger changes.
  ambientFade: 0.3,
  pulse: {
    // Slow low throb, about 55–70 Hz.
    droid: {
      wave: 'square', freq: 62, lfoWave: 'sine', lfoRate: 1.2, pitchDepth: 7.5, ampDepth: 0.9, gain: 0.22,
      filter: { type: 'lowpass', freq: 220, q: 1 },
    },
    // Faster, higher two-note warble (a square LFO flips between freq ± pitchDepth).
    command: {
      wave: 'square', freq: 190, lfoWave: 'square', lfoRate: 2.5, pitchDepth: 30, ampDepth: 0.25, gain: 0.11,
      filter: { type: 'lowpass', freq: 1400, q: 1 },
    },
    // Frantic rising siren (a sawtooth LFO sweeps up, then snaps back).
    death: {
      wave: 'sawtooth', freq: 650, lfoWave: 'sawtooth', lfoRate: 5, pitchDepth: 300, ampDepth: 0.5, gain: 0.08,
      filter: { type: 'lowpass', freq: 2600, q: 1 },
    },
  },
  // Quiet noise rumble while the ship thrusts.
  thrust: { gain: 0.14, cutoff: 260, fade: 0.04 },
  sfx: {
    shipFire: [{ wave: 'square', freq: 1600, freqEnd: 500, decay: 0.07, gain: 0.1, filter: { type: 'highpass', freq: 400 } }],
    shipKilled: [
      { wave: 'noise', decay: 1.6, gain: 0.5, filter: { type: 'lowpass', freq: 3000, freqEnd: 80, q: 1 } },
      { wave: 'sawtooth', freq: 140, freqEnd: 30, decay: 1.2, gain: 0.25 },
    ],
    hyperspace: [
      { wave: 'triangle', freq: 180, freqEnd: 2400, attack: 0.01, decay: 0.45, gain: 0.25 },
      { wave: 'noise', decay: 0.3, gain: 0.08, filter: { type: 'bandpass', freq: 800, freqEnd: 5000, q: 2 } },
    ],
    // Only command ships shoot: a descending "pew".
    enemyFire: [{ wave: 'square', freq: 1300, freqEnd: 220, decay: 0.16, gain: 0.15, filter: { type: 'lowpass', freq: 3000 } }],
    mineLaid: {
      // Photon mine: a short upward chirp.
      photon: [
        { wave: 'triangle', freq: 900, freqEnd: 1900, decay: 0.07, gain: 0.18 },
        { wave: 'triangle', freq: 1900, freqEnd: 2600, delay: 0.06, decay: 0.05, gain: 0.12 },
      ],
      // Vapor mine: a hiss.
      vapor: [{ wave: 'noise', attack: 0.03, decay: 0.35, gain: 0.14, filter: { type: 'highpass', freq: 3500 } }],
    },
    promoted: {
      // Droid to command ship: a two-note blip up.
      command: [
        { wave: 'square', freq: 440, decay: 0.08, gain: 0.1 },
        { wave: 'square', freq: 660, delay: 0.08, decay: 0.12, gain: 0.1 },
      ],
      // Command to death ship: a rising alarm stab, twice.
      death: [
        { wave: 'sawtooth', freq: 300, freqEnd: 1200, attack: 0.01, decay: 0.28, gain: 0.18, filter: { type: 'lowpass', freq: 3000 } },
        { wave: 'sawtooth', freq: 300, freqEnd: 1200, delay: 0.3, attack: 0.01, decay: 0.28, gain: 0.18, filter: { type: 'lowpass', freq: 3000 } },
      ],
    },
    // Harsher the more dangerous the enemy; mines just tick.
    enemyKilled: {
      droid: [
        { wave: 'square', freq: 700, freqEnd: 140, decay: 0.12, gain: 0.2 },
        { wave: 'noise', decay: 0.08, gain: 0.15, filter: { type: 'bandpass', freq: 1500, q: 1 } },
      ],
      command: [
        { wave: 'noise', decay: 0.4, gain: 0.35, filter: { type: 'bandpass', freq: 1600, freqEnd: 300, q: 0.8 } },
        { wave: 'square', freq: 300, freqEnd: 50, decay: 0.3, gain: 0.18 },
      ],
      death: [
        { wave: 'noise', decay: 0.9, gain: 0.45, filter: { type: 'lowpass', freq: 5000, freqEnd: 150 } },
        { wave: 'sawtooth', freq: 220, freqEnd: 35, decay: 0.7, gain: 0.22 },
      ],
      photon: [{ wave: 'square', freq: 2400, freqEnd: 1800, decay: 0.025, gain: 0.12 }],
      vapor: [{ wave: 'square', freq: 1500, freqEnd: 1100, decay: 0.03, gain: 0.12 }],
    },
    // Rising arpeggio, C6 E6 G6 C7.
    extraLife: [
      { wave: 'square', freq: 1047, decay: 0.09, gain: 0.1 },
      { wave: 'square', freq: 1319, delay: 0.07, decay: 0.09, gain: 0.1 },
      { wave: 'square', freq: 1568, delay: 0.14, decay: 0.09, gain: 0.1 },
      { wave: 'square', freq: 2093, delay: 0.21, decay: 0.25, gain: 0.1 },
    ],
    waveStart: [
      { wave: 'triangle', freq: 220, decay: 0.12, gain: 0.18 },
      { wave: 'triangle', freq: 440, delay: 0.12, decay: 0.2, gain: 0.18 },
    ],
    // Short fanfare, G5 C6 E6 G6.
    waveCleared: [
      { wave: 'square', freq: 784, decay: 0.1, gain: 0.1, filter: { type: 'lowpass', freq: 2500 } },
      { wave: 'square', freq: 1047, delay: 0.11, decay: 0.1, gain: 0.1, filter: { type: 'lowpass', freq: 2500 } },
      { wave: 'square', freq: 1319, delay: 0.22, decay: 0.1, gain: 0.1, filter: { type: 'lowpass', freq: 2500 } },
      { wave: 'square', freq: 1568, delay: 0.33, decay: 0.5, gain: 0.12, filter: { type: 'lowpass', freq: 2500 } },
      { wave: 'triangle', freq: 784, delay: 0.33, decay: 0.5, gain: 0.12 },
    ],
    // Falling, C5 G4 E4 C4.
    gameOver: [
      { wave: 'square', freq: 523, decay: 0.18, gain: 0.12, filter: { type: 'lowpass', freq: 1800 } },
      { wave: 'square', freq: 392, delay: 0.2, decay: 0.18, gain: 0.12, filter: { type: 'lowpass', freq: 1800 } },
      { wave: 'square', freq: 330, delay: 0.4, decay: 0.18, gain: 0.12, filter: { type: 'lowpass', freq: 1800 } },
      { wave: 'square', freq: 262, delay: 0.6, decay: 0.9, gain: 0.12, filter: { type: 'lowpass', freq: 1800 } },
    ],
  },
} as const;
