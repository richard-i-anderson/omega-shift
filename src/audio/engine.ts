import { ARENA, SOUND } from '../config';
import type { GameEvent, HitSource } from '../events';
import { clamp } from '../math/vec';
import type { Danger } from './danger';
import { noiseVoice, playPatch, pulseVoice, type LoopVoice, type Patch } from './synth';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export interface AudioEngineOptions {
  /** Defaults to `new AudioContext()`; tests pass a fake. */
  createContext?: () => AudioContext;
  /** Where the mute setting is remembered; defaults to `localStorage` if available. */
  storage?: Store | null;
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
  private master: GainNode | null = null;
  private pulses: Partial<Record<Danger, LoopVoice>> = {};
  private thrust: LoopVoice | null = null;
  private danger: Danger = 'none';
  private thrusting = false;
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
    // A gentle compressor keeps pile-ups (explosions over the siren) from clipping.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : SOUND.master;
    this.master.connect(comp);
    for (const d of ['droid', 'command', 'death'] as const) this.pulses[d] = pulseVoice(ctx, this.master, SOUND.pulse[d]);
    this.thrust = noiseVoice(ctx, this.master, SOUND.thrust.gain, SOUND.thrust.cutoff);
    // Voices start silent; bring up whatever should be playing now.
    const d = this.danger;
    const t = this.thrusting;
    this.danger = 'none';
    this.thrusting = false;
    this.updateAmbient(d, t);
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
    return ctx && this.master && !this.muted && ctx.state === 'running' ? ctx : null;
  }

  private patch(p: Patch, gain = 1, pitch = 1): void {
    const ctx = this.live;
    if (ctx) playPatch(ctx, this.master!, p, { gain, pitch });
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
      case 'enemyKilled':
        return this.patch(fx.enemyKilled[e.kind]);
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

  /** Set the background pulse and the thrust rumble; call once per frame. */
  updateAmbient(danger: Danger, thrusting: boolean): void {
    const ctx = this.ctx;
    if (!ctx) {
      // Remember it for when the context is created.
      this.danger = danger;
      this.thrusting = thrusting;
      return;
    }
    if (danger !== this.danger) {
      this.danger = danger;
      for (const [d, v] of Object.entries(this.pulses) as [Danger, LoopVoice][]) v.setLevel(d === danger, SOUND.ambientFade);
    }
    if (thrusting !== this.thrusting) {
      this.thrusting = thrusting;
      this.thrust?.setLevel(thrusting, SOUND.thrust.fade);
    }
  }
}
