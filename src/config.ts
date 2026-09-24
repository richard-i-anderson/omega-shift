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

// Explosions (src/entities/particles.ts). A blast is long tumbling shards,
// short fast sparks (streaks along their motion), an expanding shockwave ring
// and a brief central flash. Fragments start white-hot and cool to the blast's
// colour over their life. Presets grow with the danger of what blew up:
// mine < droid < command < death < ship. Speeds px/s, times s, lengths px.
export const EXPLOSION = {
  // Live particles are capped; the oldest are dropped first.
  maxParticles: 2000,
  // Share of a fragment's life spent white-hot before it starts to cool.
  hotShare: 0.15,
  // Screen shake: a render-only offset (never physics), only for blasts with
  // `shake` > 0 (the ship and death ships). Peak offset in px, capped at
  // `max`, decaying as exp(−decay·t).
  shake: { enabled: true, max: 12, decay: 7 },
  presets: {
    // High launch speed with heavy drag: a violent burst that then hangs.
    // A fragment travels at most speed / drag px.
    mine: {
      shards: 12, sparks: 12, speed: 240, sparkSpeed: 460, len: [6, 12], sparkLen: [6, 10],
      life: [0.35, 0.75], drag: 3.2, spin: 12, curl: 0,
      ring: { radius: 44, life: 0.28 }, flash: { radius: 22, life: 0.1 }, shake: 0,
    },
    droid: {
      shards: 26, sparks: 20, speed: 300, sparkSpeed: 580, len: [7, 16], sparkLen: [7, 12],
      life: [0.5, 1.05], drag: 2.8, spin: 12, curl: 0,
      ring: { radius: 78, life: 0.35 }, flash: { radius: 36, life: 0.12 }, shake: 0,
    },
    command: {
      shards: 36, sparks: 28, speed: 340, sparkSpeed: 650, len: [8, 19], sparkLen: [8, 14],
      life: [0.6, 1.25], drag: 2.5, spin: 13, curl: 0,
      ring: { radius: 105, life: 0.42 }, flash: { radius: 46, life: 0.14 }, shake: 0,
    },
    death: {
      shards: 54, sparks: 40, speed: 400, sparkSpeed: 740, len: [9, 22], sparkLen: [9, 16],
      life: [0.7, 1.45], drag: 2.3, spin: 14, curl: 0,
      ring: { radius: 145, life: 0.5 }, flash: { radius: 62, life: 0.17 }, shake: 6,
    },
    ship: {
      shards: 72, sparks: 56, speed: 440, sparkSpeed: 820, len: [10, 24], sparkLen: [10, 18],
      life: [0.9, 1.8], drag: 2.0, spin: 14, curl: 0,
      ring: { radius: 190, life: 0.6 }, flash: { radius: 80, life: 0.22 }, shake: 10,
    },
    // Hyperspace: a cyan swirl. `curl` turns each fragment's velocity
    // (rad/s), so the fragments spiral instead of flying straight.
    hyper: {
      shards: 16, sparks: 14, speed: 210, sparkSpeed: 340, len: [6, 12], sparkLen: [6, 10],
      life: [0.35, 0.7], drag: 3.5, spin: 8, curl: 7,
      ring: { radius: 48, life: 0.3 }, flash: { radius: 22, life: 0.09 }, shake: 0,
    },
  },
} as const;

export type BlastKind = keyof typeof EXPLOSION.presets;

// H jumps the ship: to the next chamber clockwise on chambered levels,
// otherwise to a random spot on the track.
export const HYPERSPACE = {
  cooldown: 1.5,
  // Invulnerability on arrival, seconds.
  invuln: 0.75,
} as const;

// Background starfield: dim, seeded, drawn under everything.
export const STARS = {
  count: 160,
  seed: 1981,
  // Base alpha range; kept low so walls and enemies stay readable.
  minAlpha: 0.25,
  maxAlpha: 0.55,
  // Share of stars that are 2 px instead of 1 px.
  bigShare: 0.2,
  // Share of stars tinted faint blue or amber (split evenly).
  tintShare: 0.15,
  // Gentle flicker: alpha = base × (1 − depth + depth·sin(rate·t + phase)).
  flickerDepth: 0.25,
  // Flicker angular speed range, radians per second.
  minRate: 0.6,
  maxRate: 2.2,
  // Occasional slow twinkle: extra brightness, at most this much, for the
  // top slice of a slow sine (a few seconds bright every half minute or so).
  twinkleBoost: 0.35,
  twinkleRate: 0.22,
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
