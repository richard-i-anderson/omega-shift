import { ARENA, SOUND } from '../config';
import type { GameEvent, HitSource } from '../events';
import { clamp } from '../math/vec';
import type { Ambient, Danger } from './danger';
import { crushCurve, droneVoice, noiseVoice, playPatch, pulseVoice, type LoopVoice, type Patch, type PulseVoice } from './synth';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export interface AudioEngineOptions {
  /** Defaults to `new AudioContext()`; tests pass a fake. */
  createContext?: () => AudioContext;
  /** Where the mute setting is remembered; defaults to `localStorage` if available. */
  storage?: Store | null;
}

type PulseDanger = Exclude<Danger, 'none'>;

/**
 * The danger pulse's volume and tempo (LFO rate, Hz). Both rise with danger and,
 * like the Asteroids heartbeat, as the wave thins out (`remaining` falls to 0).
 */
export function pulseSettings(danger: PulseDanger, remaining: number): { gain: number; rate: number; freq: number } {
  const spec = SOUND.pulse[danger];
  const thin = 1 - clamp(remaining, 0, 1);
  const u = SOUND.pulseUrgency;
  return { gain: spec.gain * (1 + u.gain * thin), rate: spec.lfoRate * (1 + u.tempo * thin), freq: spec.freq };
}

function defaultStorage(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // blocked site data
  }
}

/**
 * Turns `Game` events into sound. Owns the AudioContext, which is only created
 * on the first key press or click (browsers block audio until then).
 */
export class AudioEngine {
  muted: boolean;
  private ctx: AudioContext | null = null;
  /** Set if Web Audio isn't available, so we stop trying. */
  private failed = false;
  /** Mute control, after the bit-crusher. */
  private master: GainNode | null = null;
  /** Where every voice connects. */
  private bus: GainNode | null = null;
  private pulses: Partial<Record<PulseDanger, PulseVoice>> = {};
  private drone: LoopVoice | null = null;
  private thrust: LoopVoice | null = null;
  private ambient: Ambient = { danger: 'none', remaining: 1, bed: 'off' };
  private thrusting = false;
  /** When the next title-screen attract jingle is due (context time), or -1 when not on the title. */
  private nextAttract = -1;
  private readonly lastHit: Record<HitSource, number> = { ship: -1, shot: -1, enemy: -1, mine: -1 };
  private readonly createContext: () => AudioContext;
  private readonly storage: Store | null;

  constructor(opts: AudioEngineOptions = {}) {
    this.createContext = opts.createContext ?? (() => new AudioContext());
    this.storage = opts.storage === undefined ? defaultStorage() : opts.storage;
    let saved: string | null = null;
    try {
      saved = this.storage?.getItem(SOUND.storageKey) ?? null;
    } catch {
      // unreadable storage: default to sound on
    }
    this.muted = saved === '1';
  }

