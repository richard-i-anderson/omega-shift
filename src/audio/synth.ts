// Small Web Audio voice helpers in the style of an 80s vector arcade board:
// raw oscillators and white noise, fast envelopes, exponential pitch sweeps.
// Everything is data-driven by the patches in `SOUND` (src/config.ts).

export type OscWave = 'square' | 'sawtooth' | 'triangle' | 'sine';
export type Wave = OscWave | 'noise';
export type FilterKind = 'lowpass' | 'highpass' | 'bandpass';

export interface FilterSpec {
  type: FilterKind;
  /** Cutoff (or centre) at the start, Hz. */
  freq: number;
  /** Cutoff at the end of the layer's decay; sweeps exponentially. Defaults to `freq`. */
  freqEnd?: number;
  q?: number;
}

/** One oscillator or noise burst with an attack/decay envelope. */
export interface Layer {
  wave: Wave;
  /** Start pitch, Hz (ignored for noise). */
  freq?: number;
  /** Pitch at the end of the decay; sweeps exponentially. Defaults to `freq`. */
  freqEnd?: number;
  /** Seconds from silence to peak. */
  attack?: number;
  /** Seconds from peak to silence. */
  decay: number;
  /** Peak gain, 0..1. */
  gain: number;
  /** Seconds after the trigger before this layer starts. */
  delay?: number;
  filter?: FilterSpec;
}

/** Layers played together as one sound. */
export type Patch = readonly Layer[];

/** A continuous voice whose pitch and volume are wobbled by one LFO. */
export interface PulseSpec {
  wave: OscWave;
  freq: number;
  lfoWave: OscWave;
  lfoRate: number;
  /** The LFO swings the pitch by ± this many Hz. */
  pitchDepth: number;
  /** The LFO swings the volume between gain × (1 - ampDepth) and gain. */
  ampDepth: number;
  gain: number;
  filter?: FilterSpec;
}

/** Exponential ramps can't reach 0; this is "silent". */
const SILENT = 1e-4;
const DEFAULT_ATTACK = 0.003;
/** Tiny lead so a sound scheduled "now" doesn't clip its attack. */
const LEAD = 0.005;

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** One second of white noise, shared by every noise voice on the context. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}

function makeNoise(ctx: BaseAudioContext): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  return src;
}

/** Set a param to `from` at `t0`, sweeping exponentially to `to` by `t1`. */
function sweep(p: AudioParam, from: number, to: number | undefined, t0: number, t1: number): void {
  p.setValueAtTime(Math.max(from, SILENT), t0);
  if (to !== undefined && to !== from) p.exponentialRampToValueAtTime(Math.max(to, SILENT), t1);
}

function makeFilter(ctx: BaseAudioContext, f: FilterSpec, pitch: number, t0: number, t1: number): BiquadFilterNode {
  const node = ctx.createBiquadFilter();
  node.type = f.type;
  node.Q.value = f.q ?? 0.7;
  sweep(node.frequency, f.freq * pitch, f.freqEnd === undefined ? undefined : f.freqEnd * pitch, t0, t1);
  return node;
}

export interface PlayOptions {
  /** Multiplies every layer's gain. */
  gain?: number;
  /** Multiplies every layer's pitch and filter cutoff. */
  pitch?: number;
}

/** Fire-and-forget: schedule every layer of `patch` into `dest`, starting now. */
export function playPatch(ctx: BaseAudioContext, dest: AudioNode, patch: Patch, opts: PlayOptions = {}): void {
  const now = ctx.currentTime + LEAD;
  for (const layer of patch) playLayer(ctx, dest, layer, now + (layer.delay ?? 0), opts.gain ?? 1, opts.pitch ?? 1);
}

function playLayer(ctx: BaseAudioContext, dest: AudioNode, l: Layer, t: number, gain: number, pitch: number): void {
  const attack = l.attack ?? DEFAULT_ATTACK;
  const end = t + attack + l.decay;

  let src: AudioScheduledSourceNode;
  if (l.wave === 'noise') {
    src = makeNoise(ctx);
  } else {
    const osc = ctx.createOscillator();
    osc.type = l.wave;
    const f = l.freq ?? 440;
    sweep(osc.frequency, f * pitch, l.freqEnd === undefined ? undefined : l.freqEnd * pitch, t, end);
    src = osc;
  }

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(Math.max(l.gain * gain, SILENT), t + attack);
  env.gain.exponentialRampToValueAtTime(SILENT, end);

  if (l.filter) src.connect(makeFilter(ctx, l.filter, pitch, t, end)).connect(env);
  else src.connect(env);
  env.connect(dest);

  // Noise starts at a random point in the shared buffer, so bursts differ.
  if (l.wave === 'noise') (src as AudioBufferSourceNode).start(t, Math.random());
  else src.start(t);
  src.stop(end + 0.02);
}

