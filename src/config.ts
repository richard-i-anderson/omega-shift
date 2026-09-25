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
  radius: { droid: 11, command: 12, death: 11, tanker: 20, photon: 6, vapor: 9 },
  // Tankers: slow, armoured, and they keep launching ships until destroyed,
  // so a wave can't be cleared in seconds by picking off the droids.
  tankerSpeed: 32,
  // Hits to destroy one at speed scale 1 (scaled with the level's speed).
  tankerHp: 12,
  // Seconds between launches, before dividing by the speed scale.
  tankerSpawnEvery: [2.5, 5],
  // What it launches. Command and death ships still count towards
  // `maxHunters`; past it, a droid comes out instead.
  tankerSpawnWeights: { droid: 0.65, command: 0.25, death: 0.1 },
  // A smart bomb does as much damage as this many hits, but never destroys one.
  tankerBombHits: 4,
  // Chance that a hit which doesn't destroy it knocks a droid loose.
  tankerHitSpawnChance: 0.2,
  // Launches stop while this many ships (tankers included) are alive.
  maxShips: 16,
} as const;

export const SCORE = {
  droid: 1000,
  command: 1500,
  death: 2500,
  tanker: 5000,
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
    tanker: {
      shards: 64, sparks: 48, speed: 420, sparkSpeed: 780, len: [10, 23], sparkLen: [9, 17],
      life: [0.8, 1.6], drag: 2.1, spin: 14, curl: 0,
      ring: { radius: 170, life: 0.55 }, flash: { radius: 72, life: 0.2 }, shake: 8,
    },
    ship: {
      shards: 72, sparks: 56, speed: 440, sparkSpeed: 820, len: [10, 24], sparkLen: [10, 18],
      life: [0.9, 1.8], drag: 2.0, spin: 14, curl: 0,
      ring: { radius: 190, life: 0.6 }, flash: { radius: 80, life: 0.22 }, shake: 10,
    },
    // Smart bomb: one huge white ring sweeping the arena from the ship.
    bomb: {
      shards: 40, sparks: 60, speed: 520, sparkSpeed: 900, len: [10, 24], sparkLen: [10, 18],
      life: [0.5, 1.1], drag: 2.2, spin: 10, curl: 0,
      ring: { radius: 700, life: 0.7 }, flash: { radius: 140, life: 0.25 }, shake: 12,
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
  count: 250,
  seed: 1981,
  // Base alpha range, before twinkle and reactions.
  minAlpha: 0.45,
  maxAlpha: 0.8,
  // Nothing is ever drawn brighter than this, so stars stay below bullets.
  maxDrawAlpha: 0.85,
  // Cap for untinted/white stars of 2 px or more: a bright white 2 px dot
  // reads as a bullet.
  whiteBigCap: 0.55,
  // Size shares: the rest are 1 px.
  size2Share: 0.4,
  size3Share: 0.12,
  // Share of stars tinted (cyan, magenta, amber, violet, white); the rest are pale blue-grey.
  tintShare: 0.7,
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
  sparkleShare: 0.1,
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
/** Lives never go above this, from bonuses or from score. */
export const MAX_LIVES = 6;

// Bonuses: enemy ships leave them behind as they fly (src/entities/bonus.ts).
// The player collects one by flying through it.
export const BONUS = {
  radius: 16,
  // Seconds a bonus lasts; it blinks for the last `blinkLast`.
  life: 12,
  blinkLast: 3,
  // Seconds between drops during a wave (a random ship drops each time).
  dropEvery: [6, 11],
  // Never more than this many waiting to be collected.
  maxLive: 3,
  points: 5000,
  // Smart bombs held at most; B sets one off.
  maxBombs: 3,
  // What each kind of ship tends to leave: the more dangerous the ship, the
  // better the bonus, so the best ones are the riskiest to fetch.
  weights: {
    droid: { points: 0.7, bomb: 0.2, life: 0.1 },
    command: { points: 0.45, bomb: 0.35, life: 0.2 },
    death: { points: 0.3, bomb: 0.4, life: 0.3 },
    // A destroyed tanker always leaves one.
    tanker: { points: 0.2, bomb: 0.4, life: 0.4 },
  },
  // Collected-bonus text floats up and fades over this many seconds.
  popupLife: 1.4,
} as const;

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
  // On the master bus, after the mute gain. Threshold in dB.
  compressor: { threshold: -10, ratio: 6 },
  // DAC grit: `mix` of the bus goes through a WaveShaper that rounds it to `bits`.
  crush: { bits: 6, mix: 0.5 },
  // A force-field hit from the same kind of source plays at most this often.
  hitThrottle: 0.04,
  // Field hits scale from their quietest/lowest at ARENA.flashImpact to their
  // loudest/highest at this impact speed (px/s).
  hitImpactFull: 450,
  hitGainRange: [0.6, 1],
  hitPitchRange: [0.8, 1.3],
  // Raw squares and saws, barely filtered, so they cut through the drone and
  // the pulse (peaks about level with the pulse's, never far below).
  fieldHit: {
    // An electric "bzzt": a buzzy square, pitch dropping fast, with a crackle.
    ship: [
      { wave: 'square', freq: 220, freqEnd: 60, decay: 0.2, gain: 0.6, filter: { type: 'lowpass', freq: 4000, freqEnd: 800 } },
      { wave: 'noise', decay: 0.07, gain: 0.35, filter: { type: 'highpass', freq: 1800 } },
    ],
    // Thin and sharp; shots hit walls often, so a little quieter than the ship.
    shot: [{ wave: 'square', freq: 900, freqEnd: 280, decay: 0.06, gain: 0.55 }],
    enemy: [
      { wave: 'sawtooth', freq: 170, freqEnd: 50, decay: 0.16, gain: 0.75 },
      { wave: 'noise', decay: 0.04, gain: 0.25, filter: { type: 'highpass', freq: 2500 } },
    ],
    // A heavy clunk.
    mine: [{ wave: 'square', freq: 120, freqEnd: 40, decay: 0.14, gain: 0.75, filter: { type: 'lowpass', freq: 1200 } }],
  },
  // The always-on cabinet hum while flying and on the level cards: square
  // waves at 55 and 55.7 Hz beat against each other (0.7 Hz), through a
  // resonant lowpass that a slow LFO sweeps between cutoff ± sweepDepth.
  // `gain` is per oscillator; it fades out over `fade` on pause, title and game over.
  drone: {
    wave: 'square', freqs: [55, 55.7], gain: 0.045, cutoff: 480, q: 7, sweepRate: 0.06, sweepDepth: 330, fade: 0.8,
  },
  // Danger pulse, over the drone, set by the most dangerous enemy alive. One
  // LFO drives both pitch (±pitchDepth Hz around freq) and volume (ampDepth
  // 0..1). Louder, higher and faster the more dangerous: gain, freq and
  // lfoRate all rise droid < command < death, even with pulseUrgency applied.
  // Voices crossfade over `ambientFade` seconds.
  ambientFade: 0.3,
  pulse: {
    // Slow low throb, about 55–70 Hz.
    droid: {
      wave: 'square', freq: 62, lfoWave: 'sine', lfoRate: 1.2, pitchDepth: 7.5, ampDepth: 0.9, gain: 0.18,
      filter: { type: 'lowpass', freq: 600, q: 1 },
    },
    // Faster, higher two-note warble (a square LFO flips between freq ± pitchDepth).
    command: {
      wave: 'square', freq: 190, lfoWave: 'square', lfoRate: 2.5, pitchDepth: 30, ampDepth: 0.35, gain: 0.24,
      filter: { type: 'lowpass', freq: 3000, q: 1 },
    },
    // Frantic rising siren (a sawtooth LFO sweeps up, then snaps back).
    death: { wave: 'sawtooth', freq: 650, lfoWave: 'sawtooth', lfoRate: 5.2, pitchDepth: 300, ampDepth: 0.5, gain: 0.32 },
  },
  // As the wave thins out the pulse speeds up (like the Asteroids heartbeat)
  // and gets louder: with none left, rate × (1 + tempo) and gain × (1 + gain).
  // Small enough that a lower danger never outdoes a higher one.
  pulseUrgency: { tempo: 1, gain: 0.3 },
  // Title screen: an attract jingle `first` seconds after audio unlocks, then every `every`.
  attract: {
    first: 1.5,
    every: 20,
    // An A-minor arpeggio (A4 C5 E5 A5 G5 E5 C6 A5 B5 G5 E6 C6) over a saw
    // bass, then a rising whoop and a held stab.
    jingle: [
      { wave: 'square', freq: 440, delay: 0, decay: 0.08, gain: 0.16 },
      { wave: 'square', freq: 523, delay: 0.09, decay: 0.08, gain: 0.16 },
      { wave: 'square', freq: 659, delay: 0.18, decay: 0.08, gain: 0.16 },
      { wave: 'square', freq: 880, delay: 0.27, decay: 0.08, gain: 0.16 },
      { wave: 'square', freq: 784, delay: 0.36, decay: 0.08, gain: 0.16 },
      { wave: 'square', freq: 659, delay: 0.45, decay: 0.08, gain: 0.16 },
      { wave: 'square', freq: 1047, delay: 0.54, decay: 0.08, gain: 0.16 },
      { wave: 'square', freq: 880, delay: 0.63, decay: 0.08, gain: 0.16 },
      { wave: 'square', freq: 988, delay: 0.72, decay: 0.08, gain: 0.16 },
      { wave: 'square', freq: 784, delay: 0.81, decay: 0.08, gain: 0.16 },
      { wave: 'square', freq: 1319, delay: 0.9, decay: 0.08, gain: 0.16 },
      { wave: 'square', freq: 1047, delay: 0.99, decay: 0.08, gain: 0.16 },
      { wave: 'sawtooth', freq: 110, delay: 0, decay: 0.24, gain: 0.2, filter: { type: 'lowpass', freq: 1400 } },
      { wave: 'sawtooth', freq: 110, delay: 0.27, decay: 0.24, gain: 0.2, filter: { type: 'lowpass', freq: 1400 } },
      { wave: 'sawtooth', freq: 87, delay: 0.54, decay: 0.24, gain: 0.2, filter: { type: 'lowpass', freq: 1400 } },
      { wave: 'sawtooth', freq: 98, delay: 0.81, decay: 0.24, gain: 0.2, filter: { type: 'lowpass', freq: 1400 } },
      { wave: 'square', freq: 220, freqEnd: 1760, delay: 1.1, attack: 0.02, decay: 0.45, gain: 0.16 },
      { wave: 'sawtooth', freq: 880, delay: 1.58, decay: 0.6, gain: 0.14 },
      { wave: 'square', freq: 1319, delay: 1.58, decay: 0.6, gain: 0.1 },
    ],
  },
  // Noise rumble while the ship thrusts.
  thrust: { gain: 0.18, cutoff: 320, fade: 0.04 },
  sfx: {
    shipFire: [{ wave: 'square', freq: 1600, freqEnd: 450, decay: 0.09, gain: 0.16 }],
    // The biggest crash: long noise sweeping down, a falling square and a saw growl.
    shipKilled: [
      { wave: 'noise', decay: 2.2, gain: 0.7, filter: { type: 'lowpass', freq: 8000, freqEnd: 60, q: 1 } },
      { wave: 'square', freq: 260, freqEnd: 25, decay: 1.8, gain: 0.35 },
      { wave: 'sawtooth', freq: 130, freqEnd: 20, delay: 0.1, decay: 2, gain: 0.3 },
    ],
    hyperspace: [
      { wave: 'square', freq: 180, freqEnd: 2400, attack: 0.01, decay: 0.5, gain: 0.22 },
      { wave: 'sawtooth', freq: 90, freqEnd: 1200, attack: 0.01, decay: 0.5, gain: 0.15 },
      { wave: 'noise', decay: 0.35, gain: 0.12, filter: { type: 'bandpass', freq: 800, freqEnd: 5000, q: 1 } },
    ],
    // Only command ships shoot: a descending saw "pew".
    enemyFire: [{ wave: 'sawtooth', freq: 1300, freqEnd: 200, decay: 0.2, gain: 0.22 }],
    mineLaid: {
      // Photon mine: a short upward chirp.
      photon: [
        { wave: 'square', freq: 900, freqEnd: 1900, decay: 0.08, gain: 0.16 },
        { wave: 'square', freq: 1900, freqEnd: 2600, delay: 0.07, decay: 0.07, gain: 0.12 },
      ],
      // Vapor mine: a hiss.
      vapor: [{ wave: 'noise', attack: 0.03, decay: 0.4, gain: 0.2, filter: { type: 'highpass', freq: 3000 } }],
    },
    promoted: {
      // Droid to command ship: a two-note blip up.
      command: [
        { wave: 'square', freq: 440, decay: 0.09, gain: 0.16 },
        { wave: 'square', freq: 660, delay: 0.09, decay: 0.14, gain: 0.16 },
      ],
      // Command to death ship: a raw rising alarm stab, twice.
      death: [
        { wave: 'sawtooth', freq: 300, freqEnd: 1200, attack: 0.01, decay: 0.3, gain: 0.24 },
        { wave: 'sawtooth', freq: 300, freqEnd: 1200, delay: 0.32, attack: 0.01, decay: 0.3, gain: 0.24 },
      ],
    },
    // Sized by the blast, mine < droid < command < death (the ship's own is
    // bigger still): a noise crash sweeping down plus a falling square, longer
    // and louder the bigger the ship.
    enemyKilled: {
      droid: [
        { wave: 'noise', decay: 0.5, gain: 0.4, filter: { type: 'lowpass', freq: 6000, freqEnd: 200 } },
        { wave: 'square', freq: 600, freqEnd: 60, decay: 0.4, gain: 0.25 },
      ],
      command: [
        { wave: 'noise', decay: 0.9, gain: 0.5, filter: { type: 'lowpass', freq: 7000, freqEnd: 150 } },
        { wave: 'square', freq: 420, freqEnd: 40, decay: 0.8, gain: 0.3 },
        { wave: 'sawtooth', freq: 95, freqEnd: 30, decay: 0.6, gain: 0.2 },
      ],
      death: [
        { wave: 'noise', decay: 1.4, gain: 0.6, filter: { type: 'lowpass', freq: 8000, freqEnd: 100 } },
        { wave: 'square', freq: 320, freqEnd: 30, decay: 1.2, gain: 0.35 },
        { wave: 'sawtooth', freq: 150, freqEnd: 25, decay: 1, gain: 0.25 },
      ],
      // Deeper and longer than a death ship, with a second, delayed boom.
      tanker: [
        { wave: 'noise', decay: 1.8, gain: 0.65, filter: { type: 'lowpass', freq: 7000, freqEnd: 70 } },
        { wave: 'square', freq: 200, freqEnd: 22, decay: 1.5, gain: 0.38 },
        { wave: 'sawtooth', freq: 110, freqEnd: 20, delay: 0.25, decay: 1.3, gain: 0.3 },
      ],
      // Mines pop.
      photon: [
        { wave: 'square', freq: 1500, freqEnd: 300, decay: 0.08, gain: 0.2 },
        { wave: 'noise', decay: 0.1, gain: 0.15, filter: { type: 'lowpass', freq: 5000 } },
      ],
      vapor: [
        { wave: 'square', freq: 1200, freqEnd: 250, decay: 0.08, gain: 0.2 },
        { wave: 'noise', decay: 0.12, gain: 0.15, filter: { type: 'highpass', freq: 2000 } },
      ],
    },
    // A tanker shrugging off a hit: a hard metallic clank.
    tankerHit: [
      { wave: 'square', freq: 520, freqEnd: 260, decay: 0.08, gain: 0.3 },
      { wave: 'noise', decay: 0.05, gain: 0.2, filter: { type: 'bandpass', freq: 3200, q: 3 } },
    ],
    // A tanker launching a ship: a low rising "blorp".
    tankerSpawn: [
      { wave: 'square', freq: 90, freqEnd: 420, attack: 0.01, decay: 0.22, gain: 0.22, filter: { type: 'lowpass', freq: 2000 } },
      { wave: 'square', freq: 420, delay: 0.2, decay: 0.08, gain: 0.14 },
    ],
    // A bright two-tone "bling" so the player notices a bonus has appeared.
    bonusDropped: [
      { wave: 'square', freq: 1760, decay: 0.06, gain: 0.14 },
      { wave: 'triangle', freq: 2637, delay: 0.06, decay: 0.2, gain: 0.16 },
    ],
    bonusCollected: {
      // Rising arpeggio, C6 E6 G6 C7 (the same fanfare as a score extra life).
      life: [
        { wave: 'square', freq: 1047, decay: 0.09, gain: 0.18 },
        { wave: 'square', freq: 1319, delay: 0.07, decay: 0.09, gain: 0.18 },
        { wave: 'square', freq: 1568, delay: 0.14, decay: 0.09, gain: 0.18 },
        { wave: 'square', freq: 2093, delay: 0.21, decay: 0.35, gain: 0.18 },
      ],
      // A quick coin chirp.
      points: [
        { wave: 'square', freq: 988, decay: 0.05, gain: 0.18 },
        { wave: 'square', freq: 1319, delay: 0.05, decay: 0.25, gain: 0.18 },
      ],
      // A power-up sweep.
      bomb: [
        { wave: 'sawtooth', freq: 220, freqEnd: 1760, attack: 0.01, decay: 0.35, gain: 0.2, filter: { type: 'lowpass', freq: 5000 } },
        { wave: 'square', freq: 880, delay: 0.3, decay: 0.2, gain: 0.14 },
      ],
    },
    // The biggest sound in the game: a long crash, a plunging saw and a sub thump.
    smartBomb: [
      { wave: 'noise', decay: 2.4, gain: 0.8, filter: { type: 'lowpass', freq: 9000, freqEnd: 90, q: 1 } },
      { wave: 'sawtooth', freq: 900, freqEnd: 30, decay: 1.8, gain: 0.35 },
      { wave: 'square', freq: 70, freqEnd: 28, decay: 1.2, gain: 0.4 },
    ],
    // Rising arpeggio, C6 E6 G6 C7.
    extraLife: [
      { wave: 'square', freq: 1047, decay: 0.09, gain: 0.15 },
      { wave: 'square', freq: 1319, delay: 0.07, decay: 0.09, gain: 0.15 },
      { wave: 'square', freq: 1568, delay: 0.14, decay: 0.09, gain: 0.15 },
      { wave: 'square', freq: 2093, delay: 0.21, decay: 0.35, gain: 0.15 },
    ],
    waveStart: [
      { wave: 'square', freq: 220, decay: 0.12, gain: 0.18 },
      { wave: 'square', freq: 440, delay: 0.12, decay: 0.12, gain: 0.18 },
      { wave: 'square', freq: 880, delay: 0.24, decay: 0.3, gain: 0.16 },
    ],
    // Short fanfare, G5 C6 E6 G6, over a G4 saw.
    waveCleared: [
      { wave: 'square', freq: 784, decay: 0.1, gain: 0.15 },
      { wave: 'square', freq: 1047, delay: 0.11, decay: 0.1, gain: 0.15 },
      { wave: 'square', freq: 1319, delay: 0.22, decay: 0.1, gain: 0.15 },
      { wave: 'square', freq: 1568, delay: 0.33, decay: 0.6, gain: 0.16 },
      { wave: 'sawtooth', freq: 392, delay: 0.33, decay: 0.6, gain: 0.14 },
    ],
    // Falling, C5 G4 E4 C4, over a sinking saw.
    gameOver: [
      { wave: 'square', freq: 523, decay: 0.2, gain: 0.16 },
      { wave: 'square', freq: 392, delay: 0.22, decay: 0.2, gain: 0.16 },
      { wave: 'square', freq: 330, delay: 0.44, decay: 0.2, gain: 0.16 },
      { wave: 'square', freq: 262, delay: 0.66, decay: 1.2, gain: 0.16 },
      { wave: 'sawtooth', freq: 131, freqEnd: 40, delay: 0.66, decay: 1.4, gain: 0.18 },
    ],
  },
} as const;