  /** Unlock audio on the first interaction, and go quiet while the tab is hidden. */
  attach(win: Window): void {
    const unlock = () => this.unlock();
    win.addEventListener('keydown', unlock);
    win.addEventListener('pointerdown', unlock);
    win.document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (win.document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  /** Create the context (once) and resume it. Must run inside a user gesture. */
  unlock(): void {
    if (this.failed) return;
    if (!this.ctx) {
      try {
        this.build(this.createContext());
      } catch (err) {
        console.warn('Sound unavailable:', err);
        this.failed = true;
        this.ctx = null;
        return;
      }
    }
    if (this.ctx!.state === 'suspended') void this.ctx!.resume();
  }

  private build(ctx: AudioContext): void {
    this.ctx = ctx;
    // The compressor keeps pile-ups (an explosion over the siren) from clipping.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = SOUND.compressor.threshold;
    comp.ratio.value = SOUND.compressor.ratio;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : SOUND.master;
    this.master.connect(comp);
    // Bit-crush: part of the bus goes through a stair-step WaveShaper for DAC grit.
    this.bus = ctx.createGain();
    const dry = ctx.createGain();
    dry.gain.value = 1 - SOUND.crush.mix;
    const wet = ctx.createGain();
    wet.gain.value = SOUND.crush.mix;
    const shaper = ctx.createWaveShaper();
    shaper.curve = crushCurve(SOUND.crush.bits);
    shaper.oversample = 'none';
    this.bus.connect(dry).connect(this.master);
    this.bus.connect(shaper).connect(wet).connect(this.master);

    for (const d of ['droid', 'command', 'death'] as const) this.pulses[d] = pulseVoice(ctx, this.bus, SOUND.pulse[d]);
    this.drone = droneVoice(ctx, this.bus, SOUND.drone);
    this.thrust = noiseVoice(ctx, this.bus, SOUND.thrust.gain, SOUND.thrust.cutoff);
    // Voices start silent; bring up whatever should be playing now.
    const a = this.ambient;
    const t = this.thrusting;
    this.ambient = { danger: 'none', remaining: 1, bed: 'off' };
    this.thrusting = false;
    this.updateAmbient(a, t);
  }

  toggleMute(): void {
    this.setMuted(!this.muted);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      this.storage?.setItem(SOUND.storageKey, muted ? '1' : '0');
    } catch {
      // not remembered, but still applies
    }
    const ctx = this.ctx;
    if (ctx && this.master) {
      const g = this.master.gain;
      g.cancelScheduledValues(ctx.currentTime);
      g.setTargetAtTime(muted ? 0 : SOUND.master, ctx.currentTime, 0.02);
    }
  }

  private get live(): BaseAudioContext | null {
    const ctx = this.ctx;
    return ctx && this.bus && !this.muted && ctx.state === 'running' ? ctx : null;
  }

  private patch(p: Patch, gain = 1, pitch = 1): void {
    const ctx = this.live;
    if (ctx) playPatch(ctx, this.bus!, p, { gain, pitch });
  }

  /** Play the one-shot for a game event. */
  play(e: GameEvent): void {
    if (!this.live) return;
    const fx = SOUND.sfx;
    switch (e.type) {
      case 'fieldHit':
        return this.fieldHit(e.source, e.impact);
      case 'shipFire':
        return this.patch(fx.shipFire);
      case 'shipKilled':
        return this.patch(fx.shipKilled);
      case 'hyperspace':
        return this.patch(fx.hyperspace);
      case 'enemyFire':
        return this.patch(fx.enemyFire);
      case 'mineLaid':
        return this.patch(fx.mineLaid[e.kind]);
      case 'promoted':
        return this.patch(fx.promoted[e.to]);
      case 'tankerHit':
        return this.patch(fx.tankerHit);
      case 'tankerSpawn':
        return this.patch(fx.tankerSpawn);
      case 'enemyKilled':
        // A smart bomb kills everything at once; its own crash stands in for the lot.
        return e.bombed ? undefined : this.patch(fx.enemyKilled[e.kind]);
      case 'bonusDropped':
        return this.patch(fx.bonusDropped);
      case 'bonusCollected':
        return this.patch(fx.bonusCollected[e.kind]);
      case 'smartBomb':
        return this.patch(fx.smartBomb);
      case 'shieldTick':
        return this.patch(fx.shieldTick);
      case 'shieldDown':
        return this.patch(fx.shieldDown);
      case 'extraLife':
        return this.patch(fx.extraLife);
      case 'waveStart':
        return this.patch(fx.waveStart);
      case 'waveCleared':
        return this.patch(fx.waveCleared);
      case 'gameOver':
        return this.patch(fx.gameOver);
    }
  }

  /** Louder and higher the harder the hit; at most one per `hitThrottle` per source. */
  private fieldHit(source: HitSource, impact: number): void {
    const now = this.ctx!.currentTime;
    if (this.lastHit[source] >= 0 && now - this.lastHit[source] < SOUND.hitThrottle) return;
    this.lastHit[source] = now;
    const k = clamp((impact - ARENA.flashImpact) / (SOUND.hitImpactFull - ARENA.flashImpact), 0, 1);
    const [g0, g1] = SOUND.hitGainRange;
    const [p0, p1] = SOUND.hitPitchRange;
    this.patch(SOUND.fieldHit[source], g0 + (g1 - g0) * k, p0 + (p1 - p0) * k);
  }

  /** Set the drone, the danger pulse, the attract jingle and the thrust rumble; call once per frame. */
  updateAmbient(a: Ambient, thrusting: boolean): void {
    const ctx = this.ctx;
    if (!ctx) {
      // Remember it for when the context is created.
      this.ambient = a;
      this.thrusting = thrusting;
      return;
    }
    const prev = this.ambient;
    this.ambient = a;
    if (a.bed !== prev.bed) this.drone?.setLevel(a.bed === 'play', SOUND.drone.fade);
    if (a.danger !== prev.danger || a.remaining !== prev.remaining) {
      for (const [d, v] of Object.entries(this.pulses) as [PulseDanger, PulseVoice][]) {
        const s = pulseSettings(d, a.remaining);
        v.set(d === a.danger ? s.gain : 0, s.rate, SOUND.ambientFade);
      }
    }
    if (thrusting !== this.thrusting) {
      this.thrusting = thrusting;
      this.thrust?.setLevel(thrusting, SOUND.thrust.fade);
    }
    this.attract(a.bed === 'title');
  }

  /** On the title screen, play the attract jingle shortly after audio unlocks, then every `attract.every` seconds. */
  private attract(onTitle: boolean): void {
    const now = this.ctx!.currentTime;
    if (!onTitle) {
      this.nextAttract = -1;
      return;
    }
    if (this.nextAttract < 0) this.nextAttract = now + SOUND.attract.first;
    if (now < this.nextAttract) return;
    this.nextAttract = now + SOUND.attract.every;
    this.patch(SOUND.attract.jingle); // silent while muted, but keeps its schedule
  }
}