/** A voice that runs continuously; `setLevel` fades it in and out. */
export interface LoopVoice {
  setLevel(on: boolean, fadeSec: number): void;
}

function fadeTo(ctx: BaseAudioContext, p: AudioParam, value: number, fadeSec: number): void {
  const now = ctx.currentTime;
  p.cancelScheduledValues(now);
  p.setValueAtTime(p.value, now);
  // setTargetAtTime approaches exponentially; a third of the fade gets ~95% there.
  p.setTargetAtTime(value, now, Math.max(fadeSec, 0.001) / 3);
}

/** The danger pulse; `set` moves its volume and LFO rate (the tempo) together. */
export interface PulseVoice {
  set(level: number, rate: number, fadeSec: number): void;
}

/** The background pulse: an oscillator whose pitch and volume follow one LFO. */
export function pulseVoice(ctx: BaseAudioContext, dest: AudioNode, spec: PulseSpec): PulseVoice {
  const osc = ctx.createOscillator();
  osc.type = spec.wave;
  osc.frequency.value = spec.freq;
  const lfo = ctx.createOscillator();
  lfo.type = spec.lfoWave;
  lfo.frequency.value = spec.lfoRate;

  const pitchMod = ctx.createGain();
  pitchMod.gain.value = spec.pitchDepth;
  lfo.connect(pitchMod).connect(osc.frequency);

  // amp = 1 - d/2 + (d/2)·lfo, so it swings between 1 - d and 1.
  const amp = ctx.createGain();
  amp.gain.value = 1 - spec.ampDepth / 2;
  const ampMod = ctx.createGain();
  ampMod.gain.value = spec.ampDepth / 2;
  lfo.connect(ampMod).connect(amp.gain);

  const level = ctx.createGain();
  level.gain.value = 0;
  const head = spec.filter ? osc.connect(makeFilter(ctx, spec.filter, 1, 0, 0)) : osc;
  head.connect(amp).connect(level).connect(dest);
  osc.start();
  lfo.start();
  return {
    set: (lvl, rate, fadeSec) => {
      fadeTo(ctx, level.gain, lvl, fadeSec);
      fadeTo(ctx, lfo.frequency, Math.max(rate, 0.01), fadeSec);
    },
  };
}

/** The always-on cabinet hum: detuned oscillators beating against each other. */
export interface DroneSpec {
  wave: OscWave;
  /** One oscillator per entry; a small detune makes them beat at the difference, Hz. */
  freqs: readonly number[];
  /** Gain per oscillator. */
  gain: number;
  /** Resonant lowpass centre, Hz; a slow sine LFO sweeps it by ± sweepDepth. */
  cutoff: number;
  q: number;
  sweepRate: number;
  sweepDepth: number;
}

/** Detuned oscillators through a slowly sweeping resonant lowpass. */
export function droneVoice(ctx: BaseAudioContext, dest: AudioNode, spec: DroneSpec): LoopVoice {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = spec.cutoff;
  filter.Q.value = spec.q;
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = spec.sweepRate;
  const sweepAmt = ctx.createGain();
  sweepAmt.gain.value = spec.sweepDepth;
  lfo.connect(sweepAmt).connect(filter.frequency);
  lfo.start();
  for (const f of spec.freqs) {
    const osc = ctx.createOscillator();
    osc.type = spec.wave;
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = spec.gain;
    osc.connect(g).connect(filter);
    osc.start();
  }
  const level = ctx.createGain();
  level.gain.value = 0;
  filter.connect(level).connect(dest);
  return { setLevel: (on, fadeSec) => fadeTo(ctx, level.gain, on ? 1 : 0, fadeSec) };
}

/**
 * A WaveShaper curve that rounds the signal to `bits` of resolution: the
 * stair-stepped grit of an 8-bit DAC. Inputs past ±1 clip to ±1.
 */
export function crushCurve(bits: number, n = 4096): Float32Array<ArrayBuffer> {
  const steps = 2 ** (bits - 1);
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}

/** Continuous filtered noise (the thrust rumble). */
export function noiseVoice(ctx: BaseAudioContext, dest: AudioNode, gain: number, cutoff: number): LoopVoice {
  const src = makeNoise(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const level = ctx.createGain();
  level.gain.value = 0;
  src.connect(filter).connect(level).connect(dest);
  src.start();
  return { setLevel: (on, fadeSec) => fadeTo(ctx, level.gain, on ? gain : 0, fadeSec) };
}
